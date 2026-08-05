// Worker separado do CRM (roda no VPS, fora do Vercel) — mantém 1 sessão de WhatsApp Web
// (via QR Code, biblioteca não-oficial Baileys) por consultor, conectada o tempo todo.
// Grava toda mensagem recebida/enviada direto no Supabase usando a service role key
// (bypassa RLS de propósito — é um serviço de confiança, não uma sessão de usuário comum).

const express = require('express')
const QRCode = require('qrcode')
const { createClient } = require('@supabase/supabase-js')
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const path = require('path')

const PORT = process.env.PORT || 3300
const TOKEN = process.env.WORKER_API_TOKEN
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(__dirname, 'sessions')

if (!TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltando env var obrigatória: WORKER_API_TOKEN, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' })

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })

const sessoesAtivas = new Map() // consultorId -> socket Baileys

async function atualizarSessao(consultorId, campos) {
  await supabase.from('whatsapp_sessao')
    .upsert({ consultor_id: consultorId, atualizado_em: new Date().toISOString(), ...campos }, { onConflict: 'consultor_id' })
}

// jid do Baileys vem tipo "5511999998888@s.whatsapp.net" — telefone puro só os dígitos
function telefoneDoJid(jid) {
  return String(jid || '').split('@')[0].split(':')[0]
}

async function acharOuCriarConversa(consultorId, telefone, nomeContato) {
  const { data: existente } = await supabase.from('whatsapp_conversa').select('*')
    .eq('consultor_id', consultorId).eq('telefone', telefone).maybeSingle()
  if (existente) return existente
  const { data: nova } = await supabase.from('whatsapp_conversa')
    .insert({ consultor_id: consultorId, telefone, nome_contato: nomeContato || null })
    .select().single()
  return nova
}

async function registrarMensagem(conversa, direcao, conteudo, tipo = 'texto') {
  await supabase.from('whatsapp_mensagem').insert({
    conversa_id: conversa.id, direcao, tipo, conteudo, status_envio: direcao === 'enviada' ? 'enviado' : 'entregue',
  })
  await supabase.from('whatsapp_conversa').update({
    ultima_mensagem: conteudo, ultima_mensagem_em: new Date().toISOString(),
    ...(direcao === 'recebida' ? { nao_lidas: (conversa.nao_lidas || 0) + 1 } : {}),
  }).eq('id', conversa.id)
}

async function iniciarSessao(consultorId) {
  if (sessoesAtivas.has(consultorId)) return sessoesAtivas.get(consultorId)

  const pastaAuth = path.join(SESSIONS_DIR, consultorId)
  const { state, saveCreds } = await useMultiFileAuthState(pastaAuth)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({ version, auth: state, logger, printQRInTerminal: false })
  sessoesAtivas.set(consultorId, sock)

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      const qrPng = await QRCode.toDataURL(qr)
      await atualizarSessao(consultorId, { status: 'aguardando_qr', qr_code: qrPng, erro_msg: null })
    }
    if (connection === 'open') {
      const numero = telefoneDoJid(sock.user?.id)
      await atualizarSessao(consultorId, { status: 'conectado', numero, qr_code: null, erro_msg: null })
    }
    if (connection === 'close') {
      const deslogado = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut
      sessoesAtivas.delete(consultorId)
      if (deslogado) {
        fs.rmSync(pastaAuth, { recursive: true, force: true })
        await atualizarSessao(consultorId, { status: 'desconectado', qr_code: null, numero: null })
      } else {
        await atualizarSessao(consultorId, { status: 'erro', erro_msg: 'Conexão caiu, tentando reconectar...' })
        iniciarSessao(consultorId).catch(err => logger.error(err, 'falha ao reconectar'))
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (msg.key.fromMe) continue
      const telefone = telefoneDoJid(msg.key.remoteJid)
      if (!telefone || msg.key.remoteJid?.endsWith('@g.us')) continue // ignora grupo, só conversa 1:1
      const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[mensagem não suportada]'
      const nomeContato = msg.pushName || null
      try {
        const conversa = await acharOuCriarConversa(consultorId, telefone, nomeContato)
        await registrarMensagem(conversa, 'recebida', texto)
      } catch (err) {
        logger.error(err, 'falha ao registrar mensagem recebida')
      }
    }
  })

  return sock
}

// ao subir o worker, retoma sessão de quem já tinha conectado antes (auth salvo em disco) —
// não precisa escanear QR de novo só porque o worker reiniciou
async function retomarSessoesExistentes() {
  const pastas = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
  for (const pasta of pastas) {
    iniciarSessao(pasta.name).catch(err => logger.error(err, `falha ao retomar sessão ${pasta.name}`))
  }
}
retomarSessoesExistentes()

const app = express()
app.use(express.json())

app.get('/saude', (req, res) => res.json({ ok: true, sessoesAtivas: sessoesAtivas.size }))

app.use((req, res, next) => {
  const auth = req.headers.authorization || ''
  if (auth !== `Bearer ${TOKEN}`) { res.status(401).json({ error: 'Token inválido' }); return }
  next()
})

app.post('/conectar', async (req, res) => {
  const { consultorId } = req.body || {}
  if (!consultorId) { res.status(400).json({ error: 'consultorId obrigatório' }); return }
  try {
    await iniciarSessao(consultorId)
    res.status(202).json({ status: 'iniciando' })
  } catch (err) {
    logger.error(err, 'falha ao conectar')
    res.status(500).json({ error: err.message })
  }
})

app.post('/desconectar', async (req, res) => {
  const { consultorId } = req.body || {}
  const sock = sessoesAtivas.get(consultorId)
  if (sock) { await sock.logout().catch(() => {}); sessoesAtivas.delete(consultorId) }
  res.json({ status: 'ok' })
})

app.post('/enviar', async (req, res) => {
  const { consultorId, telefone, conteudo } = req.body || {}
  if (!consultorId || !telefone || !conteudo) { res.status(400).json({ error: 'consultorId, telefone e conteudo obrigatórios' }); return }
  const sock = sessoesAtivas.get(consultorId)
  if (!sock) { res.status(409).json({ error: 'Sessão desse consultor não está conectada' }); return }
  try {
    const jid = `${telefone.replace(/\D/g, '')}@s.whatsapp.net`
    await sock.sendMessage(jid, { text: conteudo })
    const conversa = await acharOuCriarConversa(consultorId, telefone.replace(/\D/g, ''))
    await registrarMensagem(conversa, 'enviada', conteudo)
    res.json({ status: 'enviado' })
  } catch (err) {
    logger.error(err, 'falha ao enviar mensagem')
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => console.log(`Worker WhatsApp rodando na porta ${PORT}`))

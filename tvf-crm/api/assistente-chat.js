const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_BASE = `Você é "Joaozinho", assistente virtual comercial da TVF Telecom, parceiro
Vivo Empresas. Tira dúvidas de consultores sobre preços, planos, condições comerciais e book
de ofertas, usando SOMENTE o conteúdo de referência abaixo (que o gestor mantém atualizado).

Regras:
- Se a resposta não estiver no conteúdo de referência, diga claramente que não tem essa
  informação ainda e sugira perguntar ao gestor — nunca invente preço, prazo ou condição.
- Quando o consultor perguntar preço/condição de algo que está no conteúdo, responda direto
  e objetivo com o valor exato.
- Quando fizer sentido, ofereça um pitch de venda curto (1-3 frases) pro consultor usar com
  o cliente.
- Seja direto, tom de colega experiente, sem enrolação.
- Use emojis com moderação pra deixar a resposta mais leve e fácil de escanear (ex: 💰 preço,
  📶 plano/internet, ✅ passo concluído, 🎯 dica/pitch) — sem exagerar, sem virar poluição visual.
- NÃO use markdown de negrito/itálico (nada de **texto** ou *texto*) — o chat mostra o texto
  puro, então escreva listas numeradas simples (1. 2. 3.) e emojis pra dar destaque, não símbolos.
- Só um RECORTE do conteúdo de referência (os temas mais relevantes pra pergunta) é enviado
  aqui, não a base toda — se não achar a resposta no que veio, diga que não tem certeza e
  sugira perguntar ao gestor, em vez de negar que a informação existe.`

const PARADAS = new Set(['para', 'como', 'que', 'com', 'uma', 'dos', 'das', 'por', 'tem', 'sao', 'seu', 'sua', 'qual', 'quais', 'quero', 'sobre', 'esse', 'essa', 'isso', 'preciso', 'gostaria', 'pode', 'poderia', 'funciona', 'ele', 'ela'])
const LIMITE_CHARS_TOTAL = 40000 // ~10k tokens, folga confortável do limite de 30k TPM da conta
const LIMITE_CHARS_POR_TEMA = 9000 // um tema sozinho (ex: book de ofertas grande) não pode dominar o orçamento
const SEMPRE_INCLUI_ATE = 1500 // tema curto (fato pontual, tipo uma regra específica) sempre entra, mesmo sem bater palavra — é barato e pode ser exatamente o que falta
const MENSAGENS_PARA_CONTEXTO = 6 // olha as últimas perguntas também, não só a de agora — segue o fio da conversa

function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
// versão sem nenhum espaço/pontuação — pega "400 mb" == "400mb", "trade-off" == "tradeoff" etc,
// que o match por palavra separada perdia por causa de formatação diferente
function comprimir(s) {
  return normalizar(s).replace(/[^a-z0-9]/g, '')
}
function palavrasRelevantes(texto) {
  return normalizar(texto).split(/[^a-z0-9]+/).filter(p => p.length >= 3 && !PARADAS.has(p))
}

// escolhe os temas relevantes pro que tá sendo discutido (pega as últimas mensagens da
// conversa, não só a pergunta mais recente — uma pergunta de acompanhamento tipo "e pra CPF?"
// não repete a palavra-chave do assunto). Tema curto sempre entra (barato, pode ser a resposta
// certa); tema grande só entra se bater palavra, com teto de tamanho pra não estourar sozinho.
function selecionarConteudoRelevante(conteudos, mensagensRecentes) {
  const textoContexto = mensagensRecentes.join(' ')
  const termos = palavrasRelevantes(textoContexto)

  const pontuados = conteudos.map(c => {
    const tituloNorm = normalizar(c.titulo)
    const conteudoNorm = normalizar(c.conteudo)
    const conteudoComprimido = comprimir(c.conteudo)
    let score = 0
    for (const t of termos) {
      if (tituloNorm.includes(t)) score += 3
      if (conteudoNorm.includes(t)) score += 1
      if (comprimir(t).length >= 3 && conteudoComprimido.includes(comprimir(t))) score += 1
    }
    // tema curto vira "sempre relevante" (pontuação simbólica) — barato, não trunca a base toda
    if (c.conteudo.length <= SEMPRE_INCLUI_ATE) score += 0.5
    return { ...c, score }
  }).sort((a, b) => b.score - a.score)

  const selecionados = []
  let charsUsados = 0
  for (const item of pontuados) {
    if (item.score <= 0 && selecionados.length > 0 && charsUsados > LIMITE_CHARS_TOTAL / 2) break
    const corpo = item.conteudo.length > LIMITE_CHARS_POR_TEMA
      ? item.conteudo.slice(0, LIMITE_CHARS_POR_TEMA) + '\n[...conteúdo cortado por tamanho...]'
      : item.conteudo
    if (charsUsados + corpo.length > LIMITE_CHARS_TOTAL && selecionados.length > 0) continue
    selecionados.push({ titulo: item.titulo, conteudo: corpo })
    charsUsados += corpo.length
    if (charsUsados >= LIMITE_CHARS_TOTAL) break
  }
  return selecionados
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) {
    res.status(401).json({ error: 'Não autenticado' })
    return
  }

  const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    res.status(401).json({ error: 'Sessão inválida' })
    return
  }

  // sem repassar o token nas próximas queries, o RLS enxerga role "anon" (não "authenticated")
  // e a policy de leitura do conteúdo bloqueia tudo silenciosamente — sem esse client, o
  // Joaozinho nunca via nada do que o gestor cadastrava
  const supabaseComToken = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY não configurada no servidor.' })
    return
  }

  const { mensagens } = req.body || {}
  if (!Array.isArray(mensagens) || mensagens.length === 0) {
    res.status(400).json({ error: 'mensagens obrigatório' })
    return
  }

  try {
    const { data: conteudos } = await supabaseComToken.from('assistente_conteudo')
      .select('titulo, conteudo').order('titulo', { ascending: true })

    const mensagensRecentes = mensagens.slice(-MENSAGENS_PARA_CONTEXTO).map(m => m.conteudo || '')
    const relevantes = selecionarConteudoRelevante(conteudos || [], mensagensRecentes)
    const blocoConteudo = relevantes.length > 0
      ? relevantes.map(c => `### ${c.titulo}\n${c.conteudo}`).join('\n\n')
      : '(nenhum conteúdo cadastrado ainda pelo gestor, ou nada bateu com essa pergunta)'

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `${SYSTEM_BASE}\n\n--- CONTEÚDO DE REFERÊNCIA ---\n\n${blocoConteudo}` },
        ...mensagens.slice(-20).map(m => ({ role: m.role, content: m.conteudo })),
      ],
    })
    const resposta = completion.choices[0]?.message?.content || ''
    res.status(200).json({ resposta })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao chamar a IA' })
  }
}

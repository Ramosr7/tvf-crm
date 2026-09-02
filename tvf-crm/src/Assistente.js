import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabaseClient'

const FRASES_BALAO = [
  'Posso te ajudar?', 'Posso te ajudar a vender mais?', 'Dúvida de preço ou plano? Pergunta pra mim!',
]
const RESUMO_KEY_PREFIX = 'tvf_joaozinho_resumo_'

function iso(d) { return d.toISOString().slice(0, 10) }

// segurança extra: o prompt já pede "sem markdown" várias vezes e o modelo às vezes ignora
// mesmo assim (### título, **negrito**) — limpa antes de mostrar em vez de depender só do
// prompt, que já falhou nisso mais de uma vez
function limparMarkdown(texto) {
  return String(texto ?? '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/^-{3,}$/gm, '')
}

// print de celular/desktop em resolução original passa fácil de 3-4MB — 2 ou 3 juntos em
// base64 estouram o limite de payload da function e a requisição morre com "Failed to fetch"
// antes de chegar no servidor. Mas comprimir demais borra números pequenos de tabela densa
// (print do Estruturante tem 8 colunas) e a IA passa a dizer que não conseguiu ler a imagem —
// por isso o lado máximo e a qualidade ficam altos, só o suficiente pra cortar o payload.
function comprimirImagem(file, ladoMax = 2200, qualidade = 0.92) {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      let { width, height } = img
      if (width > ladoMax || height > ladoMax) {
        const escala = ladoMax / Math.max(width, height)
        width = Math.round(width * escala)
        height = Math.round(height * escala)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      // PNG com transparência (print com fundo alpha) vira PRETO por cima dos dados quando
      // convertido pra JPEG sem isso — pinta branco antes de desenhar a imagem em cima
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      resolve({ nome: file.name, dataUrl: canvas.toDataURL('image/jpeg', qualidade) })
    }
    img.onerror = reject
    img.src = url
  })
}

// resumo do dia é calculado direto dos dados reais (rotina, kanban quente, lembrete vencido) —
// não é a IA "chutando", é fato — evita o mesmo risco de invenção que já corrigimos no chat
async function montarResumoDia(user) {
  const hoje = iso(new Date())
  const [{ data: rotina }, { data: kanbanQuente }, { data: lembretes }] = await Promise.all([
    supabase.from('rotina_diaria').select('clientes_recebidos, retornos, ag_aceite').eq('consultor_id', user.id).eq('data', hoje).maybeSingle(),
    supabase.from('carteira_cliente').select('id').eq('consultor_id', user.id).eq('no_kanban', true).eq('temperatura', 'Quente').is('excluido_em', null),
    supabase.from('carteira_lembrete').select('id').eq('autor_id', user.id).eq('concluido', false).lte('data_hora', new Date().toISOString()),
  ])
  const partes = []
  if (!rotina) partes.push('você ainda não preencheu a rotina de hoje')
  else partes.push(`hoje você já registrou ${rotina.clientes_recebidos || 0} atendimento(s) e ${rotina.retornos || 0} retorno(s)`)
  if ((kanbanQuente || []).length > 0) partes.push(`${kanbanQuente.length} cliente(s) no seu funil quente esperando retorno`)
  if ((lembretes || []).length > 0) partes.push(`${lembretes.length} lembrete(s) de retorno vencido(s) ou de hoje`)
  if (partes.length === 0) return null
  return `Bom te ver! Resumo rápido: ${partes.join('; ')}. 💪`
}

export default function Assistente({ user }) {
  const [aberto, setAberto] = useState(false)
  const [balaoVisivel, setBalaoVisivel] = useState(true)
  const [fraseBalao] = useState(() => FRASES_BALAO[Math.floor(Math.random() * FRASES_BALAO.length)])
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mostrarSimulacao, setMostrarSimulacao] = useState(false)
  const [arquivosSimulacao, setArquivosSimulacao] = useState([])
  const [notaSimulacao, setNotaSimulacao] = useState('')
  const [consumoForm, setConsumoForm] = useState({ pacote: '', mes1: '', mes2: '', mes3: '' })
  const fimRef = useRef(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('assistente_mensagem').select('*')
      .eq('consultor_id', user.id).order('criado_em', { ascending: true })
    setMensagens(data || [])
    setLoading(false)
  }, [user.id])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (aberto) setTimeout(() => fimRef.current?.scrollIntoView(), 50) }, [mensagens, aberto])

  async function abrirChat() {
    setAberto(a => !a)
    setBalaoVisivel(false)
    const hoje = iso(new Date())
    const chave = `${RESUMO_KEY_PREFIX}${user.id}_${hoje}`
    if (!localStorage.getItem(chave)) {
      localStorage.setItem(chave, '1')
      const resumo = await montarResumoDia(user)
      if (resumo) setMensagens(prev => [...prev, { role: 'assistant', conteudo: resumo, id: `resumo-${Date.now()}` }])
    }
  }

  async function enviarTexto(pergunta, imagens) {
    if ((!pergunta && !(imagens && imagens.length)) || enviando) return
    setEnviando(true)

    const msgUsuario = { consultor_id: user.id, role: 'user', conteudo: pergunta }
    const historico = [...mensagens, msgUsuario]
    setMensagens(historico)
    const { data: msgSalva } = await supabase.from('assistente_mensagem').insert(msgUsuario).select().single()

    // simulação com print novo começa do zero — sem isso, o modelo via a resposta de uma
    // simulação anterior (outro cliente, ou tentativa anterior) ainda no histórico e repetia
    // os mesmos números por "consistência" com o que ele mesmo já tinha dito antes, em vez de
    // reanalisar a imagem nova com as regras atuais
    const temImagem = imagens && imagens.length > 0
    const mensagensParaApi = temImagem ? [msgUsuario] : historico

    try {
      const { data: sessao } = await supabase.auth.getSession()
      const resp = await fetch('/api/assistente-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao?.session?.access_token}` },
        body: JSON.stringify({
          mensagens: mensagensParaApi.map(m => ({ role: m.role, conteudo: m.conteudo })),
          ...(imagens && imagens.length ? { imagens } : {}),
        }),
      })
      const dados = await resp.json()
      if (!resp.ok) throw new Error(dados.error || 'Erro ao falar com o Joaozinho')
      const msgAssistente = { consultor_id: user.id, role: 'assistant', conteudo: dados.resposta }
      setMensagens(prev => [...prev, msgAssistente])
      await supabase.from('assistente_mensagem').insert(msgAssistente)
      // marca a pergunta como "sem resposta" pro gestor ver depois o que falta cadastrar
      if (dados.semResposta && msgSalva?.id) {
        await supabase.from('assistente_mensagem').update({ sem_resposta: true }).eq('id', msgSalva.id)
      }
    } catch (err) {
      setMensagens(prev => [...prev, { consultor_id: user.id, role: 'assistant', conteudo: `Deu erro: ${err.message}` }])
    } finally {
      setEnviando(false)
    }
  }

  function enviar(e) {
    e.preventDefault()
    const pergunta = texto.trim()
    setTexto('')
    enviarTexto(pergunta)
  }

  async function enviarSimulacao(e) {
    e.preventDefault()
    if (arquivosSimulacao.length === 0) return
    const imagens = await Promise.all(arquivosSimulacao.map(f => comprimirImagem(f)))
    const { pacote, mes1, mes2, mes3 } = consumoForm
    const partes = [`Print${arquivosSimulacao.length > 1 ? 's' : ''} do Estruturante em anexo (${arquivosSimulacao.length} imagem${arquivosSimulacao.length > 1 ? 'ns' : ''}) — monta a simulação de renovação móvel seguindo as regras.`]
    if (pacote || mes1 || mes2 || mes3) {
      partes.push(`Dados de consumo (InfoB2B): pacote geral contratado = ${pacote || 'não informado'}; `
        + `consumo mês 1 = ${mes1 || 'não informado'}; consumo mês 2 = ${mes2 || 'não informado'}; consumo mês 3 = ${mes3 || 'não informado'}.`)
    }
    const nota = notaSimulacao.trim()
    if (nota) partes.push(`Observação: ${nota}`)
    const pergunta = partes.join(' ')
    setMostrarSimulacao(false)
    setArquivosSimulacao([])
    setNotaSimulacao('')
    setConsumoForm({ pacote: '', mes1: '', mes2: '', mes3: '' })
    enviarTexto(pergunta, imagens)
  }

  return (
    <>
      {aberto && (
        <div className="assistente-painel">
          <div className="assistente-header">
            <img src="/assets/joaozinho-avatar.png" alt="Joaozinho" className="assistente-avatar-mini" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Joaozinho</div>
              <div style={{ fontSize: 11, color: 'rgba(245,241,250,0.55)' }}>Assistente comercial · Telecom &amp; TI</div>
            </div>
            <button className="lm-close" style={{ marginLeft: 'auto' }} onClick={() => setAberto(false)}>✕</button>
          </div>
          <div className="assistente-corpo">
            {loading && <div className="empty">Carregando...</div>}
            {!loading && mensagens.length === 0 && (
              <div className="assistente-msg assistente-msg-bot">
                Olá! Eu sou o Joaozinho. Pergunta preço, plano, condição comercial ou pitch de venda que eu te ajudo.
              </div>
            )}
            {mensagens.map((m, i) => (
              <div key={m.id || i} className={`assistente-msg ${m.role === 'user' ? 'assistente-msg-user' : 'assistente-msg-bot'}`}>
                {m.role === 'assistant' ? limparMarkdown(m.conteudo) : m.conteudo}
              </div>
            ))}
            {enviando && <div className="assistente-msg assistente-msg-bot">Digitando...</div>}
            <div ref={fimRef} />
          </div>

          {mostrarSimulacao ? (
            <form className="assistente-proposta" onSubmit={enviarSimulacao}>
              <div className="assistente-proposta-cabecalho">
                <span>Simular renovação móvel</span>
                <button type="button" className="lm-close" onClick={() => setMostrarSimulacao(false)}>✕</button>
              </div>

              <div className="assistente-proposta-secao">
                <div className="assistente-proposta-secao-titulo">Print do Estruturante</div>
                <p style={{ fontSize: 11, color: 'rgba(245,241,250,0.55)', margin: '0 0 8px' }}>
                  Anexa o print da recomendação por linha. Se tiver, manda também o do InfoB2B (consumo/fatura) — até 4 imagens.
                </p>
                <input type="file" accept="image/*" multiple
                  onChange={e => setArquivosSimulacao(Array.from(e.target.files || []).slice(0, 4))} />
                {arquivosSimulacao.length > 0 && (
                  <div style={{ fontSize: 11, color: '#660099', marginTop: 6 }}>
                    {arquivosSimulacao.map(f => f.name).join(', ')}
                  </div>
                )}
              </div>

              <div className="assistente-proposta-secao">
                <div className="assistente-proposta-secao-titulo">Consumo (InfoB2B)</div>
                <label className="assistente-proposta-campo">
                  Pacote geral de dados
                  <input className="lm-input" placeholder="Ex: 500GB"
                    value={consumoForm.pacote} onChange={e => setConsumoForm(f => ({ ...f, pacote: e.target.value }))} />
                </label>
                <label className="assistente-proposta-campo">
                  Consumo mês 1
                  <input className="lm-input" placeholder="Ex: 210GB"
                    value={consumoForm.mes1} onChange={e => setConsumoForm(f => ({ ...f, mes1: e.target.value }))} />
                </label>
                <label className="assistente-proposta-campo">
                  Consumo mês 2
                  <input className="lm-input" placeholder="Ex: 195GB"
                    value={consumoForm.mes2} onChange={e => setConsumoForm(f => ({ ...f, mes2: e.target.value }))} />
                </label>
                <label className="assistente-proposta-campo">
                  Consumo mês 3
                  <input className="lm-input" placeholder="Ex: 230GB"
                    value={consumoForm.mes3} onChange={e => setConsumoForm(f => ({ ...f, mes3: e.target.value }))} />
                </label>
              </div>

              <div className="assistente-proposta-secao">
                <div className="assistente-proposta-secao-titulo">Observação (opcional)</div>
                <label className="assistente-proposta-campo">
                  Alguma informação a mais?
                  <input className="lm-input" placeholder="Ex: cliente também tem fibra pra renovar"
                    value={notaSimulacao} onChange={e => setNotaSimulacao(e.target.value)} />
                </label>
              </div>

              <button className="btn-save-obs" style={{ float: 'none', margin: 0 }} type="submit" disabled={enviando || arquivosSimulacao.length === 0}>
                {enviando ? 'Analisando...' : 'Gerar simulação'}
              </button>
            </form>
          ) : (
            <>
              <button type="button" className="btn-filter-light" style={{ margin: '0 10px 6px' }} onClick={() => setMostrarSimulacao(true)}>Simular renovação móvel</button>
              <form className="assistente-form" onSubmit={enviar}>
                <input className="lm-input" style={{ flex: 1 }} placeholder="Pergunta pro Joaozinho..."
                  value={texto} onChange={e => setTexto(e.target.value)} disabled={enviando} />
                <button className="btn-save-obs" style={{ float: 'none', margin: 0 }} type="submit" disabled={enviando || !texto.trim()}>Enviar</button>
              </form>
            </>
          )}
        </div>
      )}

      {!aberto && balaoVisivel && (
        <div className="assistente-balao">
          <button className="assistente-balao-fechar" onClick={() => setBalaoVisivel(false)} title="Fechar">✕</button>
          {fraseBalao}
        </div>
      )}

      <button className="assistente-fab" onClick={abrirChat} title="Falar com o Joaozinho">
        <img src="/assets/joaozinho-avatar.png" alt="Joaozinho" />
      </button>
    </>
  )
}

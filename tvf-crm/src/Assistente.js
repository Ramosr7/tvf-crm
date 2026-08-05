import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabaseClient'

const FRASES_BALAO = [
  'Posso te ajudar?', 'Posso te ajudar a vender mais?', 'Dúvida de preço ou plano? Pergunta pra mim!',
]
const RESUMO_KEY_PREFIX = 'tvf_joaozinho_resumo_'

function iso(d) { return d.toISOString().slice(0, 10) }

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
  const [mostrarProposta, setMostrarProposta] = useState(false)
  const [propostaForm, setPropostaForm] = useState({ valorAtual: '', temAtual: '', valorNovo: '', temNovo: '' })
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

  async function enviarTexto(pergunta) {
    if (!pergunta || enviando) return
    setEnviando(true)

    const msgUsuario = { consultor_id: user.id, role: 'user', conteudo: pergunta }
    const historico = [...mensagens, msgUsuario]
    setMensagens(historico)
    const { data: msgSalva } = await supabase.from('assistente_mensagem').insert(msgUsuario).select().single()

    try {
      const { data: sessao } = await supabase.auth.getSession()
      const resp = await fetch('/api/assistente-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao?.session?.access_token}` },
        body: JSON.stringify({ mensagens: historico.map(m => ({ role: m.role, conteudo: m.conteudo })) }),
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

  function enviarProposta(e) {
    e.preventDefault()
    const { valorAtual, temAtual, valorNovo, temNovo } = propostaForm
    if (!valorNovo.trim() || !temNovo.trim()) return
    const pergunta = `Monta uma proposta comercial pronta, formatada, que eu possa copiar e mandar pro cliente. `
      + `Hoje o cliente paga ${valorAtual || 'não informado'} e tem: ${temAtual || 'não informado'}. `
      + `Proposta nova: ${valorNovo}/mês por: ${temNovo}. `
      + `Usa os preços do conteúdo de referência pra confirmar os valores dos produtos citados, se estiverem lá. `
      + `Destaca o ganho/economia se fizer sentido.`
    setMostrarProposta(false)
    setPropostaForm({ valorAtual: '', temAtual: '', valorNovo: '', temNovo: '' })
    enviarTexto(pergunta)
  }

  return (
    <>
      {aberto && (
        <div className="assistente-painel">
          <div className="assistente-header">
            <img src="/assets/joaozinho-avatar.png" alt="Joaozinho" className="assistente-avatar-mini" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Joaozinho</div>
              <div style={{ fontSize: 11, color: '#888' }}>Assistente comercial · Telecom &amp; TI</div>
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
                {m.conteudo}
              </div>
            ))}
            {enviando && <div className="assistente-msg assistente-msg-bot">Digitando...</div>}
            <div ref={fimRef} />
          </div>

          {mostrarProposta ? (
            <form className="assistente-form" style={{ flexDirection: 'column', gap: 6, alignItems: 'stretch' }} onSubmit={enviarProposta}>
              <input className="lm-input" placeholder="Hoje o cliente paga (ex: R$ 250/mês)"
                value={propostaForm.valorAtual} onChange={e => setPropostaForm(p => ({ ...p, valorAtual: e.target.value }))} />
              <input className="lm-input" placeholder="E tem hoje (ex: BL 300MB, 2 linhas móvel)"
                value={propostaForm.temAtual} onChange={e => setPropostaForm(p => ({ ...p, temAtual: e.target.value }))} />
              <input className="lm-input" placeholder="Proposta nova: vai pagar (ex: R$ 320/mês)"
                value={propostaForm.valorNovo} onChange={e => setPropostaForm(p => ({ ...p, valorNovo: e.target.value }))} />
              <input className="lm-input" placeholder="E vai ter (ex: BL 500MB + Wi-Fi Pro)"
                value={propostaForm.temNovo} onChange={e => setPropostaForm(p => ({ ...p, temNovo: e.target.value }))} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-save-obs" style={{ float: 'none', margin: 0, flex: 1 }} type="submit" disabled={enviando}>Gerar Proposta</button>
                <button className="btn-filter-light" type="button" onClick={() => setMostrarProposta(false)}>Cancelar</button>
              </div>
            </form>
          ) : (
            <>
              <button type="button" className="btn-filter-light" style={{ margin: '0 10px 6px' }} onClick={() => setMostrarProposta(true)}>📝 Montar Proposta</button>
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

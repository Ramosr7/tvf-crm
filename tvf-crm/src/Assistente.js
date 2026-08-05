import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabaseClient'

const FRASES_BALAO = [
  'Posso te ajudar?', 'Posso te ajudar a vender mais?', 'Dúvida de preço ou plano? Pergunta pra mim!',
]

export default function Assistente({ user }) {
  const [aberto, setAberto] = useState(false)
  const [balaoVisivel, setBalaoVisivel] = useState(true)
  const [fraseBalao] = useState(() => FRASES_BALAO[Math.floor(Math.random() * FRASES_BALAO.length)])
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [loading, setLoading] = useState(true)
  const fimRef = useRef(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('assistente_mensagem').select('*')
      .eq('consultor_id', user.id).order('criado_em', { ascending: true })
    setMensagens(data || [])
    setLoading(false)
  }, [user.id])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (aberto) setTimeout(() => fimRef.current?.scrollIntoView(), 50) }, [mensagens, aberto])

  async function enviar(e) {
    e.preventDefault()
    const pergunta = texto.trim()
    if (!pergunta || enviando) return
    setTexto('')
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
          <form className="assistente-form" onSubmit={enviar}>
            <input className="lm-input" style={{ flex: 1 }} placeholder="Pergunta pro Joaozinho..."
              value={texto} onChange={e => setTexto(e.target.value)} disabled={enviando} />
            <button className="btn-save-obs" style={{ float: 'none', margin: 0 }} type="submit" disabled={enviando || !texto.trim()}>Enviar</button>
          </form>
        </div>
      )}

      {!aberto && balaoVisivel && (
        <div className="assistente-balao">
          <button className="assistente-balao-fechar" onClick={() => setBalaoVisivel(false)} title="Fechar">✕</button>
          {fraseBalao}
        </div>
      )}

      <button className="assistente-fab" onClick={() => { setAberto(a => !a); setBalaoVisivel(false) }} title="Falar com o Joaozinho">
        <img src="/assets/joaozinho-avatar.png" alt="Joaozinho" />
      </button>
    </>
  )
}

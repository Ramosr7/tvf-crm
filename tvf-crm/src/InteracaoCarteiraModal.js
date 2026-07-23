import React, { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import LembreteModal from './LembreteModal'

function formatDataHora(str) {
  const d = new Date(str)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function InteracaoCarteiraModal({ cliente, user, onClose, onSaved }) {
  const [itens, setItens] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mostrarLembrete, setMostrarLembrete] = useState(false)
  const fimRef = useRef(null)

  function nomeAutor(id) {
    if (id === user.id) return 'Você'
    return staff.find(s => s.id === id)?.nome || 'Equipe'
  }

  async function carregar() {
    setLoading(true)
    const [{ data }, { data: staffData }] = await Promise.all([
      supabase.from('carteira_interacao').select('*')
        .eq('carteira_cliente_id', cliente.id).order('criado_em', { ascending: true }),
      supabase.from('consultores_staff').select('id, nome'),
    ])
    setItens(data || [])
    setStaff(staffData || [])
    setLoading(false)
    setTimeout(() => fimRef.current?.scrollIntoView(), 50)
  }

  useEffect(() => { carregar() }, [cliente.id])

  async function excluir(id) {
    if (!window.confirm('Excluir essa interação? Não pode ser desfeito.')) return
    const { error } = await supabase.from('carteira_interacao').delete().eq('id', id)
    if (error) { alert('Erro ao excluir: ' + error.message); return }
    await carregar()
    onSaved()
  }

  async function enviar(e) {
    e.preventDefault()
    if (!texto.trim()) return
    setEnviando(true)
    const { error } = await supabase.from('carteira_interacao').insert({
      carteira_cliente_id: cliente.id,
      autor_id: user.id,
      descricao: texto.trim(),
    })
    setEnviando(false)
    if (!error) {
      setTexto('')
      await carregar()
      onSaved()
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lead-modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <div className="lm-header-left">
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Interações</div>
              <div className="lm-phone">{cliente.razao_social || cliente.cnpj}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn-filter" onClick={() => setMostrarLembrete(true)}>🔔 Agendar Retorno</button>
            <button className="lm-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="lm-body">
          {loading && <div className="empty">Carregando...</div>}
          {!loading && itens.length === 0 && <div className="empty">Nenhuma interação registrada ainda</div>}
          <div className="lm-chat">
            {itens.map(it => (
              <div key={it.id} className={`lm-chat-msg ${it.autor_id === user.id ? 'human' : 'ai'}`}>
                <div className="lm-chat-label" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{nomeAutor(it.autor_id)} · {formatDataHora(it.criado_em)}</span>
                  {user.perfil === 'Gestor' && (
                    <span style={{ cursor: 'pointer' }} title="Excluir" onClick={() => excluir(it.id)}>🗑</span>
                  )}
                </div>
                <div className="lm-chat-text">{it.descricao}</div>
              </div>
            ))}
            <div ref={fimRef} />
          </div>

          <form onSubmit={enviar} style={{ display: 'flex', gap: 8 }}>
            <textarea className="obs-area" style={{ flex: 1, marginTop: 0 }} rows={2}
              placeholder="Registrar interação com o cliente..." value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(e) } }} />
            <button className="btn-save-obs" style={{ float: 'none' }} type="submit" disabled={enviando || !texto.trim()}>
              {enviando ? '...' : 'Enviar'}
            </button>
          </form>
        </div>
      </div>
      {mostrarLembrete && (
        <LembreteModal cliente={cliente} user={user}
          onClose={() => setMostrarLembrete(false)}
          onSalvo={() => setMostrarLembrete(false)} />
      )}
    </div>
  )
}

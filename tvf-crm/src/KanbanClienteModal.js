import React, { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import VendaChecklistModal from './VendaChecklistModal'

const STATUS_GATILHO_CHECKLIST = ['Venda Realizada', 'Pedido Finalizado']

const STATUS_OPCOES = [
  'Aguardando Aceite', 'Cliente Cancelou', 'Cliente Já Renovado', 'CNPJ Baixado',
  'Débito Interno', 'Já Possui Consultor', 'Não Contatar', 'Não Possui Recomendação',
  'Pedido Finalizado', 'Proposta Enviada', 'Retornar', 'Sem Contato Efetivo',
  'Sem Interesse', 'Sem Viabilidade', 'Venda Realizada',
]

function fmtMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function formatDataHora(str) {
  return new Date(str).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function diasDesde(str) {
  if (!str) return null
  return Math.floor((new Date() - new Date(str)) / 86400000)
}

export default function KanbanClienteModal({ cliente, user, nomeConsultor, onClose, onSaved }) {
  const [interacoes, setInteracoes] = useState([])
  const [vendaItens, setVendaItens] = useState([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fimRef = useRef(null)

  async function carregar() {
    setLoading(true)
    const [{ data: intData }, { data: vendaData }] = await Promise.all([
      supabase.from('carteira_interacao').select('*').eq('carteira_cliente_id', cliente.id).order('criado_em', { ascending: true }),
      supabase.from('carteira_venda_item').select('*').eq('carteira_cliente_id', cliente.id),
    ])
    setInteracoes(intData || [])
    setVendaItens(vendaData || [])
    setLoading(false)
    setTimeout(() => fimRef.current?.scrollIntoView(), 50)
  }

  useEffect(() => { carregar() }, [cliente.id])

  async function enviar(e) {
    e.preventDefault()
    if (!texto.trim()) return
    setEnviando(true)
    const { error } = await supabase.from('carteira_interacao').insert({
      carteira_cliente_id: cliente.id, autor_id: user.id, descricao: texto.trim(),
    })
    setEnviando(false)
    if (!error) { setTexto(''); await carregar(); onSaved() }
  }

  const [status, setStatus] = useState(cliente.status || 'Aguardando Aceite')
  const [salvandoStatus, setSalvandoStatus] = useState(false)
  const [mostrarChecklist, setMostrarChecklist] = useState(false)

  async function mudarStatus(novoStatus) {
    setStatus(novoStatus)
    setSalvandoStatus(true)
    await supabase.from('carteira_cliente').update({ status: novoStatus }).eq('id', cliente.id)
    setSalvandoStatus(false)
    onSaved()
    if (STATUS_GATILHO_CHECKLIST.includes(novoStatus)) setMostrarChecklist(true)
  }

  const dias = diasDesde(cliente.temperatura_atualizada_em)
  const totalVendido = vendaItens.reduce((s, i) => s + Number(i.valor || 0), 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lead-modal" style={{ width: 620 }} onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <div className="lm-header-left">
            <div className="lm-avatar">{(cliente.razao_social || cliente.cnpj || '?')[0].toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{cliente.razao_social || '—'}</div>
              <div className="lm-phone">{cliente.cnpj}</div>
            </div>
          </div>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>

        <div className="lm-body">
          <div className="lm-section-title">Resumo</div>
          <div className="lm-grid-3">
            <div className="lm-field-edit">
              <label>Status{salvandoStatus && ' (salvando...)'}</label>
              <select className="filter-select" style={{ width: '100%' }} value={status} onChange={e => mudarStatus(e.target.value)}>
                {STATUS_OPCOES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="lm-field"><label>Temperatura</label><span>{cliente.temperatura}{dias !== null && ` (${dias}d)`}</span></div>
            {nomeConsultor && <div className="lm-field"><label>Consultor</label><span>{nomeConsultor}</span></div>}
            <div className="lm-field"><label>Pot. Migração</label><span>{cliente.potencial_migracao || 0}</span></div>
            <div className="lm-field"><label>Pot. BL</label><span>{cliente.potencial_bl || 0}</span></div>
            <div className="lm-field"><label>Pot. TI</label><span>{cliente.potencial_ti || 0}</span></div>
            <div className="lm-field"><label>Pot. Voz</label><span>{cliente.potencial_voz || 0}</span></div>
            <div className="lm-field"><label>Crédito Pré-aprovado</label><span>{fmtMoeda(cliente.credito_pre_aprovado)}</span></div>
            <div className="lm-field"><label>Vendido</label><span>{vendaItens.length} item(ns) · {fmtMoeda(totalVendido)}</span></div>
          </div>

          <div className="lm-section-title" style={{ marginTop: 16 }}>Contato</div>
          <div className="lm-resumo">
            {cliente.contato ? cliente.contato.split(' · ').map((l, i) => <div key={i}>{l}</div>) : 'Sem contato registrado'}
          </div>

          <div className="lm-section-title" style={{ marginTop: 16 }}>Interações ({interacoes.length})</div>
          {loading && <div className="empty">Carregando...</div>}
          {!loading && interacoes.length === 0 && <div className="empty">Nenhuma interação registrada ainda</div>}
          <div className="lm-chat" style={{ maxHeight: 220 }}>
            {interacoes.map(it => (
              <div key={it.id} className="lm-chat-msg human">
                <div className="lm-chat-label">{formatDataHora(it.criado_em)}</div>
                <div className="lm-chat-text">{it.descricao}</div>
              </div>
            ))}
            <div ref={fimRef} />
          </div>
          <form onSubmit={enviar} style={{ display: 'flex', gap: 8 }}>
            <textarea className="obs-area" style={{ flex: 1, marginTop: 0 }} rows={2}
              placeholder="Registrar interação..." value={texto} onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(e) } }} />
            <button className="btn-save-obs" style={{ float: 'none' }} type="submit" disabled={enviando || !texto.trim()}>
              {enviando ? '...' : 'Enviar'}
            </button>
          </form>
        </div>
      </div>
      {mostrarChecklist && (
        <VendaChecklistModal cliente={{ ...cliente, status }} user={user}
          onClose={() => setMostrarChecklist(false)} onConcluido={() => setMostrarChecklist(false)} />
      )}
    </div>
  )
}

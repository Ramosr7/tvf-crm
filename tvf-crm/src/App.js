import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import './index.css'

const COLUNAS_DEFAULT = ['Aguardando', 'Em contato', 'Proposta enviada', 'Sem resposta']
const CORES_COL = ['#378ADD', '#EF9F27', '#1D9E75', '#E05C2A']

function tagClass(texto) {
  if (!texto) return 'tag'
  const t = texto.toLowerCase()
  if (t.includes('claro')) return 'tag tag-claro'
  if (t.includes('vivo')) return 'tag tag-vivo'
  if (t.includes('net') || t.includes('nextel')) return 'tag tag-net'
  if (t.includes('tim')) return 'tag tag-tim'
  return 'tag'
}

function formatDate(str) {
  if (!str) return ''
  const d = new Date(str)
  const hoje = new Date()
  const diff = Math.floor((hoje - d) / 86400000)
  if (diff === 0) return `hoje ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  if (diff === 1) return `ontem ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function waLink(phone) {
  const num = (phone || '').replace(/\D/g, '')
  return `https://wa.me/${num}`
}

function loadColunas() {
  try {
    const saved = localStorage.getItem('tvf_colunas')
    return saved ? JSON.parse(saved) : COLUNAS_DEFAULT
  } catch { return COLUNAS_DEFAULT }
}

// ─── LEAD CARD ────────────────────────────────────────────────────────────────
function LeadCard({ lead, onOpenModal, onDragStart, onDragEnd, isDragging }) {
  const dragged = React.useRef(false)

  return (
    <div
      className={`card draggable${isDragging ? ' dragging' : ''}`}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; dragged.current = true; onDragStart(lead) }}
      onDragEnd={() => { onDragEnd(); setTimeout(() => { dragged.current = false }, 100) }}
      onClick={() => { if (!dragged.current) onOpenModal(lead) }}
    >
      <div className="card-name">{lead.nome || 'Sem nome'}</div>
      <div className="card-phone">{lead.chat_id}</div>
      <div className="card-tags">
        <span className={`tag ${lead.campanha === 'banda_larga' ? 'tag-bl' : 'tag-ap'}`}>
          {lead.campanha === 'banda_larga' ? 'Banda Larga' : 'Aparelho'}
        </span>
        {lead.operadora_atual && (
          <span className={tagClass(lead.operadora_atual)}>{lead.operadora_atual}</span>
        )}
      </div>
      <div className="card-footer">
        <span className="card-cep">
          {lead.cep ? `${lead.cep}${lead.numero_imovel ? ` · nº ${lead.numero_imovel}` : ''}` : 'CEP não informado'}
        </span>
        <span className="card-date">{formatDate(lead.ultimo_contato || lead.created_at)}</span>
      </div>
    </div>
  )
}

// ─── COLUNA ───────────────────────────────────────────────────────────────────
function Coluna({ nome, cor, leads, onOpenModal, onDrop, onDragOver, onDragLeave, isDragOver, onRenomear, onDragStart, onDragEnd, draggingId }) {
  const [editando, setEditando] = useState(false)
  const [nomeEdit, setNomeEdit] = useState(nome)
  const inputRef = useRef(null)

  useEffect(() => { if (editando) inputRef.current?.focus() }, [editando])

  function confirmarRenomear() {
    if (nomeEdit.trim() && nomeEdit.trim() !== nome) onRenomear(nome, nomeEdit.trim())
    setEditando(false)
  }

  return (
    <div
      className={`column${isDragOver ? ' drag-over' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop() }}
    >
      <div className="col-header">
        <div className="col-title-wrap">
          <div className="col-dot" style={{ background: cor }} />
          {editando ? (
            <input
              ref={inputRef}
              className="col-rename-input"
              value={nomeEdit}
              onChange={e => setNomeEdit(e.target.value)}
              onBlur={confirmarRenomear}
              onKeyDown={e => { if (e.key === 'Enter') confirmarRenomear(); if (e.key === 'Escape') setEditando(false) }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="col-title">{nome}</span>
          )}
          <button
            className="col-rename-btn"
            title="Renomear coluna"
            onClick={e => { e.stopPropagation(); setEditando(true); setNomeEdit(nome) }}
          >✎</button>
        </div>
        <span className="col-count">{leads.length}</span>
      </div>
      {leads.length === 0 && (
        <div className={`empty${isDragOver ? ' drop-hint' : ''}`}>
          {isDragOver ? 'Solte aqui' : 'Nenhum lead'}
        </div>
      )}
      {leads.map(lead => (
        <LeadCard
          key={lead.id}
          lead={lead}
          onOpenModal={onOpenModal}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          isDragging={draggingId === lead.id}
        />
      ))}
    </div>
  )
}

// ─── MODAL DE DETALHES ────────────────────────────────────────────────────────
function LeadModal({ lead, onClose, onRefresh, colunas, coresCol }) {
  const [nome, setNome] = useState(lead.nome || '')
  const [obs, setObs] = useState(lead.observacoes || '')
  const [statusCrm, setStatusCrm] = useState(lead.status_crm || colunas[0])
  const [salvando, setSalvando] = useState(false)
  const [saved, setSaved] = useState(false)

  async function salvar() {
    setSalvando(true)
    await supabase.from('consultores').update({ nome, observacoes: obs, status_crm: statusCrm }).eq('id', lead.id)
    setSalvando(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
    onRefresh()
  }

  async function fechar() {
    if (!window.confirm(`Marcar ${nome || lead.chat_id} como fechado?`)) return
    await supabase.from('consultores').update({ status: 'fechado', status_crm: 'Fechado' }).eq('id', lead.id)
    onRefresh()
    onClose()
  }

  async function deletar() {
    if (!window.confirm(`Deletar o lead de ${nome || lead.chat_id}? Essa ação não pode ser desfeita.`)) return
    await supabase.from('consultores').delete().eq('id', lead.id)
    onRefresh()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lead-modal" onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <div className="lm-header-left">
            <div className="lm-avatar">{(nome || '?')[0].toUpperCase()}</div>
            <div>
              <input
                className="lm-nome-input"
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Nome do lead"
              />
              <div className="lm-phone">{lead.chat_id}</div>
            </div>
          </div>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>

        <div className="lm-tags">
          <span className={`tag ${lead.campanha === 'banda_larga' ? 'tag-bl' : 'tag-ap'}`}>
            {lead.campanha === 'banda_larga' ? 'Banda Larga' : 'Aparelho'}
          </span>
          {lead.operadora_atual && <span className={tagClass(lead.operadora_atual)}>{lead.operadora_atual}</span>}
          <span className="tag" style={{ background: '#f4f0f9', color: '#660099' }}>
            etapa {lead.etapa_followup || 0}
          </span>
        </div>

        <div className="lm-section-title">Dados do lead</div>
        <div className="lm-grid">
          <div className="lm-field"><label>CEP</label><span>{lead.cep || '—'}</span></div>
          <div className="lm-field"><label>Número imóvel</label><span>{lead.numero_imovel || '—'}</span></div>
          <div className="lm-field"><label>Operadora atual</label><span>{lead.operadora_atual || '—'}</span></div>
          <div className="lm-field"><label>Criado em</label><span>{lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '—'}</span></div>
          <div className="lm-field"><label>Último contato</label><span>{formatDate(lead.ultimo_contato || lead.created_at)}</span></div>
          <div className="lm-field"><label>Follow-up ativo</label><span>{lead.followup_ativo ? '✅ Sim' : '⛔ Não'}</span></div>
        </div>

        <div className="lm-section-title">Status no Kanban</div>
        <div className="lm-status-grid">
          {colunas.map((col, i) => (
            <div
              key={col}
              className={`lm-status-opt${statusCrm === col ? ' active' : ''}`}
              style={statusCrm === col ? { borderColor: coresCol[i], background: coresCol[i] + '18' } : {}}
              onClick={() => setStatusCrm(col)}
            >
              <div className="col-dot" style={{ background: coresCol[i] }} />
              {col}
            </div>
          ))}
        </div>

        {lead.observacoes && (
          <>
            <div className="lm-section-title">Resumo / histórico</div>
            <div className="lm-resumo">{lead.observacoes}</div>
          </>
        )}

        <div className="lm-section-title">Observações</div>
        <textarea
          className="obs-area"
          rows={4}
          placeholder="Adicione notas, histórico de interações, resultados de chamadas..."
          value={obs}
          onChange={e => setObs(e.target.value)}
          style={{ marginBottom: '8px' }}
        />

        <div className="lm-actions">
          <a href={waLink(lead.chat_id)} target="_blank" rel="noreferrer" style={{ flex: 1 }}>
            <button className="btn-action whatsapp" style={{ width: '100%' }}>💬 WhatsApp</button>
          </a>
          <button
            className="btn-save-obs"
            style={{ flex: 1, margin: 0, float: 'none', display: 'block' }}
            onClick={salvar}
            disabled={salvando}
          >
            {salvando ? 'Salvando...' : saved ? '✓ Salvo!' : 'Salvar alterações'}
          </button>
          <button className="btn-action fechar" onClick={fechar}>✓ Fechar lead</button>
          <button className="btn-action" style={{ color: '#C0451A', borderColor: '#F5C6C6' }} onClick={deletar}>🗑</button>
        </div>
      </div>
    </div>
  )
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('novos')
  const [campanha, setCampanha] = useState('todos')
  const [modalLead, setModalLead] = useState(null)
  const [obsTexto, setObsTexto] = useState({})
  const [colunas, setColunas] = useState(loadColunas)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const draggingLead = useRef(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('consultores').select('*').order('created_at', { ascending: false })
    if (campanha !== 'todos') query = query.eq('campanha', campanha)
    const { data, error } = await query
    if (!error && data) setLeads(data)
    setLoading(false)
  }, [campanha])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  useEffect(() => {
    const ch = supabase.channel('consultores-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consultores' }, fetchLeads)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [fetchLeads])

  async function renomearColuna(nomeAntigo, nomeNovo) {
    const novas = colunas.map(c => c === nomeAntigo ? nomeNovo : c)
    setColunas(novas)
    localStorage.setItem('tvf_colunas', JSON.stringify(novas))
    await supabase.from('consultores').update({ status_crm: nomeNovo }).eq('status_crm', nomeAntigo)
    fetchLeads()
  }

  function handleDragStart(lead) {
    draggingLead.current = lead
    setDraggingId(lead.id)
  }

  function handleDragEnd() {
    draggingLead.current = null
    setDraggingId(null)
    setDragOver(null)
  }

  async function handleDrop(coluna) {
    const lead = draggingLead.current
    if (!lead) return
    if ((lead.status_crm || colunas[0]) !== coluna) {
      await supabase.from('consultores').update({ status_crm: coluna }).eq('id', lead.id)
      fetchLeads()
    }
    handleDragEnd()
  }

  async function marcarFechado(lead) {
    await supabase.from('consultores').update({ status: 'fechado', status_crm: 'Fechado' }).eq('id', lead.id)
    fetchLeads()
  }

  async function deletarLead(lead) {
    if (!window.confirm(`Deletar o lead de ${lead.nome || lead.chat_id}?`)) return
    await supabase.from('consultores').delete().eq('id', lead.id)
    fetchLeads()
  }

  const leadsFechados = leads.filter(l => l.status === 'fechado')
  const leadsRecontatos = leads.filter(l => l.status !== 'fechado' && l.etapa_followup > 2)
  const leadsNovos = leads.filter(l => l.status !== 'fechado' && l.etapa_followup <= 2)
  const porColuna = col => leadsNovos.filter(l => (l.status_crm || colunas[0]) === col)
  const totalAtivos = leadsNovos.length + leadsRecontatos.length

  if (loading) return <div className="loading">Carregando leads...</div>

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-logo">TVF <span>TELECOM</span> · CRM</span>
          <span className="topbar-badge">{totalAtivos} ativos</span>
        </div>
        <div className="topbar-right">
          {['todos', 'banda_larga', 'aparelho'].map(c => (
            <button key={c} className={`btn-filter ${campanha === c ? 'active' : ''}`} onClick={() => setCampanha(c)}>
              {c === 'todos' ? 'Todos' : c === 'banda_larga' ? 'Banda Larga' : 'Aparelho'}
            </button>
          ))}
          <button className="btn-filter" onClick={fetchLeads}>↻</button>
        </div>
      </div>

      <div className="main">
        <div className="stats">
          {[
            { label: 'Novos leads', value: leadsNovos.length, sub: 'sem atendimento anterior' },
            { label: 'Recontatos', value: leadsRecontatos.length, sub: 'já abordados antes' },
            { label: 'Fechados', value: leadsFechados.length, sub: 'este mês' },
            { label: 'Total na base', value: leads.length, sub: 'todos os períodos' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="tabs">
          {[
            { key: 'novos', label: 'Novos leads', count: leadsNovos.length },
            { key: 'recontatos', label: 'Recontatos', count: leadsRecontatos.length },
            { key: 'fechados', label: 'Fechados', count: leadsFechados.length },
          ].map(t => (
            <div key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}<span className="tab-pill">{t.count}</span>
            </div>
          ))}
        </div>

        {tab === 'novos' && (
          <div className="board">
            {colunas.map((col, i) => (
              <Coluna
                key={col}
                nome={col}
                cor={CORES_COL[i % CORES_COL.length]}
                leads={porColuna(col)}
                onOpenModal={setModalLead}
                onDrop={() => handleDrop(col)}
                onDragOver={() => setDragOver(col)}
                onDragLeave={() => setDragOver(null)}
                isDragOver={dragOver === col}
                onRenomear={renomearColuna}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                draggingId={draggingId}
              />
            ))}
          </div>
        )}

        {tab === 'recontatos' && (
          <div className="list-view">
            {leadsRecontatos.length === 0 && <div className="empty" style={{ padding: '40px' }}>Nenhum recontato ainda</div>}
            {leadsRecontatos.map(lead => (
              <div key={lead.id} className="list-card" onClick={() => setModalLead(lead)} style={{ cursor: 'pointer' }}>
                <div className="list-card-top">
                  <div>
                    <span className="list-card-name">{lead.nome || 'Sem nome'}</span>
                    <span className="list-card-phone">{lead.chat_id}</span>
                  </div>
                  <span className="badge-recontato">{lead.etapa_followup}º contato</span>
                </div>
                {lead.observacoes && <div className="rc-history">Último: {lead.observacoes}</div>}
                <div className="list-card-footer">
                  <div className="card-tags">
                    <span className={`tag ${lead.campanha === 'banda_larga' ? 'tag-bl' : 'tag-ap'}`}>
                      {lead.campanha === 'banda_larga' ? 'Banda Larga' : 'Aparelho'}
                    </span>
                    {lead.operadora_atual && <span className={tagClass(lead.operadora_atual)}>{lead.operadora_atual}</span>}
                  </div>
                  <span className="list-card-date">{formatDate(lead.ultimo_contato)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'fechados' && (
          <div className="list-view">
            {leadsFechados.length === 0 && <div className="empty" style={{ padding: '40px' }}>Nenhum lead fechado ainda</div>}
            {leadsFechados.map(lead => (
              <div key={lead.id} className="list-card" onClick={() => setModalLead(lead)} style={{ cursor: 'pointer' }}>
                <div className="list-card-top">
                  <div>
                    <span className="list-card-name">{lead.nome || 'Sem nome'}</span>
                    <span className="list-card-phone">{lead.chat_id}</span>
                  </div>
                  <span className="badge-fechado">✓ Fechado</span>
                </div>
                {lead.observacoes && <div style={{ fontSize: '12px', color: '#666', margin: '4px 0' }}>{lead.observacoes}</div>}
                <div className="list-card-footer">
                  <div className="card-tags">
                    <span className={`tag ${lead.campanha === 'banda_larga' ? 'tag-bl' : 'tag-ap'}`}>
                      {lead.campanha === 'banda_larga' ? 'Banda Larga' : 'Aparelho'}
                    </span>
                  </div>
                  <span className="list-card-date">{formatDate(lead.ultimo_contato)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalLead && (
        <LeadModal
          lead={modalLead}
          onClose={() => setModalLead(null)}
          onRefresh={fetchLeads}
          colunas={colunas}
          coresCol={CORES_COL}
        />
      )}
    </div>
  )
}

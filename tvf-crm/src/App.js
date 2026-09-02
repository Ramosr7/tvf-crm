import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './useAuth'
import Login from './Login'
import PotencialCarteira from './PotencialCarteira'
import RotinaDiaria from './RotinaDiaria'
import KanbanTemperatura from './KanbanTemperatura'
import Importar from './Importar'
import Relatorios from './Relatorios'
import PlanoComercial from './PlanoComercial'
import MinhaComissao, { JOAO_ID } from './MinhaComissao'
import NotificacoesSino from './NotificacoesSino'
import Dashboard from './Dashboard'
import Assistente from './Assistente'
import './index.css'


// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const COLUNAS_DEFAULT = ['Aguardando', 'Em contato', 'Proposta enviada', 'Sem resposta']
const CORES_COL = ['#378ADD', '#EF9F27', '#1D9E75', '#E05C2A']
const PRODUTOS = ['Banda Larga', 'Móvel', 'Avançado', 'Aparelho']
const TIPOS_INTERACAO = [
  { value: 'ligacao', label: '📞 Ligação' },
  { value: 'whatsapp', label: '💬 WhatsApp' },
  { value: 'email', label: '✉️ Email' },
  { value: 'visita', label: '🏢 Visita' },
  { value: 'outro', label: '📝 Outro' },
]

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function calcScore(lead) {
  let score = 0
  if (lead.nome) score += 15
  if (lead.operadora_atual) score += 20
  if (lead.cep) score += 25
  if (lead.numero_imovel) score += 20
  if (lead.observacoes) score += 10
  if ((lead.etapa_followup || 0) >= 2) score += 10
  return score
}

function scoreClass(s) {
  if (s >= 70) return 'score-high'
  if (s >= 40) return 'score-mid'
  return 'score-low'
}

function tagClass(texto) {
  if (!texto) return 'tag'
  const t = texto.toLowerCase()
  if (t.includes('claro')) return 'tag tag-claro'
  if (t.includes('vivo')) return 'tag tag-vivo'
  if (t.includes('net') || t.includes('nextel')) return 'tag tag-net'
  if (t.includes('tim')) return 'tag tag-tim'
  return 'tag'
}

function campanhaTag(campanha) {
  const map = {
    banda_larga: { label: 'Banda Larga', cls: 'tag-bl' },
    aparelho:    { label: 'Aparelho',    cls: 'tag-ap' },
    movel:       { label: 'Móvel',       cls: 'tag-movel' },
    avancado:    { label: 'Avançado',    cls: 'tag-avancado' },
  }
  return map[campanha] || { label: campanha || '—', cls: '' }
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
  return `https://wa.me/${String(phone || '').replace(/\D/g, '')}`
}

function loadColunas() {
  try {
    const saved = localStorage.getItem('tvf_colunas')
    return saved ? JSON.parse(saved) : COLUNAS_DEFAULT
  } catch { return COLUNAS_DEFAULT }
}

// ─── MODAL DE DETALHES ────────────────────────────────────────────────────────
function LeadModal({ lead, onClose, onRefresh, colunas, coresCol }) {
  const [campos, setCampos] = useState({
    nome: lead.nome || '',
    chat_id: String(lead.chat_id || ''),
    operadora_atual: lead.operadora_atual || '',
    cep: String(lead.cep || ''),
    numero_imovel: String(lead.numero_imovel || ''),
    observacoes: lead.observacoes || '',
    status_crm: lead.status_crm || colunas[0],
    campanha: lead.campanha || 'banda_larga',
  })
  const [produto, setProduto] = useState(
    lead.campanha === 'aparelho' ? 'Aparelho' :
    lead.campanha === 'movel' ? 'Móvel' :
    lead.campanha === 'avancado' ? 'Avançado' : 'Banda Larga'
  )
  const [salvando, setSalvando] = useState(false)
  const [saved, setSaved] = useState(false)
  const [aba, setAba] = useState('dados')
  const [historico, setHistorico] = useState([])
  const [interacoes, setInteracoes] = useState([])
  const [novaInt, setNovaInt] = useState({ tipo: 'ligacao', descricao: '' })
  const [salvandoInt, setSalvandoInt] = useState(false)
  const [loadingHist, setLoadingHist] = useState(false)

  const score = calcScore({ ...lead, ...campos })

  useEffect(() => {
    if (aba === 'historico') carregarHistorico()
    if (aba === 'interacoes') carregarInteracoes()
  }, [aba])

  async function carregarHistorico() {
    setLoadingHist(true)
    const { data } = await supabase.from('n8n_chat_histories').select('id, session_id, message').eq('session_id', lead.chat_id)
    if (data) setHistorico(data)
    setLoadingHist(false)
  }

  async function carregarInteracoes() {
    const { data } = await supabase.from('interacoes').select('*').eq('consultor_id', lead.id).order('created_at', { ascending: false })
    if (data) setInteracoes(data)
  }

  async function salvar() {
    setSalvando(true)
    const campanhaMap = { 'Banda Larga': 'banda_larga', 'Aparelho': 'aparelho', 'Móvel': 'movel', 'Avançado': 'avancado' }
    await supabase.from('consultores').update({ ...campos, campanha: campanhaMap[produto] || campos.campanha }).eq('id', lead.id)
    setSalvando(false); setSaved(true)
    setTimeout(() => setSaved(false), 1800)
    onRefresh()
  }

  async function fechar() {
    if (!window.confirm(`Marcar ${campos.nome || lead.chat_id} como fechado?`)) return
    await supabase.from('consultores').update({ status: 'fechado', status_crm: 'Fechado' }).eq('id', lead.id)
    onRefresh(); onClose()
  }

  async function deletar() {
    if (!window.confirm(`Deletar o lead de ${campos.nome || lead.chat_id}?`)) return
    await supabase.from('consultores').delete().eq('id', lead.id)
    onRefresh(); onClose()
  }

  async function adicionarInteracao() {
    if (!novaInt.descricao.trim()) return
    setSalvandoInt(true)
    await supabase.from('interacoes').insert({ consultor_id: lead.id, tipo: novaInt.tipo, descricao: novaInt.descricao.trim() })
    setNovaInt({ tipo: 'ligacao', descricao: '' })
    setSalvandoInt(false)
    carregarInteracoes()
  }

  async function deletarInteracao(id) {
    await supabase.from('interacoes').delete().eq('id', id)
    carregarInteracoes()
  }

  function parseMensagem(msg) {
    try {
      const obj = typeof msg === 'string' ? JSON.parse(msg) : msg
      return { tipo: obj.type, texto: obj.data?.content || obj.content || JSON.stringify(obj) }
    } catch { return { tipo: 'human', texto: String(msg) } }
  }

  const campo = (label, key, placeholder) => (
    <div className="lm-field-edit">
      <label>{label}</label>
      <input className="lm-input" value={campos[key]} onChange={e => setCampos(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder || label} />
    </div>
  )

  const scoreColor = score >= 70 ? '#1D9E75' : score >= 40 ? '#EF9F27' : '#378ADD'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lead-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="lm-header">
          <div className="lm-header-left">
            <div className="lm-avatar">{(campos.nome || '?')[0].toUpperCase()}</div>
            <div>
              <input className="lm-nome-input" value={campos.nome} onChange={e => setCampos(p => ({ ...p, nome: e.target.value }))} placeholder="Nome do lead" />
              <div className="lm-phone">{lead.chat_id}</div>
            </div>
          </div>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>

        {/* Score */}
        <div className="lm-score-box">
          <span className="lm-score-label">Score do lead</span>
          <div className="lm-score-bar-wrap">
            <div className="lm-score-bar" style={{ width: `${score}%`, background: scoreColor }} />
          </div>
          <span className={`score-badge ${scoreClass(score)}`}>{score}/100</span>
        </div>

        {/* Abas */}
        <div className="lm-tabs">
          {[{ key: 'dados', label: '📋 Dados' }, { key: 'interacoes', label: '🕐 Interações' }, { key: 'historico', label: '💬 WhatsApp' }].map(t => (
            <div key={t.key} className={`lm-tab ${aba === t.key ? 'active' : ''}`} onClick={() => setAba(t.key)}>{t.label}</div>
          ))}
        </div>

        {/* ABA DADOS */}
        {aba === 'dados' && (
          <div className="lm-body">
            <div className="lm-section-title">Contato</div>
            <div className="lm-grid-2">
              {campo('Nome', 'nome')}
              {campo('Telefone', 'chat_id', '5511999999999')}
              {campo('Operadora atual', 'operadora_atual', 'Claro, Tim, Vivo...')}
              {campo('CEP', 'cep', '00000-000')}
              {campo('Número imóvel', 'numero_imovel', '123')}
            </div>

            <div className="lm-section-title">Produto de interesse</div>
            <div className="lm-status-grid">
              {PRODUTOS.map(p => (
                <div key={p} className={`lm-status-opt ${produto === p ? 'active' : ''}`}
                  style={produto === p ? { borderColor: '#660099', background: '#f4f0f9' } : {}}
                  onClick={() => setProduto(p)}>{p}</div>
              ))}
            </div>

            <div className="lm-section-title">Status Kanban</div>
            <div className="lm-status-grid">
              {colunas.map((col, i) => (
                <div key={col} className={`lm-status-opt ${campos.status_crm === col ? 'active' : ''}`}
                  style={campos.status_crm === col ? { borderColor: coresCol[i], background: coresCol[i] + '18' } : {}}
                  onClick={() => setCampos(p => ({ ...p, status_crm: col }))}>
                  <div className="col-dot" style={{ background: coresCol[i] }} />{col}
                </div>
              ))}
            </div>

            <div className="lm-section-title">Observações</div>
            <textarea className="obs-area" rows={4} placeholder="Notas, contexto, resumo do agente..." value={campos.observacoes} onChange={e => setCampos(p => ({ ...p, observacoes: e.target.value }))} />

            <div className="lm-section-title">Dados do sistema</div>
            <div className="lm-grid-3">
              <div className="lm-field"><label>Follow-up</label><span>{lead.followup_ativo ? '✅ Ativo' : '⛔ Inativo'}</span></div>
              <div className="lm-field"><label>Etapa</label><span>{lead.etapa_followup || 0}</span></div>
              <div className="lm-field"><label>Criado em</label><span>{lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '—'}</span></div>
            </div>

            <div className="lm-actions">
              <a href={waLink(lead.chat_id)} target="_blank" rel="noreferrer" style={{ flex: 1 }}>
                <button className="btn-action whatsapp" style={{ width: '100%' }}>💬 WhatsApp</button>
              </a>
              <button className="btn-save-obs" style={{ flex: 2, float: 'none', margin: 0 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : saved ? '✓ Salvo!' : 'Salvar alterações'}
              </button>
              <button className="btn-action fechar" onClick={fechar}>✓ Fechar</button>
              <button className="btn-action" style={{ color: '#C0451A', borderColor: '#F5C6C6' }} onClick={deletar}>🗑</button>
            </div>
          </div>
        )}

        {/* ABA INTERAÇÕES */}
        {aba === 'interacoes' && (
          <div className="lm-body">
            <div className="lm-section-title">Nova interação</div>
            <div className="lm-interacao-form">
              <div className="lm-tipo-grid">
                {TIPOS_INTERACAO.map(t => (
                  <div key={t.value} className={`lm-tipo-opt ${novaInt.tipo === t.value ? 'active' : ''}`} onClick={() => setNovaInt(p => ({ ...p, tipo: t.value }))}>{t.label}</div>
                ))}
              </div>
              <textarea className="obs-area" rows={3} placeholder="Descreva a interação..." value={novaInt.descricao} onChange={e => setNovaInt(p => ({ ...p, descricao: e.target.value }))} />
              <button className="btn-save-obs" style={{ float: 'none', display: 'block', width: '100%', margin: 0 }} onClick={adicionarInteracao} disabled={salvandoInt || !novaInt.descricao.trim()}>
                {salvandoInt ? 'Salvando...' : '+ Registrar interação'}
              </button>
            </div>
            <div className="lm-section-title" style={{ marginTop: 16 }}>Histórico</div>
            {interacoes.length === 0 && <div className="empty">Nenhuma interação registrada</div>}
            <div className="lm-timeline">
              {interacoes.map(int => (
                <div key={int.id} className="lm-timeline-item">
                  <div className="lm-timeline-dot" />
                  <div className="lm-timeline-content">
                    <div className="lm-timeline-header">
                      <span className="lm-timeline-tipo">{TIPOS_INTERACAO.find(t => t.value === int.tipo)?.label || int.tipo}</span>
                      <span className="lm-timeline-data">{formatDate(int.created_at)}</span>
                      <button className="lm-del-btn" onClick={() => deletarInteracao(int.id)}>✕</button>
                    </div>
                    <div className="lm-timeline-desc">{int.descricao}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA WHATSAPP */}
        {aba === 'historico' && (
          <div className="lm-body">
            <div className="lm-section-title">Conversa com o agente Tallis</div>
            {loadingHist && <div className="empty">Carregando...</div>}
            {!loadingHist && historico.length === 0 && <div className="empty">Nenhuma mensagem encontrada</div>}
            <div className="lm-chat">
              {historico.map(h => {
                const msg = parseMensagem(h.message)
                return (
                  <div key={h.id} className={`lm-chat-msg ${msg.tipo === 'human' ? 'human' : 'ai'}`}>
                    <div className="lm-chat-label">{msg.tipo === 'human' ? '👤 Cliente' : '🤖 Tallis'}</div>
                    <div className="lm-chat-text">{msg.texto}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── LEAD CARD ────────────────────────────────────────────────────────────────
function LeadCard({ lead, onOpenModal, onDragStart, onDragEnd, isDragging }) {
  const dragged = useRef(false)
  const score = calcScore(lead)
  const ct = campanhaTag(lead.campanha)

  return (
    <div
      className={`card draggable${isDragging ? ' dragging' : ''}`}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; dragged.current = true; onDragStart(lead) }}
      onDragEnd={() => { onDragEnd(); setTimeout(() => { dragged.current = false }, 100) }}
      onClick={() => { if (!dragged.current) onOpenModal(lead) }}
    >
      <div className="card-top">
        <div className="card-name">{lead.nome || 'Sem nome'}</div>
        <span className={`score-badge ${scoreClass(score)}`}>{score}</span>
      </div>
      <div className="card-phone">{lead.chat_id}</div>
      <div className="card-tags">
        <span className={`tag ${ct.cls}`}>{ct.label}</span>
        {lead.operadora_atual && <span className={tagClass(lead.operadora_atual)}>{lead.operadora_atual}</span>}
      </div>
      <div className="card-footer">
        <span className="card-cep">{lead.cep ? `${lead.cep}${lead.numero_imovel ? ` · nº ${lead.numero_imovel}` : ''}` : 'CEP não informado'}</span>
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

  function confirmar() {
    if (nomeEdit.trim() && nomeEdit.trim() !== nome) onRenomear(nome, nomeEdit.trim())
    setEditando(false)
  }

  return (
    <div className={`column${isDragOver ? ' drag-over' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop() }}>
      <div className="col-header">
        <div className="col-title-wrap">
          <div className="col-dot" style={{ background: cor }} />
          {editando
            ? <input ref={inputRef} className="col-rename-input" value={nomeEdit}
                onChange={e => setNomeEdit(e.target.value)}
                onBlur={confirmar}
                onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') setEditando(false) }}
                onClick={e => e.stopPropagation()} />
            : <span className="col-title">{nome}</span>}
          <button className="col-rename-btn" onClick={e => { e.stopPropagation(); setEditando(true); setNomeEdit(nome) }}>✎</button>
        </div>
        <span className="col-count">{leads.length}</span>
      </div>
      {leads.length === 0 && <div className={`empty${isDragOver ? ' drop-hint' : ''}`}>{isDragOver ? 'Solte aqui' : 'Nenhum lead'}</div>}
      {leads.map(lead => (
        <LeadCard key={lead.id} lead={lead} onOpenModal={onOpenModal}
          onDragStart={onDragStart} onDragEnd={onDragEnd} isDragging={draggingId === lead.id} />
      ))}
    </div>
  )
}

// ─── CRM LEADS (tela original) ─────────────────────────────────────────────────
function CrmLeads() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('novos')
  const [campanha, setCampanha] = useState('todos')
  const [busca, setBusca] = useState('')
  const [filtroOperadora, setFiltroOperadora] = useState('')
  const [modalLead, setModalLead] = useState(null)
  const [colunas, setColunas] = useState(loadColunas)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const draggingLead = useRef(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('consultores').select('*').order('created_at', { ascending: false })
    if (campanha !== 'todos') q = q.eq('campanha', campanha)
    const { data, error } = await q
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

  async function renomearColuna(ant, novo) {
    const novas = colunas.map(c => c === ant ? novo : c)
    setColunas(novas)
    localStorage.setItem('tvf_colunas', JSON.stringify(novas))
    await supabase.from('consultores').update({ status_crm: novo }).eq('status_crm', ant)
    fetchLeads()
  }

  function handleDragStart(lead) { draggingLead.current = lead; setDraggingId(lead.id) }
  function handleDragEnd() { draggingLead.current = null; setDraggingId(null); setDragOver(null) }

  async function handleDrop(col) {
    const lead = draggingLead.current
    if (!lead) return
    if ((lead.status_crm || colunas[0]) !== col) {
      await supabase.from('consultores').update({ status_crm: col }).eq('id', lead.id)
      fetchLeads()
    }
    handleDragEnd()
  }

  // Filtros
  const filtrarLeads = (lista) => {
    let f = lista
    if (busca) {
      const q = busca.toLowerCase()
      f = f.filter(l => (l.nome || '').toLowerCase().includes(q) || String(l.chat_id || '').includes(q) || (l.operadora_atual || '').toLowerCase().includes(q))
    }
    if (filtroOperadora) f = f.filter(l => (l.operadora_atual || '').toLowerCase().includes(filtroOperadora.toLowerCase()))
    return f
  }

  const leadsFechados = leads.filter(l => l.status === 'fechado')
  const leadsRecontatos = leads.filter(l => l.status !== 'fechado' && l.etapa_followup > 2)
  const leadsNovos = leads.filter(l => l.status !== 'fechado' && l.etapa_followup <= 2)
  const leadsNovosFiltrados = filtrarLeads(leadsNovos)
  const porColuna = col => leadsNovosFiltrados.filter(l => (l.status_crm || colunas[0]) === col)

  // Operadoras únicas para o filtro
  const operadoras = [...new Set(leadsNovos.map(l => l.operadora_atual).filter(Boolean))]

  if (loading) return <div className="loading">Carregando leads...</div>

  return (
    <>
      <div className="main">
        <div className="kanban-toolbar" style={{ marginBottom: 16 }}>
          <button className="btn-filter-light" onClick={fetchLeads}>↻ Atualizar</button>
          <span style={{ fontSize: 11, color: 'rgba(245,241,250,0.40)', marginLeft: 'auto' }}>{leadsNovos.length + leadsRecontatos.length} ativos</span>
        </div>
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
          <>
            <div className="kanban-toolbar">
              <input className="search-input" placeholder="🔍 Buscar lead, telefone, operadora..." value={busca} onChange={e => setBusca(e.target.value)} />
              <select className="filter-select" value={filtroOperadora} onChange={e => setFiltroOperadora(e.target.value)}>
                <option value="">Todas operadoras</option>
                {operadoras.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              {(busca || filtroOperadora) && (
                <button className="btn-filter active" onClick={() => { setBusca(''); setFiltroOperadora('') }}>✕ Limpar filtros</button>
              )}
              <span style={{ fontSize: 11, color: 'rgba(245,241,250,0.40)', marginLeft: 'auto' }}>
                {leadsNovosFiltrados.length} lead{leadsNovosFiltrados.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="board">
              {colunas.map((col, i) => (
                <Coluna key={col} nome={col} cor={CORES_COL[i % CORES_COL.length]}
                  leads={porColuna(col)} onOpenModal={setModalLead}
                  onDrop={() => handleDrop(col)} onDragOver={() => setDragOver(col)}
                  onDragLeave={() => setDragOver(null)} isDragOver={dragOver === col}
                  onRenomear={renomearColuna} onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd} draggingId={draggingId} />
              ))}
            </div>
          </>
        )}

        {tab === 'recontatos' && (
          <div className="list-view">
            {leadsRecontatos.length === 0 && <div className="empty" style={{ padding: '40px' }}>Nenhum recontato ainda</div>}
            {leadsRecontatos.map(lead => {
              const ct = campanhaTag(lead.campanha)
              return (
                <div key={lead.id} className="list-card" onClick={() => setModalLead(lead)}>
                  <div className="list-card-top">
                    <div><span className="list-card-name">{lead.nome || 'Sem nome'}</span><span className="list-card-phone">{lead.chat_id}</span></div>
                    <span className="badge-recontato">{lead.etapa_followup}º contato</span>
                  </div>
                  {lead.observacoes && <div className="rc-history">{lead.observacoes}</div>}
                  <div className="list-card-footer">
                    <div className="card-tags">
                      <span className={`tag ${ct.cls}`}>{ct.label}</span>
                      {lead.operadora_atual && <span className={tagClass(lead.operadora_atual)}>{lead.operadora_atual}</span>}
                    </div>
                    <span className="list-card-date">{formatDate(lead.ultimo_contato)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'fechados' && (
          <div className="list-view">
            {leadsFechados.length === 0 && <div className="empty" style={{ padding: '40px' }}>Nenhum lead fechado ainda</div>}
            {leadsFechados.map(lead => {
              const ct = campanhaTag(lead.campanha)
              return (
                <div key={lead.id} className="list-card" onClick={() => setModalLead(lead)}>
                  <div className="list-card-top">
                    <div><span className="list-card-name">{lead.nome || 'Sem nome'}</span><span className="list-card-phone">{lead.chat_id}</span></div>
                    <span className="badge-fechado">✓ Fechado</span>
                  </div>
                  <div className="list-card-footer">
                    <div className="card-tags"><span className={`tag ${ct.cls}`}>{ct.label}</span></div>
                    <span className="list-card-date">{formatDate(lead.ultimo_contato)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalLead && (
        <LeadModal lead={modalLead} onClose={() => setModalLead(null)}
          onRefresh={fetchLeads} colunas={colunas} coresCol={CORES_COL} />
      )}
    </>
  )
}

// ─── APP (auth gate + navegação) ───────────────────────────────────────────────
export default function App() {
  const { session, user, loading, signOut } = useAuth()
  // sessionStorage (não localStorage): sobrevive o Chrome descartar a aba em segundo plano
  // (que recarrega a página do zero) sem sentir que "voltou do início" — só reseta se a
  // aba/janela for fechada de vez.
  const [tela, setTela] = useState(() => sessionStorage.getItem('tvf_tela_atual') || 'dashboard')
  // toda vez que desloga, esquece a última tela — o próximo login (desse ou de outro usuário,
  // no mesmo navegador) sempre cai no Dashboard, sem herdar onde a sessão anterior tinha parado.
  function sair() {
    sessionStorage.removeItem('tvf_tela_atual')
    signOut()
  }

  // Potencial de Carteira / Importar / Plano Comercial ficam sempre montados (não recarregam
  // sozinhos ao trocar de aba, só mantêm o que já buscaram) — clicar de novo nesses 3 itens do
  // menu incrementa o contador da tela, que essas telas usam como dependência extra pra
  // rebuscar os dados no Supabase na hora, dando a sensação de "página nova" sem perder filtro.
  const [refreshTick, setRefreshTick] = useState({ carteira: 0, importar: 0, plano_comercial: 0 })
  function irPara(t) {
    setTela(t)
    setRefreshTick(prev => ({ ...prev, [t]: prev[t] + 1 }))
  }

  useEffect(() => {
    if (tela === 'leads') setTela('carteira')
    if (user?.perfil === 'Consultor' && tela === 'relatorios') setTela('carteira')
  }, [user, tela])

  useEffect(() => { sessionStorage.setItem('tvf_tela_atual', tela) }, [tela])

  if (loading) return <div className="loading">Carregando...</div>
  if (!session) return <Login />
  if (!user) {
    return (
      <div className="loading">
        Usuário autenticado mas sem cadastro em consultores_staff.<br />
        Peça pra adicionar seu ID ({session.user.id}) nessa tabela.
        <div style={{ marginTop: 12 }}>
          <button className="btn-filter-light" onClick={sair}>Sair</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-logo-wrap topbar-logo-clicavel" onClick={() => setTela('dashboard')} title="Ir para o Início">
            <img src="/assets/logo-tvf.png" alt="TVF Telecom" className="topbar-logo-img" />
            <span className="topbar-logo-texto">CRM</span>
          </div>
          <div className="topbar-nav">
            <span className={`topbar-nav-item ${tela === 'dashboard' ? 'active' : ''}`} onClick={() => setTela('dashboard')}>Início</span>
            <span className={`topbar-nav-item ${tela === 'carteira' ? 'active' : ''}`} onClick={() => irPara('carteira')}>Potencial de Carteira</span>
            <span className={`topbar-nav-item ${tela === 'kanban_temp' ? 'active' : ''}`} onClick={() => setTela('kanban_temp')}>Kanban</span>
            <span className={`topbar-nav-item ${tela === 'rotina' ? 'active' : ''}`} onClick={() => setTela('rotina')}>Rotina Diária</span>
            {(user.perfil === 'Gestor' || user.perfil === 'Supervisor') && (
              <span className={`topbar-nav-item ${tela === 'importar' ? 'active' : ''}`} onClick={() => irPara('importar')}>Importar</span>
            )}
            {user.perfil !== 'Consultor' && (
              <span className={`topbar-nav-item ${tela === 'relatorios' ? 'active' : ''}`} onClick={() => setTela('relatorios')}>Relatórios</span>
            )}
            {user.perfil === 'Gestor' && (
              <span className={`topbar-nav-item ${tela === 'plano_comercial' ? 'active' : ''}`} onClick={() => irPara('plano_comercial')}>Plano Comercial</span>
            )}
            {user.id === JOAO_ID && (
              <span className={`topbar-nav-item ${tela === 'minha_comissao' ? 'active' : ''}`} onClick={() => setTela('minha_comissao')}>Variável</span>
            )}
          </div>
        </div>
        <div className="topbar-right">
          <NotificacoesSino user={user} />
          <span className="topbar-badge">{user?.nome} · {user?.perfil}</span>
          <button className="btn-filter" onClick={sair}>Sair</button>
        </div>
      </div>

      {/* Cada tela fica sempre montada (só escondida) pra manter filtro/estado ao trocar de
          aba sem reload — só um F5 de verdade (recarrega o app) reseta pro padrão. */}
      <div style={{ display: tela === 'dashboard' ? 'block' : 'none' }}><Dashboard user={user} /></div>
      <div style={{ display: tela === 'carteira' ? 'block' : 'none' }}><PotencialCarteira user={user} refreshSignal={refreshTick.carteira} /></div>
      <div style={{ display: tela === 'kanban_temp' ? 'block' : 'none' }}><KanbanTemperatura user={user} /></div>
      <div style={{ display: tela === 'rotina' ? 'block' : 'none' }}><RotinaDiaria user={user} /></div>
      {(user.perfil === 'Gestor' || user.perfil === 'Supervisor') && (
        <div style={{ display: tela === 'importar' ? 'block' : 'none' }}><Importar user={user} refreshSignal={refreshTick.importar} /></div>
      )}
      {user.perfil !== 'Consultor' && (
        <div style={{ display: tela === 'relatorios' ? 'block' : 'none' }}><Relatorios user={user} /></div>
      )}
      {user.perfil === 'Gestor' && (
        <div style={{ display: tela === 'plano_comercial' ? 'block' : 'none' }}><PlanoComercial refreshSignal={refreshTick.plano_comercial} /></div>
      )}
      {user.id === JOAO_ID && (
        <div style={{ display: tela === 'minha_comissao' ? 'block' : 'none' }}><MinhaComissao /></div>
      )}

      {user.perfil !== 'Consultor' && <Assistente user={user} />}
    </div>
  )
}

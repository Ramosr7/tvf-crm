import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import './index.css'

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
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
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

// ─── MODAL COMPLETO ───────────────────────────────────────────────────────────
function LeadModal({ lead, onClose, onRefresh, colunas, coresCol }) {
  const [campos, setCampos] = useState({
    nome: lead.nome || '',
    chat_id: lead.chat_id || '',
    operadora_atual: lead.operadora_atual || '',
    cep: lead.cep || '',
    numero_imovel: lead.numero_imovel || '',
    observacoes: lead.observacoes || '',
    status_crm: lead.status_crm || colunas[0],
    campanha: lead.campanha || 'banda_larga',
  })
  const [produto, setProduto] = useState(lead.campanha === 'banda_larga' ? 'Banda Larga' : lead.campanha === 'aparelho' ? 'Aparelho' : 'Banda Larga')
  const [salvando, setSalvando] = useState(false)
  const [saved, setSaved] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState('dados')
  const [historico, setHistorico] = useState([])
  const [interacoes, setInteracoes] = useState([])
  const [novaInteracao, setNovaInteracao] = useState({ tipo: 'ligacao', descricao: '' })
  const [salvandoInteracao, setSalvandoInteracao] = useState(false)
  const [loadingHistorico, setLoadingHistorico] = useState(false)

  useEffect(() => {
    if (abaAtiva === 'historico') carregarHistorico()
    if (abaAtiva === 'interacoes') carregarInteracoes()
  }, [abaAtiva])

  async function carregarHistorico() {
    setLoadingHistorico(true)
    const { data } = await supabase
      .from('n8n_chat_histories')
      .select('id, session_id, message')
      .eq('session_id', lead.chat_id)
    if (data) setHistorico(data)
    setLoadingHistorico(false)
  }

  async function carregarInteracoes() {
    const { data } = await supabase
      .from('interacoes')
      .select('*')
      .eq('consultor_id', lead.id)
      .order('created_at', { ascending: false })
    if (data) setInteracoes(data)
  }

  async function salvar() {
    setSalvando(true)
    const campanhaMap = { 'Banda Larga': 'banda_larga', 'Aparelho': 'aparelho', 'Móvel': 'movel', 'Avançado': 'avancado' }
    await supabase.from('consultores').update({
      ...campos,
      campanha: campanhaMap[produto] || campos.campanha,
    }).eq('id', lead.id)
    setSalvando(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
    onRefresh()
  }

  async function fechar() {
    if (!window.confirm(`Marcar ${campos.nome || lead.chat_id} como fechado?`)) return
    await supabase.from('consultores').update({ status: 'fechado', status_crm: 'Fechado' }).eq('id', lead.id)
    onRefresh(); onClose()
  }

  async function deletar() {
    if (!window.confirm(`Deletar o lead de ${campos.nome || lead.chat_id}? Essa ação não pode ser desfeita.`)) return
    await supabase.from('consultores').delete().eq('id', lead.id)
    onRefresh(); onClose()
  }

  async function adicionarInteracao() {
    if (!novaInteracao.descricao.trim()) return
    setSalvandoInteracao(true)
    await supabase.from('interacoes').insert({
      consultor_id: lead.id,
      tipo: novaInteracao.tipo,
      descricao: novaInteracao.descricao.trim(),
    })
    setNovaInteracao({ tipo: 'ligacao', descricao: '' })
    setSalvandoInteracao(false)
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
      <input
        className="lm-input"
        value={campos[key]}
        onChange={e => setCampos(p => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder || label}
      />
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lead-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="lm-header">
          <div className="lm-header-left">
            <div className="lm-avatar">{(campos.nome || '?')[0].toUpperCase()}</div>
            <div>
              <input
                className="lm-nome-input"
                value={campos.nome}
                onChange={e => setCampos(p => ({ ...p, nome: e.target.value }))}
                placeholder="Nome do lead"
              />
              <div className="lm-phone">{lead.chat_id}</div>
            </div>
          </div>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>

        {/* Abas */}
        <div className="lm-tabs">
          {[
            { key: 'dados', label: '📋 Dados' },
            { key: 'interacoes', label: '🕐 Interações' },
            { key: 'historico', label: '💬 WhatsApp' },
          ].map(t => (
            <div key={t.key} className={`lm-tab ${abaAtiva === t.key ? 'active' : ''}`} onClick={() => setAbaAtiva(t.key)}>
              {t.label}
            </div>
          ))}
        </div>

        {/* ABA DADOS */}
        {abaAtiva === 'dados' && (
          <div className="lm-body">
            <div className="lm-section-title">Contato</div>
            <div className="lm-grid-2">
              {campo('Nome', 'nome', 'Nome completo')}
              {campo('Telefone', 'chat_id', '5511999999999')}
              {campo('Operadora atual', 'operadora_atual', 'Claro, Tim, Vivo...')}
              {campo('CEP', 'cep', '00000-000')}
              {campo('Número imóvel', 'numero_imovel', '123')}
            </div>

            <div className="lm-section-title">Produto de interesse</div>
            <div className="lm-status-grid">
              {PRODUTOS.map(p => (
                <div
                  key={p}
                  className={`lm-status-opt ${produto === p ? 'active' : ''}`}
                  style={produto === p ? { borderColor: '#660099', background: '#f4f0f9' } : {}}
                  onClick={() => setProduto(p)}
                >
                  {p}
                </div>
              ))}
            </div>

            <div className="lm-section-title">Status Kanban</div>
            <div className="lm-status-grid">
              {colunas.map((col, i) => (
                <div
                  key={col}
                  className={`lm-status-opt ${campos.status_crm === col ? 'active' : ''}`}
                  style={campos.status_crm === col ? { borderColor: coresCol[i], background: coresCol[i] + '18' } : {}}
                  onClick={() => setCampos(p => ({ ...p, status_crm: col }))}
                >
                  <div className="col-dot" style={{ background: coresCol[i] }} />
                  {col}
                </div>
              ))}
            </div>

            <div className="lm-section-title">Observações</div>
            <textarea
              className="obs-area"
              rows={4}
              placeholder="Notas, contexto, resumo do agente..."
              value={campos.observacoes}
              onChange={e => setCampos(p => ({ ...p, observacoes: e.target.value }))}
            />

            <div className="lm-section-title">Dados do sistema</div>
            <div className="lm-grid-3">
              <div className="lm-field"><label>Follow-up ativo</label><span>{lead.followup_ativo ? '✅ Sim' : '⛔ Não'}</span></div>
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
        {abaAtiva === 'interacoes' && (
          <div className="lm-body">
            <div className="lm-section-title">Nova interação</div>
            <div className="lm-interacao-form">
              <div className="lm-tipo-grid">
                {TIPOS_INTERACAO.map(t => (
                  <div
                    key={t.value}
                    className={`lm-tipo-opt ${novaInteracao.tipo === t.value ? 'active' : ''}`}
                    onClick={() => setNovaInteracao(p => ({ ...p, tipo: t.value }))}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
              <textarea
                className="obs-area"
                rows={3}
                placeholder="Descreva a interação (ex: Liguei, não atendeu. Deixei recado.)"
                value={novaInteracao.descricao}
                onChange={e => setNovaInteracao(p => ({ ...p, descricao: e.target.value }))}
              />
              <button
                className="btn-save-obs"
                style={{ float: 'none', display: 'block', width: '100%', margin: '4px 0 0' }}
                onClick={adicionarInteracao}
                disabled={salvandoInteracao || !novaInteracao.descricao.trim()}
              >
                {salvandoInteracao ? 'Salvando...' : '+ Registrar interação'}
              </button>
            </div>

            <div className="lm-section-title" style={{ marginTop: '16px' }}>Histórico de interações</div>
            {interacoes.length === 0 && <div className="empty" style={{ padding: '20px 0' }}>Nenhuma interação registrada</div>}
            <div className="lm-timeline">
              {interacoes.map(int => {
                const tipoLabel = TIPOS_INTERACAO.find(t => t.value === int.tipo)?.label || int.tipo
                return (
                  <div key={int.id} className="lm-timeline-item">
                    <div className="lm-timeline-dot" />
                    <div className="lm-timeline-content">
                      <div className="lm-timeline-header">
                        <span className="lm-timeline-tipo">{tipoLabel}</span>
                        <span className="lm-timeline-data">{formatDate(int.created_at)}</span>
                        <button className="lm-del-btn" onClick={() => deletarInteracao(int.id)}>✕</button>
                      </div>
                      <div className="lm-timeline-desc">{int.descricao}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ABA WHATSAPP */}
        {abaAtiva === 'historico' && (
          <div className="lm-body">
            <div className="lm-section-title">Conversa com o agente Tallis</div>
            {loadingHistorico && <div className="empty">Carregando mensagens...</div>}
            {!loadingHistorico && historico.length === 0 && (
              <div className="empty" style={{ padding: '20px 0' }}>Nenhuma mensagem encontrada</div>
            )}
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
          {lead.campanha === 'banda_larga' ? 'Banda Larga' : lead.campanha === 'aparelho' ? 'Aparelho' : lead.campanha === 'movel' ? 'Móvel' : 'Avançado'}
        </span>
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
            <input ref={inputRef} className="col-rename-input" value={nomeEdit}
              onChange={e => setNomeEdit(e.target.value)}
              onBlur={confirmar}
              onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') setEditando(false) }}
              onClick={e => e.stopPropagation()} />
          ) : (
            <span className="col-title">{nome}</span>
          )}
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

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('novos')
  const [campanha, setCampanha] = useState('todos')
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

  const leadsFechados = leads.filter(l => l.status === 'fechado')
  const leadsRecontatos = leads.filter(l => l.status !== 'fechado' && l.etapa_followup > 2)
  const leadsNovos = leads.filter(l => l.status !== 'fechado' && l.etapa_followup <= 2)
  const porColuna = col => leadsNovos.filter(l => (l.status_crm || colunas[0]) === col)

  if (loading) return <div className="loading">Carregando leads...</div>

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-logo">TVF <span>TELECOM</span> · CRM</span>
          <span className="topbar-badge">{leadsNovos.length + leadsRecontatos.length} ativos</span>
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
              <Coluna key={col} nome={col} cor={CORES_COL[i % CORES_COL.length]}
                leads={porColuna(col)} onOpenModal={setModalLead}
                onDrop={() => handleDrop(col)} onDragOver={() => setDragOver(col)}
                onDragLeave={() => setDragOver(null)} isDragOver={dragOver === col}
                onRenomear={renomearColuna} onDragStart={handleDragStart}
                onDragEnd={handleDragEnd} draggingId={draggingId} />
            ))}
          </div>
        )}

        {tab === 'recontatos' && (
          <div className="list-view">
            {leadsRecontatos.length === 0 && <div className="empty" style={{ padding: '40px' }}>Nenhum recontato ainda</div>}
            {leadsRecontatos.map(lead => (
              <div key={lead.id} className="list-card" onClick={() => setModalLead(lead)} style={{ cursor: 'pointer' }}>
                <div className="list-card-top">
                  <div><span className="list-card-name">{lead.nome || 'Sem nome'}</span><span className="list-card-phone">{lead.chat_id}</span></div>
                  <span className="badge-recontato">{lead.etapa_followup}º contato</span>
                </div>
                {lead.observacoes && <div className="rc-history">{lead.observacoes}</div>}
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
                  <div><span className="list-card-name">{lead.nome || 'Sem nome'}</span><span className="list-card-phone">{lead.chat_id}</span></div>
                  <span className="badge-fechado">✓ Fechado</span>
                </div>
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
        <LeadModal lead={modalLead} onClose={() => setModalLead(null)}
          onRefresh={fetchLeads} colunas={colunas} coresCol={CORES_COL} />
      )}
    </div>
  )
}

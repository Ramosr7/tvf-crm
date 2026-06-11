import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import './index.css'

const COLUNAS = ['Aguardando', 'Em contato', 'Proposta enviada', 'Sem resposta']
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

export default function App() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('novos')
  const [campanha, setCampanha] = useState('todos')
  const [expandedCard, setExpandedCard] = useState(null)
  const [obsTexto, setObsTexto] = useState({})
  const [moveModal, setMoveModal] = useState(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('consultores')
      .select('*')
      .order('created_at', { ascending: false })

    if (campanha !== 'todos') {
      query = query.eq('campanha', campanha)
    }

    const { data, error } = await query
    if (!error && data) setLeads(data)
    setLoading(false)
  }, [campanha])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('consultores-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consultores' }, fetchLeads)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchLeads])

  // Classificar leads
  const leadsFechados = leads.filter(l => l.status === 'fechado')
  const leadsRecontatos = leads.filter(l => l.status !== 'fechado' && l.etapa_followup > 2)
  const leadsNovos = leads.filter(l => l.status !== 'fechado' && l.etapa_followup <= 2)

  // Por coluna (novos)
  const porColuna = (coluna) => leadsNovos.filter(l => (l.status_crm || 'Aguardando') === coluna)

  async function moverCard(lead, novaColuna) {
    await supabase.from('consultores').update({ status_crm: novaColuna }).eq('id', lead.id)
    setMoveModal(null)
    fetchLeads()
  }

  async function marcarFechado(lead) {
    await supabase.from('consultores').update({ status: 'fechado', status_crm: 'Fechado' }).eq('id', lead.id)
    fetchLeads()
  }

  async function salvarObs(lead) {
    const obs = obsTexto[lead.id] || ''
    await supabase.from('consultores').update({ observacoes: obs }).eq('id', lead.id)
    setExpandedCard(null)
  }

  async function deletarLead(lead) {
    if (!window.confirm(`Deletar o lead de ${lead.nome || lead.chat_id}? Essa ação não pode ser desfeita.`)) return
    await supabase.from('consultores').delete().eq('id', lead.id)
    fetchLeads()
  }

  function toggleCard(id) {
    setExpandedCard(prev => prev === id ? null : id)
    setObsTexto(prev => ({ ...prev, [id]: leads.find(l => l.id === id)?.observacoes || '' }))
  }

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
            <button
              key={c}
              className={`btn-filter ${campanha === c ? 'active' : ''}`}
              onClick={() => setCampanha(c)}
            >
              {c === 'todos' ? 'Todos' : c === 'banda_larga' ? 'Banda Larga' : 'Aparelho'}
            </button>
          ))}
          <button className="btn-filter" onClick={fetchLeads}>↻</button>
        </div>
      </div>

      <div className="main">
        <div className="stats">
          <div className="stat-card">
            <div className="stat-label">Novos leads</div>
            <div className="stat-value">{leadsNovos.length}</div>
            <div className="stat-sub">sem atendimento anterior</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Recontatos</div>
            <div className="stat-value">{leadsRecontatos.length}</div>
            <div className="stat-sub">já abordados antes</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Fechados</div>
            <div className="stat-value">{leadsFechados.length}</div>
            <div className="stat-sub">este mês</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total na base</div>
            <div className="stat-value">{leads.length}</div>
            <div className="stat-sub">todos os períodos</div>
          </div>
        </div>

        <div className="tabs">
          {[
            { key: 'novos', label: 'Novos leads', count: leadsNovos.length },
            { key: 'recontatos', label: 'Recontatos', count: leadsRecontatos.length },
            { key: 'fechados', label: 'Fechados', count: leadsFechados.length },
          ].map(t => (
            <div key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
              <span className="tab-pill">{t.count}</span>
            </div>
          ))}
        </div>

        {tab === 'novos' && (
          <div className="board">
            {COLUNAS.map((col, i) => (
              <div key={col} className="column">
                <div className="col-header">
                  <div className="col-title-wrap">
                    <div className="col-dot" style={{ background: CORES_COL[i] }} />
                    <span className="col-title">{col}</span>
                  </div>
                  <span className="col-count">{porColuna(col).length}</span>
                </div>
                {porColuna(col).length === 0 && <div className="empty">Nenhum lead</div>}
                {porColuna(col).map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    expanded={expandedCard === lead.id}
                    onToggle={() => toggleCard(lead.id)}
                    onMover={() => setMoveModal(lead)}
                    onFechar={() => marcarFechado(lead)}
                    onDeletar={() => deletarLead(lead)}
                    obsTexto={obsTexto[lead.id] || ''}
                    onObsChange={v => setObsTexto(prev => ({ ...prev, [lead.id]: v }))}
                    onSalvarObs={() => salvarObs(lead)}
                    supabase={supabase}
                    onRefresh={fetchLeads}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === 'recontatos' && (
          <div className="list-view">
            {leadsRecontatos.length === 0 && <div className="empty" style={{ padding: '40px' }}>Nenhum recontato ainda</div>}
            {leadsRecontatos.map(lead => (
              <div key={lead.id} className="list-card">
                <div className="list-card-top">
                  <div>
                    <span className="list-card-name">{lead.nome || 'Sem nome'}</span>
                    <span className="list-card-phone">{lead.chat_id}</span>
                  </div>
                  <span className="badge-recontato">{lead.etapa_followup}º contato</span>
                </div>
                {lead.observacoes && (
                  <div className="rc-history">
                    Último: {lead.observacoes}
                  </div>
                )}
                <div className="list-card-footer">
                  <div className="card-tags">
                    <span className={`tag ${lead.campanha === 'banda_larga' ? 'tag-bl' : 'tag-ap'}`}>
                      {lead.campanha === 'banda_larga' ? 'Banda Larga' : 'Aparelho'}
                    </span>
                    {lead.operadora_atual && <span className={tagClass(lead.operadora_atual)}>{lead.operadora_atual}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <a href={waLink(lead.chat_id)} target="_blank" rel="noreferrer">
                      <button className="btn-action whatsapp">💬 WhatsApp</button>
                    </a>
                    <button className="btn-action fechar" onClick={() => marcarFechado(lead)}>✓ Fechar</button>
                  </div>
                </div>
                <div style={{ marginTop: '8px' }}>
                  <textarea
                    className="obs-area"
                    rows={2}
                    placeholder="Adicionar observação..."
                    value={obsTexto[lead.id] || lead.observacoes || ''}
                    onChange={e => setObsTexto(prev => ({ ...prev, [lead.id]: e.target.value }))}
                  />
                  <button className="btn-save-obs" onClick={() => salvarObs(lead)}>Salvar</button>
                  <div style={{ clear: 'both' }} />
                </div>
                <div className="list-card-date" style={{ marginTop: '4px' }}>{formatDate(lead.ultimo_contato)}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'fechados' && (
          <div className="list-view">
            {leadsFechados.length === 0 && <div className="empty" style={{ padding: '40px' }}>Nenhum lead fechado ainda</div>}
            {leadsFechados.map(lead => (
              <div key={lead.id} className="list-card">
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

      {moveModal && (
        <div className="modal-overlay" onClick={() => setMoveModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Mover para...</div>
            {COLUNAS.filter(c => c !== moveModal.status_crm).map((col, i) => (
              <div key={col} className="modal-option" onClick={() => moverCard(moveModal, col)}>
                <div className="col-dot" style={{ background: CORES_COL[COLUNAS.indexOf(col)] }} />
                {col}
              </div>
            ))}
            <div className="modal-cancel" onClick={() => setMoveModal(null)}>Cancelar</div>
          </div>
        </div>
      )}
    </div>
  )
}

function LeadCard({ lead, expanded, onToggle, onMover, onFechar, onDeletar, obsTexto, onObsChange, onSalvarObs, supabase, onRefresh }) {
  const [editando, setEditando] = useState(false)
  const [nomeEdit, setNomeEdit] = useState(lead.nome || '')

  async function salvarNome() {
    await supabase.from('consultores').update({ nome: nomeEdit }).eq('id', lead.id)
    setEditando(false)
    onRefresh()
  }

  return (
    <div className="card" onClick={onToggle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
        {editando ? (
          <input
            style={{ fontSize: '13px', fontWeight: 600, border: '1px solid #660099', borderRadius: '4px', padding: '2px 6px', flex: 1, marginRight: '6px' }}
            value={nomeEdit}
            onChange={e => setNomeEdit(e.target.value)}
            onClick={e => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <div className="card-name">{lead.nome || 'Sem nome'}</div>
        )}
        <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
          {editando ? (
            <button onClick={salvarNome} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', border: 'none', background: '#660099', color: '#fff', cursor: 'pointer' }}>✓</button>
          ) : (
            <button onClick={() => { setEditando(true); setNomeEdit(lead.nome || '') }} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E0D8EC', background: 'transparent', color: '#888', cursor: 'pointer' }}>✎</button>
          )}
          <button onClick={onDeletar} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #F5C6C6', background: 'transparent', color: '#C0451A', cursor: 'pointer' }}>✕</button>
        </div>
      </div>
      <div className="card-phone">{lead.chat_id}</div>
      <div className="card-tags">
        <span className={`tag ${lead.campanha === 'banda_larga' ? 'tag-bl' : 'tag-ap'}`}>
          {lead.campanha === 'banda_larga' ? 'Banda Larga' : 'Aparelho'}
        </span>
        {lead.operadora_atual && (
          <span className={`tag ${lead.operadora_atual?.toLowerCase().includes('claro') ? 'tag-claro' : lead.operadora_atual?.toLowerCase().includes('vivo') ? 'tag-vivo' : 'tag-net'}`}>
            {lead.operadora_atual}
          </span>
        )}
      </div>
      <div className="card-footer">
        <span className="card-cep">
          {lead.cep ? `${lead.cep}${lead.numero_imovel ? ` · nº ${lead.numero_imovel}` : ''}` : 'CEP não informado'}
        </span>
        <span className="card-date">{formatDate(lead.ultimo_contato || lead.created_at)}</span>
      </div>

      {expanded && (
        <div onClick={e => e.stopPropagation()}>
          <div className="card-actions">
            <a href={waLink(lead.chat_id)} target="_blank" rel="noreferrer" style={{ flex: 1 }}>
              <button className="btn-action whatsapp" style={{ width: '100%' }}>💬 WhatsApp</button>
            </a>
            <button className="btn-action" onClick={onMover}>↕ Mover</button>
            <button className="btn-action fechar" onClick={onFechar}>✓ Fechar</button>
          </div>
          <textarea
            className="obs-area"
            rows={2}
            placeholder="Adicionar observação..."
            value={obsTexto}
            onChange={e => onObsChange(e.target.value)}
          />
          <button className="btn-save-obs" onClick={onSalvarObs}>Salvar obs.</button>
          <div style={{ clear: 'both' }} />
        </div>
      )}
    </div>
  )
}

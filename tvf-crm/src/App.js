import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'

// ─── CSS EMBUTIDO ─────────────────────────────────────────────────────────────
const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F4F2F8; color: #1a1a1a; font-size: 14px; min-height: 100vh; }
.app { min-height: 100vh; display: flex; flex-direction: column; }

/* TOPBAR */
.topbar { background: #660099; padding: 0 24px; height: 56px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
.topbar-left { display: flex; align-items: center; gap: 12px; }
.topbar-logo { font-size: 16px; font-weight: 700; color: #fff; letter-spacing: -0.3px; }
.topbar-logo span { color: #FF6B00; }
.topbar-badge { font-size: 11px; background: rgba(255,255,255,0.15); border-radius: 20px; padding: 2px 10px; color: rgba(255,255,255,0.85); }
.topbar-right { display: flex; align-items: center; gap: 8px; }
.btn-filter { font-size: 12px; padding: 5px 12px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.3); background: transparent; color: rgba(255,255,255,0.8); cursor: pointer; transition: all 0.15s; }
.btn-filter:hover { background: rgba(255,255,255,0.15); color: #fff; }
.btn-filter.active { background: #FF6B00; color: #fff; border-color: #FF6B00; }

.main { padding: 20px 24px; flex: 1; }

/* STATS */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
.stat-card { background: #fff; border: 1px solid #E0D8EC; border-radius: 10px; padding: 14px 16px; border-top: 3px solid #660099; }
.stat-label { font-size: 11px; color: #888; margin-bottom: 4px; }
.stat-value { font-size: 24px; font-weight: 700; color: #660099; }
.stat-sub { font-size: 11px; color: #aaa; margin-top: 2px; }

/* TABS */
.tabs { display: flex; gap: 0; border-bottom: 1px solid #D8D0E8; margin-bottom: 20px; }
.tab { font-size: 13px; padding: 10px 18px; cursor: pointer; color: #888; border-bottom: 2px solid transparent; margin-bottom: -1px; display: flex; align-items: center; gap: 7px; transition: color 0.15s; }
.tab:hover { color: #660099; }
.tab.active { color: #660099; border-bottom-color: #FF6B00; font-weight: 600; }
.tab-pill { font-size: 10px; border-radius: 20px; padding: 1px 7px; background: #EDE0FF; color: #660099; }
.tab.active .tab-pill { background: #FF6B00; color: #fff; }

/* KANBAN TOOLBAR */
.kanban-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.search-input { background: #fff; border: 1px solid #E0D8EC; border-radius: 10px; padding: 8px 14px; font-size: 12px; outline: none; width: 220px; transition: border-color 0.15s; font-family: inherit; }
.search-input:focus { border-color: #660099; }
.search-input::placeholder { color: #bbb; }
.filter-select { background: #fff; border: 1px solid #E0D8EC; border-radius: 10px; padding: 8px 12px; font-size: 12px; outline: none; cursor: pointer; font-family: inherit; color: #555; }
.filter-select:focus { border-color: #660099; }

/* BOARD */
.board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.column { background: #EAE4F2; border-radius: 12px; padding: 12px; min-height: 400px; transition: all 0.2s; }
.column.drag-over { background: #f4f0fb; border: 2px dashed #660099; }
.col-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.col-title-wrap { display: flex; align-items: center; gap: 6px; flex: 1; }
.col-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.col-title { font-size: 12px; font-weight: 500; color: #555; }
.col-count { font-size: 11px; background: #fff; border-radius: 20px; padding: 1px 8px; color: #660099; font-weight: 600; }
.col-rename-btn { background: none; border: none; color: #bbb; font-size: 12px; cursor: pointer; padding: 0 4px; opacity: 0; transition: opacity 0.15s; }
.col-header:hover .col-rename-btn { opacity: 1; }
.col-rename-input { font-size: 12px; font-weight: 700; color: #1a1a2e; border: 1px solid #660099; border-radius: 5px; padding: 2px 7px; outline: none; width: 110px; background: #fff; }
.empty { font-size: 12px; color: #bbb; text-align: center; padding: 20px 0; }
.empty.drop-hint { color: #660099; font-weight: 600; }

/* CARD */
.card { background: #fff; border: 1px solid #E0D8EC; border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s; user-select: none; }
.card:hover { border-color: #660099; box-shadow: 0 2px 8px rgba(102,0,153,0.08); }
.card.draggable { cursor: grab; }
.card.draggable:active { cursor: grabbing; }
.card.dragging { opacity: 0.4; transform: scale(0.97); }
.card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2px; }
.card-name { font-size: 13px; font-weight: 600; color: #1a1a1a; }
.card-phone { font-size: 11px; color: #888; margin-bottom: 8px; }
.card-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
.tag { font-size: 10px; padding: 2px 8px; border-radius: 20px; font-weight: 500; }
.tag-bl { background: #EDE0FF; color: #5B2C8D; }
.tag-ap { background: #FFE8D6; color: #C04A00; }
.tag-movel { background: #D6EAF8; color: #1A5276; }
.tag-avancado { background: #D5F5E3; color: #1E8449; }
.tag-claro { background: #FDEBD0; color: #935116; }
.tag-vivo { background: #EDE0FF; color: #5B2C8D; }
.tag-net { background: #FDEBD0; color: #935116; }
.tag-tim { background: #D6EAF8; color: #1A5276; }
.card-footer { display: flex; align-items: center; justify-content: space-between; }
.card-cep { font-size: 10px; color: #aaa; }
.card-date { font-size: 10px; color: #aaa; }

/* SCORE BADGE */
.score-badge { font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 20px; letter-spacing: 0.02em; }
.score-high { background: rgba(29,158,117,0.12); color: #1D9E75; }
.score-mid  { background: rgba(239,159,39,0.12);  color: #EF9F27; }
.score-low  { background: rgba(55,138,221,0.12);  color: #378ADD; }

/* TAGS */
.tag-campanha { font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 20px; }

/* LIST VIEW */
.list-view { display: flex; flex-direction: column; gap: 8px; }
.list-card { background: #fff; border: 1px solid #E0D8EC; border-radius: 10px; padding: 14px 16px; cursor: pointer; transition: border-color 0.15s; }
.list-card:hover { border-color: #660099; }
.list-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.list-card-name { font-size: 14px; font-weight: 600; color: #1a1a1a; }
.list-card-phone { font-size: 12px; color: #888; margin-left: 8px; }
.badge-recontato { font-size: 10px; background: #FFE8D6; color: #C04A00; border-radius: 20px; padding: 2px 8px; font-weight: 500; }
.badge-fechado { font-size: 10px; background: #EDE0FF; color: #660099; border-radius: 20px; padding: 2px 8px; font-weight: 500; }
.list-card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.list-card-date { font-size: 10px; color: #aaa; }
.rc-history { font-size: 11px; color: #666; background: #FFF5EE; border-left: 2px solid #FF6B00; border-radius: 4px; padding: 5px 8px; margin: 6px 0; }

/* MODAL OVERLAY */
.modal-overlay { position: fixed; inset: 0; background: rgba(102,0,153,0.2); display: flex; align-items: center; justify-content: center; z-index: 200; }

/* LEAD MODAL */
.lead-modal { background: #fff; border-radius: 16px; width: 560px; max-width: 96vw; max-height: 90vh; overflow-y: auto; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.22); display: flex; flex-direction: column; gap: 16px; animation: modalIn 0.18s ease; }
@keyframes modalIn { from { transform: translateY(16px) scale(0.97); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
.lm-header { display: flex; align-items: flex-start; justify-content: space-between; }
.lm-header-left { display: flex; align-items: center; gap: 12px; }
.lm-avatar { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #660099, #FF6B00); color: #fff; font-size: 20px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.lm-nome-input { font-size: 17px; font-weight: 700; color: #1a1a2e; border: none; border-bottom: 2px solid transparent; outline: none; padding: 2px 0; background: transparent; width: 100%; transition: border-color 0.15s; }
.lm-nome-input:focus { border-bottom-color: #660099; }
.lm-phone { font-size: 12px; color: #888; margin-top: 2px; }
.lm-close { background: none; border: none; font-size: 18px; color: #aaa; cursor: pointer; padding: 4px 8px; border-radius: 6px; flex-shrink: 0; }
.lm-close:hover { background: #f0e8f5; color: #660099; }
.lm-tabs { display: flex; gap: 4px; border-bottom: 2px solid #EDE0FF; }
.lm-tab { font-size: 12px; font-weight: 600; padding: 8px 14px; cursor: pointer; color: #999; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: color 0.15s; }
.lm-tab:hover { color: #660099; }
.lm-tab.active { color: #660099; border-bottom-color: #FF6B00; }
.lm-body { display: flex; flex-direction: column; gap: 12px; }
.lm-section-title { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #999; margin-bottom: -8px; }
.lm-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.lm-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.lm-field-edit label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: #aaa; margin-bottom: 4px; }
.lm-input { width: 100%; font-size: 13px; font-weight: 500; color: #1a1a2e; border: 1.5px solid #E0D8EC; border-radius: 7px; padding: 7px 10px; outline: none; background: #fff; font-family: inherit; transition: border-color 0.15s; }
.lm-input:focus { border-color: #660099; }
.lm-field label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: #aaa; margin-bottom: 2px; }
.lm-field span { font-size: 13px; color: #1a1a2e; font-weight: 500; }
.lm-status-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.lm-status-opt { display: flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 8px; border: 1.5px solid #e8e0f0; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.14s; color: #333; }
.lm-status-opt:hover { border-color: #660099; background: #f9f4fd; }
.lm-status-opt.active { font-weight: 700; }
.lm-resumo { background: #f7f4fc; border-left: 3px solid #660099; border-radius: 0 8px 8px 0; padding: 10px 14px; font-size: 12px; color: #444; line-height: 1.6; white-space: pre-wrap; }
.lm-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.lm-score-box { background: #f7f4fc; border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; }
.lm-score-label { font-size: 12px; color: #666; font-weight: 500; }
.lm-score-bar-wrap { flex: 1; margin: 0 12px; height: 6px; background: #E0D8EC; border-radius: 3px; overflow: hidden; }
.lm-score-bar { height: 100%; border-radius: 3px; transition: width 0.4s; }
.lm-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* INTERAÇÕES */
.lm-tipo-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.lm-tipo-opt { font-size: 11px; padding: 5px 10px; border-radius: 20px; border: 1.5px solid #E0D8EC; cursor: pointer; color: #555; transition: all 0.15s; }
.lm-tipo-opt:hover { border-color: #660099; color: #660099; }
.lm-tipo-opt.active { border-color: #660099; background: #f4f0f9; color: #660099; font-weight: 700; }
.lm-timeline { display: flex; flex-direction: column; }
.lm-timeline-item { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #F0EAF8; }
.lm-timeline-item:last-child { border-bottom: none; }
.lm-timeline-dot { width: 8px; height: 8px; border-radius: 50%; background: #660099; flex-shrink: 0; margin-top: 5px; }
.lm-timeline-content { flex: 1; }
.lm-timeline-header { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.lm-timeline-tipo { font-size: 11px; font-weight: 700; color: #660099; }
.lm-timeline-data { font-size: 10px; color: #bbb; flex: 1; }
.lm-del-btn { background: none; border: none; color: #ddd; cursor: pointer; font-size: 11px; padding: 0 4px; }
.lm-del-btn:hover { color: #C0451A; }
.lm-timeline-desc { font-size: 12px; color: #444; line-height: 1.5; }

/* CHAT */
.lm-chat { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; padding: 4px 0; }
.lm-chat-msg { max-width: 85%; padding: 8px 12px; border-radius: 10px; }
.lm-chat-msg.human { align-self: flex-end; background: #DCF8C6; }
.lm-chat-msg.ai { align-self: flex-start; background: #F0EAF8; }
.lm-chat-label { font-size: 9px; font-weight: 700; color: #888; margin-bottom: 3px; text-transform: uppercase; }
.lm-chat-text { font-size: 12px; color: #1a1a2e; line-height: 1.5; white-space: pre-wrap; }

/* BUTTONS */
.obs-area { width: 100%; font-size: 11px; border: 1px solid #E0D8EC; border-radius: 6px; padding: 6px 8px; margin-top: 6px; resize: none; font-family: inherit; background: #FAF8FC; color: #333; outline: none; }
.obs-area:focus { border-color: #660099; }
.btn-save-obs { font-size: 11px; padding: 4px 10px; border-radius: 6px; border: none; background: #660099; color: #fff; cursor: pointer; margin-top: 4px; float: right; }
.btn-save-obs:hover { background: #4d0073; }
.btn-save-obs:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-action { font-size: 11px; padding: 5px 10px; border-radius: 6px; border: 1px solid #E0D8EC; background: transparent; color: #555; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.15s; }
.btn-action:hover { background: #F4F2F8; }
.btn-action.whatsapp { color: #25A244; border-color: #B7E4C7; }
.btn-action.whatsapp:hover { background: #D5F5E3; }
.btn-action.fechar { color: #660099; border-color: #D8B4F0; }
.btn-action.fechar:hover { background: #EDE0FF; }
.lm-interacao-form { display: flex; flex-direction: column; gap: 8px; }

.loading { text-align: center; padding: 60px; color: #660099; font-size: 13px; }
`

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
  return `https://wa.me/${(phone || '').replace(/\D/g, '')}`
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
    chat_id: lead.chat_id || '',
    operadora_atual: lead.operadora_atual || '',
    cep: lead.cep || '',
    numero_imovel: lead.numero_imovel || '',
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

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
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

  // Injeta CSS no head uma vez
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

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
      f = f.filter(l => (l.nome || '').toLowerCase().includes(q) || (l.chat_id || '').includes(q) || (l.operadora_atual || '').toLowerCase().includes(q))
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
              <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>
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
    </div>
  )
}

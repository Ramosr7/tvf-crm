import React, { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import VendaItensModal from './VendaItensModal'
import InteracaoCarteiraModal from './InteracaoCarteiraModal'
import { calcularPotencial } from './potencialLogic'
import VendaChecklistModal from './VendaChecklistModal'

const STATUS_OPCOES = [
  'Aguardando Aceite', 'Aguardando Atendimento', 'Cliente Cancelou', 'Cliente Já Renovado', 'CNPJ Baixado',
  'Débito Interno', 'Já Possui Consultor', 'Não Contatar', 'Não Possui Recomendação',
  'Pedido Finalizado', 'Proposta Enviada', 'Retornar', 'Sem Contato Efetivo',
  'Sem Interesse', 'Sem Viabilidade', 'Venda Realizada',
]
const STATUS_GATILHO_CHECKLIST = ['Venda Realizada', 'Pedido Finalizado']
function fmtMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataISO(d) {
  return d.toISOString().slice(0, 10)
}

const PRESETS_PERIODO = [
  { label: 'Hoje', dias: 0 },
  { label: 'Ontem', dias: 1, apenasUmDia: true },
  { label: '7 dias', dias: 7 },
  { label: 'Este mês', inicioMes: true },
  { label: '3 meses', dias: 90 },
]

const isGestor = (user) => user.perfil === 'Gestor'
const podeAdicionarCliente = (user) => user.perfil === 'Gestor' || user.perfil === 'Supervisor'

function carregarFiltrosSalvos(user) {
  try {
    const raw = localStorage.getItem(`tvf_filtros_carteira_${user.id}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export default function PotencialCarteira({ user }) {
  const filtrosSalvos = carregarFiltrosSalvos(user)
  const [clientes, setClientes] = useState([])
  const [staff, setStaff] = useState([])
  const [filtroConsultor, setFiltroConsultor] = useState(filtrosSalvos.consultor || '')
  const [filtroDataDe, setFiltroDataDe] = useState(filtrosSalvos.dataDe || '')
  const [filtroDataAte, setFiltroDataAte] = useState(filtrosSalvos.dataAte || '')
  const [loading, setLoading] = useState(true)
  const [novoCnpj, setNovoCnpj] = useState('')
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [erroCnpj, setErroCnpj] = useState('')
  const [highlightId, setHighlightId] = useState(null)
  const [vendaItensPorCliente, setVendaItensPorCliente] = useState({})
  const [interacoesPorCliente, setInteracoesPorCliente] = useState({})
  const [checklistPorCliente, setChecklistPorCliente] = useState({})
  const [modalCliente, setModalCliente] = useState(null)
  const [modalInteracaoCliente, setModalInteracaoCliente] = useState(null)
  const [modalChecklistCliente, setModalChecklistCliente] = useState(null)
  const [filtroCnpj, setFiltroCnpj] = useState(filtrosSalvos.cnpj || '')
  const [filtroOrigem, setFiltroOrigem] = useState(filtrosSalvos.origem || '')
  const [filtroStatus, setFiltroStatus] = useState(filtrosSalvos.status || '')
  const [filtroRenovacaoAntecipada, setFiltroRenovacaoAntecipada] = useState(filtrosSalvos.renovacaoAntecipada || false)
  const [selecionados, setSelecionados] = useState(new Set())
  const [removendo, setRemovendo] = useState(false)
  const [ordenacao, setOrdenacao] = useState({ campo: null, direcao: 'asc' })
  const [editandoRazaoSocialId, setEditandoRazaoSocialId] = useState(null)
  const [lixeira, setLixeira] = useState([])
  const [mostrarLixeira, setMostrarLixeira] = useState(false)
  const [consultorDestino, setConsultorDestino] = useState(user.id)
  const [consultorTransferencia, setConsultorTransferencia] = useState('')
  const [transferindo, setTransferindo] = useState(false)

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('carteira_cliente').select('*')
      .is('excluido_em', null).order('razao_social', { ascending: true })
    if (!error && data) setClientes(data)
    setLoading(false)
  }, [])

  const fetchLixeira = useCallback(async () => {
    const { data } = await supabase.from('carteira_cliente').select('*')
      .not('excluido_em', 'is', null).order('excluido_em', { ascending: false })
    setLixeira(data || [])
  }, [])

  const fetchVendaItens = useCallback(async () => {
    const { data } = await supabase.from('carteira_venda_item').select('*')
    const mapa = {}
    for (const item of (data || [])) {
      if (!mapa[item.carteira_cliente_id]) mapa[item.carteira_cliente_id] = []
      mapa[item.carteira_cliente_id].push(item)
    }
    setVendaItensPorCliente(mapa)
  }, [])

  const fetchInteracoes = useCallback(async () => {
    const { data } = await supabase.from('carteira_interacao').select('carteira_cliente_id, criado_em')
    const mapa = {}
    for (const item of (data || [])) {
      if (!mapa[item.carteira_cliente_id]) mapa[item.carteira_cliente_id] = []
      mapa[item.carteira_cliente_id].push(item)
    }
    setInteracoesPorCliente(mapa)
  }, [])

  const fetchChecklists = useCallback(async () => {
    const { data } = await supabase.from('carteira_checklist_venda').select('carteira_cliente_id, ofereceu')
    const mapa = {}
    for (const item of (data || [])) {
      if (!mapa[item.carteira_cliente_id]) mapa[item.carteira_cliente_id] = []
      mapa[item.carteira_cliente_id].push(item)
    }
    setChecklistPorCliente(mapa)
  }, [])

  useEffect(() => { fetchClientes(); fetchVendaItens(); fetchInteracoes(); fetchChecklists() }, [fetchClientes, fetchVendaItens, fetchInteracoes, fetchChecklists])

  useEffect(() => {
    localStorage.setItem(`tvf_filtros_carteira_${user.id}`, JSON.stringify({
      consultor: filtroConsultor, dataDe: filtroDataDe, dataAte: filtroDataAte,
      cnpj: filtroCnpj, origem: filtroOrigem, status: filtroStatus, renovacaoAntecipada: filtroRenovacaoAntecipada,
    }))
  }, [user.id, filtroConsultor, filtroDataDe, filtroDataAte, filtroCnpj, filtroOrigem, filtroStatus, filtroRenovacaoAntecipada])

  useEffect(() => {
    if (podeAdicionarCliente(user)) {
      supabase.from('consultores_staff').select('id, nome').order('nome').then(({ data }) => setStaff(data || []))
      fetchLixeira()
    }
  }, [user, fetchLixeira])

  const nomeConsultor = (id) => staff.find(s => s.id === id)?.nome || '—'

  function resumoVenda(clienteId) {
    const itens = vendaItensPorCliente[clienteId] || []
    if (itens.length === 0) return null
    const total = itens.reduce((s, i) => s + Number(i.valor || 0), 0)
    return `${itens.length} item(ns) · ${fmtMoeda(total)}`
  }

  function resumoInteracao(clienteId) {
    const itens = interacoesPorCliente[clienteId] || []
    return itens.length > 0 ? `Interação (${itens.length})` : 'Interação'
  }

  function resumoChecklist(clienteId) {
    const itens = checklistPorCliente[clienteId] || []
    if (itens.length === 0) return 'Checklist'
    const ofereceu = itens.filter(i => i.ofereceu).length
    return `Checklist (${ofereceu}/${itens.length})`
  }

  function aplicarPreset(preset) {
    const hoje = new Date()
    if (preset.inicioMes) {
      setFiltroDataDe(dataISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
      setFiltroDataAte(dataISO(hoje))
      return
    }
    const de = new Date(hoje)
    de.setDate(de.getDate() - preset.dias)
    setFiltroDataDe(dataISO(de))
    setFiltroDataAte(preset.apenasUmDia ? dataISO(de) : dataISO(hoje))
  }

  const clientesFiltrados = clientes.filter(c => {
    if (podeAdicionarCliente(user) && filtroConsultor && c.consultor_id !== filtroConsultor) return false
    if (filtroDataDe && (!c.data_adicao || c.data_adicao < filtroDataDe)) return false
    if (filtroDataAte && (!c.data_adicao || c.data_adicao > filtroDataAte)) return false
    if (filtroCnpj && !c.cnpj.includes(filtroCnpj.replace(/\D/g, ''))) return false
    if (filtroOrigem && c.origem !== filtroOrigem) return false
    if (filtroStatus && c.status !== filtroStatus) return false
    if (filtroRenovacaoAntecipada && !c.alerta_renovacao) return false
    return true
  })

  function pendente(c) {
    return (c.status === 'Aguardando Aceite' || c.status === 'Aguardando Atendimento') && (interacoesPorCliente[c.id] || []).length === 0
  }

  const CAMPOS_NUMERICOS = ['potencial_migracao', 'potencial_bl', 'potencial_ti', 'potencial_voz', 'credito_pre_aprovado']

  function pedirOrdenar(campo) {
    setOrdenacao(prev => {
      if (prev.campo === campo) return { campo, direcao: prev.direcao === 'asc' ? 'desc' : 'asc' }
      return { campo, direcao: CAMPOS_NUMERICOS.includes(campo) ? 'desc' : 'asc' }
    })
  }

  function setaOrdenacao(campo) {
    if (ordenacao.campo !== campo) return ''
    return ordenacao.direcao === 'asc' ? ' ▲' : ' ▼'
  }

  const clientesOrdenados = [...clientesFiltrados].sort((a, b) => {
    if (!ordenacao.campo) return 0
    const av = a[ordenacao.campo], bv = b[ordenacao.campo]
    let cmp
    if (CAMPOS_NUMERICOS.includes(ordenacao.campo)) cmp = (Number(av) || 0) - (Number(bv) || 0)
    else cmp = String(av || '').localeCompare(String(bv || ''), 'pt-BR')
    return ordenacao.direcao === 'asc' ? cmp : -cmp
  })

  function alternarSelecao(id) {
    setSelecionados(prev => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }

  function alternarSelecionarTodos() {
    setSelecionados(prev => prev.size === clientesFiltrados.length ? new Set() : new Set(clientesFiltrados.map(c => c.id)))
  }

  async function removerCliente(id) {
    if (!window.confirm('Remover este cliente da carteira? Ele vai pra Lixeira e pode ser restaurado depois.')) return
    const { error } = await supabase.from('carteira_cliente')
      .update({ excluido_em: new Date().toISOString(), excluido_por: user.id }).eq('id', id)
    if (error) { console.error('Erro ao remover:', error); alert('Erro ao remover: ' + error.message); return }
    setSelecionados(prev => { const n = new Set(prev); n.delete(id); return n })
    fetchClientes()
    if (podeAdicionarCliente(user)) fetchLixeira()
  }

  async function removerSelecionados() {
    if (selecionados.size === 0) return
    if (!window.confirm(`Remover ${selecionados.size} cliente(s) selecionado(s) da carteira? Vão pra Lixeira e podem ser restaurados depois.`)) return
    setRemovendo(true)
    const { error } = await supabase.from('carteira_cliente')
      .update({ excluido_em: new Date().toISOString(), excluido_por: user.id }).in('id', Array.from(selecionados))
    setRemovendo(false)
    if (error) { console.error('Erro ao remover:', error); alert('Erro ao remover: ' + error.message); return }
    setSelecionados(new Set())
    fetchClientes()
    if (podeAdicionarCliente(user)) fetchLixeira()
  }

  async function restaurarCliente(id) {
    const { error } = await supabase.from('carteira_cliente')
      .update({ excluido_em: null, excluido_por: null }).eq('id', id)
    if (error) { alert('Erro ao restaurar: ' + error.message); return }
    fetchClientes()
    fetchLixeira()
  }

  function exportarXlsx() {
    const linhas = clientesFiltrados.map(c => ({
      Status: c.status || '',
      CNPJ: c.cnpj,
      'Razão Social': c.razao_social || '',
      Origem: c.origem || '',
      Contato: c.contato || '',
      Consultor: nomeConsultor(c.consultor_id),
      'Pot. Migração': c.potencial_migracao || 0,
      'Pot. BL': c.potencial_bl || 0,
      'Pot. TI': c.potencial_ti || 0,
      'Pot. Voz': c.potencial_voz || 0,
      'Crédito Pré-aprovado': Number(c.credito_pre_aprovado || 0),
      'Vendido (R$)': (vendaItensPorCliente[c.id] || []).reduce((s, i) => s + Number(i.valor || 0), 0),
      'Data Venda': c.data_venda || '',
      'Data Adição': c.data_adicao || '',
      Observações: c.observacoes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(linhas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Potencial de Carteira')
    XLSX.writeFile(wb, `potencial_carteira_${dataISO(new Date())}.xlsx`)
  }

  async function flagarSelecionados(no_kanban) {
    if (selecionados.size === 0) return
    const campos = no_kanban
      ? { no_kanban: true, temperatura: 'Morno', temperatura_atualizada_em: new Date().toISOString() }
      : { no_kanban: false, temperatura: null, temperatura_atualizada_em: null }
    const { error } = await supabase.from('carteira_cliente').update(campos).in('id', Array.from(selecionados))
    if (error) { console.error('Erro ao atualizar Kanban:', error); alert('Erro: ' + error.message); return }
    setSelecionados(new Set())
    fetchClientes()
  }

  async function transferirCliente(c, novoConsultorId) {
    if (!novoConsultorId || novoConsultorId === c.consultor_id) return
    atualizarCliente(c.id, { consultor_id: novoConsultorId })
  }

  async function transferirSelecionados() {
    if (selecionados.size === 0 || !consultorTransferencia) return
    setTransferindo(true)
    const { error } = await supabase.from('carteira_cliente')
      .update({ consultor_id: consultorTransferencia }).in('id', Array.from(selecionados))
    setTransferindo(false)
    if (error) { alert('Erro ao transferir: ' + error.message); return }
    setSelecionados(new Set())
    setConsultorTransferencia('')
    fetchClientes()
  }

  async function alternarKanban(c) {
    const campos = c.no_kanban
      ? { no_kanban: false, temperatura: null, temperatura_atualizada_em: null }
      : { no_kanban: true, temperatura: 'Morno', temperatura_atualizada_em: new Date().toISOString() }
    atualizarCliente(c.id, campos)
  }

  async function atualizarCliente(id, campos) {
    setClientes(prev => prev.map(c => c.id === id ? { ...c, ...campos } : c))
    const { error } = await supabase.from('carteira_cliente').update(campos).eq('id', id)
    if (error) {
      console.error('Erro ao atualizar cliente:', error)
      alert('Não consegui salvar: ' + error.message)
      fetchClientes()
    }
  }

  function mudarStatus(c, novoStatus) {
    atualizarCliente(c.id, { status: novoStatus })
    if (STATUS_GATILHO_CHECKLIST.includes(novoStatus)) {
      setModalChecklistCliente({ ...c, status: novoStatus })
    }
  }

  async function adicionarCliente(e) {
    e.preventDefault()
    const cnpjs = [...new Set(
      novoCnpj.split(/[;\n]/).map(c => c.replace(/\D/g, '')).filter(Boolean)
    )]
    if (cnpjs.length === 0) return
    setErroCnpj('')
    setBuscandoCnpj(true)

    let criados = 0, jaExistiam = 0
    let primeiroExistenteId = null
    const novosClientes = []

    for (const cnpj of cnpjs) {
      const { data: existente } = await supabase.from('carteira_cliente').select('id, excluido_em')
        .eq('cnpj', cnpj).eq('consultor_id', consultorDestino || user.id).maybeSingle()
      if (existente && !existente.excluido_em) {
        jaExistiam++
        if (!primeiroExistenteId) primeiroExistenteId = existente.id
        continue
      }
      if (existente && existente.excluido_em) {
        await supabase.from('carteira_cliente').update({ excluido_em: null, excluido_por: null }).eq('id', existente.id)
        criados++
        continue
      }

      const { data: parque } = await supabase.from('mapa_parque_import')
        .select('*').eq('nr_cnpj', cnpj).order('importado_em', { ascending: false }).limit(1).maybeSingle()
      const potencial = parque ? calcularPotencial(parque) : null

      const { data: novo, error } = await supabase.from('carteira_cliente')
        .insert({
          cnpj, razao_social: parque?.nm_cliente, consultor_id: consultorDestino || user.id, status: 'Aguardando Atendimento',
          origem: 'Manual',
          potencial_migracao: potencial?.potencial_migracao || 0,
          potencial_bl: potencial?.potencial_bl || 0,
          potencial_ti: potencial?.potencial_ti || 0,
          potencial_voz: potencial?.potencial_voz || 0,
          credito_pre_aprovado: potencial?.credito_pre_aprovado || 0,
        })
        .select().single()

      if (!error) { criados++; novosClientes.push(novo) }
    }

    setBuscandoCnpj(false)
    setNovoCnpj('')
    if (novosClientes.length > 0) setClientes(prev => [...novosClientes, ...prev])
    fetchClientes()
    if (podeAdicionarCliente(user)) fetchLixeira()

    if (jaExistiam > 0 && criados === 0) {
      setHighlightId(primeiroExistenteId)
      setTimeout(() => setHighlightId(null), 2000)
      document.getElementById(`carteira-row-${primeiroExistenteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    setErroCnpj(cnpjs.length > 1 ? `${criados} adicionado(s), ${jaExistiam} já existia(m).` : '')
  }

  const totalClientes = clientesFiltrados.length
  const somaMigracao = clientesFiltrados.reduce((s, c) => s + (c.potencial_migracao || 0), 0)
  const somaBl = clientesFiltrados.reduce((s, c) => s + (c.potencial_bl || 0), 0)
  const somaTi = clientesFiltrados.reduce((s, c) => s + (c.potencial_ti || 0), 0)
  const somaVoz = clientesFiltrados.reduce((s, c) => s + (c.potencial_voz || 0), 0)
  const somaCredito = clientesFiltrados.reduce((s, c) => s + Number(c.credito_pre_aprovado || 0), 0)

  if (loading) return <div className="loading">Carregando carteira...</div>

  return (
    <div className="main">
      <div className="diag-stats">
        <div className="diag-stat diag-stat-neutro">
          <div className="diag-stat-valor">{totalClientes}</div>
          <div className="diag-stat-label">Clientes Recebidos</div>
        </div>
        <div className={`diag-stat diag-stat-migracao ${somaMigracao === 0 ? 'diag-stat-zero' : ''}`}>
          <div className="diag-stat-valor">{somaMigracao}</div>
          <div className="diag-stat-label">Pot. Migração</div>
        </div>
        <div className={`diag-stat diag-stat-bl ${somaBl === 0 ? 'diag-stat-zero' : ''}`}>
          <div className="diag-stat-valor">{somaBl}</div>
          <div className="diag-stat-label">Pot. BL</div>
        </div>
        <div className={`diag-stat diag-stat-ti ${somaTi === 0 ? 'diag-stat-zero' : ''}`}>
          <div className="diag-stat-valor">{somaTi}</div>
          <div className="diag-stat-label">Pot. TI</div>
        </div>
        <div className={`diag-stat diag-stat-voz ${somaVoz === 0 ? 'diag-stat-zero' : ''}`}>
          <div className="diag-stat-valor">{somaVoz}</div>
          <div className="diag-stat-label">Pot. Voz</div>
        </div>
        <div className={`diag-stat diag-stat-credito ${somaCredito === 0 ? 'diag-stat-zero' : ''}`}>
          <div className="diag-stat-valor">{fmtMoeda(somaCredito)}</div>
          <div className="diag-stat-label">Crédito Pré-aprovado</div>
        </div>
      </div>

      <div className="kanban-toolbar">
        {podeAdicionarCliente(user) && (
          <select className="filter-select" value={filtroConsultor} onChange={e => setFiltroConsultor(e.target.value)}>
            <option value="">Todos os consultores</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        )}
        {PRESETS_PERIODO.map(p => <button key={p.label} className="btn-filter-light" onClick={() => aplicarPreset(p)}>{p.label}</button>)}
        <label style={{ fontSize: 11, color: '#888' }}>De <input className="lm-input" type="date" style={{ width: 130, display: 'inline-block' }} value={filtroDataDe} onChange={e => setFiltroDataDe(e.target.value)} /></label>
        <label style={{ fontSize: 11, color: '#888' }}>Até <input className="lm-input" type="date" style={{ width: 130, display: 'inline-block' }} value={filtroDataAte} onChange={e => setFiltroDataAte(e.target.value)} /></label>
        <select className="filter-select" value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)}>
          <option value="">Todas as origens</option>
          <option value="Manual">Manual</option>
          <option value="Mailing Diário">Mailing Diário</option>
          <option value="Status Atual (Migração)">Status Atual (Migração)</option>
        </select>
        <select className="filter-select" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_OPCOES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: '#1CA89A', fontWeight: 600 }}>
          <input type="checkbox" checked={filtroRenovacaoAntecipada} onChange={e => setFiltroRenovacaoAntecipada(e.target.checked)} />
          Só renovação antecipada (M16)
        </label>
        {(filtroConsultor || filtroDataDe || filtroDataAte || filtroOrigem || filtroStatus || filtroRenovacaoAntecipada) && (
          <button className="btn-filter-light" onClick={() => { setFiltroConsultor(''); setFiltroDataDe(''); setFiltroDataAte(''); setFiltroOrigem(''); setFiltroStatus(''); setFiltroRenovacaoAntecipada(false) }}>✕ Limpar filtros</button>
        )}
      </div>

      {podeAdicionarCliente(user) && (
        <div className="kanban-toolbar">
          <input className="search-input" placeholder="CNPJ(s) separados por ; " value={novoCnpj} onChange={e => setNovoCnpj(e.target.value)} />
          <select className="filter-select" value={consultorDestino} onChange={e => setConsultorDestino(e.target.value)} title="Consultor que vai receber o(s) cliente(s)">
            <option value={user.id}>Você ({user.nome})</option>
            {staff.filter(s => s.id !== user.id).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <button className="btn-save-obs" style={{ float: 'none' }} onClick={adicionarCliente} disabled={buscandoCnpj || !novoCnpj.trim()}>
            {buscandoCnpj ? 'Adicionando...' : '+ Adicionar Cliente'}
          </button>
          {erroCnpj && <span style={{ fontSize: 11, color: '#C0451A' }}>{erroCnpj}</span>}
          <input className="search-input" placeholder="🔍 Filtrar por CNPJ..." value={filtroCnpj} onChange={e => setFiltroCnpj(e.target.value)} />
          {selecionados.size > 0 && (
            <>
              <button className="btn-action" onClick={() => flagarSelecionados(true)}>🚩 Adicionar {selecionados.size} ao Kanban</button>
              <button className="btn-action" onClick={() => flagarSelecionados(false)}>Tirar {selecionados.size} do Kanban</button>
              <select className="filter-select" value={consultorTransferencia} onChange={e => setConsultorTransferencia(e.target.value)}>
                <option value="">Transferir para...</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <button className="btn-action" onClick={transferirSelecionados} disabled={!consultorTransferencia || transferindo}>
                {transferindo ? 'Transferindo...' : `↔ Transferir ${selecionados.size}`}
              </button>
              <button className="btn-action" style={{ color: '#C0451A', borderColor: '#F5C6C6' }} onClick={removerSelecionados} disabled={removendo}>
                {removendo ? 'Removendo...' : `🗑 Remover ${selecionados.size} selecionado(s)`}
              </button>
            </>
          )}
          <button className="btn-filter-light" onClick={exportarXlsx}>⬇ Exportar</button>
          <button className="btn-filter-light" onClick={() => setMostrarLixeira(true)}>🗑 Lixeira{lixeira.length > 0 && ` (${lixeira.length})`}</button>
          <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>{clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? 's' : ''}</span>
        </div>
      )}
      {!podeAdicionarCliente(user) && (
        <div className="kanban-toolbar">
          <input className="search-input" placeholder="🔍 Filtrar por CNPJ..." value={filtroCnpj} onChange={e => setFiltroCnpj(e.target.value)} />
          <button className="btn-filter-light" onClick={exportarXlsx}>⬇ Exportar</button>
          <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>{clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      <div className="carteira-table-wrap">
        <table className="carteira-table carteira-table-sticky">
          <thead>
            <tr>
              {podeAdicionarCliente(user) && (
                <th className="col-sticky"><input type="checkbox" checked={selecionados.size > 0 && selecionados.size === clientesFiltrados.length} onChange={alternarSelecionarTodos} /></th>
              )}
              <th className={`col-ordenavel ${podeAdicionarCliente(user) ? '' : 'col-sticky'}`} onClick={() => pedirOrdenar('status')}>Status{setaOrdenacao('status')}</th>
              <th>Interações</th>
              <th>Kanban</th>
              <th className="col-ordenavel" onClick={() => pedirOrdenar('cnpj')}>CNPJ{setaOrdenacao('cnpj')}</th>
              <th>Editar</th>
              <th className="col-ordenavel" onClick={() => pedirOrdenar('razao_social')}>Razão Social{setaOrdenacao('razao_social')}</th>
              <th>Contato</th>
              {podeAdicionarCliente(user) && <th>Consultor</th>}
              <th className="col-ordenavel" onClick={() => pedirOrdenar('potencial_migracao')}>Pot. Migração{setaOrdenacao('potencial_migracao')}</th>
              <th className="col-ordenavel" onClick={() => pedirOrdenar('potencial_bl')}>Pot. BL{setaOrdenacao('potencial_bl')}</th>
              <th className="col-ordenavel" onClick={() => pedirOrdenar('potencial_ti')}>Pot. TI{setaOrdenacao('potencial_ti')}</th>
              <th className="col-ordenavel" onClick={() => pedirOrdenar('potencial_voz')}>Pot. Voz{setaOrdenacao('potencial_voz')}</th>
              <th className="col-ordenavel" onClick={() => pedirOrdenar('credito_pre_aprovado')}>Crédito Pré-aprovado{setaOrdenacao('credito_pre_aprovado')}</th>
              <th>Produtos Vendidos</th>
              <th>Checklist</th>
              <th className="col-ordenavel" onClick={() => pedirOrdenar('data_venda')}>Data Venda{setaOrdenacao('data_venda')}</th>
              {podeAdicionarCliente(user) && <th>Remover</th>}
            </tr>
          </thead>
          <tbody>
            {clientesOrdenados.length === 0 && (
              <tr><td colSpan={18} className="empty">Nenhum cliente na carteira</td></tr>
            )}
            {clientesOrdenados.map(c => (
              <tr key={c.id} id={`carteira-row-${c.id}`}
                className={`${highlightId === c.id ? 'row-highlight' : ''} ${pendente(c) ? 'row-pendente' : ''} ${c.alerta_renovacao ? 'row-renovacao-antecipada' : ''}`}>
                {podeAdicionarCliente(user) && (
                  <td className="col-sticky"><input type="checkbox" checked={selecionados.has(c.id)} onChange={() => alternarSelecao(c.id)} /></td>
                )}
                <td className={podeAdicionarCliente(user) ? '' : 'col-sticky'}>
                  <select className="filter-select" value={c.status || 'Aguardando Atendimento'}
                    onChange={e => mudarStatus(c, e.target.value)}>
                    {STATUS_OPCOES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td>
                  <button className="btn-action" onClick={() => setModalInteracaoCliente(c)}>{resumoInteracao(c.id)}</button>
                </td>
                <td>
                  <button className={`btn-action ${c.no_kanban ? 'flag-ativo' : ''}`} onClick={() => alternarKanban(c)}>
                    {c.no_kanban ? `🚩 ${c.temperatura}` : '➤ Enviar ao Kanban'}
                  </button>
                </td>
                <td>{c.cnpj}</td>
                <td>
                  <button type="button" className="btn-action"
                    onClick={() => setEditandoRazaoSocialId(prev => prev === c.id ? null : c.id)}>
                    {editandoRazaoSocialId === c.id ? 'Cancelar' : 'Editar'}
                  </button>
                </td>
                <td>
                  {editandoRazaoSocialId === c.id ? (
                    <input className="lm-input" style={{ width: 220 }} autoFocus defaultValue={c.razao_social || ''}
                      placeholder="Preencher razão social..."
                      onBlur={e => {
                        if (e.target.value !== (c.razao_social || '')) atualizarCliente(c.id, { razao_social: e.target.value.trim() || null })
                        setEditandoRazaoSocialId(null)
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
                  ) : (
                    <>
                      <span className="razao-social-truncada" title={c.razao_social || ''}>{c.razao_social || '—'}</span>
                      {c.alerta_renovacao && <span className="badge-renovacao-antecipada" title="Renovação antecipada — M16 → M17">M16→M17</span>}
                    </>
                  )}
                </td>
                <td>
                  {c.contato ? c.contato.split(' · ').map((linha, i) => <div key={i}>{linha}</div>) : '—'}
                </td>
                {podeAdicionarCliente(user) && (
                  <td>
                    <select className="filter-select" value={c.consultor_id || ''} onChange={e => transferirCliente(c, e.target.value)}>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                  </td>
                )}
                <td>{c.potencial_migracao || 0}</td>
                <td>{c.potencial_bl || 0}</td>
                <td>{c.potencial_ti || 0}</td>
                <td>{c.potencial_voz || 0}</td>
                <td>{fmtMoeda(c.credito_pre_aprovado)}</td>
                <td>
                  <button className="btn-action" onClick={() => setModalCliente(c)}>
                    {resumoVenda(c.id) || '+ Adicionar'}
                  </button>
                </td>
                <td>
                  <button className="btn-action" onClick={() => setModalChecklistCliente(c)}>{resumoChecklist(c.id)}</button>
                </td>
                <td>
                  <input className="lm-input" type="date" defaultValue={c.data_venda || ''}
                    onBlur={e => atualizarCliente(c.id, { data_venda: e.target.value || null })} />
                </td>
                {podeAdicionarCliente(user) && (
                  <td><button className="btn-action" style={{ color: '#C0451A', borderColor: '#F5C6C6' }} onClick={() => removerCliente(c.id)}>🗑</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalCliente && (
        <VendaItensModal cliente={modalCliente} onClose={() => setModalCliente(null)} onSaved={fetchVendaItens} />
      )}
      {modalInteracaoCliente && (
        <InteracaoCarteiraModal cliente={modalInteracaoCliente} user={user}
          onClose={() => setModalInteracaoCliente(null)} onSaved={fetchInteracoes} />
      )}
      {modalChecklistCliente && (
        <VendaChecklistModal cliente={modalChecklistCliente} user={user}
          onClose={() => setModalChecklistCliente(null)}
          onConcluido={() => { setModalChecklistCliente(null); fetchChecklists() }} />
      )}
      {mostrarLixeira && (
        <div className="modal-overlay" onClick={() => setMostrarLixeira(false)}>
          <div className="lead-modal" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
            <div className="lm-header">
              <div className="lm-header-left">
                <div style={{ fontSize: 17, fontWeight: 700 }}>Lixeira</div>
              </div>
              <button className="lm-close" onClick={() => setMostrarLixeira(false)}>✕</button>
            </div>
            <div className="lm-body">
              {lixeira.length === 0 && <div className="empty">Nenhum cliente removido</div>}
              {lixeira.map(c => (
                <div key={c.id} className="sino-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{c.razao_social || c.cnpj}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {c.cnpj} · removido em {new Date(c.excluido_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button className="btn-action" onClick={() => restaurarCliente(c.id)}>↩ Restaurar</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import VendaItensModal from './VendaItensModal'
import InteracaoCarteiraModal from './InteracaoCarteiraModal'
import { calcularPotencial } from './potencialLogic'

const STATUS_OPCOES = [
  'Aguardando Aceite', 'Cliente Cancelou', 'Cliente Já Renovado', 'CNPJ Baixado',
  'Débito Interno', 'Já Possui Consultor', 'Não Contatar', 'Não Possui Recomendação',
  'Pedido Finalizado', 'Proposta Enviada', 'Retornar', 'Sem Contato Efetivo',
  'Sem Interesse', 'Sem Viabilidade', 'Venda Realizada',
]
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

export default function PotencialCarteira({ user }) {
  const [clientes, setClientes] = useState([])
  const [staff, setStaff] = useState([])
  const [filtroConsultor, setFiltroConsultor] = useState('')
  const [filtroDataDe, setFiltroDataDe] = useState('')
  const [filtroDataAte, setFiltroDataAte] = useState('')
  const [loading, setLoading] = useState(true)
  const [novoCnpj, setNovoCnpj] = useState('')
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [erroCnpj, setErroCnpj] = useState('')
  const [highlightId, setHighlightId] = useState(null)
  const [vendaItensPorCliente, setVendaItensPorCliente] = useState({})
  const [interacoesPorCliente, setInteracoesPorCliente] = useState({})
  const [modalCliente, setModalCliente] = useState(null)
  const [modalInteracaoCliente, setModalInteracaoCliente] = useState(null)
  const [filtroCnpj, setFiltroCnpj] = useState('')
  const [selecionados, setSelecionados] = useState(new Set())
  const [removendo, setRemovendo] = useState(false)
  const [ordenacao, setOrdenacao] = useState({ campo: null, direcao: 'asc' })

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('carteira_cliente').select('*').order('razao_social', { ascending: true })
    if (!error && data) setClientes(data)
    setLoading(false)
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

  useEffect(() => { fetchClientes(); fetchVendaItens(); fetchInteracoes() }, [fetchClientes, fetchVendaItens, fetchInteracoes])

  useEffect(() => {
    if (isGestor(user)) supabase.from('consultores_staff').select('id, nome').order('nome').then(({ data }) => setStaff(data || []))
  }, [user])

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
    if (isGestor(user) && filtroConsultor && c.consultor_id !== filtroConsultor) return false
    if (filtroDataDe && (!c.data_adicao || c.data_adicao < filtroDataDe)) return false
    if (filtroDataAte && (!c.data_adicao || c.data_adicao > filtroDataAte)) return false
    if (filtroCnpj && !c.cnpj.includes(filtroCnpj.replace(/\D/g, ''))) return false
    return true
  })

  function pendente(c) {
    return c.status === 'Aguardando Aceite' && (interacoesPorCliente[c.id] || []).length === 0
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
    if (!window.confirm('Remover este cliente da carteira? Interações e produtos vendidos registrados também serão apagados.')) return
    const { error } = await supabase.from('carteira_cliente').delete().eq('id', id)
    if (error) { console.error('Erro ao remover:', error); alert('Erro ao remover: ' + error.message); return }
    setSelecionados(prev => { const n = new Set(prev); n.delete(id); return n })
    fetchClientes()
  }

  async function removerSelecionados() {
    if (selecionados.size === 0) return
    if (!window.confirm(`Remover ${selecionados.size} cliente(s) selecionado(s) da carteira? Isso não pode ser desfeito.`)) return
    setRemovendo(true)
    const { error } = await supabase.from('carteira_cliente').delete().in('id', Array.from(selecionados))
    setRemovendo(false)
    if (error) { console.error('Erro ao remover:', error); alert('Erro ao remover: ' + error.message); return }
    setSelecionados(new Set())
    fetchClientes()
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

  async function alternarKanban(c) {
    const campos = c.no_kanban
      ? { no_kanban: false, temperatura: null, temperatura_atualizada_em: null }
      : { no_kanban: true, temperatura: 'Morno', temperatura_atualizada_em: new Date().toISOString() }
    atualizarCliente(c.id, campos)
  }

  async function atualizarCliente(id, campos) {
    setClientes(prev => prev.map(c => c.id === id ? { ...c, ...campos } : c))
    const { error } = await supabase.from('carteira_cliente').update(campos).eq('id', id)
    if (error) { console.error('Erro ao atualizar cliente:', error); fetchClientes() }
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
      const { data: existente } = await supabase.from('carteira_cliente').select('id').eq('cnpj', cnpj).eq('consultor_id', user.id).maybeSingle()
      if (existente) {
        jaExistiam++
        if (!primeiroExistenteId) primeiroExistenteId = existente.id
        continue
      }

      const { data: parque } = await supabase.from('mapa_parque_import')
        .select('*').eq('nr_cnpj', cnpj).order('importado_em', { ascending: false }).limit(1).maybeSingle()
      const potencial = parque ? calcularPotencial(parque) : null

      const { data: novo, error } = await supabase.from('carteira_cliente')
        .insert({
          cnpj, razao_social: parque?.nm_cliente, consultor_id: user.id, status: 'Aguardando Aceite',
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
        {isGestor(user) && (
          <select className="filter-select" value={filtroConsultor} onChange={e => setFiltroConsultor(e.target.value)}>
            <option value="">Todos os consultores</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        )}
        {PRESETS_PERIODO.map(p => <button key={p.label} className="btn-filter-light" onClick={() => aplicarPreset(p)}>{p.label}</button>)}
        <label style={{ fontSize: 11, color: '#888' }}>De <input className="lm-input" type="date" style={{ width: 130, display: 'inline-block' }} value={filtroDataDe} onChange={e => setFiltroDataDe(e.target.value)} /></label>
        <label style={{ fontSize: 11, color: '#888' }}>Até <input className="lm-input" type="date" style={{ width: 130, display: 'inline-block' }} value={filtroDataAte} onChange={e => setFiltroDataAte(e.target.value)} /></label>
        {(filtroConsultor || filtroDataDe || filtroDataAte) && (
          <button className="btn-filter-light" onClick={() => { setFiltroConsultor(''); setFiltroDataDe(''); setFiltroDataAte('') }}>✕ Limpar filtros</button>
        )}
      </div>

      {podeAdicionarCliente(user) && (
        <div className="kanban-toolbar">
          <input className="search-input" placeholder="CNPJ(s) separados por ; " value={novoCnpj} onChange={e => setNovoCnpj(e.target.value)} />
          <button className="btn-save-obs" style={{ float: 'none' }} onClick={adicionarCliente} disabled={buscandoCnpj || !novoCnpj.trim()}>
            {buscandoCnpj ? 'Adicionando...' : '+ Adicionar Cliente'}
          </button>
          {erroCnpj && <span style={{ fontSize: 11, color: '#C0451A' }}>{erroCnpj}</span>}
          <input className="search-input" placeholder="🔍 Filtrar por CNPJ..." value={filtroCnpj} onChange={e => setFiltroCnpj(e.target.value)} />
          {selecionados.size > 0 && (
            <>
              <button className="btn-action" onClick={() => flagarSelecionados(true)}>🚩 Adicionar {selecionados.size} ao Kanban</button>
              <button className="btn-action" onClick={() => flagarSelecionados(false)}>Tirar {selecionados.size} do Kanban</button>
              <button className="btn-action" style={{ color: '#C0451A', borderColor: '#F5C6C6' }} onClick={removerSelecionados} disabled={removendo}>
                {removendo ? 'Removendo...' : `🗑 Remover ${selecionados.size} selecionado(s)`}
              </button>
            </>
          )}
          <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>{clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? 's' : ''}</span>
        </div>
      )}
      {!podeAdicionarCliente(user) && (
        <div className="kanban-toolbar">
          <input className="search-input" placeholder="🔍 Filtrar por CNPJ..." value={filtroCnpj} onChange={e => setFiltroCnpj(e.target.value)} />
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
              <th className="col-ordenavel" onClick={() => pedirOrdenar('razao_social')}>Razão Social{setaOrdenacao('razao_social')}</th>
              <th>Contato</th>
              {isGestor(user) && <th>Consultor</th>}
              <th className="col-ordenavel" onClick={() => pedirOrdenar('potencial_migracao')}>Pot. Migração{setaOrdenacao('potencial_migracao')}</th>
              <th className="col-ordenavel" onClick={() => pedirOrdenar('potencial_bl')}>Pot. BL{setaOrdenacao('potencial_bl')}</th>
              <th className="col-ordenavel" onClick={() => pedirOrdenar('potencial_ti')}>Pot. TI{setaOrdenacao('potencial_ti')}</th>
              <th className="col-ordenavel" onClick={() => pedirOrdenar('potencial_voz')}>Pot. Voz{setaOrdenacao('potencial_voz')}</th>
              <th className="col-ordenavel" onClick={() => pedirOrdenar('credito_pre_aprovado')}>Crédito Pré-aprovado{setaOrdenacao('credito_pre_aprovado')}</th>
              <th>Produtos Vendidos</th>
              <th className="col-ordenavel" onClick={() => pedirOrdenar('data_venda')}>Data Venda{setaOrdenacao('data_venda')}</th>
              {podeAdicionarCliente(user) && <th>Remover</th>}
            </tr>
          </thead>
          <tbody>
            {clientesOrdenados.length === 0 && (
              <tr><td colSpan={16} className="empty">Nenhum cliente na carteira</td></tr>
            )}
            {clientesOrdenados.map(c => (
              <tr key={c.id} id={`carteira-row-${c.id}`}
                className={`${highlightId === c.id ? 'row-highlight' : ''} ${pendente(c) ? 'row-pendente' : ''}`}>
                {podeAdicionarCliente(user) && (
                  <td className="col-sticky"><input type="checkbox" checked={selecionados.has(c.id)} onChange={() => alternarSelecao(c.id)} /></td>
                )}
                <td className={podeAdicionarCliente(user) ? '' : 'col-sticky'}>
                  <select className="filter-select" value={c.status || 'Aguardando Aceite'}
                    onChange={e => atualizarCliente(c.id, { status: e.target.value })}>
                    {STATUS_OPCOES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td>
                  <button className="btn-action" onClick={() => setModalInteracaoCliente(c)}>{resumoInteracao(c.id)}</button>
                </td>
                <td>
                  <button className={`btn-action ${c.no_kanban ? 'flag-ativo' : ''}`} onClick={() => alternarKanban(c)}>
                    {c.no_kanban ? `🚩 ${c.temperatura}` : '🚩 Flagar'}
                  </button>
                </td>
                <td>{c.cnpj}</td>
                <td>{c.razao_social || '—'}</td>
                <td>
                  {c.contato ? c.contato.split(' · ').map((linha, i) => <div key={i}>{linha}</div>) : '—'}
                </td>
                {isGestor(user) && <td>{nomeConsultor(c.consultor_id)}</td>}
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
    </div>
  )
}

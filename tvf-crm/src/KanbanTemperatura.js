import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, fetchPaginado } from './supabaseClient'
import KanbanClienteModal from './KanbanClienteModal'

const COLUNAS = [
  { key: 'Frio', cor: '#378ADD', limiteDias: 7 },
  { key: 'Morno', cor: '#EF9F27', limiteDias: 5 },
  { key: 'Quente', cor: '#E05C2A', limiteDias: 2 },
  { key: 'Descartado', cor: '#888', limiteDias: null },
]

function fmtMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function diasParado(cliente) {
  if (!cliente.temperatura_atualizada_em) return 0
  return Math.floor((new Date() - new Date(cliente.temperatura_atualizada_em)) / 86400000)
}

const isGestor = (user) => user.perfil === 'Gestor'

export default function KanbanTemperatura({ user }) {
  const [clientes, setClientes] = useState([])
  const [staff, setStaff] = useState([])
  const [filtroConsultor, setFiltroConsultor] = useState('')
  const [loading, setLoading] = useState(true)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [modalCliente, setModalCliente] = useState(null)
  const draggingCliente = useRef(null)
  const dragMoveu = useRef(false)

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    const { data } = await fetchPaginado((de, ate) => supabase.from('carteira_cliente').select('*')
      .eq('no_kanban', true).is('excluido_em', null).order('razao_social').range(de, ate))
    setClientes(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  useEffect(() => {
    if (isGestor(user)) supabase.from('consultores_staff').select('id, nome').order('nome').then(({ data }) => setStaff(data || []))
  }, [user])

  const nomeConsultor = (id) => staff.find(s => s.id === id)?.nome || '—'

  const clientesFiltrados = clientes.filter(c => {
    if (isGestor(user) && filtroConsultor && c.consultor_id !== filtroConsultor) return false
    return true
  })

  // Descartado não entra na soma de potencial — não faz sentido gerar expectativa
  // em cima de cliente que não vai mais ser trabalhado.
  const clientesComPotencial = clientesFiltrados.filter(c => c.temperatura !== 'Descartado')
  const somaMigracao = clientesComPotencial.reduce((s, c) => s + (c.potencial_migracao || 0), 0)
  const somaBl = clientesComPotencial.reduce((s, c) => s + (c.potencial_bl || 0), 0)
  const somaTi = clientesComPotencial.reduce((s, c) => s + (c.potencial_ti || 0), 0)
  const somaVoz = clientesComPotencial.reduce((s, c) => s + (c.potencial_voz || 0), 0)
  const somaCredito = clientesComPotencial.reduce((s, c) => s + Number(c.credito_pre_aprovado || 0), 0)

  function handleDragStart(c) { draggingCliente.current = c; setDraggingId(c.id); dragMoveu.current = true }
  function handleDragEnd() { draggingCliente.current = null; setDraggingId(null); setDragOver(null); setTimeout(() => { dragMoveu.current = false }, 100) }

  async function handleDrop(temperatura) {
    const c = draggingCliente.current
    if (!c) return
    if (c.temperatura !== temperatura) {
      const agora = new Date().toISOString()
      setClientes(prev => prev.map(x => x.id === c.id ? { ...x, temperatura, temperatura_atualizada_em: agora } : x))
      await supabase.from('carteira_cliente').update({ temperatura, temperatura_atualizada_em: agora }).eq('id', c.id)
    }
    handleDragEnd()
  }

  if (loading) return <div className="loading">Carregando Kanban...</div>

  return (
    <div className="main">
      <div className="diag-stats">
        <div className="diag-stat diag-stat-neutro">
          <div className="diag-stat-valor">{clientesFiltrados.length}</div>
          <div className="diag-stat-label">Clientes no Kanban</div>
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

      {isGestor(user) && (
        <div className="kanban-toolbar" style={{ marginBottom: 16 }}>
          <select className="filter-select" value={filtroConsultor} onChange={e => setFiltroConsultor(e.target.value)}>
            <option value="">Todos os consultores</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
      )}

      <div className="board">
        {COLUNAS.map(col => {
          const clientesColuna = clientesFiltrados.filter(c => c.temperatura === col.key)
          return (
            <div key={col.key} className={`column${dragOver === col.key ? ' drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(col.key) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => { e.preventDefault(); handleDrop(col.key) }}>
              <div className="col-header">
                <div className="col-title-wrap">
                  <div className="col-dot" style={{ background: col.cor }} />
                  <span className="col-title">{col.key}</span>
                  {col.limiteDias && <span style={{ fontSize: 10, color: '#bbb' }}>(prazo {col.limiteDias}d)</span>}
                </div>
                <span className="col-count">{clientesColuna.length}</span>
              </div>
              {clientesColuna.length === 0 && (
                <div className={`empty${dragOver === col.key ? ' drop-hint' : ''}`}>{dragOver === col.key ? 'Solte aqui' : 'Nenhum cliente'}</div>
              )}
              {clientesColuna.map(c => {
                const dias = diasParado(c)
                const estourado = col.limiteDias && dias > col.limiteDias
                return (
                  <div key={c.id}
                    className={`card draggable${draggingId === c.id ? ' dragging' : ''}`}
                    style={estourado
                      ? { borderColor: '#E03434', boxShadow: '0 0 0 1px rgba(224,52,52,0.3)' }
                      : c.alerta_renovacao ? { borderColor: '#1CA89A', boxShadow: '0 0 0 1px rgba(28,168,154,0.3)' } : {}}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; handleDragStart(c) }}
                    onDragEnd={handleDragEnd}
                    onClick={() => { if (!dragMoveu.current) setModalCliente(c) }}>
                    <div className="card-top">
                      <div className="card-name">{c.razao_social || c.cnpj}</div>
                      {estourado && <span className="score-badge score-low" style={{ background: 'rgba(224,52,52,0.12)', color: '#E03434' }}>⏰ {dias}d</span>}
                      {!estourado && c.alerta_renovacao && <span className="score-badge" style={{ background: 'rgba(28,168,154,0.12)', color: '#1CA89A' }}>M16 → Renovação</span>}
                    </div>
                    <div className="card-phone">{c.cnpj}</div>
                    <div className="card-tags">
                      <span className="tag">{c.status}</span>
                    </div>
                    <div className="card-footer">
                      <span className="card-cep">{isGestor(user) ? nomeConsultor(c.consultor_id) : `${dias}d nessa etapa`}</span>
                      <span className="card-date">{fmtMoeda(c.credito_pre_aprovado)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {modalCliente && (
        <KanbanClienteModal cliente={modalCliente} user={user} nomeConsultor={isGestor(user) ? nomeConsultor(modalCliente.consultor_id) : null}
          onClose={() => setModalCliente(null)} onSaved={fetchClientes} />
      )}
    </div>
  )
}

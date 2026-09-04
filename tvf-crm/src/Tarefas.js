import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'

const PRIORIDADE_INFO = {
  alta: { label: 'Alta', cor: 'var(--vermelho)' },
  media: { label: 'Média', cor: 'var(--laranja)' },
  baixa: { label: 'Baixa', cor: 'var(--azul)' },
}
const ORIGEM_LABEL = { manual: 'Atribuída', individual: 'IA — individual', coletivo: 'IA — coletivo', recorrente: 'Recorrente' }
const DIAS_SEMANA = [
  { valor: 1, label: 'Seg' }, { valor: 2, label: 'Ter' }, { valor: 3, label: 'Qua' },
  { valor: 4, label: 'Qui' }, { valor: 5, label: 'Sex' }, { valor: 6, label: 'Sáb' }, { valor: 0, label: 'Dom' },
]

function fmtDataBR(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const isGestor = (user) => user.perfil === 'Gestor'

// Hierarquia de criação: Gestor cria pra qualquer um; Supervisor cria pra si e pro próprio
// time (consultores_staff.supervisor_id); Consultor só cria pra si mesmo. Espelha exatamente
// a policy "hierarquia_cria_tarefa"/"hierarquia_cria_recorrente" da migration — front só
// filtra a lista de destinatários possíveis, quem garante de verdade é a RLS.
export default function Tarefas({ user }) {
  const [staff, setStaff] = useState([])
  const [tarefas, setTarefas] = useState([])
  const [recorrentes, setRecorrentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [consultorId, setConsultorId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prazo, setPrazo] = useState('')
  const [prioridade, setPrioridade] = useState('media')
  const [repetir, setRepetir] = useState(false)
  const [diasSemana, setDiasSemana] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState('pendentes')

  const carregar = useCallback(async () => {
    setLoading(true)
    const [{ data: staffData }, { data: tarefasData }, { data: recorrentesData }] = await Promise.all([
      supabase.from('consultores_staff').select('id, nome, perfil, supervisor_id').order('nome'),
      supabase.from('tarefa_consultor').select('*').order('prazo', { ascending: true, nullsFirst: false }).order('gerado_em', { ascending: false }),
      supabase.from('tarefa_recorrente').select('*').eq('ativo', true).order('criado_em', { ascending: false }),
    ])
    setStaff(staffData || [])
    setTarefas(tarefasData || [])
    setRecorrentes(recorrentesData || [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const nomeConsultor = (id) => staff.find(s => s.id === id)?.nome || '—'

  // destinatários possíveis pro select do formulário — mesma regra da RLS, só que calculada
  // no front pra não mostrar opção que vai dar erro ao salvar
  const destinatarios = isGestor(user)
    ? staff
    : staff.filter(s => s.id === user.id || s.supervisor_id === user.id)

  function alternarDia(valor) {
    setDiasSemana(prev => prev.includes(valor) ? prev.filter(d => d !== valor) : [...prev, valor])
  }

  async function criarTarefa(e) {
    e.preventDefault()
    if (!consultorId || !descricao.trim()) return
    if (repetir && diasSemana.length === 0) { alert('Marca pelo menos um dia da semana pra repetir.'); return }
    setSalvando(true)
    const { error } = repetir
      ? await supabase.from('tarefa_recorrente').insert({
          consultor_id: consultorId, descricao: descricao.trim(), prioridade,
          dias_semana: diasSemana, criado_por: user.id,
        })
      : await supabase.from('tarefa_consultor').insert({
          consultor_id: consultorId, descricao: descricao.trim(), origem: 'manual',
          prazo: prazo || null, prioridade, gerado_por: user.id,
        })
    setSalvando(false)
    if (error) { alert('Erro ao criar tarefa: ' + error.message); return }
    setDescricao(''); setPrazo(''); setPrioridade('media'); setRepetir(false); setDiasSemana([])
    carregar()
  }

  async function concluir(id, concluido) {
    setTarefas(prev => prev.map(t => t.id === id ? { ...t, concluido, concluido_em: concluido ? new Date().toISOString() : null } : t))
    await supabase.from('tarefa_consultor')
      .update({ concluido, concluido_em: concluido ? new Date().toISOString() : null }).eq('id', id)
  }

  async function desativarRecorrente(id) {
    if (!window.confirm('Parar de repetir essa tarefa? As instâncias já geradas continuam existindo.')) return
    setRecorrentes(prev => prev.filter(r => r.id !== id))
    await supabase.from('tarefa_recorrente').update({ ativo: false }).eq('id', id)
  }

  if (loading) return <div className="loading">Carregando tarefas...</div>

  const hoje = new Date().toISOString().slice(0, 10)
  const tarefasFiltradas = tarefas.filter(t => {
    if (filtroStatus === 'pendentes') return !t.concluido
    if (filtroStatus === 'concluidas') return t.concluido
    return true
  })

  return (
    <div className="main">
      <div className="dash-section-title">Tarefas</div>
      <div className="lm-resumo" style={{ marginBottom: 16 }}>
        Gestor cria pra qualquer um; Supervisor cria pra si e pro próprio time; Consultor só pra
        si mesmo. Quem recebe também vê e conclui em Rotina Diária.
      </div>

      <div className="importar-conteudo" style={{ marginBottom: 20 }}>
        <form onSubmit={criarTarefa} className="lm-grid-2">
          <div className="lm-field-edit">
            <label>Pra quem</label>
            <select className="filter-select" style={{ width: '100%' }} value={consultorId} onChange={e => setConsultorId(e.target.value)} required>
              <option value="">Selecione...</option>
              {destinatarios.map(s => <option key={s.id} value={s.id}>{s.nome}{s.id === user.id ? ' (eu)' : ''}</option>)}
            </select>
          </div>
          <div className="lm-field-edit">
            <label>Prioridade</label>
            <select className="filter-select" style={{ width: '100%' }} value={prioridade} onChange={e => setPrioridade(e.target.value)}>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
            </select>
          </div>
          <div className="lm-field-edit" style={{ gridColumn: '1 / -1' }}>
            <label>Tarefa</label>
            <textarea className="obs-area" style={{ width: '100%', minHeight: 60 }}
              placeholder='Ex: "Cobrar aceite do cliente X, pedido parado há 3 dias" ou "Distribuir os 12 clientes novos do mailing de hoje"'
              value={descricao} onChange={e => setDescricao(e.target.value)} required />
          </div>

          <div className="lm-field-edit" style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', textTransform: 'none', fontSize: 13, color: 'var(--text-1)' }}>
              <input type="checkbox" checked={repetir} onChange={e => setRepetir(e.target.checked)} />
              Repetir semanalmente (em vez de prazo único)
            </label>
          </div>

          {repetir ? (
            <div className="lm-field-edit" style={{ gridColumn: '1 / -1' }}>
              <label>Em quais dias</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DIAS_SEMANA.map(d => (
                  <button key={d.valor} type="button"
                    className={`btn-filter-light ${diasSemana.includes(d.valor) ? 'active' : ''}`}
                    onClick={() => alternarDia(d.valor)}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="lm-field-edit">
              <label>Prazo (opcional)</label>
              <input className="lm-input" type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-end', gridColumn: repetir ? '1 / -1' : 'auto' }}>
            <button className="btn-save-obs" style={{ float: 'none', margin: 0, width: '100%' }} type="submit" disabled={salvando}>
              {salvando ? 'Criando...' : repetir ? '+ Criar tarefa recorrente' : '+ Criar tarefa'}
            </button>
          </div>
        </form>
      </div>

      {recorrentes.length > 0 && (
        <>
          <div className="dash-section-title">Tarefas recorrentes ativas</div>
          <div className="carteira-table-wrap" style={{ marginBottom: 20 }}>
            <table className="carteira-table">
              <thead><tr><th>Consultor</th><th>Tarefa</th><th>Dias</th><th>Prioridade</th><th></th></tr></thead>
              <tbody>
                {recorrentes.map(r => (
                  <tr key={r.id}>
                    <td>{nomeConsultor(r.consultor_id)}</td>
                    <td style={{ maxWidth: 360, whiteSpace: 'normal' }}>{r.descricao}</td>
                    <td>{DIAS_SEMANA.filter(d => r.dias_semana.includes(d.valor)).map(d => d.label).join(', ')}</td>
                    <td><span className="plano-semaforo" style={{ background: PRIORIDADE_INFO[r.prioridade]?.cor || '#999' }}>{PRIORIDADE_INFO[r.prioridade]?.label || r.prioridade}</span></td>
                    <td><button className="btn-action" onClick={() => desativarRecorrente(r.id)}>Parar de repetir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="kanban-toolbar" style={{ marginBottom: 12 }}>
        <button className={`btn-filter-light ${filtroStatus === 'pendentes' ? 'active' : ''}`} onClick={() => setFiltroStatus('pendentes')}>Pendentes</button>
        <button className={`btn-filter-light ${filtroStatus === 'concluidas' ? 'active' : ''}`} onClick={() => setFiltroStatus('concluidas')}>Concluídas</button>
        <button className={`btn-filter-light ${filtroStatus === 'todas' ? 'active' : ''}`} onClick={() => setFiltroStatus('todas')}>Todas</button>
      </div>

      <div className="carteira-table-wrap">
        <table className="carteira-table">
          <thead><tr><th>Consultor</th><th>Tarefa</th><th>Origem</th><th>Prioridade</th><th>Prazo</th><th>Status</th></tr></thead>
          <tbody>
            {tarefasFiltradas.length === 0 && <tr><td colSpan={6} className="empty">Nenhuma tarefa</td></tr>}
            {tarefasFiltradas.map(t => {
              const prazoVencido = t.prazo && !t.concluido && t.prazo < hoje
              return (
                <tr key={t.id} className={prazoVencido ? 'row-pendente' : ''}>
                  <td>{nomeConsultor(t.consultor_id)}</td>
                  <td style={{ maxWidth: 360, whiteSpace: 'normal' }}>{t.descricao}</td>
                  <td>{ORIGEM_LABEL[t.origem] || t.origem}</td>
                  <td><span className="plano-semaforo" style={{ background: PRIORIDADE_INFO[t.prioridade]?.cor || '#999' }}>{PRIORIDADE_INFO[t.prioridade]?.label || t.prioridade}</span></td>
                  <td>{fmtDataBR(t.prazo) || '—'}{prazoVencido && ' ⏰'}</td>
                  <td>
                    {t.concluido
                      ? <span style={{ color: 'var(--verde)' }}>✅ Concluída</span>
                      : <span style={{ color: 'var(--text-3)' }}>⏳ Pendente</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

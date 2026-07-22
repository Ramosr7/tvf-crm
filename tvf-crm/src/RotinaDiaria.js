import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'

const CAMPOS = [
  { key: 'clientes_recebidos', label: 'Clientes Recebidos', meta: '15 a 20/dia', min: 15, max: 20 },
  { key: 'retornos', label: 'Retornos', meta: '10 a 15/dia', min: 10, max: 15 },
  { key: 'visitas_agendadas', label: 'Visitas (ligações agendadas)', meta: '5 a 10/dia', min: 5, max: 10 },
  { key: 'ag_aceite', label: 'Ag. Aceite', meta: '5/dia', min: 5, max: 5 },
  { key: 'altas', label: 'Altas', meta: '2 a 3/dia', min: 2, max: 3 },
  { key: 'bl', label: 'Banda Larga', meta: '1 a cada 2 dias', min: 1, max: 1 },
  { key: 'renovacao_movel', label: 'Renovação Móvel', meta: '4 a 10', min: 4, max: 10 },
  { key: 'aparelho_valor', label: 'Aparelho (R$)', meta: 'R$1.000/dia', min: 1000, max: 1000, moeda: true },
]

function dataISO(d) { return d.toISOString().slice(0, 10) }
function formatDataBR(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}`
}

const isGestor = (user) => user.perfil === 'Gestor' || user.perfil === 'Supervisor'

function corMeta(campo, valor) {
  if (campo.min == null) return ''
  const v = Number(valor) || 0
  if (v < campo.min) return 'meta-abaixo'
  if (v > campo.max) return 'meta-acima'
  return 'meta-dentro'
}

function formatarMoeda(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function CampoMoeda({ valor, onChange, className }) {
  function handleChange(e) {
    const digitos = e.target.value.replace(/\D/g, '')
    onChange(digitos ? parseInt(digitos, 10) / 100 : 0)
  }
  return (
    <input className={className} inputMode="numeric" value={formatarMoeda(valor)} onChange={handleChange} />
  )
}

export default function RotinaDiaria({ user }) {
  const hoje = dataISO(new Date())
  const [dataSelecionada, setDataSelecionada] = useState(hoje)
  const [campos, setCampos] = useState({})
  const [existeRegistro, setExisteRegistro] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [historico, setHistorico] = useState([])
  const [equipe, setEquipe] = useState([])
  const [rotinaEquipe, setRotinaEquipe] = useState({})
  const [corrigindo, setCorrigindo] = useState(null)
  const [loading, setLoading] = useState(true)

  const carregarPropria = useCallback(async () => {
    setLoading(true)
    const { data: atual } = await supabase.from('rotina_diaria').select('*')
      .eq('consultor_id', user.id).eq('data', dataSelecionada).maybeSingle()
    setExisteRegistro(!!atual)
    setCampos(atual || {})

    const de = new Date(dataSelecionada)
    de.setDate(de.getDate() - 13)
    const { data: hist } = await supabase.from('rotina_diaria').select('*')
      .eq('consultor_id', user.id).gte('data', dataISO(de)).lte('data', dataSelecionada)
      .order('data', { ascending: false })
    setHistorico(hist || [])
    setLoading(false)
  }, [user.id, dataSelecionada])

  const carregarEquipe = useCallback(async () => {
    setLoading(true)
    const { data: staff } = await supabase.from('consultores_staff').select('id, nome').eq('perfil', 'Consultor').order('nome')
    setEquipe(staff || [])
    const { data: rotinas } = await supabase.from('rotina_diaria').select('*').eq('data', dataSelecionada)
    const mapa = {}
    for (const r of (rotinas || [])) mapa[r.consultor_id] = r
    setRotinaEquipe(mapa)
    setLoading(false)
  }, [dataSelecionada])

  useEffect(() => {
    if (isGestor(user)) carregarEquipe(); else carregarPropria()
  }, [user, dataSelecionada, carregarEquipe, carregarPropria])

  async function salvar() {
    setSalvando(true)
    const payload = { consultor_id: user.id, data: dataSelecionada, validado: false }
    for (const c of CAMPOS) payload[c.key] = Number(campos[c.key]) || 0

    const { error } = existeRegistro
      ? await supabase.from('rotina_diaria').update(payload).eq('consultor_id', user.id).eq('data', dataSelecionada)
      : await supabase.from('rotina_diaria').insert(payload)

    setSalvando(false)
    if (!error) { setExisteRegistro(true); carregarPropria() }
  }

  function mudarDia(delta) {
    const d = new Date(dataSelecionada)
    d.setDate(d.getDate() + delta)
    setDataSelecionada(dataISO(d))
  }

  async function salvarCampoEquipe(consultorId, campo, valor) {
    const registroAtual = rotinaEquipe[consultorId]
    const marcaValidacao = { validado: true, validado_por: user.id, validado_em: new Date().toISOString() }
    const payload = { consultor_id: consultorId, data: dataSelecionada, [campo]: Number(valor) || 0, ...marcaValidacao }
    const { error } = registroAtual
      ? await supabase.from('rotina_diaria').update({ [campo]: Number(valor) || 0, ...marcaValidacao }).eq('consultor_id', consultorId).eq('data', dataSelecionada)
      : await supabase.from('rotina_diaria').insert(payload)
    if (!error) carregarEquipe()
  }

  async function validarRegistro(consultorId) {
    await supabase.from('rotina_diaria').update({
      validado: true, validado_por: user.id, validado_em: new Date().toISOString(),
    }).eq('consultor_id', consultorId).eq('data', dataSelecionada)
    carregarEquipe()
  }

  if (loading) return <div className="loading">Carregando rotina...</div>

  return (
    <div className="main">
      <div className="kanban-toolbar">
        <button className="btn-filter-light" onClick={() => mudarDia(-1)}>← Dia anterior</button>
        <input className="lm-input" type="date" style={{ width: 150 }} value={dataSelecionada} onChange={e => setDataSelecionada(e.target.value)} />
        <button className="btn-filter-light" onClick={() => mudarDia(1)}>Próximo dia →</button>
        {dataSelecionada !== hoje && <button className="btn-filter-light" onClick={() => setDataSelecionada(hoje)}>Hoje</button>}
      </div>

      {!isGestor(user) && (
        <>
          <div className="lm-section-title" style={{ marginBottom: 12 }}>Rotina do dia — {formatDataBR(dataSelecionada)}</div>
          {existeRegistro && (
            <div style={{ fontSize: 12, color: '#666', margin: '0 0 6px' }}>
              {campos.validado ? '✅ Validado pelo gestor' : '⏳ Aguardando validação'}
            </div>
          )}
          <div className="lm-grid-3" style={{ marginTop: 16, marginBottom: 16 }}>
            {CAMPOS.map(c => (
              <div key={c.key} className="lm-field-edit">
                <label>{c.label}{c.meta && <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, color: '#bbb' }}>(meta: {c.meta})</span>}</label>
                {c.moeda ? (
                  <CampoMoeda className={`lm-input ${corMeta(c, campos[c.key])}`} valor={campos[c.key] || 0}
                    onChange={v => setCampos(prev => ({ ...prev, [c.key]: v }))} />
                ) : (
                  <input className={`lm-input ${corMeta(c, campos[c.key])}`} type="number" min="0" value={campos[c.key] ?? ''}
                    onChange={e => setCampos(prev => ({ ...prev, [c.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          <button className="btn-save-obs" style={{ float: 'none' }} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : existeRegistro ? 'Atualizar Rotina' : 'Salvar Rotina de Hoje'}
          </button>

          <div className="lm-section-title" style={{ marginTop: 28, marginBottom: 12 }}>Últimos 14 dias</div>
          <div className="carteira-table-wrap">
            <table className="carteira-table">
              <thead>
                <tr><th>Data</th>{CAMPOS.map(c => <th key={c.key}>{c.label}</th>)}<th>Validação</th></tr>
              </thead>
              <tbody>
                {historico.length === 0 && <tr><td colSpan={10} className="empty">Nenhum registro no período</td></tr>}
                {historico.map(h => (
                  <tr key={h.id}>
                    <td>{formatDataBR(h.data)}</td>
                    {CAMPOS.map(c => (
                      <td key={c.key} className={corMeta(c, h[c.key])}>
                        {c.moeda ? formatarMoeda(h[c.key]) : (h[c.key] || 0)}
                      </td>
                    ))}
                    <td>{h.validado ? '✅ Validado' : '⏳ Pendente'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {isGestor(user) && (
        <>
          <div className="lm-section-title" style={{ marginBottom: 12 }}>Rotina da equipe — {formatDataBR(dataSelecionada)}</div>
          <div className="carteira-table-wrap">
            <table className="carteira-table">
              <thead>
                <tr><th className="col-sticky">Consultor</th>{CAMPOS.map(c => <th key={c.key}>{c.label}</th>)}<th>Status</th><th>Ação</th></tr>
              </thead>
              <tbody>
                {equipe.length === 0 && <tr><td colSpan={11} className="empty">Nenhum consultor cadastrado</td></tr>}
                {equipe.map(s => {
                  const r = rotinaEquipe[s.id]
                  const emEdicao = corrigindo === s.id
                  return (
                    <tr key={s.id}>
                      <td className="col-sticky">{s.nome}</td>
                      {CAMPOS.map(c => (
                        <td key={c.key} className={r ? corMeta(c, r[c.key]) : ''}>
                          {emEdicao ? (
                            <input className="lm-input" type="number" min="0" step={c.moeda ? '0.01' : '1'} style={{ width: c.moeda ? 90 : 70 }}
                              key={`${s.id}-${dataSelecionada}-${c.key}`}
                              defaultValue={r ? (r[c.key] || 0) : 0}
                              onBlur={e => salvarCampoEquipe(s.id, c.key, e.target.value)} />
                          ) : (
                            r ? (c.moeda ? formatarMoeda(r[c.key]) : (r[c.key] || 0)) : '—'
                          )}
                        </td>
                      ))}
                      <td>
                        {!r && '⛔ Não preencheu'}
                        {r && r.validado && '✅ Validado'}
                        {r && !r.validado && '⏳ Pendente'}
                      </td>
                      <td>
                        {r && !emEdicao && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            {!r.validado && <button className="btn-action" onClick={() => validarRegistro(s.id)}>Validar</button>}
                            <button className="btn-action" onClick={() => setCorrigindo(s.id)}>Corrigir</button>
                          </div>
                        )}
                        {emEdicao && <button className="btn-action" onClick={() => setCorrigindo(null)}>Concluir</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'

const ORDEM_VERTICAIS = ['APARELHO', 'HA', 'BL', 'MM', 'MB', 'RECEITA_TELECOM']
const VERTICAL_INFO = {
  APARELHO: { label: 'Aparelho', formato: 'moeda' },
  HA: { label: 'HA (Altas)', formato: 'inteiro' },
  BL: { label: 'Banda Larga', formato: 'inteiro' },
  MM: { label: 'Móvel', formato: 'inteiro' },
  MB: { label: 'MB', formato: 'moeda' },
  RECEITA_TELECOM: { label: 'Receita Telecom', formato: 'moeda' },
}

function fmtMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtValor(v, formato) {
  return formato === 'moeda' ? fmtMoeda(v) : String(Math.round(v || 0))
}
function fmtPct(v) {
  return `${Math.round((v || 0) * 100)}%`
}
function mesAtualISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function isDiaUtil(d) {
  const dia = d.getDay()
  return dia !== 0 && dia !== 6
}
function contarDiasUteis(inicio, fim) {
  let count = 0
  const d = new Date(inicio)
  while (d <= fim) {
    if (isDiaUtil(d)) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}
// Dias úteis calculados a partir de hoje — não vem de arquivo nem é digitado, pra nunca
// ficar desatualizado (diferente do Excel original, onde "dias úteis restantes" era digitado
// à mão). Não considera feriados nessa versão, só fim de semana.
function calcularDU(mesReferencia) {
  const [ano, mes] = mesReferencia.split('-').map(Number)
  const primeiroDia = new Date(ano, mes - 1, 1)
  const ultimoDia = new Date(ano, mes, 0)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const duTotais = contarDiasUteis(primeiroDia, ultimoDia)
  let duRestantes
  if (ultimoDia < hoje) duRestantes = 0
  else if (primeiroDia > hoje) duRestantes = duTotais
  else duRestantes = contarDiasUteis(hoje, ultimoDia)
  return { duTotais, duRestantes }
}
function corSemaforo(pct) {
  if (pct >= 1) return '#28A745'
  if (pct >= 0.6) return '#F39C12'
  return '#E74C3C'
}

function calcularLinha(row, fatorConversao, duTotais, duRestantes) {
  const realizado = row.esteira - row.backlog
  const mediaDiaria = duTotais > 0 ? realizado / duTotais : 0
  const metaDiaria = duRestantes > 0 ? (row.meta - row.esteira) / duRestantes : 0
  const projecao = (row.esteira * fatorConversao) + (mediaDiaria * duRestantes)
  const pctAtingimento = row.meta > 0 ? projecao / row.meta : 0
  const pctConcluido = row.meta > 0 ? row.concluido / row.meta : 0
  return { realizado, mediaDiaria, metaDiaria, projecao, pctAtingimento, pctConcluido }
}

// gráfico de barras simples (Meta / Esteira / Projeção), igual ao padrão já usado no Dashboard
function GraficoVertical({ titulo, meta, esteira, projecao, formato }) {
  const max = Math.max(1, meta, esteira, projecao)
  const barras = [
    { label: 'Meta', valor: meta, cor: '#26192F' },
    { label: 'Esteira', valor: esteira, cor: '#378ADD' },
    { label: 'Projeção', valor: projecao, cor: corSemaforo(meta > 0 ? projecao / meta : 0) },
  ]
  return (
    <div className="dash-card">
      <div className="dash-card-titulo">{titulo}</div>
      <div className="dash-chart-v" style={{ height: 110 }}>
        {barras.map((b, i) => (
          <div key={i} className="dash-chart-v-col">
            <div className="dash-chart-v-num">{fmtValor(b.valor, formato)}</div>
            <div className="dash-chart-v-bar" style={{ height: `${(b.valor / max) * 100}%`, background: b.cor }} />
            <div className="dash-chart-v-label">{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PlanoComercial() {
  const [mesReferencia, setMesReferencia] = useState(mesAtualISO())
  const [planos, setPlanos] = useState([])
  const [staff, setStaff] = useState([])
  const [config, setConfig] = useState({})
  const [metaGlobal, setMetaGlobal] = useState({})
  const [loading, setLoading] = useState(true)
  const [editandoId, setEditandoId] = useState(null)
  const [mostrarConfig, setMostrarConfig] = useState(false)

  const fetchDados = useCallback(async () => {
    setLoading(true)
    const mesData = `${mesReferencia}-01`
    const [{ data: planosData }, { data: staffData }, { data: configData }, { data: metaGlobalData }] = await Promise.all([
      supabase.from('plano_comercial').select('*').eq('mes_referencia', mesData),
      supabase.from('consultores_staff').select('id, nome').order('nome'),
      supabase.from('plano_comercial_config').select('*'),
      supabase.from('plano_comercial_meta_global').select('*').eq('mes_referencia', mesData),
    ])
    setPlanos(planosData || [])
    setStaff(staffData || [])
    const mapaConfig = {}
    for (const c of (configData || [])) mapaConfig[c.vertical] = c.fator_conversao
    setConfig(mapaConfig)
    const mapaGlobal = {}
    for (const g of (metaGlobalData || [])) mapaGlobal[g.vertical] = g.meta
    setMetaGlobal(mapaGlobal)
    setLoading(false)
  }, [mesReferencia])

  useEffect(() => { fetchDados() }, [fetchDados])

  function atualizarConcluido(row, valor) {
    const numero = Number(valor) || 0
    setPlanos(prev => prev.map(p => p.id === row.id ? { ...p, concluido: numero } : p))
    supabase.from('plano_comercial').update({ concluido: numero, atualizado_em: new Date().toISOString() }).eq('id', row.id)
  }

  function atualizarFator(vertical, valor) {
    const numero = Number(valor)
    if (isNaN(numero)) return
    setConfig(prev => ({ ...prev, [vertical]: numero }))
    supabase.from('plano_comercial_config').update({ fator_conversao: numero }).eq('vertical', vertical)
  }

  if (loading) return <div className="loading">Carregando Plano Comercial...</div>

  const { duTotais, duRestantes } = calcularDU(mesReferencia)
  const staffPorId = {}
  for (const s of staff) staffPorId[s.id] = s

  const porConsultor = {}
  for (const p of planos) {
    const nome = staffPorId[p.consultor_id]?.nome || '—'
    if (!porConsultor[nome]) porConsultor[nome] = []
    porConsultor[nome].push(p)
  }

  const consolidado = ORDEM_VERTICAIS.map(v => {
    const linhas = planos.filter(p => p.vertical === v)
    return {
      vertical: v,
      meta: linhas.reduce((s, p) => s + Number(p.meta || 0), 0),
      backlog: linhas.reduce((s, p) => s + Number(p.backlog || 0), 0),
      esteira: linhas.reduce((s, p) => s + Number(p.esteira || 0), 0),
      concluido: linhas.reduce((s, p) => s + Number(p.concluido || 0), 0),
    }
  }).filter(c => c.meta > 0 || c.backlog > 0 || c.esteira > 0)

  function renderLinha(row, key) {
    const info = VERTICAL_INFO[row.vertical] || { label: row.vertical, formato: 'inteiro' }
    const fator = config[row.vertical] ?? 0.8
    const calc = calcularLinha(row, fator, duTotais, duRestantes)
    return (
      <tr key={key}>
        <td>{info.label}</td>
        <td>{fmtValor(row.meta, info.formato)}</td>
        <td>{fmtValor(row.backlog, info.formato)}</td>
        <td>{fmtValor(row.esteira, info.formato)}</td>
        <td>{fmtValor(calc.metaDiaria, info.formato)}</td>
        <td>{fmtValor(calc.mediaDiaria, info.formato)}</td>
        <td>{fmtValor(calc.projecao, info.formato)}</td>
        <td><span className="plano-semaforo" style={{ background: corSemaforo(calc.pctAtingimento) }}>{fmtPct(calc.pctAtingimento)}</span></td>
        <td>
          {row.id && (editandoId === row.id ? (
            <input className="lm-input" type="number" style={{ width: 100 }} autoFocus defaultValue={row.concluido}
              onBlur={e => { atualizarConcluido(row, e.target.value); setEditandoId(null) }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
          ) : (
            <span className="plano-concluido-editavel" onClick={() => setEditandoId(row.id)}>{fmtValor(row.concluido, info.formato)}</span>
          ))}
        </td>
        <td>{fmtPct(calc.pctConcluido)}</td>
      </tr>
    )
  }

  const cabecalho = (
    <tr>
      <th>Vertical</th><th>Meta</th><th>Backlog</th><th>Esteira Mês</th>
      <th>Meta Diária</th><th>Média Diária</th><th>Projeção</th><th>%</th><th>Concluído</th><th>%</th>
    </tr>
  )

  return (
    <div className="main">
      <div className="lm-section-title">Plano Comercial</div>

      <div className="kanban-toolbar" style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#888' }}>Mês
          <input type="month" className="lm-input" style={{ marginLeft: 8 }} value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} />
        </label>
        <span style={{ fontSize: 12, color: '#888' }}>Dias úteis: {duTotais} total, {duRestantes} restante(s)</span>
        <button className="btn-filter-light" onClick={() => setMostrarConfig(v => !v)}>Fatores de conversão</button>
      </div>

      {mostrarConfig && (
        <div className="lm-resumo" style={{ marginBottom: 16 }}>
          <div className="lm-section-title" style={{ marginTop: 0 }}>Fator de conversão por vertical</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {ORDEM_VERTICAIS.map(v => (
              <label key={v} style={{ fontSize: 12, color: '#555', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {VERTICAL_INFO[v].label}
                <input className="lm-input" type="number" step="0.05" min="0" max="1" style={{ width: 80 }}
                  value={config[v] ?? ''} onChange={e => atualizarFator(v, e.target.value)} />
              </label>
            ))}
          </div>
        </div>
      )}

      {planos.length === 0 && <div className="empty">Nenhum plano importado pra esse mês ainda. Sobe o arquivo em Importar → Plano Comercial.</div>}

      {Object.keys(metaGlobal).length > 0 && (
        <>
          <div className="lm-section-title">Meta Global do Escritório (antes da quebra por time)</div>
          <div className="dash-grid" style={{ marginBottom: 24 }}>
            {ORDEM_VERTICAIS.filter(v => metaGlobal[v] !== undefined).map(v => (
              <div key={v} className="dash-card">
                <div className="dash-card-titulo">{VERTICAL_INFO[v].label}</div>
                <div className="dash-card-numero">{fmtValor(metaGlobal[v], VERTICAL_INFO[v].formato)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {consolidado.length > 0 && (
        <>
          <div className="lm-section-title">Plano Comercial (consolidado)</div>
          <div className="dash-grid" style={{ marginBottom: 16 }}>
            {consolidado.map(c => {
              const fator = config[c.vertical] ?? 0.8
              const calc = calcularLinha(c, fator, duTotais, duRestantes)
              const info = VERTICAL_INFO[c.vertical] || { label: c.vertical, formato: 'inteiro' }
              return (
                <GraficoVertical key={c.vertical} titulo={info.label} meta={c.meta} esteira={c.esteira} projecao={calc.projecao} formato={info.formato} />
              )
            })}
          </div>
          <div className="carteira-table-wrap" style={{ marginBottom: 24 }}>
            <table className="carteira-table">
              <thead>{cabecalho}</thead>
              <tbody>
                {consolidado.map(c => renderLinha({ ...c, id: null }, c.vertical))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {Object.entries(porConsultor).map(([nome, linhasConsultor]) => (
        <div key={nome} style={{ marginBottom: 24 }}>
          <div className="lm-section-title">{nome}</div>
          <div className="carteira-table-wrap">
            <table className="carteira-table">
              <thead>{cabecalho}</thead>
              <tbody>
                {ORDEM_VERTICAIS.filter(v => linhasConsultor.some(l => l.vertical === v))
                  .map(v => renderLinha(linhasConsultor.find(l => l.vertical === v), v))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

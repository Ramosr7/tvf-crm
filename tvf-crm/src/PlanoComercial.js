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

export default function PlanoComercial() {
  const [mesReferencia, setMesReferencia] = useState(mesAtualISO())
  const [planos, setPlanos] = useState([])
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [editandoId, setEditandoId] = useState(null)
  const [mostrarConfig, setMostrarConfig] = useState(false)

  const fetchDados = useCallback(async () => {
    setLoading(true)
    const mesData = `${mesReferencia}-01`
    const [{ data: planosData }, { data: configData }] = await Promise.all([
      supabase.from('plano_comercial').select('*, consultores_staff(nome)').eq('mes_referencia', mesData),
      supabase.from('plano_comercial_config').select('*'),
    ])
    setPlanos(planosData || [])
    const mapaConfig = {}
    for (const c of (configData || [])) mapaConfig[c.vertical] = c.fator_conversao
    setConfig(mapaConfig)
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

  const porConsultor = {}
  for (const p of planos) {
    const nome = p.consultores_staff?.nome || '—'
    if (!porConsultor[nome]) porConsultor[nome] = []
    porConsultor[nome].push(p)
  }

  const consolidado = ORDEM_VERTICAIS.map(v => {
    const linhas = planos.filter(p => p.vertical === v)
    const meta = linhas.reduce((s, p) => s + Number(p.meta || 0), 0)
    const backlog = linhas.reduce((s, p) => s + Number(p.backlog || 0), 0)
    const esteira = linhas.reduce((s, p) => s + Number(p.esteira || 0), 0)
    const concluido = linhas.reduce((s, p) => s + Number(p.concluido || 0), 0)
    return { vertical: v, meta, backlog, esteira, concluido }
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
        <td>{fmtValor(calc.realizado, info.formato)}</td>
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

      {consolidado.length > 0 && (
        <>
          <div className="lm-section-title">Plano Comercial (consolidado)</div>
          <div className="carteira-table-wrap" style={{ marginBottom: 24 }}>
            <table className="carteira-table">
              <thead>
                <tr>
                  <th>Vertical</th><th>Meta</th><th>Backlog</th><th>Esteira</th><th>Realizado</th>
                  <th>Meta Diária</th><th>Média Diária</th><th>Projeção</th><th>%</th><th>Concluído</th><th>% Concl.</th>
                </tr>
              </thead>
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
              <thead>
                <tr>
                  <th>Vertical</th><th>Meta</th><th>Backlog</th><th>Esteira</th><th>Realizado</th>
                  <th>Meta Diária</th><th>Média Diária</th><th>Projeção</th><th>%</th><th>Concluído</th><th>% Concl.</th>
                </tr>
              </thead>
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

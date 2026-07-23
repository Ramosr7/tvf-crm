import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'

const STATUS_VENDA = ['Venda Realizada', 'Pedido Finalizado']

function fmtMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function iso(d) {
  return d.toISOString().slice(0, 10)
}
function inicioSemana(d) {
  const r = new Date(d)
  const dia = r.getDay() // 0=domingo
  const diff = dia === 0 ? 6 : dia - 1 // segunda-feira como início
  r.setDate(r.getDate() - diff)
  return r
}
function variacao(atual, anterior) {
  if (!anterior) return atual > 0 ? 100 : 0
  return Math.round(((atual - anterior) / anterior) * 100)
}

function CardComparativo({ titulo, atualQtd, atualValor, anteriorQtd, labelAnterior }) {
  const varQtd = variacao(atualQtd, anteriorQtd)
  return (
    <div className="dash-card">
      <div className="dash-card-titulo">{titulo}</div>
      <div className="dash-card-numero">{atualQtd}</div>
      <div className="dash-card-valor">{fmtMoeda(atualValor)}</div>
      <div className={`dash-card-var ${varQtd >= 0 ? 'var-up' : 'var-down'}`}>
        {varQtd >= 0 ? '▲' : '▼'} {Math.abs(varQtd)}% vs {labelAnterior} ({anteriorQtd})
      </div>
    </div>
  )
}

function CardSimples({ titulo, valor, sub }) {
  return (
    <div className="dash-card">
      <div className="dash-card-titulo">{titulo}</div>
      <div className="dash-card-numero">{valor}</div>
      {sub && <div className="dash-card-valor">{sub}</div>}
    </div>
  )
}

// gráfico de barras verticais em HTML/CSS puro, sem lib externa
function BarChartVertical({ dados, altura = 140 }) {
  const max = Math.max(1, ...dados.map(d => d.valor))
  return (
    <div className="dash-chart-v" style={{ height: altura }}>
      {dados.map((d, i) => (
        <div key={i} className="dash-chart-v-col">
          <div className="dash-chart-v-num">{d.valor}</div>
          <div className="dash-chart-v-bar" style={{ height: `${(d.valor / max) * 100}%` }} />
          <div className="dash-chart-v-label">{d.label}</div>
        </div>
      ))}
    </div>
  )
}

// gráfico de barras horizontais (ranking) em HTML/CSS puro
function BarChartHorizontal({ dados }) {
  const max = Math.max(1, ...dados.map(d => d.valor))
  return (
    <div className="dash-chart-h">
      {dados.map((d, i) => (
        <div key={i} className="dash-chart-h-row">
          <div className="dash-chart-h-label" title={d.label}>{d.label}</div>
          <div className="dash-chart-h-track">
            <div className="dash-chart-h-bar" style={{ width: `${(d.valor / max) * 100}%` }} />
          </div>
          <div className="dash-chart-h-valor">{d.valorLabel ?? d.valor}</div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard({ user }) {
  const [clientes, setClientes] = useState([])
  const [valorPorCliente, setValorPorCliente] = useState({})
  const [staff, setStaff] = useState([])
  const [rotinas, setRotinas] = useState([])
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)
    const de14 = new Date(); de14.setDate(de14.getDate() - 13)
    const [{ data: clientesData }, { data: vendaItens }, { data: staffData }, { data: rotinaData }] = await Promise.all([
      supabase.from('carteira_cliente').select('id, status, data_venda, consultor_id'),
      supabase.from('carteira_venda_item').select('carteira_cliente_id, valor'),
      supabase.from('consultores_staff').select('id, nome'),
      supabase.from('rotina_diaria').select('*').gte('data', iso(de14)),
    ])
    setClientes(clientesData || [])
    const mapa = {}
    ;(vendaItens || []).forEach(v => {
      mapa[v.carteira_cliente_id] = (mapa[v.carteira_cliente_id] || 0) + Number(v.valor || 0)
    })
    setValorPorCliente(mapa)
    setStaff(staffData || [])
    setRotinas(rotinaData || [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  if (loading) return <div className="main"><div className="empty">Carregando...</div></div>

  const nomeConsultor = (id) => staff.find(s => s.id === id)?.nome || '—'
  const valorCliente = (id) => valorPorCliente[id] || 0

  const vendidos = clientes.filter(c => STATUS_VENDA.includes(c.status) && c.data_venda)

  const hoje = new Date()
  const hojeISO = iso(hoje)
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1)
  const ontemISO = iso(ontem)

  const inicioSemanaAtual = inicioSemana(hoje)
  const fimSemanaAnterior = new Date(inicioSemanaAtual); fimSemanaAnterior.setDate(fimSemanaAnterior.getDate() - 1)
  const inicioSemanaAnterior = new Date(inicioSemanaAtual); inicioSemanaAnterior.setDate(inicioSemanaAnterior.getDate() - 7)

  const inicioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const inicioMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const fimMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0)

  function noPeriodo(de, ate) {
    const deISO = iso(de), ateISO = iso(ate)
    return vendidos.filter(c => c.data_venda >= deISO && c.data_venda <= ateISO)
  }
  function somaValor(lista) {
    return lista.reduce((s, c) => s + valorCliente(c.id), 0)
  }

  const vendasHoje = vendidos.filter(c => c.data_venda === hojeISO)
  const vendasOntem = vendidos.filter(c => c.data_venda === ontemISO)

  const vendasSemana = noPeriodo(inicioSemanaAtual, hoje)
  const vendasSemanaAnterior = noPeriodo(inicioSemanaAnterior, fimSemanaAnterior)

  const vendasMes = noPeriodo(inicioMesAtual, hoje)
  const vendasMesAnterior = noPeriodo(inicioMesAnterior, fimMesAnterior)

  const totalCarteira = clientes.length
  const conversao = totalCarteira > 0 ? Math.round((vendidos.length / totalCarteira) * 100) : 0

  // ranking por consultor no mês corrente
  const porConsultor = {}
  vendasMes.forEach(c => {
    const id = c.consultor_id
    if (!porConsultor[id]) porConsultor[id] = { qtd: 0, valor: 0 }
    porConsultor[id].qtd += 1
    porConsultor[id].valor += valorCliente(c.id)
  })
  const rankingMes = Object.entries(porConsultor)
    .map(([id, v]) => ({ id, nome: nomeConsultor(id), ...v }))
    .sort((a, b) => b.valor - a.valor)

  // melhor vendedor do dia
  const porConsultorHoje = {}
  vendasHoje.forEach(c => {
    const id = c.consultor_id
    if (!porConsultorHoje[id]) porConsultorHoje[id] = { qtd: 0, valor: 0 }
    porConsultorHoje[id].qtd += 1
    porConsultorHoje[id].valor += valorCliente(c.id)
  })
  const rankingHoje = Object.entries(porConsultorHoje)
    .map(([id, v]) => ({ id, nome: nomeConsultor(id), ...v }))
    .sort((a, b) => b.valor - a.valor)
  const melhorDoDia = rankingHoje[0]

  // indicadores de atendimento (rotina diária) de hoje, somados na equipe toda
  const rotinasHoje = rotinas.filter(r => r.data === hojeISO)
  const somaCampo = (campo) => rotinasHoje.reduce((s, r) => s + (Number(r[campo]) || 0), 0)
  const atendimentosHoje = somaCampo('clientes_recebidos')
  const retornosHoje = somaCampo('retornos')
  const aceitesHoje = somaCampo('ag_aceite')

  // vendas por dia, últimos 7 dias, pra gráfico de tendência
  const dias7 = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje); d.setDate(d.getDate() - i)
    const dISO = iso(d)
    dias7.push({
      label: dISO.slice(8, 10) + '/' + dISO.slice(5, 7),
      valor: vendidos.filter(c => c.data_venda === dISO).length,
    })
  }

  const dadosRankingChart = rankingMes.slice(0, 8).map(r => ({ label: r.nome, valor: r.valor, valorLabel: fmtMoeda(r.valor) }))

  return (
    <div className="main">
      <div className="lm-section-title">Visão Geral</div>

      <div className="dash-grid">
        <CardComparativo titulo="Vendas Hoje" atualQtd={vendasHoje.length} atualValor={somaValor(vendasHoje)}
          anteriorQtd={vendasOntem.length} labelAnterior="ontem" />
        <CardComparativo titulo="Vendas na Semana" atualQtd={vendasSemana.length} atualValor={somaValor(vendasSemana)}
          anteriorQtd={vendasSemanaAnterior.length} labelAnterior="semana passada" />
        <CardComparativo titulo="Vendas no Mês" atualQtd={vendasMes.length} atualValor={somaValor(vendasMes)}
          anteriorQtd={vendasMesAnterior.length} labelAnterior="mês passado" />
        <div className="dash-card">
          <div className="dash-card-titulo">Conversão da Carteira</div>
          <div className="dash-card-numero">{conversao}%</div>
          <div className="dash-card-valor">{vendidos.length} vendas / {totalCarteira} clientes</div>
        </div>
      </div>

      {melhorDoDia && (
        <div className="dash-destaque">
          🏆 Melhor vendedor do dia: <strong>{melhorDoDia.nome}</strong> — {melhorDoDia.qtd} venda(s) · {fmtMoeda(melhorDoDia.valor)}
        </div>
      )}

      <div className="lm-section-title" style={{ marginTop: 24 }}>Tendência de Vendas (últimos 7 dias)</div>
      <div className="dash-card">
        <BarChartVertical dados={dias7} />
      </div>

      <div className="lm-section-title" style={{ marginTop: 24 }}>Indicadores de Atendimento (hoje)</div>
      <div className="dash-grid">
        <CardSimples titulo="Atendimentos" valor={atendimentosHoje} sub="clientes recebidos hoje" />
        <CardSimples titulo="Retornos" valor={retornosHoje} sub="retornos feitos hoje" />
        <CardSimples titulo="Ag. Aceite Enviados" valor={aceitesHoje} sub="enviados hoje" />
      </div>

      <div className="lm-section-title" style={{ marginTop: 24 }}>Ranking de Consultores (mês atual)</div>
      {rankingMes.length === 0 && <div className="empty">Nenhuma venda registrada este mês</div>}
      {rankingMes.length > 0 && (
        <>
          <div className="dash-card" style={{ marginBottom: 14 }}>
            <BarChartHorizontal dados={dadosRankingChart} />
          </div>
          <table className="carteira-table">
            <thead>
              <tr><th>#</th><th>Consultor</th><th>Vendas</th><th>Valor Vendido</th></tr>
            </thead>
            <tbody>
              {rankingMes.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}{i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : ''}</td>
                  <td>{r.nome}</td>
                  <td>{r.qtd}</td>
                  <td>{fmtMoeda(r.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

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

function CardComparativo({ titulo, atualQtd, atualValor, anteriorQtd, labelAnterior, onClick }) {
  const varQtd = variacao(atualQtd, anteriorQtd)
  return (
    <div className={`dash-card ${onClick ? 'dash-card-clicavel' : ''}`} onClick={onClick}>
      <div className="dash-card-titulo">{titulo}</div>
      <div className="dash-card-numero">{atualQtd}</div>
      <div className="dash-card-valor">{fmtMoeda(atualValor)}</div>
      <div className={`dash-card-var ${varQtd >= 0 ? 'var-up' : 'var-down'}`}>
        {varQtd >= 0 ? '▲' : '▼'} {Math.abs(varQtd)}% vs {labelAnterior} ({anteriorQtd})
      </div>
    </div>
  )
}

function CardSimples({ titulo, valor, sub, onClick }) {
  return (
    <div className={`dash-card ${onClick ? 'dash-card-clicavel' : ''}`} onClick={onClick}>
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

function ModalDetalhe({ titulo, tipo, itens, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lead-modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <div className="lm-header-left">
            <div style={{ fontSize: 17, fontWeight: 700 }}>{titulo}</div>
          </div>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>
        <div className="lm-body">
          {itens.length === 0 && <div className="empty">Nenhum registro</div>}
          {tipo === 'clientes' && itens.map(c => (
            <div key={c.id} className="sino-item">
              <div style={{ fontWeight: 700 }}>{c.razao_social || c.cnpj}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{c.consultorNome} · {c.status}</div>
              {c.valor > 0 && <div style={{ fontSize: 12, marginTop: 2 }}>{fmtMoeda(c.valor)}</div>}
            </div>
          ))}
          {tipo === 'consultores' && itens.map((r, i) => (
            <div key={i} className="sino-item" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700 }}>{r.nome}</div>
              <div>{r.valor}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({ user }) {
  const isConsultor = user.perfil === 'Consultor'
  const [clientes, setClientes] = useState([])
  const [valorPorCliente, setValorPorCliente] = useState({})
  const [itensPorCliente, setItensPorCliente] = useState([])
  const [staff, setStaff] = useState([])
  const [rotinas, setRotinas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const de14 = new Date(); de14.setDate(de14.getDate() - 13)
    let qClientes = supabase.from('carteira_cliente')
      .select('id, cnpj, razao_social, status, data_venda, consultor_id, potencial_migracao, potencial_bl, potencial_ti, potencial_voz, credito_pre_aprovado')
      .is('excluido_em', null)
    let qRotina = supabase.from('rotina_diaria').select('*').gte('data', iso(de14))
    if (isConsultor) {
      qClientes = qClientes.eq('consultor_id', user.id)
      qRotina = qRotina.eq('consultor_id', user.id)
    }
    const [{ data: clientesData }, { data: vendaItens }, { data: staffData }, { data: rotinaData }] = await Promise.all([
      qClientes,
      supabase.from('carteira_venda_item').select('carteira_cliente_id, valor, tipo, subproduto'),
      supabase.from('consultores_staff').select('id, nome'),
      qRotina,
    ])
    setClientes(clientesData || [])
    const mapa = {}
    ;(vendaItens || []).forEach(v => {
      mapa[v.carteira_cliente_id] = (mapa[v.carteira_cliente_id] || 0) + Number(v.valor || 0)
    })
    setValorPorCliente(mapa)
    setItensPorCliente(vendaItens || [])
    setStaff(staffData || [])
    setRotinas(rotinaData || [])
    setLoading(false)
  }, [isConsultor, user.id])

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
  function paraItensClientes(lista) {
    return lista.map(c => ({ ...c, consultorNome: nomeConsultor(c.consultor_id), valor: valorCliente(c.id) }))
  }

  const vendasHoje = vendidos.filter(c => c.data_venda === hojeISO)
  const vendasOntem = vendidos.filter(c => c.data_venda === ontemISO)

  const vendasSemana = noPeriodo(inicioSemanaAtual, hoje)
  const vendasSemanaAnterior = noPeriodo(inicioSemanaAnterior, fimSemanaAnterior)

  const vendasMes = noPeriodo(inicioMesAtual, hoje)
  const vendasMesAnterior = noPeriodo(inicioMesAnterior, fimMesAnterior)

  const totalCarteira = clientes.length
  const conversao = totalCarteira > 0 ? Math.round((vendidos.length / totalCarteira) * 100) : 0

  const potencialCarteira = clientes.reduce((acc, c) => {
    acc.migracao += c.potencial_migracao || 0
    acc.bl += c.potencial_bl || 0
    acc.ti += c.potencial_ti || 0
    acc.voz += c.potencial_voz || 0
    acc.credito += Number(c.credito_pre_aprovado || 0)
    return acc
  }, { migracao: 0, bl: 0, ti: 0, voz: 0, credito: 0 })

  // receita por tipo (Novo/Renovação) no mês atual, só itens dos clientes vendidos no período
  function receitaPorTipo(lista, tipo) {
    const idsNoPeriodo = new Set(lista.map(c => c.id))
    return itensPorCliente
      .filter(it => idsNoPeriodo.has(it.carteira_cliente_id) && it.tipo === tipo)
      .reduce((acc, it) => ({ qtd: acc.qtd + 1, valor: acc.valor + Number(it.valor || 0) }), { qtd: 0, valor: 0 })
  }
  const novoMes = receitaPorTipo(vendasMes, 'Novo')
  const renovacaoMes = receitaPorTipo(vendasMes, 'Renovação')

  // ranking por consultor no mês corrente, separado por tipo (Novo/Renovação) —
  // somar os dois junto escondia quem vendia mais de cada um
  const idsClienteMes = new Set(vendasMes.map(c => c.id))
  const consultorPorCliente = {}
  clientes.forEach(c => { consultorPorCliente[c.id] = c.consultor_id })

  function rankingPorTipo(tipo) {
    const porConsultor = {}
    itensPorCliente
      .filter(it => idsClienteMes.has(it.carteira_cliente_id) && it.tipo === tipo)
      .forEach(it => {
        const consultorId = consultorPorCliente[it.carteira_cliente_id]
        if (!consultorId) return
        if (!porConsultor[consultorId]) porConsultor[consultorId] = { qtd: 0, valor: 0 }
        porConsultor[consultorId].qtd += 1
        porConsultor[consultorId].valor += Number(it.valor || 0)
      })
    return Object.entries(porConsultor)
      .map(([id, v]) => ({ id, nome: nomeConsultor(id), ...v }))
      .sort((a, b) => b.valor - a.valor)
  }
  const rankingNovoMes = rankingPorTipo('Novo')
  const rankingRenovacaoMes = rankingPorTipo('Renovação')

  // vendas por produto (subproduto) no mês atual
  const porSubprodutoMes = {}
  itensPorCliente
    .filter(it => idsClienteMes.has(it.carteira_cliente_id))
    .forEach(it => {
      const sub = it.subproduto || '—'
      if (!porSubprodutoMes[sub]) porSubprodutoMes[sub] = { qtd: 0, valor: 0 }
      porSubprodutoMes[sub].qtd += 1
      porSubprodutoMes[sub].valor += Number(it.valor || 0)
    })
  const vendasPorProdutoMes = Object.entries(porSubprodutoMes)
    .map(([subproduto, v]) => ({ subproduto, ...v }))
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
  const somaCampo = (lista, campo) => lista.reduce((s, r) => s + (Number(r[campo]) || 0), 0)
  const atendimentosHoje = somaCampo(rotinasHoje, 'clientes_recebidos')
  const retornosHoje = somaCampo(rotinasHoje, 'retornos')
  const aceitesHoje = somaCampo(rotinasHoje, 'ag_aceite')

  function breakdownConsultores(campo) {
    return rotinasHoje
      .map(r => ({ nome: nomeConsultor(r.consultor_id), valor: Number(r[campo]) || 0 }))
      .filter(r => r.valor > 0)
      .sort((a, b) => b.valor - a.valor)
  }

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

  // rotina (atendimento) por dia, últimos 7 dias, somada na equipe toda
  function trendRotina(campo) {
    const trend = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoje); d.setDate(d.getDate() - i)
      const dISO = iso(d)
      trend.push({
        label: dISO.slice(8, 10) + '/' + dISO.slice(5, 7),
        valor: somaCampo(rotinas.filter(r => r.data === dISO), campo),
      })
    }
    return trend
  }

  const dadosRankingNovo = rankingNovoMes.slice(0, 8).map(r => ({ label: r.nome, valor: r.valor, valorLabel: fmtMoeda(r.valor) }))
  const dadosRankingRenovacao = rankingRenovacaoMes.slice(0, 8).map(r => ({ label: r.nome, valor: r.valor, valorLabel: fmtMoeda(r.valor) }))
  const dadosPorProduto = vendasPorProdutoMes.slice(0, 10).map(p => ({ label: p.subproduto, valor: p.valor, valorLabel: fmtMoeda(p.valor) }))

  return (
    <div className="main">
      <div className="lm-section-title">Visão Geral</div>

      <div className="dash-grid">
        <CardComparativo titulo="Vendas Hoje" atualQtd={vendasHoje.length} atualValor={somaValor(vendasHoje)}
          anteriorQtd={vendasOntem.length} labelAnterior="ontem"
          onClick={() => setModal({ titulo: 'Vendas Hoje', tipo: 'clientes', itens: paraItensClientes(vendasHoje) })} />
        <CardComparativo titulo="Vendas na Semana" atualQtd={vendasSemana.length} atualValor={somaValor(vendasSemana)}
          anteriorQtd={vendasSemanaAnterior.length} labelAnterior="semana passada"
          onClick={() => setModal({ titulo: 'Vendas na Semana', tipo: 'clientes', itens: paraItensClientes(vendasSemana) })} />
        <CardComparativo titulo="Vendas no Mês" atualQtd={vendasMes.length} atualValor={somaValor(vendasMes)}
          anteriorQtd={vendasMesAnterior.length} labelAnterior="mês passado"
          onClick={() => setModal({ titulo: 'Vendas no Mês', tipo: 'clientes', itens: paraItensClientes(vendasMes) })} />
        <div className="dash-card">
          <div className="dash-card-titulo">Conversão da Carteira</div>
          <div className="dash-card-numero">{conversao}%</div>
          <div className="dash-card-valor">{vendidos.length} vendas / {totalCarteira} clientes</div>
        </div>
      </div>

      <div className="lm-section-title" style={{ marginTop: 24 }}>Potencial de Carteira</div>
      <div className="diag-stats">
        <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{totalCarteira}</div><div className="diag-stat-label">Clientes na Carteira</div></div>
        <div className={`diag-stat diag-stat-migracao ${potencialCarteira.migracao === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{potencialCarteira.migracao}</div><div className="diag-stat-label">Pot. Migração</div></div>
        <div className={`diag-stat diag-stat-bl ${potencialCarteira.bl === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{potencialCarteira.bl}</div><div className="diag-stat-label">Pot. BL</div></div>
        <div className={`diag-stat diag-stat-ti ${potencialCarteira.ti === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{potencialCarteira.ti}</div><div className="diag-stat-label">Pot. TI</div></div>
        <div className={`diag-stat diag-stat-voz ${potencialCarteira.voz === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{potencialCarteira.voz}</div><div className="diag-stat-label">Pot. Voz</div></div>
        <div className={`diag-stat diag-stat-credito ${potencialCarteira.credito === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{fmtMoeda(potencialCarteira.credito)}</div><div className="diag-stat-label">Crédito Pré-aprovado</div></div>
      </div>

      <div className="lm-section-title" style={{ marginTop: 24 }}>Receita por Tipo (mês atual)</div>
      <div className="dash-grid">
        <CardSimples titulo="Produto Novo" valor={novoMes.qtd} sub={`${fmtMoeda(novoMes.valor)} em receita`} />
        <CardSimples titulo="Renovação" valor={renovacaoMes.qtd} sub={`${fmtMoeda(renovacaoMes.valor)} em receita`} />
      </div>

      {!isConsultor && melhorDoDia && (
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
        <CardSimples titulo="Atendimentos" valor={atendimentosHoje} sub="clientes recebidos hoje"
          onClick={isConsultor ? undefined : () => setModal({ titulo: 'Atendimentos hoje — por consultor', tipo: 'consultores', itens: breakdownConsultores('clientes_recebidos') })} />
        <CardSimples titulo="Retornos" valor={retornosHoje} sub="retornos feitos hoje"
          onClick={isConsultor ? undefined : () => setModal({ titulo: 'Retornos hoje — por consultor', tipo: 'consultores', itens: breakdownConsultores('retornos') })} />
        <CardSimples titulo="Ag. Aceite Enviados" valor={aceitesHoje} sub="enviados hoje"
          onClick={isConsultor ? undefined : () => setModal({ titulo: 'Ag. Aceite hoje — por consultor', tipo: 'consultores', itens: breakdownConsultores('ag_aceite') })} />
      </div>

      <div className="dash-grid" style={{ marginTop: 14 }}>
        <div className="dash-card">
          <div className="dash-card-titulo">Atendimentos — últimos 7 dias</div>
          <BarChartVertical dados={trendRotina('clientes_recebidos')} altura={110} />
        </div>
        <div className="dash-card">
          <div className="dash-card-titulo">Retornos — últimos 7 dias</div>
          <BarChartVertical dados={trendRotina('retornos')} altura={110} />
        </div>
        <div className="dash-card">
          <div className="dash-card-titulo">Ag. Aceite — últimos 7 dias</div>
          <BarChartVertical dados={trendRotina('ag_aceite')} altura={110} />
        </div>
      </div>

      <div className="lm-section-title" style={{ marginTop: 24 }}>Vendas por Produto (mês atual)</div>
      {vendasPorProdutoMes.length === 0 && <div className="empty">Nenhuma venda registrada este mês</div>}
      {vendasPorProdutoMes.length > 0 && (
        <>
          <div className="dash-card" style={{ marginBottom: 14 }}>
            <BarChartHorizontal dados={dadosPorProduto} />
          </div>
          <table className="carteira-table">
            <thead><tr><th>Produto</th><th>Qtd</th><th>Valor</th></tr></thead>
            <tbody>
              {vendasPorProdutoMes.map(p => (
                <tr key={p.subproduto}>
                  <td>{p.subproduto}</td><td>{p.qtd}</td><td>{fmtMoeda(p.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!isConsultor && (
        <>
          <div className="lm-section-title" style={{ marginTop: 24 }}>Ranking de Consultores — Produto Novo (mês atual)</div>
          {rankingNovoMes.length === 0 && <div className="empty">Nenhuma venda de produto novo este mês</div>}
          {rankingNovoMes.length > 0 && (
            <>
              <div className="dash-card" style={{ marginBottom: 14 }}>
                <BarChartHorizontal dados={dadosRankingNovo} />
              </div>
              <table className="carteira-table">
                <thead>
                  <tr><th>#</th><th>Consultor</th><th>Vendas</th><th>Valor Vendido</th></tr>
                </thead>
                <tbody>
                  {rankingNovoMes.map((r, i) => (
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

          <div className="lm-section-title" style={{ marginTop: 24 }}>Ranking de Consultores — Renovação (mês atual)</div>
          {rankingRenovacaoMes.length === 0 && <div className="empty">Nenhuma venda de renovação este mês</div>}
          {rankingRenovacaoMes.length > 0 && (
            <>
              <div className="dash-card" style={{ marginBottom: 14 }}>
                <BarChartHorizontal dados={dadosRankingRenovacao} />
              </div>
              <table className="carteira-table">
                <thead>
                  <tr><th>#</th><th>Consultor</th><th>Vendas</th><th>Valor Vendido</th></tr>
                </thead>
                <tbody>
                  {rankingRenovacaoMes.map((r, i) => (
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
        </>
      )}

      {modal && (
        <ModalDetalhe titulo={modal.titulo} tipo={modal.tipo} itens={modal.itens} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

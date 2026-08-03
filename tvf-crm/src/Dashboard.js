import React, { useState, useEffect, useCallback } from 'react'
import { supabase, fetchPaginado } from './supabaseClient'

const STATUS_VENDA = ['Venda Realizada', 'Pedido Finalizado']

// Subproduto com "TA" no código é aparelho (Troca/Terminal de Aparelho) — não conta como
// produto novo/renovação de plano, mesma regra do relatório de Vendas.
const SUBPRODUTOS_APARELHO = ['TA', 'RM+TA', 'PC-TA']
const ehAparelho = (it) => SUBPRODUTOS_APARELHO.includes(it.subproduto)

function fmtMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function iso(d) {
  return d.toISOString().slice(0, 10)
}
function variacao(atual, anterior) {
  if (!anterior) return atual > 0 ? 100 : 0
  return Math.round(((atual - anterior) / anterior) * 100)
}

function CardComparativo({ titulo, icone, cor = 'roxo', atualQtd, atualValor, anteriorQtd, labelAnterior, onClick }) {
  const varQtd = variacao(atualQtd, anteriorQtd)
  return (
    <div className={`dash-card ${onClick ? 'dash-card-clicavel' : ''}`} onClick={onClick}>
      {icone && <div className={`dash-card-icon cor-${cor}`}>{icone}</div>}
      <div className="dash-card-titulo">{titulo}</div>
      <div className="dash-card-numero">{atualQtd}</div>
      <div className="dash-card-valor">{fmtMoeda(atualValor)}</div>
      <div className={`dash-card-var ${varQtd >= 0 ? 'var-up' : 'var-down'}`}>
        {varQtd >= 0 ? '▲' : '▼'} {Math.abs(varQtd)}% vs {labelAnterior} ({anteriorQtd})
      </div>
    </div>
  )
}

function CardSimples({ titulo, icone, cor = 'roxo', valor, sub, onClick }) {
  return (
    <div className={`dash-card ${onClick ? 'dash-card-clicavel' : ''}`} onClick={onClick}>
      {icone && <div className={`dash-card-icon cor-${cor}`}>{icone}</div>}
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

// funil de 3 baldes (Novos / Em Andamento / Fechados) — barras afunilando, % do total da carteira
function FunilChart({ dados, total, onClickRow }) {
  const max = Math.max(1, ...dados.map(d => d.valor))
  return (
    <div className="dash-funil">
      {dados.map((d, i) => (
        <div key={i} className={`dash-funil-row ${onClickRow ? 'dash-funil-row-clicavel' : ''}`} onClick={() => onClickRow && onClickRow(i)}>
          <div className="dash-funil-label">{d.label}</div>
          <div className="dash-funil-track">
            <div className={`dash-funil-bar dash-funil-bar-${i}`} style={{ width: `${(d.valor / max) * 100}%` }} />
          </div>
          <div className="dash-funil-valor">{d.valor} <span>({total > 0 ? Math.round((d.valor / total) * 100) : 0}%)</span></div>
        </div>
      ))}
    </div>
  )
}

// mini gráfico de barras horizontais coloridas — usado no resumo do Kanban de Temperatura
function BarChartColorido({ dados, onClickRow }) {
  const max = Math.max(1, ...dados.map(d => d.valor))
  return (
    <div className="dash-chart-h">
      {dados.map((d, i) => (
        <div key={i} className={`dash-chart-h-row ${onClickRow ? 'dash-funil-row-clicavel' : ''}`} onClick={() => onClickRow && onClickRow(d)}>
          <div className="dash-chart-h-label">{d.label}</div>
          <div className="dash-chart-h-track">
            <div className="dash-chart-h-bar" style={{ width: `${(d.valor / max) * 100}%`, background: d.cor }} />
          </div>
          <div className="dash-chart-h-valor">{d.valor}</div>
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
  const [filtroDataDe, setFiltroDataDe] = useState(iso(new Date()))
  const [filtroDataAte, setFiltroDataAte] = useState(iso(new Date()))

  const carregar = useCallback(async () => {
    setLoading(true)
    // busca rotina desde o início do período filtrado (com folga de 13 dias pra trás, pro
    // gráfico "últimos 7 dias" continuar funcionando mesmo se o filtro for um dia só)
    const folga = new Date((filtroDataDe || iso(new Date())) + 'T00:00:00'); folga.setDate(folga.getDate() - 13)
    let qRotina = supabase.from('rotina_diaria').select('*').gte('data', iso(folga))
    if (isConsultor) qRotina = qRotina.eq('consultor_id', user.id)

    const [{ data: clientesData }, { data: vendaItens }, { data: staffData }, { data: rotinaData }] = await Promise.all([
      fetchPaginado((de, ate) => {
        let q = supabase.from('carteira_cliente')
          .select('id, cnpj, razao_social, status, data_venda, data_adicao, consultor_id, potencial_migracao, potencial_bl, potencial_ti, potencial_voz, credito_pre_aprovado, alerta_renovacao, no_kanban, temperatura, temperatura_atualizada_em')
          .is('excluido_em', null).range(de, ate)
        if (isConsultor) q = q.eq('consultor_id', user.id)
        return q
      }),
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
  }, [isConsultor, user.id, filtroDataDe])

  useEffect(() => { carregar() }, [carregar])

  if (loading) return <div className="main"><div className="empty">Carregando...</div></div>

  const nomeConsultor = (id) => staff.find(s => s.id === id)?.nome || '—'
  const valorCliente = (id) => valorPorCliente[id] || 0

  const vendidos = clientes.filter(c => STATUS_VENDA.includes(c.status) && c.data_venda)

  const hoje = new Date()
  const hojeISO = iso(hoje)

  function somaValor(lista) {
    return lista.reduce((s, c) => s + valorCliente(c.id), 0)
  }
  function paraItensClientes(lista) {
    return lista.map(c => ({ ...c, consultorNome: nomeConsultor(c.consultor_id), valor: valorCliente(c.id) }))
  }
  // pra modal de Receita por Tipo — venda item não tem dado do cliente junto, busca na lista carregada
  function paraItensVenda(itens) {
    return itens.map((it, i) => {
      const cliente = clientes.find(c => c.id === it.carteira_cliente_id)
      return {
        id: i, razao_social: cliente?.razao_social, cnpj: cliente?.cnpj,
        consultorNome: nomeConsultor(cliente?.consultor_id), status: it.subproduto, valor: Number(it.valor || 0),
      }
    })
  }

  // ---- filtro global de período: tudo abaixo é derivado de filtroDataDe/filtroDataAte ----
  function aplicarPresetDashboard(tipo) {
    if (tipo === 'hoje') { setFiltroDataDe(hojeISO); setFiltroDataAte(hojeISO) }
    else if (tipo === 'ontem') { const d = new Date(hoje); d.setDate(d.getDate() - 1); setFiltroDataDe(iso(d)); setFiltroDataAte(iso(d)) }
    else if (tipo === '7dias') { const d = new Date(hoje); d.setDate(d.getDate() - 6); setFiltroDataDe(iso(d)); setFiltroDataAte(hojeISO) }
    else if (tipo === 'mes') { setFiltroDataDe(iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1))); setFiltroDataAte(hojeISO) }
  }
  const duracaoDiasPeriodo = Math.round(
    (new Date(filtroDataAte + 'T00:00:00') - new Date(filtroDataDe + 'T00:00:00')) / 86400000
  ) + 1
  const anteriorAteDate = new Date(filtroDataDe + 'T00:00:00'); anteriorAteDate.setDate(anteriorAteDate.getDate() - 1)
  const anteriorDeDate = new Date(anteriorAteDate); anteriorDeDate.setDate(anteriorDeDate.getDate() - (duracaoDiasPeriodo - 1))
  const periodoAnteriorDe = iso(anteriorDeDate)
  const periodoAnteriorAte = iso(anteriorAteDate)

  const vendasPeriodo = vendidos.filter(c => c.data_venda >= filtroDataDe && c.data_venda <= filtroDataAte)
  const vendasPeriodoAnterior = vendidos.filter(c => c.data_venda >= periodoAnteriorDe && c.data_venda <= periodoAnteriorAte)

  // clientes que entraram na carteira dentro do período (data_adicao) — usado pro Funil e
  // Potencial de Carteira, que não têm data de venda pra se guiar
  const clientesPeriodo = clientes.filter(c => c.data_adicao && c.data_adicao >= filtroDataDe && c.data_adicao <= filtroDataAte)
  const clientesAtivosPeriodo = clientesPeriodo.filter(c => !c.alerta_renovacao)

  // Cliente em renovação antecipada (M16) ainda não conta na carteira "de verdade" —
  // só entra nos totais quando virar (flag desligado manualmente).
  const clientesAtivos = clientes.filter(c => !c.alerta_renovacao)
  const totalCarteira = clientesAtivos.length
  const conversaoPeriodo = totalCarteira > 0 ? Math.round((vendasPeriodo.length / totalCarteira) * 100) : 0

  const potencialCarteiraPeriodo = clientesAtivosPeriodo.reduce((acc, c) => {
    acc.migracao += c.potencial_migracao || 0
    acc.bl += c.potencial_bl || 0
    acc.ti += c.potencial_ti || 0
    acc.voz += c.potencial_voz || 0
    acc.credito += Number(c.credito_pre_aprovado || 0)
    return acc
  }, { migracao: 0, bl: 0, ti: 0, voz: 0, credito: 0 })

  // receita por tipo (Novo/Renovação) no período filtrado, só itens dos clientes vendidos no período.
  // Subproduto com "TA" no código é aparelho — não conta como produto novo/renovação de plano.
  function receitaPorTipo(lista, tipo) {
    const idsNoPeriodo = new Set(lista.map(c => c.id))
    return itensPorCliente
      .filter(it => idsNoPeriodo.has(it.carteira_cliente_id) && it.tipo === tipo && !ehAparelho(it))
      .reduce((acc, it) => ({ qtd: acc.qtd + 1, valor: acc.valor + Number(it.valor || 0) }), { qtd: 0, valor: 0 })
  }
  const novoPeriodo = receitaPorTipo(vendasPeriodo, 'Novo')
  const renovacaoPeriodo = receitaPorTipo(vendasPeriodo, 'Renovação')
  const idsClientePeriodo = new Set(vendasPeriodo.map(c => c.id))
  const aparelhoPeriodo = itensPorCliente
    .filter(it => idsClientePeriodo.has(it.carteira_cliente_id) && ehAparelho(it))
    .reduce((acc, it) => ({ qtd: acc.qtd + 1, valor: acc.valor + Number(it.valor || 0) }), { qtd: 0, valor: 0 })

  // ranking por consultor no período filtrado, separado por tipo (Novo/Renovação) —
  // somar os dois junto escondia quem vendia mais de cada um
  const consultorPorCliente = {}
  clientes.forEach(c => { consultorPorCliente[c.id] = c.consultor_id })

  function rankingPorTipo(tipo) {
    const porConsultor = {}
    itensPorCliente
      .filter(it => idsClientePeriodo.has(it.carteira_cliente_id) && it.tipo === tipo && !ehAparelho(it))
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
  const rankingNovoPeriodo = rankingPorTipo('Novo')
  const rankingRenovacaoPeriodo = rankingPorTipo('Renovação')

  // itens de venda do período por tipo — 'aparelho' pega os marcados como aparelho, resto filtra por tipo excluindo aparelho
  function itensPorTipoPeriodo(tipoOuAparelho) {
    return itensPorCliente.filter(it => idsClientePeriodo.has(it.carteira_cliente_id) &&
      (tipoOuAparelho === 'aparelho' ? ehAparelho(it) : (it.tipo === tipoOuAparelho && !ehAparelho(it))))
  }

  // vendas por produto (subproduto) no período filtrado
  const porSubprodutoPeriodo = {}
  itensPorCliente
    .filter(it => idsClientePeriodo.has(it.carteira_cliente_id))
    .forEach(it => {
      const sub = it.subproduto || '—'
      if (!porSubprodutoPeriodo[sub]) porSubprodutoPeriodo[sub] = { qtd: 0, valor: 0 }
      porSubprodutoPeriodo[sub].qtd += 1
      porSubprodutoPeriodo[sub].valor += Number(it.valor || 0)
    })
  const vendasPorProdutoPeriodo = Object.entries(porSubprodutoPeriodo)
    .map(([subproduto, v]) => ({ subproduto, ...v }))
    .sort((a, b) => b.valor - a.valor)

  // melhor vendedor do período
  const porConsultorPeriodo = {}
  vendasPeriodo.forEach(c => {
    const id = c.consultor_id
    if (!porConsultorPeriodo[id]) porConsultorPeriodo[id] = { qtd: 0, valor: 0 }
    porConsultorPeriodo[id].qtd += 1
    porConsultorPeriodo[id].valor += valorCliente(c.id)
  })
  const rankingGeralPeriodo = Object.entries(porConsultorPeriodo)
    .map(([id, v]) => ({ id, nome: nomeConsultor(id), ...v }))
    .sort((a, b) => b.valor - a.valor)
  const melhorDoPeriodo = rankingGeralPeriodo[0]

  // indicadores de atendimento (rotina diária) do período, somados na equipe toda
  const rotinasPeriodo = rotinas.filter(r => r.data >= filtroDataDe && r.data <= filtroDataAte)
  const somaCampo = (lista, campo) => lista.reduce((s, r) => s + (Number(r[campo]) || 0), 0)
  const atendimentosPeriodo = somaCampo(rotinasPeriodo, 'clientes_recebidos')
  const retornosPeriodo = somaCampo(rotinasPeriodo, 'retornos')
  const aceitesPeriodo = somaCampo(rotinasPeriodo, 'ag_aceite')

  function breakdownConsultores(campo) {
    return rotinasPeriodo
      .map(r => ({ nome: nomeConsultor(r.consultor_id), valor: Number(r[campo]) || 0 }))
      .filter(r => r.valor > 0)
      .sort((a, b) => b.valor - a.valor)
  }

  // dias do período filtrado, dia a dia — base dos gráficos de tendência
  const diasPeriodo = []
  {
    const cursor = new Date(filtroDataDe + 'T00:00:00')
    const fimCursor = new Date(filtroDataAte + 'T00:00:00')
    while (cursor <= fimCursor) {
      const dISO = iso(cursor)
      diasPeriodo.push({ dISO, label: dISO.slice(8, 10) + '/' + dISO.slice(5, 7) })
      cursor.setDate(cursor.getDate() + 1)
    }
  }
  const dadosVendasPorDia = diasPeriodo.map(d => ({
    label: d.label, valor: vendidos.filter(c => c.data_venda === d.dISO).length,
  }))
  function trendRotina(campo) {
    return diasPeriodo.map(d => ({
      label: d.label, valor: somaCampo(rotinas.filter(r => r.data === d.dISO), campo),
    }))
  }

  const dadosRankingNovo = rankingNovoPeriodo.slice(0, 8).map(r => ({ label: r.nome, valor: r.valor, valorLabel: `${r.qtd} un. · ${fmtMoeda(r.valor)}` }))
  const dadosRankingRenovacao = rankingRenovacaoPeriodo.slice(0, 8).map(r => ({ label: r.nome, valor: r.valor, valorLabel: `${r.qtd} un. · ${fmtMoeda(r.valor)}` }))
  const dadosPorProduto = vendasPorProdutoPeriodo.slice(0, 10).map(p => ({ label: p.subproduto, valor: p.valor, valorLabel: `${p.qtd} un. · ${fmtMoeda(p.valor)}` }))

  // funil: coorte de clientes que entraram na carteira dentro do período (data_adicao),
  // divididos em 3 baldes pelo status atual (recém-chegado / sendo trabalhado / fechado)
  const novosClientesPeriodo = clientesPeriodo.filter(c => (c.status || 'Aguardando Atendimento') === 'Aguardando Atendimento' && !STATUS_VENDA.includes(c.status))
  const emAndamentoPeriodo = clientesPeriodo.filter(c => c.status !== 'Aguardando Atendimento' && !STATUS_VENDA.includes(c.status))
  const fechadosPeriodo = clientesPeriodo.filter(c => STATUS_VENDA.includes(c.status))
  const funil = [
    { label: 'Novos', valor: novosClientesPeriodo.length },
    { label: 'Em Andamento', valor: emAndamentoPeriodo.length },
    { label: 'Fechados', valor: fechadosPeriodo.length },
  ]

  // resumo do Kanban de Temperatura — só clientes enviados pro kanban (no_kanban=true) cuja
  // temperatura foi atualizada dentro do período filtrado
  const kanbanAtivosPeriodo = clientes.filter(c => c.no_kanban && c.temperatura_atualizada_em &&
    c.temperatura_atualizada_em.slice(0, 10) >= filtroDataDe && c.temperatura_atualizada_em.slice(0, 10) <= filtroDataAte)
  const CORES_TEMPERATURA = { Frio: '#378ADD', Morno: '#EF9F27', Quente: '#E05C2A', Descartado: '#888' }
  const porTemperatura = Object.keys(CORES_TEMPERATURA).map(t => ({
    label: t, valor: kanbanAtivosPeriodo.filter(c => c.temperatura === t).length, cor: CORES_TEMPERATURA[t],
  }))

  // comparativo mensal — últimos 6 meses (incluindo o atual), qtd + receita de vendas fechadas.
  // Fica de fora do filtro de período: é uma visão de tendência de longo prazo, não cabe
  // dentro de uma janela de dias como as demais seções.
  const meses6 = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    const doMes = vendidos.filter(c => {
      const dv = new Date(c.data_venda + 'T00:00:00')
      return dv.getFullYear() === d.getFullYear() && dv.getMonth() === d.getMonth()
    })
    meses6.push({
      label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      valor: doMes.length,
      valorReceita: somaValor(doMes),
    })
  }

  return (
    <div className="main">
      <div className="dash-section-title">Filtro de Período</div>
      <div className="kanban-toolbar" style={{ marginBottom: 8 }}>
        <button className="btn-filter-light" onClick={() => aplicarPresetDashboard('hoje')}>Hoje</button>
        <button className="btn-filter-light" onClick={() => aplicarPresetDashboard('ontem')}>Ontem</button>
        <button className="btn-filter-light" onClick={() => aplicarPresetDashboard('7dias')}>7 dias</button>
        <button className="btn-filter-light" onClick={() => aplicarPresetDashboard('mes')}>Mês atual</button>
        <label style={{ fontSize: 11, color: '#888' }}>De <input className="lm-input" type="date" style={{ width: 130, display: 'inline-block' }} value={filtroDataDe} onChange={e => setFiltroDataDe(e.target.value)} /></label>
        <label style={{ fontSize: 11, color: '#888' }}>Até <input className="lm-input" type="date" style={{ width: 130, display: 'inline-block' }} value={filtroDataAte} onChange={e => setFiltroDataAte(e.target.value)} /></label>
      </div>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 20px' }}>
        Esse período filtra tudo abaixo. "Comparativo Mensal (últimos 6 meses)" fica de fora — é uma
        tendência de longo prazo, não uma janela de dias.
      </p>

      <div className="dash-section-title">Visão Geral ({filtroDataDe} a {filtroDataAte})</div>
      <div className="dash-grid">
        <CardComparativo titulo="Vendas no Período" cor="roxo" atualQtd={vendasPeriodo.length} atualValor={somaValor(vendasPeriodo)}
          anteriorQtd={vendasPeriodoAnterior.length} labelAnterior="período anterior"
          onClick={() => setModal({ titulo: 'Vendas no Período', tipo: 'clientes', itens: paraItensClientes(vendasPeriodo) })} />
        <div className="dash-card dash-card-clicavel" onClick={() => setModal({ titulo: 'Clientes Vendidos no Período (Conversão da Carteira)', tipo: 'clientes', itens: paraItensClientes(vendasPeriodo) })}>
          <div className="dash-card-titulo">Conversão no Período</div>
          <div className="dash-card-numero">{conversaoPeriodo}%</div>
          <div className="dash-card-valor">{vendasPeriodo.length} vendas / {totalCarteira} clientes</div>
        </div>
      </div>

      <div className="dash-section-title">Funil da Carteira</div>
      <div className="dash-card">
        <FunilChart dados={funil} total={clientesPeriodo.length} onClickRow={(i) => {
          const listas = [novosClientesPeriodo, emAndamentoPeriodo, fechadosPeriodo]
          setModal({ titulo: `Funil — ${funil[i].label}`, tipo: 'clientes', itens: paraItensClientes(listas[i]) })
        }} />
      </div>

      <div className="dash-section-title">Potencial de Carteira</div>
      <div className="diag-stats">
        <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{clientesAtivosPeriodo.length}</div><div className="diag-stat-label">Clientes na Carteira</div></div>
        <div className={`diag-stat diag-stat-migracao ${potencialCarteiraPeriodo.migracao === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{potencialCarteiraPeriodo.migracao}</div><div className="diag-stat-label">Pot. Migração</div></div>
        <div className={`diag-stat diag-stat-bl ${potencialCarteiraPeriodo.bl === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{potencialCarteiraPeriodo.bl}</div><div className="diag-stat-label">Pot. BL</div></div>
        <div className={`diag-stat diag-stat-ti ${potencialCarteiraPeriodo.ti === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{potencialCarteiraPeriodo.ti}</div><div className="diag-stat-label">Pot. TI</div></div>
        <div className={`diag-stat diag-stat-voz ${potencialCarteiraPeriodo.voz === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{potencialCarteiraPeriodo.voz}</div><div className="diag-stat-label">Pot. Voz</div></div>
        <div className={`diag-stat diag-stat-credito ${potencialCarteiraPeriodo.credito === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{fmtMoeda(potencialCarteiraPeriodo.credito)}</div><div className="diag-stat-label">Crédito Pré-aprovado</div></div>
      </div>

      <div className="dash-section-title">Receita por Tipo</div>
      <div className="dash-grid">
        <CardSimples titulo="Produto Novo" cor="roxo" valor={novoPeriodo.qtd} sub={`${fmtMoeda(novoPeriodo.valor)} em receita`}
          onClick={() => setModal({ titulo: 'Receita — Produto Novo', tipo: 'clientes', itens: paraItensVenda(itensPorTipoPeriodo('Novo')) })} />
        <CardSimples titulo="Renovação" cor="laranja" valor={renovacaoPeriodo.qtd} sub={`${fmtMoeda(renovacaoPeriodo.valor)} em receita`}
          onClick={() => setModal({ titulo: 'Receita — Renovação', tipo: 'clientes', itens: paraItensVenda(itensPorTipoPeriodo('Renovação')) })} />
        <CardSimples titulo="Aparelho" cor="verde" valor={aparelhoPeriodo.qtd} sub={`${fmtMoeda(aparelhoPeriodo.valor)} em receita`}
          onClick={() => setModal({ titulo: 'Receita — Aparelho', tipo: 'clientes', itens: paraItensVenda(itensPorTipoPeriodo('aparelho')) })} />
      </div>

      {!isConsultor && melhorDoPeriodo && (
        <div className="dash-destaque">
          Melhor vendedor do período: <strong>{melhorDoPeriodo.nome}</strong> — {melhorDoPeriodo.qtd} venda(s) · {fmtMoeda(melhorDoPeriodo.valor)}
        </div>
      )}

      <div className="dash-section-title">Tendência de Vendas</div>
      <div className="dash-card">
        <BarChartVertical dados={dadosVendasPorDia} />
      </div>

      <div className="dash-section-title">Comparativo Mensal (últimos 6 meses)</div>
      <div className="dash-card">
        <BarChartVertical dados={meses6} altura={130} />
      </div>
      <div className="dash-card" style={{ marginTop: 14, marginBottom: 14, overflow: 'auto' }}>
        <table className="carteira-table">
          <thead><tr><th>Mês</th><th>Vendas</th><th>Receita</th></tr></thead>
          <tbody>
            {meses6.map((m, i) => <tr key={i}><td>{m.label}</td><td>{m.valor}</td><td>{fmtMoeda(m.valorReceita)}</td></tr>)}
          </tbody>
        </table>
      </div>

      <div className="dash-section-title">Indicadores de Atendimento</div>
      <div className="dash-grid">
        <CardSimples titulo="Atendimentos" cor="azul" valor={atendimentosPeriodo} sub="clientes recebidos no período"
          onClick={isConsultor ? undefined : () => setModal({ titulo: 'Atendimentos no período — por consultor', tipo: 'consultores', itens: breakdownConsultores('clientes_recebidos') })} />
        <CardSimples titulo="Retornos" cor="laranja" valor={retornosPeriodo} sub="retornos feitos no período"
          onClick={isConsultor ? undefined : () => setModal({ titulo: 'Retornos no período — por consultor', tipo: 'consultores', itens: breakdownConsultores('retornos') })} />
        <CardSimples titulo="Ag. Aceite Enviados" cor="verde" valor={aceitesPeriodo} sub="enviados no período"
          onClick={isConsultor ? undefined : () => setModal({ titulo: 'Ag. Aceite no período — por consultor', tipo: 'consultores', itens: breakdownConsultores('ag_aceite') })} />
      </div>

      <div className="dash-grid" style={{ marginTop: 14 }}>
        <div className="dash-card">
          <div className="dash-card-titulo">Atendimentos por dia</div>
          <BarChartVertical dados={trendRotina('clientes_recebidos')} altura={110} />
        </div>
        <div className="dash-card">
          <div className="dash-card-titulo">Retornos por dia</div>
          <BarChartVertical dados={trendRotina('retornos')} altura={110} />
        </div>
        <div className="dash-card">
          <div className="dash-card-titulo">Ag. Aceite por dia</div>
          <BarChartVertical dados={trendRotina('ag_aceite')} altura={110} />
        </div>
      </div>

      <div className="dash-section-title">Kanban de Temperatura (resumo)</div>
      <div className="dash-card">
        {kanbanAtivosPeriodo.length === 0 ? <div className="empty">Nenhum cliente com temperatura atualizada no período</div> : (
          <BarChartColorido dados={porTemperatura} onClickRow={(d) => setModal({
            titulo: `Kanban — ${d.label}`, tipo: 'clientes',
            itens: paraItensClientes(kanbanAtivosPeriodo.filter(c => c.temperatura === d.label)),
          })} />
        )}
      </div>

      <div className="dash-section-title">Vendas por Produto</div>
      {vendasPorProdutoPeriodo.length === 0 && <div className="empty">Nenhuma venda registrada no período</div>}
      {vendasPorProdutoPeriodo.length > 0 && (
        <>
          <div className="dash-card" style={{ marginBottom: 14 }}>
            <BarChartHorizontal dados={dadosPorProduto} />
          </div>
          <div className="dash-card" style={{ overflow: 'auto' }}>
            <table className="carteira-table">
              <thead><tr><th>Produto</th><th>Qtd</th><th>Valor</th></tr></thead>
              <tbody>
                {vendasPorProdutoPeriodo.map(p => (
                  <tr key={p.subproduto}>
                    <td>{p.subproduto}</td><td>{p.qtd}</td><td>{fmtMoeda(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isConsultor && (
        <>
          <div className="dash-section-title">Ranking — Produto Novo</div>
          {rankingNovoPeriodo.length === 0 && <div className="empty">Nenhuma venda de produto novo no período</div>}
          {rankingNovoPeriodo.length > 0 && (
            <>
              <div className="dash-card" style={{ marginBottom: 14 }}>
                <BarChartHorizontal dados={dadosRankingNovo} />
              </div>
              <div className="dash-card" style={{ overflow: 'auto' }}>
                <table className="carteira-table">
                  <thead>
                    <tr><th>#</th><th>Consultor</th><th>Vendas</th><th>Valor Vendido</th></tr>
                  </thead>
                  <tbody>
                    {rankingNovoPeriodo.map((r, i) => (
                      <tr key={r.id}>
                        <td>{i + 1}</td>
                        <td>{r.nome}</td>
                        <td>{r.qtd}</td>
                        <td>{fmtMoeda(r.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="dash-section-title">Ranking — Renovação</div>
          {rankingRenovacaoPeriodo.length === 0 && <div className="empty">Nenhuma venda de renovação no período</div>}
          {rankingRenovacaoPeriodo.length > 0 && (
            <>
              <div className="dash-card" style={{ marginBottom: 14 }}>
                <BarChartHorizontal dados={dadosRankingRenovacao} />
              </div>
              <div className="dash-card" style={{ overflow: 'auto' }}>
                <table className="carteira-table">
                  <thead>
                    <tr><th>#</th><th>Consultor</th><th>Vendas</th><th>Valor Vendido</th></tr>
                  </thead>
                  <tbody>
                    {rankingRenovacaoPeriodo.map((r, i) => (
                      <tr key={r.id}>
                        <td>{i + 1}</td>
                        <td>{r.nome}</td>
                        <td>{r.qtd}</td>
                        <td>{fmtMoeda(r.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

import React, { useState, useEffect, useCallback } from 'react'
import { supabase, fetchPaginado } from './supabaseClient'
import VendaItensModal from './VendaItensModal'

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

function ModalDetalhe({ titulo, tipo, itens, onClose, onClienteClick }) {
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
            <div key={c.id} className={`sino-item ${onClienteClick ? 'dash-card-clicavel' : ''}`}
              onClick={() => onClienteClick && onClienteClick(c)}>
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
  const [vendas, setVendas] = useState([]) // cada linha = 1 evento de venda (carteira_venda) — cliente pode ter várias
  const [valorPorVenda, setValorPorVenda] = useState({})
  const [itensPorVenda, setItensPorVenda] = useState([])
  const [staff, setStaff] = useState([])
  const [rotinas, setRotinas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [clienteEditando, setClienteEditando] = useState(null)
  const [nomesPorClienteId, setNomesPorClienteId] = useState({})

  const carregar = useCallback(async () => {
    setLoading(true)
    const de14 = new Date(); de14.setDate(de14.getDate() - 13)
    let qRotina = supabase.from('rotina_diaria').select('*').gte('data', iso(de14))
    if (isConsultor) qRotina = qRotina.eq('consultor_id', user.id)
    let qVendas = supabase.from('carteira_venda').select('id, carteira_cliente_id, consultor_id, data_venda')
    if (isConsultor) qVendas = qVendas.eq('consultor_id', user.id)

    const [{ data: clientesData }, { data: nomesData }, { data: vendasData }, { data: vendaItens }, { data: staffData }, { data: rotinaData }] = await Promise.all([
      fetchPaginado((de, ate) => {
        let q = supabase.from('carteira_cliente')
          .select('id, cnpj, razao_social, status, data_venda, consultor_id, potencial_migracao, potencial_bl, potencial_ti, potencial_voz, credito_pre_aprovado, alerta_renovacao, no_kanban, temperatura')
          .is('excluido_em', null).range(de, ate)
        if (isConsultor) q = q.eq('consultor_id', user.id)
        return q
      }),
      // pra exibir nome/cnpj de vendas de clientes já removidos da carteira (foram pra Lixeira
      // depois de vendidos) — venda continua contando nas métricas, só não teria mais nome sem isso
      fetchPaginado((de, ate) => {
        let q = supabase.from('carteira_cliente').select('id, cnpj, razao_social').range(de, ate)
        if (isConsultor) q = q.eq('consultor_id', user.id)
        return q
      }),
      qVendas,
      supabase.from('carteira_venda_item').select('carteira_venda_id, valor, tipo, subproduto'),
      supabase.from('consultores_staff').select('id, nome'),
      qRotina,
    ])
    setClientes(clientesData || [])
    const mapaNomes = {}
    ;(nomesData || []).forEach(c => { mapaNomes[c.id] = c })
    setNomesPorClienteId(mapaNomes)
    setVendas(vendasData || [])
    const mapa = {}
    ;(vendaItens || []).forEach(v => {
      mapa[v.carteira_venda_id] = (mapa[v.carteira_venda_id] || 0) + Number(v.valor || 0)
    })
    setValorPorVenda(mapa)
    setItensPorVenda(vendaItens || [])
    setStaff(staffData || [])
    setRotinas(rotinaData || [])
    setLoading(false)
  }, [isConsultor, user.id])

  useEffect(() => { carregar() }, [carregar])

  if (loading) return <div className="main"><div className="empty">Carregando...</div></div>

  const nomeConsultor = (id) => staff.find(s => s.id === id)?.nome || '—'
  const clientePorId = {}
  clientes.forEach(c => { clientePorId[c.id] = c })
  const valorVenda = (id) => valorPorVenda[id] || 0

  // vendidos = eventos de venda (carteira_venda), não clientes únicos — o mesmo cliente pode
  // ter mais de uma venda ao longo do tempo (recontato) e cada uma conta separado aqui.
  const vendidos = vendas

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
    return vendidos.filter(v => v.data_venda >= deISO && v.data_venda <= ateISO)
  }
  function somaValor(lista) {
    return lista.reduce((s, v) => s + valorVenda(v.id), 0)
  }
  // lista de eventos de venda -> linhas pro ModalDetalhe (nome do cliente + valor daquela venda).
  // Também aceita lista de clientes "crus" (Funil, Kanban) — nesse caso não tem venda associada.
  function paraItensClientes(lista) {
    return lista.map(v => {
      const ehVenda = Object.prototype.hasOwnProperty.call(v, 'carteira_cliente_id')
      const clienteId = ehVenda ? v.carteira_cliente_id : v.id
      const cliente = clientePorId[clienteId] || nomesPorClienteId[clienteId]
      return {
        id: v.id, clienteId, vendaId: ehVenda ? v.id : null, consultorId: v.consultor_id,
        razao_social: cliente?.razao_social ?? v.razao_social, cnpj: cliente?.cnpj ?? v.cnpj,
        consultorNome: nomeConsultor(v.consultor_id), status: cliente?.status ?? v.status ?? '(removido da carteira)',
        valor: ehVenda ? valorVenda(v.id) : 0,
      }
    })
  }
  // pra modal de Receita por Tipo — venda item não tem dado do cliente junto, busca via a venda
  function paraItensVenda(itens) {
    return itens.map((it, i) => {
      const venda = vendas.find(v => v.id === it.carteira_venda_id)
      const cliente = clientePorId[venda?.carteira_cliente_id] || nomesPorClienteId[venda?.carteira_cliente_id]
      return {
        id: i, razao_social: cliente?.razao_social, cnpj: cliente?.cnpj,
        consultorNome: nomeConsultor(venda?.consultor_id), status: it.subproduto, valor: Number(it.valor || 0),
      }
    })
  }

  const vendasHoje = vendidos.filter(v => v.data_venda === hojeISO)
  const vendasOntem = vendidos.filter(v => v.data_venda === ontemISO)

  const vendasSemana = noPeriodo(inicioSemanaAtual, hoje)
  const vendasSemanaAnterior = noPeriodo(inicioSemanaAnterior, fimSemanaAnterior)

  const vendasMes = noPeriodo(inicioMesAtual, hoje)
  const vendasMesAnterior = noPeriodo(inicioMesAnterior, fimMesAnterior)

  // Cliente em renovação antecipada (M16) ainda não conta na carteira "de verdade" —
  // só entra nos totais quando virar (flag desligado manualmente).
  const clientesAtivos = clientes.filter(c => !c.alerta_renovacao)
  const totalCarteira = clientesAtivos.length
  // conversão da carteira olha clientes únicos fechados (não eventos de venda — recompra do
  // mesmo cliente não deveria inflar esse %)
  const clientesFechadosUnicos = new Set(clientes.filter(c => STATUS_VENDA.includes(c.status)).map(c => c.id)).size
  const conversao = totalCarteira > 0 ? Math.round((clientesFechadosUnicos / totalCarteira) * 100) : 0

  const potencialCarteira = clientesAtivos.reduce((acc, c) => {
    acc.migracao += c.potencial_migracao || 0
    acc.bl += c.potencial_bl || 0
    acc.ti += c.potencial_ti || 0
    acc.voz += c.potencial_voz || 0
    acc.credito += Number(c.credito_pre_aprovado || 0)
    return acc
  }, { migracao: 0, bl: 0, ti: 0, voz: 0, credito: 0 })

  // receita por tipo (Novo/Renovação) no mês atual, só itens das vendas fechadas no período.
  // Subproduto com "TA" no código é aparelho — não conta como produto novo/renovação de plano.
  function receitaPorTipo(lista, tipo) {
    const idsNoPeriodo = new Set(lista.map(v => v.id))
    return itensPorVenda
      .filter(it => idsNoPeriodo.has(it.carteira_venda_id) && it.tipo === tipo && !ehAparelho(it))
      .reduce((acc, it) => ({ qtd: acc.qtd + 1, valor: acc.valor + Number(it.valor || 0) }), { qtd: 0, valor: 0 })
  }
  const novoMes = receitaPorTipo(vendasMes, 'Novo')
  const renovacaoMes = receitaPorTipo(vendasMes, 'Renovação')
  const idsVendaMes = new Set(vendasMes.map(v => v.id))
  const aparelhoMes = itensPorVenda
    .filter(it => idsVendaMes.has(it.carteira_venda_id) && ehAparelho(it))
    .reduce((acc, it) => ({ qtd: acc.qtd + 1, valor: acc.valor + Number(it.valor || 0) }), { qtd: 0, valor: 0 })

  // ranking por consultor no mês corrente, separado por tipo (Novo/Renovação) — usa o
  // consultor daquela venda específica (não o consultor atual do cliente, que pode ter mudado)
  const consultorPorVenda = {}
  vendas.forEach(v => { consultorPorVenda[v.id] = v.consultor_id })

  function rankingPorTipo(tipo) {
    const porConsultor = {}
    itensPorVenda
      .filter(it => idsVendaMes.has(it.carteira_venda_id) && it.tipo === tipo && !ehAparelho(it))
      .forEach(it => {
        const consultorId = consultorPorVenda[it.carteira_venda_id]
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

  // itens de venda do mês por tipo — 'aparelho' pega os marcados como aparelho, resto filtra por tipo excluindo aparelho
  function itensPorTipoMes(tipoOuAparelho) {
    return itensPorVenda.filter(it => idsVendaMes.has(it.carteira_venda_id) &&
      (tipoOuAparelho === 'aparelho' ? ehAparelho(it) : (it.tipo === tipoOuAparelho && !ehAparelho(it))))
  }

  // vendas por produto (subproduto) no mês atual
  const porSubprodutoMes = {}
  itensPorVenda
    .filter(it => idsVendaMes.has(it.carteira_venda_id))
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
  vendasHoje.forEach(v => {
    const id = v.consultor_id
    if (!porConsultorHoje[id]) porConsultorHoje[id] = { qtd: 0, valor: 0 }
    porConsultorHoje[id].qtd += 1
    porConsultorHoje[id].valor += valorVenda(v.id)
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

  const dadosRankingNovo = rankingNovoMes.slice(0, 8).map(r => ({ label: r.nome, valor: r.valor, valorLabel: `${r.qtd} un. · ${fmtMoeda(r.valor)}` }))
  const dadosRankingRenovacao = rankingRenovacaoMes.slice(0, 8).map(r => ({ label: r.nome, valor: r.valor, valorLabel: `${r.qtd} un. · ${fmtMoeda(r.valor)}` }))
  const dadosPorProduto = vendasPorProdutoMes.slice(0, 10).map(p => ({ label: p.subproduto, valor: p.valor, valorLabel: `${p.qtd} un. · ${fmtMoeda(p.valor)}` }))

  // funil: onde a carteira ativa está hoje — não é fluxo sequencial no tempo, é retrato do
  // momento atual em 3 baldes (recém-chegado / sendo trabalhado / fechado).
  const novosClientes = clientes.filter(c => (c.status || 'Aguardando Atendimento') === 'Aguardando Atendimento' && !STATUS_VENDA.includes(c.status))
  const emAndamento = clientes.filter(c => c.status !== 'Aguardando Atendimento' && !STATUS_VENDA.includes(c.status))
  const funil = [
    { label: 'Novos', valor: novosClientes.length },
    { label: 'Em Andamento', valor: emAndamento.length },
    { label: 'Fechados', valor: vendidos.length },
  ]

  // resumo do Kanban de Temperatura — só clientes enviados pro kanban (no_kanban=true)
  const kanbanAtivos = clientes.filter(c => c.no_kanban)
  const CORES_TEMPERATURA = { Frio: '#378ADD', Morno: '#EF9F27', Quente: '#E05C2A', Descartado: '#888' }
  const porTemperatura = Object.keys(CORES_TEMPERATURA).map(t => ({
    label: t, valor: kanbanAtivos.filter(c => c.temperatura === t).length, cor: CORES_TEMPERATURA[t],
  }))

  // comparativo mensal — últimos 6 meses (incluindo o atual), qtd + receita de vendas fechadas
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
      <div className="dash-section-title">Visão Geral</div>

      <div className="dash-grid">
        <CardComparativo titulo="Vendas Hoje" cor="roxo" atualQtd={vendasHoje.length} atualValor={somaValor(vendasHoje)}
          anteriorQtd={vendasOntem.length} labelAnterior="ontem"
          onClick={() => setModal({ titulo: 'Vendas Hoje', tipo: 'clientes', podeEditarVenda: true, itens: paraItensClientes(vendasHoje) })} />
        <CardComparativo titulo="Vendas na Semana" cor="laranja" atualQtd={vendasSemana.length} atualValor={somaValor(vendasSemana)}
          anteriorQtd={vendasSemanaAnterior.length} labelAnterior="semana passada"
          onClick={() => setModal({ titulo: 'Vendas na Semana', tipo: 'clientes', podeEditarVenda: true, itens: paraItensClientes(vendasSemana) })} />
        <CardComparativo titulo="Vendas no Mês" cor="azul" atualQtd={vendasMes.length} atualValor={somaValor(vendasMes)}
          anteriorQtd={vendasMesAnterior.length} labelAnterior="mês passado"
          onClick={() => setModal({ titulo: 'Vendas no Mês', tipo: 'clientes', podeEditarVenda: true, itens: paraItensClientes(vendasMes) })} />
        <div className="dash-card dash-card-clicavel" onClick={() => setModal({ titulo: 'Clientes Vendidos (Conversão da Carteira)', tipo: 'clientes', podeEditarVenda: true, itens: paraItensClientes(vendidos) })}>
          <div className="dash-card-titulo">Conversão da Carteira</div>
          <div className="dash-card-numero">{conversao}%</div>
          <div className="dash-card-valor">{vendidos.length} vendas / {totalCarteira} clientes</div>
        </div>
      </div>

      <div className="dash-section-title">Funil da Carteira</div>
      <div className="dash-card">
        <FunilChart dados={funil} total={totalCarteira} onClickRow={(i) => {
          const listas = [novosClientes, emAndamento, vendidos]
          setModal({ titulo: `Funil — ${funil[i].label}`, tipo: 'clientes', itens: paraItensClientes(listas[i]) })
        }} />
      </div>

      <div className="dash-section-title">Potencial de Carteira</div>
      <div className="diag-stats">
        <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{totalCarteira}</div><div className="diag-stat-label">Clientes na Carteira</div></div>
        <div className={`diag-stat diag-stat-migracao ${potencialCarteira.migracao === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{potencialCarteira.migracao}</div><div className="diag-stat-label">Pot. Migração</div></div>
        <div className={`diag-stat diag-stat-bl ${potencialCarteira.bl === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{potencialCarteira.bl}</div><div className="diag-stat-label">Pot. BL</div></div>
        <div className={`diag-stat diag-stat-ti ${potencialCarteira.ti === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{potencialCarteira.ti}</div><div className="diag-stat-label">Pot. TI</div></div>
        <div className={`diag-stat diag-stat-voz ${potencialCarteira.voz === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{potencialCarteira.voz}</div><div className="diag-stat-label">Pot. Voz</div></div>
        <div className={`diag-stat diag-stat-credito ${potencialCarteira.credito === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{fmtMoeda(potencialCarteira.credito)}</div><div className="diag-stat-label">Crédito Pré-aprovado</div></div>
      </div>

      <div className="dash-section-title">Receita por Tipo (mês atual)</div>
      <div className="dash-grid">
        <CardSimples titulo="Produto Novo" cor="roxo" valor={novoMes.qtd} sub={`${fmtMoeda(novoMes.valor)} em receita`}
          onClick={() => setModal({ titulo: 'Receita — Produto Novo (mês atual)', tipo: 'clientes', itens: paraItensVenda(itensPorTipoMes('Novo')) })} />
        <CardSimples titulo="Renovação" cor="laranja" valor={renovacaoMes.qtd} sub={`${fmtMoeda(renovacaoMes.valor)} em receita`}
          onClick={() => setModal({ titulo: 'Receita — Renovação (mês atual)', tipo: 'clientes', itens: paraItensVenda(itensPorTipoMes('Renovação')) })} />
        <CardSimples titulo="Aparelho" cor="verde" valor={aparelhoMes.qtd} sub={`${fmtMoeda(aparelhoMes.valor)} em receita`}
          onClick={() => setModal({ titulo: 'Receita — Aparelho (mês atual)', tipo: 'clientes', itens: paraItensVenda(itensPorTipoMes('aparelho')) })} />
      </div>

      {!isConsultor && melhorDoDia && (
        <div className="dash-destaque">
          Melhor vendedor do dia: <strong>{melhorDoDia.nome}</strong> — {melhorDoDia.qtd} venda(s) · {fmtMoeda(melhorDoDia.valor)}
        </div>
      )}

      <div className="dash-section-title">Tendência de Vendas (últimos 7 dias)</div>
      <div className="dash-card">
        <BarChartVertical dados={dias7} />
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

      <div className="dash-section-title">Indicadores de Atendimento (hoje)</div>
      <div className="dash-grid">
        <CardSimples titulo="Atendimentos" cor="azul" valor={atendimentosHoje} sub="clientes recebidos hoje"
          onClick={isConsultor ? undefined : () => setModal({ titulo: 'Atendimentos hoje — por consultor', tipo: 'consultores', itens: breakdownConsultores('clientes_recebidos') })} />
        <CardSimples titulo="Retornos" cor="laranja" valor={retornosHoje} sub="retornos feitos hoje"
          onClick={isConsultor ? undefined : () => setModal({ titulo: 'Retornos hoje — por consultor', tipo: 'consultores', itens: breakdownConsultores('retornos') })} />
        <CardSimples titulo="Ag. Aceite Enviados" cor="verde" valor={aceitesHoje} sub="enviados hoje"
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

      <div className="dash-section-title">Kanban de Temperatura (resumo)</div>
      <div className="dash-card">
        {kanbanAtivos.length === 0 ? <div className="empty">Nenhum cliente no Kanban</div> : (
          <BarChartColorido dados={porTemperatura} onClickRow={(d) => setModal({
            titulo: `Kanban — ${d.label}`, tipo: 'clientes',
            itens: paraItensClientes(kanbanAtivos.filter(c => c.temperatura === d.label)),
          })} />
        )}
      </div>

      <div className="dash-section-title">Vendas por Produto (mês atual)</div>
      {vendasPorProdutoMes.length === 0 && <div className="empty">Nenhuma venda registrada este mês</div>}
      {vendasPorProdutoMes.length > 0 && (
        <>
          <div className="dash-card" style={{ marginBottom: 14 }}>
            <BarChartHorizontal dados={dadosPorProduto} />
          </div>
          <div className="dash-card" style={{ overflow: 'auto' }}>
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
          </div>
        </>
      )}

      {!isConsultor && (
        <>
          <div className="dash-section-title">Ranking — Produto Novo (mês atual)</div>
          {rankingNovoMes.length === 0 && <div className="empty">Nenhuma venda de produto novo este mês</div>}
          {rankingNovoMes.length > 0 && (
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
                    {rankingNovoMes.map((r, i) => (
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

          <div className="dash-section-title">Ranking — Renovação (mês atual)</div>
          {rankingRenovacaoMes.length === 0 && <div className="empty">Nenhuma venda de renovação este mês</div>}
          {rankingRenovacaoMes.length > 0 && (
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
                    {rankingRenovacaoMes.map((r, i) => (
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
        <ModalDetalhe titulo={modal.titulo} tipo={modal.tipo} itens={modal.itens} onClose={() => setModal(null)}
          onClienteClick={modal.podeEditarVenda ? (item) => item.clienteId && setClienteEditando(item) : undefined} />
      )}

      {clienteEditando && (
        <VendaItensModal
          cliente={{ id: clienteEditando.clienteId, consultor_id: clienteEditando.consultorId, razao_social: clienteEditando.razao_social, cnpj: clienteEditando.cnpj }}
          vendaId={clienteEditando.vendaId}
          onClose={() => setClienteEditando(null)}
          onSaved={carregar}
        />
      )}
    </div>
  )
}

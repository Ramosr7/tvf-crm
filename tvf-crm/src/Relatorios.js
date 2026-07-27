import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import AnaliseIAModal from './AnaliseIAModal'

function fmtMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function dataISO(d) { return d.toISOString().slice(0, 10) }
function formatDataBR(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const PRESETS_PERIODO = [
  { label: 'Hoje', dias: 0 },
  { label: 'Ontem', dias: 1, apenasUmDia: true },
  { label: '7 dias', dias: 7 },
  { label: 'Este mês', inicioMes: true },
  { label: 'Trimestre', dias: 90 },
]

const ABAS = [
  { key: 'vendas', label: 'Vendas' },
  { key: 'kanban', label: 'Kanban' },
  { key: 'rotina', label: 'Rotina' },
  { key: 'interacoes', label: 'Interações' },
]

const DIAS_ATRASO = 5

const isGestor = (user) => user.perfil === 'Gestor'

function agruparPorConsultor(lista, pegarConsultorId) {
  const mapa = {}
  for (const item of lista) {
    const id = pegarConsultorId(item) || 'sem-consultor'
    if (!mapa[id]) mapa[id] = []
    mapa[id].push(item)
  }
  return mapa
}

export default function Relatorios({ user }) {
  const [aba, setAba] = useState('vendas')
  const [staff, setStaff] = useState([])
  const [filtroConsultor, setFiltroConsultor] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState(dataISO(new Date()))
  const [loading, setLoading] = useState(false)

  const [vendas, setVendas] = useState([])
  const [kanbanClientes, setKanbanClientes] = useState([])
  const [rotinas, setRotinas] = useState([])
  const [resumoInteracoes, setResumoInteracoes] = useState([])
  const [abasPdf, setAbasPdf] = useState(new Set(['vendas']))
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [dadosAnalise, setDadosAnalise] = useState(null)
  const [gerandoAnalise, setGerandoAnalise] = useState(false)

  useEffect(() => {
    if (isGestor(user)) supabase.from('consultores_staff').select('id, nome').order('nome').then(({ data }) => setStaff(data || []))
  }, [user])

  useEffect(() => { setAbasPdf(prev => new Set(prev).add(aba)) }, [aba])

  function alternarAbaPdf(key) {
    setAbasPdf(prev => {
      const novo = new Set(prev)
      if (novo.has(key)) { if (novo.size > 1) novo.delete(key) } else novo.add(key)
      return novo
    })
  }

  const nomeConsultor = (id) => staff.find(s => s.id === id)?.nome || '—'

  function aplicarPreset(preset) {
    const hoje = new Date()
    if (preset.inicioMes) {
      setDataDe(dataISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
      setDataAte(dataISO(hoje))
      return
    }
    const de = new Date(hoje)
    de.setDate(de.getDate() - preset.dias)
    setDataDe(dataISO(de))
    setDataAte(preset.apenasUmDia ? dataISO(de) : dataISO(hoje))
  }

  const carregarVendas = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('carteira_venda_item').select('*, carteira_cliente!inner(razao_social, cnpj, consultor_id, status)')
      .order('criado_em', { ascending: false })
    if (dataDe) q = q.gte('criado_em', dataDe)
    if (dataAte) q = q.lte('criado_em', dataAte + 'T23:59:59')
    const { data } = await q
    let linhas = data || []
    if (isGestor(user) && filtroConsultor) linhas = linhas.filter(v => v.carteira_cliente.consultor_id === filtroConsultor)
    if (!isGestor(user)) linhas = linhas.filter(v => v.carteira_cliente.consultor_id === user.id)
    setVendas(linhas)
    setLoading(false)
    return linhas
  }, [dataDe, dataAte, filtroConsultor, user])

  const carregarKanban = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('carteira_cliente').select('*').eq('no_kanban', true).is('excluido_em', null).order('temperatura')
    let linhas = data || []
    if (isGestor(user) && filtroConsultor) linhas = linhas.filter(c => c.consultor_id === filtroConsultor)
    setKanbanClientes(linhas)
    setLoading(false)
  }, [filtroConsultor, user])

  const carregarRotina = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('rotina_diaria').select('*').order('data', { ascending: false })
    if (dataDe) q = q.gte('data', dataDe)
    if (dataAte) q = q.lte('data', dataAte)
    const { data } = await q
    let linhas = data || []
    if (isGestor(user) && filtroConsultor) linhas = linhas.filter(r => r.consultor_id === filtroConsultor)
    if (!isGestor(user)) linhas = linhas.filter(r => r.consultor_id === user.id)
    setRotinas(linhas)
    setLoading(false)
    return linhas
  }, [dataDe, dataAte, filtroConsultor, user])

  const carregarInteracoes = useCallback(async () => {
    setLoading(true)
    const { data: clientes } = await supabase.from('carteira_cliente').select('id, razao_social, cnpj, status, consultor_id')
      .is('excluido_em', null).eq('alerta_renovacao', false)
    let linhasClientes = clientes || []
    if (isGestor(user) && filtroConsultor) linhasClientes = linhasClientes.filter(c => c.consultor_id === filtroConsultor)
    if (!isGestor(user)) linhasClientes = linhasClientes.filter(c => c.consultor_id === user.id)

    const ids = linhasClientes.map(c => c.id)
    const { data: interacoes } = ids.length
      ? await supabase.from('carteira_interacao').select('carteira_cliente_id, criado_em, descricao')
          .in('carteira_cliente_id', ids).order('criado_em', { ascending: true })
      : { data: [] }

    const mapa = {}
    for (const it of (interacoes || [])) {
      if (!mapa[it.carteira_cliente_id]) mapa[it.carteira_cliente_id] = []
      mapa[it.carteira_cliente_id].push(it)
    }

    const hoje = new Date()
    const resumo = linhasClientes.map(c => {
      const itens = mapa[c.id] || []
      const ultimaInteracao = itens[itens.length - 1] || null
      const ultima = ultimaInteracao?.criado_em || null
      const diasSemInteracao = ultima ? Math.floor((hoje - new Date(ultima)) / 86400000) : null
      const atrasado = diasSemInteracao === null || diasSemInteracao > DIAS_ATRASO
      // resumo textual das interações, pensado como insumo pra análise por IA depois
      const resumoTexto = itens.map(it => it.descricao).join(' // ')
      return {
        ...c, qtdInteracoes: itens.length, ultima, diasSemInteracao, atrasado,
        ultimaDescricao: ultimaInteracao?.descricao || '',
        resumoTexto,
      }
    }).sort((a, b) => (b.diasSemInteracao ?? 9999) - (a.diasSemInteracao ?? 9999))

    setResumoInteracoes(resumo)
    setLoading(false)
    return resumo
  }, [filtroConsultor, user])

  useEffect(() => {
    if (aba === 'vendas') carregarVendas()
    if (aba === 'kanban') carregarKanban()
    if (aba === 'rotina') carregarRotina()
    if (aba === 'interacoes') carregarInteracoes()
  }, [aba, carregarVendas, carregarKanban, carregarRotina, carregarInteracoes])

  async function gerarPdf() {
    setGerandoPdf(true)
    const carregadores = {
      vendas: carregarVendas, kanban: carregarKanban, rotina: carregarRotina, interacoes: carregarInteracoes,
    }
    await Promise.all(Array.from(abasPdf).map(k => carregadores[k]()))
    setGerandoPdf(false)
    setTimeout(() => window.print(), 50)
  }

  async function analisarComIA() {
    setGerandoAnalise(true)
    const [linhasVendas, linhasRotina, linhasInteracoes] = await Promise.all([
      carregarVendas(), carregarRotina(), carregarInteracoes(),
    ])
    const porConsultorVendas = agruparPorConsultor(linhasVendas, v => v.carteira_cliente?.consultor_id)
    const porConsultorRotina = agruparPorConsultor(linhasRotina, r => r.consultor_id)
    const porConsultorInteracoes = agruparPorConsultor(linhasInteracoes, r => r.consultor_id)
    const idsConsultores = new Set([
      ...Object.keys(porConsultorVendas), ...Object.keys(porConsultorRotina), ...Object.keys(porConsultorInteracoes),
    ])

    const consultores = Array.from(idsConsultores).map(id => {
      const vendasC = porConsultorVendas[id] || []
      const rotinaC = porConsultorRotina[id] || []
      const interacoesC = porConsultorInteracoes[id] || []
      const somaRotina = rotinaC.reduce((acc, r) => {
        acc.atendimentos += r.clientes_recebidos || 0
        acc.retornos += r.retornos || 0
        acc.visitas += r.visitas_agendadas || 0
        acc.agAceite += r.ag_aceite || 0
        acc.altas += r.altas || 0
        acc.bl += r.bl || 0
        acc.renovacaoMovel += r.renovacao_movel || 0
        acc.aparelho += Number(r.aparelho_valor || 0)
        return acc
      }, { atendimentos: 0, retornos: 0, visitas: 0, agAceite: 0, altas: 0, bl: 0, renovacaoMovel: 0, aparelho: 0 })
      return {
        nome: isGestor(user) ? nomeConsultor(id) : user.nome,
        periodo: `${dataDe || 'início'} a ${dataAte || 'hoje'}`,
        vendas: {
          qtd: vendasC.length,
          valor: vendasC.reduce((s, v) => s + Number(v.valor || 0), 0),
          novo: vendasC.filter(v => v.tipo === 'Novo').length,
          renovacao: vendasC.filter(v => v.tipo === 'Renovação').length,
        },
        rotina: somaRotina,
        interacoes: {
          clientes: interacoesC.length,
          atrasados: interacoesC.filter(r => r.atrasado).length,
          nuncaContatados: interacoesC.filter(r => !r.ultima).length,
          amostra: interacoesC.filter(r => r.resumoTexto).slice(0, 10)
            .map(r => ({ cliente: r.razao_social || r.cnpj, status: r.status, resumo: r.resumoTexto })),
        },
      }
    })

    setGerandoAnalise(false)
    setDadosAnalise({ periodo: `${dataDe || 'início'} a ${dataAte || 'hoje'}`, consultores })
  }

  const totalVendas = vendas.reduce((s, v) => s + Number(v.valor || 0), 0)
  const qtdNovo = vendas.filter(v => v.tipo === 'Novo').length
  const qtdRenovacao = vendas.filter(v => v.tipo === 'Renovação').length
  // "Receita" no relatório sempre prioriza produto novo vendido — renovação aparece à parte.
  const receitaNovo = vendas.filter(v => v.tipo === 'Novo').reduce((s, v) => s + Number(v.valor || 0), 0)
  const receitaRenovacao = vendas.filter(v => v.tipo === 'Renovação').reduce((s, v) => s + Number(v.valor || 0), 0)

  // vendas por produto (subproduto) no período filtrado
  const porSubprodutoVendas = {}
  vendas.forEach(v => {
    const sub = v.subproduto || '—'
    if (!porSubprodutoVendas[sub]) porSubprodutoVendas[sub] = { qtd: 0, valor: 0 }
    porSubprodutoVendas[sub].qtd += v.quantidade || 1
    porSubprodutoVendas[sub].valor += Number(v.valor || 0)
  })
  const vendasPorProduto = Object.entries(porSubprodutoVendas)
    .map(([subproduto, v]) => ({ subproduto, ...v }))
    .sort((a, b) => b.valor - a.valor)

  // ranking de consultores por tipo (Novo/Renovação) — somar os dois junto
  // esconde quem vende mais de cada um
  function rankingVendasPorTipo(tipo) {
    const porConsultor = {}
    vendas.filter(v => v.tipo === tipo).forEach(v => {
      const id = v.carteira_cliente?.consultor_id
      if (!id) return
      if (!porConsultor[id]) porConsultor[id] = { qtd: 0, valor: 0 }
      porConsultor[id].qtd += 1
      porConsultor[id].valor += Number(v.valor || 0)
    })
    return Object.entries(porConsultor)
      .map(([id, v]) => ({ id, nome: nomeConsultor(id), ...v }))
      .sort((a, b) => b.valor - a.valor)
  }
  const rankingVendasNovo = rankingVendasPorTipo('Novo')
  const rankingVendasRenovacao = rankingVendasPorTipo('Renovação')

  const kanbanPorTemperatura = ['Frio', 'Morno', 'Quente', 'Descartado'].map(t => ({
    temperatura: t, clientes: kanbanClientes.filter(c => c.temperatura === t),
  }))

  const totaisRotina = rotinas.reduce((acc, r) => {
    acc.clientes += r.clientes_recebidos || 0
    acc.retornos += r.retornos || 0
    acc.visitas += r.visitas_agendadas || 0
    acc.agAceite += r.ag_aceite || 0
    acc.altas += r.altas || 0
    acc.bl += r.bl || 0
    acc.renovacao += r.renovacao_movel || 0
    acc.aparelho += Number(r.aparelho_valor || 0)
    return acc
  }, { clientes: 0, retornos: 0, visitas: 0, agAceite: 0, altas: 0, bl: 0, renovacao: 0, aparelho: 0 })

  const tituloAba = abasPdf.size > 1
    ? ABAS.filter(a => abasPdf.has(a.key)).map(a => a.label).join(' + ')
    : ABAS.find(a => a.key === aba)?.label || ''
  const periodoTexto = (aba === 'kanban')
    ? 'Situação atual'
    : `${dataDe ? formatDataBR(dataDe) : 'início'} a ${dataAte ? formatDataBR(dataAte) : 'hoje'}`

  return (
    <div className="main">
      <div className="tabs">
        {ABAS.map(a => (
          <div key={a.key} className={`tab ${aba === a.key ? 'active' : ''}`} onClick={() => setAba(a.key)}>{a.label}</div>
        ))}
      </div>

      <div className="kanban-toolbar" style={{ marginBottom: 16 }}>
        {isGestor(user) && (
          <select className="filter-select" value={filtroConsultor} onChange={e => setFiltroConsultor(e.target.value)}>
            <option value="">Todos os consultores</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        )}
        {aba !== 'kanban' && aba !== 'interacoes' && (
          <>
            {PRESETS_PERIODO.map(p => <button key={p.label} className="btn-filter-light" onClick={() => aplicarPreset(p)}>{p.label}</button>)}
            <label style={{ fontSize: 11, color: '#888' }}>De <input className="lm-input" type="date" style={{ width: 130, display: 'inline-block' }} value={dataDe} onChange={e => setDataDe(e.target.value)} /></label>
            <label style={{ fontSize: 11, color: '#888' }}>Até <input className="lm-input" type="date" style={{ width: 130, display: 'inline-block' }} value={dataAte} onChange={e => setDataAte(e.target.value)} /></label>
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {isGestor(user) && (
            <button className="btn-filter-light" onClick={analisarComIA} disabled={gerandoAnalise}>
              {gerandoAnalise ? 'Analisando...' : '🤖 Analisar com IA'}
            </button>
          )}
          <button className="btn-save-obs" style={{ float: 'none', margin: 0 }} onClick={gerarPdf} disabled={gerandoPdf}>
            {gerandoPdf ? 'Gerando...' : '📄 Exportar PDF'}
          </button>
        </div>
      </div>

      <div className="kanban-toolbar" style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: '#888' }}>Incluir no PDF:</span>
        {ABAS.map(a => (
          <label key={a.key} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={abasPdf.has(a.key)} onChange={() => alternarAbaPdf(a.key)} />
            {a.label}
          </label>
        ))}
      </div>

      <div className="tela-relatorio">
      {loading && <div className="loading">Carregando...</div>}

      {!loading && aba === 'vendas' && (
        <>
          <div className="diag-stats">
            <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{vendas.length}</div><div className="diag-stat-label">Itens Vendidos</div></div>
            <div className="diag-stat diag-stat-credito"><div className="diag-stat-valor">{fmtMoeda(receitaNovo)}</div><div className="diag-stat-label">Receita Produto Novo</div></div>
            <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{fmtMoeda(receitaRenovacao)}</div><div className="diag-stat-label">Receita Renovação</div></div>
            <div className="diag-stat diag-stat-bl"><div className="diag-stat-valor">{qtdNovo}</div><div className="diag-stat-label">Novo</div></div>
            <div className="diag-stat diag-stat-migracao"><div className="diag-stat-valor">{qtdRenovacao}</div><div className="diag-stat-label">Renovação</div></div>
          </div>
          <div className="carteira-table-wrap">
            <table className="carteira-table">
              <thead><tr><th>Data</th><th>Cliente</th>{isGestor(user) && <th>Consultor</th>}<th>Produto</th><th>Tipo</th><th>Qtd</th><th>Valor</th></tr></thead>
              <tbody>
                {vendas.length === 0 && <tr><td colSpan={7} className="empty">Nenhuma venda no período</td></tr>}
                {vendas.map(v => (
                  <tr key={v.id}>
                    <td>{formatDataBR(v.criado_em?.slice(0, 10))}</td>
                    <td>{v.carteira_cliente?.razao_social || v.carteira_cliente?.cnpj}</td>
                    {isGestor(user) && <td>{nomeConsultor(v.carteira_cliente?.consultor_id)}</td>}
                    <td>{v.subproduto}</td><td>{v.tipo}</td><td>{v.quantidade}</td><td>{fmtMoeda(v.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lm-section-title" style={{ marginTop: 24 }}>Vendas por Produto</div>
          {vendasPorProduto.length === 0 && <div className="empty">Nenhuma venda no período</div>}
          {vendasPorProduto.length > 0 && (
            <table className="carteira-table">
              <thead><tr><th>Produto</th><th>Qtd</th><th>Valor</th></tr></thead>
              <tbody>
                {vendasPorProduto.map(p => (
                  <tr key={p.subproduto}><td>{p.subproduto}</td><td>{p.qtd}</td><td>{fmtMoeda(p.valor)}</td></tr>
                ))}
              </tbody>
            </table>
          )}

          {isGestor(user) && (
            <>
              <div className="lm-section-title" style={{ marginTop: 24 }}>Ranking — Produto Novo</div>
              {rankingVendasNovo.length === 0 && <div className="empty">Nenhuma venda de produto novo no período</div>}
              {rankingVendasNovo.length > 0 && (
                <table className="carteira-table">
                  <thead><tr><th>#</th><th>Consultor</th><th>Vendas</th><th>Valor</th></tr></thead>
                  <tbody>
                    {rankingVendasNovo.map((r, i) => (
                      <tr key={r.id}><td>{i + 1}</td><td>{r.nome}</td><td>{r.qtd}</td><td>{fmtMoeda(r.valor)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="lm-section-title" style={{ marginTop: 24 }}>Ranking — Renovação</div>
              {rankingVendasRenovacao.length === 0 && <div className="empty">Nenhuma venda de renovação no período</div>}
              {rankingVendasRenovacao.length > 0 && (
                <table className="carteira-table">
                  <thead><tr><th>#</th><th>Consultor</th><th>Vendas</th><th>Valor</th></tr></thead>
                  <tbody>
                    {rankingVendasRenovacao.map((r, i) => (
                      <tr key={r.id}><td>{i + 1}</td><td>{r.nome}</td><td>{r.qtd}</td><td>{fmtMoeda(r.valor)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      )}

      {!loading && aba === 'kanban' && (
        <>
          <div className="diag-stats">
            {kanbanPorTemperatura.map(k => (
              <div key={k.temperatura} className="diag-stat diag-stat-neutro">
                <div className="diag-stat-valor">{k.clientes.length}</div>
                <div className="diag-stat-label">{k.temperatura}</div>
              </div>
            ))}
          </div>
          <div className="carteira-table-wrap">
            <table className="carteira-table">
              <thead><tr><th>Temperatura</th><th>Cliente</th>{isGestor(user) && <th>Consultor</th>}<th>Status</th><th>Crédito</th></tr></thead>
              <tbody>
                {kanbanClientes.length === 0 && <tr><td colSpan={5} className="empty">Nenhum cliente no Kanban</td></tr>}
                {kanbanClientes.map(c => (
                  <tr key={c.id}>
                    <td>{c.temperatura}</td><td>{c.razao_social || c.cnpj}</td>
                    {isGestor(user) && <td>{nomeConsultor(c.consultor_id)}</td>}
                    <td>{c.status}</td><td>{fmtMoeda(c.credito_pre_aprovado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && aba === 'rotina' && (
        <>
          <div className="diag-stats">
            <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{totaisRotina.clientes}</div><div className="diag-stat-label">Clientes Recebidos</div></div>
            <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{totaisRotina.retornos}</div><div className="diag-stat-label">Retornos</div></div>
            <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{totaisRotina.visitas}</div><div className="diag-stat-label">Visitas</div></div>
            <div className="diag-stat diag-stat-bl"><div className="diag-stat-valor">{totaisRotina.altas}</div><div className="diag-stat-label">Altas</div></div>
            <div className="diag-stat diag-stat-migracao"><div className="diag-stat-valor">{totaisRotina.renovacao}</div><div className="diag-stat-label">Renovação Móvel</div></div>
            <div className="diag-stat diag-stat-credito"><div className="diag-stat-valor">{fmtMoeda(totaisRotina.aparelho)}</div><div className="diag-stat-label">Aparelho (R$)</div></div>
          </div>
          <div className="carteira-table-wrap">
            <table className="carteira-table">
              <thead>
                <tr><th>Data</th>{isGestor(user) && <th>Consultor</th>}<th>Clientes</th><th>Retornos</th><th>Visitas</th><th>Ag. Aceite</th><th>Altas</th><th>BL</th><th>Renovação</th><th>Aparelho</th><th>Validado</th></tr>
              </thead>
              <tbody>
                {rotinas.length === 0 && <tr><td colSpan={10} className="empty">Nenhum registro no período</td></tr>}
                {rotinas.map(r => (
                  <tr key={r.id}>
                    <td>{formatDataBR(r.data)}</td>
                    {isGestor(user) && <td>{nomeConsultor(r.consultor_id)}</td>}
                    <td>{r.clientes_recebidos || 0}</td><td>{r.retornos || 0}</td><td>{r.visitas_agendadas || 0}</td>
                    <td>{r.ag_aceite || 0}</td><td>{r.altas || 0}</td><td>{r.bl || 0}</td><td>{r.renovacao_movel || 0}</td>
                    <td>{fmtMoeda(r.aparelho_valor)}</td><td>{r.validado ? '✅' : '⏳'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!loading && aba === 'interacoes' && (
        <>
          <div className="diag-stats">
            <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{resumoInteracoes.length}</div><div className="diag-stat-label">Clientes</div></div>
            <div className="diag-stat diag-stat-migracao"><div className="diag-stat-valor">{resumoInteracoes.filter(r => r.atrasado).length}</div><div className="diag-stat-label">Atrasados (&gt;{DIAS_ATRASO}d sem contato)</div></div>
            <div className="diag-stat diag-stat-bl"><div className="diag-stat-valor">{resumoInteracoes.filter(r => !r.ultima).length}</div><div className="diag-stat-label">Nunca contatados</div></div>
          </div>
          <div className="carteira-table-wrap">
            <table className="carteira-table">
              <thead><tr><th>Cliente</th>{isGestor(user) && <th>Consultor</th>}<th>Status</th><th>Interações</th><th>Última Interação</th><th>Resumo</th><th>Dias sem contato</th><th>Alerta</th></tr></thead>
              <tbody>
                {resumoInteracoes.length === 0 && <tr><td colSpan={8} className="empty">Nenhum cliente</td></tr>}
                {resumoInteracoes.map(r => (
                  <tr key={r.id} className={r.atrasado ? 'row-pendente' : ''}>
                    <td>{r.razao_social || r.cnpj}</td>
                    {isGestor(user) && <td>{nomeConsultor(r.consultor_id)}</td>}
                    <td>{r.status}</td><td>{r.qtdInteracoes}</td>
                    <td>{r.ultima ? formatDataBR(r.ultima.slice(0, 10)) : '—'}</td>
                    <td style={{ maxWidth: 260, whiteSpace: 'normal' }} title={r.resumoTexto}>{r.ultimaDescricao || '—'}</td>
                    <td>{r.diasSemInteracao ?? '—'}</td>
                    <td>{r.atrasado ? '🔴 Atrasado' : '✅ Em dia'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </div>

      <div className="print-relatorio">
        <div className="print-cabecalho">
          <img src="/assets/logo-tvf.png" alt="TVF Telecom" className="print-logo" />
          <div>
            <div className="print-titulo">Relatório de {tituloAba}</div>
            <div className="print-periodo">{periodoTexto}</div>
          </div>
        </div>

        {abasPdf.has('vendas') && (
          <>
            {abasPdf.size > 1 && <div className="print-secao-titulo">Vendas</div>}
            <div className="print-kpis">
              <div className="print-kpi"><div className="print-kpi-valor">{vendas.length}</div><div className="print-kpi-label">Itens Vendidos</div></div>
              <div className="print-kpi print-kpi-destaque"><div className="print-kpi-valor">{fmtMoeda(receitaNovo)}</div><div className="print-kpi-label">Receita Produto Novo</div></div>
              <div className="print-kpi"><div className="print-kpi-valor">{fmtMoeda(receitaRenovacao)}</div><div className="print-kpi-label">Receita Renovação</div></div>
            </div>

            {vendasPorProduto.length > 0 && (
              <div className="print-chart">
                <div className="print-chart-titulo">Vendas por Produto</div>
                {vendasPorProduto.map(p => {
                  const max = vendasPorProduto[0].valor || 1
                  const pct = Math.max(4, Math.round((p.valor / max) * 100))
                  return (
                    <div key={p.subproduto} className="print-chart-linha">
                      <div className="print-chart-label">{p.subproduto}</div>
                      <div className="print-chart-barra-wrap"><div className="print-chart-barra" style={{ width: pct + '%' }} /></div>
                      <div className="print-chart-valor">{fmtMoeda(p.valor)}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {isGestor(user) && rankingVendasNovo.length > 0 && (
              <div className="print-chart">
                <div className="print-chart-titulo">Ranking — Produto Novo (por consultor)</div>
                {rankingVendasNovo.map(r => {
                  const max = rankingVendasNovo[0].valor || 1
                  const pct = Math.max(4, Math.round((r.valor / max) * 100))
                  return (
                    <div key={r.id} className="print-chart-linha">
                      <div className="print-chart-label">{r.nome}</div>
                      <div className="print-chart-barra-wrap"><div className="print-chart-barra print-chart-barra-alt" style={{ width: pct + '%' }} /></div>
                      <div className="print-chart-valor">{fmtMoeda(r.valor)}</div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="print-grid">
              {Object.entries(agruparPorConsultor(vendas, v => v.carteira_cliente?.consultor_id)).map(([consultorId, itens]) => {
                const porSubproduto = {}
                for (const v of itens) porSubproduto[v.subproduto] = (porSubproduto[v.subproduto] || 0) + (v.quantidade || 1)
                const totalNovo = itens.filter(v => v.tipo === 'Novo').reduce((s, v) => s + Number(v.valor || 0), 0)
                const totalRenovacao = itens.filter(v => v.tipo === 'Renovação').reduce((s, v) => s + Number(v.valor || 0), 0)
                return (
                  <div key={consultorId} className="print-bloco">
                    <div className="print-consultor">{isGestor(user) ? nomeConsultor(consultorId) : user.nome}</div>
                    {Object.entries(porSubproduto).map(([sub, qtd]) => <div key={sub}>{sub}: {qtd}</div>)}
                    <div className="print-bloco-destaque">Receita Produto Novo: {fmtMoeda(totalNovo)}</div>
                    {totalRenovacao > 0 && <div>Receita Renovação: {fmtMoeda(totalRenovacao)}</div>}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {abasPdf.has('rotina') && (
          <>
            {abasPdf.size > 1 && <div className="print-secao-titulo">Rotina</div>}
            <div className="print-grid">
              {Object.entries(agruparPorConsultor(rotinas, r => r.consultor_id)).map(([consultorId, itens]) => {
                const soma = itens.reduce((acc, r) => {
                  acc.clientes += r.clientes_recebidos || 0
                  acc.retornos += r.retornos || 0
                  acc.visitas += r.visitas_agendadas || 0
                  acc.altas += r.altas || 0
                  acc.bl += r.bl || 0
                  acc.aparelho += Number(r.aparelho_valor || 0)
                  return acc
                }, { clientes: 0, retornos: 0, visitas: 0, altas: 0, bl: 0, aparelho: 0 })
                return (
                  <div key={consultorId} className="print-bloco">
                    <div className="print-consultor">{isGestor(user) ? nomeConsultor(consultorId) : user.nome}</div>
                    <div>Clientes: {soma.clientes}</div>
                    <div>Retornos: {soma.retornos}</div>
                    <div>Visitas: {soma.visitas}</div>
                    <div>Altas: {soma.altas}</div>
                    <div>BL: {soma.bl}</div>
                    <div>Aparelho: {fmtMoeda(soma.aparelho)}</div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {abasPdf.has('kanban') && (
          <>
            {abasPdf.size > 1 && <div className="print-secao-titulo">Kanban</div>}
            <div className="print-grid">
              {Object.entries(agruparPorConsultor(kanbanClientes, c => c.consultor_id)).map(([consultorId, itens]) => (
                <div key={consultorId} className="print-bloco">
                  <div className="print-consultor">{isGestor(user) ? nomeConsultor(consultorId) : user.nome}</div>
                  {['Frio', 'Morno', 'Quente', 'Descartado'].map(t => (
                    <div key={t}>{t}: {itens.filter(c => c.temperatura === t).length}</div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {abasPdf.has('interacoes') && (
          <>
            {abasPdf.size > 1 && <div className="print-secao-titulo">Interações</div>}
            <div className="print-grid print-grid-1col">
              {Object.entries(agruparPorConsultor(resumoInteracoes, r => r.consultor_id)).map(([consultorId, itens]) => (
                <div key={consultorId} className="print-bloco">
                  <div className="print-consultor">{isGestor(user) ? nomeConsultor(consultorId) : user.nome}</div>
                  <div>Clientes: {itens.length}</div>
                  <div>Atrasados: {itens.filter(r => r.atrasado).length}</div>
                  <div>Nunca contatados: {itens.filter(r => !r.ultima).length}</div>
                  {itens.map(r => (
                    <div key={r.id} style={{ marginTop: 6 }}>
                      <strong>{r.razao_social || r.cnpj}</strong> — status: {r.status} — {r.qtdInteracoes} interação(ões)
                      {r.resumoTexto && <div style={{ fontSize: 11, color: '#555' }}>{r.resumoTexto}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {dadosAnalise && (
        <AnaliseIAModal dados={dadosAnalise} onClose={() => setDadosAnalise(null)} />
      )}
    </div>
  )
}

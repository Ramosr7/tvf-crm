import React, { useState, useEffect, useCallback } from 'react'
import { supabase, fetchPaginado } from './supabaseClient'
import AnaliseIAModal from './AnaliseIAModal'
import { ehAparelho, categoriaItem } from './vendaUtils'

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
  { key: 'vendas', label: 'Vendas', icone: '$', descricao: 'Itens vendidos, receita por produto e ranking de consultores no período.' },
  { key: 'kanban', label: 'Kanban', icone: '▦', descricao: 'Situação atual da carteira em negociação, por temperatura.' },
  { key: 'rotina', label: 'Rotina', icone: '↻', descricao: 'Atendimentos, retornos e produção diária registrada no período.' },
  { key: 'interacoes', label: 'Interações', icone: '☎', descricao: 'Última interação e dias sem contato por cliente da carteira.' },
  { key: 'funil', label: 'Funil', icone: '▽', descricao: 'Conversão por etapa: entrou na carteira, teve interação, tem retorno agendado, fechou venda.' },
]

// etapas do funil, na ordem — cada uma é um marco independente sobre o cliente que entrou no
// período (não é estritamente aninhado: dá pra vender sem ter lembrete registrado, por
// exemplo), mas mostrar como funil dá a leitura certa de "onde a maioria trava".
const ETAPAS_FUNIL = [
  { key: 'entrou', label: 'Entrou na carteira' },
  { key: 'interagiu', label: 'Teve 1ª interação' },
  { key: 'agendou', label: 'Tem retorno agendado' },
  { key: 'vendeu', label: 'Fechou venda' },
]

const DIAS_ATRASO = 5

const ESCOPO_ANALISE_OPCOES = [
  { key: 'vendas', label: 'Vendas' },
  { key: 'rotina', label: 'Rotina diária' },
  { key: 'interacoes', label: 'Interações c/ clientes' },
]

const FOCOS_ANALISE = [
  { key: 'geral', label: 'Geral (equilibrado)', instrucao: 'Faça uma análise equilibrada, cobrindo todos os dados enviados com o mesmo peso.' },
  { key: 'vendas', label: 'Performance de vendas', instrucao: 'Foque em performance de vendas: conversão, ticket médio, proporção produto novo vs renovação. Só comente rotina/interações se explicarem uma queda ou alta de vendas.' },
  { key: 'atendimento', label: 'Produtividade de atendimento', instrucao: 'Foque em produtividade de atendimento e rotina diária: volume de atendimentos, retornos, ag. aceite enviados, e o quanto isso conversou (ou não) em venda. Seja breve sobre o resto.' },
  { key: 'risco', label: 'Clientes em risco', instrucao: 'Foque em clientes parados, sem interação recente ou nunca contatados — priorize quem precisa de ação urgente. Ignore o que não for risco de perda de cliente.' },
]

const isGestor = (user) => user.perfil === 'Gestor'
const STATUS_VENDA = ['Venda Realizada', 'Pedido Finalizado']
const LABEL_CATEGORIA = { novo: 'Produto Novo', renovacao: 'Renovação', aparelho: 'Aparelho' }

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
  const [formato, setFormato] = useState('tela') // 'tela' | 'pdf'
  const [staff, setStaff] = useState([])
  const [filtroConsultor, setFiltroConsultor] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState(dataISO(new Date()))
  const [loading, setLoading] = useState(false)

  const [vendas, setVendas] = useState([])
  const [clientesDistribuidos, setClientesDistribuidos] = useState([])
  const [kanbanClientes, setKanbanClientes] = useState([])
  const [rotinas, setRotinas] = useState([])
  const [resumoInteracoes, setResumoInteracoes] = useState([])
  const [funilDados, setFunilDados] = useState(null)
  const [abasPdf, setAbasPdf] = useState(new Set(['vendas']))
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [dadosAnalise, setDadosAnalise] = useState(null)
  const [gerandoAnalise, setGerandoAnalise] = useState(false)
  const [mostrarConfigAnalise, setMostrarConfigAnalise] = useState(false)
  const [escopoAnalise, setEscopoAnalise] = useState(new Set(['vendas', 'rotina', 'interacoes']))
  const [focoAnalise, setFocoAnalise] = useState('geral')
  const [pedidoAnalise, setPedidoAnalise] = useState('')

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
    let q = supabase.from('carteira_venda_item')
      .select('*, carteira_cliente!inner(razao_social, cnpj, consultor_id, status), carteira_venda(status_apuracao, numero_pedido)')
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

  // clientes distribuídos (data_adicao) no período filtrado — base pra "conversão do período"
  // sem misturar com a carteira acumulada inteira
  const carregarDistribuidos = useCallback(async () => {
    const { data } = await fetchPaginado((de, ate) => {
      let q = supabase.from('carteira_cliente').select('id, status, consultor_id, data_adicao')
        .is('excluido_em', null).eq('alerta_renovacao', false).range(de, ate)
      if (dataDe) q = q.gte('data_adicao', dataDe)
      if (dataAte) q = q.lte('data_adicao', dataAte)
      return q
    })
    let linhas = data || []
    if (isGestor(user) && filtroConsultor) linhas = linhas.filter(c => c.consultor_id === filtroConsultor)
    if (!isGestor(user)) linhas = linhas.filter(c => c.consultor_id === user.id)
    setClientesDistribuidos(linhas)
    return linhas
  }, [dataDe, dataAte, filtroConsultor, user])

  const carregarKanban = useCallback(async () => {
    setLoading(true)
    const { data } = await fetchPaginado((de, ate) => {
      let q = supabase.from('carteira_cliente').select('*')
        .eq('no_kanban', true).is('excluido_em', null).order('temperatura').range(de, ate)
      if (dataDe) q = q.gte('data_adicao', dataDe)
      if (dataAte) q = q.lte('data_adicao', dataAte)
      return q
    })
    let linhas = data || []
    if (isGestor(user) && filtroConsultor) linhas = linhas.filter(c => c.consultor_id === filtroConsultor)
    setKanbanClientes(linhas)
    setLoading(false)
  }, [dataDe, dataAte, filtroConsultor, user])

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
    const { data: clientes } = await fetchPaginado((de, ate) => supabase.from('carteira_cliente').select('id, razao_social, cnpj, status, consultor_id')
      .is('excluido_em', null).eq('alerta_renovacao', false).range(de, ate))
    let linhasClientes = clientes || []
    if (isGestor(user) && filtroConsultor) linhasClientes = linhasClientes.filter(c => c.consultor_id === filtroConsultor)
    if (!isGestor(user)) linhasClientes = linhasClientes.filter(c => c.consultor_id === user.id)

    const ids = linhasClientes.map(c => c.id)
    let interacoes = [], lembretes = []
    if (ids.length) {
      let qInt = supabase.from('carteira_interacao').select('carteira_cliente_id, criado_em, descricao')
        .in('carteira_cliente_id', ids).order('criado_em', { ascending: true })
      if (dataDe) qInt = qInt.gte('criado_em', dataDe)
      if (dataAte) qInt = qInt.lte('criado_em', dataAte + 'T23:59:59')
      const [{ data: dataInt }, { data: dataLemb }] = await Promise.all([
        qInt,
        // lembrete (retorno agendado) pendente e com data já vencida — "atrasado" não é só
        // falta de interação, é também compromisso assumido (retorno marcado) que passou.
        supabase.from('carteira_lembrete').select('carteira_cliente_id, data_hora')
          .in('carteira_cliente_id', ids).eq('concluido', false),
      ])
      interacoes = dataInt || []
      lembretes = dataLemb || []
    }

    const mapa = {}
    for (const it of (interacoes || [])) {
      if (!mapa[it.carteira_cliente_id]) mapa[it.carteira_cliente_id] = []
      mapa[it.carteira_cliente_id].push(it)
    }
    const hoje = new Date()
    const mapaRetornoVencido = {}
    for (const l of lembretes) {
      if (new Date(l.data_hora) < hoje) mapaRetornoVencido[l.carteira_cliente_id] = true
    }

    const resumo = linhasClientes.map(c => {
      const itens = mapa[c.id] || []
      const ultimaInteracao = itens[itens.length - 1] || null
      const ultima = ultimaInteracao?.criado_em || null
      const diasSemInteracao = ultima ? Math.floor((hoje - new Date(ultima)) / 86400000) : null
      const semInteracaoRecente = diasSemInteracao === null || diasSemInteracao > DIAS_ATRASO
      const retornoAtrasado = !!mapaRetornoVencido[c.id]
      // atrasado = passou o retorno agendado (compromisso assumido) OU ficou tempo demais sem
      // nenhuma interação — o que vier primeiro, não precisa dos dois juntos
      const atrasado = semInteracaoRecente || retornoAtrasado
      // resumo textual das interações, pensado como insumo pra análise por IA depois
      const resumoTexto = itens.map(it => it.descricao).join(' // ')
      return {
        ...c, qtdInteracoes: itens.length, ultima, diasSemInteracao, atrasado,
        semInteracaoRecente, retornoAtrasado,
        ultimaDescricao: ultimaInteracao?.descricao || '',
        resumoTexto,
      }
    }).sort((a, b) => (b.diasSemInteracao ?? 9999) - (a.diasSemInteracao ?? 9999))

    setResumoInteracoes(resumo)
    setLoading(false)
    return resumo
  }, [dataDe, dataAte, filtroConsultor, user])

  // funil de conversão — pega o mesmo lote de "entrou no período" (data_adicao) já usado na
  // conversão de Vendas, e cruza com interação/lembrete/venda pra saber em que etapa cada
  // cliente parou. Cada marco é checado de forma independente (ver comentário em ETAPAS_FUNIL).
  const carregarFunil = useCallback(async () => {
    setLoading(true)
    const entrados = await carregarDistribuidos()
    const ids = entrados.map(c => c.id)

    // .in() com muitos ids estoura o tamanho da URL — quebra em lotes de 60, igual o resto do
    // app já faz (ex: UploadRenovacaoAntecipada.js)
    const CHUNK = 60
    const idsComInteracao = new Set(), idsComLembrete = new Set()
    for (let i = 0; i < ids.length; i += CHUNK) {
      const lote = ids.slice(i, i + CHUNK)
      const [{ data: interacoes }, { data: lembretes }] = await Promise.all([
        supabase.from('carteira_interacao').select('carteira_cliente_id').in('carteira_cliente_id', lote),
        supabase.from('carteira_lembrete').select('carteira_cliente_id').in('carteira_cliente_id', lote),
      ])
      for (const i2 of (interacoes || [])) idsComInteracao.add(i2.carteira_cliente_id)
      for (const l of (lembretes || [])) idsComLembrete.add(l.carteira_cliente_id)
    }

    const etapas = ETAPAS_FUNIL.map(e => {
      let qtd
      if (e.key === 'entrou') qtd = entrados.length
      else if (e.key === 'interagiu') qtd = entrados.filter(c => idsComInteracao.has(c.id)).length
      else if (e.key === 'agendou') qtd = entrados.filter(c => idsComLembrete.has(c.id)).length
      else qtd = entrados.filter(c => STATUS_VENDA.includes(c.status)).length
      return { ...e, qtd }
    })
    setFunilDados({ etapas, total: entrados.length })
    setLoading(false)
  }, [carregarDistribuidos])

  useEffect(() => {
    if (aba === 'vendas') { carregarVendas(); carregarDistribuidos() }
    if (aba === 'kanban') carregarKanban()
    if (aba === 'rotina') carregarRotina()
    if (aba === 'interacoes') carregarInteracoes()
    if (aba === 'funil') carregarFunil()
  }, [aba, carregarVendas, carregarDistribuidos, carregarKanban, carregarRotina, carregarInteracoes])

  async function gerarPdf() {
    setGerandoPdf(true)
    const carregadores = {
      vendas: () => Promise.all([carregarVendas(), carregarDistribuidos()]),
      kanban: carregarKanban, rotina: carregarRotina, interacoes: carregarInteracoes, funil: carregarFunil,
    }
    await Promise.all(Array.from(abasPdf).map(k => carregadores[k]()))
    setGerandoPdf(false)
    setTimeout(() => window.print(), 50)
  }

  function alternarEscopoAnalise(key) {
    setEscopoAnalise(prev => {
      const novo = new Set(prev)
      if (novo.has(key)) { if (novo.size > 1) novo.delete(key) } else novo.add(key)
      return novo
    })
  }

  async function analisarComIA() {
    setGerandoAnalise(true)
    const usaVendas = escopoAnalise.has('vendas')
    const usaRotina = escopoAnalise.has('rotina')
    const usaInteracoes = escopoAnalise.has('interacoes')

    // Só busca (e só manda pra IA) o que foi marcado — menos dado enviado, menos token gasto.
    const [linhasVendas, linhasRotina, linhasInteracoes] = await Promise.all([
      usaVendas ? carregarVendas() : Promise.resolve([]),
      usaRotina ? carregarRotina() : Promise.resolve([]),
      usaInteracoes ? carregarInteracoes() : Promise.resolve([]),
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
      const registro = {
        // id vai junto só pra IA poder devolver as tarefas do plano de ação já linkadas ao
        // consultor certo — não faz parte do que a IA usa pra escrever a análise em si.
        id,
        nome: isGestor(user) ? nomeConsultor(id) : user.nome,
        periodo: `${dataDe || 'início'} a ${dataAte || 'hoje'}`,
      }
      if (usaVendas) {
        const vendasNovo = vendasC.filter(v => categoriaItem(v) === 'novo')
        const vendasRenovacao = vendasC.filter(v => categoriaItem(v) === 'renovacao')
        const vendasAparelho = vendasC.filter(v => categoriaItem(v) === 'aparelho')
        // receita SEMPRE separada por categoria pra IA, nunca um total misturado — senão a
        // análise gerada acaba comparando/somando produto novo com renovação como se fosse a
        // mesma coisa
        registro.vendas = {
          qtd: vendasC.length,
          receitaProdutoNovo: vendasNovo.reduce((s, v) => s + Number(v.valor || 0), 0),
          receitaRenovacao: vendasRenovacao.reduce((s, v) => s + Number(v.valor || 0), 0),
          receitaAparelho: vendasAparelho.reduce((s, v) => s + Number(v.valor || 0), 0),
          qtdProdutoNovo: vendasNovo.length,
          qtdRenovacao: vendasRenovacao.length,
          qtdAparelho: vendasAparelho.length,
        }
      }
      if (usaRotina) {
        registro.rotina = rotinaC.reduce((acc, r) => {
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
      }
      if (usaInteracoes) {
        registro.interacoes = {
          clientes: interacoesC.length,
          atrasados: interacoesC.filter(r => r.atrasado).length,
          // atrasado se separa em dois motivos, pra IA distinguir "esqueceu o compromisso"
          // (retorno agendado venceu) de "simplesmente sumiu sem marcar nada"
          retornoAgendadoVencido: interacoesC.filter(r => r.retornoAtrasado).length,
          semContatoRecente: interacoesC.filter(r => r.semInteracaoRecente).length,
          nuncaContatados: interacoesC.filter(r => !r.ultima).length,
          amostra: interacoesC.filter(r => r.resumoTexto).slice(0, 10)
            .map(r => ({ cliente: r.razao_social || r.cnpj, status: r.status, resumo: r.resumoTexto })),
        }
      }
      return registro
    })

    const foco = FOCOS_ANALISE.find(f => f.key === focoAnalise)
    const pedido = pedidoAnalise.trim()
    // pedido livre do gestor tem prioridade sobre o preset — o preset ainda entra como pano de
    // fundo, mas quem manda é o que ele escreveu
    const focoFinal = pedido
      ? `${foco.instrucao}\n\nPedido específico do gestor: "${pedido}" — responda EXATAMENTE isso como prioridade, usando só os dados enviados abaixo. Se os dados não forem suficientes pra responder o pedido, diga isso claramente em vez de inventar ou generalizar.`
      : foco.instrucao
    setGerandoAnalise(false)
    setMostrarConfigAnalise(false)
    setDadosAnalise({ periodo: `${dataDe || 'início'} a ${dataAte || 'hoje'}`, foco: focoFinal, consultores })
  }

  const totalVendas = vendas.reduce((s, v) => s + Number(v.valor || 0), 0)
  const qtdNovo = vendas.filter(v => v.tipo === 'Novo').length
  const qtdRenovacao = vendas.filter(v => v.tipo === 'Renovação').length
  // "Receita" no relatório sempre prioriza produto novo vendido — renovação aparece à parte.
  // Aparelho (subproduto com "TA") não conta como produto novo nem renovação — é receita à parte.
  const receitaNovo = vendas.filter(v => v.tipo === 'Novo' && !ehAparelho(v)).reduce((s, v) => s + Number(v.valor || 0), 0)
  const receitaRenovacao = vendas.filter(v => v.tipo === 'Renovação' && !ehAparelho(v)).reduce((s, v) => s + Number(v.valor || 0), 0)
  const receitaAparelho = vendas.filter(ehAparelho).reduce((s, v) => s + Number(v.valor || 0), 0)
  const qtdApurado = vendas.filter(v => v.carteira_venda?.status_apuracao === 'ativado').length
  const qtdReprovado = vendas.filter(v => v.carteira_venda?.status_apuracao === 'reprovado').length

  // conversão do período: só o lote de clientes distribuído dentro do filtro de data, não a
  // carteira acumulada inteira — faz sentido comparar período com período
  const qtdDistribuidos = clientesDistribuidos.length
  const qtdFechadosDistribuidos = clientesDistribuidos.filter(c => STATUS_VENDA.includes(c.status)).length
  const conversaoPeriodo = qtdDistribuidos > 0 ? Math.round((qtdFechadosDistribuidos / qtdDistribuidos) * 100) : 0

  // vendas por produto (subproduto) no período filtrado
  const porSubprodutoVendas = {}
  vendas.forEach(v => {
    const sub = v.subproduto || '—'
    if (!porSubprodutoVendas[sub]) porSubprodutoVendas[sub] = { qtd: 0, valor: 0, categoria: categoriaItem(v) }
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
    vendas.filter(v => v.tipo === tipo && !ehAparelho(v)).forEach(v => {
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
  const periodoTexto = `${dataDe ? formatDataBR(dataDe) : 'início'} a ${dataAte ? formatDataBR(dataAte) : 'hoje'}`

  const abaAtual = ABAS.find(a => a.key === aba)

  return (
    <div className="main">
      <div className="importar-banner">
        <div className="importar-banner-icon">{abaAtual.icone}</div>
        <div>
          <div className="importar-banner-crumb">Relatórios</div>
          <div className="importar-banner-titulo">{abaAtual.label}</div>
          <div className="importar-banner-sub">{abaAtual.descricao}</div>
        </div>
      </div>

      <div className="importar-shell">
        <div className="importar-sidebar">
          <div className="importar-sidebar-titulo">Relatórios</div>
          <div className="importar-sidebar-sub">Escolha o que exportar</div>
          {ABAS.map(a => (
            <div key={a.key} className={`importar-sidebar-item ${aba === a.key ? 'active' : ''}`} onClick={() => setAba(a.key)}>
              <span className="importar-sidebar-item-icone">{a.icone}</span>{a.label}
            </div>
          ))}
        </div>

        <div className="importar-conteudo">
          <div className="lm-grid-2">
            {isGestor(user) && (
              <div className="lm-field-edit">
                <label>Consultor</label>
                <select className="filter-select" style={{ width: '100%' }} value={filtroConsultor} onChange={e => setFiltroConsultor(e.target.value)}>
                  <option value="">Todos os consultores</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </div>
            )}
            <div className="lm-field-edit">
              <label>Data inicial</label>
              <input className="lm-input" type="date" value={dataDe} onChange={e => setDataDe(e.target.value)} />
            </div>
            <div className="lm-field-edit">
              <label>Data final</label>
              <input className="lm-input" type="date" value={dataAte} onChange={e => setDataAte(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {PRESETS_PERIODO.map(p => <button key={p.label} className="btn-filter-light" onClick={() => aplicarPreset(p)}>{p.label}</button>)}
          </div>

          <div className="lm-field-edit" style={{ marginTop: 16 }}>
            <label>Formato</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`btn-filter-light ${formato === 'tela' ? 'active' : ''}`} onClick={() => setFormato('tela')}>🖥 Tela</button>
              <button className={`btn-filter-light ${formato === 'pdf' ? 'active' : ''}`} onClick={() => setFormato('pdf')}>📄 PDF</button>
            </div>
          </div>

          {formato === 'pdf' && (
            <div className="lm-field-edit" style={{ marginTop: 12 }}>
              <label>Incluir no PDF</label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {ABAS.map(a => (
                  <label key={a.key} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={abasPdf.has(a.key)} onChange={() => alternarAbaPdf(a.key)} />
                    {a.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            {isGestor(user) && (
              <button className="btn-filter-light" onClick={() => setMostrarConfigAnalise(true)} disabled={gerandoAnalise}>
                {gerandoAnalise ? 'Analisando...' : '✨ Analisar com IA'}
              </button>
            )}
            <button className="btn-save-obs" style={{ float: 'none', margin: 0, flex: 1 }}
              onClick={formato === 'pdf' ? gerarPdf : () => document.getElementById('relatorio-resultado')?.scrollIntoView({ behavior: 'smooth' })}
              disabled={gerandoPdf}>
              {gerandoPdf ? 'Gerando...' : formato === 'pdf' ? '📄 Gerar Relatório (PDF)' : '▸ Gerar Relatório'}
            </button>
          </div>
        </div>
      </div>

      {mostrarConfigAnalise && (
        <div className="modal-overlay" onClick={() => setMostrarConfigAnalise(false)}>
          <div className="lead-modal" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
            <div className="lm-header">
              <div className="lm-header-left">
                <div style={{ fontSize: 17, fontWeight: 700 }}>Analisar com IA</div>
                <div className="lm-phone">O que a IA deve olhar?</div>
              </div>
              <button className="lm-close" onClick={() => setMostrarConfigAnalise(false)}>✕</button>
            </div>
            <div className="lm-body">
              <div className="lm-section-title">Dados</div>
              {ESCOPO_ANALISE_OPCOES.map(o => (
                <label key={o.key} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 0' }}>
                  <input type="checkbox" checked={escopoAnalise.has(o.key)} onChange={() => alternarEscopoAnalise(o.key)} />
                  {o.label}
                </label>
              ))}
              <div className="lm-section-title" style={{ marginTop: 12 }}>Foco da análise</div>
              <select className="filter-select" style={{ width: '100%' }} value={focoAnalise} onChange={e => setFocoAnalise(e.target.value)}>
                {FOCOS_ANALISE.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <div className="lm-section-title" style={{ marginTop: 12 }}>Pedido específico (opcional)</div>
              <textarea className="obs-area" style={{ width: '100%', minHeight: 70 }}
                placeholder='Ex: "quem tá sem interação há mais de 5 dias" ou "compara conversão de produto novo entre os consultores"'
                value={pedidoAnalise} onChange={e => setPedidoAnalise(e.target.value)} />
            </div>
            <div className="lm-actions">
              <button className="btn-save-obs" style={{ flex: 1, float: 'none', margin: 0 }}
                onClick={() => { setMostrarConfigAnalise(false); analisarComIA() }} disabled={gerandoAnalise}>
                {gerandoAnalise ? 'Analisando...' : 'Gerar Análise'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tela-relatorio" id="relatorio-resultado" style={{ marginTop: 24 }}>
      <div className="dash-section-title">Relatório — {abaAtual.label}</div>
      <div className="lm-resumo" style={{ marginBottom: 16 }}>Período: {periodoTexto}</div>
      {loading && <div className="loading">Carregando...</div>}

      {!loading && aba === 'vendas' && (
        <>
          <div className="diag-stats">
            <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{vendas.length}</div><div className="diag-stat-label">Itens Vendidos</div></div>
            <div className="diag-stat diag-stat-credito"><div className="diag-stat-valor">{fmtMoeda(receitaNovo)}</div><div className="diag-stat-label">Receita Produto Novo</div></div>
            <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{fmtMoeda(receitaRenovacao)}</div><div className="diag-stat-label">Receita Renovação</div></div>
            <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{fmtMoeda(receitaAparelho)}</div><div className="diag-stat-label">Receita Aparelho</div></div>
            <div className="diag-stat diag-stat-bl"><div className="diag-stat-valor">{qtdNovo}</div><div className="diag-stat-label">Novo</div></div>
            <div className="diag-stat diag-stat-migracao"><div className="diag-stat-valor">{qtdRenovacao}</div><div className="diag-stat-label">Renovação</div></div>
            <div className="diag-stat diag-stat-ti"><div className="diag-stat-valor">{qtdApurado}</div><div className="diag-stat-label">Apurado (Finalizado)</div></div>
            <div className={`diag-stat diag-stat-voz ${qtdReprovado === 0 ? 'diag-stat-zero' : ''}`}><div className="diag-stat-valor">{qtdReprovado}</div><div className="diag-stat-label">Reprovado</div></div>
            <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{conversaoPeriodo}%</div><div className="diag-stat-label">Conversão do Período ({qtdFechadosDistribuidos}/{qtdDistribuidos} distribuídos)</div></div>
          </div>
          <div className="carteira-table-wrap">
            <table className="carteira-table">
              <thead><tr><th>Data</th><th>Cliente</th>{isGestor(user) && <th>Consultor</th>}<th>Produto</th><th>Tipo</th><th>Qtd</th><th>Valor</th><th>Apuração</th></tr></thead>
              <tbody>
                {vendas.length === 0 && <tr><td colSpan={8} className="empty">Nenhuma venda no período</td></tr>}
                {vendas.map(v => (
                  <tr key={v.id}>
                    <td>{formatDataBR(v.criado_em?.slice(0, 10))}</td>
                    <td>{v.carteira_cliente?.razao_social || v.carteira_cliente?.cnpj}</td>
                    {isGestor(user) && <td>{nomeConsultor(v.carteira_cliente?.consultor_id)}</td>}
                    <td>{v.subproduto}</td><td>{v.tipo}</td><td>{v.quantidade}</td><td>{fmtMoeda(v.valor)}</td>
                    <td>
                      {v.carteira_venda?.status_apuracao === 'ativado' && <span className="tag tag-avancado">Apurado</span>}
                      {v.carteira_venda?.status_apuracao === 'reprovado' && <span className="tag tag-ap">Reprovado</span>}
                      {(!v.carteira_venda || v.carteira_venda?.status_apuracao === 'pendente') && <span style={{ color: 'rgba(245,241,250,0.48)', fontSize: 11 }}>Aguardando</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginTop: 6 }}>TOTAL: {vendas.length}</div>

          <div className="dash-section-title" style={{ marginTop: 24 }}>Vendas por Produto</div>
          {vendasPorProduto.length === 0 && <div className="empty">Nenhuma venda no período</div>}
          {vendasPorProduto.length > 0 && (
            <div className="carteira-table-wrap">
              <table className="carteira-table">
                <thead><tr><th>Produto</th><th>Categoria</th><th>Qtd</th><th>Valor</th></tr></thead>
                <tbody>
                  {vendasPorProduto.map(p => (
                    <tr key={p.subproduto}><td>{p.subproduto}</td><td>{LABEL_CATEGORIA[p.categoria]}</td><td>{p.qtd}</td><td>{fmtMoeda(p.valor)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isGestor(user) && (
            <>
              <div className="dash-section-title" style={{ marginTop: 24 }}>Ranking — Produto Novo</div>
              {rankingVendasNovo.length === 0 && <div className="empty">Nenhuma venda de produto novo no período</div>}
              {rankingVendasNovo.length > 0 && (
                <div className="carteira-table-wrap">
                  <table className="carteira-table">
                    <thead><tr><th>#</th><th>Consultor</th><th>Vendas</th><th>Valor</th></tr></thead>
                    <tbody>
                      {rankingVendasNovo.map((r, i) => (
                        <tr key={r.id}><td>{i + 1}</td><td>{r.nome}</td><td>{r.qtd}</td><td>{fmtMoeda(r.valor)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="dash-section-title" style={{ marginTop: 24 }}>Ranking — Renovação</div>
              {rankingVendasRenovacao.length === 0 && <div className="empty">Nenhuma venda de renovação no período</div>}
              {rankingVendasRenovacao.length > 0 && (
                <div className="carteira-table-wrap">
                  <table className="carteira-table">
                    <thead><tr><th>#</th><th>Consultor</th><th>Vendas</th><th>Valor</th></tr></thead>
                    <tbody>
                      {rankingVendasRenovacao.map((r, i) => (
                        <tr key={r.id}><td>{i + 1}</td><td>{r.nome}</td><td>{r.qtd}</td><td>{fmtMoeda(r.valor)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginTop: 6 }}>TOTAL: {kanbanClientes.length}</div>
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
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginTop: 6 }}>TOTAL: {rotinas.length}</div>
        </>
      )}
      {!loading && aba === 'interacoes' && (
        <>
          <div className="diag-stats">
            <div className="diag-stat diag-stat-neutro"><div className="diag-stat-valor">{resumoInteracoes.length}</div><div className="diag-stat-label">Clientes</div></div>
            <div className="diag-stat diag-stat-migracao"><div className="diag-stat-valor">{resumoInteracoes.filter(r => r.atrasado).length}</div><div className="diag-stat-label">Atrasados (retorno vencido ou &gt;{DIAS_ATRASO}d sem contato)</div></div>
            <div className="diag-stat diag-stat-voz"><div className="diag-stat-valor">{resumoInteracoes.filter(r => r.retornoAtrasado).length}</div><div className="diag-stat-label">Com retorno agendado vencido</div></div>
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
                    <td>
                      {!r.atrasado && '✅ Em dia'}
                      {r.atrasado && r.retornoAtrasado && '⏰ Retorno vencido'}
                      {r.atrasado && !r.retornoAtrasado && '🔴 Sem contato'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginTop: 6 }}>TOTAL: {resumoInteracoes.length}</div>
        </>
      )}

      {!loading && aba === 'funil' && funilDados && (
        <>
          <div className="lm-resumo" style={{ marginBottom: 16 }}>
            Cada etapa é um marco independente sobre quem entrou na carteira no período — não é
            estritamente sequencial (dá pra vender sem lembrete registrado, por exemplo), mas
            mostra onde a maioria trava.
          </div>
          <div className="dash-funil">
            {funilDados.etapas.map((e, i) => {
              const pct = funilDados.total > 0 ? Math.round((e.qtd / funilDados.total) * 100) : 0
              const anterior = i > 0 ? funilDados.etapas[i - 1] : null
              const perda = anterior && anterior.qtd > 0 ? Math.round(((anterior.qtd - e.qtd) / anterior.qtd) * 100) : null
              return (
                <React.Fragment key={e.key}>
                  <div className="dash-funil-row">
                    <div className="dash-funil-label">{e.label}</div>
                    <div className="dash-funil-track">
                      <div className={`dash-funil-bar dash-funil-bar-${i}`} style={{ width: `${Math.max(pct, 3)}%` }} />
                    </div>
                    <div className="dash-funil-valor">{e.qtd} <span>({pct}%)</span></div>
                  </div>
                  {perda !== null && perda > 0 && (
                    <div className="dash-funil-perda">▼ {perda}% de perda vindo de "{anterior.label}"</div>
                  )}
                </React.Fragment>
              )
            })}
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
              <div className="print-kpi"><div className="print-kpi-valor">{fmtMoeda(receitaAparelho)}</div><div className="print-kpi-label">Receita Aparelho</div></div>
              <div className="print-kpi print-kpi-destaque"><div className="print-kpi-valor">{qtdApurado}</div><div className="print-kpi-label">Apurado (Finalizado)</div></div>
              <div className="print-kpi"><div className="print-kpi-valor">{qtdReprovado}</div><div className="print-kpi-label">Reprovado</div></div>
              <div className="print-kpi"><div className="print-kpi-valor">{conversaoPeriodo}%</div><div className="print-kpi-label">Conversão do Período ({qtdFechadosDistribuidos}/{qtdDistribuidos})</div></div>
            </div>

            {vendasPorProduto.length > 0 && (
              <div className="print-chart">
                <div className="print-chart-titulo">Vendas por Produto</div>
                {vendasPorProduto.map(p => {
                  const max = vendasPorProduto[0].valor || 1
                  const pct = Math.max(4, Math.round((p.valor / max) * 100))
                  return (
                    <div key={p.subproduto} className="print-chart-linha">
                      <div className="print-chart-label">{p.subproduto} <span style={{ color: 'rgba(245,241,250,0.48)', fontWeight: 400 }}>({LABEL_CATEGORIA[p.categoria]})</span></div>
                      <div className="print-chart-barra-wrap"><div className="print-chart-barra" style={{ width: pct + '%' }} /></div>
                      <div className="print-chart-valor">{p.qtd} un. · {fmtMoeda(p.valor)}</div>
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
                      <div className="print-chart-valor">{r.qtd} un. · {fmtMoeda(r.valor)}</div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="print-grid">
              {Object.entries(agruparPorConsultor(vendas, v => v.carteira_cliente?.consultor_id)).map(([consultorId, itens]) => {
                const porSubproduto = {}
                for (const v of itens) porSubproduto[v.subproduto] = (porSubproduto[v.subproduto] || 0) + (v.quantidade || 1)
                const totalNovo = itens.filter(v => v.tipo === 'Novo' && !ehAparelho(v)).reduce((s, v) => s + Number(v.valor || 0), 0)
                const totalRenovacao = itens.filter(v => v.tipo === 'Renovação' && !ehAparelho(v)).reduce((s, v) => s + Number(v.valor || 0), 0)
                const totalAparelho = itens.filter(ehAparelho).reduce((s, v) => s + Number(v.valor || 0), 0)
                return (
                  <div key={consultorId} className="print-bloco">
                    <div className="print-consultor">{isGestor(user) ? nomeConsultor(consultorId) : user.nome}</div>
                    {Object.entries(porSubproduto).map(([sub, qtd]) => <div key={sub}>{sub}: {qtd}</div>)}
                    <div className="print-bloco-destaque">Receita Produto Novo: {fmtMoeda(totalNovo)}</div>
                    {totalRenovacao > 0 && <div>Receita Renovação: {fmtMoeda(totalRenovacao)}</div>}
                    {totalAparelho > 0 && <div>Receita Aparelho: {fmtMoeda(totalAparelho)}</div>}
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
                      {r.resumoTexto && <div style={{ fontSize: 11, color: 'rgba(245,241,250,0.68)' }}>{r.resumoTexto}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {abasPdf.has('funil') && funilDados && (
          <>
            {abasPdf.size > 1 && <div className="print-secao-titulo">Funil</div>}
            <div className="print-chart">
              {funilDados.etapas.map(e => {
                const pct = funilDados.total > 0 ? Math.round((e.qtd / funilDados.total) * 100) : 0
                return (
                  <div key={e.key} className="print-chart-linha">
                    <div className="print-chart-label">{e.label}</div>
                    <div className="print-chart-barra-wrap"><div className="print-chart-barra" style={{ width: Math.max(pct, 3) + '%' }} /></div>
                    <div className="print-chart-valor">{e.qtd} ({pct}%)</div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {dadosAnalise && (
        <AnaliseIAModal dados={dadosAnalise} user={user} onClose={() => setDadosAnalise(null)} />
      )}
    </div>
  )
}

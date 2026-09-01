import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'

// visão pessoal e intransferível — só o João acessa (trava também em App.js e na RLS da
// tabela comissao_pilar). Regra de remuneração: cada pilar tem uma métrica-gatilho (Altas/
// Banda Larga/Renovação Móvel são quantidade; Avançado/Outras Receitas/Aparelho já são R$)
// que decide em qual faixa de atingimento você caiu — abaixo de 80% não paga nada nesse
// pilar. A faixa define um % que multiplica a RECEITA daquele pilar (nunca a quantidade
// direto), mesmo nos pilares medidos em quantidade.
export const JOAO_ID = '971645c3-b9a3-44a9-9848-5a5fa83ff8b1'

const ORDEM_PILARES = ['ALTAS', 'BANDA_LARGA', 'RENOVACAO_MOVEL', 'AVANCADO', 'OUTRAS_RECEITAS', 'APARELHO']
const PILAR_INFO = {
  ALTAS: { label: 'Altas', formato: 'inteiro' },
  BANDA_LARGA: { label: 'Banda Larga', formato: 'inteiro' },
  RENOVACAO_MOVEL: { label: 'Renovação Móvel', formato: 'inteiro' },
  AVANCADO: { label: 'Avançado', formato: 'moeda' },
  OUTRAS_RECEITAS: { label: 'Outras Receitas', formato: 'moeda' },
  APARELHO: { label: 'Aparelho', formato: 'moeda' },
}
// taxa por pilar e faixa (1=80-99%, 2=100-119%, 3=120%+) — combinação exata do print do
// plano de remuneração que o João passou.
const TAXAS = {
  ALTAS: { 1: 0.02, 2: 0.04, 3: 0.08 },
  BANDA_LARGA: { 1: 0.02, 2: 0.04, 3: 0.08 },
  RENOVACAO_MOVEL: { 1: 0.01, 2: 0.02, 3: 0.03 },
  AVANCADO: { 1: 0.02, 2: 0.04, 3: 0.08 },
  OUTRAS_RECEITAS: { 1: 0.02, 2: 0.04, 3: 0.08 },
  APARELHO: { 1: 0.001, 2: 0.002, 3: 0.003 },
}

// projeção da Variável usa a MESMA referência do Plano Comercial (mesmo fator de conversão
// por vertical, mesmo teto no Avançado) — mapeia pilar da comissão pro código de vertical do
// PC. Outras Receitas não tem vertical própria no PC, fica sem fator específico (usa 0.8
// default, igual PlanoComercial.js faz pra vertical sem linha em plano_comercial_config).
const PILAR_PARA_VERTICAL_PC = { ALTAS: 'HA', BANDA_LARGA: 'BL', RENOVACAO_MOVEL: 'MM', APARELHO: 'APARELHO', AVANCADO: 'AVANCADO' }
// mesmo teto usado em PlanoComercial.js pro pilar Avançado (venda esporádica/lumpy — um dia
// bom sozinho explode a extrapolação linear)
const TETO_PROJECAO_AVANCADO = 12000

// mesma agrupação de subproduto usada na leitura do Radar Gerencial (api/parse-radar-pdf.js)
// — pra "Real Apurado" bater com a mesma régua que já categoriza o time inteiro.
const SUBPRODUTO_PARA_PILAR = {
  TA: 'APARELHO', 'RM+TA': 'APARELHO', 'PC-TA': 'APARELHO',
  HA: 'ALTAS', HP: 'ALTAS', PN: 'ALTAS',
  RM: 'RENOVACAO_MOVEL',
  BL: 'BANDA_LARGA', 'MT - BL': 'BANDA_LARGA',
  SVA: 'OUTRAS_RECEITAS', IN: 'OUTRAS_RECEITAS',
  'CPF FIBRA': 'OUTRAS_RECEITAS', 'CPF MÓVEL': 'OUTRAS_RECEITAS', 'MP - CPF MÓVEL': 'OUTRAS_RECEITAS',
  'CPF FIXA': 'OUTRAS_RECEITAS', 'MT - CPF FIXA': 'OUTRAS_RECEITAS', 'CPF TV': 'OUTRAS_RECEITAS',
  'VIVO TECH': 'AVANCADO', VVN: 'AVANCADO', 'MT - VVN': 'AVANCADO', SIP: 'AVANCADO', LINK: 'AVANCADO', '0800': 'AVANCADO',
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
// taxa de Aparelho é 0,1/0,2/0,3% — arredondar pra inteiro sempre dá "0%", então mantém 1 casa
function fmtPctTaxa(v) {
  const pct = (v || 0) * 100
  return `${pct % 1 === 0 ? pct : pct.toFixed(1)}%`
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
function calcularDU(mesReferencia) {
  const [ano, mes] = mesReferencia.split('-').map(Number)
  const primeiroDia = new Date(ano, mes - 1, 1)
  const ultimoDia = new Date(ano, mes, 0)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const duTotais = contarDiasUteis(primeiroDia, ultimoDia)
  let duRestantes
  if (ultimoDia < hoje) duRestantes = 0
  else if (primeiroDia > hoje) duRestantes = duTotais
  else {
    // hoje já conta como decorrido assim que o dia começa (não como "restante") — restante
    // só soma dias úteis estritamente depois de hoje.
    const amanha = new Date(hoje)
    amanha.setDate(amanha.getDate() + 1)
    duRestantes = contarDiasUteis(amanha, ultimoDia)
  }
  return { duTotais, duRestantes }
}
function faixaDe(pct) {
  if (pct >= 1.2) return 3
  if (pct >= 1.0) return 2
  if (pct >= 0.8) return 1
  return 0
}
function comissaoDoPilar(pilar, receita, pctAtingimento) {
  const faixa = faixaDe(pctAtingimento)
  if (faixa === 0) return { faixa, taxa: 0, comissao: 0 }
  const taxa = TAXAS[pilar][faixa]
  return { faixa, taxa, comissao: receita * taxa }
}

// rótulo/campos de cada visão, usado tanto nos cards quanto no modal de detalhamento
const VISOES = {
  esteira: { titulo: 'Comissão — Esteira Atual', receita: l => l.row.receita, pct: l => l.pctEsteira, calc: l => l.esteira },
  projecao: { titulo: 'Comissão — Projeção do Mês', receita: l => l.receitaProjetada, pct: l => l.pctProjecao, calc: l => l.projecao },
  apurado: { titulo: 'Comissão — Real Apurado', receita: l => l.receitaApurada, pct: l => l.pctEsteira, calc: l => l.apuradoCalc },
}

// abre ao clicar num dos 3 cards de total — mostra, pilar a pilar, a receita-base usada
// naquela visão, a % de atingimento/faixa que decidiu a taxa, e a comissão resultante,
// pra dar pra conferir de onde veio cada centavo do total do card.
function DetalheFaixaModal({ visao, linhas, total, onClose }) {
  const v = VISOES[visao]
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lead-modal" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <div className="lm-header-left"><div>{v.titulo}</div></div>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>
        <div className="lm-body">
          {visao === 'apurado' && (
            <div className="lm-resumo" style={{ marginBottom: 12, fontSize: 12, color: '#888' }}>
              Só conta pedido com "Pedido Finalizado" batido na Apuração de Vendas — se o pedido do
              operador não achou a venda correspondente no CRM, ele nunca vira "ativado" e não entra
              aqui (confere a tela Importar → Apuração Pedidos pra ver quantos ficaram sem match). Além
              disso, pilar abaixo de 80% de atingimento na Esteira não paga nada mesmo tendo receita
              apurada — é por isso que Altas e Renovação Móvel podem aparecer com R$ apurado mas
              comissão zerada.
            </div>
          )}
          <div className="carteira-table-wrap">
            <table className="carteira-table">
              <thead><tr><th>Pilar</th><th>Receita-base</th><th>% Atingimento</th><th>Comissão</th></tr></thead>
              <tbody>
                {linhas.map(l => {
                  const receita = v.receita(l)
                  const pct = v.pct(l)
                  const calc = v.calc(l)
                  return (
                    <tr key={l.pilar}>
                      <td>{l.info.label}</td>
                      <td>{fmtMoeda(receita)}</td>
                      <td><span className="plano-semaforo" style={{ background: calc.faixa === 0 ? '#999999' : calc.faixa === 3 ? '#28A745' : calc.faixa === 2 ? '#F39C12' : '#E74C3C' }}>
                        {fmtPct(pct)}{calc.faixa > 0 && ` · F${calc.faixa} (${fmtPctTaxa(calc.taxa)})`}
                      </span></td>
                      <td>{fmtMoeda(calc.comissao)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>Total</td><td style={{ fontWeight: 600 }}>{fmtMoeda(total)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MinhaComissao() {
  const [mesReferencia, setMesReferencia] = useState(mesAtualISO())
  const [pilares, setPilares] = useState({})
  const [apurado, setApurado] = useState({})
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [editandoMeta, setEditandoMeta] = useState(null)
  const [detalheAberto, setDetalheAberto] = useState(null) // null | 'esteira' | 'projecao' | 'apurado'

  const fetchDados = useCallback(async () => {
    setLoading(true)
    const mesData = `${mesReferencia}-01`
    const [ano, mes] = mesReferencia.split('-').map(Number)
    const proximoMesData = `${mes === 12 ? ano + 1 : ano}-${String(mes === 12 ? 1 : mes + 1).padStart(2, '0')}-01`

    const [{ data: pilaresData }, { data: vendasData }, { data: configData }] = await Promise.all([
      supabase.from('comissao_pilar').select('*').eq('mes_referencia', mesData),
      // carteira_venda.consultor_id é o vendedor individual, não o supervisor/time — o João
      // (Gestor) nunca aparece aqui. A Variável é o resultado dos 4 times inteiros, então
      // conta a apuração de TODO mundo, sem filtrar por consultor.
      supabase.from('carteira_venda').select('id')
        .eq('status_apuracao', 'ativado')
        .gte('data_venda', mesData).lt('data_venda', proximoMesData),
      // mesma "quebra" (fator de conversão) por vertical usada no Plano Comercial — projeção
      // da Variável tem que usar a mesma referência, não uma conta separada.
      supabase.from('plano_comercial_config').select('*'),
    ])

    const mapaPilares = {}
    for (const p of (pilaresData || [])) mapaPilares[p.pilar] = p
    setPilares(mapaPilares)

    const mapaConfig = {}
    for (const c of (configData || [])) mapaConfig[c.vertical] = c.fator_conversao
    setConfig(mapaConfig)

    const idsVenda = (vendasData || []).map(v => v.id)
    const mapaApurado = {}
    if (idsVenda.length > 0) {
      const { data: itens } = await supabase.from('carteira_venda_item')
        .select('subproduto, valor').in('carteira_venda_id', idsVenda)
      for (const it of (itens || [])) {
        const pilar = SUBPRODUTO_PARA_PILAR[it.subproduto]
        if (!pilar) continue
        mapaApurado[pilar] = (mapaApurado[pilar] || 0) + Number(it.valor || 0)
      }
    }
    setApurado(mapaApurado)
    setLoading(false)
  }, [mesReferencia])

  useEffect(() => { fetchDados() }, [fetchDados])

  async function atualizarMetaGatilho(pilar, valor) {
    const numero = Number(valor) || 0
    const mesData = `${mesReferencia}-01`
    const existente = pilares[pilar]
    setPilares(prev => ({ ...prev, [pilar]: { ...(prev[pilar] || { pilar, gatilho: 0, receita: 0 }), meta_gatilho: numero } }))
    if (existente?.id) {
      await supabase.from('comissao_pilar').update({ meta_gatilho: numero }).eq('id', existente.id)
    } else {
      const { data } = await supabase.from('comissao_pilar')
        .insert({ mes_referencia: mesData, pilar, meta_gatilho: numero, gatilho: 0, receita: 0 }).select().single()
      if (data) setPilares(prev => ({ ...prev, [pilar]: data }))
    }
  }

  if (loading) return <div className="loading">Carregando Variável...</div>

  const { duTotais, duRestantes } = calcularDU(mesReferencia)
  const duDecorridos = duTotais - duRestantes

  const linhas = ORDEM_PILARES.map(pilar => {
    const info = PILAR_INFO[pilar]
    const row = pilares[pilar] || { meta_gatilho: 0, gatilho: 0, receita: 0 }
    const pctEsteira = row.meta_gatilho > 0 ? row.gatilho / row.meta_gatilho : 0
    const esteira = comissaoDoPilar(pilar, row.receita, pctEsteira)

    // projeção: mesma referência do Plano Comercial (não é mais uma regra de três simples
    // duTotais/duDecorridos, que em dia 1 do mês multiplicava tudo por duTotais e explodia) —
    // pega o fator de conversão da vertical equivalente e aplica média diária × dias
    // restantes, igual calcularLinha() de PlanoComercial.js.
    const fatorPC = config[PILAR_PARA_VERTICAL_PC[pilar]] ?? 0.8
    const mediaDiariaGatilho = duDecorridos > 0 ? row.gatilho / duDecorridos : 0
    const mediaDiariaReceita = duDecorridos > 0 ? row.receita / duDecorridos : 0
    let gatilhoProjetado = (row.gatilho * fatorPC) + (mediaDiariaGatilho * duRestantes)
    let receitaProjetada = (row.receita * fatorPC) + (mediaDiariaReceita * duRestantes)
    if (pilar === 'AVANCADO') {
      gatilhoProjetado = Math.min(gatilhoProjetado, TETO_PROJECAO_AVANCADO)
      receitaProjetada = Math.min(receitaProjetada, TETO_PROJECAO_AVANCADO)
    }
    const pctProjecao = row.meta_gatilho > 0 ? gatilhoProjetado / row.meta_gatilho : 0
    const projecao = comissaoDoPilar(pilar, receitaProjetada, pctProjecao)

    // real apurado: só o que já fechou como "Pedido Finalizado" na Apuração de Vendas —
    // usa a MESMA % de atingimento da esteira (o gatilho de quantidade/R$ realizado no mês
    // não muda), só troca a receita-base pela parcela já confirmada
    const receitaApurada = apurado[pilar] || 0
    const apuradoCalc = comissaoDoPilar(pilar, receitaApurada, pctEsteira)

    return { pilar, info, row, pctEsteira, esteira, gatilhoProjetado, receitaProjetada, pctProjecao, projecao, receitaApurada, apuradoCalc }
  })

  const totalEsteira = linhas.reduce((s, l) => s + l.esteira.comissao, 0)
  const totalProjecao = linhas.reduce((s, l) => s + l.projecao.comissao, 0)
  const totalApurado = linhas.reduce((s, l) => s + l.apuradoCalc.comissao, 0)

  return (
    <div className="main">
      <div className="dash-section-title">Variável</div>
      <div className="lm-resumo" style={{ marginBottom: 16, fontSize: 12, color: '#888' }}>
        Visão pessoal — não aparece pra mais ninguém. Faixa de atingimento por pilar: abaixo de 80% não paga; 80-99% Faixa 1; 100-119% Faixa 2; 120%+ Faixa 3.
        A % da faixa multiplica sempre a receita R$ do pilar, mesmo em Altas/Banda Larga/Renovação Móvel (que usam quantidade só pra decidir a faixa).
      </div>

      <div className="kanban-toolbar" style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#888' }}>Mês
          <input type="month" className="lm-input" style={{ marginLeft: 8 }} value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} />
        </label>
        <span style={{ fontSize: 12, color: '#888' }}>Dias úteis: {duTotais} total, {duDecorridos} decorrido(s), {duRestantes} restante(s)</span>
      </div>

      <div className="diag-stats" style={{ marginBottom: 24 }}>
        <div className="diag-stat diag-stat-neutro" style={{ cursor: 'pointer' }} onClick={() => setDetalheAberto('esteira')}><div className="diag-stat-valor">{fmtMoeda(totalEsteira)}</div><div className="diag-stat-label">Comissão — Esteira Atual</div></div>
        <div className="diag-stat diag-stat-migracao" style={{ cursor: 'pointer' }} onClick={() => setDetalheAberto('projecao')}><div className="diag-stat-valor">{fmtMoeda(totalProjecao)}</div><div className="diag-stat-label">Comissão — Projeção do Mês</div></div>
        <div className="diag-stat diag-stat-credito" style={{ cursor: 'pointer' }} onClick={() => setDetalheAberto('apurado')}><div className="diag-stat-valor">{fmtMoeda(totalApurado)}</div><div className="diag-stat-label">Comissão — Real Apurado</div></div>
      </div>

      {detalheAberto && (
        <DetalheFaixaModal visao={detalheAberto} linhas={linhas} total={{ esteira: totalEsteira, projecao: totalProjecao, apurado: totalApurado }[detalheAberto]} onClose={() => setDetalheAberto(null)} />
      )}

      <div className="carteira-table-wrap">
        <table className="carteira-table">
          <thead>
            <tr>
              <th>Pilar</th><th>Meta (gatilho)</th><th>Esteira (gatilho)</th><th>% Atingimento</th>
              <th>Comissão Esteira</th><th>Comissão Projeção</th><th>Receita Apurada</th><th>Comissão Apurado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.pilar}>
                <td>{l.info.label}</td>
                <td>
                  {editandoMeta === l.pilar ? (
                    <input className="lm-input" type="number" style={{ width: 100 }} autoFocus defaultValue={l.row.meta_gatilho}
                      onBlur={e => { atualizarMetaGatilho(l.pilar, e.target.value); setEditandoMeta(null) }}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
                  ) : (
                    <span className="plano-concluido-editavel" onClick={() => setEditandoMeta(l.pilar)}>{fmtValor(l.row.meta_gatilho, l.info.formato)}</span>
                  )}
                </td>
                <td>{fmtValor(l.row.gatilho, l.info.formato)}</td>
                <td><span className="plano-semaforo" style={{ background: l.esteira.faixa === 0 ? '#999999' : l.esteira.faixa === 3 ? '#28A745' : l.esteira.faixa === 2 ? '#F39C12' : '#E74C3C' }}>
                  {fmtPct(l.pctEsteira)}{l.esteira.faixa > 0 && ` · F${l.esteira.faixa}`}
                </span></td>
                <td>{fmtMoeda(l.esteira.comissao)}</td>
                <td>{fmtMoeda(l.projecao.comissao)}</td>
                <td>{fmtMoeda(l.receitaApurada)}</td>
                <td>{fmtMoeda(l.apuradoCalc.comissao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

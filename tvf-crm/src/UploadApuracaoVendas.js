import React, { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

// aliases pra achar a coluna certa mesmo com variação de nome/acentuação — o .xls real desse
// relatório vem com acento quebrado tipo "TR&Acirc;MITE" (herança de export HTML->xls), por
// isso o normalizarChave também limpa entidade HTML antes de comparar
const ALIASES = {
  cnpj: ['cnpj'],
  numeroPedido: ['id', 'idpedido', 'numeropedido', 'pedido', 'nrpedido', 'codigopedido'],
  status: ['tramite', 'trmite', 'status', 'situacao', 'resultado', 'statuspedido'],
  dataTramite: ['datatramite', 'datatrmite', 'datadotramite', 'datastatus'],
}

// A coluna TRÂMITE do relatório é um fluxo de ~15 estados fixos (ex: "Aguardando Input Vivo",
// "Backoffice Aprovado", "Crédito Aprovado", "Logística Concluída"...) — só duas coisas ali são
// resultado DEFINITIVO: "Pedido Finalizado" (ativou) e "Cancelado"/"Mesa de Fraude" (não vai
// ativar). Tudo o mais é etapa intermediária, ainda em andamento — por isso o match é EXATO,
// não por palavra solta ("aprovado" aparece em três etapas que não são a final).
const STATUS_ATIVADO_EXATO = ['pedido finalizado']
const STATUS_REPROVADO_EXATO = ['cancelado', 'mesa de fraude']

// status do CRM — mesmo conjunto usado no Kanban/Potencial de Carteira
const STATUS_OPCOES = [
  'Aguardando Aceite', 'Aguardando Atendimento', 'Cliente Cancelou', 'Cliente Já Renovado', 'CNPJ Baixado',
  'Débito Interno', 'Já Possui Consultor', 'Não Contatar', 'Não Possui Recomendação',
  'Pedido Finalizado', 'Proposta Enviada', 'Recontato — Nova Venda', 'Retornar', 'Sem Contato Efetivo',
  'Sem Interesse', 'Sem Viabilidade', 'Venda Realizada',
]

function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').trim().replace(/\s+/g, ' ')
}
function normalizarChave(s) {
  return String(s ?? '').replace(/&\w+;/g, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

function classificarStatus(bruto) {
  const n = normalizar(bruto)
  if (STATUS_ATIVADO_EXATO.includes(n)) return 'ativado'
  if (STATUS_REPROVADO_EXATO.includes(n)) return 'reprovado'
  return null
}

// tenta achar o status do CRM que o texto do arquivo já usa (ex: arquivo já vem com "Sem
// Viabilidade") — senão fica sem mapear e só grava a reprova na venda, sem mexer no status do cliente
function mapearStatusCrm(bruto) {
  const alvo = normalizar(bruto)
  return STATUS_OPCOES.find(s => normalizar(s) === alvo) || null
}

// "06/08/2026 11:35" ou "6/8/26" -> "2026-08-06 11:35", pra comparar/ordenar direito
function paraComparavel(bruto) {
  const s = String(bruto ?? '').trim()
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (!m) return ''
  let [, d, mo, y, h = '00', mi = '00'] = m
  if (y.length === 2) y = `20${y}`
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')} ${h.padStart(2, '0')}:${mi}`
}

// número (CNPJ/ID) lido com raw:true vem como Number puro, sem notação científica — só
// formata como string de dígitos, preenchendo zero à esquerda se for CNPJ de 13 dígitos
// (Excel derruba o zero inicial quando trata como número)
function paraDigitos(valor) {
  const s = typeof valor === 'number' && Number.isFinite(valor)
    ? String(Math.round(valor))
    : String(valor ?? '').replace(/\D/g, '')
  // Excel derruba até 2 zeros à esquerda quando trata o CNPJ/CPF como número — 12-13 dígitos
  // é CNPJ truncado (preenche até 14), 9-10 é CPF truncado (preenche até 11)
  if (s.length >= 12 && s.length <= 13) return s.padStart(14, '0')
  if (s.length >= 9 && s.length <= 10) return s.padStart(11, '0')
  return s
}

// lê o .xls/.xlsx com raw:true (preserva CNPJ grande sem virar "6.6E+13") e monta cada linha
// batendo o cabeçalho por nome normalizado — não usa o parseArquivo genérico porque aquele lê
// com raw:false e perde precisão de número grande
async function lerLinhas(file) {
  const buf = await file.arrayBuffer()
  const ehCsv = /\.csv$/i.test(file.name)
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const arrays = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: !ehCsv })
  const cabecalho = arrays[0].map(h => normalizarChave(h))

  function pegar(linha, aliases) {
    for (const alias of aliases) {
      const idx = cabecalho.indexOf(alias)
      if (idx !== -1 && linha[idx] !== '') return linha[idx]
    }
    return ''
  }

  return arrays.slice(1).map(linha => {
    const cnpj = paraDigitos(pegar(linha, ALIASES.cnpj))
    const numeroPedidoBruto = pegar(linha, ALIASES.numeroPedido)
    const numeroPedido = numeroPedidoBruto === '' ? '' : String(typeof numeroPedidoBruto === 'number' ? Math.round(numeroPedidoBruto) : numeroPedidoBruto).trim()
    const statusOriginal = pegar(linha, ALIASES.status)
    return {
      cnpj,
      numeroPedido,
      statusOriginal,
      statusClasse: classificarStatus(statusOriginal),
      dataComparavel: paraComparavel(pegar(linha, ALIASES.dataTramite)),
    }
  }).filter(l => l.cnpj)
}

// O relatório traz o HISTÓRICO de trâmite do mesmo pedido (várias linhas por pedido, uma por
// mudança de status ao longo dos dias) — não é um pedido por linha. Fica só a linha que resume
// o resultado de cada pedido (agrupando por ID quando tem, senão por CNPJ): se alguma linha
// chegou em "ativado" ou "reprovado", essa vale; senão, pega a mais recente (ainda em andamento).
function melhorLinhaPorPedido(linhas) {
  const prioridade = c => (c === 'ativado' ? 2 : c === 'reprovado' ? 1 : 0)
  const grupos = new Map()
  for (const l of linhas) {
    const chave = l.numeroPedido || `cnpj:${l.cnpj}`
    const atual = grupos.get(chave)
    if (!atual) { grupos.set(chave, l); continue }
    if (prioridade(l.statusClasse) > prioridade(atual.statusClasse)) grupos.set(chave, l)
    else if (prioridade(l.statusClasse) === prioridade(atual.statusClasse) && l.dataComparavel > atual.dataComparavel) grupos.set(chave, l)
  }
  return Array.from(grupos.values())
}

export default function UploadApuracaoVendas() {
  const [linhas, setLinhas] = useState([])
  const [lendo, setLendo] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  async function handleArquivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setErro('')
    setResultado(null)
    setLendo(true)
    try {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        await processarPdf(file)
      } else {
        setLinhas(await lerLinhas(file))
      }
    } catch (err) {
      setErro(err.message)
    } finally {
      setLendo(false)
      e.target.value = ''
    }
  }

  async function processarPdf(file) {
    const buf = await file.arrayBuffer()
    const base64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''))
    const { data: sessao } = await supabase.auth.getSession()
    const resp = await fetch('/api/extrair-apuracao-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao?.session?.access_token}` },
      body: JSON.stringify({ pdfBase64: base64, filename: file.name }),
    })
    const dados = await resp.json()
    if (!resp.ok) throw new Error(dados.error || 'Erro ao ler o PDF')
    const mapeadas = (dados.linhas || []).map(l => ({
      cnpj: paraDigitos(l.cnpj),
      numeroPedido: '',
      statusOriginal: l.tramite,
      statusClasse: classificarStatus(l.tramite),
      dataComparavel: paraComparavel(l.data_tramite),
    })).filter(l => l.cnpj)
    setLinhas(mapeadas)
  }

  async function processar() {
    setProcessando(true)
    setResultado(null)
    let ativados = 0, reprovados = 0, semClassificar = 0, semMatch = 0, falhas = 0
    const semMatchAmostra = []
    const vendasJaUsadas = new Set() // evita ligar 2 pedidos diferentes na mesma venda do CRM

    // o mesmo pedido aparece várias vezes no relatório (histórico de trâmite) — processa só a
    // linha que resume o resultado de cada um, não cada linha crua
    const melhores = melhorLinhaPorPedido(linhas)

    for (const linha of melhores) {
      if (!linha.statusClasse) { semClassificar++; continue }

      let venda = null
      // 1) casa pelo número do pedido, se essa venda já tiver sido ligada a ele antes
      if (linha.numeroPedido) {
        const { data } = await supabase.from('carteira_venda').select('id, carteira_cliente_id')
          .eq('numero_pedido', linha.numeroPedido).maybeSingle()
        venda = data
      }
      // 2) senão, casa pelo CNPJ — cliente pode ter mais de uma venda (mais de um pedido), pega
      // a mais antiga que ainda não foi usada nesse processamento, pra não bater 2 pedidos na mesma
      if (!venda) {
        const { data: cliente } = await supabase.from('carteira_cliente').select('id')
          .eq('cnpj', linha.cnpj).is('excluido_em', null).maybeSingle()
        if (cliente) {
          const { data: vendasCliente } = await supabase.from('carteira_venda').select('id, carteira_cliente_id, numero_pedido')
            .eq('carteira_cliente_id', cliente.id).order('criado_em', { ascending: true })
          venda = (vendasCliente || []).find(v => !v.numero_pedido && !vendasJaUsadas.has(v.id))
        }
      }

      if (!venda) { semMatch++; if (semMatchAmostra.length < 5) semMatchAmostra.push(`${linha.cnpj} (pedido ${linha.numeroPedido || '—'})`); continue }
      vendasJaUsadas.add(venda.id)

      const camposVenda = {
        status_apuracao: linha.statusClasse,
        apurado_em: new Date().toISOString(),
        ...(linha.numeroPedido ? { numero_pedido: linha.numeroPedido } : {}),
        ...(linha.statusClasse === 'reprovado' ? { motivo_reprova: linha.statusOriginal || null } : {}),
      }
      const { error: erroVenda } = await supabase.from('carteira_venda').update(camposVenda).eq('id', venda.id)
      if (erroVenda) { falhas++; continue }

      if (linha.statusClasse === 'ativado') {
        await supabase.from('carteira_cliente').update({ status: 'Pedido Finalizado' }).eq('id', venda.carteira_cliente_id)
        ativados++
      } else {
        const statusCrm = mapearStatusCrm(linha.statusOriginal)
        if (statusCrm) await supabase.from('carteira_cliente').update({ status: statusCrm }).eq('id', venda.carteira_cliente_id)
        reprovados++
      }
    }

    setProcessando(false)
    setResultado({ ativados, reprovados, semClassificar, semMatch, semMatchAmostra, falhas, total: melhores.length, totalLinhasArquivo: linhas.length })
    setLinhas([])
  }

  return (
    <div className="main">
      <div className="lm-section-title">Apuração de Vendas</div>
      <details className="regras-toggle">
        <summary>Ver regras dessa importação</summary>
        <div className="regras-toggle-corpo">
          Sobe o relatório de pedidos (Excel/CSV com coluna ID, ou PDF) pra reconciliar a venda
          registrada pelo consultor com o resultado real. Pedido finalizado vira "Pedido
          Finalizado" no cliente; cancelado/mesa de fraude atualiza pro status do CRM
          correspondente, se o texto do arquivo já bater com um existente. O relatório costuma ter
          várias linhas por pedido (histórico de trâmite) — só a última/definitiva de cada um conta.
        </div>
      </details>

      <div className="kanban-toolbar">
        <input type="file" accept=".csv,.xlsx,.xls,.pdf,application/pdf" onChange={handleArquivo} disabled={lendo} />
        {lendo && <span style={{ fontSize: 12, color: '#660099' }}>Lendo arquivo...</span>}
        {linhas.length > 0 && !lendo && <span style={{ fontSize: 12, color: '#660099' }}>{linhas.length} linha(s) com CNPJ válido</span>}
      </div>

      {erro && <div className="login-erro" style={{ marginTop: 8 }}>{erro}</div>}

      {linhas.length > 0 && (
        <>
          <div className="carteira-table-wrap" style={{ marginTop: 12, marginBottom: 12 }}>
            <table className="carteira-table">
              <thead><tr><th>CNPJ</th><th>ID Pedido</th><th>Status no arquivo</th><th>Classificação</th></tr></thead>
              <tbody>
                {linhas.slice(0, 50).map((l, i) => (
                  <tr key={i} style={!l.statusClasse ? { background: 'rgba(255,107,107,0.12)' } : {}}>
                    <td>{l.cnpj}</td>
                    <td>{l.numeroPedido || '—'}</td>
                    <td>{l.statusOriginal || '—'}</td>
                    <td>{l.statusClasse === 'ativado' ? '✅ Ativado' : l.statusClasse === 'reprovado' ? '❌ Reprovado' : <span style={{ color: 'var(--vermelho)' }}>em andamento</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {linhas.length > 50 && <div style={{ fontSize: 11, color: 'rgba(245,241,250,0.55)', padding: 8 }}>Mostrando 50 de {linhas.length} linhas.</div>}
          </div>
          <button className="btn-save-obs" style={{ float: 'none' }} onClick={processar} disabled={processando}>
            {processando ? 'Processando...' : `Processar ${linhas.length} linha(s)`}
          </button>
        </>
      )}

      {resultado && (
        <div className="lm-resumo" style={{ marginTop: 16 }}>
          {resultado.ativados} ativado(s), {resultado.reprovados} reprovado(s) de {resultado.total} pedido(s) únicos ({resultado.totalLinhasArquivo} linha(s) no arquivo).
          {resultado.semClassificar > 0 && <div style={{ marginTop: 4 }}>{resultado.semClassificar} pedido(s) ainda em andamento (nem finalizado nem cancelado) — ignorados por enquanto.</div>}
          {resultado.semMatch > 0 && (
            <div className="login-erro" style={{ marginTop: 8 }}>
              {resultado.semMatch} pedido(s) sem venda correspondente no CRM. Ex: {resultado.semMatchAmostra.join(', ')}
            </div>
          )}
          {resultado.falhas > 0 && <div className="login-erro" style={{ marginTop: 8 }}>{resultado.falhas} falha(s) ao salvar.</div>}
        </div>
      )}
    </div>
  )
}

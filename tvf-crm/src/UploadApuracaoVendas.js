import React, { useState } from 'react'
import { supabase } from './supabaseClient'
import { parseArquivo, listarAbas, mapearCampos, extrairCnpj } from './xlsxParse'

const ALIASES = {
  cnpj: ['cnpj'],
  numeroPedido: ['idpedido', 'numeropedido', 'pedido', 'nrpedido', 'codigopedido'],
  status: ['status', 'situacao', 'resultado', 'statuspedido'],
}

// status do CRM — mesmo conjunto usado no Kanban/Potencial de Carteira
const STATUS_OPCOES = [
  'Aguardando Aceite', 'Aguardando Atendimento', 'Cliente Cancelou', 'Cliente Já Renovado', 'CNPJ Baixado',
  'Débito Interno', 'Já Possui Consultor', 'Não Contatar', 'Não Possui Recomendação',
  'Pedido Finalizado', 'Proposta Enviada', 'Recontato — Nova Venda', 'Retornar', 'Sem Contato Efetivo',
  'Sem Interesse', 'Sem Viabilidade', 'Venda Realizada',
]

const TERMOS_ATIVADO = ['ativado', 'ativo', 'finalizado', 'aprovado', 'instalado', 'concluido', 'confirmado']
const TERMOS_REPROVADO = ['reprovado', 'reprova', 'cancelado', 'quebra', 'quebratecnica', 'negado', 'recusado', 'nao instalado', 'naoinstalado']

function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

function classificarStatus(bruto) {
  const n = normalizar(bruto)
  if (TERMOS_ATIVADO.some(t => n.includes(t))) return 'ativado'
  if (TERMOS_REPROVADO.some(t => n.includes(t))) return 'reprovado'
  return null
}

// tenta achar o status do CRM que o texto do arquivo já usa (ex: arquivo já vem com "Sem
// Viabilidade") — senão fica sem mapear e só grava a reprova na venda, sem mexer no status do cliente
function mapearStatusCrm(bruto) {
  const alvo = normalizar(bruto)
  return STATUS_OPCOES.find(s => normalizar(s) === alvo) || null
}

export default function UploadApuracaoVendas() {
  const [arquivo, setArquivo] = useState(null)
  const [abas, setAbas] = useState([])
  const [abaEscolhida, setAbaEscolhida] = useState('')
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
    setArquivo(file)
    setLendo(true)
    try {
      const nomesAbas = await listarAbas(file)
      setAbas(nomesAbas)
      const aba = nomesAbas[0]
      setAbaEscolhida(aba)
      await processarAba(file, aba)
    } catch (err) {
      setErro(err.message)
    } finally {
      setLendo(false)
    }
  }

  async function processarAba(file, aba) {
    const brutas = await parseArquivo(file, aba)
    const mapeadas = brutas.map(l => {
      const m = mapearCampos(l, ALIASES)
      const cnpj = extrairCnpj(m.cnpj) || String(m.cnpj || '').replace(/\D/g, '')
      return {
        cnpj,
        numeroPedido: String(m.numeroPedido || '').trim(),
        statusOriginal: m.status,
        statusClasse: classificarStatus(m.status),
      }
    }).filter(l => l.cnpj)
    setLinhas(mapeadas)
  }

  async function trocarAba(aba) {
    setAbaEscolhida(aba)
    setLendo(true)
    try { await processarAba(arquivo, aba) } catch (err) { setErro(err.message) } finally { setLendo(false) }
  }

  async function processar() {
    setProcessando(true)
    setResultado(null)
    let ativados = 0, reprovados = 0, semClassificar = 0, semMatch = 0, falhas = 0
    const semMatchAmostra = []

    for (const linha of linhas) {
      if (!linha.statusClasse) { semClassificar++; continue }

      let venda = null
      // 1) casa pelo número do pedido, se já tiver sido informado numa venda antes
      if (linha.numeroPedido) {
        const { data } = await supabase.from('carteira_venda').select('id, carteira_cliente_id')
          .eq('numero_pedido', linha.numeroPedido).maybeSingle()
        venda = data
      }
      // 2) senão, casa pelo CNPJ do cliente — pega a venda mais recente sem pedido ainda vinculado
      if (!venda) {
        const { data: cliente } = await supabase.from('carteira_cliente').select('id')
          .eq('cnpj', linha.cnpj).is('excluido_em', null).maybeSingle()
        if (cliente) {
          const { data: vendaRecente } = await supabase.from('carteira_venda').select('id, carteira_cliente_id')
            .eq('carteira_cliente_id', cliente.id).order('criado_em', { ascending: false }).limit(1).maybeSingle()
          venda = vendaRecente
        }
      }

      if (!venda) { semMatch++; if (semMatchAmostra.length < 5) semMatchAmostra.push(`${linha.cnpj} (pedido ${linha.numeroPedido || '—'})`); continue }

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
    setResultado({ ativados, reprovados, semClassificar, semMatch, semMatchAmostra, falhas, total: linhas.length })
    setLinhas([])
    setArquivo(null)
    setAbas([])
    setAbaEscolhida('')
  }

  return (
    <div className="main">
      <div className="lm-section-title">Apuração de Vendas</div>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 16px' }}>
        Sobe a planilha mensal de apuração (CNPJ + ID Pedido + status de ativação/reprova) pra
        reconciliar a venda registrada pelo consultor com o resultado real. Venda ativada vira
        "Pedido Finalizado"; venda reprovada (quebra técnica, cancelamento etc) atualiza o
        status do cliente se o texto do arquivo já bater com um status do CRM.
      </p>

      <div className="kanban-toolbar">
        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleArquivo} disabled={lendo} />
        {abas.length > 1 && (
          <select className="filter-select" value={abaEscolhida} onChange={e => trocarAba(e.target.value)}>
            {abas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
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
                  <tr key={i} style={!l.statusClasse ? { background: '#FFF5EE' } : {}}>
                    <td>{l.cnpj}</td>
                    <td>{l.numeroPedido || '—'}</td>
                    <td>{l.statusOriginal || '—'}</td>
                    <td>{l.statusClasse === 'ativado' ? '✅ Ativado' : l.statusClasse === 'reprovado' ? '❌ Reprovado' : <span style={{ color: '#C0451A' }}>não reconhecido</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {linhas.length > 50 && <div style={{ fontSize: 11, color: '#888', padding: 8 }}>Mostrando 50 de {linhas.length} linhas.</div>}
          </div>
          <button className="btn-save-obs" style={{ float: 'none' }} onClick={processar} disabled={processando}>
            {processando ? 'Processando...' : `Processar ${linhas.length} linha(s)`}
          </button>
        </>
      )}

      {resultado && (
        <div className="lm-resumo" style={{ marginTop: 16 }}>
          {resultado.ativados} ativado(s), {resultado.reprovados} reprovado(s) de {resultado.total} linha(s).
          {resultado.semClassificar > 0 && <div style={{ marginTop: 4 }}>{resultado.semClassificar} linha(s) com status não reconhecido (nem ativado nem reprovado) — ignoradas.</div>}
          {resultado.semMatch > 0 && (
            <div className="login-erro" style={{ marginTop: 8 }}>
              {resultado.semMatch} linha(s) sem venda correspondente no CRM. Ex: {resultado.semMatchAmostra.join(', ')}
            </div>
          )}
          {resultado.falhas > 0 && <div className="login-erro" style={{ marginTop: 8 }}>{resultado.falhas} falha(s) ao salvar.</div>}
        </div>
      )}
    </div>
  )
}

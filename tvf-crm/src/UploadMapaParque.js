import React, { useState } from 'react'
import { supabase } from './supabaseClient'
import { parseArquivo, mapearCampos, extrairCnpj } from './xlsxParse'
import { calcularPotencial } from './potencialLogic'

// Aliases batem com os cabeçalhos reais do export InfoB2B (RelatorioInfoB2B_MapaParqueVisa)
const ALIASES = {
  nr_cnpj: ['nrcnpj'],
  tipo_documento: ['tipodocumento'],
  nm_cliente: ['nmcliente'],
  movel: ['movel'],
  rec_movel: ['recmovel'],
  qt_movel_term: ['qtmovelterm'],
  fixa_basica: ['fixabasica'],
  primeira_oferta: ['primeiraoferta'],
  segunda_oferta: ['segundaoferta'],
  terceira_oferta: ['terceiraoferta'],
  vivo_tech: ['vivotech'],
  avancados: ['avancados'],
  vvn: ['vvn'],
  aparelhos: ['aparelhos'],
  celular_contato: ['celularcontatoprincipalsfa'],
  ds_cidade: ['dscidade'],
  vertical: ['vertical'],
  cluster: ['cluster'],
  vl_car_movel: ['vlcarmovel'],
  vl_car_fixa: ['vlcarfixa'],
}

const CHUNK_IMPORT = 1000
const CHUNK_PROCESSAR = 1000
const CHUNK_MARCAR = 60 // update .in() com muitos ids estoura o tamanho da URL/request

export default function UploadMapaParque() {
  const [linhas, setLinhas] = useState([])
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado] = useState(null)

  async function handleArquivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setNomeArquivo(file.name)
    setResultado(null)
    const brutas = await parseArquivo(file)
    const mapeadas = brutas.map(l => {
      const m = mapearCampos(l, ALIASES)
      m.nr_cnpj = extrairCnpj(m.nr_cnpj) || m.nr_cnpj.replace(/\D/g, '')
      m.vl_car_movel = parseFloat(String(m.vl_car_movel).replace(',', '.')) || 0
      m.vl_car_fixa = parseFloat(String(m.vl_car_fixa).replace(',', '.')) || 0
      m.qt_movel_term = parseInt(String(m.qt_movel_term).replace(/\D/g, ''), 10) || 0
      return m
    }).filter(l => l.nr_cnpj)
    setLinhas(mapeadas)
  }

  async function importar() {
    setImportando(true)
    setResultado(null)
    for (let i = 0; i < linhas.length; i += CHUNK_IMPORT) {
      const lote = linhas.slice(i, i + CHUNK_IMPORT).map(l => ({ ...l, processado: false }))
      setProgresso(`Importando ${Math.min(i + CHUNK_IMPORT, linhas.length)} de ${linhas.length}...`)
      const { error } = await supabase.from('mapa_parque_import').insert(lote)
      if (error) { setResultado({ erro: error.message }); setImportando(false); return }
    }
    setImportando(false)
    setProgresso('')
    setResultado({ importadas: linhas.length })
    setLinhas([])
    setNomeArquivo('')
  }

  async function processar(forcarTodos = false) {
    setProcessando(true)
    setResultado(null)

    // Carrega uma vez o cnpj -> ids já existentes na carteira (só esses são atualizados aqui;
    // clientes novos entram pela tela de Upload Mailing Diário).
    const cnpjParaIds = new Map()
    let inicio = 0
    while (true) {
      const { data, error } = await supabase.from('carteira_cliente').select('id, cnpj').is('excluido_em', null).range(inicio, inicio + 999)
      if (error || !data || data.length === 0) break
      for (const row of data) {
        if (!cnpjParaIds.has(row.cnpj)) cnpjParaIds.set(row.cnpj, [])
        cnpjParaIds.get(row.cnpj).push(row.id)
      }
      if (data.length < 1000) break
      inicio += 1000
    }

    let totalProcessadas = 0, totalAtualizados = 0, totalFalhas = 0
    const errosAmostra = []
    let paginaInicio = 0
    while (true) {
      setProgresso(`Processando lote a partir de ${paginaInicio}...`)
      const query = supabase.from('mapa_parque_import').select('*')
      if (!forcarTodos) query.eq('processado', false)
      const { data: pendentes, error } = await query.range(forcarTodos ? paginaInicio : 0, (forcarTodos ? paginaInicio : 0) + CHUNK_PROCESSAR - 1)
      if (error || !pendentes || pendentes.length === 0) break

      for (const row of pendentes) {
        const potencial = calcularPotencial(row)
        const ids = cnpjParaIds.get(row.nr_cnpj)
        if (ids && ids.length > 0) {
          for (const id of ids) {
            const { error: erroUpdate } = await supabase.from('carteira_cliente').update({
              razao_social: row.nm_cliente || undefined,
              ...potencial,
              atualizado_em: new Date().toISOString(),
            }).eq('id', id)
            if (erroUpdate) { totalFalhas++; if (errosAmostra.length < 3) errosAmostra.push(erroUpdate.message) }
            else totalAtualizados++
          }
        }
      }

      const idsProcessados = pendentes.map(p => p.id)
      let totalMarcados = 0
      let erroMarcarLote = null
      for (let i = 0; i < idsProcessados.length; i += CHUNK_MARCAR) {
        const subLote = idsProcessados.slice(i, i + CHUNK_MARCAR)
        const { data: marcados, error: erroMarcar } = await supabase.from('mapa_parque_import')
          .update({ processado: true }).in('id', subLote).select('id')
        if (erroMarcar) { erroMarcarLote = erroMarcar; break }
        totalMarcados += marcados?.length || 0
      }
      if (erroMarcarLote || totalMarcados === 0) {
        setProcessando(false)
        setProgresso('')
        const detalhe = erroMarcarLote
          ? `status=${erroMarcarLote.status || erroMarcarLote.code || '?'} · ${erroMarcarLote.message}${erroMarcarLote.details ? ' · ' + erroMarcarLote.details : ''}${erroMarcarLote.hint ? ' · dica: ' + erroMarcarLote.hint : ''}`
          : 'nenhuma linha foi atualizada (0 linhas afetadas)'
        setResultado({ erro: `Não consegui marcar o lote como processado: ${detalhe}. Processadas até aqui: ${totalProcessadas}.` })
        return
      }
      totalProcessadas += pendentes.length
      paginaInicio += pendentes.length
      if (pendentes.length < CHUNK_PROCESSAR) break
    }

    setProcessando(false)
    setProgresso('')
    setResultado({ processadas: totalProcessadas, atualizados: totalAtualizados, falhas: totalFalhas, errosAmostra })
  }

  return (
    <div className="main">
      <div className="lm-section-title">Upload Mapa Parque</div>
      <details className="regras-toggle">
        <summary>Ver regras dessa importação</summary>
        <div className="regras-toggle-corpo">
          Sobe a carga bruta (CSV/XLSX) do Mapa Parque (export InfoB2B). Depois de importar, clique em "Processar" para calcular
          o potencial e atualizar os clientes já existentes na carteira (por CNPJ). Clientes novos entram na carteira via Upload Mailing Diário.
        </div>
      </details>

      <div className="kanban-toolbar">
        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleArquivo} />
        {nomeArquivo && <span style={{ fontSize: 12, color: '#660099' }}>{nomeArquivo} — {linhas.length} linhas com CNPJ válido</span>}
      </div>

      {linhas.length > 0 && (
        <>
          <div className="carteira-table-wrap" style={{ marginBottom: 12 }}>
            <table className="carteira-table">
              <thead><tr><th>CNPJ</th><th>Cliente</th><th>Cidade</th><th>Crédito (móvel+fixa)</th></tr></thead>
              <tbody>
                {linhas.slice(0, 20).map((l, i) => (
                  <tr key={i}><td>{l.nr_cnpj}</td><td>{l.nm_cliente}</td><td>{l.ds_cidade}</td>
                    <td>{(l.vl_car_movel + l.vl_car_fixa).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-save-obs" style={{ float: 'none' }} onClick={importar} disabled={importando}>
            {importando ? 'Importando...' : `Importar ${linhas.length} linhas`}
          </button>
        </>
      )}

      <div className="lm-section-title" style={{ marginTop: 24 }}>Processar carga pendente</div>
      <button className="btn-action" style={{ marginTop: 8 }} onClick={() => processar(false)} disabled={processando}>
        {processando ? 'Processando...' : 'Processar Mapa Parque'}
      </button>
      <button className="btn-action" style={{ marginTop: 8, marginLeft: 8 }} onClick={() => processar(true)} disabled={processando}>
        {processando ? 'Processando...' : 'Reprocessar tudo (recalcula potencial)'}
      </button>

      {progresso && <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>{progresso}</div>}

      {resultado && (
        <div className="lm-resumo" style={{ marginTop: 16 }}>
          {resultado.erro && `Erro: ${resultado.erro}`}
          {resultado.importadas !== undefined && `${resultado.importadas} linhas importadas para mapa_parque_import.`}
          {resultado.processadas !== undefined && `${resultado.processadas} linhas processadas, ${resultado.atualizados} clientes atualizados na carteira.`}
          {resultado.falhas > 0 && (
            <div className="login-erro" style={{ marginTop: 8 }}>
              {resultado.falhas} atualização(ões) falharam. Exemplo(s): {resultado.errosAmostra.join(' | ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

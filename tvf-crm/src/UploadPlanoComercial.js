import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

// Mapa de rótulo (como aparece na coluna VERTICAL da planilha, normalizado) pro código fixo
// usado no banco. "Receita Avançado" (linha do Yves na planilha original) cai no mesmo
// código de "Receita Telecom" — são a mesma métrica em blocos de vendedor diferentes.
const VERTICAIS_RECONHECIDAS = {
  aparelho: 'APARELHO',
  ha: 'HA',
  bl: 'BL',
  mm: 'MM',
  mb: 'MB',
  receitatelecom: 'RECEITA_TELECOM',
  receitaavancado: 'RECEITA_TELECOM',
}

// "PLANO COMERCIAL" marca o fim dos blocos de vendedor de verdade — depois dele vem tabela de
// headcount/dias úteis que REPETE os mesmos nomes dos vendedores (ex: linha "Isabele Cruz" de
// novo, só que como resumo de headcount) — se não parar de vez ali, o parser tentaria
// reprocessar essa área como se fosse um vendedor novo.
const MARCADOR_PARADA = ['planocomercial']
const MARCADOR_CABECALHO = ['timesinsidesales', 'times insidesales']

function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}
function palavras(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean)
}

// null = célula vazia (não veio nada nessa subida, mantém o que já tava salvo).
// Backlog normalmente só é subido uma vez no início do mês; Esteira é atualizada com
// uploads repetidos ao longo do mês — não pode um zerar o outro.
function paraValorReal(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const limpo = String(v).replace(/[^\d,]/g, '').replace(',', '.')
  const n = parseFloat(limpo)
  return isNaN(n) ? null : n
}

function hoje() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function UploadPlanoComercial() {
  const [staff, setStaff] = useState([])
  const [mesReferencia, setMesReferencia] = useState(hoje())
  const [arquivo, setArquivo] = useState(null)
  const [linhas, setLinhas] = useState([])
  const [metaGlobal, setMetaGlobal] = useState({})
  const [naoReconhecidas, setNaoReconhecidas] = useState([])
  const [processando, setProcessando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    supabase.from('consultores_staff').select('id, nome').order('nome').then(({ data }) => setStaff(data || []))
  }, [])

  async function handleArquivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setArquivo(file)
    setResultado(null)

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    // Pega a aba "CONTROLE 2026" (ou a que tiver "controle" no nome) — não é sempre a primeira
    // do arquivo (o workbook real tem "REMUNERAÇÃO 2026..." antes dela).
    const nomeAba = wb.SheetNames.find(n => normalizar(n).includes('controle')) || wb.SheetNames[0]
    const sheet = wb.Sheets[nomeAba]
    const linhasBrutas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    const encontradas = []
    const semRotuloReconhecido = new Set()
    let vendedorAtual = null
    let ignorarBloco = true // até achar o primeiro nome de vendedor de verdade

    for (const linha of linhasBrutas) {
      const colA = String(linha[0] ?? '').trim()
      if (colA) {
        const colANorm = normalizar(colA)
        if (MARCADOR_PARADA.includes(colANorm)) break
        if (MARCADOR_CABECALHO.includes(colANorm)) { ignorarBloco = true; vendedorAtual = null }
        else { ignorarBloco = false; vendedorAtual = colA }
      }
      // linha em branco na coluna A dentro do cabeçalho continua pertencendo a esse bloco
      // ignorado — não deixa "vazar" pro último vendedor real.
      if (ignorarBloco || !vendedorAtual) continue

      const vertical = VERTICAIS_RECONHECIDAS[normalizar(linha[1])]
      if (!vertical) { if (linha[1]) semRotuloReconhecido.add(String(linha[1]).trim()); continue }

      encontradas.push({
        vendedor: vendedorAtual,
        vertical,
        meta: paraValorReal(linha[2]),
        backlog: paraValorReal(linha[3]),
        esteira: paraValorReal(linha[4]),
      })
    }

    setLinhas(encontradas)
    setNaoReconhecidas(Array.from(semRotuloReconhecido))

    // Bloco "PLANO COMERCIAL (s/ quebra)" — meta global do escritório antes da quebra por
    // time, um pouco mais abaixo na planilha (rótulo + valor, um por linha).
    const idxGlobal = linhasBrutas.findIndex(l => normalizar(l[0]).includes('semquebra') || normalizar(l[0]).includes('squebra'))
    const global = {}
    if (idxGlobal >= 0) {
      for (let i = idxGlobal + 1; i < linhasBrutas.length; i++) {
        const rotuloCol = String(linhasBrutas[i][0] ?? '').trim()
        if (!rotuloCol) break
        const vertical = VERTICAIS_RECONHECIDAS[normalizar(rotuloCol)]
        if (!vertical) break
        global[vertical] = paraValorReal(linhasBrutas[i][1]) ?? 0
      }
    }
    setMetaGlobal(global)
  }

  function acharConsultor(nomeVendedor) {
    const alvoNorm = normalizar(nomeVendedor)
    const exato = staff.find(s => normalizar(s.nome) === alvoNorm)
    if (exato) return exato
    const alvoPalavras = palavras(nomeVendedor)
    return staff.find(s => palavras(s.nome).every(p => alvoPalavras.includes(p)))
  }

  async function processar() {
    setProcessando(true)
    setResultado(null)
    const mesData = `${mesReferencia}-01`
    let atualizadas = 0, falhas = 0
    const semMatch = new Set()
    const errosAmostra = []

    // Busca de uma vez o que já existe pro mês, pra fazer merge parcial em vez de zerar
    // campo que veio vazio nessa subida (ex: Backlog só sobe uma vez no início do mês).
    const { data: existentes } = await supabase.from('plano_comercial').select('*').eq('mes_referencia', mesData)
    const existentesMapa = new Map((existentes || []).map(r => [`${r.consultor_id}|${r.vertical}`, r]))

    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]
      setProgresso(`Processando ${i + 1} de ${linhas.length}...`)
      const consultor = acharConsultor(l.vendedor)
      if (!consultor) { semMatch.add(l.vendedor); continue }

      const atual = existentesMapa.get(`${consultor.id}|${l.vertical}`)
      const meta = l.meta ?? atual?.meta ?? 0
      const backlog = l.backlog ?? atual?.backlog ?? 0
      const esteira = l.esteira ?? atual?.esteira ?? 0

      const { error } = await supabase.from('plano_comercial')
        .upsert({
          mes_referencia: mesData, consultor_id: consultor.id, vertical: l.vertical,
          meta, backlog, esteira,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'mes_referencia,consultor_id,vertical' })
      if (error) { falhas++; if (errosAmostra.length < 3) errosAmostra.push(error.message) }
      else atualizadas++
    }

    let globaisSalvas = 0
    for (const [vertical, meta] of Object.entries(metaGlobal)) {
      const { error } = await supabase.from('plano_comercial_meta_global')
        .upsert({ mes_referencia: mesData, vertical, meta, atualizado_em: new Date().toISOString() }, { onConflict: 'mes_referencia,vertical' })
      if (!error) globaisSalvas++
    }

    setProcessando(false)
    setProgresso('')
    setResultado({ atualizadas, falhas, errosAmostra, semMatch: Array.from(semMatch), globaisSalvas })
    setLinhas([])
    setArquivo(null)
    setMetaGlobal({})
  }

  return (
    <div className="main">
      <div className="lm-section-title">Upload Plano Comercial</div>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 16px' }}>
        Sobe a carta meta do mês (aba "CONTROLE 2026" ou o que tiver "controle" no nome — não
        precisa ser a primeira aba do arquivo). Lê os blocos por time (Meta/Backlog/Esteira) e
        também a meta global do escritório antes da quebra ("PLANO COMERCIAL (s/ quebra)").
        Célula vazia numa subida não zera o que já tava salvo (ex: sobe só Esteira ao longo do
        mês, sem repetir o Backlog). "Concluído" é editado direto na aba Plano Comercial e
        nunca é sobrescrito por esse upload.
      </p>

      <div className="kanban-toolbar">
        <label style={{ fontSize: 12, color: '#888' }}>Mês de referência
          <input type="month" className="lm-input" style={{ marginLeft: 8 }} value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} />
        </label>
        <input type="file" accept=".xlsx,.xls" onChange={handleArquivo} />
        {arquivo && <span style={{ fontSize: 12, color: '#660099' }}>{arquivo.name} — {linhas.length} linha(s) reconhecida(s)</span>}
      </div>
      {naoReconhecidas.length > 0 && (
        <div style={{ fontSize: 11, color: '#C0451A', marginTop: 8 }}>
          Rótulo(s) de vertical não reconhecido(s), ignorado(s): {naoReconhecidas.join(', ')}
        </div>
      )}

      {linhas.length > 0 && (
        <button className="btn-save-obs" style={{ float: 'none', marginTop: 12 }} onClick={processar} disabled={processando}>
          {processando ? 'Processando...' : `Processar ${linhas.length} linha(s)`}
        </button>
      )}

      {progresso && <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>{progresso}</div>}

      {resultado && (
        <div className="lm-resumo" style={{ marginTop: 16 }}>
          {resultado.atualizadas} linha(s) atualizada(s) na aba Plano Comercial. {resultado.globaisSalvas} vertical(is) da meta global do escritório atualizada(s).
          {resultado.semMatch.length > 0 && (
            <div className="login-erro" style={{ marginTop: 8 }}>
              Vendedor(es) sem match em consultores_staff (não foram importados): {resultado.semMatch.join(', ')}
            </div>
          )}
          {resultado.falhas > 0 && (
            <div className="login-erro" style={{ marginTop: 8 }}>
              {resultado.falhas} falha(s) ao salvar. Exemplo(s): {resultado.errosAmostra.join(' | ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

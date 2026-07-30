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

const NOMES_IGNORADOS = ['planocomercial', 'times insidesales', 'timesinsidesales']

function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

function paraValorReal(v) {
  if (v === null || v === undefined || v === '') return 0
  const limpo = String(v).replace(/[^\d,]/g, '').replace(',', '.')
  const n = parseFloat(limpo)
  return isNaN(n) ? 0 : n
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
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const linhasBrutas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    const encontradas = []
    const semRotuloReconhecido = new Set()
    let vendedorAtual = null
    let ignorarBloco = true // até achar o primeiro nome de vendedor de verdade

    for (const linha of linhasBrutas) {
      const colA = String(linha[0] ?? '').trim()
      if (colA) {
        if (NOMES_IGNORADOS.includes(normalizar(colA))) { ignorarBloco = true; vendedorAtual = null }
        else { ignorarBloco = false; vendedorAtual = colA }
      }
      // linha em branco na coluna A dentro do bloco "PLANO COMERCIAL"/cabeçalho continua
      // pertencendo a esse bloco ignorado — não deixa "vazar" pro último vendedor real.
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
  }

  function acharConsultor(nomeVendedor) {
    const alvo = normalizar(nomeVendedor)
    return staff.find(s => normalizar(s.nome) === alvo) || staff.find(s => normalizar(s.nome).includes(alvo) || alvo.includes(normalizar(s.nome)))
  }

  async function processar() {
    setProcessando(true)
    setResultado(null)
    const mesData = `${mesReferencia}-01`
    let atualizadas = 0, falhas = 0
    const semMatch = new Set()
    const errosAmostra = []

    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]
      setProgresso(`Processando ${i + 1} de ${linhas.length}...`)
      const consultor = acharConsultor(l.vendedor)
      if (!consultor) { semMatch.add(l.vendedor); continue }

      const { error } = await supabase.from('plano_comercial')
        .upsert({
          mes_referencia: mesData, consultor_id: consultor.id, vertical: l.vertical,
          meta: l.meta, backlog: l.backlog, esteira: l.esteira,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'mes_referencia,consultor_id,vertical' })
      if (error) { falhas++; if (errosAmostra.length < 3) errosAmostra.push(error.message) }
      else atualizadas++
    }

    setProcessando(false)
    setProgresso('')
    setResultado({ atualizadas, falhas, errosAmostra, semMatch: Array.from(semMatch) })
    setLinhas([])
    setArquivo(null)
  }

  return (
    <div className="main">
      <div className="lm-section-title">Upload Plano Comercial</div>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 16px' }}>
        Sobe a carta meta do mês (mesmo layout de sempre: bloco de linhas por vendedor, com
        VERTICAL / PC (DESAFIO) / BACKLOG / ESTEIRA MÊS nas colunas B a E). Meta, backlog e
        esteira vêm prontos do arquivo — não recalcula rateio. "Concluído" é editado direto na
        aba Plano Comercial e nunca é sobrescrito por esse upload.
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
          {resultado.atualizadas} linha(s) atualizada(s) na aba Plano Comercial.
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

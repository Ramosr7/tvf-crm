import React, { useState } from 'react'
import { supabase } from './supabaseClient'
import { parseArquivo, mapearCampos, extrairCnpj } from './xlsxParse'

const ALIASES = {
  cnpj: ['cnpj'],
}

const CHUNK = 60 // consistente com CHUNK_MARCAR do Mapa Parque — evita estourar o tamanho da URL/request

export default function UploadRenovacaoAntecipada() {
  const [arquivo, setArquivo] = useState(null)
  const [cnpjs, setCnpjs] = useState([])
  const [processando, setProcessando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [resultado, setResultado] = useState(null)

  async function handleArquivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setArquivo(file)
    setResultado(null)
    const brutas = await parseArquivo(file)
    const lista = brutas.map(l => {
      const m = mapearCampos(l, ALIASES)
      return extrairCnpj(m.cnpj) || String(m.cnpj).replace(/\D/g, '')
    }).filter(Boolean)
    setCnpjs(Array.from(new Set(lista)))
  }

  async function marcar() {
    setProcessando(true)
    setResultado(null)
    let marcados = 0
    const naoEncontrados = []

    for (let i = 0; i < cnpjs.length; i += CHUNK) {
      const lote = cnpjs.slice(i, i + CHUNK)
      setProgresso(`Marcando ${Math.min(i + CHUNK, cnpjs.length)} de ${cnpjs.length}...`)
      const { data, error } = await supabase.from('carteira_cliente')
        .update({ alerta_renovacao: true, atualizado_em: new Date().toISOString() })
        .in('cnpj', lote).is('excluido_em', null).select('cnpj')
      if (!error && data) {
        marcados += data.length
        const encontrados = new Set(data.map(d => d.cnpj))
        for (const c of lote) if (!encontrados.has(c)) naoEncontrados.push(c)
      } else {
        naoEncontrados.push(...lote)
      }
    }

    setProcessando(false)
    setProgresso('')
    setResultado({ marcados, naoEncontrados })
    setCnpjs([])
    setArquivo(null)
  }

  return (
    <div className="main">
      <div className="lm-section-title">Upload Renovação Antecipada (M16 → M17)</div>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 16px' }}>
        Sobe uma lista de CNPJ (coluna "CNPJ") dos clientes que estão entrando no M16 — o mês antes da janela de
        renovação. Marca esses clientes já existentes na carteira com o flag de renovação antecipada, que fica
        destacado no Kanban e no Potencial de Carteira. Não cria cliente novo — só sinaliza quem já está na base.
      </p>

      <div className="kanban-toolbar">
        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleArquivo} />
        {arquivo && <span style={{ fontSize: 12, color: '#660099' }}>{arquivo.name} — {cnpjs.length} CNPJ(s) válido(s)</span>}
      </div>

      {cnpjs.length > 0 && (
        <button className="btn-save-obs" style={{ float: 'none' }} onClick={marcar} disabled={processando}>
          {processando ? 'Marcando...' : `Marcar ${cnpjs.length} cliente(s) como renovação antecipada`}
        </button>
      )}

      {progresso && <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>{progresso}</div>}

      {resultado && (
        <div className="lm-resumo" style={{ marginTop: 16 }}>
          {resultado.marcados} cliente(s) marcado(s) com sucesso.
          {resultado.naoEncontrados.length > 0 && (
            <div className="login-erro" style={{ marginTop: 8 }}>
              {resultado.naoEncontrados.length} CNPJ(s) não encontrado(s) na carteira (não foram marcados): {resultado.naoEncontrados.slice(0, 15).join(', ')}
              {resultado.naoEncontrados.length > 15 && '...'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

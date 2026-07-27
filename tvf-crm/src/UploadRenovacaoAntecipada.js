import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { parseArquivo, mapearCampos, extrairCnpj } from './xlsxParse'

const ALIASES = {
  cnpj: ['cnpj'],
  cliente: ['cliente'],
  qt_planta: ['qtplanta'],
  cidade: ['dsmunicipio'],
  uf: ['uf'],
  plano: ['plano'],
}

const CHUNK_CONSULTA = 60 // .in() com muitos ids estoura o tamanho da URL/request
const CHUNK_INSERT = 500

export default function UploadRenovacaoAntecipada() {
  const [staff, setStaff] = useState([])
  const [participantes, setParticipantes] = useState(new Set())
  const [arquivo, setArquivo] = useState(null)
  const [linhas, setLinhas] = useState([])
  const [processando, setProcessando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    supabase.from('consultores_staff').select('id, nome, perfil').order('nome').then(({ data }) => setStaff(data || []))
  }, [])

  function alternarParticipante(id) {
    setParticipantes(prev => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }

  async function handleArquivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setArquivo(file)
    setResultado(null)
    const brutas = await parseArquivo(file)
    const vistos = new Set()
    const mapeadas = []
    for (const l of brutas) {
      const m = mapearCampos(l, ALIASES)
      const cnpj = extrairCnpj(m.cnpj) || String(m.cnpj).replace(/\D/g, '')
      if (!cnpj || vistos.has(cnpj)) continue
      vistos.add(cnpj)
      mapeadas.push({
        cnpj,
        razao_social: m.cliente || null,
        qt_planta: parseInt(String(m.qt_planta).replace(/\D/g, ''), 10) || 0,
        cidade: m.cidade || '',
        uf: m.uf || '',
        plano: m.plano || '',
      })
    }
    setLinhas(mapeadas)
  }

  async function processar() {
    if (participantes.size === 0) return
    setProcessando(true)
    setResultado(null)

    // 1) Quem já existe na carteira (ativo) só ganha o flag — mantém o consultor que já tem.
    const todosCnpjs = linhas.map(l => l.cnpj)
    const existentesSet = new Set()
    for (let i = 0; i < todosCnpjs.length; i += CHUNK_CONSULTA) {
      const lote = todosCnpjs.slice(i, i + CHUNK_CONSULTA)
      setProgresso(`Conferindo clientes já existentes (${Math.min(i + CHUNK_CONSULTA, todosCnpjs.length)} de ${todosCnpjs.length})...`)
      const { data } = await supabase.from('carteira_cliente').select('cnpj').in('cnpj', lote).is('excluido_em', null)
      for (const row of (data || [])) existentesSet.add(row.cnpj)
    }

    let existentesMarcados = 0
    const existentesCnpjs = todosCnpjs.filter(c => existentesSet.has(c))
    for (let i = 0; i < existentesCnpjs.length; i += CHUNK_CONSULTA) {
      const lote = existentesCnpjs.slice(i, i + CHUNK_CONSULTA)
      setProgresso(`Marcando existentes (${Math.min(i + CHUNK_CONSULTA, existentesCnpjs.length)} de ${existentesCnpjs.length})...`)
      const { data } = await supabase.from('carteira_cliente')
        .update({ alerta_renovacao: true, atualizado_em: new Date().toISOString() })
        .in('cnpj', lote).is('excluido_em', null).select('cnpj')
      existentesMarcados += data?.length || 0
    }

    // 2) Quem ainda não existe entra novo, distribuído pelos participantes escolhidos —
    // maior QT_PLANTA primeiro, sempre pro consultor com menos linhas acumuladas até agora (LPT).
    const novos = linhas.filter(l => !existentesSet.has(l.cnpj)).sort((a, b) => b.qt_planta - a.qt_planta)
    const somaPorConsultor = new Map(Array.from(participantes).map(id => [id, 0]))
    const registrosNovos = novos.map(l => {
      let menorId = null, menorSoma = Infinity
      for (const [id, soma] of somaPorConsultor) if (soma < menorSoma) { menorSoma = soma; menorId = id }
      somaPorConsultor.set(menorId, menorSoma + l.qt_planta)
      const observacoes = [
        l.plano && `Plano: ${l.plano}`,
        `QT_PLANTA (linhas): ${l.qt_planta}`,
        (l.cidade || l.uf) && `Cidade: ${[l.cidade, l.uf].filter(Boolean).join(' - ')}`,
      ].filter(Boolean).join(' | ')
      return {
        cnpj: l.cnpj, razao_social: l.razao_social, consultor_id: menorId,
        status: 'Aguardando Atendimento', origem: 'Renovação Antecipada (M16)',
        alerta_renovacao: true, observacoes: observacoes || null,
      }
    })

    let novosCriados = 0, falhas = 0
    const errosAmostra = []
    for (let i = 0; i < registrosNovos.length; i += CHUNK_INSERT) {
      const lote = registrosNovos.slice(i, i + CHUNK_INSERT)
      setProgresso(`Criando novos (${Math.min(i + CHUNK_INSERT, registrosNovos.length)} de ${registrosNovos.length})...`)
      const { data, error } = await supabase.from('carteira_cliente').insert(lote).select('id')
      if (error) { falhas += lote.length; if (errosAmostra.length < 3) errosAmostra.push(error.message) }
      else novosCriados += data?.length || 0
    }

    const porConsultor = Array.from(somaPorConsultor.entries()).map(([id, soma]) => ({
      nome: staff.find(s => s.id === id)?.nome || '—',
      qtd: registrosNovos.filter(r => r.consultor_id === id).length,
      somaLinhas: soma,
    }))

    setProcessando(false)
    setProgresso('')
    setResultado({ existentesMarcados, novosCriados, falhas, errosAmostra, porConsultor })
    setLinhas([])
    setArquivo(null)
  }

  return (
    <div className="main">
      <div className="lm-section-title">Upload Renovação Antecipada (M16 → M17)</div>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 16px' }}>
        Sobe o export do Parque Móvel filtrado em M16. Cliente que já existe na carteira só ganha o flag de
        renovação antecipada (mantém o consultor atual). Cliente novo é distribuído entre os consultores marcados
        abaixo, do maior pro menor QT_PLANTA (linhas), sempre pro que tiver menos linhas acumuladas até agora —
        fica balanceado por volume, não só por quantidade de clientes.
      </p>

      <div className="kanban-toolbar" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#888' }}>Distribuir novos entre:</span>
        {staff.map(s => (
          <label key={s.id} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={participantes.has(s.id)} onChange={() => alternarParticipante(s.id)} />
            {s.nome}
          </label>
        ))}
      </div>
      {participantes.size === 0 && <div style={{ fontSize: 11, color: '#C0451A', marginBottom: 12 }}>Marca pelo menos um consultor antes de subir o arquivo.</div>}

      <div className="kanban-toolbar">
        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleArquivo} disabled={participantes.size === 0} />
        {arquivo && <span style={{ fontSize: 12, color: '#660099' }}>{arquivo.name} — {linhas.length} CNPJ(s) válido(s)</span>}
      </div>

      {linhas.length > 0 && (
        <button className="btn-save-obs" style={{ float: 'none' }} onClick={processar} disabled={processando || participantes.size === 0}>
          {processando ? 'Processando...' : `Processar ${linhas.length} cliente(s)`}
        </button>
      )}

      {progresso && <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>{progresso}</div>}

      {resultado && (
        <div className="lm-resumo" style={{ marginTop: 16 }}>
          {resultado.existentesMarcados} cliente(s) já existente(s) marcado(s) com o flag. {resultado.novosCriados} cliente(s) novo(s) criado(s) e distribuído(s).
          <div style={{ marginTop: 8 }}>
            {resultado.porConsultor.map(p => (
              <div key={p.nome}>{p.nome}: {p.qtd} cliente(s) novo(s) — {p.somaLinhas} linhas acumuladas</div>
            ))}
          </div>
          {resultado.falhas > 0 && (
            <div className="login-erro" style={{ marginTop: 8 }}>
              {resultado.falhas} falha(s) ao criar. Exemplo(s): {resultado.errosAmostra.join(' | ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

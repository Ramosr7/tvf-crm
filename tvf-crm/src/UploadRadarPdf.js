import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// Mapa das colunas do PDF pros 6 pilares do Plano Comercial (Excel usa os mesmos códigos).
// Receita Telecom soma tudo que é produto novo (não renovação, não aparelho — que tem pilar
// próprio): Móvel + Fibra + Digital + Avançado + CPF.
function calcularVerticais(s) {
  return {
    APARELHO: s.aparelho_valor || 0,
    HA: s.ha_qtd || 0,
    BL: s.bl_qtd || 0,
    MM: s.renovacao_movel_qtd || 0,
    MB: s.renovacao_fixa_valor || 0,
    RECEITA_TELECOM: (s.ha_valor || 0) + (s.bl_valor || 0) + (s.digital_valor || 0) + (s.avancado_valor || 0) + (s.cpf_valor || 0),
  }
}

function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}
function hoje() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function fmtMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function UploadRadarPdf() {
  const [staff, setStaff] = useState([])
  const [mesReferencia, setMesReferencia] = useState(hoje())
  const [arquivo, setArquivo] = useState(null)
  const [lendo, setLendo] = useState(false)
  const [supervisores, setSupervisores] = useState([])
  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.from('consultores_staff').select('id, nome').order('nome').then(({ data }) => setStaff(data || []))
  }, [])

  function acharConsultor(nome) {
    const alvo = normalizar(nome)
    return staff.find(s => normalizar(s.nome) === alvo) || staff.find(s => normalizar(s.nome).includes(alvo) || alvo.includes(normalizar(s.nome)))
  }

  async function handleArquivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setArquivo(file)
    setResultado(null)
    setErro('')
    setSupervisores([])
    setLendo(true)

    try {
      const buf = await file.arrayBuffer()
      const base64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''))
      const { data: sessao } = await supabase.auth.getSession()
      const resp = await fetch('/api/parse-radar-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao?.session?.access_token}` },
        body: JSON.stringify({ pdfBase64: base64 }),
      })
      const dados = await resp.json()
      if (!resp.ok) throw new Error(dados.error || 'Erro ao ler o PDF')
      setSupervisores(dados.supervisores || [])
    } catch (err) {
      setErro(err.message)
    } finally {
      setLendo(false)
    }
  }

  async function processar() {
    setProcessando(true)
    setResultado(null)
    const mesData = `${mesReferencia}-01`
    let atualizadas = 0, criadas = 0, falhas = 0
    const semMatch = new Set()

    for (const s of supervisores) {
      const consultor = acharConsultor(s.nome)
      if (!consultor) { semMatch.add(s.nome); continue }
      const verticais = calcularVerticais(s)

      for (const [vertical, esteira] of Object.entries(verticais)) {
        const { data: existente } = await supabase.from('plano_comercial').select('id')
          .eq('mes_referencia', mesData).eq('consultor_id', consultor.id).eq('vertical', vertical).maybeSingle()

        if (existente) {
          const { error } = await supabase.from('plano_comercial')
            .update({ esteira, atualizado_em: new Date().toISOString() }).eq('id', existente.id)
          if (error) falhas++; else atualizadas++
        } else {
          const { error } = await supabase.from('plano_comercial')
            .insert({ mes_referencia: mesData, consultor_id: consultor.id, vertical, meta: 0, backlog: 0, esteira })
          if (error) falhas++; else criadas++
        }
      }
    }

    setProcessando(false)
    setResultado({ atualizadas, criadas, falhas, semMatch: Array.from(semMatch) })
    setSupervisores([])
    setArquivo(null)
  }

  return (
    <div className="main">
      <div className="lm-section-title">Upload Radar Diário (PDF)</div>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 16px' }}>
        Sobe o PDF "RADAR DIÁRIO GERENCIAL DE VENDA" — atualiza a Esteira Mês do Plano
        Comercial (só a esteira; Meta e Backlog continuam vindo do Excel de referência). Usa
        só a tabela "VENDAS COM ACEITE", ignora "Aguardando Aceite" e a linha TOTAL. Sobe todo
        dia — o valor de cada vertical é substituído pelo total do mês até a data do PDF (não
        soma em cima do que já tinha).
      </p>

      <div className="kanban-toolbar">
        <label style={{ fontSize: 12, color: '#888' }}>Mês de referência
          <input type="month" className="lm-input" style={{ marginLeft: 8 }} value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} />
        </label>
        <input type="file" accept=".pdf" onChange={handleArquivo} disabled={lendo} />
        {lendo && <span style={{ fontSize: 12, color: '#660099' }}>Lendo PDF com IA...</span>}
        {arquivo && !lendo && <span style={{ fontSize: 12, color: '#660099' }}>{arquivo.name} — {supervisores.length} time(s) reconhecido(s)</span>}
      </div>

      {erro && <div className="login-erro" style={{ marginTop: 8 }}>{erro}</div>}

      {supervisores.length > 0 && (
        <>
          <div className="carteira-table-wrap" style={{ marginTop: 12, marginBottom: 12 }}>
            <table className="carteira-table">
              <thead><tr><th>Supervisor</th><th>Aparelho</th><th>HA</th><th>BL</th><th>MM (Renov. Móvel)</th><th>MB (Renov. Fixa)</th><th>Receita Telecom</th></tr></thead>
              <tbody>
                {supervisores.map((s, i) => {
                  const v = calcularVerticais(s)
                  const consultor = acharConsultor(s.nome)
                  return (
                    <tr key={i} style={!consultor ? { background: '#FFF5EE' } : {}}>
                      <td>{s.nome}{!consultor && <span style={{ color: '#C0451A', fontWeight: 600 }}> (sem match)</span>}</td>
                      <td>{fmtMoeda(v.APARELHO)}</td>
                      <td>{v.HA}</td>
                      <td>{v.BL}</td>
                      <td>{v.MM}</td>
                      <td>{fmtMoeda(v.MB)}</td>
                      <td>{fmtMoeda(v.RECEITA_TELECOM)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button className="btn-save-obs" style={{ float: 'none' }} onClick={processar} disabled={processando}>
            {processando ? 'Processando...' : `Processar ${supervisores.length} time(s)`}
          </button>
        </>
      )}

      {resultado && (
        <div className="lm-resumo" style={{ marginTop: 16 }}>
          {resultado.atualizadas} vertical(is) atualizada(s), {resultado.criadas} criada(s) na aba Plano Comercial.
          {resultado.semMatch.length > 0 && (
            <div className="login-erro" style={{ marginTop: 8 }}>
              Supervisor(es) sem match em consultores_staff: {resultado.semMatch.join(', ')}
            </div>
          )}
          {resultado.falhas > 0 && <div className="login-erro" style={{ marginTop: 8 }}>{resultado.falhas} falha(s) ao salvar.</div>}
        </div>
      )}
    </div>
  )
}

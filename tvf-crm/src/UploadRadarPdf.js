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
// Nome no cadastro costuma ser curto ("Isabele Cruz") e o do PDF vem completo ("Isabele
// Rodrigues da Cruz") — casar por substring grudada falha nesse caso. Casa por palavra: toda
// palavra do nome cadastrado precisa aparecer entre as palavras do nome do PDF.
function palavras(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean)
}
function hoje() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function fmtMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// modo 'backlog': sobe uma vez no início do mês, define o Backlog (baseline).
// modo 'esteira': sobe todo dia, atualiza a Esteira Mês (acumulado até a data do PDF).
export default function UploadRadarPdf({ modo }) {
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

  // recebe a lista de staff explícita (não o state) — o upload dispara o processamento
  // automático logo depois de ler o PDF, antes do useEffect de cima necessariamente já ter
  // resolvido, então não dá pra confiar no state `staff` fechado por closure nesse momento
  function acharConsultor(nome, staffList) {
    const alvoNorm = normalizar(nome)
    const exato = staffList.find(s => normalizar(s.nome) === alvoNorm)
    if (exato) return exato
    const alvoPalavras = palavras(nome)
    return staffList.find(s => palavras(s.nome).every(p => alvoPalavras.includes(p)))
  }

  async function garantirStaff() {
    if (staff.length > 0) return staff
    const { data } = await supabase.from('consultores_staff').select('id, nome').order('nome')
    const lista = data || []
    setStaff(lista)
    return lista
  }

  // sobe o PDF e já processa sozinho, sem precisar de um segundo clique — antes exigia
  // "Ler" e depois "Processar" separado, e ficou claro que consultor esquecia o segundo passo
  // e achava que tinha subido quando na verdade nada foi salvo.
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
      const lista = dados.supervisores || []
      setSupervisores(lista)
      setLendo(false)
      if (lista.length > 0) await processar(lista)
    } catch (err) {
      setErro(err.message)
      setLendo(false)
    }
  }

  async function processar(lista) {
    const listaFinal = lista || supervisores
    setProcessando(true)
    setResultado(null)
    const staffAtual = await garantirStaff()
    const mesData = `${mesReferencia}-01`
    let atualizadas = 0, criadas = 0, falhas = 0
    const semMatch = new Set()

    for (const s of listaFinal) {
      const consultor = acharConsultor(s.nome, staffAtual)
      if (!consultor) { semMatch.add(s.nome); continue }
      const verticais = calcularVerticais(s)

      for (const [vertical, valor] of Object.entries(verticais)) {
        const { data: existente } = await supabase.from('plano_comercial').select('id')
          .eq('mes_referencia', mesData).eq('consultor_id', consultor.id).eq('vertical', vertical).maybeSingle()

        const campos = modo === 'backlog'
          ? { backlog: valor, atualizado_em: new Date().toISOString() }
          : { esteira: valor, atualizado_em: new Date().toISOString() }

        if (existente) {
          const { error } = await supabase.from('plano_comercial').update(campos).eq('id', existente.id)
          if (error) falhas++; else atualizadas++
        } else {
          const { error } = await supabase.from('plano_comercial')
            .insert({ mes_referencia: mesData, consultor_id: consultor.id, vertical, meta: 0, backlog: 0, esteira: 0, ...campos })
          if (error) falhas++; else criadas++
        }
      }
    }

    setProcessando(false)
    setResultado({ atualizadas, criadas, falhas, semMatch: Array.from(semMatch) })
  }

  return (
    <div className="main">
      <div className="lm-section-title">{modo === 'backlog' ? 'Upload Backlog (Radar PDF, dia 1)' : 'Upload Radar Diário (PDF)'}</div>
      <details className="regras-toggle">
        <summary>Ver regras dessa importação</summary>
        <div className="regras-toggle-corpo">
          {modo === 'backlog' ? (
            'Sobe o PDF "RADAR DIÁRIO GERENCIAL DE VENDA" do dia 1 do mês — usa só a tabela ' +
            '"VENDAS COM ACEITE", ignora "Aguardando Aceite" e a linha TOTAL. Define o Backlog ' +
            '(baseline) do mês pra cada time. Roda uma vez por mês, no início.'
          ) : (
            'Sobe o PDF "RADAR DIÁRIO GERENCIAL DE VENDA" — usa só a tabela "VENDAS COM ACEITE", ' +
            'ignora "Aguardando Aceite" e a linha TOTAL. Atualiza a Esteira Mês (acumulado até a ' +
            'data do PDF, substitui o valor anterior, não soma em cima). Roda todo dia. Backlog e ' +
            'Meta vêm de outras abas de importação.'
          )}
        </div>
      </details>

      <div className="kanban-toolbar">
        <label style={{ fontSize: 12, color: '#888' }}>Mês de referência
          <input type="month" className="lm-input" style={{ marginLeft: 8 }} value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} />
        </label>
        <input type="file" accept=".pdf,application/pdf" onChange={handleArquivo} disabled={lendo || processando} />
        {lendo && <span style={{ fontSize: 12, color: '#660099' }}>Lendo PDF com IA...</span>}
        {processando && <span style={{ fontSize: 12, color: '#660099' }}>Salvando no Plano Comercial...</span>}
        {arquivo && !lendo && !processando && (
          <span style={{ fontSize: 12, color: '#660099' }}>{arquivo.name} — {supervisores.length} time(s) reconhecido(s), salvo automaticamente</span>
        )}
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
                  const consultor = acharConsultor(s.nome, staff)
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
          {/* já processa sozinho ao subir o arquivo — esse botão só existe pra reprocessar
              manualmente (ex: corrigiu o nome de um supervisor em consultores_staff e quer
              tentar de novo sem subir o PDF outra vez) */}
          <button className="btn-filter-light" onClick={() => processar()} disabled={processando || lendo}>
            {processando ? 'Processando...' : `Reprocessar ${supervisores.length} time(s)`}
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

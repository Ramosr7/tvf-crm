import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// Mapa das colunas do PDF pros pilares do Plano Comercial (Excel usa os mesmos códigos).
// Receita Telecom soma produto novo que não tem pilar próprio: Móvel + Fibra + Digital + CPF
// (Avançado saiu daqui — virou vertical própria, só no time do Nishida, que é quem vende).
// Só inclui a chave AVANCADO quando o supervisor é o Nishida — os outros times não têm essa
// linha no Plano Comercial (mesma trava usada em PlanoComercial.js).
const NISHIDA_ID = 'dddba003-a87c-4511-8047-55ffd30ca46c'
function calcularVerticais(s, consultorId) {
  const base = {
    APARELHO: s.aparelho_valor || 0,
    HA: s.ha_qtd || 0,
    BL: s.bl_qtd || 0,
    MM: s.renovacao_movel_qtd || 0,
    MB: s.renovacao_fixa_valor || 0,
    RECEITA_TELECOM: (s.ha_valor || 0) + (s.bl_valor || 0) + (s.digital_valor || 0) + (s.cpf_valor || 0),
  }
  if (consultorId === NISHIDA_ID) base.AVANCADO = s.avancado_valor || 0
  return base
}

// pra "Minha Comissão" — 6 pilares do plano de remuneração, diferente dos 6 do Plano
// Comercial (Avançado e Outras Receitas não existem lá, ficam somados dentro de
// RECEITA_TELECOM; Renovação Fixa não entra na comissão). Gatilho é a métrica que decide a
// faixa (quantidade em Altas/BL/Renovação Móvel, R$ nos outros); receita é sempre o R$ que a
// comissão de fato multiplica.
const JOAO_ID = '971645c3-b9a3-44a9-9848-5a5fa83ff8b1'
function calcularComissaoPilares(s) {
  return {
    ALTAS: { gatilho: s.ha_qtd || 0, receita: s.ha_valor || 0 },
    BANDA_LARGA: { gatilho: s.bl_qtd || 0, receita: s.bl_valor || 0 },
    RENOVACAO_MOVEL: { gatilho: s.renovacao_movel_qtd || 0, receita: s.renovacao_movel_valor || 0 },
    AVANCADO: { gatilho: s.avancado_valor || 0, receita: s.avancado_valor || 0 },
    OUTRAS_RECEITAS: { gatilho: (s.digital_valor || 0) + (s.cpf_valor || 0), receita: (s.digital_valor || 0) + (s.cpf_valor || 0) },
    APARELHO: { gatilho: s.aparelho_valor || 0, receita: s.aparelho_valor || 0 },
  }
}
// meta de Altas/BL/Renovação Móvel/Aparelho já existe no Plano Comercial (mesmo pilar,
// reaproveita); Avançado/Outras Receitas não têm meta lá — mantém o que já tava salvo em
// comissao_pilar (editado à mão na própria aba), sem sobrescrever nesse upload.
const PILAR_PARA_VERTICAL_PC = { ALTAS: 'HA', BANDA_LARGA: 'BL', RENOVACAO_MOVEL: 'MM', APARELHO: 'APARELHO', AVANCADO: 'AVANCADO' }

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

    const consultoresMatched = []

    for (const s of listaFinal) {
      const consultor = acharConsultor(s.nome, staffAtual)
      if (!consultor) { semMatch.add(s.nome); continue }
      consultoresMatched.push(consultor.id)
      const verticais = calcularVerticais(s, consultor.id)

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

    // "Minha Comissão" é a visão do João como Gestor das 4 equipes — o resultado soma TODOS
    // os times do radar (não só o time cujo supervisor bate com o nome dele), e a meta
    // também soma a meta das 4 equipes em vez de usar só a meta individual dele.
    if (modo === 'esteira') {
      const pilaresSoma = {}
      for (const s of listaFinal) {
        const p = calcularComissaoPilares(s)
        for (const [pilar, { gatilho, receita }] of Object.entries(p)) {
          if (!pilaresSoma[pilar]) pilaresSoma[pilar] = { gatilho: 0, receita: 0 }
          pilaresSoma[pilar].gatilho += gatilho
          pilaresSoma[pilar].receita += receita
        }
      }

      const metaPorVertical = {}
      if (consultoresMatched.length > 0) {
        const { data: metasPc } = await supabase.from('plano_comercial').select('vertical, meta')
          .eq('mes_referencia', mesData).in('consultor_id', consultoresMatched)
        for (const m of (metasPc || [])) metaPorVertical[m.vertical] = (metaPorVertical[m.vertical] || 0) + (m.meta || 0)
      }

      for (const [pilar, { gatilho, receita }] of Object.entries(pilaresSoma)) {
        const { data: existentePilar } = await supabase.from('comissao_pilar').select('id, meta_gatilho')
          .eq('mes_referencia', mesData).eq('pilar', pilar).maybeSingle()
        const verticalPc = PILAR_PARA_VERTICAL_PC[pilar]
        const metaGatilho = verticalPc && metaPorVertical[verticalPc] !== undefined
          ? metaPorVertical[verticalPc]
          : (existentePilar?.meta_gatilho ?? 0)

        if (existentePilar) {
          await supabase.from('comissao_pilar').update({ gatilho, receita, meta_gatilho: metaGatilho, atualizado_em: new Date().toISOString() }).eq('id', existentePilar.id)
        } else {
          await supabase.from('comissao_pilar').insert({ mes_referencia: mesData, pilar, gatilho, receita, meta_gatilho: metaGatilho })
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
        <label style={{ fontSize: 12, color: 'rgba(245,241,250,0.55)' }}>Mês de referência
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
              <thead><tr><th>Supervisor</th><th>Aparelho</th><th>HA</th><th>BL</th><th>MM (Renov. Móvel)</th><th>MB (Renov. Fixa)</th><th>Receita Avançado</th><th>Receita Telecom</th></tr></thead>
              <tbody>
                {supervisores.map((s, i) => {
                  const consultor = acharConsultor(s.nome, staff)
                  const v = calcularVerticais(s, consultor?.id)
                  return (
                    <tr key={i} style={!consultor ? { background: 'rgba(255,107,107,0.12)' } : {}}>
                      <td>{s.nome}{!consultor && <span style={{ color: 'var(--vermelho)', fontWeight: 600 }}> (sem match)</span>}</td>
                      <td>{fmtMoeda(v.APARELHO)}</td>
                      <td>{v.HA}</td>
                      <td>{v.BL}</td>
                      <td>{v.MM}</td>
                      <td>{fmtMoeda(v.MB)}</td>
                      <td>{v.AVANCADO !== undefined ? fmtMoeda(v.AVANCADO) : '—'}</td>
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

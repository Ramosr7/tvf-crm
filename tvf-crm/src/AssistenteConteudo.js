import React, { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

function formatDataHora(str) {
  return new Date(str).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// planilha inteira (todas as abas) vira um texto tipo CSV, legível pro assistente
function xlsxParaTexto(workbook) {
  return workbook.SheetNames.map(nome => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[nome])
    return `## Aba: ${nome}\n${csv}`
  }).join('\n\n')
}

// o chat (api/assistente-chat.js) corta cada tema em no máximo ~9000 caracteres antes de
// mandar pra IA — um book de 150k chars vinha 94% cortado, perdendo o plano exato que o
// consultor perguntava. Solução: dividir o conteúdo grande em várias entradas menores no
// próprio cadastro, cada uma cabendo inteira, em vez de confiar no corte automático.
const TAMANHO_MAX_PARTE = 7000
const SUFIXO_PARTE = / — parte \d+\/\d+$/

// separa o texto respeitando os marcadores de página que a extração de PDF já grava
// ("## Página N" / "## Páginas X-Y") — cada parte fica com página inteira, nunca corta uma
// página no meio. Sem marcador (texto colado à mão, Excel), corta por tamanho bruto mesmo.
function dividirEmPartes(texto, maxChars) {
  const blocos = texto.split(/(?=^## Páginas? )/m).filter(b => b.trim())
  if (blocos.length <= 1) {
    const partes = []
    for (let i = 0; i < texto.length; i += maxChars) partes.push(texto.slice(i, i + maxChars))
    return partes
  }
  const partes = []
  let atual = ''
  for (const bloco of blocos) {
    if (atual && (atual.length + bloco.length) > maxChars) { partes.push(atual); atual = '' }
    atual += bloco
  }
  if (atual) partes.push(atual)
  return partes
}

async function chamarUmaFatia(jobId) {
  const { data: sessao } = await supabase.auth.getSession()
  const resp = await fetch('/api/processar-upload-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao?.session?.access_token}` },
    body: JSON.stringify({ jobId }),
  })
  const textoResp = await resp.text()
  let dados = null
  try { dados = JSON.parse(textoResp) } catch { /* resposta não veio como JSON — provavelmente erro de infraestrutura (tamanho, timeout) */ }
  if (!resp.ok || !dados) throw new Error(dados?.error || `Erro ${resp.status} ao processar o PDF: ${textoResp.slice(0, 300)}`)
  return dados
}

// documento processa em fatias de poucas páginas — chama repetido até "concluido", indo
// atualizando o texto acumulado a cada volta (onProgresso), pra tela mostrar o progresso
async function chamarProcessarJob(jobId, onProgresso) {
  while (true) {
    const dados = await chamarUmaFatia(jobId)
    if (onProgresso) onProgresso(dados)
    if (dados.status === 'concluido') return dados.conteudo
  }
}

const RASCUNHO_KEY = 'tvf_assistente_rascunho'
function carregarRascunho() {
  try { return JSON.parse(sessionStorage.getItem(RASCUNHO_KEY) || 'null') || {} } catch { return {} }
}

export default function AssistenteConteudo({ user }) {
  const rascunhoInicial = carregarRascunho()
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  // sessionStorage: se o Chrome descartar a aba (fica em segundo plano e recarrega do zero),
  // o que já tava digitado/processado não some — só reseta ao salvar/cancelar ou fechar a aba
  const [titulo, setTitulo] = useState(rascunhoInicial.titulo || '')
  const [conteudo, setConteudo] = useState(rascunhoInicial.conteudo || '')
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [editandoId, setEditandoId] = useState(rascunhoInicial.editandoId || null)
  const [expandidoId, setExpandidoId] = useState(null)
  const [jobAtualId, setJobAtualId] = useState(rascunhoInicial.jobAtualId || null)
  const [jobAtualPath, setJobAtualPath] = useState(rascunhoInicial.jobAtualPath || null)
  const [jobAtualNome, setJobAtualNome] = useState(rascunhoInicial.jobAtualNome || null)
  const [jobs, setJobs] = useState([])
  const [retomandoId, setRetomandoId] = useState(null)
  const [progresso, setProgresso] = useState('')
  const [semResposta, setSemResposta] = useState([])
  const [gerandoDiagnostico, setGerandoDiagnostico] = useState(false)
  const [diagnostico, setDiagnostico] = useState('')
  const [erroDiagnostico, setErroDiagnostico] = useState('')
  const [staff, setStaff] = useState([])

  useEffect(() => {
    if (!titulo && !conteudo) { sessionStorage.removeItem(RASCUNHO_KEY); return }
    sessionStorage.setItem(RASCUNHO_KEY, JSON.stringify({ titulo, conteudo, editandoId, jobAtualId, jobAtualPath, jobAtualNome }))
  }, [titulo, conteudo, editandoId, jobAtualId, jobAtualPath, jobAtualNome])

  const carregar = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: jobsData }, { data: semRespostaData }, { data: staffData }] = await Promise.all([
      supabase.from('assistente_conteudo').select('*').order('titulo', { ascending: true }),
      supabase.from('assistente_upload_job').select('*').neq('status', 'concluido').order('criado_em', { ascending: false }),
      supabase.from('assistente_mensagem').select('*').eq('sem_resposta', true).eq('resolvida', false).order('criado_em', { ascending: false }),
      supabase.from('consultores_staff').select('id, nome'),
    ])
    setLista(data || [])
    setJobs(jobsData || [])
    setSemResposta(semRespostaData || [])
    setStaff(staffData || [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function nomeConsultor(id) {
    return staff.find(s => s.id === id)?.nome || '—'
  }

  async function marcarResolvida(msg) {
    await supabase.from('assistente_mensagem').update({ resolvida: true }).eq('id', msg.id)
    carregar()
  }

  async function gerarDiagnostico() {
    setGerandoDiagnostico(true)
    setErroDiagnostico('')
    setDiagnostico('')
    try {
      const { data: perguntasData, error: rpcError } = await supabase.rpc('assistente_perguntas_anonimas', { dias_atras: 30 })
      if (rpcError) throw rpcError
      const perguntas = (perguntasData || []).map(p => p.conteudo)
      if (perguntas.length === 0) { setErroDiagnostico('Nenhuma pergunta feita ao Joaozinho nos últimos 30 dias.'); return }
      const { data: sessao } = await supabase.auth.getSession()
      const resp = await fetch('/api/diagnostico-duvidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao?.session?.access_token}` },
        body: JSON.stringify({ perguntas }),
      })
      const dados = await resp.json()
      if (!resp.ok) throw new Error(dados.error || 'Erro ao gerar diagnóstico')
      setDiagnostico(dados.diagnostico)
    } catch (err) {
      setErroDiagnostico(err.message)
    } finally {
      setGerandoDiagnostico(false)
    }
  }

  function editar(item) {
    setEditandoId(item.id)
    setTitulo(item.titulo)
    setConteudo(item.conteudo)
    setErro('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function alternarExpandido(id) {
    setExpandidoId(prev => prev === id ? null : id)
  }

  function novoConteudo() {
    setEditandoId(null)
    setTitulo('')
    setConteudo('')
    setErro('')
    setJobAtualId(null)
    setJobAtualPath(null)
    setJobAtualNome(null)
  }

  async function handleArquivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setErro('')
    const tituloArquivo = titulo.trim() || file.name.replace(/\.(pdf|xlsx|xls)$/i, '')
    if (!titulo.trim()) setTitulo(tituloArquivo)

    const ehPdf = file.name.toLowerCase().endsWith('.pdf')
    setLendo(true)
    try {
      if (ehPdf) {
        // sobe pro Storage (aguenta arquivo binário grande, sem o limite de request que uma
        // coluna de texto base64 tinha) e salva o job ANTES de processar — se a aba morrer
        // durante a leitura por IA (que demora mais), o job fica salvo e dá pra retomar depois
        // Storage rejeita acento/espaço/caractere especial na chave — nome do arquivo original
        // fica salvo em `filename` (mandado pra IA), o path só precisa ser um identificador válido
        const nomeSanitizado = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-zA-Z0-9.\-_]/g, '_')
        const path = `${user.id}/${Date.now()}-${nomeSanitizado}`
        const { error: upError } = await supabase.storage.from('assistente-uploads').upload(path, file)
        if (upError) throw upError
        const { data: job, error: jobError } = await supabase.from('assistente_upload_job')
          .insert({ titulo: tituloArquivo, filename: file.name, storage_path: path, criado_por: user.id })
          .select().single()
        if (jobError) throw jobError
        setJobAtualId(job.id)
        setJobAtualPath(job.storage_path)
        setJobAtualNome(job.filename)
        const texto = await chamarProcessarJob(job.id, (d) => {
          setConteudo(d.conteudo || '')
          setProgresso(d.status === 'parcial' ? `Processando... página ${d.progresso}` : '')
        })
        setConteudo(texto || '')
        carregar()
      } else {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        setConteudo(xlsxParaTexto(wb))
      }
    } catch (err) {
      setErro(`${err.message} (se a aba caiu no meio, o arquivo já tá salvo — dá pra retomar na lista "Uploads pendentes" abaixo)`)
      carregar()
    } finally {
      setLendo(false)
      setProgresso('')
      e.target.value = ''
    }
  }

  async function retomarJob(job) {
    setRetomandoId(job.id)
    setErro('')
    setEditandoId(null)
    setJobAtualId(job.id)
    setJobAtualPath(job.storage_path)
    setJobAtualNome(job.filename)
    setTitulo(job.titulo)
    try {
      const texto = await chamarProcessarJob(job.id, (d) => {
        setConteudo(d.conteudo || '')
        setProgresso(d.status === 'parcial' ? `Processando... página ${d.progresso}` : '')
      })
      setConteudo(texto || '')
      carregar()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setErro(err.message)
      carregar()
    } finally {
      setRetomandoId(null)
      setProgresso('')
    }
  }

  async function excluirJob(job) {
    if (!window.confirm(`Descartar o upload "${job.titulo}"?`)) return
    if (job.storage_path) await supabase.storage.from('assistente-uploads').remove([job.storage_path])
    await supabase.from('assistente_upload_job').delete().eq('id', job.id)
    if (jobAtualId === job.id) novoConteudo()
    carregar()
  }

  async function salvar() {
    if (!titulo.trim() || !conteudo.trim()) {
      setErro('Preenche título e conteúdo antes de salvar.')
      return
    }
    setSalvando(true)
    setErro('')

    const tituloBase = titulo.trim().replace(SUFIXO_PARTE, '')
    // se o texto é grande, divide em várias entradas pequenas (uma por página/grupo de
    // páginas) em vez de um blob só — assim nada fica de fora quando o chat corta cada tema
    // por tamanho. Editar uma parte específica (título já termina em "— parte N/M") não
    // re-divide, salva só aquela parte mesmo.
    const dividir = !SUFIXO_PARTE.test(titulo.trim()) && conteudo.trim().length > TAMANHO_MAX_PARTE
    const partes = dividir ? dividirEmPartes(conteudo.trim(), TAMANHO_MAX_PARTE) : [conteudo.trim()]
    const titulosNovos = dividir
      ? partes.map((_, i) => `${tituloBase} — parte ${i + 1}/${partes.length}`)
      : [titulo.trim()]

    // pega os originais de qualquer versão anterior desse tema (blob único ou partes de uma
    // divisão anterior com outra quantidade de partes) pra não deixar arquivo órfão no Storage
    const [{ data: existenteUnico }, { data: existentesPartes }] = await Promise.all([
      supabase.from('assistente_conteudo').select('titulo, arquivo_original_path').eq('titulo', tituloBase),
      supabase.from('assistente_conteudo').select('titulo, arquivo_original_path').ilike('titulo', `${tituloBase} — parte %`),
    ])
    const existentes = [...(existenteUnico || []), ...(existentesPartes || [])]

    // remove as entradas antigas desse tema que não vão ser reescritas agora (ex: upload
    // anterior tinha 20 partes, esse tem 15 — sobrariam 5 órfãs sem isso)
    const titulosAntigos = (existentes || []).map(e => e.titulo).filter(t => !titulosNovos.includes(t))
    if (titulosAntigos.length > 0) {
      await supabase.from('assistente_conteudo').delete().in('titulo', titulosAntigos)
    }

    for (let i = 0; i < partes.length; i++) {
      const campos = {
        titulo: titulosNovos[i], conteudo: partes[i], atualizado_por: user.id, atualizado_em: new Date().toISOString(),
      }
      // só a primeira parte carrega o vínculo com o arquivo original — só mexe nisso se essa
      // sessão processou um arquivo novo, editar texto na mão não apaga o vínculo existente
      if (i === 0 && jobAtualId && jobAtualPath) {
        campos.arquivo_original_path = jobAtualPath
        campos.arquivo_original_nome = jobAtualNome
      }
      const { error } = await supabase.from('assistente_conteudo').upsert(campos, { onConflict: 'titulo' })
      if (error) { setSalvando(false); setErro(error.message); return }
    }
    setSalvando(false)

    const originalAntigo = (existentes || []).find(e => e.arquivo_original_path)?.arquivo_original_path
    if (originalAntigo && originalAntigo !== jobAtualPath) {
      await supabase.storage.from('assistente-uploads').remove([originalAntigo])
    }
    // job vira permanente (é o original do tema agora) — só apaga o registro de job, não o arquivo
    if (jobAtualId) await supabase.from('assistente_upload_job').delete().eq('id', jobAtualId)

    novoConteudo()
    carregar()
  }

  async function excluir(item) {
    if (!window.confirm(`Excluir "${item.titulo}"? O assistente para de usar esse conteúdo.`)) return
    if (item.arquivo_original_path) await supabase.storage.from('assistente-uploads').remove([item.arquivo_original_path])
    await supabase.from('assistente_conteudo').delete().eq('id', item.id)
    if (editandoId === item.id) novoConteudo()
    carregar()
  }

  async function verOriginal(item) {
    const { data, error } = await supabase.storage.from('assistente-uploads').createSignedUrl(item.arquivo_original_path, 60 * 10)
    if (error || !data?.signedUrl) { alert('Não consegui abrir o arquivo original: ' + (error?.message || 'erro desconhecido')); return }
    window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="main">
      <div style={{ marginBottom: 20 }}>
        <div className="dash-section-title">Diagnóstico de Dúvidas (últimos 30 dias)</div>
        <p style={{ fontSize: 11, color: 'rgba(245,241,250,0.55)', margin: '4px 0 8px' }}>
          Analisa todas as perguntas feitas ao Joaozinho por toda a equipe (sem identificar quem
          perguntou) e sugere padrões e plano de ação.
        </p>
        <button className="btn-filter-light" onClick={gerarDiagnostico} disabled={gerandoDiagnostico}>
          {gerandoDiagnostico ? 'Gerando...' : 'Gerar Diagnóstico'}
        </button>
        {erroDiagnostico && <div className="login-erro" style={{ marginTop: 8 }}>{erroDiagnostico}</div>}
        {diagnostico && (
          <div style={{ fontSize: 12, color: '#F5F1FA', background: '#F7F4FC', borderRadius: 8, padding: 12, marginTop: 10, whiteSpace: 'pre-wrap' }}>
            {diagnostico}
          </div>
        )}
      </div>

      {semResposta.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="dash-section-title">Perguntas que o Joaozinho não soube responder ({semResposta.length})</div>
          <p style={{ fontSize: 11, color: 'rgba(245,241,250,0.55)', margin: '4px 0 8px' }}>
            O consultor perguntou, ele não achou no conteúdo cadastrado. Cadastra o tema e marca como resolvida.
          </p>
          {semResposta.map(msg => (
            <div key={msg.id} className="sino-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{msg.conteudo}</div>
                <div style={{ fontSize: 11, color: 'rgba(245,241,250,0.55)' }}>{nomeConsultor(msg.consultor_id)} · {formatDataHora(msg.criado_em)}</div>
              </div>
              <button className="btn-filter-light" onClick={() => marcarResolvida(msg)}>Marcar resolvida</button>
            </div>
          ))}
        </div>
      )}

      <div className="dash-section-title">Alimentar Joaozinho (Assistente Virtual)</div>
      <p style={{ fontSize: 12, color: 'rgba(245,241,250,0.55)', margin: '4px 0 16px' }}>
        Cada bloco de conteúdo tem um título — é o que identifica o tema (ex: "Preços Banda
        Larga", "Book de Ofertas Móvel"). Subir de novo com o MESMO título substitui o
        conteúdo anterior daquele tema, pra não conflitar informação antiga com a nova.
        Cole texto direto ou sobe um PDF/Excel — o PDF é lido por IA, o Excel vira texto de
        todas as abas. Book grande (muitas páginas) é dividido em várias entradas menores
        automaticamente ao salvar, senão o Joaozinho perde parte do conteúdo.
      </p>

      {jobs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="dash-section-title">Uploads pendentes ({jobs.length})</div>
          <p style={{ fontSize: 11, color: 'rgba(245,241,250,0.55)', margin: '4px 0 8px' }}>
            Arquivo já salvo, faltou só a IA terminar de ler — clica em Retomar pra continuar de onde parou.
          </p>
          {jobs.map(job => (
            <div key={job.id} className="sino-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{job.titulo}</div>
                <div style={{ fontSize: 11, color: job.status === 'erro' ? 'var(--vermelho)' : 'var(--text-3)' }}>
                  {job.status === 'erro' ? `Erro: ${job.erro_msg}` : job.total_paginas ? `Status: ${job.status} — página ${job.paginas_processadas}/${job.total_paginas}` : `Status: ${job.status}`}
                </div>
              </div>
              <button className="btn-filter-light" onClick={() => retomarJob(job)} disabled={retomandoId === job.id}>
                {retomandoId === job.id ? (progresso || 'Processando...') : 'Retomar'}
              </button>
              <span style={{ cursor: 'pointer' }} title="Descartar" onClick={() => excluirJob(job)}>🗑</span>
            </div>
          ))}
        </div>
      )}

      <div className="lm-field-edit" style={{ marginBottom: 8 }}>
        <label>Título do tema</label>
        <input className="lm-input" style={{ width: '100%' }} placeholder='Ex: "Preços Banda Larga"'
          value={titulo} onChange={e => setTitulo(e.target.value)} />
      </div>

      <div className="kanban-toolbar" style={{ marginBottom: 8 }}>
        <input type="file" accept=".pdf,application/pdf,.xlsx,.xls" onChange={handleArquivo} disabled={lendo} />
        {lendo && <span style={{ fontSize: 12, color: '#660099' }}>{progresso || 'Lendo arquivo...'}</span>}
        {editandoId && <span style={{ fontSize: 12, color: 'rgba(245,241,250,0.55)' }}>Editando conteúdo existente — salvar substitui.</span>}
      </div>

      <textarea className="obs-area" style={{ width: '100%', minHeight: 220 }} placeholder="Cole ou edite o conteúdo aqui..."
        value={conteudo} onChange={e => setConteudo(e.target.value)} />

      {!SUFIXO_PARTE.test(titulo.trim()) && conteudo.trim().length > TAMANHO_MAX_PARTE && (
        <p style={{ fontSize: 11, color: '#660099', margin: '4px 0 0' }}>
          Conteúdo grande ({conteudo.trim().length.toLocaleString('pt-BR')} caracteres) — ao salvar,
          vira {dividirEmPartes(conteudo.trim(), TAMANHO_MAX_PARTE).length} entradas menores automaticamente
          ("{titulo.trim() || 'título'} — parte 1/{dividirEmPartes(conteudo.trim(), TAMANHO_MAX_PARTE).length}" etc),
          pra nada ficar de fora quando o Joaozinho for responder.
        </p>
      )}

      {erro && <div className="login-erro" style={{ marginTop: 8 }}>{erro}</div>}

      <div className="lm-actions" style={{ marginTop: 8 }}>
        <button className="btn-save-obs" style={{ float: 'none', margin: 0 }} onClick={salvar} disabled={salvando || lendo}>
          {salvando ? 'Salvando...' : editandoId ? 'Salvar substituindo' : 'Salvar novo tema'}
        </button>
        {(titulo || conteudo) && (
          <button className="btn-filter-light" style={{ marginLeft: 8 }} onClick={novoConteudo}>Cancelar</button>
        )}
      </div>

      <div className="dash-section-title" style={{ marginTop: 24 }}>Histórico — o que já foi ensinado ({lista.length})</div>
      {loading && <div className="empty">Carregando...</div>}
      {!loading && lista.length === 0 && <div className="empty">Nenhum conteúdo cadastrado ainda.</div>}
      {!loading && lista.map(item => (
        <div key={item.id} className="sino-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => alternarExpandido(item.id)}>
              <div style={{ fontWeight: 700 }}>{expandidoId === item.id ? '▼' : '▶'} {item.titulo}</div>
              <div style={{ fontSize: 11, color: 'rgba(245,241,250,0.55)' }}>Atualizado em {formatDataHora(item.atualizado_em)} · {item.conteudo.length} caracteres</div>
            </div>
            {item.arquivo_original_path && (
              <span style={{ cursor: 'pointer', fontSize: 11, color: '#660099', whiteSpace: 'nowrap' }} title={`Ver ${item.arquivo_original_nome || 'documento original'}`} onClick={() => verOriginal(item)}>📄 Original</span>
            )}
            <span style={{ cursor: 'pointer' }} title="Editar" onClick={() => editar(item)}>✏️</span>
            <span style={{ cursor: 'pointer' }} title="Excluir" onClick={() => excluir(item)}>🗑</span>
          </div>
          {expandidoId === item.id && (
            <div style={{ fontSize: 12, color: '#F5F1FA', background: '#F7F4FC', borderRadius: 8, padding: 10, marginTop: 8, maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {item.conteudo}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

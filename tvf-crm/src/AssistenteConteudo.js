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

export default function AssistenteConteudo({ user }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [editandoId, setEditandoId] = useState(null)
  const [expandidoId, setExpandidoId] = useState(null)
  const [jobAtualId, setJobAtualId] = useState(null)
  const [jobAtualPath, setJobAtualPath] = useState(null)
  const [jobs, setJobs] = useState([])
  const [retomandoId, setRetomandoId] = useState(null)
  const [progresso, setProgresso] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: jobsData }] = await Promise.all([
      supabase.from('assistente_conteudo').select('*').order('titulo', { ascending: true }),
      supabase.from('assistente_upload_job').select('*').neq('status', 'concluido').order('criado_em', { ascending: false }),
    ])
    setLista(data || [])
    setJobs(jobsData || [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

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
    // upsert por título — subir de novo o mesmo tema substitui o conteúdo anterior
    const { error } = await supabase.from('assistente_conteudo')
      .upsert({ titulo: titulo.trim(), conteudo: conteudo.trim(), atualizado_por: user.id, atualizado_em: new Date().toISOString() }, { onConflict: 'titulo' })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    if (jobAtualId) {
      if (jobAtualPath) await supabase.storage.from('assistente-uploads').remove([jobAtualPath])
      await supabase.from('assistente_upload_job').delete().eq('id', jobAtualId)
    }
    novoConteudo()
    carregar()
  }

  async function excluir(item) {
    if (!window.confirm(`Excluir "${item.titulo}"? O assistente para de usar esse conteúdo.`)) return
    await supabase.from('assistente_conteudo').delete().eq('id', item.id)
    if (editandoId === item.id) novoConteudo()
    carregar()
  }

  return (
    <div className="main">
      <div className="lm-section-title">Alimentar Joaozinho (Assistente Virtual)</div>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 16px' }}>
        Cada bloco de conteúdo tem um título — é o que identifica o tema (ex: "Preços Banda
        Larga", "Book de Ofertas Móvel"). Subir de novo com o MESMO título substitui o
        conteúdo anterior daquele tema, pra não conflitar informação antiga com a nova.
        Cole texto direto ou sobe um PDF/Excel — o PDF é lido por IA, o Excel vira texto de
        todas as abas.
      </p>

      {jobs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="lm-section-title">Uploads pendentes ({jobs.length})</div>
          <p style={{ fontSize: 11, color: '#888', margin: '4px 0 8px' }}>
            Arquivo já salvo, faltou só a IA terminar de ler — clica em Retomar pra continuar de onde parou.
          </p>
          {jobs.map(job => (
            <div key={job.id} className="sino-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{job.titulo}</div>
                <div style={{ fontSize: 11, color: job.status === 'erro' ? '#C0451A' : '#888' }}>
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
        <input type="file" accept=".pdf,.xlsx,.xls" onChange={handleArquivo} disabled={lendo} />
        {lendo && <span style={{ fontSize: 12, color: '#660099' }}>{progresso || 'Lendo arquivo...'}</span>}
        {editandoId && <span style={{ fontSize: 12, color: '#888' }}>Editando conteúdo existente — salvar substitui.</span>}
      </div>

      <textarea className="obs-area" style={{ width: '100%', minHeight: 220 }} placeholder="Cole ou edite o conteúdo aqui..."
        value={conteudo} onChange={e => setConteudo(e.target.value)} />

      {erro && <div className="login-erro" style={{ marginTop: 8 }}>{erro}</div>}

      <div className="lm-actions" style={{ marginTop: 8 }}>
        <button className="btn-save-obs" style={{ float: 'none', margin: 0 }} onClick={salvar} disabled={salvando || lendo}>
          {salvando ? 'Salvando...' : editandoId ? 'Salvar substituindo' : 'Salvar novo tema'}
        </button>
        {(titulo || conteudo) && (
          <button className="btn-filter-light" style={{ marginLeft: 8 }} onClick={novoConteudo}>Cancelar</button>
        )}
      </div>

      <div className="lm-section-title" style={{ marginTop: 24 }}>Histórico — o que já foi ensinado ({lista.length})</div>
      {loading && <div className="empty">Carregando...</div>}
      {!loading && lista.length === 0 && <div className="empty">Nenhum conteúdo cadastrado ainda.</div>}
      {!loading && lista.map(item => (
        <div key={item.id} className="sino-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => alternarExpandido(item.id)}>
              <div style={{ fontWeight: 700 }}>{expandidoId === item.id ? '▼' : '▶'} {item.titulo}</div>
              <div style={{ fontSize: 11, color: '#888' }}>Atualizado em {formatDataHora(item.atualizado_em)} · {item.conteudo.length} caracteres</div>
            </div>
            <span style={{ cursor: 'pointer' }} title="Editar" onClick={() => editar(item)}>✏️</span>
            <span style={{ cursor: 'pointer' }} title="Excluir" onClick={() => excluir(item)}>🗑</span>
          </div>
          {expandidoId === item.id && (
            <div style={{ fontSize: 12, color: '#333', background: '#F7F4FC', borderRadius: 8, padding: 10, marginTop: 8, maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {item.conteudo}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

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

export default function AssistenteConteudo({ user }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [editandoId, setEditandoId] = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('assistente_conteudo').select('*').order('titulo', { ascending: true })
    setLista(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function editar(item) {
    setEditandoId(item.id)
    setTitulo(item.titulo)
    setConteudo(item.conteudo)
    setErro('')
  }

  function novoConteudo() {
    setEditandoId(null)
    setTitulo('')
    setConteudo('')
    setErro('')
  }

  async function handleArquivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setErro('')
    if (!titulo.trim()) setTitulo(file.name.replace(/\.(pdf|xlsx|xls)$/i, ''))

    const ehPdf = file.name.toLowerCase().endsWith('.pdf')
    setLendo(true)
    try {
      if (ehPdf) {
        const buf = await file.arrayBuffer()
        const base64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''))
        const { data: sessao } = await supabase.auth.getSession()
        const resp = await fetch('/api/extrair-conteudo-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao?.session?.access_token}` },
          body: JSON.stringify({ pdfBase64: base64, filename: file.name }),
        })
        const dados = await resp.json()
        if (!resp.ok) throw new Error(dados.error || 'Erro ao ler o PDF')
        setConteudo(dados.conteudo || '')
      } else {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        setConteudo(xlsxParaTexto(wb))
      }
    } catch (err) {
      setErro(err.message)
    } finally {
      setLendo(false)
      e.target.value = ''
    }
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

      <div className="lm-field-edit" style={{ marginBottom: 8 }}>
        <label>Título do tema</label>
        <input className="lm-input" style={{ width: '100%' }} placeholder='Ex: "Preços Banda Larga"'
          value={titulo} onChange={e => setTitulo(e.target.value)} />
      </div>

      <div className="kanban-toolbar" style={{ marginBottom: 8 }}>
        <input type="file" accept=".pdf,.xlsx,.xls" onChange={handleArquivo} disabled={lendo} />
        {lendo && <span style={{ fontSize: 12, color: '#660099' }}>Lendo arquivo...</span>}
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

      <div className="lm-section-title" style={{ marginTop: 24 }}>Temas cadastrados ({lista.length})</div>
      {loading && <div className="empty">Carregando...</div>}
      {!loading && lista.length === 0 && <div className="empty">Nenhum conteúdo cadastrado ainda.</div>}
      {!loading && lista.map(item => (
        <div key={item.id} className="sino-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => editar(item)}>
            <div style={{ fontWeight: 700 }}>{item.titulo}</div>
            <div style={{ fontSize: 11, color: '#888' }}>Atualizado em {formatDataHora(item.atualizado_em)} · {item.conteudo.length} caracteres</div>
          </div>
          <span style={{ cursor: 'pointer' }} title="Excluir" onClick={() => excluir(item)}>🗑</span>
        </div>
      ))}
    </div>
  )
}

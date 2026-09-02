import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// a IA responde em markdown simples (### título de seção, **negrito**, listas com "-") — o
// modal mostrava isso como texto cru (###, ** literais), difícil de ler. Esse parser é
// propositalmente pequeno e só entende o formato que o próprio prompt em api/analisar.js pede
// (seção por consultor com "### Nome", sub-itens numerados "1. **Rótulo:**", bullets "- "),
// não é markdown genérico.
function renderizarInline(texto, keyBase) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return partes.map((parte, i) => {
    const m = parte.match(/^\*\*([^*]+)\*\*$/)
    return m ? <strong key={`${keyBase}-${i}`}>{m[1]}</strong> : <React.Fragment key={`${keyBase}-${i}`}>{parte}</React.Fragment>
  })
}

function renderizarCorpo(corpo) {
  const linhas = corpo.split('\n')
  const blocos = []
  let listaAtual = null
  let paragrafoAtual = null

  function fecharLista() { if (listaAtual) { blocos.push(listaAtual); listaAtual = null } }
  function fecharParagrafo() { if (paragrafoAtual) { blocos.push(paragrafoAtual); paragrafoAtual = null } }

  for (const linhaRaw of linhas) {
    const linha = linhaRaw.trim()
    if (!linha) { fecharLista(); fecharParagrafo(); continue }

    const subtitulo = linha.match(/^\d+\.\s*\*\*([^*]+)\*\*:?\s*(.*)$/)
    const bullet = linha.match(/^[-•]\s+(.+)/)

    if (subtitulo) {
      fecharLista(); fecharParagrafo()
      blocos.push({ tipo: 'subtitulo', texto: subtitulo[1] })
      if (subtitulo[2]) blocos.push({ tipo: 'paragrafo', texto: subtitulo[2] })
    } else if (bullet) {
      fecharParagrafo()
      if (!listaAtual) listaAtual = { tipo: 'lista', itens: [] }
      listaAtual.itens.push(bullet[1])
    } else {
      fecharLista()
      if (!paragrafoAtual) paragrafoAtual = { tipo: 'paragrafo', texto: linha }
      else paragrafoAtual.texto += ' ' + linha
    }
  }
  fecharLista(); fecharParagrafo()

  return blocos.map((bloco, i) => {
    if (bloco.tipo === 'subtitulo') {
      return <div key={i} className="analise-subtitulo">{renderizarInline(bloco.texto, `st-${i}`)}</div>
    }
    if (bloco.tipo === 'lista') {
      return (
        <ul key={i} className="analise-lista">
          {bloco.itens.map((item, j) => <li key={j}>{renderizarInline(item, `li-${i}-${j}`)}</li>)}
        </ul>
      )
    }
    return <p key={i} className="analise-paragrafo">{renderizarInline(bloco.texto, `p-${i}`)}</p>
  })
}

// quebra o texto inteiro em seções por "### Título" — cada seção (um consultor, ou o plano
// coletivo no final) vira seu próprio quadro
function renderizarAnalise(texto) {
  const partesComTitulo = texto.split(/^###\s+(.+)$/m)
  // split com grupo de captura intercala: [textoAntes, titulo1, corpo1, titulo2, corpo2, ...]
  const preambulo = partesComTitulo[0].trim()
  const secoes = []
  for (let i = 1; i < partesComTitulo.length; i += 2) {
    secoes.push({ titulo: partesComTitulo[i].trim(), corpo: (partesComTitulo[i + 1] || '').trim() })
  }

  return (
    <>
      {preambulo && <p className="analise-paragrafo">{renderizarInline(preambulo, 'pre')}</p>}
      {secoes.map((secao, i) => (
        <div key={i} className="analise-secao">
          <div className="analise-secao-titulo">{secao.titulo}</div>
          <div className="analise-secao-corpo">{renderizarCorpo(secao.corpo)}</div>
        </div>
      ))}
    </>
  )
}

export default function AnaliseIAModal({ dados, user, onClose }) {
  const [texto, setTexto] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [qtdTarefas, setQtdTarefas] = useState(0)

  useEffect(() => {
    async function analisar() {
      setLoading(true)
      setErro('')
      const { data: { session } } = await supabase.auth.getSession()
      try {
        const resp = await fetch('/api/analisar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`,
          },
          body: JSON.stringify({ dados }),
        })
        const json = await resp.json()
        if (!resp.ok) throw new Error(json.error || 'Erro ao analisar')
        setTexto(json.analise)

        // plano de ação vira tarefa de verdade pro consultor, não só texto que some quando
        // fecha o modal — cada item da IA já veio com o consultorId certo (ver api/analisar.js)
        const tarefas = (json.tarefas || [])
          .filter(t => t.consultorId && t.descricao)
          .map(t => ({
            consultor_id: t.consultorId, descricao: t.descricao,
            origem: t.origem === 'coletivo' ? 'coletivo' : 'individual',
            gerado_por: user?.id || null,
          }))
        if (tarefas.length > 0) {
          const { error: erroTarefas } = await supabase.from('tarefa_consultor').insert(tarefas)
          if (!erroTarefas) setQtdTarefas(tarefas.length)
        }
      } catch (e) {
        setErro(e.message)
      }
      setLoading(false)
    }
    analisar()
  }, [dados, user])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lead-modal" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <div className="lm-header-left">
            <div style={{ fontSize: 17, fontWeight: 700 }}>Análise de Desempenho (IA)</div>
          </div>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>
        <div className="lm-body">
          {loading && <div className="empty">Analisando dados dos consultores...</div>}
          {erro && <div className="login-erro">{erro}</div>}
          {!loading && qtdTarefas > 0 && (
            <div className="lm-resumo">✅ {qtdTarefas} tarefa(s) do plano de ação salva(s) — cada consultor já vê a própria lista em Rotina Diária.</div>
          )}
          {!loading && texto && <div className="analise-corpo">{renderizarAnalise(texto)}</div>}
        </div>
      </div>
    </div>
  )
}

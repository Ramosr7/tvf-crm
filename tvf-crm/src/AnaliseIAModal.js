import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function AnaliseIAModal({ dados, onClose }) {
  const [texto, setTexto] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

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
      } catch (e) {
        setErro(e.message)
      }
      setLoading(false)
    }
    analisar()
  }, [dados])

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
          {!loading && texto && (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>{texto}</div>
          )}
        </div>
      </div>
    </div>
  )
}

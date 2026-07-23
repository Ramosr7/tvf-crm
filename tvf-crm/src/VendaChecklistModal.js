import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const PILARES = [
  { key: 'migracao', label: 'Migração Móvel', campo: 'potencial_migracao' },
  { key: 'bl', label: 'Banda Larga', campo: 'potencial_bl' },
  { key: 'ti', label: 'TI', campo: 'potencial_ti' },
  { key: 'voz', label: 'Voz Avançada', campo: 'potencial_voz' },
  { key: 'credito', label: 'Crédito Pré-aprovado (Aparelho)', campo: 'credito_pre_aprovado' },
]

export default function VendaChecklistModal({ cliente, user, onClose, onConcluido }) {
  const [respostas, setRespostas] = useState({})
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const pilaresComPotencial = PILARES.filter(p => Number(cliente[p.campo]) > 0)

  useEffect(() => {
    supabase.from('carteira_checklist_venda').select('*').eq('carteira_cliente_id', cliente.id)
      .then(({ data }) => {
        const mapa = {}
        for (const r of (data || [])) mapa[r.pilar] = { ofereceu: r.ofereceu, justificativa: r.justificativa || '' }
        setRespostas(mapa)
        setLoading(false)
      })
  }, [cliente.id])

  function atualizar(key, campo, valor) {
    setRespostas(prev => ({ ...prev, [key]: { ofereceu: false, justificativa: '', ...prev[key], [campo]: valor } }))
  }

  async function salvar() {
    setSalvando(true)
    await supabase.from('carteira_checklist_venda').delete().eq('carteira_cliente_id', cliente.id)
    const linhas = pilaresComPotencial.map(p => ({
      carteira_cliente_id: cliente.id,
      pilar: p.key,
      ofereceu: respostas[p.key]?.ofereceu || false,
      justificativa: respostas[p.key]?.justificativa || '',
      autor_id: user.id,
    }))
    if (linhas.length > 0) await supabase.from('carteira_checklist_venda').insert(linhas)
    setSalvando(false)
    onConcluido()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lead-modal" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <div className="lm-header-left">
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Checklist de Venda</div>
              <div className="lm-phone">{cliente.razao_social || cliente.cnpj}</div>
            </div>
          </div>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>

        <div className="lm-body">
          <p style={{ fontSize: 12, color: '#888' }}>
            Pra cada pilar de potencial que esse cliente tem, confirma se foi oferecido e por quê (ou por que não).
          </p>

          {loading && <div className="empty">Carregando...</div>}

          {!loading && pilaresComPotencial.length === 0 && (
            <div className="empty">Esse cliente não tem nenhum pilar de potencial &gt; 0 pra checar.</div>
          )}

          {!loading && pilaresComPotencial.map(p => {
            const r = respostas[p.key] || { ofereceu: false, justificativa: '' }
            return (
              <div key={p.key} style={{ borderBottom: '1px solid #F0EAF8', paddingBottom: 12, marginBottom: 12 }}>
                <div className="lm-section-title" style={{ marginBottom: 6 }}>{p.label} (potencial: {p.key === 'credito' ? Number(cliente[p.campo]).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : cliente[p.campo]})</div>
                <div className="lm-tipo-grid" style={{ marginBottom: 8 }}>
                  <div className={`lm-tipo-opt ${r.ofereceu ? 'active' : ''}`} onClick={() => atualizar(p.key, 'ofereceu', true)}>Sim, ofereceu</div>
                  <div className={`lm-tipo-opt ${!r.ofereceu ? 'active' : ''}`} onClick={() => atualizar(p.key, 'ofereceu', false)}>Não ofereceu</div>
                </div>
                <textarea className="obs-area" rows={2} placeholder="Justificativa..."
                  value={r.justificativa} onChange={e => atualizar(p.key, 'justificativa', e.target.value)} />
              </div>
            )
          })}

          <button className="btn-save-obs" style={{ float: 'none', width: '100%' }} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Checklist'}
          </button>
        </div>
      </div>
    </div>
  )
}

import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'

// Plano de ação gerado pela Análise com IA (Relatórios) vira tarefa persistida aqui — cada
// consultor vê e conclui as próprias (RLS trava isso: só enxerga onde consultor_id = ele
// mesmo), sem depender de reabrir o modal de análise que já fechou.
export default function MinhasTarefas({ user }) {
  const [tarefas, setTarefas] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('tarefa_consultor').select('*')
      .eq('consultor_id', user.id).order('gerado_em', { ascending: false })
    setTarefas(data || [])
    setLoading(false)
  }, [user.id])

  useEffect(() => { carregar() }, [carregar])

  async function concluir(id, concluido) {
    setTarefas(prev => prev.map(t => t.id === id ? { ...t, concluido, concluido_em: concluido ? new Date().toISOString() : null } : t))
    await supabase.from('tarefa_consultor')
      .update({ concluido, concluido_em: concluido ? new Date().toISOString() : null }).eq('id', id)
  }

  if (loading) return null

  const pendentes = tarefas.filter(t => !t.concluido)
  const concluidas = tarefas.filter(t => t.concluido)
  if (tarefas.length === 0) return null

  return (
    <div className="lm-resumo" style={{ marginBottom: 16, padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: pendentes.length > 0 ? 8 : 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>
          📋 Minhas tarefas (plano de ação) {pendentes.length > 0 && `— ${pendentes.length} pendente(s)`}
        </span>
        {concluidas.length > 0 && (
          <button className="btn-filter-light" style={{ padding: '2px 10px', fontSize: 11 }} onClick={() => setMostrarConcluidas(v => !v)}>
            {mostrarConcluidas ? 'Esconder concluídas' : `Ver concluídas (${concluidas.length})`}
          </button>
        )}
      </div>
      {pendentes.length === 0 && concluidas.length > 0 && !mostrarConcluidas && (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Tudo em dia — nenhuma tarefa pendente. 🎉</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pendentes.map(t => (
          <label key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={false} onChange={() => concluir(t.id, true)} style={{ marginTop: 2 }} />
            <span>
              {t.descricao}
              {t.origem === 'coletivo' && <span className="tab-pill" style={{ marginLeft: 6 }}>equipe</span>}
            </span>
          </label>
        ))}
        {mostrarConcluidas && concluidas.map(t => (
          <label key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer', opacity: 0.5, textDecoration: 'line-through' }}>
            <input type="checkbox" checked={true} onChange={() => concluir(t.id, false)} style={{ marginTop: 2 }} />
            <span>{t.descricao}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

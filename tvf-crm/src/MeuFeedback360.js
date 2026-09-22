import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'

// Feedback 360 direto pelo consultor sobre o próprio supervisor — item 4 do módulo Gestão
// Comercial. A RLS de gc_feedback já permite isso desde a migration original
// (tipo='360' and consultor_id = auth.uid()); esse componente é só a tela que faltava.
// Só aparece pro Consultor (embutido em RotinaDiaria.js) — Gestor/Supervisor não veem isso
// aqui, eles gerenciam feedback pela tela Gestão Comercial.

function semanaAtual(semanas) {
  const hoje = new Date().toISOString().slice(0, 10)
  return semanas.find(s => hoje >= s.data_inicio && hoje <= s.data_fim)
    || semanas.find(s => s.data_inicio > hoje)
    || semanas[semanas.length - 1]
}

const CAMPO_VAZIO = { situacao: '', fato: '', comportamento: '', impacto: '', expectativa: '', acordo: '' }

export default function MeuFeedback360({ user }) {
  const [loading, setLoading] = useState(true)
  const [supervisorId, setSupervisorId] = useState(null)
  const [supervisorNome, setSupervisorNome] = useState('')
  const [semana, setSemana] = useState(null)
  const [enviados, setEnviados] = useState([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState(CAMPO_VAZIO)
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data: meuStaff } = await supabase.from('consultores_staff').select('supervisor_id').eq('id', user.id).maybeSingle()
    const supId = meuStaff?.supervisor_id || null
    setSupervisorId(supId)
    if (supId) {
      const { data: sup } = await supabase.from('consultores_staff').select('nome').eq('id', supId).maybeSingle()
      setSupervisorNome(sup?.nome || '—')
    }
    const { data: semanasData } = await supabase.from('gc_semana').select('*').order('numero')
    setSemana(semanaAtual(semanasData || []))
    const { data: fbData } = await supabase.from('gc_feedback').select('*')
      .eq('tipo', '360').eq('consultor_id', user.id).order('data_registro', { ascending: false })
    setEnviados(fbData || [])
    setLoading(false)
  }, [user.id])

  useEffect(() => { carregar() }, [carregar])

  async function enviar(e) {
    e.preventDefault()
    if (!supervisorId || !semana) return
    setEnviando(true)
    const { error } = await supabase.from('gc_feedback').insert({
      semana_id: semana.id, gestor_id: supervisorId, consultor_id: user.id, tipo: '360', ...form,
    })
    setEnviando(false)
    if (error) { alert('Erro ao enviar: ' + error.message); return }
    setForm(CAMPO_VAZIO)
    setMostrarForm(false)
    carregar()
  }

  if (loading) return null
  // sem supervisor cadastrado (cadastro incompleto) — não trava a Rotina Diária pra isso,
  // só não mostra o widget
  if (!supervisorId || !semana) return null

  return (
    <div className="lm-resumo" style={{ marginBottom: 16, padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>
          💬 Feedback 360 sobre {supervisorNome}
        </span>
        <button type="button" className="btn-filter-light" style={{ padding: '2px 10px', fontSize: 11 }} onClick={() => setMostrarForm(v => !v)}>
          {mostrarForm ? 'Cancelar' : enviados.length > 0 ? 'Enviar outro' : '+ Dar feedback'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={enviar} style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="lm-field-edit"><label>O que aconteceu (situação)</label>
            <textarea className="obs-area" style={{ width: '100%' }} value={form.situacao} onChange={e => setForm(f => ({ ...f, situacao: e.target.value }))} /></div>
          <div className="lm-field-edit"><label>Fato — o que ele fez que te ajudou ou atrapalhou</label>
            <textarea className="obs-area" style={{ width: '100%' }} value={form.fato} onChange={e => setForm(f => ({ ...f, fato: e.target.value }))} /></div>
          <div className="lm-field-edit"><label>Comportamento</label>
            <textarea className="obs-area" style={{ width: '100%' }} value={form.comportamento} onChange={e => setForm(f => ({ ...f, comportamento: e.target.value }))} /></div>
          <div className="lm-field-edit"><label>Impacto que isso teve pra você</label>
            <textarea className="obs-area" style={{ width: '100%' }} value={form.impacto} onChange={e => setForm(f => ({ ...f, impacto: e.target.value }))} /></div>
          <div className="lm-field-edit"><label>O que você espera dele daqui pra frente</label>
            <textarea className="obs-area" style={{ width: '100%' }} value={form.expectativa} onChange={e => setForm(f => ({ ...f, expectativa: e.target.value }))} /></div>
          <div className="lm-field-edit"><label>Algo que vocês podem combinar</label>
            <textarea className="obs-area" style={{ width: '100%' }} value={form.acordo} onChange={e => setForm(f => ({ ...f, acordo: e.target.value }))} /></div>
          <button className="btn-save-obs" style={{ float: 'none', margin: 0 }} type="submit" disabled={enviando}>
            {enviando ? 'Enviando...' : 'Enviar feedback'}
          </button>
        </form>
      )}

      {!mostrarForm && enviados.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
          Você já enviou {enviados.length} feedback(s) 360. Não é anônimo — fica registrado com seu nome, visível pro seu supervisor e pro João na Gestão Comercial.
        </div>
      )}
    </div>
  )
}

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import CampoAjuda from './CampoAjuda'
import MelhorarIA from './MelhorarIA'

// Exemplo/dica de preenchimento de cada campo — mostrado no "?" ao lado do rótulo, pra quem
// tá preenchendo pela primeira vez não travar na hora de escrever.
const AJUDA = {
  situacao: 'Ex: "Cliente reclamou 2x essa semana de atraso na resposta do consultor no WhatsApp." Descreve o contexto, sem julgar ainda.',
  fato: 'Ex: "Nas últimas 3 propostas, o retorno ao cliente demorou mais de 24h." Só o que aconteceu, sem interpretar.',
  comportamento: 'Ex: "Ele deixa a resposta pro fim do dia mesmo quando o cliente pede urgência." Como isso aparece no dia a dia.',
  impacto: 'Ex: "2 clientes já comentaram sobre a demora — risco de perder a venda pra concorrência." O efeito real disso.',
  expectativa: 'Ex: "A partir de agora, responder toda mensagem em até 2h no horário comercial." O que muda daqui pra frente.',
  acordo: 'Ex: "Combinamos que ele vai checar o WhatsApp 3x ao dia (9h, 13h, 17h) e eu reviso em 15 dias."',
  indicadorNome: 'Ex: "Propostas paradas há mais de 7 dias", "Matinais realizadas na semana", "Feedbacks aplicados".',
  indicadorValor: 'O número dessa semana. Ex: se são 4 propostas paradas, digita 4.',
  indicadorMeta: 'Opcional. Ex: se a meta é ter no máximo 2 propostas paradas, digita 2.',
  matrizAcao: 'Ex: "Tirar 3 números do CRM toda sexta (propostas abertas, paradas, conversão)." Ação concreta, não intenção.',
  planoMeta: 'Ex: "Fechar 20 propostas em outubro."',
  planoGap: 'Ex: "Faltam 6 propostas pra bater a meta do mês."',
  planoOportunidade: 'Ex: "12 clientes com proposta parada há mais de 15 dias, nunca retomados."',
  planoEstrategia: 'Ex: "Retomar contato com propostas paradas antes de buscar cliente novo."',
  planoAcao: 'Ex: "Ligar pros 12 clientes com proposta parada essa semana."',
  planoResponsavel: 'Ex: "Eu mesmo" ou o nome do consultor responsável por essa ação.',
  planoPrazo: 'Até quando essa ação precisa estar feita.',
  planoKpi: 'Ex: "Reduzir de 12 pra 5 propostas paradas até o fim do mês." Como você vai medir se deu certo.',
  processoItem: 'Ex: "Montar relatório de vendas toda sexta-feira, copiando dado do CRM pra planilha."',
  processoClassificacao: 'Manual = precisa de uma pessoa fazendo. Automatizável = dá pra automatizar. Eliminável = não precisa mais existir. Padronizável = várias pessoas fazem diferente, precisa virar 1 jeito só.',
  perfResultado: 'Nota 1 a 5: bateu meta, converteu, trouxe resultado real no período.',
  perfProdutividade: 'Nota 1 a 5: volume de atividade — atendimentos, propostas, follow-up feito.',
  perfComportamento: 'Nota 1 a 5: postura, disciplina de rotina, como trabalha com o time.',
  perfEvolucao: 'Nota 1 a 5: melhorou em relação ao período anterior, mesmo que o resultado ainda não tenha vindo.',
  perfClassificacao: 'Precisa acelerar = tem potencial, falta ritmo. Precisa desenvolver = falta habilidade/técnica. Precisa de suporte = trava por algo fora do controle dele. Pronto pra autonomia = já entrega sem precisar de acompanhamento de perto.',
}

// Módulo "Gestão Comercial de Alta Performance" — programa de 90 dias / 12 semanas de
// acompanhamento executivo do João com os 3 supervisores (Tiago, Felipe, Yves). Tudo aqui
// vira registro no CRM (data, autor, conteúdo) em vez de slide/planilha solta.
// Mapeamento de papel: "Gestor" do programa = perfil 'Supervisor' aqui; "João" = perfil
// 'Gestor' (único admin). Feedback 360 direto do consultor: ver MeuFeedback360.js (embutido
// na Rotina Diária dele) — aqui o supervisor/João só visualiza os que chegaram.

const ABAS = [
  { key: 'reunioes', label: 'Reuniões' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'indicadores', label: 'Indicadores' },
  { key: 'matriz', label: 'Matriz de Responsabilidade' },
  { key: 'entregaveis', label: 'Entregáveis' },
  { key: 'performance', label: 'Matriz de Performance (S7)' },
  { key: 'plano_acao', label: 'Plano Comercial (S8)' },
  { key: 'processos', label: 'Mapeamento de Processos (S9)' },
  { key: 'playbook', label: 'Playbook (S12)' },
]
const FASE_LABEL = { fase_1: 'Fase 1 — Fundação', fase_2: 'Fase 2 — Execução', fase_3: 'Fase 3 — Consolidação' }
const CLASSIFICACAO_LABEL = {
  precisa_acelerar: 'Precisa acelerar', precisa_desenvolver: 'Precisa desenvolver',
  precisa_suporte: 'Precisa de suporte', pronto_autonomia: 'Pronto pra autonomia',
}
const PROCESSO_LABEL = { manual: 'Manual', automatizavel: 'Automatizável', eliminavel: 'Eliminável', padronizavel: 'Padronizável' }

const isGestor = (user) => user.perfil === 'Gestor'
const isSupervisor = (user) => user.perfil === 'Supervisor'

function fmtDataBR(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function semanaAtualNumero(semanas) {
  const hoje = new Date().toISOString().slice(0, 10)
  const atual = semanas.find(s => hoje >= s.data_inicio && hoje <= s.data_fim)
  if (atual) return atual.numero
  const futura = semanas.find(s => s.data_inicio > hoje)
  return futura ? futura.numero : (semanas[semanas.length - 1]?.numero || 1)
}

export default function GestaoComercial({ user }) {
  const [loading, setLoading] = useState(true)
  const [semanas, setSemanas] = useState([])
  const [staff, setStaff] = useState([])
  const [numeroSemana, setNumeroSemana] = useState(1)
  const [aba, setAba] = useState('reunioes')

  const [reunioes, setReunioes] = useState([])
  const [templates, setTemplates] = useState([])
  const [feedbacks, setFeedbacks] = useState([])
  const [indicadores, setIndicadores] = useState([])
  const [matriz, setMatriz] = useState([])
  const [entregaveis, setEntregaveis] = useState([])
  const [matrizPerformance, setMatrizPerformance] = useState([])
  const refsPlano = useRef({}) // campos do Plano de Ação (não-controlado) — key: `${gestorId}-${campo}`
  const [planosAcao, setPlanosAcao] = useState([])
  const [processos, setProcessos] = useState([])

  const supervisores = staff.filter(s => s.perfil === 'Supervisor')
  // supervisor só mexe no próprio escopo; enxerga o dos outros 2 (transparência, sem editar)
  const meuEscopoId = isSupervisor(user) ? user.id : null

  const carregarBase = useCallback(async () => {
    setLoading(true)
    const [{ data: semanasData }, { data: staffData }] = await Promise.all([
      supabase.from('gc_semana').select('*').order('numero'),
      supabase.from('consultores_staff').select('id, nome, perfil, supervisor_id').order('nome'),
    ])
    setSemanas(semanasData || [])
    setStaff(staffData || [])
    if (semanasData?.length) setNumeroSemana(prev => prev || semanaAtualNumero(semanasData))
    setLoading(false)
  }, [])

  useEffect(() => { carregarBase() }, [carregarBase])

  const semanaSel = semanas.find(s => s.numero === numeroSemana)

  const carregarSemana = useCallback(async () => {
    if (!semanaSel) return
    const [{ data: r }, { data: t }, { data: f }, { data: ind }, { data: m }, { data: mp }, { data: pa }, { data: proc }] = await Promise.all([
      supabase.from('gc_reuniao').select('*').eq('semana_id', semanaSel.id),
      supabase.from('gc_template_roteiro').select('*').eq('semana_id', semanaSel.id),
      supabase.from('gc_feedback').select('*').eq('semana_id', semanaSel.id).order('data_registro', { ascending: false }),
      supabase.from('gc_indicador').select('*').eq('semana_id', semanaSel.id),
      supabase.from('gc_matriz_responsabilidade').select('*').eq('semana_id', semanaSel.id),
      supabase.from('gc_matriz_performance').select('*').eq('semana_id', semanaSel.id),
      supabase.from('gc_plano_acao').select('*').eq('semana_id', semanaSel.id),
      supabase.from('gc_processo').select('*').eq('semana_id', semanaSel.id),
    ])
    setReunioes(r || [])
    setTemplates(t || [])
    setFeedbacks(f || [])
    setIndicadores(ind || [])
    setMatriz(m || [])
    setMatrizPerformance(mp || [])
    setPlanosAcao(pa || [])
    setProcessos(proc || [])
  }, [semanaSel])

  useEffect(() => { carregarSemana() }, [carregarSemana])

  useEffect(() => {
    supabase.from('gc_entregavel').select('*').order('fase').then(({ data }) => setEntregaveis(data || []))
  }, [])

  const nomeStaff = (id) => staff.find(s => s.id === id)?.nome || '—'

  // ── Reuniões ──────────────────────────────────────────────────────────────
  async function garantirReuniao(gestorId, tipo) {
    const existente = reunioes.find(r => r.gestor_id === gestorId && r.tipo === tipo)
    if (existente) return existente
    const { data } = await supabase.from('gc_reuniao')
      .insert({ semana_id: semanaSel.id, gestor_id: gestorId, tipo, respostas: {} })
      .select().single()
    if (data) setReunioes(prev => [...prev, data])
    return data
  }
  async function alternarRealizada(reuniao) {
    const novo = !reuniao.realizada
    setReunioes(prev => prev.map(r => r.id === reuniao.id ? { ...r, realizada: novo } : r))
    await supabase.from('gc_reuniao').update({ realizada: novo, data: novo ? new Date().toISOString().slice(0, 10) : reuniao.data }).eq('id', reuniao.id)
  }
  async function salvarResposta(reuniao, pergunta, texto) {
    const respostas = { ...(reuniao.respostas || {}), [pergunta]: texto }
    setReunioes(prev => prev.map(r => r.id === reuniao.id ? { ...r, respostas } : r))
    await supabase.from('gc_reuniao').update({ respostas }).eq('id', reuniao.id)
  }

  function CardReuniao({ gestorId, tipo, podeEditar }) {
    const reuniao = reunioes.find(r => r.gestor_id === gestorId && r.tipo === tipo)
    const template = templates.find(t => t.tipo === (tipo === 'segunda' ? 'roteiro_segunda' : 'exercicio'))
    const perguntas = template?.perguntas || []
    const refsPergunta = React.useRef({})
    return (
      <div className="gc-card" style={{ marginBottom: 12 }}>
        <div className="gc-card-cabecalho">
          <div className="gc-card-titulo">
            {tipo === 'segunda' ? 'Reunião de segunda' : 'Checkpoint de sexta'} — {nomeStaff(gestorId)}
          </div>
          {podeEditar ? (
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={reuniao?.realizada || false}
                onChange={async () => { const r = reuniao || await garantirReuniao(gestorId, tipo); alternarRealizada(r) }} />
              Realizada
            </label>
          ) : (
            <span className={`gc-status-pill ${reuniao?.realizada ? 'ok' : 'pendente'}`}>
              <span className="gc-status-dot" />{reuniao?.realizada ? 'Realizada' : 'Pendente'}
            </span>
          )}
        </div>
        {perguntas.length === 0 && <div className="empty" style={{ padding: 8 }}>Sem roteiro cadastrado pra essa semana ainda.</div>}
        {perguntas.map((p, i) => (
          <div key={i} className="lm-field-edit" style={{ marginBottom: 10 }}>
            <label>{p}</label>
            {podeEditar ? (
              <>
                <textarea ref={el => { refsPergunta.current[p] = el }} className="obs-area" style={{ width: '100%', minHeight: 44 }}
                  defaultValue={reuniao?.respostas?.[p] || ''}
                  onBlur={async e => { const r = reuniao || await garantirReuniao(gestorId, tipo); salvarResposta(r, p, e.target.value) }} />
                <MelhorarIA campoRef={{ current: refsPergunta.current[p] }}
                  onMelhorado={async texto => { const r = reuniao || await garantirReuniao(gestorId, tipo); salvarResposta(r, p, texto) }} />
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{reuniao?.respostas?.[p] || '—'}</div>
            )}
          </div>
        ))}
      </div>
    )
  }

  // ── Feedback ──────────────────────────────────────────────────────────────
  const [fbForm, setFbForm] = useState({ tipo: 'estruturado', consultorId: '', gestorId: '', situacao: '', fato: '', comportamento: '', impacto: '', expectativa: '', acordo: '', prazo: '', acompanhamento: '' })
  const [salvandoFb, setSalvandoFb] = useState(false)
  const meuTime = staff.filter(s => s.perfil === 'Consultor' && s.supervisor_id === (meuEscopoId || fbForm.gestorId))

  async function criarFeedback(e) {
    e.preventDefault()
    if (!fbForm.consultorId) return
    setSalvandoFb(true)
    const gestorId = meuEscopoId || fbForm.gestorId
    const { error } = await supabase.from('gc_feedback').insert({
      semana_id: semanaSel.id, gestor_id: gestorId, consultor_id: fbForm.consultorId,
      tipo: fbForm.tipo, situacao: fbForm.situacao, fato: fbForm.fato, comportamento: fbForm.comportamento,
      impacto: fbForm.impacto, expectativa: fbForm.expectativa, acordo: fbForm.acordo,
      prazo: fbForm.prazo || null, acompanhamento: fbForm.acompanhamento || null,
    })
    setSalvandoFb(false)
    if (error) { alert('Erro ao salvar feedback: ' + error.message); return }
    setFbForm({ tipo: 'estruturado', consultorId: '', gestorId: '', situacao: '', fato: '', comportamento: '', impacto: '', expectativa: '', acordo: '', prazo: '', acompanhamento: '' })
    carregarSemana()
  }
  async function marcarAcompanhado(fb) {
    setFeedbacks(prev => prev.map(f => f.id === fb.id ? { ...f, acompanhamento_feito: true } : f))
    await supabase.from('gc_feedback').update({ acompanhamento_feito: true }).eq('id', fb.id)
  }
  const hoje = new Date().toISOString().slice(0, 10)
  const acompanhamentosVencidos = feedbacks.filter(f => f.acompanhamento && f.acompanhamento < hoje && !f.acompanhamento_feito)

  // ── Indicadores ───────────────────────────────────────────────────────────
  const [indForm, setIndForm] = useState({ nome: '', valor: '', meta: '' })
  async function lancarIndicador(e) {
    e.preventDefault()
    if (!indForm.nome || !meuEscopoId) return
    const { error } = await supabase.from('gc_indicador').insert({
      semana_id: semanaSel.id, gestor_id: meuEscopoId, nome: indForm.nome,
      valor: Number(indForm.valor) || 0, meta: indForm.meta ? Number(indForm.meta) : null,
    })
    if (error) { alert('Erro: ' + error.message); return }
    setIndForm({ nome: '', valor: '', meta: '' })
    carregarSemana()
  }

  // ── Matriz de responsabilidade ────────────────────────────────────────────
  const [matrizForm, setMatrizForm] = useState({ gestorId: '', acao: '' })
  async function criarAcaoMatriz(e) {
    e.preventDefault()
    if (!matrizForm.gestorId || !matrizForm.acao.trim()) return
    const { error } = await supabase.from('gc_matriz_responsabilidade')
      .insert({ semana_id: semanaSel.id, gestor_id: matrizForm.gestorId, acao_especifica: matrizForm.acao.trim() })
    if (error) { alert('Erro: ' + error.message); return }
    setMatrizForm({ gestorId: '', acao: '' })
    carregarSemana()
  }
  async function alternarAcaoFeita(item) {
    const novoStatus = item.status === 'feito' ? 'pendente' : 'feito'
    setMatriz(prev => prev.map(m => m.id === item.id ? { ...m, status: novoStatus } : m))
    await supabase.from('gc_matriz_responsabilidade').update({ status: novoStatus }).eq('id', item.id)
  }

  // ── Entregáveis ───────────────────────────────────────────────────────────
  async function mudarStatusEntregavel(item, status) {
    setEntregaveis(prev => prev.map(e => e.id === item.id ? { ...e, status } : e))
    await supabase.from('gc_entregavel').update({ status }).eq('id', item.id)
  }

  // ── Matriz de Performance (Semana 7) — upsert por (semana, consultor) ────────
  async function salvarPerformance(consultorId, gestorId, campo, valor) {
    const existente = matrizPerformance.find(m => m.consultor_id === consultorId)
    const payload = { [campo]: valor }
    if (existente) {
      setMatrizPerformance(prev => prev.map(m => m.id === existente.id ? { ...m, ...payload } : m))
      await supabase.from('gc_matriz_performance').update(payload).eq('id', existente.id)
    } else {
      const { data, error } = await supabase.from('gc_matriz_performance')
        .insert({ semana_id: semanaSel.id, gestor_id: gestorId, consultor_id: consultorId, ...payload })
        .select().single()
      // conflito (semana+consultor já tem registro, ex: dois campos editados rápido demais)
      // não pode falhar mudo — recarrega do banco pra pegar o registro que já existe
      if (error) { carregarSemana(); return }
      if (data) setMatrizPerformance(prev => [...prev, data])
    }
  }

  // ── Plano de Ação (Semana 8) — upsert por (semana, gestor) ───────────────────
  async function salvarPlanoAcao(gestorId, campo, valor) {
    const existente = planosAcao.find(p => p.gestor_id === gestorId)
    const payload = { [campo]: valor }
    if (existente) {
      setPlanosAcao(prev => prev.map(p => p.id === existente.id ? { ...p, ...payload } : p))
      await supabase.from('gc_plano_acao').update(payload).eq('id', existente.id)
    } else {
      const { data, error } = await supabase.from('gc_plano_acao')
        .insert({ semana_id: semanaSel.id, gestor_id: gestorId, ...payload })
        .select().single()
      if (error) { carregarSemana(); return }
      if (data) setPlanosAcao(prev => [...prev, data])
    }
  }

  // ── Mapeamento de Processos (Semana 9) ────────────────────────────────────
  const [processoForm, setProcessoForm] = useState({ item: '', classificacao: 'manual' })
  async function adicionarProcesso(e) {
    e.preventDefault()
    if (!processoForm.item.trim() || !meuEscopoId) return
    const { data, error } = await supabase.from('gc_processo')
      .insert({ semana_id: semanaSel.id, gestor_id: meuEscopoId, item: processoForm.item.trim(), classificacao: processoForm.classificacao })
      .select().single()
    if (error) { alert('Erro: ' + error.message); return }
    setProcessos(prev => [...prev, data])
    setProcessoForm({ item: '', classificacao: 'manual' })
  }
  async function removerProcesso(id) {
    setProcessos(prev => prev.filter(p => p.id !== id))
    await supabase.from('gc_processo').delete().eq('id', id)
  }

  // ── Playbook (Semana 12) — compila os registros do programa inteiro, não só ──
  // da semana selecionada. Só busca quando a aba é aberta (não pesa nas outras abas).
  const [playbookDados, setPlaybookDados] = useState(null)
  const [carregandoPlaybook, setCarregandoPlaybook] = useState(false)
  async function carregarPlaybook() {
    setCarregandoPlaybook(true)
    const [{ data: r }, { data: f }, { data: ind }, { data: mResp } ] = await Promise.all([
      supabase.from('gc_reuniao').select('*'),
      supabase.from('gc_feedback').select('*'),
      supabase.from('gc_indicador').select('*').order('criado_em'),
      supabase.from('gc_matriz_responsabilidade').select('*'),
    ])
    setPlaybookDados({ reunioes: r || [], feedbacks: f || [], indicadores: ind || [], matriz: mResp || [] })
    setCarregandoPlaybook(false)
  }
  useEffect(() => { if (aba === 'playbook' && !playbookDados) carregarPlaybook() }, [aba])

  function gerarPlaybook() {
    const pendentes = entregaveis.filter(e => e.status !== 'entregue')
    if (pendentes.length > 0) {
      const porFase = {}
      for (const e of pendentes) porFase[e.fase] = (porFase[e.fase] || 0) + 1
      const resumo = Object.entries(porFase).map(([f, n]) => `${n} pendente(s) na ${FASE_LABEL[f]}`).join(', ')
      if (!window.confirm(`Ainda tem entregável pendente: ${resumo}. Gerar o Playbook assim mesmo?`)) return
    }
    setTimeout(() => window.print(), 50)
  }

  if (loading) return <div className="loading">Carregando Gestão Comercial...</div>
  if (!semanaSel) return <div className="main"><div className="empty">Nenhuma semana cadastrada ainda — roda a migration de seed.</div></div>

  return (
    <div className="main gc-modulo">
      <div className="dash-section-title">Gestão Comercial de Alta Performance</div>
      <div className="lm-resumo" style={{ marginBottom: 16 }}>
        Programa de 90 dias (12 semanas) — cada resposta, feedback e indicador vira registro aqui,
        com data e autor. Nada fica só no slide.
      </div>

      <div className="kanban-toolbar" style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Semana
          <select className="filter-select" style={{ marginLeft: 8 }} value={numeroSemana} onChange={e => setNumeroSemana(Number(e.target.value))}>
            {semanas.map(s => <option key={s.id} value={s.numero}>Semana {s.numero} — {fmtDataBR(s.data_inicio)} a {fmtDataBR(s.data_fim)}</option>)}
          </select>
        </label>
        <span className="tab-pill">{FASE_LABEL[semanaSel.fase]}</span>
        {semanaSel.tema_central && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{semanaSel.tema_central}</span>}
      </div>

      <div className="gc-tabs" style={{ marginBottom: 20 }}>
        {ABAS.map(a => (
          <div key={a.key} className={`tab ${aba === a.key ? 'active' : ''}`} onClick={() => setAba(a.key)}>{a.label}</div>
        ))}
      </div>

      {aba === 'reunioes' && (
        <>
          {(semanaSel.reuniao_segunda || semanaSel.objetivo) && (
            <details className="regras-toggle" style={{ marginBottom: 16 }}>
              <summary>Conteúdo de referência da Semana {semanaSel.numero} — {semanaSel.tema_central}</summary>
              <div className="regras-toggle-corpo" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {semanaSel.objetivo && <div><strong>Objetivo:</strong> {semanaSel.objetivo}</div>}
                {semanaSel.reuniao_segunda && <div><strong>Reunião de segunda:</strong> {semanaSel.reuniao_segunda}</div>}
                {semanaSel.exercicio_pratico && <div><strong>Exercício prático:</strong> {semanaSel.exercicio_pratico}</div>}
                {semanaSel.tarefa_gestores && <div><strong>Tarefa dos gestores:</strong> {semanaSel.tarefa_gestores}</div>}
                {semanaSel.aplicacao_consultores && <div><strong>Aplicação com os consultores:</strong> {semanaSel.aplicacao_consultores}</div>}
                {semanaSel.o_que_observar && <div><strong>O que João deve observar:</strong> {semanaSel.o_que_observar}</div>}
                {semanaSel.indicador_sugerido && <div><strong>Indicador:</strong> {semanaSel.indicador_sugerido}</div>}
                {semanaSel.checkpoint_sexta && <div><strong>Checkpoint de sexta:</strong> {semanaSel.checkpoint_sexta}</div>}
                {semanaSel.entrega_esperada && <div><strong>Entrega esperada:</strong> {semanaSel.entrega_esperada}</div>}
                {semanaSel.criterio_sucesso && <div><strong>Critério de sucesso:</strong> {semanaSel.criterio_sucesso}</div>}
                {semanaSel.proximo_passo && <div><strong>Próximo passo:</strong> {semanaSel.proximo_passo}</div>}
              </div>
            </details>
          )}
          {(isGestor(user) ? supervisores : supervisores.filter(s => s.id === meuEscopoId)).map(s => (
            <div key={s.id} style={{ marginBottom: 20 }}>
              {isGestor(user) && <div className="plano-time-titulo">{s.nome}</div>}
              <CardReuniao gestorId={s.id} tipo="segunda" podeEditar={s.id === meuEscopoId || isGestor(user)} />
              <CardReuniao gestorId={s.id} tipo="sexta" podeEditar={s.id === meuEscopoId || isGestor(user)} />
            </div>
          ))}
        </>
      )}

      {aba === 'feedback' && (
        <>
          {acompanhamentosVencidos.length > 0 && (
            <div className="login-erro" style={{ marginBottom: 16 }}>
              {acompanhamentosVencidos.length} acompanhamento(s) de feedback vencido(s) e ainda não revisado(s).
            </div>
          )}
          {(meuEscopoId || isGestor(user)) && (
            <form className="gc-card" style={{ marginBottom: 20 }} onSubmit={criarFeedback}>
              <div className="lm-grid-2">
                <div className="lm-field-edit">
                  <label>Tipo</label>
                  <select className="filter-select" style={{ width: '100%' }} value={fbForm.tipo} onChange={e => setFbForm(f => ({ ...f, tipo: e.target.value }))}>
                    <option value="estruturado">Estruturado (gestor → consultor)</option>
                    <option value="360">360 (consultor → gestor — lançado pelo gestor por enquanto)</option>
                  </select>
                </div>
                {isGestor(user) && !meuEscopoId && (
                  <div className="lm-field-edit">
                    <label>Supervisor</label>
                    <select className="filter-select" style={{ width: '100%' }} value={fbForm.gestorId} onChange={e => setFbForm(f => ({ ...f, gestorId: e.target.value, consultorId: '' }))}>
                      <option value="">Selecione...</option>
                      {supervisores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                  </div>
                )}
                <div className="lm-field-edit">
                  <label>Consultor</label>
                  <select className="filter-select" style={{ width: '100%' }} value={fbForm.consultorId} onChange={e => setFbForm(f => ({ ...f, consultorId: e.target.value }))} required>
                    <option value="">Selecione...</option>
                    {meuTime.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="lm-field-edit"><label>Prazo</label><input className="lm-input" type="date" value={fbForm.prazo} onChange={e => setFbForm(f => ({ ...f, prazo: e.target.value }))} /></div>
                <div className="lm-field-edit"><label>Acompanhamento (revisar em)</label><input className="lm-input" type="date" value={fbForm.acompanhamento} onChange={e => setFbForm(f => ({ ...f, acompanhamento: e.target.value }))} /></div>
                <div className="lm-field-edit" style={{ gridColumn: '1 / -1' }}><label>Situação<CampoAjuda texto={AJUDA.situacao} /></label><textarea className="obs-area" style={{ width: '100%' }} value={fbForm.situacao} onChange={e => setFbForm(f => ({ ...f, situacao: e.target.value }))} /><MelhorarIA valor={fbForm.situacao} onMelhorado={t => setFbForm(f => ({ ...f, situacao: t }))} /></div>
                <div className="lm-field-edit"><label>Fato<CampoAjuda texto={AJUDA.fato} /></label><textarea className="obs-area" style={{ width: '100%' }} value={fbForm.fato} onChange={e => setFbForm(f => ({ ...f, fato: e.target.value }))} /><MelhorarIA valor={fbForm.fato} onMelhorado={t => setFbForm(f => ({ ...f, fato: t }))} /></div>
                <div className="lm-field-edit"><label>Comportamento<CampoAjuda texto={AJUDA.comportamento} /></label><textarea className="obs-area" style={{ width: '100%' }} value={fbForm.comportamento} onChange={e => setFbForm(f => ({ ...f, comportamento: e.target.value }))} /><MelhorarIA valor={fbForm.comportamento} onMelhorado={t => setFbForm(f => ({ ...f, comportamento: t }))} /></div>
                <div className="lm-field-edit"><label>Impacto<CampoAjuda texto={AJUDA.impacto} /></label><textarea className="obs-area" style={{ width: '100%' }} value={fbForm.impacto} onChange={e => setFbForm(f => ({ ...f, impacto: e.target.value }))} /><MelhorarIA valor={fbForm.impacto} onMelhorado={t => setFbForm(f => ({ ...f, impacto: t }))} /></div>
                <div className="lm-field-edit"><label>Expectativa (o que muda a partir de agora)<CampoAjuda texto={AJUDA.expectativa} /></label><textarea className="obs-area" style={{ width: '100%' }} value={fbForm.expectativa} onChange={e => setFbForm(f => ({ ...f, expectativa: e.target.value }))} /><MelhorarIA valor={fbForm.expectativa} onMelhorado={t => setFbForm(f => ({ ...f, expectativa: t }))} /></div>
                <div className="lm-field-edit" style={{ gridColumn: '1 / -1' }}><label>Acordo (o que foi combinado)<CampoAjuda texto={AJUDA.acordo} /></label><textarea className="obs-area" style={{ width: '100%' }} value={fbForm.acordo} onChange={e => setFbForm(f => ({ ...f, acordo: e.target.value }))} /><MelhorarIA valor={fbForm.acordo} onMelhorado={t => setFbForm(f => ({ ...f, acordo: t }))} /></div>
              </div>
              <button className="btn-save-obs" style={{ float: 'none', margin: '8px 0 0' }} type="submit" disabled={salvandoFb}>{salvandoFb ? 'Salvando...' : '+ Registrar feedback'}</button>
            </form>
          )}

          <div className="carteira-table-wrap">
            <table className="carteira-table">
              <thead><tr><th>Consultor</th><th>Supervisor</th><th>Tipo</th><th>Prazo</th><th>Acompanhamento</th><th>Status</th></tr></thead>
              <tbody>
                {feedbacks.length === 0 && <tr><td colSpan={6} className="empty">Nenhum feedback registrado nessa semana</td></tr>}
                {feedbacks.map(f => {
                  const vencido = f.acompanhamento && f.acompanhamento < hoje && !f.acompanhamento_feito
                  return (
                    <tr key={f.id} className={vencido ? 'row-pendente' : ''}>
                      <td>{nomeStaff(f.consultor_id)}</td>
                      <td>{nomeStaff(f.gestor_id)}</td>
                      <td>{f.tipo === '360' ? '360' : 'Estruturado'}</td>
                      <td>{fmtDataBR(f.prazo) || '—'}</td>
                      <td>{fmtDataBR(f.acompanhamento) || '—'}{vencido && <span className="gc-tag-vencido">vencido</span>}</td>
                      <td>
                        {f.acompanhamento_feito ? <span className="gc-status-pill ok"><span className="gc-status-dot" />Revisado</span>
                          : (f.gestor_id === meuEscopoId || isGestor(user)) && f.acompanhamento
                            ? <button className="btn-action" onClick={() => marcarAcompanhado(f)}>Marcar revisado</button>
                            : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {aba === 'indicadores' && (
        <>
          {meuEscopoId && (
            <form className="kanban-toolbar" style={{ marginBottom: 16 }} onSubmit={lancarIndicador}>
              <input className="lm-input" placeholder="Nome do indicador" value={indForm.nome} onChange={e => setIndForm(f => ({ ...f, nome: e.target.value }))} required />
              <CampoAjuda texto={AJUDA.indicadorNome} />
              <input className="lm-input" style={{ width: 100 }} type="number" placeholder="Valor" value={indForm.valor} onChange={e => setIndForm(f => ({ ...f, valor: e.target.value }))} />
              <CampoAjuda texto={AJUDA.indicadorValor} />
              <input className="lm-input" style={{ width: 100 }} type="number" placeholder="Meta (opcional)" value={indForm.meta} onChange={e => setIndForm(f => ({ ...f, meta: e.target.value }))} />
              <CampoAjuda texto={AJUDA.indicadorMeta} />
              <button className="btn-save-obs" style={{ float: 'none', margin: 0 }} type="submit">+ Lançar</button>
            </form>
          )}
          {supervisores.filter(s => isGestor(user) || s.id === meuEscopoId).map(s => (
            <div key={s.id} style={{ marginBottom: 20 }}>
              <div className="plano-time-titulo">{s.nome}</div>
              <div className="carteira-table-wrap">
                <table className="carteira-table">
                  <thead><tr><th>Indicador</th><th>Valor</th><th>Meta</th><th>Fonte</th></tr></thead>
                  <tbody>
                    {indicadores.filter(i => i.gestor_id === s.id).length === 0 && <tr><td colSpan={4} className="empty">Nenhum indicador lançado nessa semana</td></tr>}
                    {indicadores.filter(i => i.gestor_id === s.id).map(i => (
                      <tr key={i.id}><td>{i.nome}</td><td>{i.valor}</td><td>{i.meta ?? '—'}</td><td>{i.fonte}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {aba === 'matriz' && (
        <>
          {isGestor(user) && (
            <form className="kanban-toolbar" style={{ marginBottom: 16 }} onSubmit={criarAcaoMatriz}>
              <select className="filter-select" value={matrizForm.gestorId} onChange={e => setMatrizForm(f => ({ ...f, gestorId: e.target.value }))} required>
                <option value="">Supervisor...</option>
                {supervisores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <input className="lm-input" style={{ flex: 1 }} placeholder="Ação específica dessa semana" value={matrizForm.acao} onChange={e => setMatrizForm(f => ({ ...f, acao: e.target.value }))} required />
              <CampoAjuda texto={AJUDA.matrizAcao} />
              <MelhorarIA valor={matrizForm.acao} onMelhorado={t => setMatrizForm(f => ({ ...f, acao: t }))} />
              <button className="btn-save-obs" style={{ float: 'none', margin: 0 }} type="submit">+ Definir ação</button>
            </form>
          )}
          <div className="carteira-table-wrap">
            <table className="carteira-table">
              <thead><tr><th>Supervisor</th><th>Ação da semana</th><th>Status</th></tr></thead>
              <tbody>
                {matriz.length === 0 && <tr><td colSpan={3} className="empty">Nenhuma ação definida nessa semana</td></tr>}
                {matriz.map(m => (
                  <tr key={m.id}>
                    <td>{nomeStaff(m.gestor_id)}</td>
                    <td>{m.acao_especifica}</td>
                    <td>
                      {(m.gestor_id === meuEscopoId || isGestor(user)) ? (
                        <button className="btn-action" onClick={() => alternarAcaoFeita(m)}>
                          {m.status === 'feito' ? 'Feito' : 'Marcar feito'}
                        </button>
                      ) : (
                        <span className={`gc-status-pill ${m.status === 'feito' ? 'ok' : 'pendente'}`}>
                          <span className="gc-status-dot" />{m.status === 'feito' ? 'Feito' : 'Pendente'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {aba === 'entregaveis' && (
        <>
          {['fase_1', 'fase_2', 'fase_3'].map(fase => (
            <div key={fase} style={{ marginBottom: 20 }}>
              <div className="plano-time-titulo">{FASE_LABEL[fase]}</div>
              <div className="carteira-table-wrap">
                <table className="carteira-table">
                  <thead><tr><th>Entregável</th><th>Responsável</th><th>Status</th></tr></thead>
                  <tbody>
                    {entregaveis.filter(e => e.fase === fase).map(e => (
                      <tr key={e.id}>
                        <td>{e.descricao}</td>
                        <td>{e.gestor_id ? nomeStaff(e.gestor_id) : '—'}</td>
                        <td>
                          {isGestor(user) || e.gestor_id === meuEscopoId ? (
                            <select className="filter-select" value={e.status} onChange={ev => mudarStatusEntregavel(e, ev.target.value)}>
                              <option value="pendente">Pendente</option>
                              <option value="em_andamento">Em andamento</option>
                              <option value="entregue">Entregue</option>
                            </select>
                          ) : (
                            <span className={`gc-status-pill ${e.status === 'entregue' ? 'ok' : e.status === 'em_andamento' ? 'andamento' : 'pendente'}`}>
                              <span className="gc-status-dot" />
                              {e.status === 'entregue' ? 'Entregue' : e.status === 'em_andamento' ? 'Em andamento' : 'Pendente'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {aba === 'performance' && (
        <>
          <div className="lm-resumo" style={{ marginBottom: 16 }}>
            Semana 7 — posiciona cada consultor em 4 eixos (1 baixo a 5 alto) e classifica. Um registro por consultor, atualizável a qualquer momento.
          </div>
          {supervisores.filter(s => isGestor(user) || s.id === meuEscopoId).map(s => (
            <div key={s.id} style={{ marginBottom: 20 }}>
              <div className="plano-time-titulo">{s.nome}</div>
              <div className="carteira-table-wrap">
                <table className="carteira-table">
                  <thead><tr>
                    <th>Consultor</th>
                    <th>Resultado<CampoAjuda texto={AJUDA.perfResultado} /></th>
                    <th>Produtividade<CampoAjuda texto={AJUDA.perfProdutividade} /></th>
                    <th>Comportamento<CampoAjuda texto={AJUDA.perfComportamento} /></th>
                    <th>Evolução<CampoAjuda texto={AJUDA.perfEvolucao} /></th>
                    <th>Classificação<CampoAjuda texto={AJUDA.perfClassificacao} /></th>
                  </tr></thead>
                  <tbody>
                    {staff.filter(c => c.perfil === 'Consultor' && c.supervisor_id === s.id).map(c => {
                      const reg = matrizPerformance.find(m => m.consultor_id === c.id)
                      const podeEditar = s.id === meuEscopoId || isGestor(user)
                      const campoNota = (campo) => podeEditar ? (
                        <select className="filter-select" style={{ width: 60 }} value={reg?.[campo] ?? ''}
                          onChange={e => salvarPerformance(c.id, s.id, campo, e.target.value ? Number(e.target.value) : null)}>
                          <option value="">—</option>
                          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      ) : (reg?.[campo] ?? '—')
                      return (
                        <tr key={c.id}>
                          <td>{c.nome}</td>
                          <td>{campoNota('resultado')}</td>
                          <td>{campoNota('produtividade')}</td>
                          <td>{campoNota('comportamento')}</td>
                          <td>{campoNota('evolucao')}</td>
                          <td>
                            {podeEditar ? (
                              <select className="filter-select" value={reg?.classificacao || ''} onChange={e => salvarPerformance(c.id, s.id, 'classificacao', e.target.value || null)}>
                                <option value="">—</option>
                                {Object.entries(CLASSIFICACAO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                              </select>
                            ) : (CLASSIFICACAO_LABEL[reg?.classificacao] || '—')}
                          </td>
                        </tr>
                      )
                    })}
                    {staff.filter(c => c.perfil === 'Consultor' && c.supervisor_id === s.id).length === 0 && (
                      <tr><td colSpan={6} className="empty">Nenhum consultor nesse time</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {aba === 'plano_acao' && (
        <>
          <div className="lm-resumo" style={{ marginBottom: 16 }}>
            Semana 8 — um plano por supervisor: Meta → Gap → Oportunidade → Estratégia → Ação → Responsável → Prazo → KPI.
          </div>
          {supervisores.filter(s => isGestor(user) || s.id === meuEscopoId).map(s => {
            const plano = planosAcao.find(p => p.gestor_id === s.id) || {}
            const podeEditar = s.id === meuEscopoId || isGestor(user)
            const campo = (label, key, tipo = 'text', ajuda) => {
              const refKey = `${s.id}-${key}`
              return (
                <div className="lm-field-edit">
                  <label>{label}{ajuda && <CampoAjuda texto={ajuda} />}</label>
                  {podeEditar ? (
                    <>
                      <input ref={el => { refsPlano.current[refKey] = el }} className="lm-input" type={tipo} defaultValue={plano[key] || ''}
                        onBlur={e => salvarPlanoAcao(s.id, key, tipo === 'date' ? (e.target.value || null) : e.target.value)} />
                      {tipo !== 'date' && (
                        <MelhorarIA campoRef={{ current: refsPlano.current[refKey] }}
                          onMelhorado={texto => salvarPlanoAcao(s.id, key, texto)} />
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{plano[key] || '—'}</div>
                  )}
                </div>
              )
            }
            return (
              <div key={s.id} style={{ marginBottom: 20 }}>
                <div className="plano-time-titulo">{s.nome}</div>
                <div className="importar-conteudo lm-grid-2">
                  {campo('Meta', 'meta', 'text', AJUDA.planoMeta)}
                  {campo('Gap', 'gap', 'text', AJUDA.planoGap)}
                  {campo('Oportunidade', 'oportunidade', 'text', AJUDA.planoOportunidade)}
                  {campo('Estratégia', 'estrategia', 'text', AJUDA.planoEstrategia)}
                  {campo('Ação', 'acao', 'text', AJUDA.planoAcao)}
                  {campo('Responsável', 'responsavel', 'text', AJUDA.planoResponsavel)}
                  {campo('Prazo', 'prazo', 'date', AJUDA.planoPrazo)}
                  {campo('KPI', 'kpi', 'text', AJUDA.planoKpi)}
                </div>
              </div>
            )
          })}
        </>
      )}

      {aba === 'processos' && (
        <>
          <div className="lm-resumo" style={{ marginBottom: 16 }}>
            Semana 9 — lista tarefas/relatórios/controles do dia a dia e classifica cada um.
          </div>
          {meuEscopoId && (
            <form className="kanban-toolbar" style={{ marginBottom: 16 }} onSubmit={adicionarProcesso}>
              <input className="lm-input" style={{ flex: 1 }} placeholder="Ex: montar relatório de vendas toda sexta"
                value={processoForm.item} onChange={e => setProcessoForm(f => ({ ...f, item: e.target.value }))} required />
              <CampoAjuda texto={AJUDA.processoItem} />
              <MelhorarIA valor={processoForm.item} onMelhorado={t => setProcessoForm(f => ({ ...f, item: t }))} />
              <select className="filter-select" value={processoForm.classificacao} onChange={e => setProcessoForm(f => ({ ...f, classificacao: e.target.value }))}>
                {Object.entries(PROCESSO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <CampoAjuda texto={AJUDA.processoClassificacao} />
              <button className="btn-save-obs" style={{ float: 'none', margin: 0 }} type="submit">+ Adicionar</button>
            </form>
          )}
          {supervisores.filter(s => isGestor(user) || s.id === meuEscopoId).map(s => (
            <div key={s.id} style={{ marginBottom: 20 }}>
              <div className="plano-time-titulo">{s.nome}</div>
              <div className="carteira-table-wrap">
                <table className="carteira-table">
                  <thead><tr><th>Item</th><th>Classificação</th><th></th></tr></thead>
                  <tbody>
                    {processos.filter(p => p.gestor_id === s.id).length === 0 && <tr><td colSpan={3} className="empty">Nenhum item mapeado</td></tr>}
                    {processos.filter(p => p.gestor_id === s.id).map(p => (
                      <tr key={p.id}>
                        <td>{p.item}</td>
                        <td>{PROCESSO_LABEL[p.classificacao]}</td>
                        <td>{(s.id === meuEscopoId || isGestor(user)) && <button className="btn-action" onClick={() => removerProcesso(p.id)}>Remover</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {aba === 'playbook' && (
        <>
          <div className="lm-resumo" style={{ marginBottom: 16 }}>
            Semana 12 — compila rotina validada, indicadores, feedbacks aplicados e entregáveis das 3 fases num documento só. Não digita nada aqui, só junta o que já foi registrado nas outras abas o programa inteiro.
          </div>
          {isGestor(user) && (
            <button className="btn-save-obs" style={{ float: 'none', marginBottom: 16 }} onClick={gerarPlaybook} disabled={carregandoPlaybook || !playbookDados}>
              Gerar Playbook
            </button>
          )}
          {carregandoPlaybook && <div className="loading">Compilando...</div>}
          {playbookDados && (
            <div className="gc-playbook-print">
              {supervisores.map(s => {
                const reunioesFeitas = playbookDados.reunioes.filter(r => r.gestor_id === s.id && r.realizada).length
                const acoesFeitas = playbookDados.matriz.filter(m => m.gestor_id === s.id && m.status === 'feito').length
                const acoesTotal = playbookDados.matriz.filter(m => m.gestor_id === s.id).length
                const feedbacksDados = playbookDados.feedbacks.filter(f => f.gestor_id === s.id && f.tipo === 'estruturado').length
                const feedbacks360 = playbookDados.feedbacks.filter(f => f.gestor_id === s.id && f.tipo === '360').length
                const indicadoresDoSupervisor = playbookDados.indicadores.filter(i => i.gestor_id === s.id)
                return (
                  <div key={s.id} className="gc-card" style={{ marginBottom: 16 }}>
                    <div className="gc-card-titulo" style={{ marginBottom: 10 }}>{s.nome}</div>
                    <div className="gc-resumo-grid">
                      <div className="gc-resumo-item"><span className="gc-resumo-label">Reuniões realizadas</span><span className="gc-resumo-valor">{reunioesFeitas}</span></div>
                      <div className="gc-resumo-item"><span className="gc-resumo-label">Ações concluídas</span><span className="gc-resumo-valor">{acoesFeitas}/{acoesTotal}</span></div>
                      <div className="gc-resumo-item"><span className="gc-resumo-label">Feedback estruturado</span><span className="gc-resumo-valor">{feedbacksDados}</span></div>
                      <div className="gc-resumo-item"><span className="gc-resumo-label">Feedback 360 recebido</span><span className="gc-resumo-valor">{feedbacks360}</span></div>
                      <div className="gc-resumo-item"><span className="gc-resumo-label">Indicadores lançados</span><span className="gc-resumo-valor">{indicadoresDoSupervisor.length}</span></div>
                    </div>
                  </div>
                )
              })}
              <div className="gc-card">
                <div className="gc-card-titulo" style={{ marginBottom: 10 }}>Entregáveis</div>
                <div className="gc-resumo-grid">
                  {['fase_1', 'fase_2', 'fase_3'].map(fase => {
                    const doFase = entregaveis.filter(e => e.fase === fase)
                    const entregues = doFase.filter(e => e.status === 'entregue').length
                    return (
                      <div key={fase} className="gc-resumo-item">
                        <span className="gc-resumo-label">{FASE_LABEL[fase]}</span>
                        <span className="gc-resumo-valor">{entregues}/{doFase.length}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

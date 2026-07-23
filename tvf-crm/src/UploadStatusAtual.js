import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { parseArquivo, listarAbas, mapearCampos, extrairCnpj } from './xlsxParse'
import { calcularPotencial } from './potencialLogic'

const ALIASES = {
  cnpj: ['cnpj'],
  razao_social: ['razaosocial', 'empresa', 'cliente'],
  contato: ['contato'],
  status: ['status'],
  observacao: ['observacoes', 'observacao', 'interacao', 'obs'],
  pot_migracao: ['potmigracao'],
  pot_bl: ['potbl'],
  pot_ti: ['potti'],
  pot_voz: ['potvoz'],
  credito: ['creditota', 'creditopreaprov', 'creditopreaprovado'],
}

const STATUS_OPCOES = [
  'Aguardando Aceite', 'Aguardando Atendimento', 'Cliente Cancelou', 'Cliente Já Renovado', 'CNPJ Baixado',
  'Débito Interno', 'Já Possui Consultor', 'Não Contatar', 'Não Possui Recomendação',
  'Pedido Finalizado', 'Proposta Enviada', 'Retornar', 'Sem Contato Efetivo',
  'Sem Interesse', 'Sem Viabilidade', 'Venda Realizada',
]

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

function mapearStatus(bruto) {
  const alvo = normalizar(bruto)
  return STATUS_OPCOES.find(s => normalizar(s) === alvo) || null
}

function paraNumero(str) {
  if (str === '' || str == null) return null
  const limpo = String(str).replace(/[^0-9.-]/g, '')
  const n = parseFloat(limpo)
  return isNaN(n) ? null : n
}

export default function UploadStatusAtual() {
  const [staff, setStaff] = useState([])
  const [consultorId, setConsultorId] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [abas, setAbas] = useState([])
  const [abaEscolhida, setAbaEscolhida] = useState('')
  const [linhas, setLinhas] = useState([])
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    supabase.from('consultores_staff').select('id, nome, perfil').order('nome').then(({ data }) => setStaff(data || []))
  }, [])

  async function handleArquivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setResultado(null)
    setLinhas([])
    setArquivo(file)
    const nomesAbas = await listarAbas(file)
    setAbas(nomesAbas)
    // Se tiver mais de uma aba, tenta pré-selecionar a que bate com o nome do consultor escolhido
    const nomeConsultorAtual = staff.find(s => s.id === consultorId)?.nome || ''
    const abaSugerida = nomesAbas.find(a => normalizar(a).includes(normalizar(nomeConsultorAtual).split(' ')[0]))
    setAbaEscolhida(nomesAbas.length === 1 ? nomesAbas[0] : (abaSugerida || ''))
  }

  async function processarAba(nomeAba) {
    if (!arquivo || !nomeAba) return
    setAbaEscolhida(nomeAba)
    const brutas = await parseArquivo(arquivo, nomeAba)
    const mapeadas = brutas.map(l => {
      const m = mapearCampos(l, ALIASES)
      const cnpj = extrairCnpj(m.cnpj) || m.cnpj.replace(/\D/g, '')
      const statusMapeado = mapearStatus(m.status)
      return {
        ...m,
        cnpj,
        statusMapeado,
        statusOriginal: m.status,
        potMigracaoPlanilha: paraNumero(m.pot_migracao),
        potBlPlanilha: paraNumero(m.pot_bl),
        potTiPlanilha: paraNumero(m.pot_ti),
        potVozPlanilha: paraNumero(m.pot_voz),
        creditoPlanilha: paraNumero(m.credito),
      }
    }).filter(l => l.cnpj)
    setLinhas(mapeadas)
  }

  useEffect(() => { if (abaEscolhida) processarAba(abaEscolhida) }, [abaEscolhida]) // eslint-disable-line

  async function importar() {
    if (!consultorId) return
    setImportando(true)
    setResultado(null)
    let criados = 0, atualizados = 0, semStatusReconhecido = 0, falhas = 0, daPlanilha = 0, doMapaParque = 0
    const errosAmostra = []

    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]
      setProgresso(`Importando ${i + 1} de ${linhas.length}...`)
      if (!l.statusMapeado) semStatusReconhecido++
      const status = l.statusMapeado || 'Aguardando Atendimento'

      // BL/TI/Voz/Crédito: usa o que já vem pronto na planilha do consultor (mais confiável).
      // Migração: SEMPRE vem do Mapa Parque — a planilha não rastreia isso direito.
      const temNaPlanilha = [l.potBlPlanilha, l.potTiPlanilha, l.potVozPlanilha, l.creditoPlanilha].some(v => v !== null)
      if (temNaPlanilha) daPlanilha++

      const { data: parque } = await supabase.from('mapa_parque_import')
        .select('*').eq('nr_cnpj', l.cnpj).order('importado_em', { ascending: false }).limit(1).maybeSingle()
      const potencialParque = parque ? calcularPotencial(parque) : null
      if (potencialParque) doMapaParque++

      const potencial = (temNaPlanilha || potencialParque) ? {
        potencial_migracao: potencialParque?.potencial_migracao || 0,
        potencial_bl: l.potBlPlanilha ?? potencialParque?.potencial_bl ?? 0,
        potencial_ti: l.potTiPlanilha ?? potencialParque?.potencial_ti ?? 0,
        potencial_voz: l.potVozPlanilha ?? potencialParque?.potencial_voz ?? 0,
        credito_pre_aprovado: l.creditoPlanilha ?? potencialParque?.credito_pre_aprovado ?? 0,
      } : null

      const { data: existente } = await supabase.from('carteira_cliente').select('id')
        .eq('cnpj', l.cnpj).eq('consultor_id', consultorId).maybeSingle()

      let clienteId = existente?.id

      if (existente) {
        const { error } = await supabase.from('carteira_cliente').update({
          status, razao_social: l.razao_social || undefined, contato: l.contato || undefined,
          ...(potencial || {}),
          atualizado_em: new Date().toISOString(),
        }).eq('id', existente.id)
        if (error) { falhas++; if (errosAmostra.length < 3) errosAmostra.push(error.message) } else atualizados++
      } else {
        const { data: novo, error } = await supabase.from('carteira_cliente').insert({
          cnpj: l.cnpj, razao_social: l.razao_social, contato: l.contato, consultor_id: consultorId, status,
          origem: 'Status Atual (Migração)',
          potencial_migracao: potencial?.potencial_migracao || 0,
          potencial_bl: potencial?.potencial_bl || 0,
          potencial_ti: potencial?.potencial_ti || 0,
          potencial_voz: potencial?.potencial_voz || 0,
          credito_pre_aprovado: potencial?.credito_pre_aprovado || 0,
        }).select().single()
        if (error) { falhas++; if (errosAmostra.length < 3) errosAmostra.push(error.message) } else { criados++; clienteId = novo.id }
      }

      if (clienteId && l.observacao) {
        const { data: jaTemInteracao } = await supabase.from('carteira_interacao').select('id')
          .eq('carteira_cliente_id', clienteId).limit(1).maybeSingle()
        if (!jaTemInteracao) {
          await supabase.from('carteira_interacao').insert({
            carteira_cliente_id: clienteId, autor_id: consultorId, descricao: l.observacao,
          })
        }
      }
    }

    setImportando(false)
    setProgresso('')
    setResultado({ criados, atualizados, semStatusReconhecido, falhas, errosAmostra, daPlanilha, doMapaParque })
    setLinhas([])
    setArquivo(null)
    setAbas([])
    setAbaEscolhida('')
  }

  return (
    <div className="main">
      <div className="lm-section-title">Upload Status Atual (migração)</div>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 16px' }}>
        Sobe a planilha que o consultor já usa hoje (CNPJ + Status + Observação + Potencial). Usa o potencial que já vem
        pronto na própria planilha; só cruza com o Mapa Parque se a planilha não trouxer o valor. A observação vira a
        primeira interação registrada — só entra se o cliente ainda não tiver nenhuma. Se o arquivo tiver várias abas
        (uma por consultor), escolhe a aba certa abaixo.
      </p>

      <div className="kanban-toolbar">
        <select className="filter-select" value={consultorId} onChange={e => setConsultorId(e.target.value)}>
          <option value="">Selecione o consultor...</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.nome} ({s.perfil})</option>)}
        </select>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleArquivo} disabled={!consultorId} />
        {abas.length > 1 && (
          <select className="filter-select" value={abaEscolhida} onChange={e => processarAba(e.target.value)}>
            <option value="">Escolha a aba...</option>
            {abas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {linhas.length > 0 && <span style={{ fontSize: 12, color: '#660099' }}>{linhas.length} linhas com CNPJ válido</span>}
      </div>
      {!consultorId && <div style={{ fontSize: 11, color: '#C0451A', marginTop: -8, marginBottom: 12 }}>Escolha o consultor antes de subir o arquivo.</div>}

      {linhas.length > 0 && (
        <>
          <div className="carteira-table-wrap" style={{ marginBottom: 12 }}>
            <table className="carteira-table">
              <thead><tr><th>CNPJ</th><th>Razão Social</th><th>Status</th><th>Pot. Migração</th><th>Pot. BL</th><th>Pot. TI</th><th>Pot. Voz</th><th>Crédito</th></tr></thead>
              <tbody>
                {linhas.slice(0, 30).map((l, i) => (
                  <tr key={i} style={!l.statusMapeado ? { background: '#FFF5EE' } : {}}>
                    <td>{l.cnpj}</td><td>{l.razao_social}</td>
                    <td>{l.statusMapeado || <span style={{ color: '#C0451A' }}>{l.statusOriginal || '—'} → Aguardando Aceite</span>}</td>
                    <td>{l.potMigracaoPlanilha ?? '—'}</td><td>{l.potBlPlanilha ?? '—'}</td>
                    <td>{l.potTiPlanilha ?? '—'}</td><td>{l.potVozPlanilha ?? '—'}</td>
                    <td>{l.creditoPlanilha ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-save-obs" style={{ float: 'none' }} onClick={importar} disabled={importando || !consultorId}>
            {importando ? 'Importando...' : `Importar ${linhas.length} cliente(s) para ${staff.find(s => s.id === consultorId)?.nome || 'consultor selecionado'}`}
          </button>
        </>
      )}

      {progresso && <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>{progresso}</div>}

      {resultado && (
        <div className="lm-resumo" style={{ marginTop: 16 }}>
          {resultado.criados} clientes novos, {resultado.atualizados} atualizados. {resultado.semStatusReconhecido} vieram com status não reconhecido (ficaram "Aguardando Aceite").
          {' '}{resultado.daPlanilha} usaram o potencial da própria planilha, {resultado.doMapaParque} vieram do Mapa Parque.
          {resultado.falhas > 0 && (
            <div className="login-erro" style={{ marginTop: 8 }}>{resultado.falhas} linha(s) falharam.</div>
          )}
        </div>
      )}
    </div>
  )
}

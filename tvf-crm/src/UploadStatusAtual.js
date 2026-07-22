import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { parseArquivo, listarAbas, mapearCampos, extrairCnpj } from './xlsxParse'

const ALIASES = {
  cnpj: ['cnpj'],
  razao_social: ['razaosocial', 'empresa', 'cliente'],
  contato: ['contato'],
  status: ['status'],
  observacao: ['observacoes', 'observacao', 'interacao', 'obs'],
}

const STATUS_OPCOES = [
  'Aguardando Aceite', 'Cliente Cancelou', 'Cliente Já Renovado', 'CNPJ Baixado',
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
      return { ...m, cnpj, statusMapeado, statusOriginal: m.status }
    }).filter(l => l.cnpj)
    setLinhas(mapeadas)
  }

  useEffect(() => { if (abaEscolhida) processarAba(abaEscolhida) }, [abaEscolhida]) // eslint-disable-line react-hooks/exhaustive-deps

  async function importar() {
    if (!consultorId) return
    setImportando(true)
    setResultado(null)
    let criados = 0, atualizados = 0, semStatusReconhecido = 0, falhas = 0
    const errosAmostra = []

    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]
      setProgresso(`Importando ${i + 1} de ${linhas.length}...`)
      if (!l.statusMapeado) semStatusReconhecido++
      const status = l.statusMapeado || 'Aguardando Aceite'

      const { data: existente } = await supabase.from('carteira_cliente').select('id')
        .eq('cnpj', l.cnpj).eq('consultor_id', consultorId).maybeSingle()

      let clienteId = existente?.id

      if (existente) {
        const { error } = await supabase.from('carteira_cliente').update({
          status, razao_social: l.razao_social || undefined, contato: l.contato || undefined,
          atualizado_em: new Date().toISOString(),
        }).eq('id', existente.id)
        if (error) { falhas++; if (errosAmostra.length < 3) errosAmostra.push(error.message) } else atualizados++
      } else {
        const { data: novo, error } = await supabase.from('carteira_cliente').insert({
          cnpj: l.cnpj, razao_social: l.razao_social, contato: l.contato, consultor_id: consultorId, status,
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
    setResultado({ criados, atualizados, semStatusReconhecido, falhas, errosAmostra })
    setLinhas([])
    setArquivo(null)
    setAbas([])
    setAbaEscolhida('')
  }

  return (
    <div className="main">
      <div className="lm-section-title">Upload Status Atual (migração)</div>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 16px' }}>
        Sobe a planilha que o consultor já usa hoje (CNPJ + Status + Observação) pra popular a carteira dele já com o
        histórico. A observação vira a primeira interação registrada — só entra se o cliente ainda não tiver nenhuma.
        Se o arquivo tiver várias abas (uma por consultor), escolhe a aba certa abaixo.
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
              <thead><tr><th>CNPJ</th><th>Razão Social</th><th>Status (planilha)</th><th>Status (mapeado)</th><th>Observação</th></tr></thead>
              <tbody>
                {linhas.slice(0, 30).map((l, i) => (
                  <tr key={i} style={!l.statusMapeado ? { background: '#FFF5EE' } : {}}>
                    <td>{l.cnpj}</td><td>{l.razao_social}</td><td>{l.statusOriginal}</td>
                    <td>{l.statusMapeado || <span style={{ color: '#C0451A' }}>não reconhecido → Aguardando Aceite</span>}</td>
                    <td>{l.observacao}</td>
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
          {resultado.falhas > 0 && (
            <div className="login-erro" style={{ marginTop: 8 }}>
              {resultado.falhas} linha(s) falharam. Exemplo(s): {resultado.errosAmostra.join(' | ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

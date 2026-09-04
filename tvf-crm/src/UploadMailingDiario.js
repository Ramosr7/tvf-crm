import React, { useState, useEffect } from 'react'
import { supabase, fetchPaginado } from './supabaseClient'
import { parseArquivo, mapearCampos, extrairCnpj, extrairEmail, extrairTelefone } from './xlsxParse'
import { calcularPotencial } from './potencialLogic'

const ALIASES = {
  colaborador: ['colaborador'],
  razao_social_bloco: ['razaosocial'],
  contato_bloco: ['dadossalesforce', 'contato'],
  trilha_produtos: ['trilhaprodutosativos', 'trilha'],
  valores_aparelhos: ['valoresaparelhos'],
  movel_m17: ['movelm17'],
  cidade: ['cidade'],
  status: ['status'],
}

function paraValorReal(str) {
  if (!str) return null
  const limpo = String(str).replace(/[^\d,]/g, '').replace(',', '.')
  const n = parseFloat(limpo)
  return isNaN(n) ? null : n
}

// Status onde o consultor dono já demonstrou não estar conseguindo avançar o cliente — nesses
// casos a importação pode transferir pra outro consultor em vez de bloquear.
const STATUS_LIBERA_TRANSFERENCIA = ['Sem Contato Efetivo', 'Sem Interesse']
// Retorno agendado (carteira_lembrete) vencido há pelo menos esse tanto de dias também libera
// transferência — cliente ficou pendente de atendimento e ninguém retornou.
const DIAS_RETORNO_VENCIDO_LIBERA = 3

export default function UploadMailingDiario() {
  const [staff, setStaff] = useState([])
  const [consultorId, setConsultorId] = useState('')
  const [linhas, setLinhas] = useState([])
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [resultado, setResultado] = useState(null)
  const [donoPorCnpj, setDonoPorCnpj] = useState({})

  useEffect(() => {
    supabase.from('consultores_staff').select('id, nome, perfil').order('nome').then(({ data }) => setStaff(data || []))
  }, [])

  async function carregarDonos() {
    const { data } = await fetchPaginado((de, ate) => supabase.from('carteira_cliente').select('id, cnpj, consultor_id, status').range(de, ate))
    const linhasCarteira = data || []

    // Retorno pendente vencido: busca lembretes não concluídos com data_hora vencida há pelo
    // menos DIAS_RETORNO_VENCIDO_LIBERA dias, só pros clientes carregados acima.
    const limite = new Date()
    limite.setDate(limite.getDate() - DIAS_RETORNO_VENCIDO_LIBERA)
    const idsCarteira = linhasCarteira.map(l => l.id)
    let idsComRetornoVencido = new Set()
    if (idsCarteira.length > 0) {
      const { data: lembretes } = await fetchPaginado((de, ate) => supabase.from('carteira_lembrete')
        .select('carteira_cliente_id, data_hora').eq('concluido', false).lt('data_hora', limite.toISOString())
        .in('carteira_cliente_id', idsCarteira).range(de, ate))
      idsComRetornoVencido = new Set((lembretes || []).map(l => l.carteira_cliente_id))
    }

    const mapa = {}
    for (const row of linhasCarteira) {
      const transferivel = STATUS_LIBERA_TRANSFERENCIA.includes(row.status) || idsComRetornoVencido.has(row.id)
      mapa[row.cnpj] = { consultorId: row.consultor_id, status: row.status, transferivel }
    }
    setDonoPorCnpj(mapa)
    return mapa
  }

  async function handleArquivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setNomeArquivo(file.name)
    setResultado(null)
    const donos = await carregarDonos()
    const brutas = await parseArquivo(file)
    const mapeadas = brutas.map(l => {
      const m = mapearCampos(l, ALIASES)
      const cnpj = extrairCnpj(m.razao_social_bloco)
      const razao_social = m.razao_social_bloco.split('\n')[0].trim()
      const contato_nome = m.contato_bloco.split('E-mail:')[0].trim()
      const contato_email = extrairEmail(m.contato_bloco)
      const contato_telefone = extrairTelefone(m.contato_bloco)
      const movelM17 = m.movel_m17 !== '' ? parseInt(m.movel_m17, 10) : null
      const dono = donos[cnpj]
      return {
        ...m,
        cnpj,
        razao_social,
        contato: [contato_nome, contato_email, contato_telefone].filter(Boolean).join(' · '),
        movel_m17: isNaN(movelM17) ? null : movelM17,
        donoAtual: dono?.consultorId || null,
        statusAtual: dono?.status || null,
        transferivel: dono?.transferivel || false,
      }
    }).filter(l => l.cnpj)
    setLinhas(mapeadas)
  }

  function statusLinha(l) {
    if (!l.donoAtual) return { texto: 'Novo', bloqueado: false }
    if (l.donoAtual === consultorId) return { texto: 'Já é deste consultor (atualiza)', bloqueado: false }
    const nomeDono = staff.find(s => s.id === l.donoAtual)?.nome || 'outro consultor'
    if (l.transferivel) {
      const motivo = STATUS_LIBERA_TRANSFERENCIA.includes(l.statusAtual) ? l.statusAtual : `retorno vencido há ${DIAS_RETORNO_VENCIDO_LIBERA}+ dias`
      return { texto: `Transferível — era de ${nomeDono} (${motivo})`, bloqueado: false, transferindo: true }
    }
    return { texto: `Bloqueado — já é de ${nomeDono}`, bloqueado: true }
  }

  async function importar() {
    if (!consultorId) return
    setImportando(true)
    setResultado(null)
    let criados = 0, atualizados = 0, transferidos = 0, comPotencial = 0, falhas = 0, bloqueados = 0
    const errosAmostra = []

    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]
      setProgresso(`Importando ${i + 1} de ${linhas.length}...`)

      const transferindo = l.donoAtual && l.donoAtual !== consultorId && l.transferivel
      if (l.donoAtual && l.donoAtual !== consultorId && !transferindo) { bloqueados++; continue }

      const observacoes = [
        l.trilha_produtos,
        l.valores_aparelhos && `Valores Aparelhos: ${l.valores_aparelhos}`,
        l.cidade && `Cidade: ${l.cidade}`,
        l.status && `Status CRM5: ${l.status}`,
      ].filter(Boolean).join('\n')

      // Cruza direto com o Mapa Parque pelo CNPJ (não depende do botão "Processar" ter rodado antes)
      const { data: parque } = await supabase.from('mapa_parque_import')
        .select('*').eq('nr_cnpj', l.cnpj).order('importado_em', { ascending: false }).limit(1).maybeSingle()
      const potencial = parque ? calcularPotencial(parque) : null
      if (potencial) comPotencial++
      // MÓVEL M17 do mailing é mais confiável que o rec_movel do Mapa Parque pra saber quantas linhas migrar
      const potencialMigracao = l.movel_m17 !== null ? l.movel_m17 : (potencial?.potencial_migracao || 0)
      // Valores Aparelhos do mailing é a mesma informação de Crédito Pré-aprovado — prioriza sobre o Mapa Parque
      const valorAparelho = paraValorReal(l.valores_aparelhos)
      const creditoFinal = valorAparelho !== null ? valorAparelho : (potencial?.credito_pre_aprovado || 0)

      // Se está transferindo, a linha existente está sob o dono antigo, não sob o novo consultor
      const { data: existente } = await supabase.from('carteira_cliente').select('id')
        .eq('cnpj', l.cnpj).eq('consultor_id', transferindo ? l.donoAtual : consultorId).maybeSingle()

      if (existente) {
        // Cliente já existe na carteira: não mexe em observações, razão social nem contato (o
        // que já foi registrado fica como está) — só atualiza o potencial, que é o dado que o
        // Mapa Parque traz de mais novo. Se está transferindo, muda o dono e reabre o status.
        const update = {
          ...(potencial || {}),
          potencial_migracao: potencialMigracao,
          credito_pre_aprovado: creditoFinal,
          excluido_em: null, excluido_por: null,
          atualizado_em: new Date().toISOString(),
        }
        if (transferindo) { update.consultor_id = consultorId; update.status = 'Aguardando Atendimento' }
        const { error } = await supabase.from('carteira_cliente').update(update).eq('id', existente.id)
        if (error) { falhas++; if (errosAmostra.length < 3) errosAmostra.push(error.message) } else {
          atualizados++
          if (transferindo) {
            transferidos++
            const nomeDonoAntigo = staff.find(s => s.id === l.donoAtual)?.nome || 'outro consultor'
            // Cliente muda de mão: histórico de interações do dono antigo não interessa pro
            // novo consultor, só a nota de transferência abaixo.
            await supabase.from('carteira_interacao').delete().eq('carteira_cliente_id', existente.id)
            await supabase.from('carteira_interacao').insert({
              carteira_cliente_id: existente.id, autor_id: consultorId,
              descricao: `Cliente transferido de ${nomeDonoAntigo} via importação (motivo: ${STATUS_LIBERA_TRANSFERENCIA.includes(l.statusAtual) ? l.statusAtual : `retorno vencido há ${DIAS_RETORNO_VENCIDO_LIBERA}+ dias`}).`,
            })
          }
        }
      } else {
        const { error } = await supabase.from('carteira_cliente').insert({
          cnpj: l.cnpj,
          razao_social: l.razao_social,
          contato: l.contato,
          consultor_id: consultorId,
          status: 'Aguardando Atendimento',
          origem: 'Mailing Diário',
          observacoes,
          potencial_migracao: potencialMigracao,
          potencial_bl: potencial?.potencial_bl || 0,
          potencial_ti: potencial?.potencial_ti || 0,
          potencial_voz: potencial?.potencial_voz || 0,
          credito_pre_aprovado: creditoFinal,
        })
        if (error) { falhas++; if (errosAmostra.length < 3) errosAmostra.push(error.message) } else criados++
      }
    }

    setImportando(false)
    setProgresso('')
    setResultado({ criados, atualizados, transferidos, comPotencial, semPotencial: linhas.length - comPotencial, falhas, errosAmostra, bloqueados })
    setLinhas([])
    setNomeArquivo('')
  }

  return (
    <div className="main">
      <div className="lm-section-title">Upload Mailing Diário</div>
      <details className="regras-toggle">
        <summary>Ver regras dessa importação</summary>
        <div className="regras-toggle-corpo">
          Sobe a lista de clientes do dia (export do CRM5) e atribui pro consultor escolhido abaixo. O potencial de cada cliente
          é cruzado direto com o Mapa Parque pelo CNPJ; se o CNPJ ainda não estiver no Mapa Parque, entra com potencial zerado.
          Cliente já na carteira de outro consultor fica bloqueado, exceto se estiver com status "Sem Contato Efetivo",
          "Sem Interesse" ou com retorno agendado vencido há {DIAS_RETORNO_VENCIDO_LIBERA}+ dias — nesses casos a transferência é liberada.
        </div>
      </details>

      <div className="kanban-toolbar">
        <select className="filter-select" value={consultorId} onChange={e => setConsultorId(e.target.value)}>
          <option value="">Selecione o consultor...</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.nome} ({s.perfil})</option>)}
        </select>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleArquivo} disabled={!consultorId} />
        {nomeArquivo && <span style={{ fontSize: 12, color: '#660099' }}>{nomeArquivo} — {linhas.length} linhas com CNPJ válido</span>}
      </div>
      {!consultorId && <div style={{ fontSize: 11, color: 'var(--vermelho)', marginTop: -8, marginBottom: 12 }}>Escolha o consultor antes de subir o arquivo.</div>}

      {linhas.length > 0 && (
        <>
          <div className="carteira-table-wrap" style={{ marginBottom: 12 }}>
            <table className="carteira-table">
              <thead><tr><th>CNPJ</th><th>Razão Social</th><th>Contato</th><th>Colaborador (arquivo, só referência)</th><th>Situação</th></tr></thead>
              <tbody>
                {linhas.slice(0, 30).map((l, i) => {
                  const st = statusLinha(l)
                  return (
                    <tr key={i} style={st.bloqueado ? { background: 'rgba(255,107,107,0.12)' } : st.transferindo ? { background: 'rgba(239,159,39,0.12)' } : {}}>
                      <td>{l.cnpj}</td><td>{l.razao_social}</td><td>{l.contato}</td><td>{l.colaborador}</td>
                      <td style={st.bloqueado ? { color: 'var(--vermelho)', fontWeight: 600 } : st.transferindo ? { color: 'var(--laranja)', fontWeight: 600 } : {}}>{st.texto}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button className="btn-save-obs" style={{ float: 'none' }} onClick={importar} disabled={importando || !consultorId}>
            {importando ? 'Importando...' : `Importar ${linhas.length} cliente(s) para ${staff.find(s => s.id === consultorId)?.nome || 'consultor selecionado'}`}
          </button>
        </>
      )}

      {progresso && <div style={{ fontSize: 11, color: 'rgba(245,241,250,0.55)', marginTop: 8 }}>{progresso}</div>}

      {resultado && (
        <div className="lm-resumo" style={{ marginTop: 16 }}>
          {resultado.criados} clientes novos, {resultado.atualizados} atualizados{resultado.transferidos > 0 && ` (${resultado.transferidos} transferidos de outro consultor)`}{resultado.bloqueados > 0 && `, ${resultado.bloqueados} bloqueados (já pertencem a outro consultor)`}. {resultado.comPotencial} já tinham dado do Mapa Parque, {resultado.semPotencial} entraram com potencial zerado (CNPJ ainda não está no Mapa Parque).
          {resultado.falhas > 0 && (
            <div className="login-erro" style={{ marginTop: 8 }}>
              {resultado.falhas} linha(s) falharam ao gravar. Exemplo(s): {resultado.errosAmostra.join(' | ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

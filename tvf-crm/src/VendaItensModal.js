import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// RM+TA e PC-TA (combo com aparelho) foram removidos de propósito: misturam receita de
// plano com receita de aparelho numa linha só, impossível separar depois no relatório.
// Pra negociação com aparelho junto, marca as duas linhas separadas (ex: RM + TA).
const SUBPRODUTOS = [
  'HA', 'PN', 'HP', 'BL', 'MT - BL', 'CPF FIBRA', 'CPF MÓVEL', 'MP - CPF MÓVEL',
  'RBL', 'RLF', 'RM', 'PP', 'DA', 'IN',
  'SVA', 'TEL', 'RTV', 'M2M', 'SIP', '0800', 'VVN', 'LINK', 'VIVO TECH', 'TV',
  'RA', 'TA', 'DIG', 'TT MÓVEL',
  'PC', 'TT / PF ou PJ x PJ / SOHO', 'SOS', 'TT AVANÇADO', 'TB', 'PN FIXA',
  'MT - TEL', 'SVA FIXO', 'MT - VVN', 'CPF FIXA', 'MT - CPF FIXA', 'CPF TV',
  'GUD', 'TER', 'SME',
]

// Renovação Móvel e Renovação Fixa — únicos subprodutos que são renovação de plano, nunca
// venda nova. Todo o resto é sempre "Novo". Tipo deixa de ser escolha manual, vira automático
// por subproduto.
const SUBPRODUTOS_RENOVACAO = ['RM', 'RBL', 'RLF']
const tipoDoSubproduto = (sub) => SUBPRODUTOS_RENOVACAO.includes(sub) ? 'Renovação' : 'Novo'

export default function VendaItensModal({ cliente, vendaId: vendaIdProp, onClose, onSaved }) {
  const [itens, setItens] = useState({}) // { [subproduto]: { marcado, tipo, quantidade, valor } }
  const [vendaId, setVendaId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')

  // se vendaId for passado (ex: clicou numa venda específica no Dashboard), edita ela direto.
  // senão, edita sempre a venda mais recente do cliente — se não existir nenhuma ainda (cliente
  // legado, ou primeira vez marcando produtos antes do status virar venda), cria uma.
  useEffect(() => {
    async function carregar() {
      let venda = null
      if (vendaIdProp) {
        venda = { id: vendaIdProp }
      } else {
        const { data: existente } = await supabase.from('carteira_venda').select('id')
          .eq('carteira_cliente_id', cliente.id).order('criado_em', { ascending: false }).limit(1).maybeSingle()
        if (existente) {
          venda = existente
        } else {
          const { data: nova } = await supabase.from('carteira_venda')
            .insert({ carteira_cliente_id: cliente.id, consultor_id: cliente.consultor_id, data_venda: cliente.data_venda || new Date().toISOString().slice(0, 10) })
            .select('id').single()
          venda = nova
        }
      }
      setVendaId(venda.id)
      const { data } = await supabase.from('carteira_venda_item').select('*').eq('carteira_venda_id', venda.id)
      const mapa = {}
      for (const it of (data || [])) {
        mapa[it.subproduto] = { marcado: true, tipo: it.tipo, quantidade: it.quantidade, valor: it.valor }
      }
      setItens(mapa)
      setLoading(false)
    }
    carregar()
  }, [cliente.id, cliente.consultor_id, cliente.data_venda, vendaIdProp])

  function toggle(sub) {
    setItens(prev => {
      const atual = prev[sub]
      if (atual?.marcado) {
        const { [sub]: _, ...resto } = prev
        return resto
      }
      return { ...prev, [sub]: { marcado: true, tipo: tipoDoSubproduto(sub), quantidade: 1, valor: 0 } }
    })
  }

  function atualizarItem(sub, campo, valor) {
    setItens(prev => ({ ...prev, [sub]: { ...prev[sub], [campo]: valor } }))
  }

  async function salvar() {
    setSalvando(true)
    // apaga só os itens dessa venda específica — não mexe no histórico de vendas anteriores
    await supabase.from('carteira_venda_item').delete().eq('carteira_venda_id', vendaId)
    const linhas = Object.entries(itens).map(([subproduto, v]) => ({
      carteira_venda_id: vendaId,
      carteira_cliente_id: cliente.id,
      subproduto,
      tipo: v.tipo,
      quantidade: Number(v.quantidade) || 1,
      valor: Number(v.valor) || 0,
    }))
    if (linhas.length > 0) await supabase.from('carteira_venda_item').insert(linhas)
    setSalvando(false)
    onSaved()
    onClose()
  }

  const selecionados = Object.entries(itens)
  const totalNovo = selecionados.filter(([, v]) => v.tipo === 'Novo').reduce((s, [, v]) => s + (Number(v.valor) || 0), 0)
  const totalRenovacao = selecionados.filter(([, v]) => v.tipo === 'Renovação').reduce((s, [, v]) => s + (Number(v.valor) || 0), 0)
  const qtdNovo = selecionados.filter(([, v]) => v.tipo === 'Novo').length
  const qtdRenovacao = selecionados.filter(([, v]) => v.tipo === 'Renovação').length

  // Une com chaves já salvas fora da lista atual (ex: RM+TA/PC-TA lançados antes de serem
  // removidos) — senão a linha antiga fica órfã, contando no total sem dar pra editar/apagar.
  const listaCompleta = Array.from(new Set([...SUBPRODUTOS, ...Object.keys(itens)]))
  const subprodutosFiltrados = listaCompleta.filter(s => s.toLowerCase().includes(busca.toLowerCase()))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lead-modal" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <div className="lm-header-left">
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Produtos Vendidos</div>
              <div className="lm-phone">{cliente.razao_social || cliente.cnpj}</div>
            </div>
          </div>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>

        {loading ? <div className="empty">Carregando...</div> : (
          <div className="lm-body">
            <input className="search-input" style={{ width: '100%' }} placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} />
            <div style={{ fontSize: 11, color: '#888', margin: '4px 0 8px' }}>
              Venda com aparelho junto (ex: RM + TA)? Marca as duas linhas separadas, cada uma com seu próprio valor.
            </div>

            <div className="lm-tipo-grid" style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {subprodutosFiltrados.map(sub => {
                const item = itens[sub]
                return (
                  <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #F0EAF8' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, cursor: 'pointer', fontSize: 12 }}>
                      <input type="checkbox" checked={!!item?.marcado} onChange={() => toggle(sub)} />
                      {sub}
                    </label>
                    {item?.marcado && (
                      <>
                        <span className={`tag ${item.tipo === 'Renovação' ? 'tag-ap' : 'tag-bl'}`} style={{ width: 110, textAlign: 'center' }}>{item.tipo}</span>
                        <input className="lm-input" type="number" min="1" style={{ width: 60 }} value={item.quantidade}
                          onChange={e => atualizarItem(sub, 'quantidade', e.target.value)} title="Quantidade" />
                        <input className="lm-input" type="number" step="0.01" style={{ width: 100 }} value={item.valor}
                          onChange={e => atualizarItem(sub, 'valor', e.target.value)} placeholder="R$" />
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="lm-resumo">
              Novo: {qtdNovo} item(ns) · {totalNovo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br />
              Renovação: {qtdRenovacao} item(ns) · {totalRenovacao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>

            <div className="lm-actions">
              <button className="btn-save-obs" style={{ flex: 1, float: 'none', margin: 0 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

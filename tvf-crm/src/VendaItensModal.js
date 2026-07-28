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

export default function VendaItensModal({ cliente, onClose, onSaved }) {
  const [itens, setItens] = useState({}) // { [subproduto]: { marcado, tipo, quantidade, valor } }
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    supabase.from('carteira_venda_item').select('*').eq('carteira_cliente_id', cliente.id)
      .then(({ data }) => {
        const mapa = {}
        for (const it of (data || [])) {
          mapa[it.subproduto] = { marcado: true, tipo: it.tipo, quantidade: it.quantidade, valor: it.valor }
        }
        setItens(mapa)
        setLoading(false)
      })
  }, [cliente.id])

  function toggle(sub) {
    setItens(prev => {
      const atual = prev[sub]
      if (atual?.marcado) {
        const { [sub]: _, ...resto } = prev
        return resto
      }
      return { ...prev, [sub]: { marcado: true, tipo: 'Novo', quantidade: 1, valor: 0 } }
    })
  }

  function atualizarItem(sub, campo, valor) {
    setItens(prev => ({ ...prev, [sub]: { ...prev[sub], [campo]: valor } }))
  }

  async function salvar() {
    setSalvando(true)
    await supabase.from('carteira_venda_item').delete().eq('carteira_cliente_id', cliente.id)
    const linhas = Object.entries(itens).map(([subproduto, v]) => ({
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

  const subprodutosFiltrados = SUBPRODUTOS.filter(s => s.toLowerCase().includes(busca.toLowerCase()))

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
                        <select className="filter-select" style={{ width: 110 }} value={item.tipo} onChange={e => atualizarItem(sub, 'tipo', e.target.value)}>
                          <option value="Novo">Novo</option>
                          <option value="Renovação">Renovação</option>
                        </select>
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

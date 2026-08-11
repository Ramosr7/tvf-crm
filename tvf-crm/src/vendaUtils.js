// Regra única de categorização de receita, usada em toda a plataforma (Dashboard, Relatórios,
// Potencial de Carteira, Kanban, modal de itens de venda): toda receita de venda tem que
// aparecer separada em Produto Novo / Renovação / Aparelho — nunca como um total misturado.
// Subproduto com "TA" no código é troca/aparelho — não conta como produto novo nem renovação
// de plano, é receita à parte, mesmo quando o item veio marcado com tipo "Novo".
export const SUBPRODUTOS_APARELHO = ['TA', 'RM+TA', 'PC-TA']

export function ehAparelho(item) {
  return SUBPRODUTOS_APARELHO.includes(item?.subproduto)
}

export function categoriaItem(item) {
  if (ehAparelho(item)) return 'aparelho'
  return item?.tipo === 'Renovação' ? 'renovacao' : 'novo'
}

// soma uma lista de itens de venda (carteira_venda_item), quebrada nas 3 categorias
export function splitReceita(itens) {
  return (itens || []).reduce((acc, it) => {
    const valor = Number(it.valor || 0)
    acc[categoriaItem(it)] += valor
    return acc
  }, { novo: 0, renovacao: 0, aparelho: 0 })
}

// Canal simples pra abrir o Joaozinho (Assistente.js, montado uma vez em App.js) já carregado
// com o contexto de um cliente específico, a partir de qualquer modal (Kanban, Potencial de
// Carteira) sem precisar passar prop por toda a árvore de componentes — não tem state
// management library no projeto, e esse evento cobre o único caso de comunicação entre
// componentes que não são pai/filho direto.
const EVENTO = 'joaozinho:abrir-com-cliente'

export function abrirJoaozinhoComCliente(contexto) {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: contexto }))
}

export function ouvirAberturaComCliente(callback) {
  const handler = (e) => callback(e.detail)
  window.addEventListener(EVENTO, handler)
  return () => window.removeEventListener(EVENTO, handler)
}

// Mesmo mapeamento cliente(+interações) → contexto em todo lugar que abre o Joaozinho com um
// cliente (Kanban, Potencial de Carteira) — pra não divergir o que cada tela manda.
export function montarContextoCliente(cliente, interacoes) {
  const ultimas = (interacoes || [])
    .slice(-5)
    .map(i => i.descricao)
    .filter(Boolean)
  return {
    razaoSocial: cliente.razao_social || null,
    cnpj: cliente.cnpj || null,
    status: cliente.status || null,
    temperatura: cliente.temperatura || null,
    potencialMigracao: cliente.potencial_migracao || 0,
    potencialBl: cliente.potencial_bl || 0,
    potencialTi: cliente.potencial_ti || 0,
    potencialVoz: cliente.potencial_voz || 0,
    creditoPreAprovado: cliente.credito_pre_aprovado || 0,
    observacoes: cliente.observacoes || null,
    ultimasInteracoes: ultimas,
  }
}

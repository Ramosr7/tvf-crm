// Lógica de cálculo de potencial a partir da carga bruta do Mapa Parque.
// Best-effort a partir da descrição da spec (sem o script Python original) —
// revisar contra a lógica python validada assim que disponível.

function contemPalavra(texto, palavras) {
  const t = String(texto || '').toLowerCase()
  return palavras.some(p => t.includes(p))
}

// Texto livre tipo "...oportunidade para aquisição de aparelhos com capacidade
// de pagamento de R$32987" ou "R$30.000" — extrai o valor numérico.
function extrairValorAparelho(texto) {
  const m = String(texto || '').match(/capacidade de pagamento de r\$\s*([\d.,]+)/i)
  if (!m) return 0
  let numStr = m[1]
  numStr = numStr.includes(',') ? numStr.replace(/\./g, '').replace(',', '.') : numStr.replace(/\./g, '')
  return parseFloat(numStr) || 0
}

export function calcularPotencial(row) {
  const recMovel = String(row.rec_movel || '')
  const movel = String(row.movel || '')
  const numMigracao = recMovel.match(/\d+/)
  // Aquisição de linhas novas (rec_movel tem número) soma o número; Renovação/Blindagem
  // (rec_movel sem número, mas indica renovação) conta o parque móvel total do cliente
  // (qt_movel_term) — os dois compõem o mesmo pilar.
  let potencial_migracao
  if (numMigracao) potencial_migracao = parseInt(numMigracao[0], 10)
  else if (contemPalavra(recMovel, ['renova']) || contemPalavra(movel, ['renova', 'blindagem'])) {
    potencial_migracao = Number(row.qt_movel_term) || 1
  }
  else potencial_migracao = 0

  const ofertas = [row.primeira_oferta, row.segunda_oferta, row.terceira_oferta].join(' ')

  const potencial_bl = (row.fixa_basica || contemPalavra(ofertas, ['banda larga', 'fixa basica', 'bl'])) ? 1 : 0
  const potencial_ti = (row.vivo_tech || contemPalavra(ofertas, ['vivo tech', 'oferta digital', 'digital'])) ? 1 : 0
  const potencial_voz = (row.avancados || row.vvn || contemPalavra(ofertas, ['avancado', 'avançado', 'vvn'])) ? 1 : 0

  const credito_pre_aprovado = (parseFloat(row.vl_car_movel) || 0) + (parseFloat(row.vl_car_fixa) || 0) + extrairValorAparelho(row.aparelhos)

  return { potencial_migracao, potencial_bl, potencial_ti, potencial_voz, credito_pre_aprovado }
}

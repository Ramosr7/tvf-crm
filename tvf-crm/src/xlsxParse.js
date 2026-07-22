import * as XLSX from 'xlsx'

const MARCADORES_CABECALHO = ['colaborador', 'nrcnpj', 'nmcliente', 'razaosocial', 'cnpj']

function normalizarCel(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

// Acha a linha real de cabeçalho: alguns exports (ex. print-to-xlsx) jogam lixo na linha 1
// e o cabeçalho de verdade só aparece depois. Procura nas primeiras 5 linhas.
function acharLinhaCabecalho(linhasBrutas) {
  for (let i = 0; i < Math.min(5, linhasBrutas.length); i++) {
    const normalizadas = linhasBrutas[i].map(normalizarCel)
    if (normalizadas.some(c => MARCADORES_CABECALHO.some(m => c.includes(m)))) return i
  }
  return 0
}

// Lê um File (csv/xlsx) e retorna array de linhas cruas: [{ 'Cabeçalho Original': valor, ... }]
// CSV é lido como texto UTF-8 (senão acentos viram lixo tipo "Ã"); XLSX/XLS mantém binário
// (formato zip/XML já é UTF-8 internamente, o parser do SheetJS decodifica sozinho).
export function parseArquivo(file) {
  const ehCsv = /\.csv$/i.test(file.name)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: ehCsv ? 'string' : 'binary' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const arrays = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
        const idxCabecalho = acharLinhaCabecalho(arrays)
        const cabecalho = arrays[idxCabecalho]
        const linhas = arrays.slice(idxCabecalho + 1).map(linha => {
          const obj = {}
          cabecalho.forEach((h, i) => { obj[h] = linha[i] ?? '' })
          return obj
        })
        resolve(linhas)
      } catch (err) { reject(err) }
    }
    if (ehCsv) reader.readAsText(file, 'UTF-8')
    else reader.readAsBinaryString(file)
  })
}

function normalizarChave(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

// Dado um objeto de linha crua e um mapa { campoDestino: [aliases possíveis] },
// acha a coluna da linha cujo cabeçalho normalizado bate com algum alias.
// Prioriza igualdade exata (evita, ex., "COD_CLIENTE" ganhar de "NM_CLIENTE" só por conter "cliente").
export function mapearCampos(linha, aliasesPorCampo) {
  const chavesNormalizadas = Object.keys(linha).map(k => ({ original: k, norm: normalizarChave(k) }))
  const resultado = {}
  for (const [campo, aliases] of Object.entries(aliasesPorCampo)) {
    const aliasesNorm = aliases.map(normalizarChave)
    const exato = chavesNormalizadas.find(k => aliasesNorm.includes(k.norm))
    const achado = exato || chavesNormalizadas.find(k => aliasesNorm.some(a => k.norm.includes(a)))
    resultado[campo] = achado ? String(linha[achado.original] ?? '').trim() : ''
  }
  return resultado
}

const CNPJ_REGEX = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/
export function extrairCnpj(texto) {
  const m = String(texto || '').match(CNPJ_REGEX)
  return m ? m[1].replace(/\D/g, '') : ''
}

const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/
export function extrairEmail(texto) {
  const m = String(texto || '').match(EMAIL_REGEX)
  return m ? m[0] : ''
}

const TELEFONE_REGEX = /(\(?\d{2}\)?\s?)?9?\d{4,5}-?\d{4}/
export function extrairTelefone(texto) {
  const m = String(texto || '').match(TELEFONE_REGEX)
  return m ? m[0].replace(/\D/g, '') : ''
}

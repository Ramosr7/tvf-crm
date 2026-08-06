const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_PROMPT = `Você extrai dados de um relatório PDF de "Pedidos" da TVF Telecom
(Vivo Empresas). É uma tabela com colunas: SEGUIMENTO, ORIGEM, EMPRESA, CNPJ, CLIENTE, VENDA,
COMPETÊNCIA, TRÂMITE, DATA TRÂMITE, TIPO DE VENDA, VENDEDOR (pode ter mais colunas à direita,
ignore essas).

Extraia TODA linha da tabela, de TODAS as páginas, com exatamente estes 3 campos por linha:
- cnpj: só os dígitos da coluna CNPJ (pode ter 11 dígitos se for CPF de pessoa física)
- tramite: o texto exato da coluna TRÂMITE, sem alterar nem resumir
- data_tramite: o texto exato da coluna DATA TRÂMITE (formato dd/mm/aaaa hh:mm), ou "" se vazio/"-"

Responda em JSON estrito, sem nenhum texto fora do JSON, nesse formato exato:
{"linhas": [{"cnpj": "...", "tramite": "...", "data_tramite": "..."}]}

Não pule nenhuma linha da tabela. Não invente CNPJ. O mesmo CNPJ pode aparecer várias vezes —
mantenha todas as ocorrências, cada uma é um histórico de trâmite diferente.`

function pareceRecusa(texto) {
  return texto.length < 300 && /i'?m sorry|i can'?t|desculpe.{0,20}n[aã]o posso|n[aã]o consigo (ler|acessar|processar)/i.test(texto)
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) {
    res.status(401).json({ error: 'Não autenticado' })
    return
  }

  const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    res.status(401).json({ error: 'Sessão inválida' })
    return
  }

  const supabaseComToken = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: staffRow } = await supabaseComToken.from('consultores_staff').select('perfil').eq('id', user.id).maybeSingle()
  if (staffRow?.perfil !== 'Gestor') {
    res.status(403).json({ error: 'Só o Gestor pode importar apuração.' })
    return
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY não configurada no servidor.' })
    return
  }

  const { pdfBase64, filename } = req.body || {}
  if (!pdfBase64) {
    res.status(400).json({ error: 'pdfBase64 obrigatório' })
    return
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await client.responses.create({
      model: 'gpt-4o',
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'input_file', filename: filename || 'apuracao.pdf', file_data: `data:application/pdf;base64,${pdfBase64}` },
            { type: 'input_text', text: 'Extraia todas as linhas da tabela, de todas as páginas, no formato JSON pedido.' },
          ],
        },
      ],
    })
    const texto = response.output_text || ''
    if (pareceRecusa(texto)) {
      res.status(422).json({ error: 'A IA não conseguiu ler esse PDF. Tenta exportar em Excel/CSV se o sistema de origem permitir, ou tenta de novo.' })
      return
    }
    const jsonLimpo = texto.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const dados = JSON.parse(jsonLimpo)
    res.status(200).json(dados)
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao ler o PDF' })
  }
}

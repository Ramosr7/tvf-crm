const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')

// O PDF não tem grade real por trás (cada célula empilha quantidade + R$ como texto/desenho),
// então em vez de tentar um parser de texto frágil, manda o PDF pra IA ler a tabela como
// imagem/documento e devolver os números estruturados.
const SYSTEM_PROMPT = `Você lê relatórios PDF "RADAR DIÁRIO GERENCIAL DE VENDA" da TVF Telecom.
Extraia SOMENTE a tabela "VENDAS COM ACEITE" (ignore completamente a tabela "VENDAS AGUARDANDO
ACEITE" e qualquer texto depois das tabelas). Ignore a linha "TOTAL" no fim da tabela.

Cada célula de produto tem dois números empilhados: quantidade (em cima) e valor em R$
(embaixo). Pra cada linha de SUPERVISOR, extraia os 8 pares quantidade/valor, na ordem das
colunas da tabela: APARELHO, HA|HP|PN (rótulo "MÓVEL"), RM|RM+TA (rótulo "RENOVAÇÃO MÓVEL"),
SVA|IN (rótulo "DIGITAL"), BL|MT-BL (rótulo "FIBRA"), RBL|RLF (rótulo "RENOVAÇÃO FIXA"),
VIVO TECH|VVN|MT-VVN SIP|LINK|0800 (rótulo "AVANÇADO"), MÓVEL|FIBRA|FIXA (rótulo "CPF").

Responda em JSON estrito, sem texto fora do JSON, nesse formato exato:
{
  "supervisores": [
    {
      "nome": "NOME DO SUPERVISOR EXATO COMO ESTÁ NA TABELA",
      "aparelho_qtd": 0, "aparelho_valor": 0,
      "ha_qtd": 0, "ha_valor": 0,
      "renovacao_movel_qtd": 0, "renovacao_movel_valor": 0,
      "digital_qtd": 0, "digital_valor": 0,
      "bl_qtd": 0, "bl_valor": 0,
      "renovacao_fixa_qtd": 0, "renovacao_fixa_valor": 0,
      "avancado_qtd": 0, "avancado_valor": 0,
      "cpf_qtd": 0, "cpf_valor": 0
    }
  ]
}
Números sempre puros (sem "R$", sem separador de milhar, ponto como decimal).`

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

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY não configurada no servidor.' })
    return
  }

  const { pdfBase64 } = req.body || {}
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
            { type: 'input_file', filename: 'radar.pdf', file_data: `data:application/pdf;base64,${pdfBase64}` },
            { type: 'input_text', text: 'Extraia a tabela "VENDAS COM ACEITE" desse relatório no formato JSON pedido.' },
          ],
        },
      ],
    })
    const texto = response.output_text || ''
    const jsonLimpo = texto.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const dados = JSON.parse(jsonLimpo)
    res.status(200).json(dados)
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao ler o PDF' })
  }
}

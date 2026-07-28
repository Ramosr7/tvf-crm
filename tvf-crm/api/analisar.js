const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_PROMPT = `Você é um analista comercial da TVF Telecom, parceiro Vivo Empresas.
Analise os dados de desempenho de consultores (vendas, rotina diária de atendimento e
resumo das interações com clientes) e escreva uma análise objetiva em português.
Pra cada consultor: destaque pontos fortes, riscos (clientes parados, sem interação,
metas abaixo do esperado) e recomendações concretas. Cite números reais dos dados.
Termine com um resumo geral da equipe. Evite generalidades vagas — seja específico.`

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

  const { dados } = req.body || {}
  if (!dados) {
    res.status(400).json({ error: 'dados obrigatório' })
    return
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Analise os dados abaixo:\n\n${JSON.stringify(dados, null, 2)}` },
      ],
    })
    const texto = completion.choices[0]?.message?.content || ''
    res.status(200).json({ analise: texto })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao chamar a IA' })
  }
}

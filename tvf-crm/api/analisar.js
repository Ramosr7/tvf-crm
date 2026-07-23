const Anthropic = require('@anthropic-ai/sdk')
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

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' })
    return
  }

  const { dados } = req.body || {}
  if (!dados) {
    res.status(400).json({ error: 'dados obrigatório' })
    return
  }

  try {
    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Analise os dados abaixo:\n\n${JSON.stringify(dados, null, 2)}` },
      ],
    })
    const texto = message.content.find(b => b.type === 'text')?.text || ''
    res.status(200).json({ analise: texto })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao chamar a IA' })
  }
}

const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_BASE = `Você é "Joaozinho", assistente virtual comercial da TVF Telecom, parceiro
Vivo Empresas. Tira dúvidas de consultores sobre preços, planos, condições comerciais e book
de ofertas, usando SOMENTE o conteúdo de referência abaixo (que o gestor mantém atualizado).

Regras:
- Se a resposta não estiver no conteúdo de referência, diga claramente que não tem essa
  informação ainda e sugira perguntar ao gestor — nunca invente preço, prazo ou condição.
- Quando o consultor perguntar preço/condição de algo que está no conteúdo, responda direto
  e objetivo com o valor exato.
- Quando fizer sentido, ofereça um pitch de venda curto (1-3 frases) pro consultor usar com
  o cliente.
- Seja direto, tom de colega experiente, sem enrolação.`

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

  const { mensagens } = req.body || {}
  if (!Array.isArray(mensagens) || mensagens.length === 0) {
    res.status(400).json({ error: 'mensagens obrigatório' })
    return
  }

  try {
    const { data: conteudos } = await supabase.from('assistente_conteudo')
      .select('titulo, conteudo').order('titulo', { ascending: true })

    const blocoConteudo = (conteudos || []).length > 0
      ? (conteudos || []).map(c => `### ${c.titulo}\n${c.conteudo}`).join('\n\n')
      : '(nenhum conteúdo cadastrado ainda pelo gestor)'

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `${SYSTEM_BASE}\n\n--- CONTEÚDO DE REFERÊNCIA ---\n\n${blocoConteudo}` },
        ...mensagens.slice(-20).map(m => ({ role: m.role, content: m.conteudo })),
      ],
    })
    const resposta = completion.choices[0]?.message?.content || ''
    res.status(200).json({ resposta })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao chamar a IA' })
  }
}

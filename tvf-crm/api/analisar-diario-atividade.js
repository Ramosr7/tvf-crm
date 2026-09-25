const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_PROMPT = `Você é um mentor de gestão comercial analisando o relatório de atividades
de UM dia de trabalho de um gestor comercial (supervisor de equipe de vendas da TVF Telecom /
Vivo Empresas). Recebe o texto extraído de um PDF com as atividades do dia. Dá um feedback
objetivo, curto e direto, baseado só no que está escrito no texto — nunca invente número, tarefa
ou resultado que não apareça. Estrutura a resposta em 3 blocos, sem markdown de título (só texto
corrido separado por linha em branco):
1. Pontos fortes do dia (o que teve volume/qualidade real).
2. O que ficou de fora ou fraco (lacuna, tarefa que não apareceu, pouco volume).
3. Prioridade sugerida pro próximo dia (1 a 2 ações concretas, não genéricas).
Responde só com o feedback, sem saudação nem comentário sobre ter recebido o texto.`

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
    res.status(403).json({ error: 'Só o Gestor pode usar essa análise.' })
    return
  }

  const { texto } = req.body || {}
  if (!texto || typeof texto !== 'string' || !texto.trim()) {
    res.status(400).json({ error: 'texto obrigatório' })
    return
  }
  if (texto.length > 20000) {
    res.status(400).json({ error: 'Texto extraído do PDF passou de 20000 caracteres.' })
    return
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: texto },
      ],
    })
    const feedback = completion.choices?.[0]?.message?.content?.trim() || ''
    res.status(200).json({ feedback })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao gerar feedback' })
  }
}

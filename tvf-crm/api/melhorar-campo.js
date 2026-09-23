const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')

// Melhora a redação de UM campo de texto (Gestão Comercial) sem mudar fato, número ou
// informação — só clareza/gramática/tom profissional. Nunca inventa dado novo.
const SYSTEM_PROMPT = `Você melhora a redação de um campo de formulário de gestão comercial
(feedback, plano de ação, roteiro de reunião). Regras rígidas:
- Mantenha TODO fato, número, nome e informação exatamente como está — não invente, não
  remova, não generalize nada que foi escrito.
- Só melhora clareza, gramática, pontuação e tom profissional.
- Não alonga o texto artificialmente — se o original é curto e direto, o melhorado continua
  curto e direto, só mais bem escrito.
- Responde SOMENTE o texto melhorado, sem aspas, sem comentário, sem explicação antes ou
  depois.`

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

  const { texto } = req.body || {}
  if (!texto || !texto.trim()) {
    res.status(400).json({ error: 'texto obrigatório' })
    return
  }
  if (texto.length > 4000) {
    res.status(400).json({ error: 'Texto grande demais pra melhorar de uma vez.' })
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
    const melhorado = completion.choices[0]?.message?.content?.trim() || texto
    res.status(200).json({ melhorado })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao melhorar o texto' })
  }
}

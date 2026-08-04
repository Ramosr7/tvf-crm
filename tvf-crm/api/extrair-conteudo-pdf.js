const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_PROMPT = `Você transcreve documentos comerciais (book de ofertas, tabela de
preço, regras comerciais) da TVF Telecom / Vivo Empresas pro formato texto/markdown, mantendo
TODOS os preços, planos, condições e regras exatamente como estão no documento — não resuma,
não invente, não corrija número nenhum. Tabelas viram tabelas markdown. Esse texto vira base
de conhecimento de um assistente de IA pra consultores, então precisão é mais importante que
concisão. Responda só com o texto transcrito, sem comentário extra.`

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

  // sem repassar o token, RLS enxerga role "anon" e a policy "só vê o próprio cadastro"
  // (que depende de auth.uid()) não resolve nada — sempre bloquearia o Gestor por engano
  const supabaseComToken = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: staffRow } = await supabaseComToken.from('consultores_staff').select('perfil').eq('id', user.id).maybeSingle()
  if (staffRow?.perfil !== 'Gestor') {
    res.status(403).json({ error: 'Só o Gestor pode alimentar o assistente.' })
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
            { type: 'input_file', filename: filename || 'documento.pdf', file_data: `data:application/pdf;base64,${pdfBase64}` },
            { type: 'input_text', text: 'Transcreva esse documento pro formato pedido.' },
          ],
        },
      ],
    })
    res.status(200).json({ conteudo: response.output_text || '' })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao ler o PDF' })
  }
}

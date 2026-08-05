const { createClient } = require('@supabase/supabase-js')

// proxy entre o CRM (Vercel) e o worker de WhatsApp (VPS) — o navegador nunca fala direto com
// o worker, só o backend do CRM, que guarda o token secreto do worker
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

  if (!process.env.WHATSAPP_WORKER_URL || !process.env.WHATSAPP_WORKER_TOKEN) {
    res.status(500).json({ error: 'Worker de WhatsApp não configurado (WHATSAPP_WORKER_URL / WHATSAPP_WORKER_TOKEN).' })
    return
  }

  const { telefone, conteudo } = req.body || {}
  if (!telefone || !conteudo) {
    res.status(400).json({ error: 'telefone e conteudo obrigatórios' })
    return
  }

  try {
    const resp = await fetch(`${process.env.WHATSAPP_WORKER_URL}/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WHATSAPP_WORKER_TOKEN}` },
      body: JSON.stringify({ consultorId: user.id, telefone, conteudo }),
    })
    const dados = await resp.json()
    res.status(resp.status).json(dados)
  } catch (err) {
    res.status(502).json({ error: `Não consegui falar com o worker: ${err.message}` })
  }
}

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

  const { jobId } = req.body || {}
  if (!jobId) {
    res.status(400).json({ error: 'jobId obrigatório' })
    return
  }

  const { data: job, error: jobError } = await supabaseComToken.from('assistente_upload_job').select('*').eq('id', jobId).maybeSingle()
  if (jobError || !job) {
    res.status(404).json({ error: 'Job não encontrado' })
    return
  }
  if (job.status === 'concluido') {
    res.status(200).json({ status: 'concluido', conteudo: job.conteudo_extraido })
    return
  }
  if (!job.storage_path) {
    // job criado antes da migration que trocou base64-na-coluna por Storage — não tem mais
    // como recuperar o arquivo, precisa subir de novo
    const msg = 'Esse upload é de antes de uma atualização do sistema e não pode mais ser retomado. Descarta e sobe o arquivo de novo.'
    await supabaseComToken.from('assistente_upload_job').update({ status: 'erro', erro_msg: msg }).eq('id', jobId)
    res.status(410).json({ error: msg })
    return
  }

  await supabaseComToken.from('assistente_upload_job').update({ status: 'processando' }).eq('id', jobId)

  try {
    const { data: arquivo, error: dlError } = await supabaseComToken.storage.from('assistente-uploads').download(job.storage_path)
    if (dlError || !arquivo) throw new Error(dlError?.message || 'Não achei o arquivo no Storage')
    const base64 = Buffer.from(await arquivo.arrayBuffer()).toString('base64')

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await client.responses.create({
      model: 'gpt-4o',
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'input_file', filename: job.filename || 'documento.pdf', file_data: `data:application/pdf;base64,${base64}` },
            { type: 'input_text', text: 'Transcreva esse documento pro formato pedido.' },
          ],
        },
      ],
    })
    const texto = response.output_text || ''
    const pareceRecusa = texto.length < 300 && /i'?m sorry|i can'?t|desculpe.{0,20}n[aã]o posso|n[aã]o consigo (ler|acessar|processar)/i.test(texto)
    if (!texto.trim() || pareceRecusa) {
      const msg = 'A IA não conseguiu ler esse PDF (pode estar protegido, ser imagem escaneada de baixa qualidade, ou o conteúdo não ficou claro). Tenta outro arquivo ou cola o texto direto.'
      await supabaseComToken.from('assistente_upload_job').update({ status: 'erro', erro_msg: msg }).eq('id', jobId)
      res.status(422).json({ error: msg })
      return
    }

    await supabaseComToken.from('assistente_upload_job')
      .update({ status: 'concluido', conteudo_extraido: texto, concluido_em: new Date().toISOString() }).eq('id', jobId)
    res.status(200).json({ status: 'concluido', conteudo: texto })
  } catch (err) {
    const msg = err.message || 'Erro ao ler o PDF'
    await supabaseComToken.from('assistente_upload_job').update({ status: 'erro', erro_msg: msg }).eq('id', jobId)
    res.status(500).json({ error: msg })
  }
}

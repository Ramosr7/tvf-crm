const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')
const pdfParse = require('pdf-parse')
const { PDFDocument } = require('pdf-lib')

const SYSTEM_PROMPT = `Você transcreve um TRECHO de um documento comercial (book de ofertas,
tabela de preço, regras comerciais) da TVF Telecom / Vivo Empresas pro formato texto/markdown,
mantendo TODOS os preços, planos, condições e regras exatamente como estão — não resuma, não
invente, não corrija número nenhum. Tabelas viram tabelas markdown. Esse texto vira base de
conhecimento de um assistente de IA pra consultores, então precisão é mais importante que
concisão. Se uma página não tiver conteúdo comercial relevante (capa, divisória, imagem
decorativa), pode escrever só "(sem conteúdo relevante)" pra essa página. Responda só com o
texto transcrito, sem comentário extra.`

// fatias pequenas (fallback só pra PDF escaneado/sem texto): reduz timeout e recusa da IA em
// decks grandes/pesados de imagem, e cada fatia falha isolada sem derrubar o documento inteiro
const PAGINAS_POR_FATIA = 6
// abaixo disso por página, considera que não tem texto real embutido (PDF escaneado/imagem)
const MIN_CHARS_POR_PAGINA = 15

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
    res.status(403).json({ error: 'Só o Gestor pode alimentar o assistente.' })
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

  try {
    const { data: arquivo, error: dlError } = await supabaseComToken.storage.from('assistente-uploads').download(job.storage_path)
    if (dlError || !arquivo) throw new Error(dlError?.message || 'Não achei o arquivo no Storage')
    const bytesOriginais = new Uint8Array(await arquivo.arrayBuffer())

    // caminho rápido: extrai o texto real embutido no PDF direto, sem IA nenhuma — mais
    // rápido, de graça, e sem risco de a IA "inventar" ou trocar um preço na transcrição
    if (job.paginas_processadas === 0 && !job.conteudo_extraido) {
      const resultado = await pdfParse(Buffer.from(bytesOriginais))
      const totalPaginas = resultado.numpages || 1
      if (resultado.text && resultado.text.length >= totalPaginas * MIN_CHARS_POR_PAGINA) {
        await supabaseComToken.from('assistente_upload_job').update({
          status: 'concluido', conteudo_extraido: resultado.text, total_paginas: totalPaginas,
          paginas_processadas: totalPaginas, concluido_em: new Date().toISOString(),
        }).eq('id', jobId)
        res.status(200).json({ status: 'concluido', conteudo: resultado.text })
        return
      }
      // texto insuficiente (PDF escaneado/imagem) — cai pro fallback de IA por fatias abaixo
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(500).json({ error: 'PDF parece ser imagem escaneada (sem texto), e OPENAI_API_KEY não está configurada pra ler por IA.' })
      return
    }

    const pdfOriginal = await PDFDocument.load(bytesOriginais)
    const totalPaginas = job.total_paginas || pdfOriginal.getPageCount()

    let paginasProcessadas = job.paginas_processadas || 0
    let conteudoAcumulado = job.conteudo_extraido || ''

    await supabaseComToken.from('assistente_upload_job')
      .update({ status: 'processando', total_paginas: totalPaginas }).eq('id', jobId)

    const inicio = paginasProcessadas
    const fim = Math.min(inicio + PAGINAS_POR_FATIA, totalPaginas)

    const fatiaDoc = await PDFDocument.create()
    const indices = Array.from({ length: fim - inicio }, (_, i) => inicio + i)
    const paginasCopiadas = await fatiaDoc.copyPages(pdfOriginal, indices)
    paginasCopiadas.forEach(p => fatiaDoc.addPage(p))
    const fatiaBytes = await fatiaDoc.save()
    const fatiaBase64 = Buffer.from(fatiaBytes).toString('base64')

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await client.responses.create({
      model: 'gpt-4o',
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'input_file', filename: job.filename || 'documento.pdf', file_data: `data:application/pdf;base64,${fatiaBase64}` },
            { type: 'input_text', text: `Transcreva essas páginas (${inicio + 1} a ${fim} de ${totalPaginas} do documento original) pro formato pedido.` },
          ],
        },
      ],
    })
    const textoFatia = response.output_text || ''
    const trechoFinal = pareceRecusa(textoFatia)
      ? `[Páginas ${inicio + 1}-${fim}: não foi possível ler essa parte]`
      : textoFatia

    conteudoAcumulado += `${conteudoAcumulado ? '\n\n' : ''}## Páginas ${inicio + 1}-${fim}\n${trechoFinal}`
    paginasProcessadas = fim

    if (paginasProcessadas >= totalPaginas) {
      await supabaseComToken.from('assistente_upload_job').update({
        status: 'concluido', conteudo_extraido: conteudoAcumulado, paginas_processadas: paginasProcessadas,
        concluido_em: new Date().toISOString(),
      }).eq('id', jobId)
      res.status(200).json({ status: 'concluido', conteudo: conteudoAcumulado })
    } else {
      await supabaseComToken.from('assistente_upload_job').update({
        status: 'processando', conteudo_extraido: conteudoAcumulado, paginas_processadas: paginasProcessadas,
      }).eq('id', jobId)
      res.status(200).json({ status: 'parcial', progresso: `${paginasProcessadas}/${totalPaginas}`, conteudo: conteudoAcumulado })
    }
  } catch (err) {
    const msg = err.message || 'Erro ao ler o PDF'
    await supabaseComToken.from('assistente_upload_job').update({ status: 'erro', erro_msg: msg }).eq('id', jobId)
    res.status(500).json({ error: msg })
  }
}

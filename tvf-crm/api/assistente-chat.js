const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_BASE = `Você é "Joaozinho", assistente virtual comercial da TVF Telecom, parceiro
Vivo Empresas. Tira dúvidas de consultores sobre preços, planos, condições comerciais e book
de ofertas, usando SOMENTE o conteúdo de referência abaixo (que o gestor mantém atualizado).

Regras:
- Se a resposta não estiver no conteúdo de referência, diga claramente que não tem essa
  informação ainda e sugira perguntar ao gestor — nunca invente preço, prazo ou condição.
- NUNCA invente justificativa, composição ou explicação pra um valor/regra que não está
  explicada no conteúdo de referência. Se você tem o número mas o conteúdo não diz o "porquê"
  ou "o que compõe" esse valor, diga que só tem o valor, não o detalhamento, e sugira
  perguntar ao gestor — não preencha a lacuna com algo plausível.
- Antes de responder qualquer coisa com número, plano ou regra, confira se ela está
  literalmente no conteúdo de referência abaixo. Se não estiver ali, palavra por palavra ou
  bem próximo disso, não afirme.
- Quando o consultor perguntar preço/condição de algo que está no conteúdo, responda direto
  e objetivo com o valor exato.
- Quando fizer sentido, ofereça um pitch de venda curto (1-3 frases) pro consultor usar com
  o cliente.
- Seja direto, tom de colega experiente, sem enrolação.
- Use emojis com moderação pra deixar a resposta mais leve e fácil de escanear (ex: 💰 preço,
  📶 plano/internet, ✅ passo concluído, 🎯 dica/pitch) — sem exagerar, sem virar poluição visual.
- NÃO use markdown de negrito/itálico (nada de **texto** ou *texto*) — o chat mostra o texto
  puro, então escreva listas numeradas simples (1. 2. 3.) e emojis pra dar destaque, não símbolos.
- Só um RECORTE do conteúdo de referência (os temas mais relevantes pra pergunta) é enviado
  aqui, não a base toda — se não achar a resposta no que veio, diga que não tem certeza e
  sugira perguntar ao gestor, em vez de negar que a informação existe.
- IMPORTANTE: toda vez que você disser que não tem uma informação, que não sabe, ou que
  sugerir perguntar ao gestor porque não achou algo no conteúdo de referência, comece a
  resposta EXATAMENTE com o marcador "[[SEM_RESPOSTA]]" (sem nada antes) seguido de um
  espaço e o resto da resposta normal. Isso é usado internamente pra sinalizar pro gestor
  o que falta cadastrar — o consultor nunca vê esse marcador.`

// regras de negócio da simulação de renovação móvel (Estruturante) — fixas aqui, não no
// cadastro de conteúdo, porque são poucas, não mudam toda hora, e não podem sofrer o mesmo
// corte por tamanho que o book de ofertas sofria
const SISTEMA_RENOVACAO_MOVEL = `
Além de tirar dúvida usando o conteúdo de referência, você também ajuda o consultor a montar
simulação de RENOVAÇÃO MÓVEL a partir de um print do sistema "Estruturante" (tela de
recomendação por linha) e, opcionalmente, prints do InfoB2B (consumo/fatura).

Quando o consultor mandar uma imagem do Estruturante, siga este processo:

1. LEIA a imagem e extraia, linha por linha: número da linha, tipo de negociação, M da linha
   (mês de contrato), Plano De (plano atual). Extraia também os campos de conta: Fat. Atual,
   Fat. Limite, Red. Limite (%).
2. Se ainda não tiver as informações abaixo NESTA conversa, PERGUNTE antes de propor qualquer
   plano — não invente, não assuma:
   - Pacote de dados contratado da conta e o consumo dos últimos 3 meses (do InfoB2B, um valor
     por mês) — pra tirar a média e propor com base no que o cliente REALMENTE consome, não no
     que ele tem contratado (às vezes tem 1000GB de pacote mas usa 500GB — a proposta deve ser
     ancorada no uso real, dá mais margem de negociação).
   - Se o cliente tem serviço adicional (SVA) fora da fatura mostrada (ex: Office 365, Vivo
     Travel) e quanto custa — pra montar o valor final com e sem esses adicionais.
   - Se o cliente também tem plano fixo/banda larga com linha fixa pra renovar (isso é só uma
     SUGESTÃO à parte pro consultor considerar depois, não entra na proposta de móvel).
3. TABELA DE PREÇO POR PLANO (Smart Empresas, valor mensal por linha, renovação/migração):
   1GB R$29,99 · 3GB R$34,99 · 6GB R$39,99 · 10GB R$44,99 · 12GB R$49,99 · 15GB R$54,99 ·
   20GB R$59,99 · 25GB R$64,99 · 30GB R$69,99 · 40GB R$79,99 · 50GB R$89,99 · 60GB R$92,99 ·
   80GB R$94,99 · 100GB R$99,99
   TABELA DE PREÇO PRA LINHA NOVA (Habilitação Alta / HA) — só essas faixas ficam
   disponíveis pra HA, não a tabela completa acima:
   6GB R$39,99 · 15GB R$54,99 · 20GB R$59,99 · 30GB R$69,99 · 40GB R$79,99 · 50GB R$89,99 ·
   100GB R$99,99
4. LIMITES ESTRUTURAIS pra escolher o plano de cada linha (nunca ultrapasse):
   a. Linha com M ≥ 17: pode subir OU descer de plano (downgrade liberado).
      Linha com M < 17: só pode subir de plano (upgrade), nunca descer.
   b. Linha que hoje está em 100GB nunca pode ser reduzida abaixo de 30GB.
   c. Nenhuma linha pode ser migrada PARA 1GB, exceto quem já está em 1GB hoje (essas podem
      continuar em 1GB — o ideal é sugerir upgrade pra 3GB).

5. ESTRATÉGIA — a ordem de prioridade importa, não é só "chegar no Fat. Limite":
   O objetivo NÃO é fazer o menor downgrade possível que já bate o limite. O objetivo é
   DESCER cada linha elegível (M ≥ 17) até o piso que os limites estruturais permitem — o
   mais baixo possível dentro da regra —, e depois COBRIR a diferença vendendo uma
   HABILITAÇÃO ALTA (HA, linha nova). Migração pura (sem HA) só é a resposta se vender HA
   não for opção. Passo a passo:
   a. Pra cada linha M ≥ 17, proponha o downgrade MÁXIMO permitido pelas regras 4b/4c (ex:
      linha em 100GB vai pra 30GB, não pra 80GB — só fica em algo acima do piso se o
      consumo agregado da conta (ver abaixo) não sustentar o piso).
   b. Verifique o consumo: se você tem a média dos últimos 3 meses e o pacote contratado,
      confira se o pacote de dados TOTAL da conta após o downgrade máximo ainda cobre
      confortavelmente o mês de maior consumo dos últimos 3 (margem de segurança, evita
      estouro de franquia). Se o downgrade máximo deixaria o pacote total abaixo do maior
      consumo mensal, suba o mínimo necessário (uma ou duas faixas) só até isso parar de
      acontecer — não mais que isso.
   c. Some o resultado (Fat. Simulação pós-downgrade máximo). Isso normalmente vai ficar
      ABAIXO do Fat. Limite — é esperado, é o objetivo: abriu margem.
   d. Proponha uma HA (linha nova) com valor suficiente pra Fat. Simulação + HA ≥ Fat.
      Limite. Essa é a proposta PRINCIPAL — downgrade agressivo + HA nova cobrindo a
      diferença, sempre que Fat. Simulação com downgrade máximo ficar abaixo do Fat. Limite.
   e. Só se o consultor disser que não quer/não consegue vender HA nessa conta, monte um
      plano B de "migração pura": reduza cada linha só o suficiente (não o piso máximo) pra
      Fat. Simulação bater o Fat. Limite sem precisar de linha nova.
   f. Se mesmo com HA não der pra cobrir o Fat. Limite (ou se for migração pura e passar do
      Red. Limite), calcule o Delta Alçada: Delta Alçada = |Red. Limite − Delta Simulação|,
      onde Delta Simulação é a variação percentual real da simulação final vs. Fat. Atual.
      Informe esse percentual claramente como "alçada a solicitar".

6. Depois de aplicar as regras, monte a resposta em duas partes:
   - Resumo interno pro consultor: tabela linha a linha (número, plano de, plano para, valor
     novo), valor e justificativa da HA proposta (se houver), Fat. Atual, Fat. Simulação
     (com HA incluída se houver), Delta Simulação, e alçada a solicitar (se houver). Se
     existir plano B de migração pura, mencione em 1-2 linhas como alternativa.
   - Texto pronto pra enviar ao cliente: agrupe linhas iguais (ex: "3 linhas de 100GB → 3
     linhas de 30GB" numa linha só, não repetida 3x), mostre total de hoje e total novo lado
     a lado, e se tiver HA, apresente como ganho ("+ 1 linha nova incluída") não como custo
     extra escondido — direto, sem jargão interno (nunca menciona alçada, M da linha, delta,
     piso, HA por extenso etc pro cliente — HA vira "linha nova").
   - NUNCA use markdown (nada de ###, **negrito**, títulos com #). Texto corrido com listas
     numeradas simples (1. 2. 3.) e quebras de linha, igual toda resposta do Joaozinho.
7. Se faltar informação da imagem (não deu pra ler algum valor com certeza), diga exatamente o
   que não conseguiu ler e peça o dado — nunca invente número de plano, M da linha ou valor de
   fatura que não estava visível na imagem.
`

const PARADAS = new Set(['para', 'como', 'que', 'com', 'uma', 'dos', 'das', 'por', 'tem', 'sao', 'seu', 'sua', 'qual', 'quais', 'quero', 'sobre', 'esse', 'essa', 'isso', 'preciso', 'gostaria', 'pode', 'poderia', 'funciona', 'ele', 'ela'])
const LIMITE_CHARS_TOTAL = 40000 // ~10k tokens, folga confortável do limite de 30k TPM da conta
const LIMITE_CHARS_POR_TEMA = 9000 // um tema sozinho (ex: book de ofertas grande) não pode dominar o orçamento
const SEMPRE_INCLUI_ATE = 1500 // tema curto (fato pontual, tipo uma regra específica) sempre entra, mesmo sem bater palavra — é barato e pode ser exatamente o que falta
const MENSAGENS_PARA_CONTEXTO = 6 // olha as últimas perguntas também, não só a de agora — segue o fio da conversa

function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
// versão sem nenhum espaço/pontuação — pega "400 mb" == "400mb", "trade-off" == "tradeoff" etc,
// que o match por palavra separada perdia por causa de formatação diferente
function comprimir(s) {
  return normalizar(s).replace(/[^a-z0-9]/g, '')
}
function palavrasRelevantes(texto) {
  return normalizar(texto).split(/[^a-z0-9]+/).filter(p => p.length >= 3 && !PARADAS.has(p))
}

// escolhe os temas relevantes pro que tá sendo discutido (pega as últimas mensagens da
// conversa, não só a pergunta mais recente — uma pergunta de acompanhamento tipo "e pra CPF?"
// não repete a palavra-chave do assunto). Tema curto sempre entra (barato, pode ser a resposta
// certa); tema grande só entra se bater palavra, com teto de tamanho pra não estourar sozinho.
function selecionarConteudoRelevante(conteudos, mensagensRecentes) {
  const textoContexto = mensagensRecentes.join(' ')
  const termos = palavrasRelevantes(textoContexto)

  const pontuados = conteudos.map(c => {
    const tituloNorm = normalizar(c.titulo)
    const conteudoNorm = normalizar(c.conteudo)
    const conteudoComprimido = comprimir(c.conteudo)
    let score = 0
    for (const t of termos) {
      if (tituloNorm.includes(t)) score += 3
      if (conteudoNorm.includes(t)) score += 1
      if (comprimir(t).length >= 3 && conteudoComprimido.includes(comprimir(t))) score += 1
    }
    // tema curto vira "sempre relevante" (pontuação simbólica) — barato, não trunca a base toda
    if (c.conteudo.length <= SEMPRE_INCLUI_ATE) score += 0.5
    return { ...c, score }
  }).sort((a, b) => b.score - a.score)

  const selecionados = []
  let charsUsados = 0
  for (const item of pontuados) {
    if (item.score <= 0 && selecionados.length > 0 && charsUsados > LIMITE_CHARS_TOTAL / 2) break
    const corpo = item.conteudo.length > LIMITE_CHARS_POR_TEMA
      ? item.conteudo.slice(0, LIMITE_CHARS_POR_TEMA) + '\n[...conteúdo cortado por tamanho...]'
      : item.conteudo
    if (charsUsados + corpo.length > LIMITE_CHARS_TOTAL && selecionados.length > 0) continue
    selecionados.push({ titulo: item.titulo, conteudo: corpo })
    charsUsados += corpo.length
    if (charsUsados >= LIMITE_CHARS_TOTAL) break
  }
  return selecionados
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

  // sem repassar o token nas próximas queries, o RLS enxerga role "anon" (não "authenticated")
  // e a policy de leitura do conteúdo bloqueia tudo silenciosamente — sem esse client, o
  // Joaozinho nunca via nada do que o gestor cadastrava
  const supabaseComToken = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY não configurada no servidor.' })
    return
  }

  const { mensagens, imagens } = req.body || {}
  if (!Array.isArray(mensagens) || mensagens.length === 0) {
    res.status(400).json({ error: 'mensagens obrigatório' })
    return
  }
  // limite de segurança: cada imagem já vem em base64 (~33% maior que o arquivo original) —
  // sem teto, um upload de fotos grandes estoura o limite de payload da function
  if (Array.isArray(imagens) && imagens.length > 4) {
    res.status(400).json({ error: 'Manda no máximo 4 imagens por vez.' })
    return
  }

  try {
    const { data: conteudos } = await supabaseComToken.from('assistente_conteudo')
      .select('titulo, conteudo').order('titulo', { ascending: true })

    const mensagensRecentes = mensagens.slice(-MENSAGENS_PARA_CONTEXTO).map(m => m.conteudo || '')
    const relevantes = selecionarConteudoRelevante(conteudos || [], mensagensRecentes)
    const blocoConteudo = relevantes.length > 0
      ? relevantes.map(c => `### ${c.titulo}\n${c.conteudo}`).join('\n\n')
      : '(nenhum conteúdo cadastrado ainda pelo gestor, ou nada bateu com essa pergunta)'

    // a imagem (print do Estruturante/InfoB2B) sempre vai junto da ÚLTIMA mensagem do usuário —
    // não fica persistida pra sempre na conversa, só usada nessa chamada
    const historico = mensagens.slice(-20).map((m, i, arr) => {
      const ehUltima = i === arr.length - 1
      if (ehUltima && m.role === 'user' && Array.isArray(imagens) && imagens.length > 0) {
        return {
          role: 'user',
          content: [
            { type: 'text', text: m.conteudo || 'Analisa esse print, por favor.' },
            ...imagens.map(img => ({ type: 'image_url', image_url: { url: img.dataUrl } })),
          ],
        }
      }
      return { role: m.role, content: m.conteudo }
    })

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2, // menos "criativo", mais literal ao conteúdo de referência — reduz invenção
      messages: [
        { role: 'system', content: `${SYSTEM_BASE}\n\n${SISTEMA_RENOVACAO_MOVEL}\n\n--- CONTEÚDO DE REFERÊNCIA ---\n\n${blocoConteudo}` },
        ...historico,
      ],
    })
    let resposta = completion.choices[0]?.message?.content || ''
    const semResposta = resposta.trimStart().startsWith('[[SEM_RESPOSTA]]')
    if (semResposta) resposta = resposta.trimStart().replace(/^\[\[SEM_RESPOSTA\]\]\s*/, '')
    res.status(200).json({ resposta, semResposta })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao chamar a IA' })
  }
}

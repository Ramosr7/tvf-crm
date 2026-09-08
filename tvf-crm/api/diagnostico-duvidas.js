const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_PROMPT = `Você é um analista comercial sênior da TVF Telecom, parceiro Vivo
Empresas. Recebe uma lista de mensagens que consultores mandaram pro assistente virtual
"Joaozinho" ao longo do tempo (sem identificação de quem perguntou — só o texto). Tem dois
tipos misturados na lista: dúvida de conteúdo (preço, plano, condição) e objeção de cliente
relatada pelo consultor (ex: "cliente disse que achou caro"). Sua tarefa é montar um
DIAGNÓSTICO pro gestor, separando os dois tipos, com esta estrutura:

1. Dúvidas recorrentes (preço/plano/processo) — os assuntos que mais aparecem, com contagem
   aproximada, e o que isso revela sobre onde a equipe trava.
2. Objeções recorrentes de cliente — os motivos de recusa/hesitação que mais se repetem entre
   consultores DIFERENTES (isso é sinal de mercado, não de um cliente isolado) — quais
   objeções aparecem mais e se já existe uma resposta padrão boa pra elas ou se é uma lacuna.
3. Lacunas de conteúdo — pergunta ou objeção que sugere que falta algo cadastrado na base do
   Joaozinho (tema que aparece mas provavelmente não tem resposta boa hoje).
4. Plano de ação sugerido — 3 a 5 ações concretas pro gestor (treinamento, reforço de
   conteúdo, script de quebra de objeção pra cadastrar, mudança de processo) baseadas no que
   os dados mostram.

Seja concreto e ancorado nas mensagens reais recebidas — não generalize vago. Se a lista for
pequena ou repetitiva, diga isso também, sem inflar conclusão.`

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
    res.status(403).json({ error: 'Só o Gestor pode gerar o diagnóstico.' })
    return
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY não configurada no servidor.' })
    return
  }

  const { perguntas } = req.body || {}
  if (!Array.isArray(perguntas) || perguntas.length === 0) {
    res.status(400).json({ error: 'Nenhuma pergunta no período pra analisar.' })
    return
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const listaTexto = perguntas.slice(0, 500).map((p, i) => `${i + 1}. ${p}`).join('\n')
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Aqui estão as perguntas (${perguntas.length} no total, sem identificação de quem perguntou):\n\n${listaTexto}` },
      ],
    })
    const diagnostico = completion.choices[0]?.message?.content || ''
    res.status(200).json({ diagnostico })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao gerar diagnóstico' })
  }
}

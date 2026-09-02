const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_PROMPT = `Você é um analista comercial sênior da TVF Telecom, parceiro Vivo Empresas,
fazendo uma análise minuciosa de desempenho da equipe pro gestor. Você recebe dados de
vendas, rotina diária de atendimento e resumo das interações com clientes (o texto literal
de cada interação registrada, quando disponível).

Pra CADA consultor, escreva uma seção com:
1. Postura e produtividade — o que os números de rotina (atendimentos, retornos, ag. aceite)
   e o padrão de interação registrada revelam sobre como esse consultor está trabalhando
   (constante vs. picos isolados, reativo vs. proativo, cumprindo cadência de contato ou não).
2. Qualidade da interação, não só quantidade — leia o TEXTO literal de cada interação da
   amostra e avalie se é registro real e específico (menciona o que o cliente disse, objeção,
   próximo passo combinado) ou se é genérico/copiado (a mesma frase repetida em cliente
   diferente, texto vago tipo "tentei contato" sem nada de conteúdo). Interação genérica em
   série é sinal de estar só "batendo cartão" pra não aparecer sem contato, não de atendimento
   de verdade — aponte isso explicitamente quando notar o padrão, com exemplo do texto.
3. Atrasado, e por quê — os dados já separam "retorno agendado que venceu" (esqueceu um
   compromisso assumido com o cliente) de "ficou tempo demais sem contato nenhum" (nem tentou).
   São problemas diferentes: o primeiro é falha de organização/disciplina, o segundo pode ser
   carteira grande demais ou prioridade errada. Não trate os dois como a mesma coisa.
4. Status da carteira — clientes parados, negociações que esfriaram; leia o texto das
   interações pra apontar sinais concretos (objeção repetida, promessa não cumprida, cliente
   sumiu), não só contar quantidade.
5. Resultado — vendas (produto novo vs. renovação vs. aparelho, quando os dados vierem
   separados), citando números reais.
6. Plano de ação INDIVIDUAL — de 2 a 4 ações concretas e específicas pra esse consultor
   pelos próximos dias, priorizadas pelo que mais destrava venda.

No final, escreva um "Plano de Ação Coletivo": de 3 a 5 ações pra equipe como um todo
(processo, cadência, treinamento, redistribuição de carteira) pra impulsionar as vendas,
baseadas em padrões que se repetem entre vários consultores — não repita o que já foi dito
individualmente, sintetize o que é sistêmico.

Seja direto e específico, sempre ancorado nos números e nos textos reais recebidos. Nunca
invente dado que não veio no payload. Evite generalidades vagas tipo "pode melhorar o
atendimento" sem dizer o quê, quando e como.

Se o gestor mandar um "Pedido específico", ele é a prioridade — responda ele primeiro e de
forma direta, antes do resto da estrutura acima. Se os dados enviados não derem pra responder
esse pedido (ex: perguntou algo de um escopo que não foi marcado, tipo vendas sem os dados de
vendas terem vindo), diga isso claramente e sugira marcar o escopo certo — não generalize nem
responda com base em suposição.`

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

  const { dados } = req.body || {}
  if (!dados) {
    res.status(400).json({ error: 'dados obrigatório' })
    return
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const sistema = dados.foco ? `${SYSTEM_PROMPT}\n\nFoco pedido pelo gestor: ${dados.foco}` : SYSTEM_PROMPT
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: `Analise os dados abaixo:\n\n${JSON.stringify(dados, null, 2)}` },
      ],
    })
    const texto = completion.choices[0]?.message?.content || ''
    res.status(200).json({ analise: texto })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao chamar a IA' })
  }
}

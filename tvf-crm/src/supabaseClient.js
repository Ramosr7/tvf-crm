import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Supabase/PostgREST corta em 1000 linhas por request por padrão. Qualquer busca que possa
// passar disso (carteira_cliente já passou de 1000 ativos) precisa paginar com .range() —
// senão trunca silenciosamente e some cliente sem erro nenhum.
// `montarQuery(inicio, fim)` deve devolver a query já com .range(inicio, fim) aplicado.
export async function fetchPaginado(montarQuery) {
  let tudo = []
  let inicio = 0
  while (true) {
    const { data, error } = await montarQuery(inicio, inicio + 999)
    if (error) return { data: null, error }
    tudo = tudo.concat(data || [])
    if (!data || data.length < 1000) break
    inicio += 1000
  }
  return { data: tudo, error: null }
}

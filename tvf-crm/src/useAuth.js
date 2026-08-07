import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    // onAuthStateChange dispara de novo (TOKEN_REFRESHED) toda vez que a aba volta a ficar
    // visível, mesmo com o mesmo usuário logado — sem esse filtro, o setSession(sess) com um
    // objeto novo recriava a sessão inteira e o efeito abaixo recarregava tudo do zero, dando
    // a impressão de "F5 automático" ao trocar de aba.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(prev => (prev?.user?.id === sess?.user?.id ? prev : sess))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id

  useEffect(() => {
    if (!userId) { setStaff(null); setLoading(false); return }
    setLoading(true)
    supabase.from('consultores_staff').select('id, nome, perfil').eq('id', userId).single()
      .then(({ data, error }) => {
        if (error) console.error('Erro ao buscar consultores_staff:', error)
        setStaff(data)
        setLoading(false)
      })
  }, [userId])

  return {
    session,
    user: staff,
    perfil: staff?.perfil || null,
    loading,
    signOut: () => supabase.auth.signOut(),
  }
}

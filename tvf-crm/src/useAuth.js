import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setStaff(null); setLoading(false); return }
    setLoading(true)
    supabase.from('consultores_staff').select('id, nome, perfil').eq('id', session.user.id).single()
      .then(({ data, error }) => {
        if (error) console.error('Erro ao buscar consultores_staff:', error)
        setStaff(data)
        setLoading(false)
      })
  }, [session])

  return {
    session,
    user: staff,
    perfil: staff?.perfil || null,
    loading,
    signOut: () => supabase.auth.signOut(),
  }
}

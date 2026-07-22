import React, { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setEntrando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setEntrando(false)
    if (error) setErro('E-mail ou senha inválidos')
  }

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={entrar}>
        <div className="login-logo">TVF <span>TELECOM</span> · CRM</div>
        <div className="lm-field-edit">
          <label>E-mail</label>
          <input className="lm-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="lm-field-edit" style={{ marginTop: 10 }}>
          <label>Senha</label>
          <input className="lm-input" type="password" value={senha} onChange={e => setSenha(e.target.value)} required />
        </div>
        {erro && <div className="login-erro">{erro}</div>}
        <button className="btn-save-obs" type="submit" style={{ float: 'none', width: '100%', marginTop: 16, padding: '9px 0' }} disabled={entrando}>
          {entrando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

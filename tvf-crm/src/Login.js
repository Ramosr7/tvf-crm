import React, { useState } from 'react'
import { supabase } from './supabaseClient'

const FEATURES = [
  {
    titulo: 'Gestão de Clientes', texto: 'Relacionamentos de valor',
    icone: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" /><circle cx="17" cy="8" r="2.4" /><path d="M15.5 12.2c2.6.3 4.5 2 4.5 4.8" /></svg>
    ),
  },
  {
    titulo: 'Performance', texto: 'Dados que geram resultados',
    icone: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 17l5-5 4 4 8-8" /><path d="M14 8h6v6" /></svg>
    ),
  },
  {
    titulo: 'Segurança', texto: 'Informações protegidas',
    icone: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>
    ),
  },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [verSenha, setVerSenha] = useState(false)
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
    <div className="login-wrap" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/assets/login-hero.jpg)` }}>
        <div className="login-esquerda">
          <img src="/assets/login-logo.png" alt="TVF Telecom" className="login-topo-logo" />
          <div className="login-titulo">CRM <span>Comercial TVF</span></div>
          <div className="login-subtitulo">Conectando pessoas, tecnologia e soluções.</div>

          <form onSubmit={entrar} className="login-form">
            <div className="login-input-wrap">
              <svg className="login-input-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" /></svg>
              <input type="email" placeholder="Login de rede" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="login-input-wrap">
              <svg className="login-input-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
              <input type={verSenha ? 'text' : 'password'} placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} required />
              <button type="button" className="login-olho" onClick={() => setVerSenha(v => !v)} aria-label={verSenha ? 'Esconder senha' : 'Mostrar senha'}>
                {verSenha ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12s3.5-6.5 9-6.5 9 6.5 9 6.5-3.5 6.5-9 6.5S3 12 3 12z" /><circle cx="12" cy="12" r="2.6" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3l18 18" /><path d="M9.9 5.1A9.4 9.4 0 0 1 12 5c5.5 0 9 6.5 9 6.5a15 15 0 0 1-3.2 3.9M6.6 6.6C4.4 8.1 3 10.5 3 12s3.5 6.5 9 6.5c1.4 0 2.7-.3 3.8-.8" /><path d="M9.5 9.6a2.6 2.6 0 0 0 3.7 3.7" /></svg>
                )}
              </button>
            </div>

            {erro && <div className="login-erro">{erro}</div>}

            <button type="submit" className="login-btn" disabled={entrando}>
              {entrando ? 'Entrando...' : 'Acessar sistema'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </form>

          <div className="login-seguro"><span /> Acesso seguro e integrado
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /></svg>
          <span /></div>

          <div className="login-features">
            {FEATURES.map(f => (
              <div key={f.titulo} className="login-feature">
                <div className="login-feature-icone">{f.icone}</div>
                <div>
                  <div className="login-feature-titulo">{f.titulo}</div>
                  <div className="login-feature-texto">{f.texto}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="login-rodape">Versão 6.0.0 &nbsp;|&nbsp; TVF Telecom &amp; TI</div>
        </div>
    </div>
  )
}

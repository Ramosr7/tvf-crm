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
      <div className="login-card">
        <div className="login-hero">
          <div className="login-hero-marca">TVF</div>
          <div className="login-hero-grid" />
          <div className="login-hero-conteudo">
            <div className="login-hero-badge">// GESTÃO COMERCIAL</div>
            <div className="login-hero-titulo">Toda a carteira.<br />Um único painel.</div>
            <p className="login-hero-texto">
              Clientes, negociações e indicadores de venda centralizados — pensado pra operação
              comercial da TVF Telecom rodar sem fricção.
            </p>
            <ul className="login-hero-lista">
              <li><span className="login-hero-lista-icone">◉</span>Carteira de clientes em tempo real</li>
              <li><span className="login-hero-lista-icone">▲</span>Kanban de temperatura da negociação</li>
              <li><span className="login-hero-lista-icone">▮▯</span>Indicadores de venda por consultor</li>
              <li><span className="login-hero-lista-icone">◈</span>Joaozinho, assistente comercial por IA</li>
            </ul>
          </div>
        </div>

        <form className="login-box" onSubmit={entrar}>
          <div className="login-logo-wrap">
            <img src="/assets/logo-tvf.png" alt="TVF Telecom" className="login-logo-img" />
          </div>
          <div className="login-box-badge">// ACESSO CRM</div>
          <div className="login-box-titulo">Acesse sua conta</div>
          <div className="lm-field-edit" style={{ marginTop: 18 }}>
            <label>E-mail</label>
            <input className="lm-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="lm-field-edit" style={{ marginTop: 10 }}>
            <label>Senha</label>
            <input className="lm-input" type="password" value={senha} onChange={e => setSenha(e.target.value)} required />
          </div>
          {erro && <div className="login-erro">{erro}</div>}
          <button className="btn-save-obs" type="submit" style={{ float: 'none', width: '100%', marginTop: 18, padding: '10px 0' }} disabled={entrando}>
            {entrando ? 'Entrando...' : 'Entrar na plataforma →'}
          </button>
          <div className="login-box-rodape"><span className="login-box-rodape-icone">⌁</span> Acesso seguro e monitorado</div>
        </form>
      </div>
    </div>
  )
}

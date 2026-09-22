import React, { useState, useEffect, useRef } from 'react'

// Ícone "?" pequeno ao lado do rótulo de qualquer campo — clica e mostra exemplo de
// preenchimento/dica. Usado em todo formulário da Gestão Comercial (Feedback, Indicadores,
// Matriz de Performance, Plano Comercial, Mapeamento de Processos).
//
// O balão usa position:fixed com a posição calculada na hora do clique (getBoundingClientRect
// do botão), não position:absolute — muitos desses formulários vivem dentro de
// .carteira-table-wrap / .kanban-toolbar, que têm overflow-x:auto pra rolar tabela/toolbar
// horizontalmente; um balão absolute seria cortado por essa mesma rolagem. Fixed escapa disso
// sempre, não importa onde o campo esteja.
export default function CampoAjuda({ texto }) {
  const [aberto, setAberto] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const balaoRef = useRef(null)

  function abrir() {
    const r = btnRef.current.getBoundingClientRect()
    const largura = 260
    // não deixa o balão vazar pela direita da tela
    const left = Math.min(r.left, window.innerWidth - largura - 12)
    setPos({ top: r.bottom + 6, left: Math.max(8, left) })
    setAberto(true)
  }

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e) {
      if (btnRef.current?.contains(e.target) || balaoRef.current?.contains(e.target)) return
      setAberto(false)
    }
    function aoApertarEsc(e) { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoApertarEsc)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoApertarEsc)
    }
  }, [aberto])

  return (
    <span className="campo-ajuda-wrap">
      <button type="button" ref={btnRef} className="campo-ajuda-btn" title="Exemplo de preenchimento"
        onClick={() => (aberto ? setAberto(false) : abrir())}>?</button>
      {aberto && (
        <div ref={balaoRef} className="campo-ajuda-balao" style={{ top: pos.top, left: pos.left }}>
          {texto}
        </div>
      )}
    </span>
  )
}

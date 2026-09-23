import React, { useState } from 'react'
import { supabase } from './supabaseClient'

// Ícone de estrela desenhado (não emoji, de propósito) — mesmo espírito visual do resto do
// módulo depois da limpeza de emoji.
const IconeEstrela = ({ girando }) => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" className={girando ? 'melhorar-ia-icone girando' : 'melhorar-ia-icone'}>
    <path d="M12 2l1.8 5.6L19.4 9.4l-4.6 3.3L16.4 19 12 15.5 7.6 19l1.6-6.3L4.6 9.4l5.6-1.8z" />
  </svg>
)

// Botão "melhorar com IA" ao lado de campo de texto — reescreve o que já foi digitado,
// deixando mais claro/profissional, sem mudar fato nenhum.
//
// Dois jeitos de usar:
// - campo controlado (state): passa `valor` (string) + `onMelhorado(novoTexto)`.
// - campo não-controlado (defaultValue/onBlur, como o roteiro de reunião): passa `campoRef`
//   (ref pro textarea/input) em vez de `valor` — lê o texto atual direto do DOM na hora do
//   clique, escreve o resultado de volta no elemento e ainda chama onMelhorado(novoTexto)
//   pra quem chama poder salvar do mesmo jeito que salva um onBlur normal.
export default function MelhorarIA({ valor, campoRef, onMelhorado, titulo = 'Melhorar redação com IA' }) {
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)

  async function melhorar() {
    const texto = (campoRef ? campoRef.current?.value : valor || '').trim()
    if (!texto || carregando) return
    setCarregando(true)
    setErro(false)
    try {
      const { data: sessao } = await supabase.auth.getSession()
      const resp = await fetch('/api/melhorar-campo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao?.session?.access_token}` },
        body: JSON.stringify({ texto }),
      })
      const dados = await resp.json()
      if (!resp.ok) throw new Error(dados.error || 'Erro ao melhorar')
      if (campoRef && campoRef.current) campoRef.current.value = dados.melhorado
      onMelhorado(dados.melhorado)
    } catch (e) {
      setErro(true)
      setTimeout(() => setErro(false), 2500)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <button type="button" className="melhorar-ia-btn" onClick={melhorar} disabled={carregando} title={titulo}>
      <IconeEstrela girando={carregando} />
      {carregando ? 'Melhorando...' : erro ? 'Erro — tenta de novo' : 'Melhorar com IA'}
    </button>
  )
}

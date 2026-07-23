import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { PILARES_LEMBRETE } from './sondagens'

function formatDataHora(str) {
  return new Date(str).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function NotificacoesSino({ user }) {
  const [lembretes, setLembretes] = useState([])
  const [aberto, setAberto] = useState(false)

  const carregar = useCallback(async () => {
    const agora = new Date().toISOString()
    const { data } = await supabase.from('carteira_lembrete')
      .select('*, carteira_cliente(razao_social, cnpj)')
      .eq('concluido', false)
      .lte('data_hora', agora)
      .order('data_hora', { ascending: true })
    setLembretes(data || [])
  }, [])

  useEffect(() => {
    carregar()
    const intervalo = setInterval(carregar, 60000)
    return () => clearInterval(intervalo)
  }, [carregar])

  async function concluir(id) {
    await supabase.from('carteira_lembrete').update({ concluido: true }).eq('id', id)
    carregar()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn-filter" onClick={() => setAberto(v => !v)}>
        🔔{lembretes.length > 0 && ` ${lembretes.length}`}
      </button>
      {aberto && (
        <div className="sino-dropdown">
          <div className="sino-titulo">Retornos pendentes</div>
          {lembretes.length === 0 && <div className="empty" style={{ padding: '16px 0' }}>Nenhum retorno pendente</div>}
          {lembretes.map(l => {
            const pilarInfo = PILARES_LEMBRETE.find(p => p.key === l.pilar)
            return (
              <div key={l.id} className="sino-item">
                <div style={{ fontWeight: 700 }}>{l.carteira_cliente?.razao_social || l.carteira_cliente?.cnpj}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{formatDataHora(l.data_hora)} · {pilarInfo?.label || l.pilar}</div>
                {pilarInfo && <div className="sino-sondagem">{pilarInfo.sondagem}</div>}
                {l.nota && <div style={{ fontSize: 12, marginTop: 4 }}>{l.nota}</div>}
                <button className="btn-action" style={{ marginTop: 6 }} onClick={() => concluir(l.id)}>✓ Concluir</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

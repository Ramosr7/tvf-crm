import React, { useState } from 'react'
import { supabase } from './supabaseClient'
import { PILARES_LEMBRETE } from './sondagens'

function agoraLocalISO() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function LembreteModal({ cliente, user, onClose, onSalvo }) {
  const [pilar, setPilar] = useState(PILARES_LEMBRETE[0].key)
  const [dataHora, setDataHora] = useState(agoraLocalISO())
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)

  const pilarInfo = PILARES_LEMBRETE.find(p => p.key === pilar)

  async function salvar(e) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await supabase.from('carteira_lembrete').insert({
      carteira_cliente_id: cliente.id,
      data_hora: new Date(dataHora).toISOString(),
      pilar,
      nota,
      autor_id: user.id,
    })
    setSalvando(false)
    if (!error) onSalvo()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lead-modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <div className="lm-header-left">
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Agendar Retorno</div>
              <div className="lm-phone">{cliente.razao_social || cliente.cnpj}</div>
            </div>
          </div>
          <button className="lm-close" onClick={onClose}>✕</button>
        </div>

        <form className="lm-body" onSubmit={salvar}>
          <div className="lm-field-edit">
            <label>Produto / Pilar a ofertar</label>
            <select className="filter-select" style={{ width: '100%' }} value={pilar} onChange={e => setPilar(e.target.value)}>
              {PILARES_LEMBRETE.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>

          {pilarInfo && (
            <div className="lm-resumo">{pilarInfo.sondagem}</div>
          )}

          <div className="lm-field-edit">
            <label>Data e hora do retorno</label>
            <input className="lm-input" type="datetime-local" value={dataHora} onChange={e => setDataHora(e.target.value)} required />
          </div>

          <div className="lm-field-edit">
            <label>Nota (opcional)</label>
            <textarea className="obs-area" rows={2} value={nota} onChange={e => setNota(e.target.value)} placeholder="Algo específico pra lembrar..." />
          </div>

          <button className="btn-save-obs" style={{ float: 'none', width: '100%' }} type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Agendar'}
          </button>
        </form>
      </div>
    </div>
  )
}

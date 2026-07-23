import React, { useState } from 'react'
import UploadMapaParque from './UploadMapaParque'
import UploadMailingDiario from './UploadMailingDiario'

export default function Importar({ user }) {
  const opcoes = [
    { key: 'mailing', label: 'Mailing (clientes do dia)', restrito: false },
    { key: 'mapa_parque', label: 'Mapa Parque', restrito: true },
  ].filter(o => !o.restrito || user.perfil === 'Gestor')

  const [aba, setAba] = useState(opcoes[0].key)

  return (
    <div className="main">
      <div className="tabs">
        {opcoes.map(o => (
          <div key={o.key} className={`tab ${aba === o.key ? 'active' : ''}`} onClick={() => setAba(o.key)}>{o.label}</div>
        ))}
      </div>
      {aba === 'mailing' && <UploadMailingDiario />}
      {aba === 'mapa_parque' && user.perfil === 'Gestor' && <UploadMapaParque />}
    </div>
  )
}

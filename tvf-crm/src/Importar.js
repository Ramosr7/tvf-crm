import React, { useState } from 'react'
import UploadMapaParque from './UploadMapaParque'
import UploadMailingDiario from './UploadMailingDiario'
import UploadRenovacaoAntecipada from './UploadRenovacaoAntecipada'
import UploadRadarPdf from './UploadRadarPdf'
import AssistenteConteudo from './AssistenteConteudo'
import UploadApuracaoVendas from './UploadApuracaoVendas'

const OPCOES = [
  {
    key: 'mailing', label: 'Recarga Carteira (Diária)', restrito: false, icone: '↻',
    descricao: 'Sobe a lista de clientes do dia e distribui pro consultor escolhido.',
  },
  {
    key: 'mapa_parque', label: 'Banco de Dados (Mapa Parque)', restrito: true, icone: '⛁',
    descricao: 'Base de referência com o potencial de cada CNPJ, cruzada por CNPJ no restante do sistema.',
  },
  {
    key: 'renovacao_antecipada', label: 'Ação Antecipada (M16)', restrito: true, icone: '⏱',
    descricao: 'Sinaliza cliente já elegível pra renovação antes do fim do contrato atual.',
  },
  {
    key: 'backlog_pc', label: 'Backlog Mensal (PC)', restrito: true, icone: '▤',
    descricao: 'Carga mensal do backlog por vertical, base de partida do Plano Comercial.',
  },
  {
    key: 'radar_pdf', label: 'Atualização PC (Radar Gerencial)', restrito: true, icone: '◎',
    descricao: 'Atualização diária da esteira do Plano Comercial a partir do Radar Gerencial de Venda.',
  },
  {
    key: 'apuracao_vendas', label: 'Apuração Pedidos', restrito: true, icone: '✓',
    descricao: 'Reconcilia a venda registrada no CRM com o status real de ativação do pedido.',
  },
  {
    key: 'assistente', label: 'Conhecimento Joaozinho IA', restrito: true, icone: '◈',
    descricao: 'Base de conhecimento comercial que o assistente virtual usa pra responder a equipe.',
  },
]

export default function Importar({ user }) {
  const opcoes = OPCOES.filter(o => !o.restrito || user.perfil === 'Gestor')
  const [aba, setAba] = useState(opcoes[0].key)
  const ativa = opcoes.find(o => o.key === aba) || opcoes[0]

  return (
    <div className="main">
      <div className="importar-banner">
        <div className="importar-banner-icon">{ativa.icone}</div>
        <div>
          <div className="importar-banner-crumb">Importar</div>
          <div className="importar-banner-titulo">{ativa.label}</div>
          <div className="importar-banner-sub">{ativa.descricao}</div>
        </div>
      </div>

      <div className="importar-shell">
        <div className="importar-sidebar">
          <div className="importar-sidebar-titulo">Operações</div>
          <div className="importar-sidebar-sub">Escolha uma importação</div>
          {opcoes.map(o => (
            <div key={o.key} className={`importar-sidebar-item ${aba === o.key ? 'active' : ''}`} onClick={() => setAba(o.key)}>
              <span className="importar-sidebar-item-icone">{o.icone}</span>{o.label}
            </div>
          ))}
        </div>

        <div className="importar-conteudo">
          {aba === 'mailing' && <UploadMailingDiario />}
          {aba === 'mapa_parque' && user.perfil === 'Gestor' && <UploadMapaParque />}
          {aba === 'renovacao_antecipada' && user.perfil === 'Gestor' && <UploadRenovacaoAntecipada />}
          {aba === 'backlog_pc' && user.perfil === 'Gestor' && <UploadRadarPdf modo="backlog" />}
          {aba === 'radar_pdf' && user.perfil === 'Gestor' && <UploadRadarPdf modo="esteira" />}
          {aba === 'apuracao_vendas' && user.perfil === 'Gestor' && <UploadApuracaoVendas />}
          {aba === 'assistente' && user.perfil === 'Gestor' && <AssistenteConteudo user={user} />}
        </div>
      </div>
    </div>
  )
}

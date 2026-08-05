-- Central de Conversas — WhatsApp de dentro do CRM. Cada consultor conecta o próprio número
-- via QR Code (worker separado, fora do Vercel, rodando num VPS). O worker usa a service role
-- key (bypassa RLS) pra gravar mensagem recebida/enviada; as policies abaixo controlam o que
-- o FRONTEND (consultor logado, via RLS normal) enxerga.

create table if not exists whatsapp_sessao (
    consultor_id uuid primary key references consultores_staff(id),
    status text not null default 'desconectado' check (status in ('desconectado', 'aguardando_qr', 'conectado', 'erro')),
    numero text,
    qr_code text,
    erro_msg text,
    atualizado_em timestamptz default now()
);

create table if not exists whatsapp_conversa (
    id uuid primary key default gen_random_uuid(),
    consultor_id uuid not null references consultores_staff(id),
    carteira_cliente_id uuid references carteira_cliente(id),
    telefone text not null,
    nome_contato text,
    ultima_mensagem text,
    ultima_mensagem_em timestamptz,
    nao_lidas integer not null default 0,
    criado_em timestamptz default now(),
    unique (consultor_id, telefone)
);

create table if not exists whatsapp_mensagem (
    id uuid primary key default gen_random_uuid(),
    conversa_id uuid not null references whatsapp_conversa(id) on delete cascade,
    direcao text not null check (direcao in ('enviada', 'recebida')),
    tipo text not null default 'texto' check (tipo in ('texto', 'imagem', 'audio', 'documento', 'video', 'outro')),
    conteudo text,
    midia_url text,
    status_envio text default 'enviado' check (status_envio in ('pendente', 'enviado', 'entregue', 'lido', 'erro')),
    criado_em timestamptz default now()
);

create index if not exists idx_whatsapp_conversa_consultor on whatsapp_conversa(consultor_id);
create index if not exists idx_whatsapp_mensagem_conversa on whatsapp_mensagem(conversa_id, criado_em);

alter table whatsapp_sessao enable row level security;
alter table whatsapp_conversa enable row level security;
alter table whatsapp_mensagem enable row level security;

create policy "consultor_ve_propria_sessao" on whatsapp_sessao for select using (consultor_id = auth.uid());
create policy "consultor_ve_propria_conversa" on whatsapp_conversa for select using (consultor_id = auth.uid());
create policy "consultor_atualiza_propria_conversa" on whatsapp_conversa for update using (consultor_id = auth.uid());

create policy "consultor_ve_propria_mensagem_wa" on whatsapp_mensagem for select using (
    exists (select 1 from whatsapp_conversa c where c.id = conversa_id and c.consultor_id = auth.uid())
);

create policy "gestor_ve_toda_sessao" on whatsapp_sessao for select using (is_gestor());
create policy "gestor_ve_toda_conversa" on whatsapp_conversa for select using (is_gestor());
create policy "gestor_ve_toda_mensagem_wa" on whatsapp_mensagem for select using (is_gestor());

-- Supervisor ganha as mesmas permissões de Gestor no banco (ver toda a equipe,
-- inserir/atualizar carteira de qualquer consultor) — necessário pro Supervisor
-- conseguir usar o Upload Mailing. A função is_gestor() é usada em todas as
-- policies "gestor vê/edita tudo", então um único ajuste aqui resolve em todo lugar.

create or replace function is_gestor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from consultores_staff where id = auth.uid() and perfil in ('Gestor', 'Supervisor')
  );
$$;

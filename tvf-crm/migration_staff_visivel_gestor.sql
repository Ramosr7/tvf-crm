-- v2: a policy anterior causava recursão infinita (consultava a própria tabela
-- de dentro da policy da mesma tabela). Usa uma função security definer pra
-- checar o perfil sem reaplicar RLS recursivamente.

drop policy if exists "gestor_ve_todos_staff" on consultores_staff;

create or replace function is_gestor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from consultores_staff where id = auth.uid() and perfil = 'Gestor'
  );
$$;

create policy "gestor_ve_todos_staff" on consultores_staff
    for select using (is_gestor());

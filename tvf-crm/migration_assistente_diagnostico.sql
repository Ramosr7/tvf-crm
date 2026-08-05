-- Função pro Gestor conseguir gerar um diagnóstico agregado das perguntas feitas ao
-- Joaozinho (pra identificar padrão de dúvida e montar plano de ação), SEM identificar qual
-- consultor perguntou o quê — o histórico individual continua privado (RLS normal da tabela
-- não muda). security definer bypassa a RLS só pra devolver conteúdo+data, nunca consultor_id.

create or replace function assistente_perguntas_anonimas(dias_atras integer default 30)
returns table (conteudo text, criado_em timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_gestor() then
    raise exception 'Só Gestor pode acessar o diagnóstico agregado.';
  end if;

  return query
    select m.conteudo, m.criado_em
    from assistente_mensagem m
    where m.role = 'user'
      and m.criado_em >= now() - (dias_atras || ' days')::interval
    order by m.criado_em desc;
end;
$$;

grant execute on function assistente_perguntas_anonimas(integer) to authenticated;

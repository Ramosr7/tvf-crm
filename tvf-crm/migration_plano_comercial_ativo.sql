-- Nem todo Supervisor/Gestor cadastrado deve aparecer com carta meta no Plano Comercial (ex:
-- ex-funcionário ainda no sistema por causa do histórico, ou sócio com acesso de Supervisor
-- mas sem time de verdade). Flag controlável na própria tela, sem precisar editar código toda
-- vez que alguém sai/entra do quadro comercial.

alter table consultores_staff add column if not exists plano_comercial_ativo boolean not null default true;

-- Avançado vira vertical própria no Plano Comercial — hoje só o time do Nishida vende esse
-- serviço, então a tela só mostra essa linha no card dele (os outros 3 times continuam sem).
-- Consequência: "Receita Telecom" deixa de incluir Avançado por dentro (senão contaria em
-- dobro) — passa a ser só HA+BL+Digital+CPF, e o cabeçalho é renomeado pra deixar isso claro.

alter table plano_comercial drop constraint if exists plano_comercial_vertical_check;
alter table plano_comercial add constraint plano_comercial_vertical_check
  check (vertical in ('APARELHO','HA','BL','MM','MB','AVANCADO','RECEITA_TELECOM'));

alter table plano_comercial_meta_regra drop constraint if exists plano_comercial_meta_regra_vertical_check;
alter table plano_comercial_meta_regra add constraint plano_comercial_meta_regra_vertical_check
  check (vertical in ('APARELHO','HA','BL','MM','MB','AVANCADO','RECEITA_TELECOM'));

alter table plano_comercial_meta_global drop constraint if exists plano_comercial_meta_global_vertical_check;
alter table plano_comercial_meta_global add constraint plano_comercial_meta_global_vertical_check
  check (vertical in ('APARELHO','HA','BL','MM','MB','AVANCADO','RECEITA_TELECOM'));

insert into plano_comercial_config (vertical, fator_conversao) values ('AVANCADO', 0.8)
on conflict (vertical) do nothing;

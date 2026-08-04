-- Reconcilia itens de venda que ficaram sem carteira_venda_id — pode acontecer de produtos
-- terem sido salvos entre a migration que criou carteira_venda e o deploy do código que
-- passou a exigir esse vínculo. Sem isso, o item existe no banco mas fica "invisível" pro
-- VendaItensModal, que agora só olha pelos itens de uma venda específica.

insert into carteira_venda (carteira_cliente_id, consultor_id, data_venda, criado_em)
select distinct vi.carteira_cliente_id, cc.consultor_id, coalesce(cc.data_venda, current_date), now()
from carteira_venda_item vi
join carteira_cliente cc on cc.id = vi.carteira_cliente_id
where vi.carteira_venda_id is null
  and not exists (select 1 from carteira_venda v where v.carteira_cliente_id = vi.carteira_cliente_id);

update carteira_venda_item vi
set carteira_venda_id = v.id
from carteira_venda v
where v.carteira_cliente_id = vi.carteira_cliente_id
  and vi.carteira_venda_id is null;

-- Corre esto en Supabase -> SQL Editor.
-- Arregla el error "Hubo un problema al enviar el pedido": el checkout
-- insertaba el pedido y después intentaba volver a leerlo con .select(),
-- pero la política de seguridad de "orders" solo deja leer pedidos al admin,
-- así que esa lectura fallaba (aunque el pedido ya se había guardado bien).
--
-- Esta función crea el pedido "por dentro" (sin pasar por esa restricción de
-- lectura) y devuelve únicamente el número de pedido y el total: no expone
-- ningún otro pedido ni datos de otros clientes.

create or replace function public.create_order(
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_note text
) returns table(id text, total integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id text;
  new_total integer;
begin
  insert into orders (items, customer_name, customer_phone, customer_address, customer_note)
  values (p_items, p_customer_name, p_customer_phone, p_customer_address, p_customer_note)
  returning orders.id, orders.total into new_id, new_total;

  return query select new_id, new_total;
end;
$$;

grant execute on function public.create_order(jsonb, text, text, text, text) to anon, authenticated;

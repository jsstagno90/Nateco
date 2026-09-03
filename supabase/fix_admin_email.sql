-- Corre esto en Supabase -> SQL Editor.
-- Arregla el panel de Pedidos, que no mostraba nada: las políticas de
-- "orders" (orders_admin_select y orders_admin_update) habían quedado con
-- el email de ejemplo 'admin@nateco.com' en vez de tu email real de login
-- (nateco@nateco.com), así que Supabase te ocultaba todos los pedidos.
--
-- De paso, deja las políticas de "products" apuntando al mismo email real,
-- por las dudas.

drop policy if exists products_admin_insert on products;
drop policy if exists products_admin_update on products;
drop policy if exists products_admin_delete on products;
drop policy if exists orders_admin_select  on orders;
drop policy if exists orders_admin_update  on orders;

create policy products_admin_insert on products
  for insert with check (auth.jwt() ->> 'email' = 'nateco@nateco.com');

create policy products_admin_update on products
  for update using (auth.jwt() ->> 'email' = 'nateco@nateco.com');

create policy products_admin_delete on products
  for delete using (auth.jwt() ->> 'email' = 'nateco@nateco.com');

create policy orders_admin_select on orders
  for select using (auth.jwt() ->> 'email' = 'nateco@nateco.com');

create policy orders_admin_update on orders
  for update using (auth.jwt() ->> 'email' = 'nateco@nateco.com');

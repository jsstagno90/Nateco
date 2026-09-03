-- Corre esto en Supabase -> SQL Editor para poder cargar la cantidad de stock de cada producto.
alter table products add column if not exists stock_qty integer;

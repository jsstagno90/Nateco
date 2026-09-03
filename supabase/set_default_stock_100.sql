-- Corre esto en Supabase -> SQL Editor (después de add_stock_qty_column.sql).
-- Le pone 100 unidades de stock a todos los productos que todavía no tengan
-- una cantidad cargada, y deja 100 como valor por defecto para los productos
-- que se agreguen de acá en adelante sin especificar cantidad.
update products set stock_qty = 100 where stock_qty is null;
alter table products alter column stock_qty set default 100;

-- =============================================================================
-- Nateco — esquema de Supabase
-- Corré todo este archivo una sola vez en: Supabase → SQL Editor → New query
-- =============================================================================

-- El email admin ya está seteado a nateco@nateco.com (el que usás para entrar
-- a /admin) en las 5 políticas "..._admin_..." de abajo. Ese email es el
-- ÚNICO que va a poder editar productos y ver/gestionar pedidos.

-- ---------------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------------
create table if not exists products (
  id          text primary key,
  name        text not null,
  category    text not null,
  unit        text not null default '-',
  price       integer not null check (price >= 0),
  desde       boolean not null default false,
  stock       boolean not null default true,
  featured    boolean not null default false,
  art         text not null default 'nut',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------
create sequence if not exists order_seq start 1;

create table if not exists orders (
  id               text primary key default ('NAT-' || lpad(nextval('order_seq')::text, 4, '0')),
  created_at       timestamptz not null default now(),
  status           text not null default 'nuevo'
                     check (status in ('nuevo','confirmado','en_preparacion','entregado','cancelado')),
  items            jsonb not null,
  total            integer not null default 0,
  customer_name    text not null,
  customer_phone   text not null,
  customer_address text default '',
  customer_note    text default ''
);

-- El total nunca lo manda el navegador: se recalcula acá a partir de los
-- productos y cantidades del pedido, así nadie puede "editar" el total antes
-- de enviarlo.
create or replace function orders_set_total()
returns trigger as $$
begin
  select coalesce(sum((item->>'price')::numeric * (item->>'qty')::numeric), 0)
    into new.total
  from jsonb_array_elements(new.items) as item;
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_before_insert on orders;
create trigger orders_before_insert
  before insert on orders
  for each row execute function orders_set_total();

-- ---------------------------------------------------------------------------
-- Seguridad (Row Level Security)
--   - Productos: cualquiera los puede leer; sólo el admin los edita.
--   - Pedidos: cualquiera puede crear uno (así funciona el checkout sin
--     login); sólo el admin puede leer y actualizar el estado.
-- ---------------------------------------------------------------------------
alter table products enable row level security;
alter table orders   enable row level security;

drop policy if exists products_public_read  on products;
drop policy if exists products_admin_insert on products;
drop policy if exists products_admin_update on products;
drop policy if exists products_admin_delete on products;

create policy products_public_read on products
  for select using (true);

create policy products_admin_insert on products
  for insert with check (auth.jwt() ->> 'email' = 'nateco@nateco.com');

create policy products_admin_update on products
  for update using (auth.jwt() ->> 'email' = 'nateco@nateco.com');

create policy products_admin_delete on products
  for delete using (auth.jwt() ->> 'email' = 'nateco@nateco.com');

drop policy if exists orders_public_insert on orders;
drop policy if exists orders_admin_select  on orders;
drop policy if exists orders_admin_update  on orders;

create policy orders_public_insert on orders
  for insert with check (true);

create policy orders_admin_select on orders
  for select using (auth.jwt() ->> 'email' = 'nateco@nateco.com');

create policy orders_admin_update on orders
  for update using (auth.jwt() ->> 'email' = 'nateco@nateco.com');

-- Pedidos en vivo en el panel /admin sin recargar la página.
alter publication supabase_realtime add table orders;

-- ---------------------------------------------------------------------------
-- Catálogo inicial (el mismo que ya tenía la tienda)
-- ---------------------------------------------------------------------------
insert into products (id, name, category, unit, price, desde, stock, featured, art) values
('p1',  '1/4kg Mix Premium con Pasas',                          'frutos-secos', '1/4kg',  5000,  false, true,  true,  'nut'),
('p2',  'Just Plant Protein Star Nutrition 2lb',                'suplementos',  '2lb',    49000, false, true,  true,  'supp'),
('p3',  'Pasta de Castañas de Cajú Dicomere x170g',              'frutos-secos', '170g',   7800,  false, true,  true,  'nut'),
('p4',  '50g Manzanilla',                                       'infusiones',   '50g',    4200,  false, true,  true,  'herb'),
('p5',  '1/4kg Flor de Hibiscus',                                'infusiones',   '1/4kg',  6000,  false, true,  true,  'herb'),
('p6',  'Barra Choco Maní — Entrenuts',                          'suplementos',  'unidad', 2300,  false, true,  true,  'supp'),
('p7',  'Pancake Proteico Salado — Queso',                       'suplementos',  'unidad', 13900, false, true,  true,  'supp'),
('p8',  '1/2kg Mix Açaí con Banana y Frutilla',                  'frutos-secos', '1/2kg',  9500,  false, true,  true,  'berry'),
('p9',  'Mix Frutos Rojos',                                      'frutos-secos', '-',      10500, true,  true,  false, 'berry'),
('p10', 'Mix Frutos del Bosque',                                 'frutos-secos', '-',      9500,  true,  true,  false, 'berry'),
('p11', 'Mix Tucumano — Arándanos, moras y frutillas',           'frutos-secos', '-',      14900, true,  true,  false, 'berry'),
('p12', 'Mix Caribe',                                            'frutos-secos', '-',      8900,  true,  true,  false, 'nut'),
('p13', '1kg Mix Patagónico — Frambuesas, arándanos y frutillas','frutos-secos', '1kg',    17900, false, true,  false, 'berry'),
('p14', 'Arándanos',                                             'frutos-secos', '-',      9200,  true,  true,  false, 'berry'),
('p15', '100g Poleo',                                            'infusiones',   '100g',   3500,  false, true,  false, 'herb'),
('p16', '100g Boldo',                                            'infusiones',   '100g',   3500,  false, true,  false, 'herb'),
('p17', '50g Caléndula',                                         'infusiones',   '50g',    2000,  false, true,  false, 'herb'),
('p18', '100g Burrito en Hoja',                                  'infusiones',   '100g',   3000,  false, true,  false, 'herb'),
('p19', '1/2kg Frambuesas IQF',                                  'frutos-secos', '1/2kg',  14900, false, false, false, 'berry'),
('p20', '1/2kg Moras',                                           'frutos-secos', '1/2kg',  8200,  false, false, false, 'berry'),
('p21', 'Frutilla entera',                                       'suplementos',  '-',      6500,  true,  true,  false, 'berry'),
('p22', 'Mango en cubos',                                        'suplementos',  '-',      8500,  true,  true,  false, 'berry'),
('p23', '1/2kg Maracuyá en cubos — con semillas',                'suplementos',  '1/2kg',  10500, false, true,  false, 'berry'),
('p24', '1/2kg Ananá',                                           'suplementos',  '1/2kg',  8900,  false, false, false, 'berry')
on conflict (id) do nothing;

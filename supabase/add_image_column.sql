-- Corre esto PRIMERO en Supabase -> SQL Editor, antes de products_with_images.sql
alter table products add column if not exists image text;

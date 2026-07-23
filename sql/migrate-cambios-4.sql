-- Cambios — descuento manual en $ (además del % por forma de pago). Idempotente.
-- Aplica sobre el subtotal a cobrar; el % de forma de pago se calcula sobre lo que queda tras el manual.
-- Correr en Supabase de BDI y ZATTIA.
alter table cambios add column if not exists descuento_manual numeric; -- $ de descuento manual sobre el subtotal

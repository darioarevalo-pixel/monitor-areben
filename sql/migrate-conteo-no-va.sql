-- Talles y colores que A PROPÓSITO no se cuelgan en el salón (Conteo del local → «Para colgar»).
--
-- El reporte «Para colgar» lista cada talle y color que no está exhibido (la regla es uno por
-- talle y color). Algunos no van nunca, y Bruno pidió (27-sep-2026) que ese «No va» se recuerde
-- de un conteo al otro en vez de marcarlo cada vez. Se guarda por variante (`clave` = la misma
-- que usa el reporte: 'i' + inventory_id, o 'b' + código de barras).
--
-- Correr UNA vez en el SQL Editor del Supabase de ZATTIA (y de BDI si algún día se usa ahí).
-- Idempotente: se puede correr varias veces.

create table if not exists conteo_no_va (
  store       text not null,          -- 'bdi' | 'zattia'
  clave       text not null,          -- 'i<inventory_id>' | 'b<barcode>'
  producto    text,
  variante    text,
  sku         text,
  usuario     text,
  created_at  timestamptz not null default now(),
  primary key (store, clave)
);

-- Igual que las demás tablas del monitor: el gate es el login server-side del endpoint
-- (service key), no RLS.
alter table conteo_no_va disable row level security;

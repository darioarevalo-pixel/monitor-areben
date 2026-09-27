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

-- RLS PRENDIDO y sin políticas: la anon key no ve nada. El endpoint escribe con la service key
-- (ZATTIA_SUPABASE_SERVICE_KEY, cargada en Vercel), que se saltea RLS; el gate es su login
-- server-side. (27-sep-2026: el SQL Editor avisó que la versión que lo apagaba dejaba la tabla
-- abierta a la anon key, y tenía razón.)
alter table conteo_no_va enable row level security;

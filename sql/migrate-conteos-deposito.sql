-- Historial de conteos de depósito aplicados (sección "Depósito → Conteo" del Monitor).
-- Correr este script en CADA proyecto Supabase (BDI y ZATTIA).
-- Guarda, por cada ajuste aplicado a GN: cuándo, quién, el saldo ± total (resumen) y el detalle por variante.

create table if not exists conteos_deposito (
  id            bigint generated always as identity primary key,
  store         text not null,                 -- 'bdi' | 'zattia'
  ubicacion     text,                           -- ej: 'Deposito Minorista'
  usuario       text,                           -- quién aplicó
  fecha_inicio  timestamptz,                    -- cuándo arrancó el conteo
  fecha_aplicado timestamptz not null default now(),
  resumen       jsonb not null default '{}'::jsonb,   -- {coinciden, mas, menos, unidades_ajustadas, lineas}
  detalle       jsonb not null default '[]'::jsonb,   -- [{product_id,size_id,barcode,producto,variante,sistema,contado,diferencia,vivo_aplicado,nuevo_stock}]
  created_at    timestamptz not null default now()
);

create index if not exists idx_conteos_deposito_store_fecha
  on conteos_deposito (store, fecha_aplicado desc);

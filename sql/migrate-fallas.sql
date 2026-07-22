-- Depósito de FALLAS (post-venta, Fase 4 v1 — sección Administración → Post-venta).
-- Ledger interno valorizado de prendas con falla: NO vuelven al stock oficial (GN/TN) ni lo tocan.
-- Siguen su propio flujo (en_deposito → vendida_feria | descartada). Sirve para saber, en plata,
-- "cuánto tenemos en fallas" (a costo y a PVP de feria) y con qué motivo entró cada una.
--
-- Correr en el Supabase de CADA marca (BDI y ZATTIA). Idempotente: se puede correr varias veces.

create table if not exists fallas_deposito (
  id              bigint generated always as identity primary key,
  store           text not null,                       -- 'bdi' | 'zattia' (marca dueña de la falla)
  sku             text,                                 -- opcional: puede no tener SKU exacto
  producto        text not null,                        -- descripción / nombre de la prenda
  cantidad        integer not null default 1,
  motivo          text,                                 -- por qué es falla (mancha, costura, etc.)
  -- Valuación (no impacta contabilidad oficial; es referencia interna):
  valuacion_costo      numeric,                         -- costo unitario estimado
  valuacion_pvp_feria  numeric,                         -- PVP unitario esperado en feria
  estado          text not null default 'en_deposito', -- 'en_deposito' | 'vendida_feria' | 'descartada'
  usuario         text,                                 -- quién la cargó
  historial       jsonb not null default '[]'::jsonb,   -- [{estado, at, usuario, nota}]
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_fallas_deposito_store_estado
  on fallas_deposito (store, estado, created_at desc);

-- El resto de la base no usa RLS (el endpoint api/fallas.js gatea por login server-side, igual
-- que api/conteos-deposito.js y api/sku-map.js). Se apaga para quedar igual que las demás tablas.
alter table fallas_deposito disable row level security;

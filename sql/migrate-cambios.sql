-- Cambios (post-venta, Fase B). Local inicia + Admin motor; se maneja la diferencia de precio.
-- El reingreso del producto devuelto es MANUAL (GN no acepta venta negativa por API) → se traza acá como
-- `reingreso_estado='pendiente'` hasta que el admin lo carga a mano en GN. Correr en Supabase de BDI y ZATTIA.

create table if not exists cambios (
  id                bigint generated always as identity primary key,
  store             text not null,                        -- 'bdi' | 'zattia'
  orden_tn          text,                                 -- número de orden de Tienda Nube
  cliente           text,                                 -- nombre del cliente (de la orden)
  via               text not null default 'local',        -- 'local' | 'correo' | 'andreani'
  estado            text not null default 'iniciado',     -- iniciado→confirmado→en_transito→recibido→cerrado | anulado
  -- Líneas (jsonb): [{sku, product_id, size_id, producto, precio, cantidad}]
  items_devueltos   jsonb not null default '[]'::jsonb,   -- lo que devuelve el cliente (vuelve a stock, reingreso manual)
  items_nuevos      jsonb not null default '[]'::jsonb,   -- lo que se lleva (sale de stock por la venta de ida)
  diferencia        numeric,                              -- Σ(nuevos) − Σ(devueltos)
  diferencia_estado text,                                 -- 'parejo' | 'a_cobrar' | 'a_devolver' | 'saldado'
  reingreso_estado  text not null default 'pendiente',    -- 'pendiente' | 'hecho' (reingreso manual a GN)
  gn_venta_ida_id     text,                               -- venta en GN del producto nuevo (baja de stock)
  gn_venta_ida_number text,
  usuario           text,
  historial         jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_cambios_store_estado    on cambios (store, estado, created_at desc);
create index if not exists idx_cambios_store_reingreso on cambios (store, reingreso_estado);

-- El endpoint api/cambios.js gatea por login server-side (igual que fallas/conteos); sin RLS, como el resto.
alter table cambios disable row level security;

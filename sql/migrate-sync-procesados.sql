-- Ledger de idempotencia del sync TN↔GN (Stunned y futuros).
-- Evita dos cosas: (1) importar dos veces la misma orden de TN a GN, y (2) reescribir en TN un
-- stock que no cambió desde la última corrida. Sin esto, el cron diario duplicaría ventas o
-- machacaría la tienda con writes inútiles.
--
-- Correr en el Supabase que corresponda (arranca en la base de Zattia, línea STU). Idempotente.

create table if not exists sync_procesados (
  id           bigint generated always as identity primary key,
  store        text not null,             -- 'bdi' | 'zattia' | 'stunned'
  fuente       text not null,             -- 'tn' | 'gn'
  tipo         text not null,             -- 'venta' (orden TN importada a GN) | 'stock' (push a TN)
  ref_id       text not null,             -- id de orden TN, o sku (para stock)
  hash         text,                      -- hash del payload aplicado (para 'stock': cantidad enviada)
  detalle      jsonb not null default '{}'::jsonb,   -- {gn_venta_id, cantidad, ...} para auditoría
  procesado_at timestamptz not null default now(),
  unique (store, fuente, tipo, ref_id)
);

create index if not exists idx_sync_procesados_lookup
  on sync_procesados (store, fuente, tipo, ref_id);

-- Igual que sku_map: sin RLS, consistente con el resto de la base (Fase S pendiente). Idempotente.
alter table sync_procesados disable row level security;

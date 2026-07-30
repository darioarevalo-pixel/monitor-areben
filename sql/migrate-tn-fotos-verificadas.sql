-- Productos cuya vinculación foto→color ya se revisó a ojo (Tienda Nube > Revisar fotos).
--
-- Es distinto de `tn_ignorados`, que es "no revisar nunca" (mayoristas, pruebas). Esto es
-- "ya lo miré y está bien, tal día, yo".
--
-- ⚠️ La columna que hace que esto sirva es `huella`. Sin ella, marcar un producto como
-- revisado lo saca de la lista PARA SIEMPRE: dentro de dos meses alguien recarga una foto,
-- el error vuelve, y el producto sigue marcado como verificado y no aparece nunca más. La
-- pantalla diría que está todo bien cuando no lo está — peor que no auditar, porque da
-- confianza falsa.
--
-- `huella` es una firma corta del estado de fotos del producto al momento de revisarlo (el
-- mapa color→foto más los ids de las fotos, ver `huellaDe` en lib/tncat/auditoria.ts). Al
-- abrir la pantalla se recalcula y se compara: si coincide, el producto no aparece; si no,
-- vuelve solo a la lista marcado como "cambió después de la revisión".
--
-- Correr en el Supabase de CADA marca con `node scripts/apply-tn-fotos-verificadas.mjs`.
-- Idempotente: se puede correr varias veces.

create table if not exists tn_fotos_verificadas (
  store       text not null,                          -- 'bdi' | 'zattia'
  tn_id       text not null,                          -- id del producto en TiendaNube
  huella      text not null,                          -- firma del estado revisado (ver arriba)
  nombre      text,                                   -- nombre al momento de revisarlo (referencia)
  usuario     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (store, tn_id)
);

create index if not exists idx_tn_fotos_verificadas_store on tn_fotos_verificadas (store);

-- Igual que las demás tablas del monitor: el gate es el login server-side del endpoint
-- (service key), no RLS.
alter table tn_fotos_verificadas disable row level security;

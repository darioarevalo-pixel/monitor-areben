-- bases: zattia
-- Mapeo estable de SKU entre Gestión Nube (GN) y Tienda Nube (TN).
-- Fundacional para el sync bidireccional TN↔GN (Stunned) y para escribir stock/ventas cruzados.
-- Hoy el cruce GN↔TN es difuso y en memoria (lib/tn.ts matchTn: SKU→nombre→palabras); esta tabla
-- lo persiste y le agrega validación humana antes de que un sync automático escriba en base a él.
--
-- Correr en el Supabase que corresponda. Arranca en la base de ZATTIA con store='stunned'
-- (Stunned es la línea SKU 'STU' dentro del GN de Zattia); migrar a la base propia de Stunned
-- cuando se provisione. Idempotente: se puede correr varias veces.

create table if not exists sku_map (
  id              bigint generated always as identity primary key,
  store           text not null,            -- marca/línea: 'bdi' | 'zattia' | 'stunned'
  sku             text not null,            -- clave semántica compartida GN↔TN
  -- Identificadores GN (leer stock + crear ventas que descuentan inventario):
  gn_product_id   text,
  gn_variant_id   text,
  gn_inventory_id text,                      -- id estable por variante+tienda para escribir en GN
  -- Identificadores TN (escribir stock absoluto de variante + crear órdenes):
  tn_store        text,                      -- ej: 'stunned'
  tn_product_id   text,
  tn_variant_id   text,
  -- Trazabilidad del match propuesto:
  match_metodo    text,                      -- 'sku' | 'nombre' | 'palabras' | 'manual'
  validado        boolean not null default false,  -- confirmado por un humano antes de sincronizar
  nota            text,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (store, sku)
);

create index if not exists idx_sku_map_store    on sku_map (store);
create index if not exists idx_sku_map_validado on sku_map (store, validado);

-- El resto de la base todavía no usa RLS (ver lib/cuentas.ts, Fase S pendiente). El endpoint
-- api/sku-map.js ya gatea por login server-side. Se apaga RLS para que quede igual que las demás
-- tablas (si el proyecto lo enciende por default, esto lo revierte). Idempotente.
alter table sku_map disable row level security;

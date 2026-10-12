-- Gift card de la Caja (W6), parte 1: las TARJETAS y sus lotes. Correr en el proyecto Supabase de ZATTIA.
-- Es idempotente.
--
-- 🏁 POR QUÉ ASÍ (Bruno, 11-oct-2026): es una TARJETA FÍSICA de PVC con código de barras. Los códigos
-- los genera el monitor (al azar, con verificador: `lib/caja/gift.core.js`), se cargan acá como un LOTE
-- en estado `inactiva` —sin monto— y el CSV va a la imprenta. Vender = ACTIVAR: la cajera escanea, pone
-- el monto y cobra. Una tarjeta sin activar ⛔ vale nada.
-- Diseño: ~/Documents/reunion-gerencia/2026-10-11-POS-auditoria-y-gift-card.md § D.
--
-- FORMA:
--   `caja_gift_lote`  una fila por tanda generada (cuántas, quién, cuándo).
--   `caja_gift_card`  una fila por tarjeta. `monto`, `saldo` y `vence_en` quedan NULL hasta activarla.
--                     🔑 `saldo >= 0` (CHECK) es el freno del doble canje: dos canjes a la vez ⛔ dejan
--                     la tarjeta en negativo, el segundo falla en la base.
--   `caja_gift_mov`   el HISTORIAL de cada tarjeta (activación, canje, reverso, anulación, prórroga).
--                     El saldo es la columna; el historial explica cómo llegó ahí.
--
-- 📌 Las funciones que activan y canjean (transaccionales, patrón de `migrate-ubicaciones-local.sql`)
-- van en la parte 2, con el cobro: acá sólo lo que necesita «Generar lote».
--
-- VERIFICACIÓN (correr después):
--   select table_name from information_schema.tables where table_name like 'caja_gift%' order by 1;
--   select conname from pg_constraint where conname like 'caja_gift%' order by 1;
--
-- ROLLBACK (se lleva todos los lotes y tarjetas; ⛔ correr con tarjetas activadas):
--   drop table if exists caja_gift_mov; drop table if exists caja_gift_card; drop table if exists caja_gift_lote;

create table if not exists caja_gift_lote (
  id          bigserial primary key,
  store       text not null,                 -- 'zattia'
  cantidad    int  not null check (cantidad > 0),
  nota        text,                          -- «imprenta X, diseño navidad»
  creado_en   timestamptz not null default now(),
  -- 🔑 la firma sale de perfil.name, NUNCA del body
  creado_por  text
);

create table if not exists caja_gift_card (
  codigo       text primary key,             -- 'GC' + 10 al azar + verificador (lo que dicen las barras)
  store        text not null,
  lote_id      bigint references caja_gift_lote(id),
  estado       text not null default 'inactiva'
               check (estado in ('inactiva', 'pendiente', 'activa', 'anulada')),
  monto        numeric(12,2) check (monto is null or monto > 0),      -- con lo que se activó
  saldo        numeric(12,2) constraint caja_gift_card_saldo_no_negativo check (saldo is null or saldo >= 0),
  vence_en     date,
  activada_en  timestamptz,
  activada_por text,
  venta_id     text,                         -- la venta de la Caja que la activó (caja_venta.id)
  origen       text check (origen is null or origen in ('venta', 'cambio', 'regalo')),
  creada_en    timestamptz not null default now(),
  anulada_en   timestamptz,
  anulada_por  text,
  nota         text,
  -- Activa ⇒ tiene monto, saldo y vencimiento; inactiva ⇒ ⛔ tiene ninguno.
  constraint caja_gift_card_activa_completa check (
    (estado = 'inactiva' and monto is null and saldo is null and vence_en is null)
    or (estado <> 'inactiva' and estado <> 'anulada' and monto is not null and saldo is not null and vence_en is not null)
    or estado = 'anulada'
  )
);
create index if not exists caja_gift_card_lote on caja_gift_card (lote_id);
create index if not exists caja_gift_card_estado on caja_gift_card (store, estado);

create table if not exists caja_gift_mov (
  id          bigserial primary key,
  codigo      text not null references caja_gift_card(codigo),
  tipo        text not null check (tipo in ('activacion', 'canje', 'reverso', 'anulacion', 'prorroga')),
  monto       numeric(12,2) not null default 0,    -- + suma al saldo, − lo baja
  saldo_despues numeric(12,2),
  venta_id    text,                                -- la venta de la Caja (activación, canje, reverso)
  en          timestamptz not null default now(),
  por         text,
  nota        text
);
create index if not exists caja_gift_mov_codigo on caja_gift_mov (codigo, en);
-- Un canje por venta y tarjeta: reintentar la misma venta ⛔ descuenta dos veces.
create unique index if not exists caja_gift_mov_un_canje on caja_gift_mov (codigo, venta_id) where tipo = 'canje';

-- El navegador nunca lee estas tablas derecho: todo pasa por `api/_caja.js`, con la service key.
alter table caja_gift_lote enable row level security;
alter table caja_gift_card enable row level security;
alter table caja_gift_mov  enable row level security;

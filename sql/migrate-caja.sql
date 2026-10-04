-- Caja: el POS propio del local (F2 del plan del 3-oct-2026). Las ventas que se cobran en la Caja
-- del monitor y viajan a Gestión Nube, y la configuración del cobro.
-- Correr en el proyecto Supabase de ZATTIA (la sección `caja` es `brands: ['zattia']`).
--
-- 🔑 POR QUÉ HAY UNA TABLA Y ⛔ SE MANDA DERECHO A GN. La venta se guarda ANTES de mandarla: si GN
-- está caído, corta por el tope (429) o la función se muere en el medio, la venta ⛔ se pierde —queda
-- en `error` y se reintenta—. El `id` de la fila ES el `integration_id` de GN, y GN rechaza con 409
-- un segundo POST con el mismo ⇒ reintentar ⛔ duplica (medido el 3-oct con la venta #30047).
--
-- `caja_venta.estado`:
--   borrador  → guardada, todavía ⛔ salió a GN
--   enviando  → el POST está en vuelo (si queda así, la función murió: se reintenta igual)
--   en_gn     → GN la tiene; `gn_sale_id` y `gn_number` son los suyos
--   error     → GN contestó mal o ⛔ contestó. `ultimo_error` dice qué, SIN secretos
--
-- `payload` es el cuerpo EXACTO que se mandó (o se va a mandar) a GN. Reintentar manda ése y ⛔ lo
-- vuelve a armar: la clienta ya pagó ese monto, y si la configuración cambió en el medio, rearmar
-- cobraría otro.
--
-- `caja_config` es UNA fila por marca: las reglas de cobro por cuenta (`lib/caja/core.core.js`,
-- forma `{ redondeo, cuentas: { <account_id>: { nombre, descuento, efectivo? } } }`) y el texto de
-- la política de cambio del ticket. Si ⛔ hay fila, el handler la siembra con `REGLAS_INICIALES`.
--
-- Las dos con RLS y SIN políticas: sólo las toca el handler con la service key. La anon key está en
-- el navegador (ver migrate-rls.sql) y una venta trae el mail de la clienta.
--
-- VERIFICACIÓN (correr después; tiene que devolver las dos filas, con rowsecurity = true):
--   select tablename, rowsecurity from pg_tables
--   where tablename in ('caja_venta', 'caja_config') order by 1;

create table if not exists caja_venta (
  id              uuid primary key,                      -- = integration_id en GN; lo genera la pantalla
  store           text not null default 'zattia',
  estado          text not null default 'borrador'
                  check (estado in ('borrador', 'enviando', 'en_gn', 'error')),
  renglones       jsonb not null,                        -- lo que cobró la Caja: producto, talle, precio, rebaja
  pagos           jsonb not null,                        -- por cuenta: base, %, descuento, redondeo, monto
  subtotal        numeric(12, 2) not null,
  total           numeric(12, 2) not null,
  paga_con        numeric(12, 2),                        -- lo que entregó en efectivo (para el vuelto); ⛔ viaja a GN
  email           text,
  payload         jsonb not null,                        -- el cuerpo exacto de POST /ventas
  gn_sale_id      bigint,
  gn_number       bigint,
  usuario         text,                                  -- 🔑 sale de perfil.name, NUNCA del body
  intentos        integer not null default 0,
  ultimo_error    text,
  reintentable    boolean,                               -- false = GN la RECHAZÓ (4xx): reintentar da lo mismo
  creada_en       timestamptz not null default now(),
  actualizada_en  timestamptz not null default now(),
  en_gn_en        timestamptz
);
create index if not exists idx_caja_venta_pend on caja_venta (store, estado, creada_en) where estado <> 'en_gn';
create index if not exists idx_caja_venta_fecha on caja_venta (store, creada_en desc);
alter table caja_venta enable row level security;

create table if not exists caja_config (
  store            text primary key,                     -- 'zattia'
  reglas           jsonb not null,
  politica_cambio  text,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
alter table caja_config enable row level security;

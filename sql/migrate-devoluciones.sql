-- Devoluciones (post-venta). Cubre los tres escenarios con un solo motor:
--   1. devolución total       → la prenda vuelve a stock, se reintegra la plata
--   2. parcial por falta de stock → la prenda NUNCA salió, se reintegra y se corrige TN
--   3. falla con envío        → la prenda va al ledger de Fallas (nunca a stock), con o sin reintegro
--
-- Lo que los distingue no es el tipo de reclamo: son `destino_prenda` (qué pasa con la prenda) y
-- `compensacion` (qué recibe el cliente), que son decisiones independientes.
--
-- ⚠️ La anulación de la venta original en Gestión Nube es MANUAL: GN no la expone por API (ver
-- api/crear-venta.js y lib/verif-ventas/). Por eso `stock_estado` es una traza, igual que el
-- `reingreso_estado` de la tabla `cambios`, y no un efecto que el sistema pueda ejecutar.
--
-- Correr en el Supabase de BDI y de ZATTIA.

create table if not exists devoluciones (
  id                bigint generated always as identity primary key,
  store             text not null,                        -- 'bdi' | 'zattia'
  orden_tn          text,                                 -- número de orden de Tienda Nube
  cliente           text,
  -- Link para que el cliente cargue fotos y su relato, sin login. Token largo, con vencimiento
  -- y revocable: es lo único de este módulo expuesto a internet.
  token             text unique,
  token_vence       timestamptz,

  motivo            text not null default 'otro',         -- arrepentimiento|falla|sin_stock|no_era_lo_esperado|otro
  motivo_detalle    text,
  relato_cliente    text,                                 -- lo que escribe el cliente por el link
  fotos             jsonb not null default '[]'::jsonb,   -- [{url, at, por:'cliente'|'equipo'}]

  destino_prenda    text,                                 -- 'stock' | 'falla' | 'no_salio'
  compensacion      text,                                 -- plata_total|plata_parcial|otra_unidad|cupon|ninguna
  estado            text not null default 'borrador',     -- borrador→esperando_cliente→en_revision→resuelto→(en_transito→recibido)→cerrado | anulado

  -- Líneas: [{sku, product_id, size_id, variant_id, producto, variante, cantidad, precio, pagado, costo, pvp_feria}]
  items             jsonb not null default '[]'::jsonb,

  -- Plata. `monto_producto` es lo que la persona PAGÓ (precio de lista menos los descuentos de la
  -- orden, prorrateados); `monto_acordado` le gana cuando se pacta devolver solo una parte.
  monto_producto        numeric,
  monto_acordado        numeric,
  monto_envio_devuelto  numeric,
  monto_total           numeric,
  pago_metodo           text,                             -- de la orden TN: por dónde se le devuelve
  pago_gateway          text,
  devolver_envio        boolean not null default false,

  -- La cuenta de si conviene pedir el retorno, y lo que finalmente se decidió. Si difieren, queda
  -- registrado que se fue contra la sugerencia.
  retorno_sugerido  boolean,
  retorno_decidido  boolean,

  envio_costo         numeric,                            -- la etiqueta de vuelta, SIEMPRE a nuestro cargo
  seguimiento_vuelta  text,

  gn_venta_id       text,                                 -- la venta original, la que hay que anular
  gn_venta_number   text,

  -- Los tres pendientes: avanzan a ritmos distintos y el reclamo cierra cuando los que aplican
  -- están en 'hecho'.
  stock_estado      text not null default 'pendiente',    -- 'pendiente' | 'hecho' | 'no_aplica'
  reintegro_estado  text not null default 'pendiente',
  tn_stock_estado   text not null default 'no_aplica',
  reintegro_at      timestamptz,
  reintegro_por     text,
  reintegro_comprobante text,

  cupon_codigo      text,
  falla_ids         jsonb not null default '[]'::jsonb,   -- fallas creadas desde este reclamo
  costo_caso        numeric,                              -- plata + envíos + unidad regalada

  usuario           text,
  historial         jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_devoluciones_store_estado on devoluciones (store, estado, created_at desc);
create index if not exists idx_devoluciones_pendientes   on devoluciones (store, reintegro_estado, stock_estado);
create index if not exists idx_devoluciones_orden        on devoluciones (store, orden_tn);
-- El portal del cliente entra por el token: sin índice, cada visita escanea la tabla.
create index if not exists idx_devoluciones_token        on devoluciones (token) where token is not null;

-- El endpoint api/_devoluciones.js gatea por login server-side (igual que fallas/cambios/conteos)
-- y además exige función de administración para reintegrar y anular. Sin RLS, como el resto.
alter table devoluciones disable row level security;

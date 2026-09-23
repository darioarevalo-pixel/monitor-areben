-- "Cobranzas": los cobros de órdenes de Tienda Nube con medio de pago MANUAL.
--
-- # De dónde sale (Bruno, 23-sep-2026)
--
-- La feria de Zattia abre online. Pago Nube cobra y marca pagado solo; lo que queda afuera son las
-- órdenes «a pagar» (transferencia directa a la cuenta de la EMPRESA, efectivo al retirar), que TN
-- deja en `pending` hasta que alguien confirma que la plata entró. Esta tabla es ese registro.
--
-- 🔴 **TiendaNube ⛔ deja marcar una orden pagada por API** (sólo una app de medio de pago). Por eso
-- esta tabla es la verdad del COBRO y TN la del «pagado»: el estado que ve la pantalla sale de
-- cruzar las dos (`lib/cobranzas/core.core.js`).
--
-- # Vive SÓLO en la base de BDI
--
-- Igual que `envios_reparto`, con quien se habla: cobrar una orden le pone en cero lo que el cadete
-- tendría que cobrar en la puerta, y esa tabla es una sola para las dos marcas. `store` separa.
-- ⚠️ `scripts/aplicar-sql.mjs` la crea también en Zattia: allá queda vacía y nadie la lee.
--
-- # ⛔ Anular no borra
--
-- Un cobro mal cargado se ANULA (`anulado_en`), y la orden vuelve a pendientes. Quién cobró, cuándo
-- y con qué número de operación es justo lo que se va a querer mirar si un día no cierra la caja.
--
-- Correr con `node scripts/aplicar-sql.mjs sql/migrate-tn-cobros.sql tn_cobros`. Idempotente.

create table if not exists tn_cobros (
  id            text primary key,                 -- `co<epoch>_<rand>`, generado en el servidor
  store         text not null check (store in ('bdi', 'zattia')),
  order_id      text not null,                    -- id INTERNO de la orden en TN (el de la API)
  numero        text not null,                    -- el número que ve la clienta
  orden_fecha   timestamptz,                      -- cuándo compró: la ventana que se le pide a TN
  monto         numeric(12,2) not null check (monto > 0),
  medio         text not null check (medio in ('transferencia', 'efectivo')),
  operacion     text,                             -- n.º de operación / comprobante, si lo hay
  -- `idem` lo genera la pantalla al apretar: el doble click choca acá y devuelve el primero.
  idem          text not null unique,
  quien         text,                             -- perfil.name, NUNCA del body
  cuando        timestamptz not null default now(),

  -- Cómo quedó la línea en la nota interna de la orden de TN. El cobro vale igual si esto falla:
  -- la plata entró. `sin-permiso` = el token de la app ⛔ tiene `write_orders`.
  nota_tn       text not null default 'pendiente'
                check (nota_tn in ('pendiente', 'ok', 'sin-verificar', 'sin-permiso', 'error')),

  -- Lo que se le sacó a la hoja del cadete, para poder devolvérselo si se anula.
  envio_id           text,
  envio_saldo_previo numeric(12,2),

  anulado_en    timestamptz,
  anulado_por   text
);

-- 🔑 Un solo cobro VIGENTE por orden. Parcial a propósito: anular y volver a cobrar tiene que poder
-- pasar, y el anulado se queda como historia.
create unique index if not exists idx_tn_cobros_vigente
  on tn_cobros (store, order_id) where anulado_en is null;

create index if not exists idx_tn_cobros_store_cuando on tn_cobros (store, cuando desc);

-- RLS prendido y SIN políticas, igual que `envios_reparto`: sólo entra la clave de servicio del
-- handler. Adentro hay montos y nombres de clientas.
alter table tn_cobros enable row level security;

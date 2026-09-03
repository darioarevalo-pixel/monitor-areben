-- Compromisos de pago: "este cliente le va a transferir a este acreedor".
--
-- # Qué hueco tapa
--
-- A un cliente mayorista que nos debe plata se le pide que transfiera DIRECTO a la cuenta del
-- contador o del abogado: con una transferencia se cancelan las dos deudas. Eso hoy se arregla
-- hablando y se anota a mano —o no se anota—, así que entre que se promete y que la plata aparece
-- no hay nada: ni quién prometió, ni cuánto, ni a qué cuenta, ni si ya pasó.
--
-- Se ve en el ledger del dashboard: los pagos dicen "Transferencia de cliente mayorista" o
-- "Nazarena Luciani - BDI Mayorista" en el campo de notas. Sirve para LEERLO y nada más.
--
-- # ⛔ Por qué una promesa NO nace como un pago sin confirmar
--
-- La idea anterior era crear el pago en el dashboard con `debitado:false` y confirmarlo tildando.
-- Se descartó: **una promesa no es un pago a medio hacer, es otra cosa**. Tiene cliente, quién la
-- hizo, fecha prometida y seguimiento, y nada de eso entra en un pago. Además una promesa que se
-- cae ensuciaría el ledger, que es el registro de lo que PASÓ.
--
-- Consecuencia buena: al dashboard sólo le llega plata que ya se movió, que es exactamente lo que
-- su ledger asume (deriva `debitado` del instrumento). No hubo que tocar nada de eso.
--
-- # Vive acá y no en el dashboard
--
-- La promesa es del Monitor: es donde se habla con el cliente y donde está el panel de WhatsApp.
-- El dashboard queda ciego a las promesas a propósito — que sus pantallas las vean es un segundo
-- puente, al revés, y no se arma ahora.
--
-- ⚠️ El dashboard tampoco sabe que esa plata está comprometida. Si alguien paga ese mismo gasto
-- desde el dashboard mientras hay una promesa abierta, se enteran al confirmar. No se pierde plata
-- (la deuda bajó igual): queda un saldo a favor para imputar a mano. La mitigación barata es que la
-- pantalla del Monitor muestre **saldo del dashboard − lo prometido acá**, así adentro de la
-- pantalla donde se decide no hay doble asignación.
--
-- # Una promesa POR TRANSFERENCIA, no por cliente ni por conversación
--
-- Un cliente que debe $700.000 con el que se completa al abogado ($492.838) y se arranca con el
-- contador son DOS compromisos de la misma charla. Es el caso normal, no la excepción: se parte
-- para no mandarle de más a uno y empezar a bajar la deuda con otro.
--
-- ⛔ Correr a mano en el SQL Editor de Supabase, en la base de **BDI**. Idempotente.

create table if not exists compromisos_pago (
  id            uuid primary key default gen_random_uuid(),

  -- ── A quién se le paga ──────────────────────────────────────────────────────
  -- El id del proveedor en el DASHBOARD (su tabla `proveedores`). Referencia blanda entre
  -- sistemas: sin foreign key, porque esa tabla vive en otra base.
  acreedor_id       uuid not null,
  -- El nombre se copia igual, y no es redundancia: si el dashboard no contesta, la lista de
  -- promesas tiene que seguir diciendo a quién se le prometió.
  acreedor_nombre   text not null,

  -- 🔑 La cuenta destino se CONGELA acá. Si mañana cambia el CBU, este compromiso tiene que seguir
  -- diciendo a dónde fue la plata, no a dónde se manda hoy. Por eso se copian los datos y no se
  -- guarda el id de la cuenta.
  cuenta_alias      text,
  cuenta_cbu        text,
  cuenta_banco      text,
  cuenta_titular    text,

  -- ── Quién paga ──────────────────────────────────────────────────────────────
  -- El id del cliente en Gestión Nube. Sin foreign key: otro sistema.
  cliente_id        text,
  -- De qué GN salió ese id. Sin esto el id no se puede resolver: son padrones distintos.
  cliente_store     text not null default 'bdi',
  cliente_nombre    text not null,
  -- ⚠️ A nombre de quién viene la transferencia, que muchas veces NO es el cliente (la mujer, el
  -- hermano, la razón social). Es lo que va a mostrar el extracto, y sin esto la conciliación no
  -- cierra: la plata entra a nombre de alguien que no figura en ninguna deuda.
  titular_real      text,

  monto             numeric(15,2) not null check (monto > 0),
  -- Lo que entró DE VERDAD. Se llena al confirmar y puede ser menor que lo prometido: cuando pasa,
  -- este compromiso se cierra por lo que entró y se anota uno nuevo por lo que falta (ver `viene_de`).
  monto_confirmado  numeric(15,2),

  -- ── En qué anda ─────────────────────────────────────────────────────────────
  --   prometido   se lo pedimos al cliente
  --   transferido dice que ya está / llegó el comprobante
  --   confirmado  impactó en el dashboard  ← el único que cruza
  --   cancelado   se cayó
  estado            text not null default 'prometido',
  fecha_prometida   date,
  notas             text,

  -- ── El cruce al dashboard ───────────────────────────────────────────────────
  -- El número con el que se le habla a la puerta de escritura. Se genera al CREAR el compromiso y
  -- no al confirmar, para que un reintento de la confirmación —el celular sin señal, el botón
  -- apretado dos veces— mande el mismo y la puerta lo reconozca en vez de escribir los pagos otra
  -- vez. Es la mitad de la idempotencia: la otra mitad es el candado del dashboard.
  operacion_id      uuid not null default gen_random_uuid(),
  -- Lo que devolvió la puerta: los ids de los pagos creados y cómo se repartió. Es la trazabilidad
  -- para poder ir del compromiso al renglón del ledger sin buscar a ojo.
  pagos_dashboard   jsonb,

  -- Si nació porque otro entró incompleto, cuál. Deja ver la cadena de una deuda que se cobró en
  -- partes, que es cómo se cobra de verdad.
  viene_de          uuid references compromisos_pago(id) on delete set null,

  creado_en         timestamptz not null default now(),
  creado_por        text,
  actualizado_en    timestamptz not null default now(),
  actualizado_por   text,
  confirmado_en     timestamptz,
  confirmado_por    text,

  -- 🔴 El dominio cerrado en la BASE, no sólo en el validador del handler. Un estado inventado no
  -- rompería nada visible: la fila se guardaría y desaparecería de todos los cortes de la pantalla
  -- sin que nadie se entere. Mismo criterio que `pedidos_clientes.tipo`.
  constraint compromisos_pago_estado
    check (estado in ('prometido', 'transferido', 'confirmado', 'cancelado')),
  -- Un compromiso confirmado tiene que decir cuánta plata entró y con qué operación. Sin esto,
  -- "confirmado" podría significar dos cosas distintas y ninguna pantalla podría distinguirlas.
  constraint compromisos_pago_confirmado_completo
    check (estado <> 'confirmado' or (monto_confirmado is not null and pagos_dashboard is not null))
);

comment on table compromisos_pago is
  'Promesas de que un cliente le transfiere directo a un acreedor nuestro. Una por transferencia.';
comment on column compromisos_pago.cuenta_cbu is
  'CONGELADO al prometer: a dónde se mandó, no a dónde se manda hoy.';
comment on column compromisos_pago.operacion_id is
  'El número con el que se le habla a la puerta del dashboard. Nace con el compromiso, para que reintentar no duplique pagos.';

-- Lo que se mira primero: lo que todavía no cerró.
create index if not exists idx_compromisos_abiertos
    on compromisos_pago (estado, fecha_prometida) where estado in ('prometido', 'transferido');
-- "¿Cuánto le prometí ya a este acreedor?" — es la resta que evita prometer dos veces lo mismo.
create index if not exists idx_compromisos_acreedor
    on compromisos_pago (acreedor_id) where estado in ('prometido', 'transferido');
-- "¿Cuánto le pedí ya a este cliente?" — lo mismo, del lado del cliente.
create index if not exists idx_compromisos_cliente
    on compromisos_pago (cliente_id) where cliente_id is not null;
-- Un solo compromiso por operación: es lo que hace que reintentar sea seguro.
create unique index if not exists idx_compromisos_operacion
    on compromisos_pago (operacion_id);

-- 🔴 Cerrada para el navegador. RLS activada y SIN ninguna política: en el monitor la base se lee
-- desde el servidor con la service key (que saltea RLS), y el navegador no la toca — es lo que dejó
-- la Fase S. Sin esta línea, la anon key (que viaja en el bundle y es pública) podría leer nombres
-- de clientes y CBU. Misma convención que `buzon_mensajes`, `pedidos_clientes` y el resto.
--
-- ⚠️ Al correrla la primera vez, el SQL Editor de Supabase avisa "creates a table without enabling
-- Row Level Security" si esta línea no está: es exactamente esto lo que faltaba.
alter table compromisos_pago enable row level security;

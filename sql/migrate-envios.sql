-- Envíos del día: la hoja del cadete, que hasta hoy era una planilla de Google escrita a mano.
--
-- # Qué hueco tapa
--
-- La planilla `ENVIOS ZATTIA / BDI` no es una base de envíos: es un libro de caja de reparto en
-- moto. Se diagnosticó entera el 13-ago-2026 y lo que salió no fue "faltan datos", fue que **su
-- forma es el problema**:
--
--   · 492 de 2.261 filas (21,8%) no son un envío: son el encabezado del turno siguiente que se
--     filtró adentro del turno anterior, porque las secciones no siempre cierran con una fila en
--     blanco. Sumado a plantillas vacías y duplicados, **3 de cada 10 filas son ruido**.
--   · El 53,8% de las filas está en un turno que no dice si es mañana o tarde.
--   · `VENDEDOR` es texto libre: 55 formas distintas de escribir 16 personas.
--   · No hay marca, ni estado de entrega, ni localidad, ni fecha real por fila. Por eso el análisis
--     de tiempos, de fallas y de zona dio "no se pudo medir".
--
-- Nada de eso se arregla con una regla de carga más estricta. Se arregla dejando de escribir fechas
-- como encabezados: **cada campo que faltaba es una columna de acá**. La fecha y el turno dejan de
-- ser una convención de escritura y pasan a ser obligatorios; el vendedor sale de una lista cerrada
-- en la pantalla, no de lo que uno se acuerde de tipear.
--
-- El 90% de los repartos son órdenes de Tienda Nube y entran solos (`origen='tn'`); el 10% restante
-- son ventas por WhatsApp que se cargan a mano y tienen que seguir existiendo (`origen='manual'`).
--
-- # Por qué `store` es una columna y NO hay una tabla por marca
--
-- Mismo criterio que Canjes. El cadete sale con paquetes de BDI y de Zattia **en la misma mochila**:
-- el turno es uno, la rendición es una, y la planilla los mezcla a propósito porque es una única
-- vista de trabajo. Partir esto por marca rompería la operación real para ganar una prolijidad que
-- nadie pidió. Por eso la pantalla no tiene selector de marca.
--
-- Pero cada envío **sí** sabe de qué marca es, y para los que vienen de Tienda Nube sale solo (de
-- qué tienda vino la orden). Es la columna que el diagnóstico pedía, y no cuesta cargarla.
--
-- Vive en la base de BDI y en ninguna otra: `scripts/apply-envios.mjs` ni siquiera lee
-- `DATABASE_URL_ZATTIA`. Si alguna vez `select count(*) from envios_reparto` funciona en el Supabase
-- de Zattia, alguien corrió la migración donde no iba.
--
-- Correr con `node scripts/apply-envios.mjs`. Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Un envío: un paquete que sale a la calle un día, en un turno.
--
-- # La plata está en TRES campos y no en uno, porque son tres preguntas distintas
--
-- La planilla tenía dos columnas que se excluían entre sí —`ENVIOS PAGOS` (ya cobrado) y
-- `COSTO ENVIO` (a cobrar en la puerta)— y de ahí salían sus dos totales de cierre. Guardar un
-- único "monto" perdería cuál de las dos era, que es exactamente lo que el cadete necesita saber.
--
--   · `monto_envio`  — cuánto vale el envío. Existe siempre, se haya cobrado o no.
--   · `envio_pagado` — si ya se pagó por adelantado (transferencia, Mercado Pago, la web).
--   · `monto_pedido_a_cobrar` — el saldo del producto que hay que cobrar en la puerta.
--
-- 🔑 **Lo que el cadete tiene que cobrar NO se guarda: se deriva**, en `lib/envios/core.ts`. Un
-- total guardado y un total calculado que se pueden contradecir es la forma de que un día la
-- etiqueta diga una cosa y la pantalla otra. Se calcula en un solo lugar y se muestra en los dos.
--
-- Y no es un caso de borde: se midió que **en la mediana el 100% de lo que el cadete cobra es el
-- envío** —el producto ya se pagó antes por transferencia—, así que "no hay que cobrar nada de
-- producto" es lo normal, no la excepción.
--
-- # `datos jsonb` es la foto congelada de la orden
--
-- Mismo patrón que `agenda_promos`: es la fuente de la verdad de lo accesorio y las columnas de al
-- lado son proyecciones para filtrar y ordenar, así un campo nuevo viaja sin migración. Acá además
-- **congela** la orden de Tienda Nube tal como estaba al armar el reparto, igual que la vitrina de
-- Canjes: si el cliente cambia su dirección en TN después, la etiqueta ya se imprimió y salió a la
-- calle con la vieja. Lo que se guardó es lo que el cadete tiene en la mano.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists envios_reparto (
  id           text primary key,                    -- `en<epoch>_<rand>`, generado en el cliente
  store        text not null check (store in ('bdi', 'zattia')),
  -- Fecha y turno son COLUMNAS y son obligatorias: es todo el arreglo. En la planilla vivían en un
  -- encabezado de sección, y ahí es donde se perdía el 21,8% de las filas y el 53,8% de los turnos.
  fecha        date not null,
  turno        text not null check (turno in ('mañana', 'tarde')),
  origen       text not null default 'tn' check (origen in ('tn', 'manual')),
  orden_numero text,                                -- número de orden de TN; NULL si es manual

  -- Lo que va impreso en la etiqueta del cadete.
  cliente      text,
  telefono     text,                                -- crudo, como lo dio TN; el `549` lo arma la app
  direccion    text not null,
  piso_depto   text,
  localidad    text,                                -- reemplaza el proxy de "calle" del diagnóstico
  anotacion    text,                                -- "tocar timbre 2", "dejar en portería"

  -- La plata. Ver el bloque de arriba: son tres preguntas, no una.
  monto_envio            numeric(12,2) not null default 0,
  envio_pagado           boolean not null default false,
  monto_pedido_a_cobrar  numeric(12,2) not null default 0,

  -- 🔑 El estado no existía en la planilla, y por eso no se podía medir una sola entrega fallida.
  -- La lista es cerrada a propósito: un estado mal tipeado haría que el envío desaparezca de la
  -- pantalla del día sin que nadie entienda por qué.
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'preparado', 'despachado', 'entregado', 'no_entregado', 'reintento')),

  vendedor     text,                                -- quién lo vendió. Lista cerrada en la pantalla.
  cadete       text,                                -- quién lo llevó
  datos        jsonb not null default '{}'::jsonb,  -- la orden de TN congelada
  autor        text,                                -- perfil.name de quien lo cargó o lo tocó último
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- La consulta real es siempre la misma: "¿qué sale hoy?". Nunca se pide un rango largo.
create index if not exists idx_envios_dia on envios_reparto (fecha, turno);

-- 🔑 Traer el día dos veces no puede duplicar un envío. Es parcial a propósito: los manuales no
-- tienen número de orden, y varios NULL no chocan entre sí en un índice único — pero un manual
-- cargado dos veces sí tiene que poder existir (dos envíos distintos a la misma casa el mismo día
-- son dos paquetes, no un error).
create unique index if not exists idx_envios_orden_tn
  on envios_reparto (store, orden_numero)
  where origen = 'tn' and orden_numero is not null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- El cierre del turno: la rendición.
--
-- 🔑 **`pagado_al_cadete` es el único dato que hoy no existe en ningún lado.** La planilla dice
-- cuánto se cobra de envío pero nunca cuánto cuesta el reparto, así que jamás se supo si el envío
-- se subsidia o deja plata: el diagnóstico lo listó como "no se pudo medir" y no había forma de
-- sacarlo de los datos. Un número por turno lo cierra.
--
-- La ausencia de fila es "el turno no se cerró todavía", igual que en la agenda un pendiente sin
-- tildar no escribe nada. No se generan filas por adelantado.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists envios_turno (
  fecha            date not null,
  turno            text not null check (turno in ('mañana', 'tarde')),
  pagado_al_cadete numeric(12,2),                   -- NULL = no se cargó, que NO es cero
  rendido          numeric(12,2),                   -- lo que el cadete trajo de verdad
  cerrado_por      text,
  cerrado_en       timestamptz,
  datos            jsonb not null default '{}'::jsonb,
  primary key (fecha, turno)
);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS.
--
-- ⚠️ Va acá y no es opcional. `sql/migrate-rls.sql` (13-ago-2026) prendió RLS recorriendo las
-- tablas que existían **en ese momento**, y dejó las escrituras futuras cerradas con
-- `alter default privileges`. Pero prender RLS no queda como default: una tabla creada después
-- nace SIN RLS, y sería la única abierta de la base. El `revoke` de aquella migración ya le saca
-- el INSERT/UPDATE/DELETE a `anon`, así que esto es el segundo candado, no el único.
--
-- No lleva política de lectura para `anon`: el navegador nunca lee esta tabla directo. Todo pasa
-- por `api/_envios.js`, que usa la service key y no mira RLS. Y no debería leerla directo: acá hay
-- domicilios y teléfonos de clientes.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table envios_reparto enable row level security;
alter table envios_turno   enable row level security;

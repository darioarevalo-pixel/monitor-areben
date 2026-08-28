-- Insumos: lo que la empresa consume y no vende.
--
-- # Qué hueco tapa
--
-- Bolsas, rollos de etiquetas, ribbon, cajas, papel, yerba. Hoy viven en WhatsApp: medido sobre los
-- chats de 2026, **80 avisos** del tipo «estamos usando el último rollo de etiquetas zebra» o «no
-- hay más bolsas de despachos de zattia». El manual del puesto ya tiene la regla escrita —«los
-- insumos se piden con el ANTEÚLTIMO», porque con el último ya es tarde— y lo único que falta es el
-- lugar donde el hecho existe: qué hay, cuánto queda, a qué ritmo se gasta y cuánto se paga.
--
-- ⛔ **No es stock de mercadería.** Un insumo no existe en Gestión Nube, así que ni el espejo
-- (`productos`/`inventario`) ni el motor de conteos (`lib/conteo-deposito/`, que exige
-- `inventory_id`) sirven acá. Es el primer stock propio del monitor.
--
-- # Por qué NO tiene columna `store`
--
-- Mismo criterio que `agenda_items`, `novedades` y `manuales`: una caja de bolsas de consorcio no es
-- de BDI ni de Zattia, y Zattia no tiene `ZATTIA_SUPABASE_SERVICE_KEY`. Vive en la base de BDI y en
-- ninguna otra. Que un insumo sea de una marca sola sí pasa —«bolsas chicas de Zattia» y «bolsas
-- e-commerce de BDI» son dos insumos distintos— y para eso está `marcas`, que es una LISTA: un dato
-- que puede tener dos valores a la vez no puede ser un `store`. **Vacío quiere decir las dos.**
--
-- Correr con `node scripts/apply-insumos.mjs`. Idempotente.

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- El catálogo
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- # La unidad es UNA sola y todo se guarda en ella
--
-- Se compra una caja de 1.000 bolsas y se consume de a una bolsa. Si el libro guardara «1 caja» en
-- la compra y «3 bolsas» en el consumo, la resta mentiría sin fallar. Entonces: `unidad` es la
-- unidad del insumo y **todo movimiento viaja en ella**. `bulto`/`por_bulto` existen sólo para que
-- la pantalla ayude a tipear («3 cajas × 1.000 = 3.000 bolsas») y para mostrar el equivalente —
-- ⛔ no son una segunda unidad del libro.
--
-- # Los dos umbrales, y por qué son dos
--
-- `minimo` es la regla del manual: el anteúltimo rollo, la anteúltima caja. `dias_reposicion` es lo
-- que tarda en llegar, que Bruno marcó como el problema real de las bolsas («es lo que más demora
-- reponer»): un insumo que dura 9 días y tarda 15 en llegar ya está tarde aunque le queden diez.
-- Los dos disparan, y el aviso dice **cuál de los dos** fue. `dias_reposicion` en NULL = no se sabe
-- cuánto tarda, y entonces sólo corre el corte por unidades. ⛔ NULL no es cero.
--
-- # `consumo` es la mitad automática del ritmo
--
-- {modo:'por-venta', canal:'local'|'online'|'mayorista'|null, porVenta:1} → el ritmo sale de contar
-- las compras del día en ese canal. {modo:'manual'} o ausente → el ritmo lo mide el libro (lo que
-- se descontó a mano entre dos recuentos). Un insumo sin ritmo medible ⛔ no vale 0: vale `null`, y
-- la pantalla lo dice.
create table if not exists insumo (
  id              text primary key,                     -- `in<epoch>_<rand>`, generado en el cliente
  nombre          text not null,
  tipo            text not null,                        -- comercial | comestible | limpieza | oficina | otro
  unidad          text not null,                        -- unidad | rollo | caja | paquete | kg | litro | metro
  bulto           text,                                 -- cómo se compra: 'caja', 'bulto', 'pack'
  por_bulto       numeric,                              -- cuántas `unidad` trae un `bulto`
  marcas          jsonb   not null default '[]'::jsonb, -- [] = las dos
  minimo          numeric not null default 2,           -- el anteúltimo
  dias_reposicion integer,                              -- NULL = no se sabe cuánto tarda
  consumo         jsonb   not null default '{}'::jsonb, -- ver arriba
  activo          boolean not null default true,
  nota            text,
  autor           text,                                 -- perfil.name de quien lo cargó
  datos           jsonb   not null default '{}'::jsonb, -- lo accesorio viaja sin migración
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- La consulta real es siempre la misma: los prendidos, ordenados por tipo.
create index if not exists idx_insumo_activo on insumo (activo, tipo);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- El libro
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- # El stock NO es una columna: se suma del libro
--
-- Un número de stock contesta «cuánto hay» y ⛔ no contesta «desde cuándo falta», que es lo que el
-- aviso necesita para no decir «apareció hoy» todas las mañanas — `updated_at` no mide la espera.
-- Con el libro, la fecha del aviso se calcula: es la del movimiento que dejó el stock debajo del
-- mínimo. Y de yapa, el «historial de compras» es este mismo libro filtrado por `tipo='compra'`.
--
-- # `cantidad` es SIEMPRE positiva
--
-- El signo lo pone `SIGNO_POR_TIPO` en `lib/insumos/core.core.js`, en un solo lugar. Un signo
-- tipeado a mano es un stock negativo esperando, y además haría que el mismo dato («entraron 10»)
-- se pudiera escribir de dos formas.
--
-- # Un traslado son DOS filas
--
-- Subir bolsas del depósito al local es el movimiento más común («si me pueden subir del depo»).
-- Va como salida del origen + entrada al destino, con el mismo `grupo`. Con una sola fila y una
-- columna `destino`, **todo el que sume stock tendría que acordarse** de restar de un lado y sumar
-- del otro, y el que se olvide falla callado. Con dos filas, sumar el stock es una suma pelada.
--
-- # `recuento` corta el libro
--
-- No suma ni resta: FIJA cuánto hay en esa ubicación ese día. `stockPor()` toma el último recuento
-- de la ubicación y suma desde ahí. Es el snap/dif de los conteos de depósito, sin el Excel de GN.
--
-- # `precio_total`, no precio unitario
--
-- Lo que se sabe al pagar es lo que salió el bulto. El unitario se deriva (`precio_total /
-- cantidad`) y así una compra de 3 cajas a $12.000 no obliga a nadie a dividir a mano. 🔴 Un precio
-- en 0 es «todavía no lo sé», ⛔ no gratis: por eso es NULL cuando no se cargó, y el promedio de
-- referencia sólo mira los que tienen `precio_total > 0`.
create table if not exists insumo_movimiento (
  id           text primary key,                    -- `mv<epoch>_<rand>`
  insumo_id    text not null references insumo(id) on delete cascade,
  tipo         text not null,                       -- compra | consumo | traslado | recuento
  ubicacion    text not null,                       -- deposito | local-bdi | local-zattia
  cantidad     numeric not null,                    -- SIEMPRE positiva, en la unidad del insumo
  fecha        date not null,                       -- el día del hecho, ⛔ no el de la carga
  precio_total numeric,                             -- sólo en `compra`. NULL = no se cargó
  proveedor    text,                                -- texto libre: no hay padrón de proveedores
  comprobante  text,                                -- nº de factura o remito, si lo hay
  grupo        text,                                -- las dos patas de un traslado, o un pedido
  usuario      text,                                -- perfil.name de quien lo cargó
  nota         text,
  datos        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- La pregunta de la ficha: el libro de ESTE insumo, del más nuevo al más viejo.
create index if not exists idx_insumo_mov_insumo on insumo_movimiento (insumo_id, fecha desc);
-- El historial de compras, que es el que da el precio de referencia.
create index if not exists idx_insumo_mov_compra on insumo_movimiento (insumo_id, fecha desc) where tipo = 'compra';
-- Las dos patas de un traslado se buscan juntas.
create index if not exists idx_insumo_mov_grupo on insumo_movimiento (grupo) where grupo is not null;

-- Los valores cerrados se validan también en la base: el handler ya los frena, pero un script que
-- escriba derecho (la semilla, una corrección) no pasa por el handler.
do $$ begin
  alter table insumo add constraint insumo_tipo_ck
    check (tipo in ('comercial','comestible','limpieza','oficina','otro'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table insumo_movimiento add constraint insumo_mov_tipo_ck
    check (tipo in ('compra','consumo','traslado','recuento'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table insumo_movimiento add constraint insumo_mov_ubicacion_ck
    check (ubicacion in ('deposito','local-bdi','local-zattia'));
exception when duplicate_object then null; end $$;

-- 🔴 `cantidad` positiva es la mitad de la regla del signo: si la base aceptara negativos, el día
-- que alguien escriba derecho el signo quedaría escrito en dos lugares.
do $$ begin
  alter table insumo_movimiento add constraint insumo_mov_cantidad_ck check (cantidad >= 0);
exception when duplicate_object then null; end $$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- `sql/migrate-rls.sql` prendió RLS recorriendo las tablas que existían ese día; una tabla creada
-- después **nace SIN RLS** y quedaría abierta a la clave pública — ya pasó con el memo. Sin
-- políticas a propósito: el navegador nunca lee estas tablas derecho, todo pasa por
-- `api/_insumos.js`, que usa la service key y no mira RLS.
alter table insumo            enable row level security;
alter table insumo_movimiento enable row level security;

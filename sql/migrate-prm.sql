-- PRM y Recorridas — la relación con el proveedor, y el viaje a comprarle.
--
-- # Qué hueco tapa
--
-- El monitor sabe **qué le pedimos a un proveedor y qué llegó** (`recepcion_oc`, por el webhook del
-- sistema de Ingresos) y sabe **qué vendió lo que le compramos** (el espejo de GN, sólo Zattia).
-- Lo que no sabe es **quién es**: dónde queda el local, qué me pareció la última vez, qué producto
-- suyo me interesó y a qué precio, y qué quedó prometido. Eso vive hoy en una nota de texto, en los
-- lugares guardados de Google Maps y en la cabeza de Bruno, y por eso cada viaje a Flores empieza
-- de cero.
--
-- Estas seis tablas son esa mitad. Lo importante no es guardar la visita: es que **la ficha del
-- proveedor pueda cruzar lo que anoté con lo que ya está medido** —el cumplimiento de entrega y las
-- ventas— sin que nadie tenga que acordarse de nada.
--
-- # Un modelo, DOS secciones
--
-- `recorridas` (área Compras) escribe: el padrón de locales, el viaje y lo que se anota parado en
-- la galería, desde el celular. `prm` (área Proveedores) lee: la ficha, la historia y los
-- compromisos abiertos de todos los proveedores juntos.
--
-- ⛔ Por eso las tablas se llaman por lo que guardan y NO `prm_*` ni `recorrida_*`: la sección es el
-- nombre de una pantalla, y acá hay dos mirando lo mismo. La única excepción son `recorrida` y
-- `recorrida_parada`, que sí son de una sola —el viaje no existe fuera de la recorrida—.
--
-- # Vive en UNA sola base (BDI), sin columna `store`
--
-- Mismo primer argumento que `recepcion_oc`, y acá pesa más: «¿este local me sirve?» no es una
-- pregunta de BDI ni de Zattia. Un local de Avellaneda me vende para la marca que sea, y partirlo
-- por marca obligaría a cargar el mismo local dos veces y a que su historia quedara a la mitad en
-- cada lado. La marca aparece donde de verdad discrimina —`proveedor_interes.marca`, "esto lo veo
-- para BDI"— y ahí es opcional.
--
-- Correr con `node scripts/apply-prm.mjs`. Idempotente.

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · El local
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists proveedor_local (
  id          text primary key,                    -- `pl<epoch>_<rand>`, generado en el cliente
  nombre      text not null,
  -- En Flores la dirección de la calle no alcanza para volver a encontrarlo: lo que se busca es
  -- "Galería Punto Once, local 23". Van separados porque `galeria` es lo que se lee en la lista y
  -- `direccion` es lo único que entiende el geocoder.
  galeria     text,
  direccion   text,
  entre_calles text,
  localidad   text not null default 'Ciudad Autónoma de Buenos Aires',
  provincia   text not null default 'Ciudad Autónoma de Buenos Aires',
  -- La zona agrupa el viaje: 'Flores', 'Once', … Null en los que entraron sembrados desde las OCs,
  -- que todavía nadie clasificó. 🔑 Es lo que separa un local que se camina de un proveedor que se
  -- le compra por mail: la recorrida filtra por acá, así que un `null` NO entra a un viaje por
  -- accidente.
  zona        text,
  rubro       text,                                -- 'jeans', 'tejido', 'blusas' — texto libre a propósito

  -- ── Dónde queda, resuelto ───────────────────────────────────────────────────────────────────
  --
  -- 🔑 **Acá el punto SE GUARDA, al revés que en Envíos.** `api/_georef.js` no cachea nada y tiene
  -- razón: las direcciones de las clientas se corrigen seguido y un punto viejo sobreviviría a la
  -- corrección. Una galería de Avellaneda no se muda. `geo_usada` es **con qué forma de la
  -- dirección** contestó el geocoder (la escalera prueba de la más fiel a la más despojada): sin
  -- eso, un punto sospechoso no se puede revisar sin volver a consultar, y "Avellaneda 3200" a
  -- secas puede haber caído en otra Avellaneda.
  lat         double precision,
  lng         double precision,
  geo_usada   text,
  geo_en      timestamptz,

  instagram   text,
  telefono    text,
  contacto    text,                                -- el nombre de quien atiende

  -- 'por_visitar' nunca fui o quiero volver · 'visitado' fui y no compré · 'compro' es proveedor
  -- vivo · 'descartado' no me sirve.
  -- 🔑 **'descartado' y no 'eliminado'**: el local sigue existiendo y su historia también — es
  -- justamente la que evita volver a subir la escalera dentro de seis meses.
  estado      text not null default 'por_visitar',
  -- Cómo es el local, lo que no vence. ⛔ No es la opinión de una visita: ésa va en la visita, con
  -- su fecha.
  nota        text,

  -- ── Los dos enganches con lo que el sistema YA mide ─────────────────────────────────────────
  --
  -- 🔴 **Se tildan A MANO y eso es deliberado.** `proveedor_id_ingresos` es el id del sistema de
  -- Ingresos (el único id de proveedor estable que existe en todo el grupo) y `proveedor_gn` es el
  -- string `productos.proveedor` del espejo de Gestión Nube. Adivinarlos por nombre está medido que
  -- no se puede: de los 30 proveedores de las 79 OCs, `CHINA` se lee sola y `RHOVE` o `ASKDENIM`
  -- no. Y un enganche mal puesto es PEOR que ninguno: una ficha que ya muestra números de entrega
  -- y de venta no la vuelve a revisar nadie.
  -- ⚠️ `proveedor_gn` existe sólo del lado de Zattia — la columna `productos.proveedor` no está en
  -- la base de BDI—, así que en un local de BDI queda null para siempre y NO es un dato faltante.
  proveedor_id_ingresos integer,
  proveedor_gn          text,

  creado_por  text,
  creado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

do $$ begin
  alter table proveedor_local add constraint proveedor_local_estado
    check (estado in ('por_visitar', 'visitado', 'compro', 'descartado'));
exception when duplicate_object then null; end $$;

-- Un proveedor del sistema de Ingresos no puede colgar de dos locales: si colgara, la ficha de los
-- dos mostraría las mismas OCs y el cumplimiento se contaría dos veces. Parcial porque el null es
-- el caso normal (un local de Flores al que todavía no se le compró no tiene id de allá).
create unique index if not exists idx_proveedor_local_ingresos
  on proveedor_local (proveedor_id_ingresos) where proveedor_id_ingresos is not null;
create index if not exists idx_proveedor_local_zona on proveedor_local (zona, estado);
create index if not exists idx_proveedor_local_nombre on proveedor_local (lower(nombre));

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · La visita
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists proveedor_visita (
  id        text primary key,                      -- `pv<epoch>_<rand>`
  local_id  text not null references proveedor_local(id) on delete cascade,
  fecha     date not null,
  quien     text,
  opinion   text,
  puntaje   smallint,                              -- 1..5, opcional

  -- 🔴 **`compre` es un BOOLEANO y no lleva monto ni unidades, y eso es una decisión.** La compra
  -- se le manda por WhatsApp al sistema de Ingresos y vuelve por el webhook de la OC **contada**:
  -- unidades pedidas, unidades contadas, diferencia. Un monto tipeado acá al lado sería un segundo
  -- número para el mismo hecho, y el tipeado envejece — pero es el que está más a mano, así que es
  -- el que se termina leyendo. `que_compre` es texto para acordarse, no un registro.
  compre      boolean not null default false,
  que_compre  text,

  fotos     text[] not null default '{}',          -- urls del Blob (api/blob-upload.js)
  creado_en timestamptz not null default now()
);

do $$ begin
  alter table proveedor_visita add constraint proveedor_visita_puntaje
    check (puntaje is null or (puntaje between 1 and 5));
exception when duplicate_object then null; end $$;

-- "La última vez que fui" es la lectura de todas las pantallas.
create index if not exists idx_proveedor_visita_local on proveedor_visita (local_id, fecha desc);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · Lo que me interesó
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists proveedor_interes (
  id        text primary key,                      -- `pi<epoch>_<rand>`
  local_id  text not null references proveedor_local(id) on delete cascade,
  visita_id text references proveedor_visita(id) on delete set null,
  descripcion text not null,
  foto      text,

  -- 🔑 **Éste es el número que SÍ va, y es el opuesto exacto del caso de arriba.** Lo que se ve
  -- colgado en la galería no lo tiene ningún sistema: no hay OC, no hay factura, no hay nada. Y es
  -- lo único que contesta «¿me lo subieron?» la próxima vez. Va con `visto_en` al lado y no se
  -- toca nunca: un precio sin fecha no dice nada, y pisarlo con el nuevo borra la comparación, que
  -- es para lo que existe. Un precio nuevo es una FILA nueva.
  precio_visto numeric(12,2),
  visto_en   date not null,

  marca     text,                                  -- 'bdi' | 'zattia' | null — para qué lo veo
  -- 'mirando' lo tengo anotado · 'pedido' ya se lo pedí · 'descartado' lo miré y no va.
  estado    text not null default 'mirando',
  nota      text,
  creado_en timestamptz not null default now()
);

do $$ begin
  alter table proveedor_interes add constraint proveedor_interes_estado
    check (estado in ('mirando', 'pedido', 'descartado'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table proveedor_interes add constraint proveedor_interes_marca
    check (marca is null or marca in ('bdi', 'zattia'));
exception when duplicate_object then null; end $$;

-- Lo que se lee parado en el local: qué me interesaba de acá y sigue abierto.
create index if not exists idx_proveedor_interes_local on proveedor_interes (local_id, estado);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · Lo que quedó prometido
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists proveedor_compromiso (
  id        text primary key,                      -- `pc<epoch>_<rand>`
  local_id  text not null references proveedor_local(id) on delete cascade,
  visita_id text references proveedor_visita(id) on delete set null,
  que       text not null,
  -- 'yo' me comprometí (vuelvo el jueves, le paso los talles) · 'ellos' me prometieron (me guardan
  -- 20, me mandan la foto). 🔑 Van juntos y no en dos tablas porque la pregunta parado en el local
  -- es una sola: "¿qué quedó pendiente entre nosotros?".
  de_quien  text not null,
  -- 🔴 **El reloj es `para_cuando` y el "desde cuándo" es `creado_en`. ⛔ NUNCA `actualizado_en`.**
  -- Un campo que se mueve cada vez que alguien toca la fila no mide la espera: mide la última
  -- edición, y entonces corregirle una falta de ortografía al texto reinicia el atraso. Es el
  -- error que en este repo ya se cometió cuatro veces.
  para_cuando date,
  cumplido_en timestamptz,
  cumplido_nota text,
  creado_en timestamptz not null default now()
);

do $$ begin
  alter table proveedor_compromiso add constraint proveedor_compromiso_de_quien
    check (de_quien in ('yo', 'ellos'));
exception when duplicate_object then null; end $$;

-- La lectura que manda en el PRM: todos los abiertos, de todos los proveedores, por fecha.
create index if not exists idx_proveedor_compromiso_abiertos
  on proveedor_compromiso (para_cuando nulls last) where cumplido_en is null;
create index if not exists idx_proveedor_compromiso_local on proveedor_compromiso (local_id);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 5 · El viaje
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists recorrida (
  id      text primary key,                        -- `rc<epoch>_<rand>`
  fecha   date not null,
  zona    text,
  -- 'armando' se está eligiendo a quién ver · 'en_curso' estoy en la calle · 'cerrada' terminó.
  estado  text not null default 'armando',
  nota    text,
  creado_por text,
  creado_en timestamptz not null default now(),
  cerrada_en timestamptz
);

do $$ begin
  alter table recorrida add constraint recorrida_estado
    check (estado in ('armando', 'en_curso', 'cerrada'));
exception when duplicate_object then null; end $$;

create index if not exists idx_recorrida_fecha on recorrida (fecha desc);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 6 · Las paradas
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists recorrida_parada (
  id           text primary key,                   -- `rp<epoch>_<rand>`
  recorrida_id text not null references recorrida(id) on delete cascade,
  local_id     text not null references proveedor_local(id) on delete cascade,
  -- El orden que salió de ordenar por cercanía. Se GUARDA y no se recalcula al abrir: si se
  -- recalculara, tildar una parada movería a las demás de lugar en la lista mientras se camina.
  orden        integer not null default 0,
  visitado_en  timestamptz,
  salteado     boolean not null default false,
  -- La visita que salió de esta parada, si salió alguna. Null mientras no se anotó nada.
  visita_id    text references proveedor_visita(id) on delete set null
);

-- Un local no puede estar dos veces en la misma recorrida: sería una parada fantasma que nadie
-- tilda y la recorrida nunca terminaría de cerrar.
create unique index if not exists idx_recorrida_parada_natural
  on recorrida_parada (recorrida_id, local_id);
create index if not exists idx_recorrida_parada_orden on recorrida_parada (recorrida_id, orden);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- `sql/migrate-rls.sql` prendió RLS recorriendo las tablas que existían ese día; una tabla creada
-- después nace SIN RLS y quedaría abierta a la clave pública. Sin políticas a propósito: el
-- navegador nunca lee estas tablas derecho — todo pasa por `api/_prm.js`, que usa la service key
-- y no mira RLS.
alter table proveedor_local      enable row level security;
alter table proveedor_visita     enable row level security;
alter table proveedor_interes    enable row level security;
alter table proveedor_compromiso enable row level security;
alter table recorrida            enable row level security;
alter table recorrida_parada     enable row level security;

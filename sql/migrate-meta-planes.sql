-- Planes por pasos sobre la pauta de Meta: el motor que sobrevive a que se corte la llamada.
--
-- ⚠️ VA A UNA SOLA BASE, la de BDI, igual que `meta_ads_accion` y `meta_ads_campania_linea` y por el
-- mismo motivo: **la cuenta publicitaria es una sola** para las tres líneas. "Qué se está armando en
-- la cuenta" es un hecho único; partirlo por store daría dos mitades de la misma historia.
--
-- # Por qué hace falta una tabla y no alcanza con `meta_ads_accion`
--
-- `meta_ads_accion` registra UNA escritura: se pidió, se hizo o no, se cerró la fila. Sirve mientras
-- la operación entra en un request. Duplicar un conjunto con 6 avisos NO entra: son 7 POSTs, y el
-- plan Hobby corta la función a los 10 s. La tabla vieja no tiene dónde anotar "voy por el paso 3 de
-- 7" ni "el paso 4 se cortó y no sé si Meta lo aplicó", así que la operación se pierde entera.
--
-- # La invariante que lo sostiene: todo objeto que crea un plan lleva su MARCADOR en el nombre
--
-- No es cosmética. Es lo único que permite **adoptar en vez de reintentar**: si un POST que crea algo
-- se corta sin respuesta, el objeto puede haberse creado igual, y reintentar haría dos. Con el
-- marcador escrito ANTES del POST, la sonda va a Meta, lo busca por nombre y lo adopta. Es lo que hoy
-- hace a mano el sufijo de `duplicar` en `api/_meta-acciones.js`, elevado a regla del motor.
--
-- Correr con `node scripts/apply-meta-planes.mjs`. Idempotente.

create table if not exists meta_ads_plan (
  id             bigserial primary key,
  -- El candado del doble clic, igual que en `meta_ads_accion`: lo genera la pantalla al apretar.
  idem           text not null unique,
  -- 🔑 El sufijo con el que la sonda encuentra lo que este plan creó (` · #k3f9a1`). **Único**: dos
  -- planes con el mismo marcador harían que la sonda de uno adoptara el objeto del otro.
  marcador       text not null unique,
  creado         timestamptz not null default now(),
  actualizado    timestamptz not null default now(),
  quien          text not null,
  tipo           text not null,                   -- 'duplicar' | 'mover-plata'
  variante       text,                            -- p. ej. 'shallow-n'
  cuenta_id      text not null,
  -- 🔴 `not null`: sin línea no se planifica. Es el mismo 409 que corta una acción suelta —con las
  -- tres marcas en una cuenta, crear algo que nadie sabe de quién es no se arregla con un permiso—,
  -- y acá pesa más: un plan sin línea dejaría objetos nuevos que nadie puede accionar.
  linea          text not null,
  -- Lo PEDIDO, congelado al crear el plan. No se recalcula al avanzar: un plan que cambia de idea
  -- entre dos pasos no es un plan.
  entrada        jsonb not null default '{}'::jsonb,
  -- Los ids que van produciendo los pasos, para que el siguiente los use. Ver `sustituir()`.
  contexto       jsonb not null default '{}'::jsonb,
  -- Ensayo: arma los pasos y no escribe en Meta. Es el pre-vuelo de cada tanda que escribe.
  simulacro      boolean not null default false,
  -- Lock optimista del avance: dos pestañas no ejecutan el mismo paso. Es el tercer candado, por
  -- debajo del `idem` del plan y del `unique(plan_id, orden)` del paso.
  lock_hasta     timestamptz,
  -- Para los escalones en el tiempo (tanda 5): hasta cuándo no se toca. `null` = ya.
  proximo_en     timestamptz,
  -- 'pendiente' | 'en-curso' | 'hecho' | 'atascado' | 'cancelado'
  estado         text not null default 'pendiente',
  -- Por qué quedó atascado, en castellano. Es lo que se lee en la pantalla.
  detalle        text
);

create table if not exists meta_ads_plan_paso (
  id             bigserial primary key,
  plan_id        bigint not null references meta_ads_plan(id) on delete cascade,
  -- 🔑 La idempotencia POR PASO. Sin esto, dos avances simultáneos podrían insertar el mismo paso dos
  -- veces y el plan ejecutaría de más.
  orden          int not null,
  tipo           text not null,                   -- 'copiar-campania' | 'copiar-conjunto' | 'crear-aviso' | 'presupuesto' | 'nombre' | 'heredar-linea'
  -- En castellano, porque **es lo que se ve**: la pantalla muestra los pasos tal como están escritos
  -- acá. Un rótulo técnico obligaría a traducirlo en la UI, y ahí es donde se despegan.
  rotulo         text not null,
  -- 'pendiente' | 'en-curso' | 'hecho' | 'dudoso' | 'fallado' | 'salteado'
  estado         text not null default 'pendiente',
  intentos       int not null default 0,
  -- Lo que se le va a mandar a Meta, con los `{{n}}` que se resuelven con el `contexto` del plan.
  pedido         jsonb,
  -- El id que produjo este paso. Es lo que consume el paso siguiente.
  resultado_id   text,
  -- La marca única de ESTE paso dentro del plan (`· #k3f9a1-2`): con ella la sonda encuentra el
  -- objeto de este paso y no el de la copia de al lado.
  marca          text,
  detalle        text,
  ultimo_en      timestamptz,
  -- El header `X-Business-Use-Case-Usage`, igual que en `meta_ads_accion`: cuánto queda del cupo.
  uso            text,
  unique (plan_id, orden)
);

-- Las tres consultas reales: los planes vivos del Panel, el detalle de uno, y la sonda buscando por
-- marcador.
create index if not exists idx_meta_ads_plan_estado on meta_ads_plan (estado, creado desc);
create index if not exists idx_meta_ads_plan_linea  on meta_ads_plan (linea, creado desc);
create index if not exists idx_meta_ads_plan_paso   on meta_ads_plan_paso (plan_id, orden);

alter table meta_ads_plan      disable row level security;
alter table meta_ads_plan_paso disable row level security;

-- Agenda operativa: lo que hay que hacer o saber UN DÍA.
--
-- # Qué hueco tapa
--
-- El calendario que ya existe (`migrate-calendario.sql`) es editorial: es de Marketing, es por
-- marca, y habla de fechas comerciales. El local ni lo ve. Novedades y Manuales tampoco alcanzan:
-- una novedad dice "esto cambió, leelo una vez" y un manual dice "así se hace". **Ninguno de los
-- dos sabe decir "esto va hoy".** Eso es todo lo que agrega esta tabla.
--
-- # Por qué NO tiene columna `store`
--
-- Mismo criterio que `novedades` y `manuales`, y por los mismos dos motivos: una promoción bancaria
-- la define el banco, no BDI ni Zattia —duplicarla por marca duplicaría la carga y haría que la
-- misma promo apareciera dos veces al cambiar de marca—, y Zattia no tiene
-- `ZATTIA_SUPABASE_SERVICE_KEY`. Vive en la base de BDI y en ninguna otra.
--
-- Que una promo valga sólo para una marca sí es posible, y para eso está la columna `marcas`, que
-- es una LISTA: es un dato que puede tener dos valores a la vez, así que no puede ser un `store`.
-- **Vacío quiere decir las dos**, no ninguna.
--
-- Correr con `node scripts/apply-agenda.mjs`. Idempotente.

-- Una promoción bancaria: qué banco, con qué se paga, qué le dan al cliente y cómo se cobra.
--
-- # La vigencia va en DOS ejes, y no es redundante
--
-- `desde`/`hasta` es la ventana en que la promo existe; `regla` es qué días de esa ventana aplica.
-- "Los martes de agosto" son las dos cosas. Meterlo todo en la regla obligaría a escribir "todos los
-- martes entre el 1 y el 31" en un solo objeto y a desarmarlo entero para contestar "¿ya venció?",
-- que es la pregunta que más se hace. Separados, cada eje contesta lo suyo:
-- `hasta` dice si murió y `regla` dice si hoy toca.
--
-- `hasta` en NULL es una promo **sin fin anunciado**, no una vencida: los bancos publican varias así.
--
-- # `regla` es LA MISMA forma que va a usar un pendiente rutinario
--
-- "Todos los martes de Banco Nación" y "todos los martes hay que reponer la vidriera" son la misma
-- pregunta, y por eso hay un solo motor: `lib/agenda/reglas.core.js`. Las cinco formas válidas son
-- `unica | rango | diaria | semanal | mensual` y las valida el handler ANTES de escribir — una regla
-- mal formada se guarda igual, no aparece nunca, y nadie entiende por qué la promo no sale.
--
-- `datos jsonb` es la fuente de verdad de lo accesorio y las columnas de al lado son proyecciones
-- para filtrar y ordenar: un campo nuevo viaja sin migración.
create table if not exists agenda_promos (
  id          text primary key,                     -- `pr<epoch>_<rand>`, generado en el cliente
  banco       text not null,                        -- 'Banco Nación', 'Galicia', 'Naranja X'
  medio       text not null,                        -- credito | debito | app | qr | transferencia
  -- {tipo:'descuento',pct} | {tipo:'reintegro',pct,tope} | {tipo:'cuotas',n,sinInteres}.
  -- Van separados porque **se cobran distinto**: un descuento sale en el ticket, un reintegro no
  -- (lo devuelve el banco después, y por eso tiene tope), y las cuotas no son un porcentaje.
  beneficio   jsonb not null,
  regla       jsonb not null,                       -- ver arriba
  desde       date not null,
  hasta       date,                                 -- NULL = sin fin anunciado
  condiciones jsonb not null default '[]'::jsonb,   -- la letra chica, un renglón corto por condición
  pasos       text,                                 -- markdown: cómo se cobra, con el cliente delante
  canales     jsonb not null default '["mostrador"]'::jsonb,  -- mostrador | web
  marcas      jsonb not null default '[]'::jsonb,   -- [] = las dos
  activa      boolean not null default true,
  autor       text,                                 -- perfil.name de quien la cargó
  datos       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- La consulta real es siempre la misma: las que están prendidas y todavía no vencieron. El filtro
-- por día lo hace la regla en memoria (son pocas filas y la regla no es indexable en SQL).
create index if not exists idx_agenda_promos_vig on agenda_promos (activa, desde, hasta);

alter table agenda_promos disable row level security;

-- Friday memo: qué pasó esta semana, con fecha y con firma.
--
-- # Por qué NO tiene columna `store`
--
-- Mismo caso que `novedades`, y por el mismo motivo duro. El memo es de la EMPRESA, no de BDI ni de
-- Zattia: adentro tiene las tres líneas (BDI, Zattia y Stunned) y el acta habla de todo. Duplicarlo
-- por marca partiría el acta en dos y haría que "qué viene la próxima semana" tuviera dos
-- respuestas según con qué marca entraste. Una columna que sólo puede tener un valor es un campo
-- que miente.
--
-- Vive en la base de BDI y en ninguna otra. Además del criterio, está el motivo duro de siempre:
-- Zattia escribe con anon key en el `.env` local y un memo firmado no puede depender de eso.
--
-- Correr con `node scripts/apply-memo.mjs`. Idempotente.

-- ── La semana ────────────────────────────────────────────────────────────────────────────────────
--
-- `id` es el lunes: `w2026-08-10`. Estable, ordenable como texto y legible en un log. No hay
-- secuencia ni uuid a propósito: la semana YA tiene una identidad natural y una clave sintética
-- permitiría dos filas para la misma semana, que es el bug que nadie revisa.
--
-- # Las DOS fotos, y por qué no son una
--
-- `foto` son venta y pauta: un rango de fechas cerrado, que da la misma respuesta se pregunte
-- cuando se pregunte. Se congela cuando la semana termina y no antes.
--
-- `senales` son capital parado y pendientes: se mueven solos (`daysSinceLast` sube todos los días).
-- Se congelan **cuando se toman**, y por eso llevan su propio `senales_tomadas_at`: el memo tiene
-- que poder decir "capital parado al viernes 21", no dar a entender que es el cierre de la semana.
-- Guardarlas en la misma columna obligaría a un solo timestamp para dos cosas con fechas
-- distintas — y el que sobra siempre es el que se lee mal.
create table if not exists memo_semana (
  id                 text primary key,                 -- w<lunes ISO>
  ini                date not null,                    -- lunes
  fin                date not null,                    -- domingo
  estado             text not null default 'abierto',  -- abierto | cerrado
  foto               jsonb,                            -- venta + pauta, congeladas al cerrar
  foto_tomada_at     timestamptz,
  senales            jsonb,                            -- capital parado + pendientes, "al momento"
  senales_tomadas_at timestamptz,
  cerrado_at         timestamptz,
  cerrado_por        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_memo_semana_ini on memo_semana (ini desc);

-- ── El acta y los avances ────────────────────────────────────────────────────────────────────────
--
-- # 🔴 Por qué esto es una TABLA y no un jsonb dentro de `memo_semana`
--
-- Bruno y Darío escriben en el mismo memo, el mismo viernes. Con el acta en un solo documento, el
-- que guarda segundo pisa lo del primero — y no hay error, ni conflicto, ni forma de enterarse: el
-- párrafo simplemente ya no está. Es exactamente el escalón que ya mordió una vez en el mailer.
--
-- Con la PK en `(memo_id, bloque, clave, autor)` cada guardado toca UNA fila, la suya, y no hay
-- nada que pisar. De paso el acta queda firmada sin campo extra: la firma ES parte de la clave.
--
-- `bloque` es `acta` (los siete temas) o `avance` (los ocho sistemas). Las claves válidas las
-- valida el servidor contra `lib/memo/semana.core.js` — acá no hay CHECK a propósito: agregar un
-- tema no puede pedir una migración, y una lista de valores escrita en dos lados se desincroniza.
create table if not exists memo_campo (
  memo_id    text not null references memo_semana(id) on delete cascade,
  bloque     text not null,                    -- acta | avance
  clave      text not null,                    -- el tema, o el sistema
  autor      text not null,                    -- perfil.name, NUNCA del body
  texto      text not null default '',
  updated_at timestamptz not null default now(),
  primary key (memo_id, bloque, clave, autor)
);

create index if not exists idx_memo_campo_memo on memo_campo (memo_id);

-- ── 🔴 RLS PRENDIDA, Y SIN NINGUNA POLÍTICA ──────────────────────────────────────────────────────
--
-- Estas dos líneas decían `disable` y eso abría el memo entero a internet. Medido el 15-ago-2026:
-- con la anon key —que se descarga sin login desde un chunk público de `monitor.arebensrl.com`—
-- `memo_campo` devolvía las ocho filas y `memo_semana` la semana. De las 48 tablas del esquema eran
-- **las dos únicas** que entregaban datos: todas las demás las tapa `migrate-rls.sql`, que prende
-- RLS en bucle sobre lo que existía el 13-ago. El memo nació después y llegó con el `disable`
-- puesto, así que se saltaba ese candado.
--
-- 🔑 **`alter default privileges` (migrate-rls.sql:179) sólo revoca ESCRITURA sobre las tablas
-- futuras, nunca la lectura.** Por eso una tabla nueva nace legible por `anon` y hay que prenderle
-- RLS a mano: el `grant select ... to anon` de la línea 170 es a nivel esquema y la alcanza sola.
-- Escribir ya estaba cerrado (INSERT/UPDATE/DELETE con la anon key dan 42501); lo que estaba
-- abierto era leer, que en el memo es justo lo que importa: el acta, los avances, y al cerrar la
-- semana la foto de venta por línea y el capital parado.
--
-- Sin política de SELECT, `anon` lee CERO filas. Los handlers entran con la service key, que se
-- saltea RLS — y que está en Vercel, probado por el hecho de que guardar el memo funciona en prod
-- (con la anon key de fallback la escritura habría dado permiso denegado).
alter table memo_semana enable row level security;
alter table memo_campo enable row level security;

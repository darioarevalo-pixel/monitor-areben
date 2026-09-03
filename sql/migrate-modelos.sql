-- Modelos: la ficha de cada modelo que trabaja con nosotros.
--
-- # Qué hueco tapa
--
-- Lo pidió Bruno el 3-sep-2026, punto 6 de los siete: *«Sección en monitor de Model Management -
-- fichas - Booker - Portafolio con mejores fotos de la modelo con nosotros. Principalmente para
-- análisis. También que se pueda agregar ideas, modelos, como si fuese una base de datos»*.
--
-- Hoy el dato existe en la cabeza de quien estuvo en la sesión: cómo se llama, quién la representa,
-- qué talle usa, cuánto mide y si vale la pena volver a llamarla. Cuando alguien tiene que armar la
-- próxima producción, la lista de a quién llamar se reconstruye preguntando por WhatsApp.
--
-- 🔑 **El primer lector de esta tabla NO es esta sección: es la sesión de fotos.** El campo
-- `modelo` de una solicitud (`lib/sesionfotos/modelo.ts`, 3-sep-2026) se tipea a mano justamente
-- porque este padrón no existía; su encabezado ya dice que «cuando exista la ficha de la modelo
-- este campo pasa a salir de ahí». Por eso el talle y la altura de acá se guardan **con la misma
-- normalización** que los de la sesión (`lib/modelos/core.core.js`, que es de donde ahora los
-- importa `lib/sesionfotos/modelo.ts`) — ⛔ dos formas de escribir «M» son dos talles distintos
-- para cualquier cosa que después agrupe.
--
-- # Por qué NO tiene columna `store`
--
-- Mismo criterio que `insumo`, `agenda_items`, `novedades` y `manuales`: **la misma modelo hace las
-- dos marcas**, y Zattia no tiene `ZATTIA_SUPABASE_SERVICE_KEY`. Vive en la base de BDI y en
-- ninguna otra. Que una trabaje sólo para una marca sí pasa, y para eso está `marcas`, que es una
-- LISTA: un dato que puede tener dos valores a la vez ⛔ no puede ser un `store`.
-- **Vacío quiere decir las dos.**
--
-- # Lo que NO está acá, a propósito
--
-- ⛔ **Plata.** Un cachet en esta tabla lo vería todo el que ve la sección, y el permiso de Modelos
-- ⛔ no es el de la liquidación. Si el cachet tiene que entrar, entra por una puerta con permiso
-- propio, como `_costos.js`.
-- ⛔ **El portafolio.** Las fotos van al Blob (`api/blob-upload.js`) y son el segundo paso; esta
-- tabla es el padrón.
--
-- Correr con `node scripts/apply-modelos.mjs`. Idempotente.
create table if not exists modelo (
  id              text primary key,                     -- `mo<epoch>_<rand>`, generado en el handler
  -- Cómo la llamamos. Es lo único obligatorio: sin nombre no hay a quién volver a llamar.
  -- ⚠️ Al revés que en la sesión, donde lo obligatorio es el TALLE: ahí el dato que sirve es el que
  -- sale a la descripción del producto y el nombre puede no saberse; acá el nombre ES la ficha.
  nombre          text not null,
  instagram       text,                                 -- sin @, normalizado
  telefono        text,
  mail            text,
  -- Quién la representa. Las tres en NULL = **directa**, que es lo más común acá y ⛔ no es un dato
  -- faltante: la pantalla lo dice con todas las letras en vez de dejar tres guiones.
  agencia         text,
  booker          text,                                 -- la persona que la agenda
  booker_contacto text,
  -- El talle que USA (⛔ no el que le queda a la prenda). Es lo que sale a la ficha del producto por
  -- `fraseDeModelo`. NULL = todavía no se sabe: ⛔ no se inventa.
  talle           text,
  altura          text,                                 -- '1,70 m', normalizada. NULL = no se sabe.
  -- busto / cintura / cadera en cm y calzado. Va en jsonb y no en cuatro columnas porque se leen
  -- siempre juntas y ninguna se filtra ni se ordena. ⛔ Un vacío es ausente, NUNCA 0.
  medidas         jsonb not null default '{}'::jsonb,
  -- activa | archivada. ⛔ No hay «no trabajar más» como estado: eso es una nota, y el motivo lo
  -- escribe una persona. Archivada sigue existiendo (VOCABULARIO.md §1.4) y por eso ⛔ no se borra:
  -- lo que fotografió el año pasado sigue estando en las sesiones.
  estado          text not null default 'activa',
  marcas          jsonb not null default '[]'::jsonb,   -- [] = las dos
  nota            text,
  autor           text,                                 -- quién la cargó o la tocó última
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Buscar por nombre es lo único que hace la pantalla al abrir.
create index if not exists idx_modelo_nombre on modelo (lower(nombre));

-- Igual que `insumo` y `solicitudes`: el gate es el login server-side de `api/_modelos.js`
-- (service key), ⛔ no RLS. El navegador no le pide una sola fila a esta tabla.
alter table modelo disable row level security;

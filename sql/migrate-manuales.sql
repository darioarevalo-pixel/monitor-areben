-- Manuales: cómo se hace cada cosa. El procedimiento de trabajo, no el paso a paso de la pantalla.
--
-- Vive en la misma base que `novedades` y por el mismo motivo (ver ese `.sql`): un manual de "cómo
-- se carga una falla" no cambia según la marca.
--
-- # `seccion` es opcional, y ahí está todo el diseño
--
-- Un manual puede colgar de una pantalla del monitor (y entonces esa pantalla muestra el botón
-- "Cómo se usa") o no colgar de ninguna: "cómo se cierra la caja", "cómo se pide un ingreso a
-- China". Con la sección como clave primaria habría que inventar keys falsas para lo segundo, y
-- esas keys después ensucian el nav.
--
-- El **índice único parcial** es lo que garantiza que una sección tenga UN manual y no tres, y eso
-- es lo que hace trivial el botón del encabezado: se busca por `seccion` y hay uno o no hay.
--
-- Correr con `node scripts/apply-manuales.mjs`. Idempotente.

create table if not exists manuales (
  id         text primary key,
  seccion    text,                                  -- key de sección, o null si no es una pantalla
  titulo     text not null,
  cuerpo     text not null,                         -- el mismo markdown que las novedades
  orden      integer not null default 0,
  autor      text,
  -- Un manual a medio escribir no ayuda a nadie: el botón "Cómo se usa" NO aparece si no está
  -- publicado, en vez de abrir un cartel vacío.
  publicado  boolean not null default false,
  datos      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_manuales_seccion on manuales (seccion) where seccion is not null;
create index if not exists idx_manuales_orden on manuales (orden, titulo);

alter table manuales disable row level security;

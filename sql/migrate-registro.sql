-- El registro de qué migración corrió en qué base.
--
-- ⚠️ ESTO VA EN LAS DOS BASES. Es aditivo y no toca ninguna tabla existente.
--
-- POR QUÉ
-- -------
-- `sql/` tiene 40 archivos y `scripts/` tiene 24 `apply-*.mjs`, o sea que ~15 migraciones se
-- corrieron pegando SQL en la consola de Supabase y no dejaron rastro. Cinco `.sql` ni siquiera
-- dicen a qué base van. Y hay tandas numeradas —`migrate-fallas` 1→4, `migrate-devoluciones` 1→3,
-- `migrate-reclamos-4/5`— que implican un orden que nadie declara ni verifica.
--
-- Nada de esto rompe hoy, porque las migraciones son idempotentes (`create table if not exists`).
-- Lo que falta no es protección: es **saber**. Con dos bases y dos personas tocando el repo, la
-- pregunta "¿esto ya está en Zattia?" hoy sólo se contesta conectándose y mirando. Eso ya costó
-- caro una vez en este repo por otro motivo: `migrate-refresco-vistas.sql` estuvo sin aplicar en
-- una base mientras el módulo caía al camino viejo en silencio.
--
-- CÓMO SE USA
-- -----------
-- No hay que acordarse de nada: `scripts/apply-registro.mjs` lo crea, y de ahí en más cada
-- `apply-*.mjs` puede anotar lo suyo con una línea. Para ver el estado de las dos bases:
--
--     node scripts/apply-registro.mjs           # simulación: muestra qué hay en cada una
--     node scripts/apply-registro.mjs --aplicar # crea la tabla y siembra lo que ya se aplicó
--
-- 📌 **La siembra es una declaración, no una detección.** El script marca como aplicadas las
-- migraciones cuyas tablas EXISTEN en esa base, que es lo más cerca de la verdad que se puede
-- llegar mirando desde afuera. Una migración que sólo agregó una columna no se detecta así y hay
-- que anotarla a mano — está dicho acá para que nadie lea este registro como si fuera exacto desde
-- el día uno. De acá en adelante sí lo es.

create table if not exists migraciones_aplicadas (
  archivo     text primary key,          -- 'migrate-canjes.sql', tal cual el nombre en sql/
  aplicada_at timestamptz not null default now(),
  -- 'sembrada' = deducida de que su tabla existe (ver arriba). 'apply' = la corrió un script.
  -- 'manual' = alguien la pegó en la consola y la anotó. Distinguirlo importa: de las sembradas
  -- sabemos que ALGO se aplicó, no que se aplicó ESTA versión del archivo.
  origen      text not null default 'apply',
  nota        text
);

comment on table migraciones_aplicadas is
  'Qué migración de sql/ corrió en ESTA base. Ver el encabezado de sql/migrate-registro.sql.';

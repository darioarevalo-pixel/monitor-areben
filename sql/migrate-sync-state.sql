-- Estado del sync incremental. Reemplaza a los archivos .last-sync / .last-sync-zattia,
-- que se escribían en el cwd del runner de GitHub Actions y se perdían al terminar
-- cada corrida: readLastSync() caía SIEMPRE al default, así que el sync "incremental"
-- nunca leía estado previo. Consecuencias del bug (sync-diario.js):
--   1. las ventas se barrían desde 2025-01-01 en cada corrida (ineficiente, no roto:
--      el upsert es idempotente).
--   2. productosPendiente era siempre true → el "sync semanal de productos" corría
--      TODOS los días en vez de una vez por semana.
--
-- Se aplica a mano en el SQL Editor de cada base (BDI y Zattia), como el resto de
-- sql/. El script igual se banca que la tabla no exista todavía: si falta, degrada
-- al comportamiento viejo (barrer desde 2025-01-01) en vez de romper.
--
-- clave = nombre del sync ('diario'), por si en el futuro hay más de uno por base.

create table if not exists sync_state (
  clave text primary key,
  ventas_date text,      -- 'YYYY-MM-DD' del último sync de ventas
  productos_date text,   -- 'YYYY-MM-DD' del último sync de productos
  updated_at timestamptz not null default now()
);

-- Lo que la purga del espejo de ventas borra queda GUARDADO en `ventas_purgadas` (libro de stock, 14-oct-2026).
-- Se aplica en las dos bases (`node scripts/aplicar-sql.mjs sql/migrate-ventas-purgadas.sql ventas`)
-- ANTES de publicar el sync que la escribe. Sin la tabla el sync purga igual que hoy y lo avisa en `problemas[]`.
--
-- 🔑 POR QUÉ EXISTE. Cuando GN borra una venta (o le saca una prenda), el sync la purga del espejo y no
-- queda NADA: GN devuelve el stock y el libro ⛔ sabe por qué. Si la venta es de DESPUÉS de la apertura
-- del libro, el libro la tenía y la anula solo; si es de ANTES (14-oct: un pedido mayorista borrado y
-- rehecho el 13-oct), el libro nunca la tuvo y la diferencia sale como `gn_sin_causa`. Con la fila guardada,
-- el motor (`areben-motor`, fuente `gn_borrada`) le pone la anulación que falta.
-- Además es la vuelta atrás de la purga diaria: lo borrado ya no existe en GN.
--
-- Una fila por venta purgada (`tabla = 'ventas'`, con sus renglones en `detalles`) o por renglón purgado de
-- una venta que sigue (`tabla = 'venta_detalles'`). ⛔ se edita ni se borra: sólo se agrega.
--
-- PRECONDICIONES: ninguna (tabla nueva).
--
-- VERIFICACIÓN:
--   select tabla, count(*), max(purgada_en) from ventas_purgadas group by 1;
--   select relrowsecurity from pg_class where relname = 'ventas_purgadas';   -- true
--
-- ROLLBACK:
--   drop table if exists ventas_purgadas;

create table if not exists ventas_purgadas (
  id          bigserial   primary key,
  purgada_en  timestamptz not null default now(),
  tabla       text        not null check (tabla in ('ventas', 'venta_detalles')),
  venta_id    bigint      not null,
  fila        jsonb       not null,        -- la fila tal como estaba en el espejo
  detalles    jsonb                        -- tabla = 'ventas': sus renglones (la FK los borra en cascada)
);

create index if not exists ventas_purgadas_en_idx on ventas_purgadas (purgada_en);

-- Como el resto del espejo: sólo la conexión de servicio (y el rol `motor`, con bypassrls).
alter table ventas_purgadas enable row level security;

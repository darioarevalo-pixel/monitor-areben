-- Caja, fase B: la CALCULADORA DE BILLETES (Bruno, 5-oct-2026). Correr en el proyecto Supabase de
-- ZATTIA, ANTES del push: el handler lee estas dos columnas en cada consulta del turno, y sin ellas
-- la pestaña Caja ⛔ carga (ni abre ni cierra turnos).
--
-- `conteos`: los billetes contados del turno. Forma:
--   { apertura:   { billetes: {"20000": 3, …}, total, en, por },
--     intermedios: [{ billetes, total, esperado, diferencia, en, por }, …],
--     cierre:     { billetes, total, esperado, diferencia, en, por } }
--   El total lo recalcula el servidor (`lib/caja/conteo.core.js`) y tiene que ser igual al fondo o al
--   contado: el conteo ⛔ puede decir una cosa y el turno otra. Un turno sin calculadora queda en null.
--
-- `abierto_por_usuario`: quién abrió, con un dato que ⛔ cambia (el mail del padrón, o el nombre si
--   ⛔ tiene). `abierto_por` guarda el nombre para mostrar. Lo usa la fase C: el POS sólo lo abre la
--   cuenta que abrió la caja.
--
-- VERIFICACIÓN (tiene que dar las dos filas):
--   select column_name, data_type from information_schema.columns
--   where table_name = 'caja_turno' and column_name in ('conteos', 'abierto_por_usuario') order by 1;

alter table caja_turno add column if not exists conteos jsonb;
alter table caja_turno add column if not exists abierto_por_usuario text;

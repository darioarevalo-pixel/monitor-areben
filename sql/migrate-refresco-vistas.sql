-- =============================================================================
-- Refresco de las vistas materializadas: una función por vista, con tiempo propio
-- =============================================================================
--
-- POR QUÉ EXISTE
--
-- `refresh_all_views()` refresca las TRES vistas dentro de una sola sentencia, y
-- el `statement_timeout` de la API de Supabase es de **8 segundos**. Las tres
-- juntas ya no entran: desde el 23-jul-2026 la llamada muere todos los días con
--
--     canceling statement due to statement timeout   (SQLSTATE 57014)
--
-- Como el sync solo escribía un WARN y seguía, el job de GitHub terminaba en
-- VERDE y nadie se enteró. Las vistas quedaron congeladas una semana: Ventas
-- mensuales mostraba julio incompleto (428 ventas contra 526 reales en BDI) y
-- seguía contando ventas de junio que la purga ya había borrado.
--
-- QUÉ CAMBIA
--
--   1. Una función por vista. Cada refresco arranca su propio presupuesto de
--      tiempo en vez de que las tres se repartan uno.
--   2. `SET statement_timeout = '120s'` en cada una. Los 8 segundos de la API no
--      alcanzan ni para la más liviana. 120s es holgado contra lo que tardan hoy
--      y queda por debajo del corte HTTP de la pasarela, así que un refresco
--      lento falla como error de SQL (que sabemos leer) y no como conexión
--      cortada (que no distingue "tardó" de "se rompió").
--
-- `refresh_all_views()` se mantiene —con el mismo timeout— para que nada que la
-- llame de antes deje de andar.
--
-- LA MÁS PESADA es `fundas_por_modelo_mes`: llama a `normalize_iphone_model()`
-- dos veces por renglón sobre las ~120.000 filas de `venta_detalles` de BDI. Si
-- algún día 120s tampoco alcanzan, ese es el lugar para mirar primero.
--
-- OJO CON EL CANDADO: `REFRESH MATERIALIZED VIEW` (sin CONCURRENTLY) bloquea las
-- lecturas de esa vista mientras corre. A las 5 de la mañana no molesta a nadie.
-- Si algún día molesta, la salida es `REFRESH ... CONCURRENTLY`, que no bloquea
-- pero exige crear antes un índice UNIQUE en cada vista.
--
-- CÓMO SE APLICA
--
--   SQL Editor de Supabase → pegar esto entero → Run.
--   **Hay que hacerlo en las DOS bases: la de BDI y la de Zattia.**
--
--   Mientras no se aplique, el sync sigue andando: detecta que las funciones no
--   existen y cae solo a `refresh_all_views()`, como hasta ahora.
--   Ver scripts/lib/refrescar-vistas.mjs.
-- =============================================================================


CREATE OR REPLACE FUNCTION refresh_ventas_por_mes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW ventas_por_mes;
END;
$$;


CREATE OR REPLACE FUNCTION refresh_ventas_por_categoria_mes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW ventas_por_categoria_mes;
END;
$$;


CREATE OR REPLACE FUNCTION refresh_fundas_por_modelo_mes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW fundas_por_modelo_mes;
END;
$$;


-- La de siempre, ahora con tiempo suficiente. Queda por compatibilidad: el sync
-- llama a las de arriba, una por una.
CREATE OR REPLACE FUNCTION refresh_all_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW ventas_por_mes;
  REFRESH MATERIALIZED VIEW ventas_por_categoria_mes;
  REFRESH MATERIALIZED VIEW fundas_por_modelo_mes;
END;
$$;


-- El sync entra con la service key; el resto de la app no tiene por qué poder
-- disparar un refresco.
--
-- ⚠️ VA CONTRA `PUBLIC`, NO CONTRA `anon`. En Postgres toda función nace con
-- EXECUTE otorgado a PUBLIC, y `anon` llega por ahí: revocarle a `anon` no le
-- saca nada. La primera versión de este archivo hacía justamente eso y quedó
-- comprobado que con la anon key —que viaja en el bundle del browser, ver
-- lib/cuentas.ts— cualquiera podía disparar un refresco: HTTP 204 en las dos
-- bases. Un refresco toma un candado exclusivo sobre la vista, así que llamarlo
-- en loop es una forma barata de tirar abajo Ventas mensuales.
--
-- Después de revocar a PUBLIC hay que devolverle el permiso a `service_role`
-- explícitamente, que es con quien entra el sync.
REVOKE EXECUTE ON FUNCTION refresh_ventas_por_mes()            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION refresh_ventas_por_categoria_mes()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION refresh_fundas_por_modelo_mes()     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION refresh_all_views()                 FROM PUBLIC;

GRANT EXECUTE ON FUNCTION refresh_ventas_por_mes()             TO service_role;
GRANT EXECUTE ON FUNCTION refresh_ventas_por_categoria_mes()   TO service_role;
GRANT EXECUTE ON FUNCTION refresh_fundas_por_modelo_mes()      TO service_role;
GRANT EXECUTE ON FUNCTION refresh_all_views()                  TO service_role;


-- ── Verificación ─────────────────────────────────────────────────────────────
-- Después de correr lo de arriba, esto debería devolver las 4 funciones con su
-- `statement_timeout=120s` en la columna de configuración.
--
--   SELECT p.proname, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname LIKE 'refresh%'
--   ORDER BY p.proname;

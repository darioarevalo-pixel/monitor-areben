-- Escalón 4 de la Fase S: sacarle a `anon` el espejo de Gestión Nube.
--
--   `inventario`                 catálogo con SKU, código de barras y stock POR LOCAL
--   `ventas_por_mes`             cuántas ventas y cuántas unidades por mes y por canal
--   `ventas_por_categoria_mes`   lo mismo, abierto por categoría
--   `fundas_por_modelo_mes`      qué modelo de funda vende cuánto, mes a mes
--
-- Las dos bases. Es el último objeto que quedaba abierto: con esto, la anon key que viaja en el
-- bundle no entrega ni un dato del negocio.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ⛔ PRECONDICIÓN — ESTO SE APLICA DESPUÉS DE DEPLOYAR, NO ANTES
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 **Esto toca el ETL**, como la pieza B del escalón 3 y a diferencia de la A. `inventario` y las
-- tres vistas están en la carga que corre para las 14 personas: aplicado con el deploy viejo
-- sirviéndose, **el Monitor no abre** — PostgREST corta con "permission denied" y `traerDatos`
-- lanza.
--
-- Los once lectores del navegador ya se mudaron, pero **ninguno cambió una línea**: el desvío vive
-- en `pedir()` (`lib/supabase/rest.ts`), que es el embudo por donde pasan todos, y del otro lado
-- está `api/_espejo.js` con la clave de servicio.
--
-- Orden: deployar → abrir el Monitor con el IndexedDB borrado y ver Ventas mensuales, Fundas por
-- modelo, Reposición, Exhibición y Ubicaciones → recién ahí correr esto.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QUÉ CIERRA, MEDIDO
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Con la anon key desde afuera, el 14-ago-2026:
--
--   inventario                 7.195 filas en BDI · 3.520 en Zattia
--   ventas_por_mes               117 ·     73
--   ventas_por_categoria_mes     270 ·    578
--   fundas_por_modelo_mes     15.660 ·      0   (Zattia no vende fundas)
--
-- 📌 **A las vistas materializadas el RLS no les aplica**: Postgres no se los evalúa. Viven del
-- `grant select`, así que un `alter … enable row level security` acá no haría nada y el revoke es
-- el único cierre que existe. `inventario` sí tiene RLS desde el 13-ago, pero su política dice
-- `true` porque la app la leía con la anon: el que decide es el grant.
--
-- 🔑 **Se revoca la TABLA entera, no columnas.** En `productos` y `ventas` había que enumerar las
-- que sí, porque el navegador seguía necesitando algunas. Acá no queda ninguna del lado del
-- navegador: la consulta entera se mudó al servidor.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- CÓMO VERIFICAR DESPUÉS (el script hace 1; el 2 es a mano)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- 1. `has_table_privilege('anon', 'public.inventario', 'SELECT')` = false, y lo mismo con las tres
--    vistas y con `authenticated`; y `service_role` en true en las cuatro, con filas.
-- 2. Con la anon key de cada marca, contra la API de verdad:
--        curl -H "apikey: $ANON" "$URL/rest/v1/inventario?select=sku&limit=1"       → 401
--        curl -H "apikey: $ANON" "$URL/rest/v1/ventas_por_mes?select=mes&limit=1"   → 401
--        curl -H "apikey: $ANON" "$URL/rest/v1/productos?select=id&limit=1"         → 200 (no se tocó)
--    Y en el Monitor, con el IndexedDB borrado: que ABRA, que Ventas mensuales tenga los 27 meses,
--    que Talles/Colores/Proveedores sigan mostrando el rango largo (sus meses salen de las vistas),
--    y que Reposición, Exhibición y Ubicaciones traigan stock.
--
-- Rollback: al final del archivo.

do $$
declare
  objeto text;
  -- `inventario` es una tabla y las otras tres son vistas materializadas. `revoke` no distingue, y
  -- `to_regclass` tampoco: las dos cosas son relaciones.
  objetos text[] := array['inventario', 'ventas_por_mes', 'ventas_por_categoria_mes', 'fundas_por_modelo_mes'];
begin
  foreach objeto in array objetos loop
    if to_regclass('public.' || objeto) is null then
      -- No es un error: el esquema de las dos marcas no es idéntico y esto tiene que poder correr
      -- en las dos sin ramas.
      raise notice '% no existe en esta base, no hay nada que cerrar', objeto;
      continue;
    end if;

    -- `authenticated` va junto con `anon` porque hoy son lo mismo: el Monitor no usa Supabase Auth,
    -- así que nadie se autentica contra esta base desde el navegador.
    execute format('revoke select on public.%I from anon, authenticated', objeto);
    raise notice '% → cerrado para anon y authenticated', objeto;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — si el Monitor no abre y hay que volver YA (dejarlo comentado)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
--     begin;
--     grant select on public.inventario, public.ventas_por_mes,
--                     public.ventas_por_categoria_mes, public.fundas_por_modelo_mes
--       to anon, authenticated;
--     commit;
--
-- Deja la base como estaba, o sea entregando el espejo entero: es para destrabar el minuto malo,
-- no para quedarse ahí.

-- Escalón 5 de la Fase S: lo ÚLTIMO que la anon key todavía leía sale del navegador.
--
-- Las dos bases. `ventas`, `venta_detalles` y `productos` existen en las dos;
-- `variante_color_manual` sólo en Zattia (en BDI PostgREST contesta 404) y por eso va con guard.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ⛔ PRECONDICIÓN — ESTO SE APLICA DESPUÉS DE DEPLOYAR, NO ANTES
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 **Es el escalón que más rompe si se corre al revés.** `ventas`, `venta_detalles` y
-- `productos` son la entrada del ETL: corren para las 14 personas en cada carga fría. Con el
-- deploy viejo sirviéndose esto **no rompe una pantalla, no abre el Monitor** — PostgREST no omite
-- lo que no tiene permiso, corta con `permission denied` y `traerDatos` lanza.
--
-- Orden, y no es negociable:
--   1. deployar
--   2. abrir el Monitor en prod **con el IndexedDB borrado** en las DOS marcas y ver que carga
--   3. abrir el CRM (Clientes) en BDI, en los dos modos del select
--   4. recién ahí correr esto, Zattia primero
--
-- Los lectores del navegador ya se mudaron todos:
--
--   `lib/supabase/rest.ts`   `pedir()`      → todo va a `api/datos?recurso=espejo` (el pase)
--   `lib/crm/datos.ts`       traerVentas    → `api/datos?recurso=crm`, action `ventas`
--
-- 🔑 **El pase y la puerta con nombre se reparten la tabla `ventas` por COLUMNA.** Por el pase van
-- `id, date_sale, channel, channel_id` —sin plata, sin PII— y no hay gate de permiso porque son la
-- base de todo el ETL. `total_price`, `client_id` y `sale_state` van por `api/_crm.js`, detrás del
-- permiso de Clientes: es la facturación y la lee sólo el CRM.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QUÉ CIERRA
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Medido el 16-ago-2026 con la anon key desde afuera, después de los escalones 1 a 4. Lo que
-- quedaba abierto era la capa que el ETL leía derecho del navegador:
--
--   `ventas`          27.990 filas en BDI, 21.468 en Zattia — `total_price`, `payment_method`,
--                     `channel`, `store` ⇒ **la facturación bruta, venta por venta y día por día**
--   `venta_detalles`  123.317 y 35.556 — `product_name`, `quantity`, `size` ⇒ qué se vende y cuánto
--   `productos`       264 y 668 activos — `name`, `sku`, `category`, `retailer_price`
--
-- ⇒ Con esto aplicado, **la anon key que viaja en el bundle no lee UNA fila de ninguna tabla de
-- ninguna de las dos bases.** Ya no queda una sola lectura del navegador contra Supabase.
--
-- 🔑 **Un `revoke` de TABLA sí se lleva los grants por COLUMNA que dejaron los escalones 1 y 3.**
-- Medido el 16-ago-2026 sobre Zattia dentro de un `begin/rollback`: `ventas` pasó de
-- `id,number,date_sale,total_price,channel,sale_state,payment_method,store` a NINGUNA columna con
-- un revoke pelado. Por eso acá no hace falta enumerar nada: no queda columna abierta.
--
-- 📌 El RLS de las tablas se queda como está. La política decide qué filas y el grant decide si se
-- puede preguntar; sin grant, la política no llega a correr.
-- 📌 `service_role` no se toca: es con la que leen la puerta, los ocho workflows de sync y el
-- fixture del CI.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- CÓMO VERIFICAR DESPUÉS (el script hace 1 y 2; el 3 es a mano)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- 1. `has_column_privilege('anon', 'public.ventas', 'id', 'SELECT')` = false, y lo mismo con las
--    otras tres tablas y con `authenticated`.
-- 2. Que `service_role` las siga leyendo y que tengan filas: cerrado y vacío se ve igual que
--    cerrado y sano si sólo se miran permisos.
-- 3. Con la anon key de cada marca, contra la API de verdad:
--        curl -H "apikey: $ANON" "$URL/rest/v1/ventas?select=id&limit=1"            → 401
--        curl -H "apikey: $ANON" "$URL/rest/v1/venta_detalles?select=sale_id&limit=1" → 401
--        curl -H "apikey: $ANON" "$URL/rest/v1/productos?select=id&limit=1"         → 401
--    Y en el Monitor, con el IndexedDB borrado: **que abra** en las dos marcas, Ventas mensuales
--    con sus meses, Reposición con stock, el CRM en los dos modos, y el modal de un cliente.
--
-- Rollback: al final del archivo.

do $$
declare
  cerrar text[] := array['ventas', 'venta_detalles', 'productos', 'variante_color_manual'];
  t text;
begin
  foreach t in array cerrar loop
    -- `variante_color_manual` no existe en BDI: preguntar por una tabla que no está revienta el
    -- revoke y se lleva las otras tres con él, porque esto corre en una transacción.
    if to_regclass('public.' || t) is null then
      raise notice '% no existe en esta base, se saltea', t;
      continue;
    end if;

    -- `authenticated` va junto con `anon` porque hoy son lo mismo: el Monitor no usa Supabase Auth,
    -- así que nadie se autentica contra esta base desde el navegador.
    execute format('revoke select on public.%I from anon, authenticated', t);
    raise notice '% → anon y authenticated no leen ninguna columna', t;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — si el Monitor no abre y hay que volver YA (dejarlo comentado)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
--     begin;
--     grant select on public.ventas, public.venta_detalles, public.productos to anon, authenticated;
--     -- sólo en Zattia:
--     grant select on public.variante_color_manual to anon, authenticated;
--     commit;
--
-- 🔴 **Esto deja las tablas MÁS abiertas de lo que estaban**, no como estaban: un grant de tabla
-- devuelve también las columnas que cerraron los escalones 1 y 3 (la PII de `ventas`, `unit_price`
-- y `total` de `venta_detalles`, `unit_cost` y `wholesaler_price` de `productos`). Es para destrabar
-- el minuto malo y volver a deployar, no para quedarse ahí. Para volver al estado anterior hay que
-- correr, en orden, `apply-columnas-pii.mjs` y `apply-venta-detalles-servidor.mjs` /
-- `apply-productos-servidor.mjs`.

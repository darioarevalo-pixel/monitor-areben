-- Escalón 3 de la Fase S, pieza B: sacarle a `anon` el costo y el precio mayorista de `productos`.
--
-- Las dos bases. La tabla existe en las dos y en las dos entrega lo mismo.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ⛔ PRECONDICIÓN — ESTO SE APLICA DESPUÉS DE DEPLOYAR, NO ANTES
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 **Esta pieza toca el ETL, y la A no.** La A cerraba dos columnas que la carga de datos nunca
-- había pedido; acá `unit_cost` estaba en el select de `productos` que corre para las 14 personas
-- en cada carga. Si esto se aplica con el deploy viejo sirviéndose, **no se rompe una pantalla: no
-- abre el Monitor**, porque PostgREST no omite la columna sin permiso — corta con "permission
-- denied" y se lleva la consulta entera, y `traerDatos` lanza.
--
-- Los tres consumidores de la capa navegador ya se mudaron:
--
--   `lib/datos.ts`                    el ETL          → pide el costo a `api/datos?recurso=costos`
--   `components/ui/BuscarArticuloGN`  el picker       → sólo cuando lo va a MOSTRAR, y por la puerta
--   `lib/reclamos/cliente.ts`         enriquecerConGN → dejó de pedirlo: nadie lee ese campo
--
-- Y los dos que lo estampaban sin mostrarlo lo resuelven ahora del lado del servidor, con la clave
-- de servicio: `api/_canjes.js` (item-agregar) y `api/_fallas.js` (crear).
--
-- Orden: deployar → abrir el Monitor y ver Márgenes con cifras, cargar un ítem a un canje y una
-- falla en Post-venta → recién ahí correr esto.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QUÉ CIERRA
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Medido el 14-ago-2026 con la anon key desde afuera: `productos?select=*` entregaba **450 filas
-- en BDI y 2.676 en Zattia** con `unit_cost` — lo que nos cuesta cada cosa que vendemos — y con
-- `wholesaler_price`. Cualquiera que abriera el bundle se llevaba la estructura de costos entera
-- de las dos marcas.
--
-- 🔑 **`wholesaler_price` se cierra gratis: no lo lee NADIE en el navegador.** Sólo lo escriben los
-- syncs, que van con la clave de servicio. Se buscó en todo el repo antes de meterlo en la lista.
--
-- 🔑 **`retailer_price` se queda abierto a propósito.** Es el precio que ve cualquiera que entre a
-- la tienda: cerrarlo no protege nada y rompe el picker, Liquidación y media analítica.
--
-- 🔴 **Un `revoke` por columna no hace NADA si el rol tiene el permiso de la TABLA.** Sale en verde
-- y no cierra nada mientras exista el `grant select on all tables` de `migrate-rls.sql:166`. Por
-- eso acá se saca el permiso de la tabla y se devuelve **enumerando** las columnas que sí.
--
-- 📌 El RLS de la tabla se queda como está: la política decide qué filas, el grant decide si se
-- puede preguntar.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- CÓMO VERIFICAR DESPUÉS (el script hace 1 y 2; el 3 es a mano)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- 1. `has_column_privilege('anon', 'public.productos', 'unit_cost', 'SELECT')` = false, y lo mismo
--    con `wholesaler_price` y con `authenticated`.
-- 2. Que las columnas que el ETL SÍ usa sigan en true —`id, name, category, sku, retailer_price,
--    created_at, active`, más `proveedor` en Zattia— y que `service_role` las lea todas.
-- 3. Con la anon key de cada marca, contra la API de verdad:
--        curl -H "apikey: $ANON" "$URL/rest/v1/productos?select=unit_cost&limit=1"        → 401
--        curl -H "apikey: $ANON" "$URL/rest/v1/productos?select=*&limit=1"                → 401
--        curl -H "apikey: $ANON" "$URL/rest/v1/productos?select=id,name&limit=1"          → 200
--    Y en el Monitor: **que abra** (es lo que el ETL puede romper), Márgenes con cifras para un
--    admin, un ítem cargado a un canje con su costo, y una falla nueva con su valuación.
--
-- Rollback: al final del archivo.

do $$
declare
  permitidas text;
  prohibidas text[] := array['unit_cost', 'wholesaler_price'];
begin
  if to_regclass('public.productos') is null then
    raise notice 'productos no existe en esta base, no hay nada que cerrar';
    return;
  end if;

  -- Los `::text` no son adorno: en `information_schema` estas columnas son `sql_identifier`, y sin
  -- el cast el `= any(...)` depende de qué cast implícito tenga la versión de Postgres.
  --
  -- La lista se calcula contra el esquema en vez de escribirse a mano porque **las dos bases no
  -- son iguales** —`proveedor` está en Zattia y no en BDI— y el modo de falla de una lista fija es
  -- dejar de dar una columna que la app usa, o sea una pantalla vacía.
  select string_agg(quote_ident(column_name::text), ', ' order by ordinal_position)
    into permitidas
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'productos'
     and not (column_name::text = any (prohibidas));

  if permitidas is null then
    raise exception 'ninguna columna permitida en productos: no se toca';
  end if;

  -- `authenticated` va junto con `anon` porque hoy son lo mismo: el Monitor no usa Supabase Auth,
  -- así que nadie se autentica contra esta base desde el navegador.
  revoke select on public.productos from anon, authenticated;
  execute format('grant select (%s) on public.productos to anon, authenticated', permitidas);

  raise notice 'productos → anon lee: %', permitidas;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — si el Monitor no abre y hay que volver YA (dejarlo comentado)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
--     begin;
--     grant select on public.productos to anon, authenticated;
--     commit;
--
-- Un grant a nivel tabla vuelve a tapar los de columna, así que con esto alcanza. Deja la base
-- como estaba, o sea entregando los costos: es para destrabar el minuto malo, no para quedarse ahí.

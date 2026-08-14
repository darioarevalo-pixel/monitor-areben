-- Escalón 3 de la Fase S, pieza A: sacarle a `anon` la plata de `venta_detalles`.
--
-- Las dos bases. La tabla existe en las dos y en las dos entrega lo mismo.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ⛔ PRECONDICIÓN — ESTO SE APLICA DESPUÉS DE DEPLOYAR, NO ANTES
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Los dos consumidores de `unit_price`/`total` en la capa navegador eran
-- `lib/crm/datos.ts:traerDetalles` (el resumen de compras del modal de un cliente) y
-- `lib/liquidacion/ventas.ts:leerVentasDeCampania` (el Resultado de una campaña). Los dos piden
-- ahora por `api/datos` —recursos `crm` y `liquidacion`—, que leen con la clave de servicio detrás
-- de `exigirUsuario` + el permiso de la sección.
--
-- **Si esto se corre con el deploy viejo todavía sirviéndose, esas dos pantallas se rompen**:
-- PostgREST no omite la columna sin permiso, corta con "permission denied" y se lleva la consulta
-- entera. Es exactamente lo que pasó de prueba en el escalón 2.
--
-- Orden: deployar → abrir el modal de un cliente y el Resultado de una campaña en producción →
-- recién ahí correr esto.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QUÉ CIERRA
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Medido el 14-ago-2026 con la anon key desde afuera: `venta_detalles?select=*` entregaba
-- **122.952 filas en BDI y 35.426 en Zattia**, con `unit_price` y `total` en cada renglón. Es la
-- facturación entera de las dos marcas, línea por línea, para cualquiera que abriera el bundle —
-- la anon key viaja al navegador por diseño y no hay dónde esconderla.
--
-- 🔑 **El ETL no pierde nada.** Su select es `sale_id, product_id, size_id, size, quantity`: nunca
-- pidió las dos columnas de plata. Por eso las 122.952 filas se cierran sin tocar la carga de
-- datos de ninguna de las 45 secciones. `product_name` se queda porque lo muestra el modal del CRM.
--
-- 🔴 **Un `revoke` por columna no hace NADA si el rol tiene el permiso de la TABLA.**
-- `revoke select (unit_price) on venta_detalles from anon` sale en verde y no cierra nada mientras
-- exista el `grant select on all tables` de `migrate-rls.sql:166`. Por eso acá se saca el permiso
-- de la tabla y se devuelve **enumerando** las columnas que sí. Es la trampa del escalón 1.
--
-- 📌 El RLS de la tabla se queda como está. Es la otra mitad y sigue haciendo falta: la política
-- decide qué filas, el grant decide si se puede preguntar.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- CÓMO VERIFICAR DESPUÉS (el script hace 1 y 2; el 3 es a mano)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- 1. `has_column_privilege('anon', 'public.venta_detalles', 'unit_price', 'SELECT')` = false, y lo
--    mismo con `total` y con `authenticated`.
-- 2. Que las columnas que el ETL y el CRM SÍ usan sigan en true, y que `service_role` las lea
--    todas — es con quien entran los dos handlers y con quien escribe el sync.
-- 3. Con la anon key de cada marca, contra la API de verdad:
--        curl -H "apikey: $ANON" "$URL/rest/v1/venta_detalles?select=unit_price&limit=1"  → 401
--        curl -H "apikey: $ANON" "$URL/rest/v1/venta_detalles?select=*&limit=1"           → 401
--        curl -H "apikey: $ANON" "$URL/rest/v1/venta_detalles?select=sale_id&limit=1"     → 200
--    Y en el Monitor: el modal de un cliente en Clientes (BDI) con su resumen de compras, y el
--    Resultado de una campaña de Liquidación en las dos marcas.
--
-- Rollback: al final del archivo.

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- Mismo bloque que `migrate-columnas-pii.sql`, y por el mismo motivo: la lista buena se calcula
-- contra `information_schema` en vez de escribirse a mano, porque las dos bases no tienen el mismo
-- esquema. Una lista fija sería correcta en una base y equivocada en la otra, y el modo de falla
-- —dejar de darle una columna que la app usa— es una pantalla vacía.
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  permitidas text;
  prohibidas text[] := array['unit_price', 'total'];
begin
  if to_regclass('public.venta_detalles') is null then
    raise notice 'venta_detalles no existe en esta base, no hay nada que cerrar';
    return;
  end if;

  -- Los `::text` no son adorno: en `information_schema` estas columnas son `sql_identifier`, no
  -- `text`, y sin el cast el `= any(...)` y el `quote_ident` dependen de qué cast implícito tenga
  -- la versión de Postgres. Si falla, falla al aplicar, que es el peor momento.
  select string_agg(quote_ident(column_name::text), ', ' order by ordinal_position)
    into permitidas
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'venta_detalles'
     and not (column_name::text = any (prohibidas));

  -- Si esto quedara vacío, el grant de abajo sería sintaxis inválida y la transacción se cae
  -- entera. Mejor que pasar por acá dejando la tabla sin ninguna lectura.
  if permitidas is null then
    raise exception 'ninguna columna permitida en venta_detalles: no se toca';
  end if;

  -- `authenticated` va junto con `anon` porque hoy son lo mismo: el Monitor no usa Supabase Auth,
  -- así que nadie se autentica contra esta base desde el navegador. Dejarlo abierto sería dejar
  -- una segunda puerta con la misma llave del bundle el día que alguien prenda un login.
  --
  -- El `grant` va por `execute format` y no escrito derecho porque la lista de columnas se acaba
  -- de calcular: en SQL plano no hay forma de interpolar un identificador.
  revoke select on public.venta_detalles from anon, authenticated;
  execute format('grant select (%s) on public.venta_detalles to anon, authenticated', permitidas);

  raise notice 'venta_detalles → anon lee: %', permitidas;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — si una de las dos pantallas quedó rota y hay que volver YA (dejarlo comentado)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
--     begin;
--     grant select on public.venta_detalles to anon, authenticated;
--     commit;
--
-- Un grant a nivel tabla vuelve a tapar los de columna, así que con esto alcanza. Deja la base
-- como estaba, o sea entregando la facturación: es para destrabar el minuto malo, no para
-- quedarse ahí.

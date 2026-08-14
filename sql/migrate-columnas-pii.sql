-- Escalón 1 de la Fase S: sacarle a `anon` las columnas que expone y que nadie lee.
--
-- ⚠️ Igual que `migrate-rls.sql`: **primero ZATTIA**, se verifica, y recién después BDI.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QUÉ CIERRA, Y POR QUÉ SE PUEDE HACER SIN TOCAR LA APP
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- `migrate-rls.sql` dejó seis tablas legibles por `anon` porque el navegador las lee con la key
-- que viaja en el bundle. Pero el navegador no lee las tablas: lee **columnas**, y son menos.
-- Medido el 14-ago-2026 sobre la base de BDI:
--
--   `ventas` tiene 19 columnas. La app usa SIETE: id, date_sale, channel, channel_id,
--   total_price, client_id, sale_state (`lib/datos.ts:218`, `lib/crm/datos.ts:18`,
--   `lib/liquidacion/ventas.ts:72`, `lib/reposicion/cliente.ts:33`). Las otras doce incluyen
--   **el mail, el teléfono, la ciudad y la provincia de cada cliente** en 27.911 ventas, y
--   **`total_cost` y `profit`**, o sea el costo y el margen de cada una.
--
--   `clientes` tiene 14. El CRM usa SEIS: id, name, email, phone, city, province
--   (`lib/crm/datos.ts:19`). Entre las otras están **la dirección y el código postal** de 12.523
--   personas, y cuánto gastó cada una.
--
-- Ninguna de las que se cierran acá aparece en una sola línea del navegador — se escriben en el
-- sync (`scripts/lib/ventas-espejo.mjs`, con la service key, que no mira estos permisos) y ahí
-- mueren. Se verificó también que no las lea `bdi-catalogo`, que no toca estas dos bases.
--
-- 🔑 **La precondición que lo hace seguro: no hay un solo `select=*` en la capa navegador.**
-- PostgREST no omite la columna sin permiso, corta con "permission denied". Mientras cada consulta
-- nombre sus columnas —hoy las nombran todas— esto es invisible para la app.
--
-- ❌ Lo que esto **no** cierra: `clientes` sigue entregando nombre, mail, teléfono y ciudad de las
-- 12.523 personas, porque el CRM los muestra. Eso es el Escalón 2 (mover el CRM detrás de
-- `api/datos.js`, que sí tiene sesión y permisos), y es otro trabajo.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 POR QUÉ ESTO NO ES UN `REVOKE` Y PUNTO
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- En Postgres **un revoke por columna no le saca nada a quien tiene el permiso sobre la tabla
-- entera**, y `migrate-rls.sql:166` hace justamente `grant select on all tables`. Escrito como
--
--     revoke select (client_email) on ventas from anon;   -- ❌ no hace NADA
--
-- el comando sale en verde y `anon` sigue leyendo la columna. La única forma es al revés: sacar el
-- permiso de la tabla y volver a darlo **enumerando las columnas que sí**. Por eso abajo hay un
-- `revoke` seguido de un `grant` con lista, y por eso el chequeo del final no pregunta si se
-- revocó sino `has_column_privilege`, que es lo que de verdad decide.
--
-- 📌 Efecto de borde bueno: la lista queda fija, así que **una columna que se agregue mañana nace
-- sin permiso**. Si alguna vez la app la necesita, el error va a ser ruidoso (permission denied al
-- pedirla), no silencioso.
--
-- 🔴 **Y uno malo: volver a correr `apply-rls.mjs` deshace esto**, porque su `grant select on all
-- tables` devuelve el permiso a nivel tabla. Está avisado allá y su verificación ahora lo chequea,
-- pero si alguna vez lo corrés, corré esto después.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- CÓMO VERIFICAR DESPUÉS (el script hace 1 y 2; el 3 es a mano)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- 1. `has_column_privilege('anon', 'public.ventas', 'client_email', 'SELECT')` = false.
-- 2. Que las columnas que la app SÍ usa sigan en true.
-- 3. Con la anon key de la marca, contra la API de verdad:
--        curl -H "apikey: $ANON" "$URL/rest/v1/ventas?select=client_email&limit=1"   → 403
--        curl -H "apikey: $ANON" "$URL/rest/v1/ventas?select=id,date_sale&limit=1"   → 200
--    Y abrir el Monitor de esa marca: Resumen, Ventas mensuales, Clientes, Liquidación.
--
-- Rollback: al final del archivo.

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- El único bloque. Por cada tabla: sacar el select de la tabla y devolverlo por columna, con
-- todas menos las prohibidas.
--
-- Se calcula contra `information_schema` en vez de escribir la lista buena a mano porque las dos
-- bases no tienen el mismo esquema: `ventas` en Zattia tiene 9 columnas y en BDI 19, y `clientes`
-- directamente no existe en Zattia. Una lista fija sería correcta en una base y equivocada en la
-- otra, y el modo de falla —dejar de darle una columna que la app usa— es una pantalla vacía.
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  objetivo record;
  permitidas text;
begin
  for objetivo in
    select * from (values
      -- tabla, columnas que `anon` NO puede volver a leer
      ('ventas',   array['client_name', 'client_email', 'client_phone', 'client_city',
                         'client_province', 'total_cost', 'profit']),
      ('clientes', array['address', 'postal_code', 'total_sales', 'total_amount'])
    ) as t(tabla, prohibidas)
  loop
    if to_regclass('public.' || objetivo.tabla) is null then
      raise notice '% no existe en esta base, se saltea', objetivo.tabla;
      continue;
    end if;

    -- Los `::text` no son adorno: en `information_schema` estas columnas son `sql_identifier`, no
    -- `text`, y sin el cast el `= any(...)` y el `quote_ident` dependen de qué cast implícito
    -- tenga la versión de Postgres. Si falla, falla al aplicar, que es el peor momento.
    select string_agg(quote_ident(column_name::text), ', ' order by ordinal_position)
      into permitidas
      from information_schema.columns
     where table_schema = 'public'
       and table_name = objetivo.tabla
       and not (column_name::text = any (objetivo.prohibidas));

    -- Si esto quedara vacío, el grant de abajo sería sintaxis inválida y la transacción se cae
    -- entera. Mejor que pasar por acá dejando la tabla sin ninguna lectura.
    if permitidas is null then
      raise exception 'ninguna columna permitida en %: no se toca', objetivo.tabla;
    end if;

    execute format('revoke select on public.%I from anon, authenticated', objetivo.tabla);
    execute format('grant select (%s) on public.%I to anon, authenticated', permitidas, objetivo.tabla);
    raise notice '% → anon lee: %', objetivo.tabla, permitidas;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — si una pantalla quedó vacía y hay que volver YA (dejarlo comentado)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
--     begin;
--     grant select on public.ventas to anon, authenticated;
--     grant select on public.clientes to anon, authenticated;   -- sólo BDI
--     commit;
--
-- Un grant a nivel tabla vuelve a tapar los de columna, así que con esto alcanza. Deja la base
-- como estaba, o sea entregando los mails: es para destrabar el minuto malo, no para quedarse ahí.

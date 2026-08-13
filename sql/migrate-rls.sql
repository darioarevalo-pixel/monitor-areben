-- RLS y recorte de permisos del rol `anon`.
--
-- ⚠️⚠️ ESTO VA EN LAS DOS BASES, PERO **PRIMERO EN ZATTIA**, QUE ES LA CHICA. ⚠️⚠️
--     Se corre, se verifica el Monitor entero de Zattia a mano, y recién después BDI.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QUÉ PROBLEMA RESUELVE, Y CUÁL NO
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- El navegador lee Supabase directo con la anon key (`lib/supabase/rest.ts:29`), y esa key está
-- escrita en `lib/cuentas.ts:34,40`, en `index.html` y en el bundle que se descarga. Hasta hoy no
-- había **ninguna** política de RLS en las 41 migraciones de este directorio, así que el rol `anon`
-- conservaba los permisos que Supabase le da por defecto sobre el esquema `public`.
--
-- ESTADO MEDIDO EL 13-AGO-2026 (no estimado: `scripts/apply-rls.mjs <marca>` lo vuelve a sacar)
--
--                                        BDI        ZATTIA
--   tablas                                54            25
--   sin RLS  ⇒ `anon` LEE Y ESCRIBE       40            17
--   con RLS                               14             8
--
-- Alguien YA protegió, a mano y fuera del repo, las seis tablas de analítica: `productos`,
-- `inventario`, `ventas`, `venta_detalles`, `clientes` y `sync_config` tienen RLS con una política
-- `anon_select_*` de sólo lectura. Eso está bien y no se toca.
--
-- Lo que quedó afuera es **todo lo que se construyó después**. En BDI, estas 40 las lee, las
-- modifica y las BORRA cualquiera que tenga la anon key:
--
--     canjes · canje_personas · canje_items · canje_entregables · canje_evidencias ·
--     canje_vitrinas · canje_vitrina_items · canje_config · devoluciones · cambios ·
--     fallas_deposito · solicitudes · conteos_deposito · liquidaciones · liquidacion_items ·
--     disenos · atencion · novedades · novedades_leidas · manuales · tn_ignorados ·
--     agenda_promos · agenda_items · agenda_hechos · calendario_hitos · calendario_decision ·
--     calendario_fechas_fijadas · meta_ads_* (13 tablas)
--
-- `canje_personas` es el padrón de creadoras con DNI, teléfono y dirección. `devoluciones` son los
-- reclamos con nombre y contacto de cada cliente. Un `DELETE` sobre cualquiera de las dos entra
-- hoy, y no hay backup automático en el plan gratuito de Supabase.
--
--   ✅ Lo que ESTO arregla: esas 40 (y las 17 de Zattia) dejan de aceptar escritura, y las que el
--      navegador nunca lee dejan también de aceptar lectura.
--
--   ❌ Lo que ESTO **no** arregla: que se puedan **leer** las seis de analítica. La app las lee con
--      esa key desde el navegador, así que su política tiene que decir `true`. Mientras el modelo
--      sea "una key compartida en el bundle", cualquiera que la tenga lee ventas, costos y
--      clientes. Eso pide sesión por usuario en Supabase (Supabase Auth + `auth.uid()`), que es un
--      proyecto aparte. Lo que sí baja el riesgo hoy es que los dos repos pasen a privados: la key
--      deja de estar indexada y buscable.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- PASO 0 — ANTES DE CORRER ESTO (si se saltea, se rompe producción)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Los handlers de `api/` escriben con `SUPABASE_SERVICE_KEY || SUPABASE_KEY`: **si falta la de
-- servicio, caen a la anon**. La service key se saltea RLS; la anon, después de esto, no va a poder
-- escribir nada. O sea que un entorno sin service key deja de guardar — canjes, fallas, conteos,
-- liquidación — y el error va a decir "permiso denegado", no "falta una variable".
--
-- Hay que confirmar que en Vercel estén las CUATRO, y que las dos `*_SERVICE_KEY` sean de verdad
-- de servicio:
--     SUPABASE_URL · SUPABASE_SERVICE_KEY · ZATTIA_SUPABASE_URL · ZATTIA_SUPABASE_SERVICE_KEY
--
-- 🔑 **CÓMO SE VERIFICA: entrando al Monitor → Usuarios → "Credenciales del servidor".**
-- Lo contesta el propio servidor que va a quedar del otro lado de RLS, que es el único que sabe
-- qué tiene Vercel adentro. Cada marca dice `escribe como servicio` o `escribe como anónimo`, y
-- eso último es exactamente lo que esta migración rompe. **Si una marca dice anónimo, NO correr
-- esto sobre ella todavía**: primero se le carga la service key en Vercel.
--
-- ⚠️ La receta anterior era `npx vercel env pull` + un `node -e` sobre el archivo. NO SIRVE, y el
-- modo de falla es silencioso: el proyecto productivo vive en el Vercel de Darío, así que el CLI
-- de Bruno resuelve OTRO proyecto (un cascarón sin deployments) y contesta "No Environment
-- Variables found" — que se lee igual que "no están puestas". El `.env` local tampoco alcanza:
-- ahí `ZATTIA_SUPABASE_SERVICE_KEY` no existe, y eso no dice nada sobre producción.
--
-- La sonda es `api/_sistema.js` → `?recurso=sistema&vista=credenciales` (sólo admin), y no
-- devuelve ninguna clave: sólo si la variable está, qué rol dice ser y contra qué proyecto apunta.
-- La lógica pura y sus tests: `lib/credenciales.core.js`, `tests/credenciales*.test.ts`.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- CÓMO VERIFICAR DESPUÉS
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- 1. Con la anon key de esa marca, esto tiene que seguir devolviendo filas:
--        curl -H "apikey: $ANON" "$URL/rest/v1/productos?select=id&limit=1"
-- 2. Y esto tiene que devolver 401/403 en vez de borrar:
--        curl -X DELETE -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--             "$URL/rest/v1/tn_ignorados?tn_id=eq.__no_existe__"
-- 3. El Monitor de esa marca: abrir Resumen, Productos, Ventas mensuales, Clientes y Conteo, y
--    **guardar algo de verdad** (una falla, un conteo). Verde en la pantalla no alcanza: lo que
--    esta migración puede romper es justamente la escritura.
--
-- Para volver atrás, el final del archivo tiene el bloque de rollback comentado.

-- 📌 Sin `begin;`/`commit;` acá: los envuelve `scripts/apply-rls.mjs`, como todos los `apply-*`
-- del repo. Anidar transacciones tira "there is already a transaction in progress".

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 1. RLS prendido en TODAS las tablas de `public`.
--
-- Se hace en bucle y no a mano para que no haya que acordarse de agregar la tabla nueva acá: una
-- tabla que se cree mañana y quede sin RLS es exactamente el agujero que esto viene a cerrar.
-- `tn_fotos_verificadas` ya lo tenía prendido; `if not exists` no aplica a esta sentencia, pero
-- prenderlo dos veces no hace nada.
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 2. Lectura para `anon` SÓLO en lo que el navegador realmente lee.
--
-- Son SEIS y ni una más. La lista no está a ojo: sale de listar todas las llamadas a
-- `fetchAll`/`sbFetch` de `lib/` (`lib/datos.ts:147-196`, `lib/crm/datos.ts`, `lib/datos.ts:98`).
-- Todo lo demás pasa por `api/*`, que usa la service key y no mira RLS.
--
-- `variante_color_manual` es la única de las seis que hoy NO tiene RLS, así que es la única que
-- necesita política nueva. Las otras cinco ya la tienen y el `if not exists` de abajo las respeta.
--
-- 📌 Las tres vistas materializadas (`ventas_por_mes`, `ventas_por_categoria_mes`,
-- `fundas_por_modelo_mes`) **no aparecen acá y no es un olvido: Postgres no aplica RLS a las
-- vistas materializadas.** Se leen con el GRANT nomás, y el navegador las necesita, así que quedan
-- legibles igual. Lo que sí está cerrado es dispararles un refresco: eso lo hizo
-- `migrate-refresco-vistas.sql:120` con el `REVOKE ... FROM PUBLIC`.
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['productos', 'inventario', 'ventas', 'venta_detalles', 'clientes', 'variante_color_manual']
  loop
    if to_regclass('public.' || t) is not null then
      -- Sólo si no tiene ya una política de SELECT. Cinco de estas seis vienen con su
      -- `anon_select_*` puesta a mano de antes: agregarle una segunda que diga lo mismo no cambia
      -- nada (las permisivas se suman con OR) pero deja al próximo que lea sin saber cuál manda.
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = t and cmd in ('SELECT', 'ALL')
      ) then
        execute format('create policy anon_lee on public.%I for select to anon using (true)', t);
      end if;
    end if;
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 3. Y el candado de verdad: `anon` no escribe. En ninguna tabla.
--
-- 🔑 **El GRANT importa además de la política, y por eso están los dos.** Sin política de INSERT,
-- RLS ya rechazaría la escritura — pero el REVOKE la corta un escalón antes, y sobre todo protege
-- de que alguien "arregle" un problema futuro agregando una política permisiva sin darse cuenta de
-- lo que abre. La lectura se re-otorga explícita porque el REVOKE de arriba se la lleva puesta.
--
-- `authenticated` va incluido: hoy nadie entra a Supabase con sesión propia (el login del Monitor
-- es el KV de bdi-catalogo, no Supabase Auth), así que ese rol no tiene por qué poder nada. El día
-- que exista sesión por usuario, se le dan permisos a propósito.
-- ───────────────────────────────────────────────────────────────────────────────────────────
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

-- Lo mismo para lo que se cree de acá en adelante, así una tabla nueva nace cerrada.
alter default privileges in schema public revoke insert, update, delete on tables from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- CHEQUEO — corré esto después del commit. Las dos consultas tienen que dar vacío.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- a) Tablas sin RLS (tienen que ser cero):
--
--     select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
--
-- b) Permisos de escritura que le hayan quedado a `anon` (tienen que ser cero):
--
--     select table_name, privilege_type from information_schema.role_table_grants
--     where grantee = 'anon' and table_schema = 'public'
--       and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — si algo dejó de guardar y hay que volver YA (dejarlo comentado)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
--     begin;
--     grant insert, update, delete on all tables in schema public to anon, authenticated;
--     alter default privileges in schema public grant insert, update, delete on tables to anon, authenticated;
--     do $$ declare t record; begin
--       for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--                where n.nspname = 'public' and c.relkind = 'r'
--       loop execute format('alter table public.%I disable row level security', t.relname); end loop;
--     end $$;
--     commit;
--
-- Ojo: el rollback deja la base como estaba, o sea abierta. Es para destrabar el minuto malo, no
-- para quedarse ahí.

-- Escalón 2 de la Fase S: sacarle a `anon` la tabla `clientes` ENTERA.
--
-- Sólo BDI. En Zattia la tabla no existe (el CRM es bdi-only por esquema, no por permisos).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ⛔ PRECONDICIÓN — ESTO SE APLICA DESPUÉS DE DEPLOYAR, NO ANTES
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- El único consumidor de `clientes` en la capa navegador era `lib/crm/datos.ts:traerClientes`, y
-- ahora pide por `api/datos?recurso=crm`, que lee con la clave de servicio detrás de
-- `exigirUsuario` + el permiso de la sección. **Si esto se corre con el deploy viejo todavía
-- sirviéndose, el CRM queda en una pantalla vacía**: PostgREST no omite la tabla sin permiso,
-- corta con "permission denied".
--
-- Orden: deployar → abrir Clientes en producción y ver el padrón → recién ahí correr esto.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QUÉ CIERRA
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Medido el 14-ago-2026 con la anon key desde afuera: `clientes` entregaba **12.523 filas** con
-- nombre, mail, teléfono y ciudad, en 13 llamadas de ~1 s (PostgREST corta en 1.000 por request).
-- El escalón 1 (`migrate-columnas-pii.sql`) ya le había sacado `address`, `postal_code`,
-- `total_sales` y `total_amount`; las otras cuatro tenían que seguir abiertas porque el CRM las
-- muestra. Sacar la lectura del navegador es lo que las libera.
--
-- 🔑 **Esto NO es un revoke por columna**, así que no le aplica la trampa del escalón 1 (un revoke
-- por columna no le saca nada a quien tiene el permiso de la tabla). Acá se revoca la tabla, que
-- es el permiso de arriba, y con eso caen también los de columna que dejó el escalón 1.
--
-- 📌 El RLS de la tabla se queda como está. Es la otra mitad y sigue haciendo falta: la política
-- decide qué filas, el grant decide si se puede preguntar. Sin el grant, la política no llega a
-- correr.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- CÓMO VERIFICAR DESPUÉS (el script hace 1 y 2; el 3 es a mano)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- 1. `has_table_privilege('anon', 'public.clientes', 'SELECT')` = false, y lo mismo para
--    `authenticated` y para cada una de las 14 columnas (`has_column_privilege`).
-- 2. Que `service_role` la siga leyendo — es con quien entra `api/_crm.js` y con quien escribe
--    el sync. Un cero acá es el CRM vacío y el sync roto.
-- 3. Con la anon key de BDI, contra la API de verdad:
--        curl -H "apikey: $ANON" "$URL/rest/v1/clientes?select=id&limit=1"    → 401/403
--        curl -H "apikey: $ANON" "$URL/rest/v1/ventas?select=id&limit=1"      → 200 (sigue viva)
--    Y abrir el Monitor de BDI en Clientes: el padrón, el modal de un cliente y la pestaña Leads.
--
-- Rollback: al final del archivo.

do $$
begin
  if to_regclass('public.clientes') is null then
    raise notice 'clientes no existe en esta base, no hay nada que cerrar';
    return;
  end if;

  -- `authenticated` va junto con `anon` porque hoy son lo mismo: el Monitor no usa Supabase Auth,
  -- así que nadie se autentica contra esta base desde el navegador. Dejarlo abierto sería dejar
  -- una segunda puerta con la misma llave del bundle el día que alguien prenda un login.
  revoke select on public.clientes from anon, authenticated;

  raise notice 'clientes → anon y authenticated ya no la leen';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — si el CRM quedó vacío y hay que volver YA (dejarlo comentado)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
--     begin;
--     grant select on public.clientes to anon, authenticated;
--     commit;
--
-- ⚠️ Un grant a nivel tabla **también tapa los de columna del escalón 1**: esto devuelve la
-- dirección y el CP de las 12.523 personas, no sólo lo que el CRM muestra. Es para destrabar el
-- minuto malo. Para volver al estado del escalón 1, correr después
-- `node scripts/apply-columnas-pii.mjs bdi --aplicar`.

-- «Vende fundas» en el mapa de locales del CRM. Correr en el proyecto Supabase de BDI, DESPUÉS de
-- sql/migrate-prospectos.sql. Idempotente.
--
-- 🔑 POR QUÉ (28-oct-2026, Darío): de los locales de la costa, quedarse rápido con los que encajan
-- con lo que vende BDI (sólo fundas de iPhone). Se repite la búsqueda de Maps por ciudad con
-- «fundas para celulares» y «fundas iPhone»: el local que aparece ahí queda en true. La marca la
-- pone ~/Bruno/leads-mapa/marcar_fundas.mjs, no la pantalla.
--
-- VERIFICACIÓN:
--   select ciudad, count(*) filter (where vende_fundas), count(*) from prospecto_local group by 1 order by 3 desc;
--
-- ROLLBACK:
--   alter table prospecto_local drop column if exists vende_fundas;

alter table prospecto_local add column if not exists vende_fundas boolean not null default false;

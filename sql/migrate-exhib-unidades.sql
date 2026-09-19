-- Chequeo de exhibición: que el recorrido CUENTE UNIDADES y el repetido ⛔ no rebote.
-- Correr en el proyecto Supabase de ZATTIA (la sección `exhib` es `brands: ['zattia']`).
-- Es idempotente y sirve igual para BDI el día que se le habilite.
--
--   node scripts/aplicar-sql.mjs sql/migrate-exhib-unidades.sql exhib_escaneo
--
-- 🔑 POR QUÉ EXISTE. Lo pidió Bruno el 19-sep-2026: *«la idea es escanear todo tops, y que te
-- permita escanear todo aunque vaya repetido, y luego al final, que vaya el análisis con lo que
-- pueda faltar y además que se pueda anotar que hay dos repetidos, pero te deje»*. Hasta hoy el
-- repetido **rebotaba** —el único es (recorrido, lugar, variante)— así que dos prendas iguales
-- colgadas contaban como UNA: el recorrido contestaba «apareció / ⛔ no apareció» y ⛔ nunca
-- **cuántas**. Con el conteo, el faltante pasa a ser **medido** (vistas contra stock) y aparece un
-- hallazgo que antes era invisible: **hay MÁS colgadas de las que el sistema dice**.
--
-- 🔴 EL ÚNICO ⛔ NO SE TOCA, Y ÉSA ES LA DECISIÓN. Se podría haber guardado una fila por escaneo
-- —un log de eventos— pero entonces **un rebote del lector sería una prenda más**: el aparato entra
-- como teclado y repite el Enter solo. Sigue habiendo **una fila por prenda y por lugar**, con un
-- contador, así que el Excel sigue teniendo un renglón por prenda y el índice sigue protegiendo.
-- ⚠️ El rebote lo corta el cliente (`esDobleLectura`, 600 ms): 📊 medido sobre los 166 escaneos
-- reales del 19-sep, el intervalo humano más corto fue **997 ms**.
--
-- PRECONDICIONES: `sql/migrate-exhib-libre.sql` y `sql/migrate-exhib-categoria.sql` corridos.
--
-- VERIFICACIÓN (correr después; tienen que estar las dos columnas):
--   select column_name from information_schema.columns
--   where table_name = 'exhib_escaneo' and column_name in ('veces', 'ultimo_en');
--
-- ROLLBACK (⛔ se lleva puesto el conteo de los repetidos; las filas quedan, cada una valiendo 1):
--   alter table exhib_escaneo drop column if exists veces;
--   alter table exhib_escaneo drop column if exists ultimo_en;

-- Cuántas unidades de esa variante se vieron en ese lugar.
-- ⚠️ `default 1` y `not null`: las 168 filas que ya están son de antes del conteo y cada una es una
-- unidad vista. Dejarlo nulo obligaría a que cada lector del dato decida qué significa el vacío, y
-- ésa es la pregunta que termina contestada distinto en cada pantalla.
alter table exhib_escaneo add column if not exists veces int not null default 1;

-- La hora de la ÚLTIMA unidad sumada. La primera sigue en `escaneado_en`, que es la que ordena la
-- caminata; ésta es la que deja ver que alguien volvió al mismo mueble media hora después.
alter table exhib_escaneo add column if not exists ultimo_en timestamptz;

-- 🔴 El contador ⛔ no puede ser 0 ni negativo: una fila existe porque alguien pasó algo por el
-- lector. Un 0 haría que la variante figure «vista» en la lista de escaneos y «no vista» en el
-- conteo, que son dos respuestas distintas a la misma pregunta.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exhib_escaneo_veces_positivo') then
    alter table exhib_escaneo add constraint exhib_escaneo_veces_positivo check (veces >= 1);
  end if;
end $$;

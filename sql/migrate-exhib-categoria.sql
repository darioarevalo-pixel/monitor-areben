-- Chequeo de exhibición: que el recorrido POR CATEGORÍA también guarde en la base.
-- Correr en el proyecto Supabase de ZATTIA (la sección `exhib` es `brands: ['zattia']`).
-- Es idempotente y sirve igual para BDI el día que se le habilite.
--
--   node scripts/aplicar-sql.mjs sql/migrate-exhib-categoria.sql exhib_escaneo
--
-- 🔑 POR QUÉ EXISTE. El modo libre guarda cada escaneo con su lugar desde el 19-sep-2026; el modo
-- por categoría seguía viviendo en el `localStorage` del teléfono que escanea. Lo trajo Bruno
-- mirando el PDF de ese día: dice «EXHIBIDO CORRECTAMENTE (245)» y **⛔ no puede decir de cuándo ni
-- de quién** —la tilde ⛔ no tiene fecha y ⛔ no se limpia nunca, así que «exhibido» quiere decir
-- «alguien lo marcó alguna vez»—. Medido contra el recorrido libre del mismo día: de los productos
-- escaneados ahí, **46 variantes con stock (143 unidades) ⛔ no pasaron por el lector y 39 salían
-- «exhibido correctamente» en el PDF**.
-- ⇒ *«habría que mejorarlo como el libre, y que tenga registro de hora, día y quién»* (Bruno).
--
-- 🔑 NO SON TABLAS NUEVAS, y eso es la mitad del valor: el recorrido por categoría entra por las
-- MISMAS `exhib_recorrido` / `exhib_escaneo`, con `modo = 'categoria'`. Así la pantalla que lista
-- recorridos, la que abre uno guardado, el export y «para colgar» ⛔ no se enteran de la diferencia.
--
-- ⚠️ EN EL MODO POR CATEGORÍA, `lugar` ES LA CATEGORÍA RECORRIDA. Es su unidad de trabajo —«dónde
-- se lo buscó»—, igual que el mueble en el libre, y así el único (recorrido, lugar, variante) sigue
-- diciendo lo mismo: una variante marcada una vez por categoría.
--
-- ⛔ NO SE MIGRA LO VIEJO. Lo que hay en el `localStorage` ⛔ no tiene fecha, ni persona, ni
-- recorrido — es exactamente lo que lo vuelve inservible, y subirlo con la fecha de hoy sería
-- inventar el dato que falta. La pantalla dice cuántas tildes viejas hay, avisa que son anteriores
-- a esta fecha y deja borrarlas.
--
-- PRECONDICIONES: `sql/migrate-exhib-libre.sql` corrido (19-sep-2026, en Zattia).
--
-- VERIFICACIÓN (correr después; tienen que estar las dos columnas):
--   select table_name, column_name from information_schema.columns
--   where (table_name = 'exhib_escaneo'   and column_name = 'estado')
--      or (table_name = 'exhib_recorrido' and column_name = 'categoria');
--
-- ROLLBACK (no se lleva ningún escaneo del libre; sí el estado de los de categoría):
--   alter table exhib_escaneo   drop column if exists estado;
--   alter table exhib_recorrido drop column if exists categoria;

-- Qué pasó con esa variante en el recorrido por categoría:
--   null            → escaneo del modo LIBRE (no hay triage)
--   'exhibido'      → pasó por el lector
--   'solucionado' | 'una-unidad' | 'no-encuentra' → el triage de lo que ⛔ no apareció
-- ⚠️ La lista blanca la aplica `api/_exhib.js`: lo que venga fuera de esos cuatro entra null, para
-- que un cliente viejo o un valor inventado ⛔ no ensucie la columna con la que se decide.
alter table exhib_escaneo add column if not exists estado text;

-- La categoría de TN que se recorrió, tal como la eligió la persona. Va en la cabecera y ⛔ no en
-- cada escaneo: es del recorrido entero, como el `modo`.
alter table exhib_recorrido add column if not exists categoria text;

-- Para la pregunta que hace el PDF: «las tildes de ESTE recorrido, por estado».
create index if not exists idx_exhib_escaneo_estado on exhib_escaneo (recorrido_id, estado);

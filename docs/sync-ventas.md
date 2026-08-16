# Sync de ventas, vistas materializadas y ETL

Lo que corre **afuera de la app**: los scripts que traen la foto de Gestión Nube a Supabase, el
refresco de las vistas materializadas y el payload que arma el ETL. Vivía adentro de `AGENTS.md` y
salió el 16-ago-2026: son 21 líneas que sólo importan si tocás `scripts/` o `lib/etl/`, y se pagaban
en cada mensaje de cada sesión.

## Dónde vive

| qué | archivo |
|---|---|
| mapeo y guardado de ventas | `scripts/lib/ventas-espejo.mjs` |
| borrado de las que GN ya no tiene | `scripts/lib/purga-ventas.mjs` |
| histórico anterior a la ventana | `scripts/purga-historica.js` (arranca en simulación) |
| refresco de las vistas | `scripts/lib/refrescar-vistas.mjs` + `sql/migrate-refresco-vistas.sql` |
| payload de la app | `lib/etl/`, cacheado en IndexedDB (`lib/cache.ts`) |

## Reglas que el código no dice

**El sync relee los últimos 90 días y borra lo que GN ya no tiene.** Nació solo-upsert con ventana
incremental, así que una venta quedaba congelada en la foto de su primer día y una anulada seguía
sumando plata — GN no devuelve las anuladas con un estado: dejan de venir. El mapeo y el guardado son
una sola implementación para las dos marcas; `completo: false` es Zattia, cuya tabla todavía no tiene
cliente ni costo.

🔴 **La purga va DESPUÉS del upsert.** Si una venta cambió de fecha, mirarla antes la mostraría con la
fecha vieja y se borraría por "desaparecida".

**El `statement_timeout` de la API de Supabase es de 8 segundos**, y las tres vistas materializadas
juntas ya no entran. Por eso el refresco va **una llamada por vista**; el SQL les sube el tiempo a
120s. Mientras ese SQL no esté aplicado en una base, el módulo cae solo a `refresh_all_views()`.

🔴 **`allVariantesHuerfanas` (ETL) se lee SIEMPRE con `?? []`.** Son las variantes con stock cuyo
producto todavía no está en `productos`; van aparte de `allVariantes` a propósito, porque varias
secciones joinean contra el producto. Los cachés de IndexedDB anteriores al campo no lo traen.

## Lo que ya se rompió acá

🔴 **El refresco de vistas estuvo roto una semana con el job en verde.** Los pasos que fallaban eran
`console.warn` con salida 0. Ahora **un paso que falla sin frenar el sync se junta en `problemas[]` y
el script sale con código 1**, y si el job queda en rojo el Monitor lo muestra solo (`fetchUltimoSync`
lee el `conclusion`).

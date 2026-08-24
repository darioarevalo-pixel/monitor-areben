# Sync de ventas, vistas materializadas y ETL

Lo que corre **afuera de la app**: los scripts que traen la foto de Gestión Nube a Supabase, el
refresco de las vistas materializadas y el payload que arma el ETL. Vivía adentro de `AGENTS.md` y
salió el 16-ago-2026: son 21 líneas que sólo importan si tocás `scripts/` o `lib/etl/`, y se pagaban
en cada mensaje de cada sesión.

## Dónde vive

| qué | archivo |
|---|---|
| **el cliente HTTP de Gestión Nube** | `scripts/lib/gn-fetch.mjs` |
| mapeo y guardado de ventas | `scripts/lib/ventas-espejo.mjs` |
| **padrón de clientes** (la ficha, con el WhatsApp) | `scripts/sync-clientes.js` + `scripts/lib/clientes-espejo.mjs` |
| borrado de las que GN ya no tiene | `scripts/lib/purga-ventas.mjs` |
| histórico anterior a la ventana | `scripts/purga-historica.js` (arranca en simulación) |
| refresco de las vistas | `scripts/lib/refrescar-vistas.mjs` + `sql/migrate-refresco-vistas.sql` |
| payload de la app | `lib/etl/`, cacheado en IndexedDB (`lib/cache.ts`) |

## Reglas que el código no dice

🔴 **Nadie escribe su propio `gnFetch`.** Había diez copias y habían divergido: medido el
16-ago-2026, **cinco no reintentaban los errores de red** —el `fetch` sin `try/catch`, así que un
`fetch failed` mataba el job entero—, y cuatro de esas cinco eran de Zattia más
`sync-inventario-solo`, que es el que más corre. Ahora es `crearClienteGN({ token, pausaPagina })`
de `scripts/lib/gn-fetch.mjs`. La `pausaPagina` sí es de cada script (400 incremental, 1100 los que
barren catálogos enteros): es cuánto se le apoya a GN y no debe uniformarse sin querer.

**El sync relee los últimos 90 días y borra lo que GN ya no tiene.** Nació solo-upsert con ventana
incremental, así que una venta quedaba congelada en la foto de su primer día y una anulada seguía
sumando plata — GN no devuelve las anuladas con un estado: dejan de venir. El mapeo y el guardado son
una sola implementación para las dos marcas; `completo: false` es Zattia, cuya tabla todavía no tiene
cliente ni costo.

🔴 **Los clientes salen de la FICHA, no de la venta — y por eso los syncs de ventas no los
actualizan.** Los cuatro upsert de `clientes` de los syncs de ventas van con `ignoreDuplicates`:
dan de alta al que no existe y no tocan al que ya está. Hasta el 23-ago-2026 el padrón se deducía
de las ventas y eso costaba dos cosas: la ficha completada DESPUÉS de la compra no llegaba nunca, y
**el WhatsApp no viaja en la venta** (la ficha tiene dos teléfonos, la venta expone `phone_number` y
el que se carga a mano es `cellphone_number`). Eran 526 de 785 mayoristas "sin teléfono", con 463
cargados. Peor: como el upsert pisaba todas las columnas, una venta sin teléfono **borraba uno
bueno**. ⚠️ `sync-clientes.js` necesita `GN_TOKEN_CLIENTES` — la clave 113, la única con
`clients:read`; `GN_TOKEN` da 403 "Invalid ability provided". Y `GET /clientes` **ignora en
silencio** `?id=` y `?search=`: hay que paginar el padrón entero.

🔴 **`p.unit_cost ?? null` convertía «el token no puede verlo» en «el producto no tiene costo».**
Sin un error, sin un log: el sync corría, terminaba en verde y el upsert pisaba el espejo con NULL.
Sobrevivió meses — medido el 24-ago-2026, **BDI tenía 450 productos y 0 con `unit_cost`**, mientras
los tres tokens locales devuelven el costo en 50 de 50 (ejercido ese día contra GN con
`GN_TOKEN`, `GN_TOKEN_VIEJO` y `GN_TOKEN_ZATTIA`). Lo único distinto es el token de **GitHub
Actions**, que no tiene `costs:read` — el mismo patrón de habilidades que ya obliga a
`GN_TOKEN_CLIENTES` para `sync-clientes.js`. Ahora los cuatro scripts pasan por
`scripts/lib/costos-espejo.mjs`: si **NINGUNO** de los N productos trae `unit_cost`, eso no es un
dato, **la columna se saca del upsert** (así el `ON CONFLICT` no la toca y el espejo conserva lo que
tenía) y el problema entra a `problemas[]`. 🔑 **El criterio es «ninguno» y no un umbral**: con el
permiso puesto GN manda el campo en todos, con 0 en los que no tienen costo cargado —en Zattia son
769 de 2.676—, así que **el cero es un costo real** y un umbral dispararía con un catálogo legítimo.
⛔ **Correr el sync a mano con el token bueno NO lo arregla**: escribe los costos y la corrida de las
06:00 del día siguiente los borra. Un arreglo que dura 18 horas.

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

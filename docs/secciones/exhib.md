# Chequeo de exhibición — ficha de sección

Sección `exhib`, área `local`, sólo Zattia. Caminar el Local con el lector confirmando que cada
prenda con stock está colgada, y de paso controlar el cartelito de papel contra el precio de hoy.

**Son DOS recorridos distintos**, no dos vistas del mismo:

| | **Por categoría** (el viejo) | **Libre por lugar** (19-sep-2026) |
|---|---|---|
| unidad de trabajo | una categoría de Tienda Nube | un mueble del salón («perchero tops») |
| dónde queda | `localStorage` del teléfono | **la base**, con el lugar de cada escaneo |
| qué contesta | qué quedó sin escanear, con triage y PDF | qué se escaneó en cada lugar, con Excel |
| faltantes | los calcula | ⛔ **no los calcula**, a propósito |

## Dónde vive

`components/exhib/` (`Exhib.tsx` 530 — el modo por categoría y el selector · `useExhib.ts` ·
`ExhibLibre.tsx` · `useExhibLibre.ts`) · `lib/exhib/` (`core.ts` puro y compartido por los dos ·
`libre.ts` puro del libre · `datos.ts` la bajada · `cliente.ts` · `pdf.ts` · `tipos.ts`) ·
`api/_exhib.js` por `api/datos.js?recurso=exhib` · tablas `exhib_recorrido` y `exhib_escaneo`
(`sql/migrate-exhib-libre.sql`, **sólo en el Supabase de Zattia**) ·
`tests/exhib-core.test.ts` + `tests/exhib-libre.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **`precioDeGondola` → `ofertaVigente` de `lib/tienda.core.js`**, que es el MISMO número que
  imprime Etiquetas. Hasta el 16-ago-2026 cada una lo calculaba por su cuenta con reglas distintas,
  y eso termina en «reimprimí» sobre una etiqueta que estaba bien.
- **La cola de reetiquetado** (`components/etiquetas/useColaReetiquetado`) deriva acá sus
  sospechosos de no exhibidos. Se pide con el permiso de **Etiquetas**, no con el de esta sección:
  sin él la vista contesta 403 y la pantalla mostraría un error que no es suyo.
- **`lib/exhib/core.ts` lo usan los dos modos.** Tocar `buscarItem`, `normCode` o `exhibId` toca la
  caminata por categoría **y** la libre.

## Reglas que el código no dice

- 🔑 **Los precios salen de Tienda Nube y ⛔ no de nuestras campañas de Liquidación.** Medido el
  15-ago-2026: GN tenía 404 promos vivas en Zattia y la bitácora del Monitor conocía 262. Leyendo lo
  nuestro, **más de un tercio de las etiquetas a controlar aparecería «sin oferta» teniéndola** y el
  recorrido pasaría de largo en silencio. → `lib/exhib/tipos.ts`
- 🔑 **El modo libre guarda el código que NO cruza** (`encontrado = false`). Antes la pantalla decía
  «ese código no está en la lista» y el dato se perdía. Una prenda colgada que ⛔ no figura con stock
  en el Local —stock mal cargado, prenda de otra marca, devolución sin ingresar— **es el hallazgo
  que nadie puede reconstruir después**, porque el salón ya se caminó.
- 🔑 **El escaneo guarda TODAS las categorías TN del producto (`cleanCats`), ⛔ no la primera.** Es
  la columna entera del pedido: el perchero de tops contra lo que TN dice de cada prenda. Con
  `cleanCats[0]` —que es lo que usa el modo por categoría— la comparación ⛔ no se puede hacer.
- 🔑 **El único de `exhib_escaneo` es (recorrido, LUGAR, variante).** La misma prenda colgada en dos
  percheros son DOS filas y eso es información. `claveEscaneo` en `lib/exhib/libre.ts` tiene que
  seguir diciendo lo mismo que el índice, o la pantalla muestra uno menos de lo que la base guardó.
- 🔴 **El borrador del teléfono se limpia SÓLO cuando el servidor confirmó** (regla heredada de
  Recorridas). En el local la señal se corta; un escaneo borrado porque «ya se mandó» y que nunca
  llegó ⛔ no se recupera. Por eso `pendientes` sobrevive a la recarga, la pantalla dice cuántos
  quedan sin subir, y **cerrar con pendientes está prohibido**: sellar un recorrido incompleto lo
  deja incompleto para siempre y nadie se entera.
- 🔴 **El `id` del recorrido lo genera el teléfono, ⛔ no la base**, y por eso `abrir` es un upsert
  que ignora duplicados: el recorrido tiene que poder arrancar sin haber hablado con el servidor. El
  precio de eso es que el id viaja en el body ⇒ `recorridoDeLaMarca` verifica el `store` en **cada**
  escritura; el gate de la puerta solo ⛔ no alcanza. → `api/_exhib.js`
- 🔑 **La hora del escaneo la manda el teléfono.** `now()` diría cuándo se pudo subir, ⛔ no cuándo
  se escaneó.
- 🔑 **El lugar es texto libre con sugerencias, ⛔ no un catálogo.** El salón se reacomoda, y una
  lista cerrada que no tiene el perchero de hoy obliga a elegir uno que miente.
- ⚠️ **El escaneo es con lector físico** (input + Enter). La cámara ZXing del legacy era código
  muerto y ⛔ no se portó.
- ⚠️ **`store_name = 'Local'` y `available_quantity > 0`**: el recorrido ⛔ no ve el depósito.

## Lo que ya se rompió acá

- 🔴 **El cruce se congelaba contra un catálogo vacío** (arreglado el 7-sep-2026): el ETL publica
  asincrónico, la pantalla montaba con `productos` en `[]` y las 870 prendas quedaban en «(Sin
  categoría)» **para siempre**, porque nada volvía a cruzar cuando el ETL llegaba. ⇒ **lo que se
  baja y lo que se cruza son dos cosas y viven separadas**, y el cruce es derivado.
  → `lib/exhib/datos.ts` y `components/exhib/useExhib.ts`
- 🔴 **`tnAdminUrl` era la SEXTA copia de «cuál es el admin de cada tienda»** y se le escapó a la
  consolidación. Ahora el dominio sale de `lib/tienda.core.js`. → `lib/exhib/core.ts`

## Pendiente

Los tres son del modo **por categoría**, están medidos sobre los 770 productos del audit del
7-sep-2026 y ⛔ **no se tocaron**. El modo libre los esquiva por diseño —⛔ no usa categorías para
armar la lista— pero el otro sigue mintiendo:

- 🔴 **`construirItems` mete cada prenda en `cleanCats[0]`**, su primera categoría y nada más ⇒
  **BLUSAS (26), SHORTS (10) y BERMUDAS (8) muestran CERO**, y JEANS lista 40 de 79. Elegir esa
  categoría da pantalla vacía, que se lee como «no hay nada que chequear».
- 🔴 **`esCruce` compara con `includes` exacto** ⇒ `SHORTS, MINIS y FALDAS` contra `…Y FALDAS` da
  **cruce falso**.
- 🔴 **`limpiarCats` devuelve NOMBRES y ⛔ no IDs**: en TN hay 35 categorías y no 25 —JEANS existe
  tres veces—, así que las tres le parecen una sola. El desorden se ve en `/tncat`, ⛔ nunca acá.
- ▶️ **El modo por categoría sigue muriendo en el teléfono.** La tabla tiene `modo` justamente para
  que pueda subir algún día; hoy siempre entra `'libre'`.

## Cómo se prueba

`npx vitest run tests/exhib-libre.test.ts --reporter=dot` — el núcleo del libre entero, sin red.
Lo que el test ⛔ no puede ver y hay que ejercer a mano:

- **Los cuatro verbos que escriben**, contra producción, con el header `x-monitor-auth`:
  `abrir` → `escanear` (una fila encontrada y una no) → `escanear` la misma otra vez (el único ⛔ no
  duplica) → `cerrar`. **El oráculo es leerlo por `action=recorrido`**, que es el otro camino.
- 🔴 **En esta Mac ⛔ no se puede escribir en Zattia**: falta `ZATTIA_SUPABASE_SERVICE_KEY` en el
  `.env` y un script local contesta `permission denied` (42501). En Vercel sí está ⇒ se ejerce
  contra producción, o en BDI, que sí tiene la key.
- **La caminata con datos**: lugar, 3-4 prendas con el lector, cambiar de lugar, 2 más, terminar y
  abrir el Excel. Mirar la pantalla **con datos**, ⛔ no la vacía.

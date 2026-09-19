# Chequeo de exhibición — ficha de sección

Sección `exhib`, área `local`, sólo Zattia. Caminar el Local con el lector confirmando que cada
prenda con stock está colgada, y de paso controlar el cartelito de papel contra el precio de hoy.

**Son DOS recorridos distintos**, no dos vistas del mismo:

| | **Por categoría** (el viejo) | **Libre por lugar** (19-sep-2026) |
|---|---|---|
| unidad de trabajo | una categoría de Tienda Nube | un mueble del salón («perchero tops») |
| dónde queda | `localStorage` del teléfono | **la base**, con el lugar de cada escaneo |
| qué contesta | qué quedó sin escanear, con triage y PDF | qué se escaneó en cada lugar **y qué falta colgar** |
| faltantes | los calcula sobre la categoría entera | **sólo los hermanos de lo que tocó** (ver abajo) |

## Dónde vive

`components/exhib/` (`Exhib.tsx` 530 — el modo por categoría y el selector · `useExhib.ts` ·
`ExhibLibre.tsx` · `useExhibLibre.ts` · `ParaColgar.tsx`) · `lib/exhib/` (`core.ts` puro y
compartido por los dos · `libre.ts` puro del libre · `colgar.ts` **qué falta colgar** ·
`datos.ts` la bajada · `cliente.ts` · `pdf.ts` · `tipos.ts`) ·
`api/_exhib.js` por `api/datos.js?recurso=exhib` · tablas `exhib_recorrido` y `exhib_escaneo`
(`sql/migrate-exhib-libre.sql`, **sólo en el Supabase de Zattia**) ·
`tests/exhib-core.test.ts` + `tests/exhib-libre.test.ts` + `tests/exhib-colgar.test.ts`.

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
- 🔴 **«Para colgar» sólo mira los HERMANOS de lo que el recorrido tocó, y ése es el contrato
  entero** (`lib/exhib/colgar.ts`, 19-sep-2026). Un producto entra sólo si tuvo **al menos un
  escaneo que cruzó** —incluso uno en cero— y entonces se listan sus otras variantes **con stock**
  que ⛔ no pasaron por el lector. ⛔ **Sobre un mueble que nadie caminó ⛔ no se afirma nada**: el
  reporte por categoría pedía **20 corsets** que nadie había ido a mirar, y Bruno ese mismo día:
  *«todas las camisas, blusas y tops hizo; corsets no»*. La primera vez que el local va a buscar
  algo que estaba colgado, deja de creerle a la lista entera.
  📊 Medido sobre el primer recorrido real (97 escaneos, «Tops»): **46 variantes · 143 unidades ·
  32 productos**, y **39 de esas 46 salían «EXHIBIDO CORRECTAMENTE» en el PDF**. El caso normal ⛔ no
  es «falta un color raro»: **se cuelga un color y el resto queda en el guardado**.
  ⚠️ El stock se mira en el **inventario** y ⛔ no en el escaneo —un escaneo puede venir con `qty` 0—,
  y las escaneadas se miran del **recorrido entero**: la misma prenda puede estar colgada en otro
  mueble. ⚠️ **El orden de caminata lo dice el reloj del escaneo**, ⛔ no el orden del array: leída de
  la base, o subida de una cola sin señal, la lista viene desordenada.
- 🔑 **El modo libre guarda el código que NO cruza** (`encontrado = false`). Antes la pantalla decía
  «ese código no está en la lista» y el dato se perdía. Una prenda colgada que ⛔ no figura con stock
  en el Local —stock mal cargado, prenda de otra marca, devolución sin ingresar— **es el hallazgo
  que nadie puede reconstruir después**, porque el salón ya se caminó.
- 🔑 **El escaneo guarda TODAS las categorías TN del producto (`cleanCats`), ⛔ no la primera.** Es
  la columna entera del pedido: el perchero de tops contra lo que TN dice de cada prenda. Con
  `cleanCats[0]` la comparación ⛔ no se puede hacer.
- 🔴 **Y la LISTA del recorrido también sale de `cleanCats`, ⛔ no de `cat`** (19-sep-2026). `cat` es
  `cleanCats[0]` y quedó como **etiqueta de pantalla**; quien decide en qué categoría se recorre una
  prenda es `perteneceA` (`core.ts`), que mira todas. Armar la lista con `cat` hacía que una
  categoría que nunca es primera **⛔ no existiera**: medido con la app, **BLUSAS 0 → 66 variantes
  (27 productos), SHORTS 0 → 31, BERMUDAS 0 → 13**, DENIM 65 → 103 y JEANS 18 → 59. Una pantalla
  vacía se lee como «no hay nada que chequear».
- 🔑 **Dos categorías con la misma grafía son UNA** (`normCat`, sin mayúsculas ni espacios de más).
  En el catálogo conviven `SHORTS, MINIS y FALDAS` y `SHORTS, MINIS Y FALDAS` —distintas por ID en
  TN— y comparándolas letra por letra, elegir una listaba la mitad y la otra mitad daba **cruce
  falso**: la pantalla acusaba a una prenda bien colgada.
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
- 🔑 **«Eliminar» borra las DOS puntas, y sólo funciona en uno SIN CERRAR.** Limpiar sólo el
  teléfono dejaba un recorrido abierto para siempre en la lista, con escaneos a medias y sin nadie
  que lo pudiera cerrar — y el que lo mirara después ⛔ no tendría cómo saber que fue un arranque en
  falso. Uno **cerrado** contesta 409: ése es el dato con el que alguien va a comparar el salón y no
  puede irse de un toque desde el teléfono.
- 🔑 **La hora del escaneo la manda el teléfono.** `now()` diría cuándo se pudo subir, ⛔ no cuándo
  se escaneó.
- 🔑 **El lugar es texto libre con sugerencias, ⛔ no un catálogo.** El salón se reacomoda, y una
  lista cerrada que no tiene el perchero de hoy obliga a elegir uno que miente.
- ⚠️ **El escaneo es con lector físico** (input + Enter). La cámara ZXing del legacy era código
  muerto y ⛔ no se portó. 🔴 **Y el lector TIPEA**: si el foco queda en el campo «Lugar», el código
  entra como nombre del lugar y el escaneo se pierde **sin un solo error en pantalla**. Por eso Enter
  y el blur de ese campo mandan el foco al escaneo — ⛔ no es cosmético.
- 🔴 **`buscarItem` sigue pidiendo el código COMPLETO, y eso ⛔ no se afloja.** `normCode` saca
  espacios, guiones y ceros a la izquierda, ⛔ no prefijos: `0150NG` es `RTO-0150-NG` sin el suyo.
  Con gente usándolo, enganchar **la prenda equivocada** en silencio es peor que no enganchar.
  🔑 **Lo parcial se pregunta** (19-sep-2026): sin match exacto, `candidatosPorCodigo` ofrece las
  que **contienen** ese pedazo y **confirma la persona**, que tiene la prenda en la mano. Con datos
  reales: `0150NG` → 1 candidato (TOP ZOE), `698` → 2 (CORPIÑO AYLA y TOP HADES), **`NG` → 440** ⇒
  por eso hay `MIN_PARCIAL` (3 caracteres) y `TOPE_CANDIDATOS` (8): arriba de eso se dice cuántos
  parecidos hay y se pide de nuevo.
  🔴 **Un panel de candidatos sin resolver se guarda solo como «no cruzó»** apenas llega otro
  escaneo o se cierra el recorrido. Preguntar ⛔ no puede costar un escaneo: lo peor que puede pasar
  es que quede como quedaba antes de preguntar.
  🔴 **Y un match EXACTO también pregunta cuando engancha más de una** (`coincidencias`): **8 grupos
  / 20 variantes con stock comparten SKU** (`4008` es TOP MIA BLANCO **y** CHOCOLATE; `areben` son 6
  variantes de AYLA). Con el lector ⛔ no pasa —los barcodes son distintos, y de 97 escaneos reales
  los 97 engancharon por barcode— pero **un SKU tipeado a mano** marcaba la prenda equivocada en
  silencio. `buscarItem` sigue devolviendo la primera y lo usa el modo por categoría, donde un
  enganche malo ⛔ no escribe en la base.
- ⚠️ **Las categorías se muestran con `catsVisibles`**: el mismo nombre escrito igual ⛔ no se repite.
  En producción se vio «TOPS Y BODIES / TOPS Y BODIES» —el producto está en las **dos** categorías
  TN con ese nombre— y en la columna con la que se compara el perchero eso se lee como un error de
  la app. Es presentación: lo guardado ⛔ no se toca.
- ⚠️ **`store_name = 'Local'`, y desde el 19-sep-2026 SIN filtro de stock**: el recorrido ⛔ no ve el
  depósito, pero sí ve el Local entero —**2.188 filas: 1.083 con stock y 1.105 en cero o negativo**—.
  🔑 **Son dos listas y ⛔ no una**: `items` (qty > 0) es lo que hay que **chequear** —la lista, el
  triage, el PDF— y `buscables` (todo) es lo que el **lector puede enganchar**. Antes eran la misma
  y por eso una prenda colgada con el stock en cero ⛔ no se podía registrar: caía en «no cruzó»,
  idéntica a una lectura mala. Meterlas en `items` sería el error espejo — las 1.105 que el sistema
  ⛔ no tiene no son faltantes de nadie.
- 🔑 **Tres finales, ⛔ no dos** (`hallazgoDe` en `libre.ts`, la misma función para la pantalla y
  para la columna «Hallazgo» del Excel): vacío · **EN CERO** (`encontrado` con `qty <= 0`) ·
  **NO CRUZÓ** (`encontrado = false`). En la base ⛔ no hizo falta una columna nueva.

## Lo que ya se rompió acá

- 🔴 **El cruce se congelaba contra un catálogo vacío** (arreglado el 7-sep-2026): el ETL publica
  asincrónico, la pantalla montaba con `productos` en `[]` y las 870 prendas quedaban en «(Sin
  categoría)» **para siempre**, porque nada volvía a cruzar cuando el ETL llegaba. ⇒ **lo que se
  baja y lo que se cruza son dos cosas y viven separadas**, y el cruce es derivado.
  → `lib/exhib/datos.ts` y `components/exhib/useExhib.ts`
- 🔴 **`tnAdminUrl` era la SEXTA copia de «cuál es el admin de cada tienda»** y se le escapó a la
  consolidación. Ahora el dominio sale de `lib/tienda.core.js`. → `lib/exhib/core.ts`

## Pendiente

🏁 **Hecho el 19-sep-2026** (medido con las funciones de la app contra producción, ⛔ no estimado):
la lista sale de **todas** las categorías, el **cero se puede registrar** y el **código parcial
pregunta**. Números arriba, en «Reglas que el código no dice».

- 🔴 **`limpiarCats` devuelve NOMBRES y ⛔ no IDs**: en TN hay 35 categorías y no 25 —JEANS existe
  tres veces—, así que las tres le parecen una sola. El desorden se ve en `/tncat`, ⛔ nunca acá.
  ⚠️ **Medio tapado**: comparando por grafía, las repetidas se juntan en el desplegable y la lista
  sale completa igual. Lo que sigue sin verse acá es **cuántas categorías hay de verdad**.
- ⚠️ **298 variantes con stock (96 productos) ⛔ no cruzan con TN** ⇒ salen en «(Sin categoría)». Al
  modo libre ⛔ no lo frena, pero en el Excel les sale **vacía la columna con la que se compara**.
- ▶️ **El modo por categoría sigue muriendo en el teléfono.** La tabla tiene `modo` justamente para
  que pueda subir algún día; hoy siempre entra `'libre'`. 🔴 Y por eso **la pantalla abre en libre**:
  el 19-sep abría en categoría y el local recorrió media hora sin que llegara una sola fila.
- ▶️ **El PDF del modo por categoría ⛔ no dice DÓNDE apareció cada prenda** y el libre sí. Cruzar los
  dos se hace **por SKU**, que es lo único que comparten.

## Cómo se prueba

`npx vitest run tests/exhib-core.test.ts tests/exhib-libre.test.ts tests/exhib-colgar.test.ts
--reporter=dot` — el núcleo de los dos modos y el de «para colgar», sin red. ⚠️ **Y `tests/espejo-servidor.test.ts`**, que tiene la consulta de `datos.ts`
copiada palabra por palabra: tocarla sin tocar esa línea es un **400 en producción**.
Lo que el test ⛔ no puede ver y hay que ejercer a mano:

- **Los cinco verbos que escriben**, contra producción, con el header `x-monitor-auth`:
  `abrir` → `escanear` (**una con stock, una EN CERO y una que ⛔ no cruza**) → `escanear` la misma
  otra vez (el único ⛔ no duplica) → `sacar-escaneo` → `cerrar`, y `eliminar` sobre uno sin cerrar.
  **El oráculo es leerlo por `action=recorrido`**, que es el otro camino — y `eliminar` se comprueba
  con el 404 de después. ⚠️ **Y ⛔ no cerrar el recorrido de prueba**: uno cerrado contesta 409 al
  eliminar y queda para siempre en la lista que mira el local (ya pasó una vez).
  🏁 Ejercido así el 19-sep-2026: FAJA CLEO `encontrado=true qty=3` · MONITO CAPRY
  **`encontrado=true qty=0`** · `ZZZ-NO-EXISTE-99` `encontrado=false`.
- 🔴 **En esta Mac ⛔ no se puede escribir en Zattia**: falta `ZATTIA_SUPABASE_SERVICE_KEY` en el
  `.env` y un script local contesta `permission denied` (42501). En Vercel sí está ⇒ se ejerce
  contra producción, o en BDI, que sí tiene la key.
- **La caminata con datos**: lugar, 3-4 prendas con el lector, cambiar de lugar, 2 más, terminar y
  abrir el Excel. Mirar la pantalla **con datos**, ⛔ no la vacía.
- **«Para colgar» contra el recorrido real**: con las funciones de verdad y los datos de producción,
  `ex1789825143664_abbjt3` tiene que dar **46 variantes · 143 unidades · 32 productos**, con
  **2** marcadas por SKU compartido y **cero corsets**. Es el oráculo: si cambia, cambió la regla.

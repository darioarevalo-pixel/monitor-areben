# Ubicaciones depósito — ficha de sección

Sección `ubicaciones-local`, área `local`, sólo Zattia. Dice **en qué estante del depósito de atrás
del local** está guardado cada producto. Antes se ordenaba por SKU y nadie sabía a qué estante ir:
el depósito se reacomoda con cada ingreso y con cada agotado. Plan (4 fases):
`~/Documents/reunion-gerencia/2026-10-04-ubicaciones-deposito-plan-v1.md`.

## Dónde vive

`components/ubicaciones-local/UbicacionesLocal.tsx` (las tres vistas) · `lib/ubicaciones-local/`
(`core.core.js` JS plano, lo usan el handler y la pantalla; `cliente.ts`) · `api/_ubicaciones-local.js`
por `api/datos.js?recurso=ubicaciones-local` · tablas `ubicacion_local` (la foto actual) y
`ubicacion_local_lectura` (el historial), y la función `reemplazar_estante`
(`sql/migrate-ubicaciones-local.sql`) · `tests/ubicaciones-local.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **`claveDe`** (`core.core.js`) es la regla de «qué es el producto»: `skuBase` del Conteo estándar la
  reexporta, y la etiqueta de bolsa de **Etiquetas** imprime esa clave en barras. Cambiarla mueve las tres.
- **La Caja también lee** (`puedeVerAlguna(…, ['ubicaciones-local','caja'])`): en F4 va a decir
  «atrás: A1 · A2» al escanear una prenda.
- El Local que baja la pantalla es **el del Chequeo de exhibición** (`bajarExhib` + `armarProdMap`).

## Reglas que el código no dice

- 🔑 **Percha + atrás son UN stock** («Local» en GN), y ⛔ eso no se separa (Bruno, 4-oct). Acá se
  guarda **dónde**, nunca **cuánto**: la sección ⛔ toca stock.
- 🔑 **Por producto, no por color**: los colores van juntos en la misma bolsa/estante. ⛔ No es el
  `product_id` de GN ni el campo SKU del producto (en 373 de 440 dice cualquier cosa).
- 🔑 **Escaneo total**: guardar un estante lo REEMPLAZA (en una transacción). Escanear otro estante
  guarda el anterior; si no se pudo guardar, ⛔ se cambia de estante.
- 🔑 **Cada bolsa se reconoce en el teléfono** contra el Local del espejo, para pitar al toque. Lo que
  el Local ⛔ tiene se le pregunta al servidor antes de pitar: «no figura» y «sin stock» son dos avisos.
- ⚠️ Lo escaneado vive en `localStorage` hasta que el servidor confirma (recarga y corte de señal).
- ⚠️ «Stock sin bolsa» avisa sólo con **más de 3** en alguna variante: con 3 o menos puede estar
  todo colgado (eran ~140 productos de ruido el 1-oct). Los controles usan **el espejo de las 3 AM**.
- ⚠️ 8 productos comparten el SKU `AREBEN` (lencería/outlet) y 3 no tienen SKU ⇒ para la ubicación
  son UN producto / ninguno.
- ⚠️ ⛔ Es «Ubicaciones» de BDI (área Depósito, observación de GN en formato NN-N): otra cosa.

## Pendiente

- La **carga inicial** la hace el local: imprimir las etiquetas de estante (Etiquetas → Libre),
  etiquetar las bolsas por producto y el primer escaneo total.
- **Novedad**: no hace falta mientras la vea sólo Bruno.
- **F4**: la Caja dice «atrás: A1 · A2».

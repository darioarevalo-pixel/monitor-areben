# Ubicaciones — ficha de sección

Sección `ubicaciones`, área `deposito`. Dónde está cada producto en el depósito grande de la marca (formato `NN-N`, estante-fila):
BDI = `Deposito Minorista`, Zattia (con Stunned adentro) = `Deposito ` (Lorena). ⛔ Es el depósito de atrás del local: ese es
`ubicaciones-local`, otra sección. La ubicación ordena el recorrido de Reposición y **Logística arma los retiros con ella**
(Bruno 31-oct: «seguro, 100%»).

## Dónde vive

`components/ubicaciones/Ubicaciones.tsx` (528) · `lib/ubicaciones/` (`core.ts` puro, `cliente.ts`, `erp.core.js` + `erp-cliente.ts`) ·
escribe `api/_observaciones.js` y lee `api/_ubicaciones-erp.js`, los dos por `api/deposito.js?recurso=` · tabla del motor
`ubicacion` (sql/066) y `inventario.observation` del espejo de GN · `tests/ubicaciones.test.ts`, `tests/ubicaciones-erp.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **Reposición** lee la misma `observation` (`lib/reposicion/cliente.ts` → `inventario.ts` `ubic`): ordena `listaLlevar`, el
  armado con lector y la columna «Ubic.» del PDF. Los dos lectores pasan por `conUbicacionDelErp` ⛔ se lee la ubicación por otro lado.
- **Logística** (app de Ger, ⛔ en ningún repo) también la lee: cómo (GN vivo o espejo) está preguntado en
  `~/Documents/erp-monitor/mensaje-ger-31oct.md`.

## Reglas que el código no dice

- 🔴 **Desde el corte de la LÍNEA (`erp_corte`) la ubicación vive SÓLO en el ERP** (diseño aprobado por Bruno 31-oct). Antes del
  corte se escribe DOBLE (GN + ERP) y GN es la verdad; si el ERP falla, la carga ⛔ frena. Un día antes de cada corte se corre
  `node bin/ubicacion.mjs copiar --linea X --escribir` en el motor ⇒ el ERP arranca igual a GN. Stunned cortó el 28-oct, antes de
  que existiera la tabla ⇒ su copia va con `--aunque-corto`.
- 🔴 **Sin saber si la línea cortó, ⛔ se elige camino**: escribir da 503, leer TIRA (pantalla con error, ⛔ la de GN vieja).
- 🔑 La línea sale del producto en el servidor (escritura, `productos.sku`) y del SKU de la variante en la lectura (`lineaDe` del
  motor, la regla del libro). Una variante de línea cortada sin fila en el ERP se ve VACÍA, ⛔ con lo de GN.
- 🔑 El ERP guarda por talle (como GN); la carga escribe todas las variantes del producto: las del catálogo, las del espejo en ese
  depósito y las que ya tenían ubicación (para que limpiar las limpie todas). Vacío = se borra la fila.
- ⚠️ El día del pasaje del espejo (`pasaje-espejo-corte.sql`) `inventario` pasa a ser la vista del ERP y ya trae la ubicación del
  ERP (sql/066 recreó `espejo_motor.inventario`): la mezcla queda idempotente.

## Lo que ya se rompió acá

- «Lo cargué y se revirtió solo»: un `ok` sobre 0 variantes daba «guardado» → `api/_observaciones.js` (sin renglones) y
  `lib/ubicaciones/cliente.ts` (`guardarObservacion`).
- GN corta por ráfaga (429): el handler saltea lo ya escrito y la pantalla reintenta → `api/_observaciones.js`.
- La paginación del espejo perdía renglones al ordenar por nombre → `lib/ubicaciones/cliente.ts` (`order=product_id,size_id`).

## Pendiente

- ▶️ Logística: según conteste Ger, alcanza con el espejo o hace falta una lectura del ERP por `erp.arebensrl.com` (la misma
  puerta que la cola «a preparar», `contrato-logistica.md` que ⛔ se escribió).
- ⚠️ Reposición guarda una foto local (huella = hora del sync + día): una ubicación cargada en el ERP para una línea cortada
  aparece recién en la próxima bajada.

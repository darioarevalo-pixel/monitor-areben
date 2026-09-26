# Conteo de fundas (BDI) — ficha de sección

Sección `conteo`, solo BDI. Se cuentan las fundas de la ubicación **Local** de GN escaneando,
de a **un modelo de celular por vez**, y al cerrar se genera el Excel de ajuste que se importa en
GN. Reemplazó en jul-2026 al viejo «Conteo de local» (escaneo con número absoluto, sin historial).

## Dónde vive

`components/conteo-local-bdi/` (`ConteoLocalBdi.tsx` ~900 líneas, `useConteoLocalBdi.ts`) ·
`lib/conteo-local-bdi/` (`core.ts` puro, `tipos.ts`) · stock vivo por
`/api/deposito?recurso=inventario&loc=local` · historial en la tabla `conteos_deposito` por
`/api/deposito?recurso=conteos` · test `tests/conteo-local-bdi-core.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **`lib/conteo-deposito/core.ts` (`aoaAjuste`, el formato del Excel) y la tabla
  `conteos_deposito` son de los cuatro conteos** → leer `docs/secciones/conteo-deposito.md`.
  Este se separa con `resumen.modo = 'local-bdi'` + `resumen.modelo`: sin el `modo`, el
  historial y las fechas del Conteo de Depósito de BDI se ensucian.
- El historial y el instructivo son los de `components/conteos/comunes.tsx`.

## Reglas que el código no dice

- 🔴 **Lo cuenta el personal del local en la COMPU, con la música por los mismos parlantes.**
  El beep no se oye (y en iPhone no hay vibración). Por eso ningún aviso puede depender del
  sonido ni de que alguien esté mirando justo esa lectura: una lectura rechazada **frena la
  pantalla** (`CartelNoContada`) y queda en la lista de no contadas hasta el cierre.
- 🔑 **El cartel rojo NO es el `Modal` del kit, a propósito**: el Modal se lleva el foco y el
  Enter del escáner lo cerraba solo. Está comentado en el componente.
- 🔑 **La pila física se pide A CIEGAS**: el diálogo de cierre no muestra cuántas se escanearon.
  Si lo mostrara, se copia el número y el control deja de controlar. Es lo único que atrapa las
  lecturas hechas con el cursor en **otro programa** (WhatsApp Web, el mail): esas nunca llegan
  a la página. Cerrar con diferencia se permite y queda en `resumen.control`.
- 🔑 Los casilleros confirman con Enter o al salir, no tecla por tecla, y rechazan lo que
  `pareceCodigo` (más de 4 dígitos o letras): el escáner con el cursor en un casillero dejaba
  la funda con «7798123456789» unidades.
- ⚠️ **Cerrar pide el sub-permiso `conteo.aplicar`**, que no se hereda de la función: si quien
  escanea no lo tiene, no hay Excel. Y como el conteo en curso vive en el `localStorage` del
  aparato (`monitor_conteofundas_bdi`, con las lecturas no contadas adentro), nadie puede cerrar
  por otra persona.
- ⚠️ **El Excel no se guarda en el Monitor.** Se descarga una sola vez en el aparato de quien
  cierra; el historial tiene el detalle pero no vuelve a bajar el archivo. El ajuste en GN existe
  recién cuando alguien lo importa.

## Pendiente

- ⚠️ **El «sistema» no queda congelado**: cada recarga de la página vuelve a leer el vivo y pisa
  `esperado`, pero conserva lo escaneado y el `stockTime` viejo. La diferencia usa el stock de la
  última recarga. El Conteo de Depósito sí congela.
- ⚠️ `InstructivoConteo` (compartido) habla de «Terminar producto» y «Generar el ajuste», botones
  que esta sección no tiene.
- ⚠️ Si falla el guardado del historial, el Excel sale igual y no se avisa (`catch {}` en `onGenerar`).
- ⚠️ Si dos fundas distintas comparten código de barras, `byBc` se queda con la última sin avisar.
- ▶️ `resumen.control` (pila / escaneadas / no contadas) se guarda pero el historial no lo muestra.

## Cómo se prueba

`npx vitest run tests/conteo-local-bdi-core.test.ts`. La pantalla no se puede ejercer con
`next dev`: el stock vivo sale de `/api/deposito`, que necesita `vercel dev` (no anda en la Mac de
Darío). Se prueba en prod con un modelo chico: escanear un código ajeno y ver el cartel, escanear
con el cursor en un casillero, clickear afuera y ver la franja, y cerrar con una pila que no
coincide.

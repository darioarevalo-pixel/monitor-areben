# Conteo de depósito — ficha de sección

Sección `conteo-deposito`, área `deposito`. Conteo físico **producto por producto, a mano** (no por
escaneo): se busca el producto, se carga cuánto hay de cada variante y se termina. Port sin DOM del
legacy (`index.html:11549-12021`).

## Dónde vive

`components/conteo-deposito/` (`ConteoDeposito.tsx` 690 · `useConteoDeposito.ts`) ·
`lib/conteo-deposito/` (`core.ts` 273 — toda la lógica pura · `cliente.ts` · `tipos.ts`) ·
`api/_conteos-deposito.js` por `deposito.js?recurso=conteos` · tabla `conteos_deposito` ·
`tests/conteo-deposito-core.test.ts` + `tests/conteo-flujo.test.ts`.

## ⛔ Es la casa compartida de los CUATRO conteos

`lib/conteo-deposito/core.ts` no es sólo de esta sección: `HEADER_AJUSTE`, `ANCHOS_AJUSTE` y
`aoaAjuste` los importan también `components/conteo-local-bdi/` y `components/conteo-estandar/`
(Zattia y Stunned). La tabla `conteos_deposito` es **una sola** y las cuatro se separan por
`resumen.modo`; el endpoint también es uno, y por eso `puedeContar` mira `SECCIONES_CONTEO` entera.
⇒ **tocar `core.ts` toca cuatro pantallas, y las cuatro ajustan stock.**

## Reglas que el código no dice

- 🔴 **El monitor NO escribe stock en Gestión Nube.** Genera un Excel que alguien sube a
  «Importar y Ajustar». `HEADER_AJUSTE` es el header **exacto** de GN: no se toca.
- 🔑 **El ajuste es `nuevo = vivo + dif`, no `nuevo = contado`.** `dif` se congela al terminar el
  producto (contra el `snap` del sistema tomado al abrirlo), así que **las ventas que pasan durante
  el conteo no lo ensucian**. Es la razón de que exista `snap` y no se relea el stock al final.
- 🔴 **Candado de seguridad**: sólo ajusta la variante cuyo stock está confirmado **en vivo**
  (`inventory_id` no nulo en el feed y en la fila). Si no, va a `missing` = «revisar a mano». Sin
  eso, una variante del espejo desactualizado escribiría un stock inventado en GN.
- 🔴 **El Excel es de UNA marca.** Subirlo al GN de la otra da «Inventario no encontrado»: los IDs no
  existen ahí. El diálogo de confirmación lo dice con la marca en mayúsculas a propósito.
- ⚠️ **El conteo en curso vive en el `localStorage` de ESE dispositivo** (`monitor_conteodep_<marca>`,
  la misma clave que el legacy, para no perder lo cargado en el flip). **El que aplica tiene que
  estar en la misma compu o celular donde se contó.** 🔴 Y hay **dos dominios**, así que también
  tiene que ser el mismo — ver `project_monitor_dos_dominios_localstorage`.
- 🔑 **Terminar cuenta las variantes en blanco como 0**: «no lo conté» y «no hay» se resuelven igual
  al terminar, que es lo que pasa en el depósito. Volver sin terminar **no** congela nada.
- 🔑 **El historial guarda TODAS las variantes, no sólo las que difieren** (`registroConteo`): es lo
  que hace que un producto contado sin diferencia igual reciba fecha de último conteo. El Excel, en
  cambio, lleva sólo las diferencias.
- 🔑 **La firma sale de `perfil.name`, nunca del body.**
- 🔴 **Si falla el guardado del historial, el Excel ya se generó igual** (el `catch` vacío es a
  propósito): lo que ajusta stock es el archivo, y perderlo por un 500 del historial sería peor.

## Lo que ya se rompió acá

Los tres están comentados en el lugar exacto donde muerden; acá van para saber **qué mirar antes de
tocar**, no para repetirlos.

- 🔴 **Exigir usuario NO es exigir permiso** — hasta el 13-ago-2026 cualquier cuenta válida (incluidos
  los puestos compartidos, cuya contraseña conoce medio equipo) leía o escribía conteos de la **otra**
  marca. → `api/_conteos-deposito.js:34`
- 🔴 **La firma salía del body**, así que un conteo se podía firmar con el nombre de otro.
  → `api/_conteos-deposito.js:43`
- 🔴 **`maxDuration` huérfano**: vivía en `_inventario-vivo.js`, y Vercel sólo lo lee del archivo de
  **ruta**. Al pasarse, Depósito ve un `SyntaxError` en vez de un mensaje. → `api/deposito.js:37`

## Pendiente

- ⚠️ **`ultimosPorProducto` matchea por `pid` y, como fallback, por NOMBRE**: dos productos con el
  mismo nombre comparten fecha de último conteo. Es del legacy y todavía no mordió.
- ⚠️ **Un conteo viejo sin `resumen.modo` cuenta como de depósito** (`if (modo && modo !== 'deposito')`):
  los anteriores al sellado entran a esta lista aunque fueran de otra pantalla.

## Cómo se prueba

`npx vitest run tests/conteo-flujo.test.ts --reporter=dot` — corre el flujo entero (agrupar → abrir →
contar → terminar → calcular ajuste → Excel) y lo compara contra el **código del legacy extraído en
vivo de `index.html`**, así que el `nuevo_stock` que se sube a GN queda verificado byte a byte sin
depender de un conteo físico. Cubre de paso el conteo estándar, que reusa el mismo motor.

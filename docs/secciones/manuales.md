# Manuales — ficha de sección

Sección `manuales`, área `sistema`. **Cómo se hace cada cosa**: el procedimiento de trabajo, no el
paso a paso de la pantalla. Reemplazó que el procedimiento viviera en la cabeza del que lo hace.
Está en `KEYS_PARA_TODOS`: **la ve todo el equipo**; lo que se tilda es el sub `manuales.editar`.

⚠️ No confundir con la **Agenda** —«esto va hoy»— ni con **Novedades** —«esto cambió, leelo una
vez»—. Un manual no vence y no avisa: se busca cuando hace falta.

## Dónde vive

`components/manuales/` (`Manuales.tsx` la lista y la lectura · `EditorManual.tsx` el alta) ·
`lib/manuales/` · handler **`api/_sistema.js`, compartido con Novedades**, por
`datos.js?recurso=sistema` · tabla `manuales` **en la base de BDI** (un manual no tiene marca) ·
`sql/migrate-manuales.sql` + `scripts/apply-manuales.mjs` · CLI de carga `scripts/manual.mjs` ·
tests `tests/manuales.test.ts` y `tests/markdown.test.ts`.

## ⛔ Lo que comparte con otras secciones

- 🔴 **`lib/markdown/core.ts` + `components/ui/Markdown.tsx` NO son de Manuales.** Los usan también
  Novedades (cuerpo y cartel), la Agenda —el detalle de un pendiente y **los pasos de la promo
  bancaria, que se leen con el cliente delante**— y la Guía. ⇒ **un cambio en el parser se camina en
  cinco pantallas, no en una.**
- **`api/_sistema.js` es de Novedades y de Manuales.** El GET trae las dos cosas de una: por eso el
  botón «Cómo se usa» de cualquier pantalla **no dispara ningún fetch para saber si existe**.
- **`agenda_items.manual_id` cuelga de esta tabla** — es lo que hace que la rutina avise y el manual
  explique. Ver «Lo que ya se rompió».

## Reglas que el código no dice

- 🔑 **El mismo manual se lee en TRES lugares**, y lo que se le agregue al cuerpo aparece en los
  tres: la página `/manuales`, el modal «📘 Manual de uso» del encabezado de cada pantalla
  (`components/layout/AyudaDeSeccion.tsx`) y el «📘 Cómo se hace» del renglón de un pendiente
  (`components/agenda/PendientesHoy.tsx`). Los dos últimos son **modales**: lo que ahí adentro no
  entra en una pantalla, no entra.
- 🔑 **`seccion` es opcional y ahí está todo el diseño.** Con la sección como clave habría que
  inventar keys falsas para «cómo se cierra la caja», y esas keys después ensucian el nav. El
  **índice único parcial** garantiza un manual por pantalla, y el handler traduce su violación a un
  409 legible («Esa pantalla ya tiene un manual»).
- ⚠️ **La `seccion` NO se valida contra las keys reales en el handler**: `api/_sistema.js` es JS
  plano y no puede importar `lib/nav.ts`. Sólo se corta a 60. La red real son el `<Select>` del
  editor y `tests/manuales.test.ts`.
- 🔑 **El índice viaja sin cuerpo, el cuerpo se pide al abrir.** Un manual largo en el GET del shell
  lo pagaría cada sesión, lo abra o no.
- 🔑 **Un manual sin publicar sólo lo ve quien edita** (GET y listado). Un botón que promete ayuda y
  abre un cartel vacío es peor que no tener botón.
- 🔑 **El ancla de cada título la calcula el PARSER, no la pantalla** (23-ago-2026). Es la única
  forma de que dos títulos iguales no compartan ancla: el que ve el documento entero es el parser.
  Sin eso, el índice de un manual con dos «Cómo se hace» manda siempre al primero y en silencio.
- 🔴 **Los `id` de los títulos llevan un prefijo de `useId()`**, y no es cosmético: en `/manuales`
  conviven el manual abierto y la vista previa del editor, los dos con los mismos títulos ⇒ dos `id`
  iguales y `getElementById` devuelve el que encuentra primero.
- 🔑 **La URL es la única fuente de cuál manual está abierto** (`?manual=<id>`, `useFiltroUrl`).
  Abrirlo es escribir su id ahí; no hay un segundo camino. Por eso llegar por un link y hacer clic
  en la lista son exactamente lo mismo. El `id` es opaco (`m<epoch>_<rand>`) ⇒ **el link se copia
  con el botón**, no se escribe.
- 🔴 **El salto del índice va SIN `behavior: 'smooth'`, y está medido.** Adentro de
  `.mo-modal-body` el scroll suave no mueve nada —el `scrollTop` se queda en 0—, mientras que el
  salto directo lleva el mismo contenedor a 4.497. En la página el suave andaba: por eso el defecto
  sólo aparecía en dos de los tres lugares donde se lee un manual, y ningún test lo toca.
- 🔑 **Los bloques nuevos se pintan con el KIT, no con markup** (23-ago-2026): la tabla con
  `TableWrap/Th/Td` y el recuadro con `Notice`. Por eso «entender tablas» no agrandó la superficie
  de ataque —sigue sin salir un string de HTML del parser—: agrandó el vocabulario.
- 🔑 **Tres reglas de tolerancia, y las tres son la misma**: lo que no matchea se ve tal cual.
  ⇒ una tabla **sin la fila de guiones no es una tabla**, es un párrafo con pipes (y la fila tiene
  que ser guiones de verdad: sin mirar la forma de cada celda, cualquier renglón con un guion
  convertiría al de arriba en encabezado) · un `>` que **no** abre con `[!REGLA]`, `[!OJO]` o
  `[!NUNCA]` se ve con el `>` adelante, porque las citas comunes acá no existen · y **un renglón
  sangrado no abre una lista**.
- 🔴 **La sangría de un sub-renglón son 4 espacios o un tab, NO 2.** El patrón de primer nivel
  acepta hasta 3, así que en los manuales ya escritos un ítem con 2 adelante **ya es de primer
  nivel**: pedir 4 no le cambia la forma a nada de lo cargado.
- ⚠️ **Los botones de tabla y recuadro NO son toggle**, a diferencia de los demás de la barra: una
  tabla no se desarma sacándole un prefijo, y un botón que a veces borra tres renglones no se
  aprieta tranquilo.
- ⚠️ **Con un manual abierto las dos listas se esconden.** El manual se dibuja arriba de ellas, así
  que dejarlas obligaba a scrollear la lista entera para volver.

## Lo que ya se rompió acá

- 🔴 **Crear `api/manuales.js` «por prolijidad» frena TODOS los deploys sin error visible**: Hobby
  admite 12 funciones. Vercel sigue sirviendo la versión anterior y no avisa.
- 🔴 **`scripts/manual.mjs` DESPUBLICA en silencio.** Correrlo de nuevo sobre un manual publicado lo
  deja en borrador, porque el upsert escribe `publicado: !!m.publicado`. Para eso está `--editar`,
  que lee la fila antes y conserva `publicado` y `orden`. ⚠️ Ese script escribe en **producción**.
- 🔴 **`agenda_items.manual_id` es `text` pelado, sin `references`**: borrar un manual deja las
  rutinas apuntando a la nada. No falla —el botón «Cómo se hace» simplemente no se dibuja— y **el
  cartel de borrado no lo avisa**, porque desde el manual todavía no se puede saber cuántas son.

## Pendiente

- ▶️ **Imágenes**, y **«qué rutinas de la Agenda explica este manual»** — la consulta inversa de
  `manual_id`, que además le da al cartel de borrado el número que hoy no tiene.
- ⚠️ **La barra ofrece UN recuadro (`[!OJO]`) y los tres se escriben cambiando la palabra.** Está
  dicho en el `hint` del campo; si resulta que nadie encuentra los otros dos, son tres botones.

## Cómo se prueba

`npx vitest run tests/manuales.test.ts` y `npx vitest run tests/markdown.test.ts`.

Lo que el test **no** ejerce y hay que caminar a mano:

- 🔴 **El salto del índice ADENTRO de un modal**, que es el que se rompe callado —y ya se rompió
  una vez, ver arriba—: en la página scrollea el documento y en el modal tiene que scrollear el
  modal. Abrir el mismo manual por «Cómo se usa» desde su pantalla y saltar a un título del final.
- **El link**: copiarlo con el botón y **pegarlo en otra pestaña**. Y un id que ya no existe, que
  tiene que avisar y dejar la lista igual, no una pantalla vacía.
- **Un manual sin publicar con un perfil que no edita**: no tiene que aparecer ni en la lista ni
  detrás del botón del encabezado.
- **Una tabla ancha adentro del modal** de «Cómo se usa», que es donde el manual se lee en menos
  ancho: tiene que scrollear sola y no empujar el modal.

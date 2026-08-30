# Organización — ficha de sección

Sección `organizacion`, área `sistema`. **De quién es cada cosa, sin fecha**: el organigrama, de qué
responde cada persona, qué decide sola, qué publica, qué NO es suyo — y lo que hoy no es de nadie.
Reemplaza a un documento suelto (`~/Documents/quien-hace-que/01-marketing-responsabilidades.md`) y a
lo que hasta ahora sólo vivía adentro de dos manuales sin publicar.

## Dónde vive

`components/organizacion/` — `Organizacion.tsx` es **sólo el shell**: datos, pestañas y los helpers
compartidos (`apodoDe`, `cuantasDe`, `rolDe`, `personasDe`). Una vista por archivo:
`Organigrama.tsx` · `MatrizSector.tsx` · `FichaPersona.tsx` (exporta también `Renglon`, que reusa
`SinDueno`) · `SinDueno.tsx` · `EditorResp.tsx`
· `lib/organizacion/` (`core.js` las reglas · `tipos.ts` el re-export tipado · `cliente.ts`) ·
handler `api/_organizacion.js`, que entra por `api/datos.js?recurso=organizacion` ⛔ **y no por un
archivo de ruta propio** (12 funciones en Hobby, hay 7) · tablas `organizacion_nodos` y
`organizacion_resp` en la base de **BDI** (`sql/migrate-organizacion.sql`, `scripts/apply-organizacion.mjs`)
· `tests/organizacion.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **El padrón**: `lib/usuarios/equipo.ts` (`traerEquipo`), el mismo que usa el selector «a una
  persona» de la Agenda. Trae `{name, apodo, funcion}` para cualquiera con sesión. ⛔ No pedir el
  padrón por otro camino: el otro es admin-only.
- **La Agenda**: la ficha de una persona lee `?recurso=agenda` y filtra con `clavesDestino()`
  (`lib/novedades/tipos.ts`). ⛔ **Las rutinas no se copian acá.** Duplicar el dato es lo que hace
  que una de las dos fuentes mienta el día que alguien edita la otra.
- **Los manuales**: `manual_id` es la misma flecha lógica que `agenda_items.manual_id` — `text`
  pelado, sin `references`. La rutina dice CUÁNDO, la responsabilidad dice DE QUIÉN y las dos
  cuelgan del manual que dice CÓMO.
- **El parser de markdown** (`lib/markdown/core.ts`) para el `detalle`: lo comparten Novedades,
  Manuales y la Agenda.

## Reglas que el código no dice

- 🔑 **Cada vista tiene otra forma PORQUE tiene otra pregunta**, y la primera versión se cayó
  justamente por no hacerlo: las cuatro mostraban la misma lista agrupada por clase, con el mismo
  peso visual. *«Todo muy plano, todo lineal»* (Bruno, 30-ago-2026). Organigrama = ¿quién cuelga de
  quién? (árbol con codos + conteo) · Por sector = ¿cómo se reparte? (**matriz**: personas en
  columnas) · Por persona = ¿de qué responde? (ficha a dos columnas, rutinas arriba) · Sin dueño =
  ¿qué no es de nadie? (por sector, lo más viejo primero).
- 🔑 **En la matriz, «Responde por» y «Publica» van completas y las otras tres arrancan como
  número.** Son el titular de una persona; el detalle de tres personas a la vez no se lee, se
  hojea. Y el número ya dice algo: *«Cami tiene seis cosas escritas que NO son suyas»*.
- 🔑 **La celda vacía de la matriz dibuja «—», ⛔ no queda en blanco.** Un blanco se lee como «no
  cargado» y una raya se lee como «nadie», que es lo que la matriz vino a mostrar.
- ⚠️ **La matriz no dibuja el `detalle`**, va como tooltip: tres párrafos de tres personas
  desalinean las filas y matan la comparación, que es lo único que esa vista sabe hacer.
- 🔴 **«Sin dueño» dice «anotado el …», ⛔ NUNCA «sin dueño hace …».** `created_at` dice cuándo se
  escribió la fila, no desde cuándo está huérfana: si a algo se le sacó la dueña ayer, la fila
  puede ser de hace tres meses. La segunda frase inventaría una espera que nadie midió.
- ⚠️ **El conteo del organigrama va sólo en los nodos con cuenta del padrón, y el CERO se dibuja**
  (en ámbar): ahí un cero afirma *«está en el organigrama y no tiene nada escrito»*. En un nodo sin
  cuenta no va nada, porque ahí el cero afirmaría otra cosa — que no lo podemos saber.
- 🔑 **La misma persona puede tener DOS nodos.** Cande está en Marketing y en Diseño y las dos son
  ciertas; la clave del árbol es `id` y la identidad sigue siendo el `name`, así que su ficha es una
  sola. ⚠️ Donde el eje es la persona —`personasDe`, las columnas de la matriz— hay que deduplicar,
  o sale con dos columnas idénticas y la matriz cuenta doble.
- 🔑 **`interno` esconde una rama de conducción, y ARRASTRA a los hijos.** Pedido de Bruno
  (30-ago-2026): *«que la gente no vea cosas paralelas que no sirvan, de los gerentes»*. Esconder
  «Operativo» y dejar colgando «Venta mayorista» sería peor que no esconder nada: `arbol()` lo sube
  a la raíz, al lado de los dueños. El recorte lo hace **el handler** (`visiblesPara`), ⛔ no la
  pantalla: lo que no viaja no se dibuja por accidente.
- 🔴 **`organizacion` ⛔ NO está en `KEYS_PARA_TODOS`**, a diferencia de sus dos hermanas de área:
  está en obra y hoy la ven **sólo los admin** (pedido de Bruno, 30-ago). Ninguna función hereda esa
  área, así que sacarla de ese `Set` alcanzó. Se abre al equipo con una línea.

- 🔑 **`persona = null` es una fila válida, no un dato faltante.** Es el gris: algo de lo que el
  sector responde y ninguna persona reclamó. Se guarda, se cuenta y tiene pestaña propia. En este
  grupo el mismo agujero —el último campo del producto sin dueño— apareció en **tres fichas
  distintas** antes de que alguien lo nombrara.
- ⚠️ **Y sólo en la clase `responde`.** «Entrega», «Decide sola», «Publica» y «No es suyo» son
  afirmaciones SOBRE una persona: sin persona no dicen nada. El freno vive en `filaValida()`
  (`lib/organizacion/core.js`), se corre en la pantalla para poder explicarlo antes de mandar y se
  **vuelve a correr en el handler**, que es el que manda.
- 🔑 **Por qué esto no vive en la Agenda, que es donde primero se pensó.** Todo ítem de la Agenda
  exige una `regla` de las cinco y `cumplimiento()` emite TODA ocurrencia que esa regla genere ⇒ una
  responsabilidad permanente queda roja para siempre, o hay que inventarle un día. **Y la Agenda
  tampoco describe el reparto**: medido el 30-ago-2026, **Camila Budek tiene 0 rutinas propias** y
  trabaja igual — su trabajo dispara por hecho y vive en los moldes (4 pasos). Quien lea la Agenda
  como «quién responde de qué» concluye que ella no responde por nada, que es falso.
  ⇒ **Agenda: «¿qué me toca hoy?». Organización: «¿de quién es esto?».**
- 🔴 **El vacío de la pestaña «Sin dueño» NO es una felicitación, y el cartel lo dice.** Cero grises
  cargados casi nunca significa que todo tenga dueño: significa que nadie escribió lo que no lo
  tiene. Un «✅ todo cubierto» sería la afirmación más cara de la pantalla. ⛔ No cambiar ese texto
  por uno festivo.
- 🔑 **El cero de rutinas de una persona tampoco afirma que no trabaje**, y la ficha lo escribe en
  vez de dejar que el que mira lo deduzca. Es el caso de Cami.
- ⚠️ **`persona` guarda el `name` EXACTO del padrón**, la misma clave que `agenda_items.destino`,
  `agenda_items.autor` y `agenda_hechos.usuario`. Un nombre mal tipeado no falla: dibuja una ficha
  vacía y nadie reclama. Ya pasó una vez con «Stefi» / `Stefania Scolari`. Por eso el alta va con
  `<Select>` alimentado por el padrón, ⛔ nunca a mano.
- ⚠️ **El GET devuelve también las filas apagadas** (`activo: false`). No es un olvido: apagado es
  «esto ya no es de nadie», que es información. El filtro vive en el núcleo (`delSector`, `grises`).
  Filtrarlas en el handler dejaría a quien edita sin poder reactivar una.
- ⚠️ **El handler NO filtra por destino**, a diferencia del de la Agenda. Acá la pregunta se hace
  sobre el trabajo de OTRO: esconder lo ajeno rompería justo el uso.
- 🔑 **Un nodo del organigrama cuyo padre no existe (o está apagado) SUBE a la raíz**, no
  desaparece. Un organigrama al que le falta gente se lee como «esa persona no está», que es peor
  que un nodo fuera de lugar — al segundo alguien lo ve mal y lo arregla. Amarrado en el test.
- ⚠️ **El link al manual sólo se dibuja si está PUBLICADO.** Misma regla que el «📘 Cómo se hace» del
  pendiente: un botón que promete ayuda y abre vacío enseña a no apretarlo.
- 🔑 **El organigrama se dibuja de los datos, ⛔ no es una imagen.** Las cuatro láminas de
  `~/Documents/quien-hace-que/organigrama/` son la fuente, pero una foto no se cruza con nada: acá
  cada nodo con `persona` lleva a su ficha.

## Lo que ya se rompió acá

Nada todavía — la sección salió el 30-ago-2026. Los dos frenos que ya estaban puestos de entrada
salen de errores de OTRAS secciones: el nombre exacto del padrón (de la carga de las rutinas de
marketing) y el manual sin publicar (del botón «Cómo se hace»).

## Pendiente

- **Sembrar Administración** (manual 09 ya escrito), y después locales y depósito. Marketing entró
  primero por decisión de Bruno el 30-ago.
- **El editor de nodos del organigrama no tiene pantalla**: `nodo-guardar` y `nodo-borrar` existen en
  el handler y hoy se usan sólo desde el script de carga. Se construye cuando alguien necesite mover
  a una persona sin correr un script — antes es una pantalla que se usa cero veces.
- **Confirmar cada ficha con su dueña**, que sigue pendiente en las cinco del análisis original.

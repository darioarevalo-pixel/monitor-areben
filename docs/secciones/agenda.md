# Agenda operativa — ficha de sección

Sección `agenda`, área `agenda`. Contesta **qué corre HOY**: la promoción bancaria que hay que
aplicarle al cliente que está parado en la caja, y los pendientes rutinarios del día. Es la pieza
que ni Novedades ni Manuales pueden dar —una novedad dice «esto cambió, leelo una vez», un manual
dice «así se hace», ninguno sabe decir «esto va hoy»— y **la ve todo el equipo**: está en
`KEYS_PARA_TODOS`.

⚠️ No confundir con el **Calendario editorial**, que es de Marketing, es por marca y habla de
fechas comerciales. La Agenda es operativa.

## Dónde vive

`components/agenda/` (~1.900 líneas, `Agenda.tsx` es la que orquesta y las otras nueve son las
piezas) · `lib/agenda/` · handler `api/_agenda.js` por `datos.js?recurso=agenda` · tablas
`agenda_promos`, `agenda_items` y `agenda_hechos`, **siempre en la base de BDI** · test
`tests/agenda.test.ts`.

🔑 **El motor está en `lib/agenda/reglas.core.js` y es `.js` a propósito** (el handler corre en Node
sin pasar por el compilador de Next y no puede importar TypeScript); `lib/agenda/index.ts` es el
re-export tipado. Los dos archivos lo explican en su encabezado y no se repite acá.

## ⛔ Lo que comparte con otras secciones

- **`lib/calendario/fechas.core.js`** — de ahí salen `diaDeSemanaDe`, `diasDelMes`, `sumarDias`.
  Mismo criterio de diseño que la Agenda: la fecha comercial es una **regla**, no un dato.
- **`lib/novedades/destino.core.js`** (`esParaMi`, `normalizarDestino`) — el «¿a quién le llega?»
  ya estaba resuelto para Novedades y es la misma pregunta. Se importa desde su carpeta, no se
  mudó: mover el archivo tocaría cuatro archivos de Novedades. Un cambio ahí cambia a quién le
  salen los pendientes.
- **`components/agenda/BandaPromoHoy.tsx`** la muestran otras pantallas: la promo del día tiene que
  aparecer donde se cobra, no sólo donde se lee.

## Reglas que el código no dice

- 🔑 **Las promos y los pendientes son el MISMO motor.** «Todos los martes de Banco Nación» y
  «todos los martes hay que reponer la vidriera» son la misma pregunta, y por eso `agenda_items` y
  `agenda_promos` guardan la misma forma de `regla`. Cuando aparezca una rutina nueva, ⛔ no se
  escribe un motor: se carga.
- 🔑 **La regla se guarda, la ocurrencia se calcula.** Una rutina semanal no genera una fila por
  día. Está explicado en `reglas.core.js`; lo que importa acá es la consecuencia: **no hay dónde
  editar «el martes que viene»**, se edita la regla y cambian todos los martes.
- 🆕 🔑 **Lo que ARRASTRA es una bandera del ítem, ⛔ nunca una sexta regla** (24-ago-2026, pedido de
  Bruno para las cuatro reuniones semanales: *no ocupan un día fijo — aparecen y **quedan** hasta que
  se completan*). `aplicaEn()` y `ocurrencias()` siguen siendo **puras y ciegas a los tildes**: es lo
  único que garantiza que la grilla de Mes y lo que el local ve ese día no puedan discrepar. El
  arrastre se resuelve una capa arriba, en `pendientesDe()`, que ya recibe los hechos.
  - 🔑 **El arrastre se corta con el ÚLTIMO tilde, no con el de cada ocurrencia.** Es lo que hace que
    tildar una vez cierre cuatro semanas; si cada ocurrencia se cerrara sola, cuatro semanas sin
    hacerla pedirían cuatro tildes y el renglón volvería tres veces. Dos ocurrencias abiertas son
    **una fila**, la más vieja, y el renglón dice de cuándo viene.
  - 🔴 **El tilde no va al día que se está mirando: va a la última vez que la regla cayó**
    (`ultimaOcurrencia`). Es la única fecha que el handler acepta —rechaza un tilde en un día en que
    la rutina no corre, `api/_agenda.js`— y encima es la verdad: la reunión de los martes que se hace
    el jueves se asienta el martes. Por eso el handler **no se tocó**.
  - ⛔ **El Mes no arrastra** (`pendientesDe(..., { arrastre: false })`): muestra lo programado, no la
    deuda. En Cumplimiento sí, pero **una fila por racha**: cuatro semanas debiéndose son un
    incumplimiento, no cuatro.
  - 🔴 **El techo es `DIAS_CUMPLIMIENTO = 30`**: los tildes más viejos no viajan al navegador, así que
    más atrás no se puede afirmar que algo esté sin hacer. El arrastre se corta ahí.
  - ⚠️ **Quincenal no existe** entre las cinco reglas. Lo más cercano sin motor nuevo son dos ítems
    `mensual` (día 1 y día 15).
- 🔴 **Los permisos ya están medidos y NO hay nada que destrabar** (padrón leído el 23-ago-2026):
  **0 de 16 usuarios tienen `agenda.cargar` tildado**, pero el admin lo saltea ⇒ hoy cargan Bruno y
  Darío. 🔑 **Y alcanza, porque tildar «Hecho» NO pide `agenda.cargar`**: todo el equipo ve y tilda
  lo suyo sin permiso nuevo. ⇒ ⛔ no darle el sub a nadie «para que pueda usar la agenda».
- 🔑 **El alcance del tilde no sale de un permiso sino del `destino`, y se filtra en el handler.**
  Si filtrara sólo la pantalla, un pendiente ajeno igual encendería el badge del menú.
- 🔴 **`{tipo:'personas'}` es la ÚNICA forma de destino que el admin no recibe**, y es a propósito
  (23-ago-2026, decisión de Bruno). Nació acá: las doce rutinas de marketing se habían cargado con
  `roles:['marketing']` porque no había otra forma, y Sofi, Cande y Cami comparten el rol ⇒ **las
  doce le salían a las tres**. Si además se las llevara el admin, el «Hoy» del que carga sería la
  suma de los «Hoy» de los quince. ⚠️ **Consecuencia que se paga**: `paraMi` es también el candado
  del tilde, así que el admin ve el pendiente ajeno en «Cargar» y en «Cumplimiento», lo edita y lo
  borra, pero **no lo puede tildar** (403). La regla vive en `lib/novedades/destino.core.js` y la
  comparte Novedades, aunque su editor no ofrezca la opción.
- 🔑 **Se guarda `perfil.name`, no el mail.** Es la única clave que existe para todos: los puestos
  compartidos (`Local`, `Depósito`, `bdilocal`) tienen `email: null`. De yapa, entonces, una rutina
  se le puede asignar a un **puesto**. Es la misma clave de `agenda_items.autor` y `agenda_hechos.usuario`.
- ⚠️ **La lista del equipo la trae `traerConfigAdmin` y es admin-only** (`ModalItem.tsx`): se pide
  recién cuando alguien elige «a una persona», y en las sesiones de Google no abre ningún prompt.
  ⛔ No hay campo de texto libre para escribir el nombre: un nombre mal tipeado sería un pendiente
  que no le sale a nadie y que nadie reclama. Si el padrón no se puede leer, la opción avisa y no
  se puede usar.
- 🔑 **La pestaña «Hoy» tiene una regla de oro: que sea corta.** *Un aviso que se ignora doce veces
  enseña a ignorar el número trece.* Por eso lo vencido y lo que todavía no arrancó viven en
  «Cargar», que es de administración. Antes de sumar un bloque a «Hoy», la pregunta es si se
  contesta parado frente a la caja.
- 🔑 **Los vacíos de «Hoy» NO son todos iguales, y está decidido caso por caso** (`Agenda.tsx`, en
  `Hoy`): el de promos **afirma** —«hoy no hay promo» es la respuesta que se le da al cliente— y
  por eso ⛔ no se oculta, pero desde el 23-ago-2026 se dibuja como un **renglón** y no como una
  tarjeta, para que «Lo que hay que hacer hoy» entre en la misma pantalla. El de avisos ni siquiera
  dibuja el título: «hoy no hay avisos» es una fila de ruido repetida todos los días.
- ⛔ **Esconder o reordenar bloques según `perfil.funcion` está DESCARTADO**, y lo corrigió Bruno el
  23-ago-2026: la promo bancaria **es insumo de marketing** (con eso se arma la diaria). Un motor de
  orden por persona es caro y resuelve un caso solo.
- ⛔ **Stunned no se agrega a `brands`.** `Marca = 'bdi' | 'zattia'` y Stunned es una **línea** que
  cuelga de Zattia (`lib/lineas.core.js`); `puedeVer('stunned')` da **403**. Una rutina de Stunned
  se carga bajo `zattia` y Stunned se nombra en el título.
- ⚠️ **Del día 29 en adelante no se puede pedir por número** (`MAX_DIA_MES = 28`): qué hacer en
  febrero es una decisión de la persona, no del motor. Para eso está `dia:'ultimo'`.
- 🆕 🔑 **EL DISPARADOR DEL INGRESO: los renglones salen de MOLDES, no del código** (24-ago-2026).
  Dos manuales («Sesiones de fotos» y «Cómo se lanza un producto») se apoyan en «el aviso de ingreso
  de Administración, automático», y ese aviso **nunca existió**: lo disparaba una persona
  acordándose, que es exactamente lo que los dos manuales prohíben.
  - **Un molde es un ítem más** (`datos.plantilla = 'ingreso'`, con `datos.offsetDias`), cargado con
    el mismo formulario de siempre. 🔑 **Y por eso no se escribieron los seis pasos en el repo**: la
    dueña de cada uno cambia cuando cambia la gente, y así cambiarla es editar un ítem en vez de
    hacer un deploy.
  - 🔴 **Un molde NO corre**: lo filtra `vaEl()`, así que no sale en Hoy, no enciende el badge, no
    entra en el Mes ni en Cumplimiento. Se lo ve —con su chapita— sólo en «Cargar», que es donde se
    lo edita.
  - **El clon nace `unica` con la fecha del ingreso + los días del molde, y ARRASTRA**: un paso del
    lanzamiento que se evapora al día siguiente es justo el que «se cae porque nadie lo mira». ⛔ Y
    no queda marcado como molde, o se clonaría a sí mismo en el próximo ingreso.
  - **El agrupador es el prefijo del título** (`IMP2 · …`) y ⛔ no se escribe un motor hasta haberlo
    usado dos veces (decisión de Bruno).
  - **La idempotencia es por `datos.ingreso` = `fecha·nombre`**, no por «ya corrió hoy»: un webhook
    que reintenta no puede dejar doce pendientes. ⛔ Y no se re-crea lo que alguien haya borrado a
    mano: borrar un renglón es una decisión.
- 🆕 🔴 **LA PUERTA DE INGRESOS CORRE ANTES DE `exigirUsuario`, y sin `INGRESO_SECRETO` está
  CERRADA.** Del otro lado está `ingreso2.arebensrl.com`, que es de Gerardo y no tiene SSO, así que
  la llave es un secreto compartido por header (`x-ingreso-secreto`). Tres cosas que no se tocan:
  el secreto se compara **antes** de consultar la base; **una variable que falta contesta 503, no
  «pase»** —ese es el modo de falla que convierte un olvido de configuración en un endpoint
  público—; y lo único que la puerta puede hacer es **sembrar la plantilla**, con el nombre acotado
  a 80 caracteres sin saltos de línea y un tope diario. El molde de todo esto es la cara pública de
  `api/blob-upload.js`, donde el orden de los guards es la mitad de la seguridad.

  ```bash
  curl -X POST 'https://monitor.arebensrl.com/api/datos?recurso=agenda' \
    -H 'Content-Type: application/json' -H 'x-ingreso-secreto: <el secreto>' \
    -d '{"action":"ingreso-externo","nombre":"IMP2","fecha":"2026-08-24"}'
  ```
- 🔑 **Es el tablero donde van las rutinas repetitivas de marketing** — decisión de proceso de Bruno
  el 23-ago-2026 (*«maketa es más marketing, monitor es operativo»*). Dejan de vivir en un documento
  y le salen solas a cada una el día que tocan, colgadas del manual que explica cómo se hacen
  (`manualId`). ⇒ ⛔ eso no se construye: **se carga**.

## Lo que ya se rompió acá

- 🔴 **Crear `api/agenda.js` «por prolijidad» frena TODOS los deploys sin error visible**: Hobby
  admite 12 funciones. Vercel sigue sirviendo la versión anterior y no avisa. Ya pasó una vez
  (`api/_agenda.js`, encabezado).
- 🔴 **El mapa de secciones derivó en silencio y `agenda` era una de las tres que faltaban**
  (15-ago-2026). Por eso existe `tests/agents-mapa-secciones.test.ts`.
- ⚠️ Un POST sin `Content-Type: application/json` da «falta id» en vez de un error de formato:
  Vercel no parsea el cuerpo.

## Pendiente

- ▶️ **El `info` de `lib/nav.datos.ts` la describe como si fuera sólo de promociones bancarias** y
  no nombra los pendientes rutinarios, que es la mitad de la sección. Es una descripción, no una
  regla: se corrige el texto.
- ▶️ **Cargar las 12 rutinas de marketing.** Las carga Bruno una vez, porque la rutina es la línea y
  la línea es de él. Desde el 23-ago-2026 van **con nombre** —`destino: {tipo:'personas'}`— y no con
  `roles:['marketing']`: si no, le salen a las tres.
- 🆕 ▶️ **Poner `INGRESO_SECRETO` en Vercel** y pasarle a Gerardo el `curl` de arriba. Sin esa
  variable la puerta contesta 503 a propósito; el alta a mano («Ingresó mercadería») anda igual.
- 🆕 ▶️ **Cargar los pasos del ingreso como moldes** (nombre · descripción · precio · foto ·
  publicación · pantallas, con su dueña y a los cuántos días). Hasta que estén, el botón lo avisa y
  no siembra nada.
- 🆕 ▶️ **Cargar las 4 reuniones semanales** (comunidad, pauta, diseño y la mensual del sector), que
  es para lo que se escribió el arrastre. La quincenal de diseño necesita la decisión de arriba.
- ⚠️ **Las que ya estén cargadas por rol NO se migran solas.** Hay que abrirlas y reasignarlas: el
  destino viejo sigue siendo válido y el motor no adivina cuál de las tres es la dueña.

## Cómo se prueba

`npx vitest run tests/agenda.test.ts` (el motor) y `tests/agenda-ingreso.test.ts` (el disparador y
su puerta) — 🆕 **el segundo es el primero que prueba `api/_agenda.js`**, que hasta el 24-ago-2026
no tenía ninguno.

Lo que el test **no** ejerce y hay que caminar a mano:

- Un día **con** promo y un día **sin** promo son dos pantallas distintas, y la de «sin» es la que
  se rompe callada: cargá una promo de prueba en «Cargar» y mirá «Hoy» en los dos estados.
- **El tilde con un perfil que NO es admin**, que es quien la va a usar todos los días. Con el admin
  todo anda porque saltea el sub.
- El `destino`: un pendiente ajeno **no** tiene que encender el badge del menú.
- 🆕 **El arrastre, de punta a punta**: cargá un pendiente semanal con «Queda hasta que se tilde», no
  lo tildes dos semanas y mirá que aparezca **una sola vez** (no dos), que diga de cuándo viene, que
  el badge del menú cuente lo mismo, y que **un solo tilde lo apague**. Después mirá Cumplimiento:
  tiene que haber **una** fila, no una por semana.
- 🔴 **El destino por persona no se puede caminar con un admin**, que es el caso que se agregó para
  arreglar: entrá con un usuario `prueba-*` del padrón, mirá que la rutina dirigida a él **sale en
  «Hoy» y prende el badge**, y con otro que no sale ni prende. Y con el admin, que el tilde ajeno
  devuelve 403.

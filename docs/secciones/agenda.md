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
- 🔴 **Los permisos ya están medidos y NO hay nada que destrabar** (padrón leído el 23-ago-2026):
  **0 de 16 usuarios tienen `agenda.cargar` tildado**, pero el admin lo saltea ⇒ hoy cargan Bruno y
  Darío. 🔑 **Y alcanza, porque tildar «Hecho» NO pide `agenda.cargar`**: todo el equipo ve y tilda
  lo suyo sin permiso nuevo. ⇒ ⛔ no darle el sub a nadie «para que pueda usar la agenda».
- 🔑 **El alcance del tilde no sale de un permiso sino del `destino`, y se filtra en el handler.**
  Si filtrara sólo la pantalla, un pendiente ajeno igual encendería el badge del menú.
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
  la línea es de él.

## Cómo se prueba

`npx vitest run tests/agenda.test.ts`.

Lo que el test **no** ejerce y hay que caminar a mano:

- Un día **con** promo y un día **sin** promo son dos pantallas distintas, y la de «sin» es la que
  se rompe callada: cargá una promo de prueba en «Cargar» y mirá «Hoy» en los dos estados.
- **El tilde con un perfil que NO es admin**, que es quien la va a usar todos los días. Con el admin
  todo anda porque saltea el sub.
- El `destino`: un pendiente ajeno **no** tiene que encender el badge del menú.

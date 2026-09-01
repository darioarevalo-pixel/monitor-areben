# Agenda operativa — ficha de sección

Sección `agenda`, área `agenda`. Contesta **qué corre HOY**: la promoción bancaria que hay que
aplicarle al cliente que está parado en la caja, y los pendientes rutinarios del día. Es la pieza
que ni Novedades ni Manuales pueden dar —una novedad dice «esto cambió, leelo una vez», un manual
dice «así se hace», ninguno sabe decir «esto va hoy»— y **la ve todo el equipo**: está en
`KEYS_PARA_TODOS`.

⚠️ No confundir con el **Calendario editorial**, que es de Marketing, es por marca y habla de
fechas comerciales. La Agenda es operativa.

## Dónde vive

`components/agenda/` (`Agenda.tsx` **sólo elige qué pantalla montar**; las otras son las piezas) ·
`lib/agenda/` · handler `api/_agenda.js` por `datos.js?recurso=agenda` · tablas `agenda_promos`,
`agenda_items` y `agenda_hechos`, **siempre en la base de BDI** · test `tests/agenda.test.ts`.

## 🆕 SEIS pantallas, ⛔ ninguna pestaña (29-ago-2026)

La sección dejó de ser una entrada con cuatro pestañas y pasó a ser **una categoría-módulo del
menú**, como Meta y Tienda Nube: `keys: []` + `items` en `lib/nav.datos.ts`, la subárea sale del **2º
tramo de la URL** y `Agenda.tsx` sólo monta la que corresponda (mismo patrón que `Tncat.tsx`).

| entrada | ruta | pantalla | quién la ve |
|---|---|---|---|
| Hoy | `/agenda` | `Agenda.tsx` (`Hoy`) | todo el equipo |
| Semana | `/agenda/semana` | `GrillaAgenda vista="semana"` | todo el equipo |
| Mes | `/agenda/mes` | `GrillaAgenda vista="mes"` | todo el equipo |
| Eventos | `/agenda/eventos` | `Eventos.tsx` | `agenda.cargar` |
| Rutinas | `/agenda/rutinas` | `Rutinas.tsx` | `agenda.cargar` |
| Cumplimiento | `/agenda/cumplimiento` | `Cumplimiento.tsx` | `agenda.cargar` |

**Qué lo motivó** (Bruno caminó la sección): *«Hoy y Mes están bastante claras. Al ir a Cargar
aparece el quilombo: las actividades repetidas son un quilombo de buscar, la vista plana es muy
larga, no le veo escalabilidad. Y cada vez que sumamos una función aparece un botón arriba a la
derecha que no sé si es un disparador»*.

Lo medido detrás de eso:

- 🔴 **«Cargar» era una lista plana alfabética** (`.order('titulo')`) con **tres poblaciones**: 33
  rutinas y avisos, **44 actividades** de los cuatro eventos, y todo lo que los eventos van copiando.
- 🔴 **Lo copiado ⛔ no se borra nunca**: no hay purga en el handler —los únicos `delete` son por id,
  a mano— así que esa lista **sólo crecía**: 6 renglones por ingreso, 11 por lanzamiento, 8 por
  sesión, 5 por cambio de condición. A los 120 días el renglón deja de arrastrar, pero **se queda en
  la lista**.
- 🔴 **La barra de arriba a la derecha crecía sola y mostraba la mitad**: un botón por evento *con
  botón* (dos de los cuatro), mezclados con los tres de crear. Los otros dos eventos no aparecían en
  ningún lado, porque los prende su propia pantalla.

🔑 **Las tres poblaciones se cortan en el núcleo y ⛔ no en la pantalla** (`rutinasYAvisos`,
`actividadesDe`, `porHecho` en `lib/agenda/index.ts`): una pantalla que se olvida de un filtro ⛔ no
falla, **se llena**, y para cuando se nota ya nadie la mira. Fijado en `tests/agenda.test.ts`.

### Evento y actividad: las palabras (decisión de Bruno, 29-ago-2026)

**Evento** es el hecho que deja trabajo; **actividad** es cada renglón que ese evento copia. Antes se
llamaban *disparador* y *molde*. ⚠️ **Cambió sólo lo que se lee en pantalla**: en el código y en
`datos` siguen siendo `plantilla`, `PLANTILLAS`, `campoClave` y `esPlantilla` — renombrarlos obligaría
a migrar las 44 filas cargadas, y la clave de idempotencia ⛔ no se toca.

### Lo que hacía falta para agrupar lo copiado

El clon ya guardaba `datos.de` y la clave *«para el día que la pantalla quiera agrupar por hecho»*,
pero **eso no llegaba al navegador**. Ahora el clon guarda además `datos.hecho = { nombre, fecha }`
—al lado de la clave, ⛔ nunca adentro— y el GET lo expone como `item.sembrado`. Los clones viejos no
lo traen: `hechoDelClon()` los lee de la clave (`fecha·nombre`), y si ni eso, cae al nombre crudo.
🔑 **Un grupo con nombre feo se arregla mirando; un renglón que no entra en ningún grupo desaparece
de la pantalla**, y ése es el modo de falla que no se puede tener.

### ⚠️ Cómo leer lo que sigue de esta ficha

Todo lo anterior al 29-ago-2026 nombra la pantalla vieja. La traducción, de una vez:

| decía | es |
|---|---|
| la pestaña «Cargar» | las pantallas **Rutinas** (lo que corre solo) y **Eventos** (lo demás) |
| «Nuevo pendiente» | **+ Rutina**, en Rutinas; **+ Actividad**, en la tarjeta del evento |
| molde / plantilla (en pantalla) | **actividad** de un **evento** |
| el chip «Moldes» | ⛔ ya no existe: esa población está en Eventos |
| la pestaña «Mes» con su chip de vista | las entradas **Mes** y **Semana** |

### La inconsistencia que se cerró sola

🔴 El tilde **«Queda hasta que se tilde / Se vence con el día»** de una actividad ⛔ **no viajaba**
—el clon nace siempre con `arrastra: true`— pero era **la puerta del campo de al lado**, el tope, que
sí viaja. O sea: para ponerle tope a lo copiado había que prender un interruptor que se ignora. En el
formulario de actividad ese tilde ya no está y el tope se pide solo.

🆕 **La pregunta de la puerta** vive en `lib/agenda/pregunta-ingreso.core.js` y la abre
`api/_oc-webhook.js`; la contesta `action: 'ingreso-puerta'` y la dibuja `PendientesHoy.tsx`.
Tests: `tests/agenda-pregunta-puerta.test.ts`. Caminata: `scripts/caminar-pregunta-puerta.mjs`.

🆕 El techo de Dirección vive en **`lib/agenda/jerarquia.core.js`** (`esDeArriba`, `veLoDeArriba`) y
el padrón que necesita entra por `equipoDelPadron` (`api/_auth.js`) del lado del servidor y por
`traerEquipo` (`lib/usuarios/equipo.ts`) del lado de la pantalla. Test: `tests/agenda-jerarquia.test.ts`.

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
  - 🔴 **El techo es el dato, no una preferencia**: los tildes que no viajan al navegador no se
    pueden mirar, así que el arrastre se corta donde termina el acuse que manda el GET. 🆕 Desde el
    25-ago **son dos ventanas y no una** (`lib/agenda/tipos.ts`): `DIAS_CUMPLIMIENTO = 30` para el
    informe, y `DIAS_ARRASTRE = 120` para el arrastre. Estuvieron pegadas hasta ese día y el empate
    no era una decisión: el arrastre miraba 30 días porque era lo que el GET mandaba, y con eso **un
    paso de un ingreso lento se evaporaba callado el día 31** — Bruno, 24-ago: *«a veces más rápido,
    a veces más lento, no podemos decir la cantidad de días»*.
    - 🔑 **El GET manda el acuse en DOS tramos** (`api/_agenda.js`): los últimos 30 días de **todos**
      los ítems, más la cola vieja hasta los 120 **sólo de los que arrastran** (y ⛔ no de los
      moldes, que no corren ningún día). Acotarla es lo que la hace crecer con la cantidad de ítems
      que arrastran y no con el uso diario — medido el 25-ago: 32 pendientes vivos generan 6
      ocurrencias por día, así que 120 días de todos serían ~544 tildes (~73 KB) contra un GET que
      hoy pesa 28,5 KB entero. Los dos tramos no se solapan (`.lt` / `.gte`), así que se concatenan.
    - 🔴 **Los dos lados o ninguno**: subir `DIAS_ARRASTRE` sin subir el tramo profundo del GET hace
      que el navegador vea una ocurrencia vieja sin tilde y la llame pendiente **cuando el tilde
      existe y no viajó**. Es el peor rojo: el que no se puede apagar.
  - 🆕 🔑 **No todo lo que arrastra arrastra igual: `arrastraDias`** (25-ago-2026, pedido de Bruno del
    24-ago: *«Tienda Nube sí tiene arrastre, pero hasta 2 días; ya el tercero no arrastra»*). Es un
    campo del ítem —viaja en `datos`, **sin migración**—: `null` o vacío es **sin tope**, que es lo
    que tienen las cuatro reuniones y los clones del ingreso; un número lo baja solo pasados esos
    días desde el día en que caía. Sin él, el renglón de una pasada que nadie tildó se queda para
    siempre, y **un contador que no baja se deja de mirar en una semana**.
    - Se resuelve en `ocurrenciaAbierta()` y **corta igual en `fechasDeRachas()`**: con tope de 2,
      tildar el jueves ⛔ **no** cierra el lunes —desde el jueves ya no se puede tildar el lunes—, así
      que contarlos como una racha escondería la pasada del lunes. Pasado el tope la racha se cierra
      sin cumplir y la siguiente ocurrencia empieza una nueva. ⛔ `aplicaEn()` y `ocurrencias()` no
      se tocaron.
    - ⚠️ **Lo vencido igual entra en Cumplimiento**: en Hoy el renglón ya no se ve, pero no haberse
      hecho sigue siendo no haberse hecho. Es el mismo criterio del pendiente que no arrastra.
    - 🔴 **`0` es un tope de verdad** («se vence con el día») y ⛔ no «sin tope». En el servidor lo
      cuida `esTope()`: `Number(null)` es **0**, no `NaN`, así que el `Number.isFinite(Number(x))` que
      alcanza para `offsetDias` acá convertiría «sin tope» en «vence hoy».
    - **El molde se lo pasa al clon**: el formulario del molde es el mismo que el de una rutina, así
      que un campo que se puede cargar ahí tiene que viajar, o la pantalla afirma algo que no es.
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
- 🆕 🔑 **LA QUINTA FORMA DE DESTINO: `{tipo:'horas-extras'}`, y no lleva lista adentro** (30-ago-2026).
  Le llega a quien tenga tildado **«Hace horas extras»** en su perfil de Usuarios. Salió de que la
  rutina mensual «Cargar las horas extras» estaba cargada con los tres nombres escritos a mano:
  funcionaba, y por eso escondía el problema —**son dos verdades sobre lo mismo**—. El día que
  alguien empieza o deja de hacer horas hay que acordarse de volver a editar la rutina, y el día que
  no se acuerden la alerta le pide horas a quien no las hace. ⇒ el dato es del **perfil** y el
  destino se **DERIVA**, igual que `{tipo:'seccion'}` se deriva de los permisos.
  - 🔑 **Por qué no fue un rol ni un sub-permiso**, que eran las dos formas que ya existían: un rol
    (`Funcion`) es un **sector** y arrastra acceso a pantallas (`ACCESO_POR_FUNCION`); un sub
    (`canjes.aprobar`) es una acción sobre una pantalla, y tildarlo **le daría también la sección**.
    Hacer horas extras no es ninguna de las dos: es una **condición laboral** de la persona.
  - 🔴 **Va ARRIBA del atajo del admin**, como `{tipo:'personas'}` y por el mismo motivo: si no, el
    «Hoy» de Bruno tendría todos los fines de mes un pendiente ajeno y —peor— **podría tildarlo**,
    dando por cargadas las horas de otra. El admin lo recibe si y sólo si se tilda a sí mismo.
  - 🔴 **Los tres `return` finales que se lo comían.** `clavesDestino` caía en `['todos']` (⇒ la
    rutina saldría en el filtro «Todo el equipo» de Cumplimiento y en la ficha de las once
    personas), y `rotuloDestino`/`rotuloDestinoCorto` en «a todo el equipo». Cada uno tiene ahora su
    caso, y el rótulo corto (`'Quien hace horas extras'`) tiene que dar **exactamente** lo mismo que
    `rotuloDeClave('hx')`: hay un test de ida y vuelta que lo amarra.
  - 🔴 **Depende de un deploy de OTRO repo.** `perfil.horasExtras` y `perfil.horasLink` viajan por
    `perfilDe` de `bdi-catalogo/api/usuarios.js`, que es una **lista blanca cerrada**: un campo que
    no esté ahí se guarda en el KV y **nunca llega al monitor**. ⇒ ⛔ no cambiar el destino de la
    rutina antes de que ese deploy esté vivo: quedaría dirigida a **nadie**, sin error.
  - 🔴 **Un `<a className="mo-btn">` pelado se dibuja SIN FONDO NI BORDE.** `.mo-btn` toma sus
    colores de las custom properties `--_bg`/`--_fg`/`--_bd`, y quien las pone es `vars()`,
    **inline**, adentro de `Button`. Con la clase sola el botón queda como un texto suelto al lado
    de los de verdad — *«que sea un botón mejor, porque está raro»* (Bruno, 30-ago, mirando Inicio).
    ⇒ el kit tiene ahora **`ButtonLink`**, que es el mismo botón pero `<a>`, y ⛔ no se vuelve a
    escribir el `<a className="mo-btn">` a mano. Va `<a>` y no un `Button` con `window.open`
    a propósito: el link se copia, se abre en otra pestaña y se manda por WhatsApp.
  - **El link no es del ítem, es de la persona.** El botón «⏱ Cargar mis horas» de `PendientesHoy`
    se dibuja cuando el destino es `horas-extras` y saca la URL de `perfil.horasLink`. No hizo falta
    ningún campo nuevo en `agenda_items` —y no habría entrado: el `datos` de `guardar-item` es una
    lista blanca cerrada—. ⛔ **Sin link no se dibuja un botón, se dibuja el motivo**: misma regla
    que el «Cómo se hace» de un manual sin publicar.
  - ⚠️ **`esDeArriba` le da `false`** y cae en el `return` final de `jerarquia.core.js`, a propósito:
    quién hace horas extras es una condición laboral, no un lugar en el organigrama.
- ⚠️ **La lista del equipo la trae `traerConfigAdmin` y es admin-only** (`ModalItem.tsx`): se pide
  recién cuando alguien elige «a una persona», y en las sesiones de Google no abre ningún prompt.
  ⛔ No hay campo de texto libre para escribir el nombre: un nombre mal tipeado sería un pendiente
  que no le sale a nadie y que nadie reclama. Si el padrón no se puede leer, la opción avisa y no
  se puede usar.
- 🆕 🔑 **«CARGAR» TIENE FILTROS Y BUSCADOR, Y EL DE PERSONA NO SALE DEL PADRÓN** (26-ago-2026,
  pedido de Bruno). La lista venía de corrido y sin un solo recorte: con 32 pendientes vivos más los
  moldes del ingreso, *«¿qué le toca a Sofi?»* se contestaba leyéndola entera — y una lista que hay
  que leer entera no la revisa nadie.
  - 🔑 **Las opciones del filtro «de quién» salen de los ÍTEMS CARGADOS** (`opcionesDeQuien`), ⛔ no
    de `traerConfigAdmin`. El padrón del equipo vive en el KV de `bdi-catalogo`, es **admin-only** y
    puede pedir credencial —por eso `ModalItem` lo pide recién al elegir «a una persona»—: colgar de
    esa llamada el `<Select>` de un filtro es una ida a otro sistema para pintar un desplegable. De
    yapa, lo que sale de los ítems son **exactamente las opciones que devuelven filas**.
  - 🔴 **Una clave que no matchea devuelve CERO filas, ⛔ nunca todas.** Caer a «mostrá todo» es lo
    que hace creer que se revisó lo de una persona mirando la lista completa.
  - 🔑 **Un molde NO cuenta como pendiente** aunque su `clase` lo sea: no corre ningún día. 🆕 Desde
    el 29-ago **ni siquiera llega a esa lista** (`rutinasYAvisos`) y el chip que lo separaba se fue
    con él.
  - 🔴 **La pestaña se mudó a la URL** (`useFiltroUrl('t','hoy')`), porque recargar con un filtro
    puesto devolvía a «Hoy» con el filtro aplicado en una pestaña que ya no se miraba — el bug
    exacto que Canjes pagó y arregló (`docs/secciones/canjes.md`). 🆕 Hoy **no hay pestañas**: cada
    pantalla es una entrada del menú con su dirección, que resuelve lo mismo por otro camino.
- 🆕 🔑 **CUMPLIMIENTO DICE DE QUIÉN ERA LO QUE NO SE HIZO** (26-ago-2026, pedido de Bruno). El dato
  ya viajaba (`FilaCumplimiento.item.destino`) y no se dibujaba: el renglón sin tildar decía qué
  rutina y qué día, y para saber a quién reclamarle había que salir a «Cargar» y buscarla.
  - 🔴 **`— lo marcó Local` y `— a Sofi` son DOS datos distintos y no se mezclan**: aquél es **quién
    lo hizo** (y `Local` es un puesto compartido), éste es **quién lo debía**.
  - **Resumen por responsable** arriba, que además filtra. ⚠️ **Un pendiente dirigido a dos personas
    cuenta en las dos**, así que los números pueden sumar más que el total — la pantalla lo dice en
    un renglón; repartir la mitad a cada una sería inventar una responsabilidad parcial que nadie
    acordó. ⛔ Con **un solo** responsable no se dibuja: un filtro de una opción es ruido.
  - ⛔ **Sigue sin semáforo ni umbral**: el criterio de la pantalla no cambió.
  - 📌 **`rotuloDestino` ya no vive acá**: se mudó a `lib/novedades/tipos.ts` con
    `rotuloDestinoCorto` y `clavesDestino`, porque es del **destino** y ahora lo miran tres pantallas.
- 🆕 🔴 🔑 **DIRECCIÓN ES EL TECHO: NI SE VE NI SE ASIGNA PARA ARRIBA** (26-ago-2026, pedido de
  Bruno: *«que puedan asignar para abajo, o no poder asignar para arriba ni ver para arriba»*).
  `agenda.cargar` es **todo o nada**: quien lo tiene recibe la agenta entera (`visibles = cargar ?
  … : …`). Mientras el único que lo tuvo fue el admin eso no molestó a nadie; el día que lo tiene
  **Administración** —que es para lo que se escribió el filtro de «de quién»— empieza a ver las
  rutinas de los socios: la semanal de gerencia, y lo que aparezca mañana.
  - **La regla entera es una línea**: un ítem es *de arriba* si su destino apunta a `direccion`
    (`lib/agenda/jerarquia.core.js`). ⛔ **No hay escalera entre los otros cuatro roles** y no se va
    a escribir una hasta que aparezca el segundo caso — mismo criterio que el agrupador del ingreso.
  - 🔑 **Se DERIVA del padrón, ⛔ no se guarda una bandera en el ítem.** Estampar `datos.nivel` al
    crear sale gratis y no necesita el padrón, pero **empieza a mentir** en cuanto alguien cambia de
    función: la rutina del que deja de ser gerente sigue escondida y la del que asciende sigue a la
    vista. Es el argumento por el que `esPedidoUgc` se derivó en Canjes.
  - 🔴 **Alcanza con UNO.** «Marketing y Dirección» es de arriba: si bastara con que hubiera alguien
    de abajo, escribir dos destinatarios sería la forma de saltear el techo.
  - ⛔ **`{tipo:'todos'}` y `{tipo:'seccion'}` NUNCA son de arriba.** Si «todos» contara, esconder lo
    de Dirección escondería justo lo que más se comparte.
  - ⛔ **No hay excepción por tarea.** Se evaluó un tilde «igual la ve todo el equipo» y no entró:
    una rutina dirigida a Dirección que en realidad hace otro **está mal asignada**, y el arreglo es
    asignársela a quien la hace. Lo que es para todos se carga como para todos.
  - **El corte está en el SERVIDOR** (`api/_agenda.js`), y con eso quedan afuera **Cargar,
    Cumplimiento y el Mes** de una vez, porque los tres cuelgan de la misma lista. Filtrando al
    dibujar, el ítem viaja igual en el JSON y sigue contando para el badge.
  - 🔴 **El guard de escritura mira DOS destinos**: el que llega en el body —o asignar para arriba
    sería tipear un nombre— **y el que la fila ya tiene**, porque `guardar-item` es un `upsert` por
    id y `borrar-item` un delete por id. Sin el segundo, alguien de abajo pisa la reunión de los
    socios mandando su id.
  - 🔴 **En la escritura, lo que falta CIERRA: 503.** Si el padrón no se pudo leer y se está
    asignando por nombre, no se guarda. En el **listado** pasa lo contrario a propósito: se ve de
    más por un rato, que es un problema chico y transitorio, en vez de dejar al equipo sin agenda.
    (Y el destino por **rol** no necesita padrón, así que la mitad de la regla nunca se cae.)
  - ⛔ **La siembra del ingreso NO pasa por el techo**: si un paso del lanzamiento es de Dirección,
    el clon se siembra igual. Bloquearlo rompería el ingreso, que es lo que la puerta viene a hacer.
  - 🔴 **Para que esto sirva, quien lo use no puede ser `admin`** — el admin saltea todo
    (`puedeVer`, paso 1). Es un tilde en Config: `agenda.cargar` sí, `admin` no.
- 🆕 🔑 **Y EL SELECTOR DE PERSONAS DEJÓ DE SER ADMIN-ONLY** (26-ago-2026). Era el blocker del pedido
  de arriba: `ModalItem` leía el padrón con `traerConfigAdmin`, o sea el **POST `action:'config'`**,
  que pide contraseña de administrador ⇒ una Administración con `agenda.cargar` **no podía asignarle
  a nadie por nombre**, que es justo para lo que se le da el permiso.
  - 🔑 **Son dos puertas del mismo endpoint y no son la misma**: el POST es admin-only; el **GET**
    contesta a cualquiera que tenga sesión en el Monitor y devuelve la config **sin contraseñas**.
    Ya existía y ya estaba cerrado (antes lo bajaba cualquiera con un `curl`). Ahora se usa ése, por
    `traerEquipo` (`lib/usuarios/equipo.ts`). ⛔ No se inventó un endpoint: en Hobby quedan cinco.
  - ⚠️ **El achique se hace en la frontera**: de todo lo que devuelve el GET salen sólo
    `{name, apodo, funcion}`. Lo que no se devuelve no se puede dibujar por accidente.
  - Del lado del servidor lo mismo, con `equipoDelPadron` (`api/_auth.js`): reenvía la credencial
    que el request ya trae, achica a `{name, funcion}` y cachea **60 s** —el GET de la agenda lo
    dispara también el poll de avisos, o sea cada tres minutos por persona—. **Sólo lo pide quien
    está debajo del techo**: para el admin y para Dirección el filtro no corre.
  - ⛔ **Sigue sin haber campo de texto libre** para el nombre: si el padrón no se puede leer, la
    opción avisa y no se puede usar. Un nombre mal tipeado es un pendiente que no le sale a nadie.
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
    entra en el Mes ni en Cumplimiento. 🆕 Se lo ve y se lo edita en **la tarjeta de su evento**
    (`/agenda/eventos`), que es su único lugar.
  - **El clon nace `unica` con la fecha del ingreso + los días del molde, y ARRASTRA**: un paso del
    lanzamiento que se evapora al día siguiente es justo el que «se cae porque nadie lo mira». ⛔ Y
    no queda marcado como molde, o se clonaría a sí mismo en el próximo ingreso.
  - **El agrupador es el prefijo del título** (`IMP2 · …`) y ⛔ no se escribe un motor hasta haberlo
    usado dos veces (decisión de Bruno).
  - **La idempotencia es por `datos.ingreso` = `fecha·nombre`**, no por «ya corrió hoy»: un webhook
    que reintenta no puede dejar doce pendientes. ⛔ Y no se re-crea lo que alguien haya borrado a
    mano: borrar un renglón es una decisión.
- 🆕 🔴 **POR DÓNDE ENTRÓ EL PRODUCTO: LA PUERTA** (25-ago-2026, `lib/agenda/puertas.core.js`).
  Hasta acá el disparador clonaba **siempre los mismos moldes**, y eso sirve para **una sola de las
  cuatro puertas**: el manual «El nombre y la descripción del producto» cierra esos dos pasos **por
  puerta de entrada, no por sector**, y la dueña cambia con la puerta.

  | entra por…            | el NOMBRE      | la DESCRIPCIÓN                          |
  | --------------------- | -------------- | --------------------------------------- |
  | Producción propia     | Stefi          | ya viene escrita — **no lleva renglón**  |
  | Compra nacional       | Administración | **Zattia**: el local (básica + medidas) · **BDI**: Administración |
  | Importación           | Marketing      | Marketing                                |
  | Accesorios nacionales | Darío o Lorena | Administración                           |

  - 🔑 **La puerta es un dato del molde, no un `if`**: `datos.puertas`, y **vacío quiere decir
    todas** —la misma lectura que `marcas: []`—. Con eso los cuatro pasos que no cambian (precio,
    foto, publicar, pantallas) se cargan **una sola vez** y no cuatro, y *«producción propia no
    lleva renglón de descripción»* se dice **no cargando ese molde**: no hay ninguna rama en el
    código que lo sepa.
  - 🔴 **Sin puerta NO se siembra: 400.** Ni «sembrá todo», que dejaría once renglones con la dueña
    equivocada — y un pendiente que ya tiene nombre puesto no lo revisa nadie. Mismo criterio que el
    503 de la puerta sin secreto: **lo que falta cierra, no abre.** Por eso el `<Select>` del alta a
    mano **arranca vacío**, sin default: la puerta más común contestada sola es la que sale mal en
    las otras tres.
  - 🔑 **La puerta la elige Administración en `ingreso2`, en la misma carga** (decisión de Bruno,
    24-ago-2026): la sabe quien carga, en el momento en que la sabe, así que **viaja en el aviso** y
    el Monitor no pregunta nada. ⛔ No hay una rutina nueva que alguien tenga que acordarse de
    contestar.
  - 📌 **El mapeo de los tipos de `ingreso2` a nuestras cuatro puertas vive ACÁ** (`TIPOS_INGRESO2`),
    no en `ingreso2`: las cuatro puertas salen de nuestro manual y Gerardo no tiene por qué cambiar
    su vocabulario. ⚠️ **Hoy el mapa sólo tiene las cuatro claves nuestras, y no es un olvido**: la
    lista exacta de tipos que maneja `ingreso2` todavía no llegó. Hasta que llegue, un `tipo`
    desconocido contesta **400 nombrándolo**, así que la primera prueba de Gerardo documenta sola lo
    que falta y agregarlo es un renglón.
  - ⛔ **La puerta NO entra en la clave de idempotencia**: el mismo ingreso es el mismo ingreso, la
    puerta es una propiedad suya y no parte de su identidad. Sí queda en `datos.puerta` del clon,
    que es el **único rastro** de por qué un ingreso sembró cinco renglones y no seis.
  - ⚠️ **«hay moldes pero ninguno de esta puerta» se dice distinto que «no hay moldes»**: la acción es
    otra —allá hay que cargarlos, acá hay que revisar en qué puertas corre cada paso.
- 🆕 🔴 **Y DE QUÉ MARCA ES EL INGRESO** (25-ago-2026, `moldeCorreEnMarca`). Es una pregunta
  **aparte de la puerta**: las cuatro puertas existen en los dos negocios. Lo que cambia con la
  marca es el renglón de la descripción de una compra nacional — Bruno, 25-ago-2026: *«si es
  zattia, y es ropa, se encarga local; las fundas nunca se encarga local»*. ⇒ Son **dos moldes de
  la misma puerta** separados por marca, y sin este dato los dos caían en cada ingreso nacional.
  - 🔑 **Se lee igual que las puertas: `marcas: []` quiere decir las dos.** Los ocho pasos que no
    cambian se siguen cargando una sola vez.
  - 🔴 **Sin marca NO se siembra: 400**, y una marca que no existe **la nombra** —igual que el
    `tipo` de `ingreso2`—. Mismo criterio de siempre: lo que falta cierra, no abre. El `<Select>`
    del alta a mano también **arranca vacío**, ⛔ y no en la marca del header: el que carga puede
    estar mirando BDI y sembrando el ingreso de ropa.
  - 🔑 **El clon nace en la marca del ingreso** (`marcas: [marca]`), ⛔ no con las del molde: un
    molde sin marca corre en las dos, pero el renglón que salió de un ingreso de BDI es de BDI. Sin
    esto, los pendientes de un ingreso de fundas le aparecerían a quien trabaja parado en Zattia.
  - ⛔ **Tampoco entra en la clave de idempotencia**, por lo mismo que la puerta. Queda en
    `datos.marca` del clon.
  - ⚠️ **`moldeCorreEnMarca` NO es `esDeMisMarcas`** aunque la forma sea idéntica: allá la pregunta
    es *«¿puedo ver esto?»* —una persona con las dos marcas ve las dos— y acá *«¿este paso es de
    este ingreso?»*, donde el ingreso tiene **una sola**. Aplanarlas haría que tocar una regla
    cambiara la otra sin querer.
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
    -d '{"action":"ingreso-externo","nombre":"IMP2","fecha":"2026-08-24","tipo":"importacion","marca":"bdi"}'
  ```

  🔴 **`tipo` y `marca` son los dos obligatorios.** `tipo` puede reemplazarse por `puerta`, que es el
  mismo dato en nuestro vocabulario y sirve para probar con `curl` sin esperar el mapa; `marca` es
  `bdi` o `zattia` y ⛔ no tiene mapa: son los dos negocios, no una traducción. Sin alguno, 400.
- 🆕 🔴 🔑 **EL 2º DISPARADOR: LA SESIÓN DE FOTOS** (29-ago-2026, `lib/agenda/plantillas.core.js`).
  Sale de la auditoría de disparadores (`~/Documents/quien-hace-que/disparadores-2026-08-28.md`),
  que midió ocho hechos sobre tres años de chats: la sesión de fotos aparece en **27 días distintos
  de 2026** y en **16 toca dos sectores o más** — el doble que el siguiente. Sus renglones ya
  estaban escritos, con dueña y con momento, en el manual «Sesiones de fotos»; lo que faltaba era
  el motor.
  - 🔑 **El motor dejó de saber decir «ingreso».** Las plantillas son un catálogo
    (`plantillas.core.js`) y cada una trae **su eje**, su rango de días y cómo se llama su hecho.
    El handler los lee: agregar la tercera es una fila allá, ⛔ no un `if` acá. `PLANTILLAS` ya era
    una lista blanca y no un booleano esperando justamente esto.
  - **El eje de la sesión es el ORIGEN** (`datos.disparadores`: ingreso · campaña · faltante), que
    es el mismo campo que ya usaba el historial de Solicitudes — se importa de
    `lib/solicitudes/disparador.core.js`, ⛔ no se reescribe. Se lee igual que las puertas: **vacío
    es los tres**. Sólo cambia de dueña el último renglón («equipo completo y en su lugar»: un
    faltante lo arma Cande, una campaña y un ingreso, Sofi), y por eso va cargado dos veces.
  - 🔴 **`offsetDias` puede ser NEGATIVO, y sólo en esta plantilla.** El manual busca la modelo
    **48 h antes** y las referencias **el día anterior**: son los dos pasos que más se caen. El
    ingreso ⛔ no lo admite —se entera cuando la mercadería ya llegó, así que un paso «dos días
    antes» nacería vencido— y el rango es un dato de cada plantilla (`offsetMin`/`offsetMax`).
  - 🔴 🔑 **Y fuera de rango es 400, ⛔ no un recorte callado.** Hasta acá la carga hacía
    `Math.min(90, …)` y la siembra `Math.max(0, …)`: un `-2` se guardaba como `0` y la pantalla
    seguía mostrando lo que la persona había escrito. Es el mismo defecto que el monto descartado
    sin avisar — **el que exige un dato no puede tirarlo en silencio**.
  - 🔴 **El disparo NO es una puerta: es crear la sesión** (`api/_solicitudes.js`). El del ingreso
    lo avisa un sistema de afuera; éste ocurre adentro del Monitor, así que el hecho es el guardado
    de una solicitud de `sesionfotos` que **todavía no existía**. Las tres reglas que lo sostienen:
    **editar no es crear** (la pantalla guarda entera la solicitud en cada cambio: sembrar siempre
    le tiraría nueve pendientes encima a tres personas cada vez que alguien agrega una prenda), **el
    lote no siembra** (es la migración del KV, donde «todavía no existe» es verdad de todas las
    sesiones de dos años atrás) y **no poder leer qué existe ⛔ no es «entonces es nueva»**.
  - 🔑 **La clave de idempotencia es el ID de la sesión**, ⛔ no `fecha·nombre` como en el ingreso.
    La diferencia no es de gusto: **la fecha de una sesión se edita**, y con la fecha adentro
    moverla un día sembraría los nueve renglones otra vez. El ingreso no tiene id propio —el aviso
    de Gerardo trae lo que trae—, así que cada plantilla dice en qué campo guarda su clave
    (`datos.ingreso`, `datos.sesion`): un campo compartido habría dejado sin llave a lo ya escrito.
  - ⛔ **Sin origen no siembra, y la pantalla lo dice.** El borrador puede quedar sin origen a
    propósito (el botón de Marketing sirve igual para una campaña que para un faltante), y sembrar
    «igual» pondría la dueña equivocada — que es peor que no sembrar, porque nadie revisa un
    pendiente que ya tiene nombre puesto. Mismo criterio que el 503 de la puerta: **lo que falta
    cierra, no abre**. El renglón de al lado del selector avisa qué se pierde si queda vacío.
  - 🆕 🔴 **EL TECHO DIARIO ESTABA EN 60 Y LO CHOCÓ UN DÍA NORMAL** (1-sep-2026). Ese día el webhook
    de Ingresos empezó a mandar en vivo: entraron **11 órdenes**, cada puerta contestada siembra
    **6 pasos**, y `TOPE_SEMBRADO_DIARIO` cuenta además los clones de la otra plantilla — 60 de
    ingreso + 8 de sesión de fotos = **68** ⇒ la siguiente pregunta contestada devolvió «se llegó al
    tope». 🔑 **Un techo que frena el uso normal ⛔ no protege: enseña a ignorarlo**, y éste además
    frenaba **de rebote a la otra plantilla**. Subido a **300** (≈4 días como aquél, y sigue siendo
    dos órdenes de magnitud menos que un bucle), y el mensaje ahora **dice los números** y que
    cuenta todas las plantillas: el viejo era «se llegó al tope» a secas, así que quien lo leía no
    podía saber si le faltaba uno o cien, ni que lo frenaba algo de otra plantilla.
  - 🔴 **Sembrar no puede voltear el guardado.** La sesión es el dato; los pendientes son la
    consecuencia. Si no hay moldes cargados o la base no contesta, la sesión igual se guarda y el
    error viaja en la respuesta (`sembrado`).
  - ⚠️ **Stunned es una LÍNEA de Zattia**: la marca del clon sale de `baseDeLinea(store)`, ⛔ no del
    store. La Agenda tiene dos marcas y `stunned` no es una.
- 🆕 🔴 🔑 **EL 3º DISPARADOR: EL LANZAMIENTO — y la plantilla SIN EJE** (29-ago-2026). El manual 08
  dice que la lista *«se abre al decidir el lanzamiento, no el día antes»*, y **el objeto que dice
  eso ya existía**: un hito propio del calendario editorial de tipo `lanzamiento`, con su fecha
  objetivo. ⛔ No hizo falta inventar un botón — el dato ya lo sabía el código y lo estaba tirando.
  - 🔴 **El hecho es «quedó FIRME», ⛔ no «se creó».** `firme: false` es una fecha **proyectada, que
    se puede mover**, y colgar once pendientes de una fecha que se mueve es sembrar once fechas
    equivocadas. Y como el hecho es un **estado** y no un alta, el mismo código cubre los dos
    caminos —nace firme, o alguien lo marca firme después— **sin preguntar si el hito existía**: la
    idempotencia por clave hace las dos cosas. (La sesión de fotos sí tiene que preguntarlo, porque
    allá el hecho es el alta.)
  - 🔑 **La clave es el ID del hito**: la fecha objetivo **se mueve** hasta que queda firme.
  - 🔑 **Una plantilla puede NO tener eje** (`eje: null`). El eje existe **porque hay un paso que
    cambia de dueña**, y en el lanzamiento no lo hay: el guion es de Cami, el banner de Cande, la
    pauta de Bruno, pase lo que pase. Inventarle uno sería obligar a contestar una pregunta que el
    manual no hace, y **«lo que falta cierra» ⛔ no aplica donde no hay nada que decidir**. Un eje
    que llega igual es **400 y lo nombra**: el que lo mandó cree que va a filtrar algo.
  - **Son once de los diecisiete.** Los renglones 1-5 y el 14 son **los mismos moldes del ingreso**
    (nombre, descripción, precio, la sesión de fotos, las fotos, las pantallas) y se quedan ahí,
    porque *«lanzamiento siempre tiene algo nuevo»* (Bruno, 29-ago) ⇒ **todo lanzamiento trae un
    ingreso adentro**. Cargarlos en los dos lados dejaría dos lugares donde la dueña puede decir
    cosas distintas.
  - 🔴 **Y ⛔ no siembra si la fecha objetivo YA PASÓ.** Salió de medir producción: hay un
    «Lanzamiento Fundas BDI» del 7-ago, firme; editarle una coma le habría sembrado once pendientes
    de hace tres semanas —la mitad **fuera de la ventana de arrastre**, o sea invisibles, y la otra
    mitad vencidos para algo que ya salió—. El corte lleva **un día de margen** porque el reloj del
    servidor es UTC y el de acá es Argentina. ⚠️ Y **cuando no siembra por vieja, se dice**: el
    silencio se leería como que sí.
  - **La pantalla lo dice**: el modal del hito avisa qué pasa al guardarlo firme —reparte trabajo a
    cuatro sectores— y qué **no** pasa mientras siga proyectada.
- 🆕 🔴 🔑 **EL 4º DISPARADOR: EL CAMBIO DE CONDICIÓN COMERCIAL — y el hecho que se aprieta de DOS
  lados** (29-ago-2026). Sale de una frase del manual «Las chiquitas de marketing», que es la que lo
  define: *«un cambio de condición comercial —una promo, una forma de pago, un cambio de envío— **no
  es un posteo**: es destacadas + barra de anuncios + bio + el local avisado + el mail»*. La
  auditoría lo midió cuarto (23 días distintos de 2026, 6 con dos sectores o más) y lo único que le
  faltaba era **qué lo aprieta**. Son dos cosas y ⛔ no una, y ésa es la novedad de éste:
  - 🔑 **El alta de una promo bancaria lo siembra sola** (`guardar-promo`). Como en el lanzamiento,
    **el objeto ya existía**: alguien carga la promo con su banco, su beneficio y su fecha. 🔴 **El
    hecho es que quede PRENDIDA, ⛔ no que se haya creado** —una promo cargada apagada todavía no
    cambió nada afuera— y como es un estado, el mismo código cubre los dos caminos.
  - 🔑 **Y hay un botón**, porque de los tres cambios **sólo uno tiene objeto en el Monitor**: una
    forma de pago nueva o un cambio de envío no los carga nadie en ninguna pantalla, y son
    exactamente los que hoy se comunican de a pedazos. ⇒ `action: 'condicion'`.
  - 🔴 **La MARCA entra en la clave, y es la única de las cuatro plantillas donde eso pasa.** La
    promo la define el banco: `marcas: []` quiere decir **las dos tiendas**, y cambiar el banner de
    Zattia y el de BDI son dos trabajos, de dos personas, en dos tiendas ⇒ **son dos hechos**. Con
    una sola clave, el segundo se leería como «ya estaba sembrado» y nadie tocaría el de Zattia. En
    las otras tres la marca ⛔ no entra: allá el hecho ya tiene una.
  - 🔑 **La fecha es `desde`, ⛔ no hoy**: los pasos cuelgan del día en que la promo **empieza a
    regir**, que es cuando tiene que estar comunicada. Por eso los offsets admiten hasta **−7**.
  - 🔴 **El freno del hecho vencido se MUDÓ al núcleo** (`hechoYaPaso`, en `plantillas.core.js`).
    Estaba escrito en `api/_calendario.js` para el lanzamiento; este disparador necesita la misma
    pregunta desde otro handler —en la base hay promos de junio, y a todas les alcanza con que
    alguien les corrija una coma para sembrar hoy los pasos de un cambio de hace tres meses— y
    copiarla habría dejado **dos versiones de la misma regla**. Ahora es un campo de la plantilla
    (`noSiembraSiPaso`) que `sembrar` mira **antes de tocar la base**, y el calendario ⛔ ya no
    decide: le pasa el hito y lee el error. ⛔ **El ingreso NO lo lleva, y es una decisión**: la
    mercadería llega y a veces se avisa dos días después.
  - 🔑 **El eje es QUÉ CAMBIÓ** (`datos.cambios`: promo · forma-de-pago · envío, en
    `lib/agenda/condicion.core.js`) y acá decide **qué renglones corren** más que de quién es cada
    uno: los videos de las pantallas son *«a cada cambio de promo»* y las destacadas *«cada vez que
    cambia una condición comercial»* — dos frases del mismo manual que ⛔ no dicen lo mismo.
  - 🔑 **Y el MODAL dejó de ser el del ingreso: ahora la copia sale del catálogo** (`pantalla`), así
    que el 5º disparador con botón es **una fila**, ⛔ no un segundo modal copiado del primero.
    ⚠️ El lanzamiento y la sesión de fotos tienen `pantalla: null` **a propósito**: los dispara su
    propia pantalla, y un botón aparte sería un segundo lugar donde decir lo mismo.
  - 🔴 **Lo que se rompió al agregar la tercera columna del eje**: el GET tenía escritos a mano
    `puertas` y `disparadores`. `cambios` habría viajado **siempre vacío** —la pantalla mostrando
    los tildes apagados, o sea afirmando «corre en los tres»— y el próximo guardado los habría
    borrado de verdad. Nada falla y el molde queda mal. Ahora sale de `PLANTILLAS`, igual que el
    limpiado de los ejes al cambiar de plantilla en el modal del molde.
  - **Los ocho renglones y su dueña salen de los manuales** «Las chiquitas» y «Las rutinas», ⛔ no
    del código: se cargan con `~/Documents/quien-hace-que/scripts/moldes-condicion.mjs` (arranca en
    simulación) y se verifican por otro camino con `verificar-siembra-condicion.mjs`.
    🔴 **⛔ No se cargan antes del deploy**: con la plantilla desconocida, `guardar-item` los guarda
    como **rutinas normales con la fecha de hoy** y le aparecen a cuatro personas como pendientes de
    verdad. El verificador lo detecta y lo dice.
- 🔑 **Es el tablero donde van las rutinas repetitivas de marketing** — decisión de proceso de Bruno
  el 23-ago-2026 (*«maketa es más marketing, monitor es operativo»*). Dejan de vivir en un documento
  y le salen solas a cada una el día que tocan, colgadas del manual que explica cómo se hacen
  (`manualId`). ⇒ ⛔ eso no se construye: **se carga**.
- 🆕 🔴 🔑 **EL MES CUENTA, LA SEMANA NOMBRA** (26-ago-2026, `components/agenda/GrillaAgenda.tsx`).
  Bruno: *«la vista de calendario se ve muy cargada y monótona»*, y preguntado qué molesta:
  **demasiadas filas por día**, **todo se ve igual** y *«serviría vista semanal también»*.
  - **Son el mismo defecto.** Una rutina de todos los martes ocupaba cuatro cuadraditos repitiendo
    el mismo título: no aporta información y encima se come los tres renglones de la celda,
    tapando lo único que sí había que mirar.
  - **`resumirDia()` parte el día** en lo que se nombra y lo que se cuenta. 🔴 **El corte no es «se
    repite»: es cuántas veces habla en la vista** (`esRepetitiva`) — `diaria`, `semanal` y `rango`
    caen cuatro veces o más; `mensual` cae **una sola** y colapsarla escondería el único día en que
    existe.
  - 🔴 **Las promos no colapsan nunca**, aunque sean lo más repetitivo que hay: la pestaña existe
    para contestar *«¿cuándo cae la próxima del Nación?»*, y eso se contesta viendo los cuatro
    martes pintados. Los avisos tampoco: son pocos, fechados y ya tienen su ámbar.
  - 🔴 **El contador no puede inventar un rojo.** «3 rutinas · 1 sin hacer» en un martes **futuro**
    es una alarma que nadie puede apagar. Los días que no pasaron dicen sólo cuántas son; ⛔ y
    **nunca** en tono `danger`: el informe de deuda es Cumplimiento.
  - ⚠️ **Colapsa desde dos**: con una sola, el contador esconde el título sin ahorrar un renglón.
  - **La Semana no colapsa**: la celda es alta y entra todo. Sale de `entradasDeRango()`, **el
    mismo camino que el Mes** —que quedó como envoltorio con los bordes puestos—, porque dos
    caminos paralelos es exactamente cómo la grilla y lo que el local ve empiezan a discrepar.
  - ⛔ **No se inventó un color por persona.** En el Mes todo lo que se ve es ya `paraMi`, así que
    para quien no es admin el eje «responsable» tiene un solo valor; y para el admin es
    sistemáticamente incompleto, porque `{tipo:'personas'}` es el destino que no recibe. El
    responsable entra en el **detalle** del día, con `rotuloDestinoCorto`. Lo que distingue en la
    grilla es el **peso visual** con los tokens que ya hay, y los días pasados **apagados**.
  - **La vista vive en la URL** (`?vista=semana`) y el `offset` **no**: es relativo a hoy, así que
    un link compartido significaría otro mes mañana. 🔴 Y el `offset` **cambia de unidad** al
    cambiar de vista ⇒ se resetea a 0, o «tres meses adelante» se vuelve «tres semanas adelante» en
    silencio.
  - ⚠️ **No se llama `Calendario.tsx`** (ya existe el editorial de Marketing). 🆕 Y desde el 29-ago
    **Mes y Semana son dos entradas del menú**: la vista entra por parámetro y el chip que la
    cambiaba se fue — mirando la semana, la pestaña seguía diciendo «Mes». 🔴 El `offset` sigue
    volviendo a 0 al cambiar, pero ahora porque `Agenda.tsx` **remonta** la grilla con un `key`.

## 🆕 La PREGUNTA DE LA PUERTA: el disparador del ingreso, prendido por el webhook de OC

**30-ago-2026.** El disparador del ingreso llevaba seis días en producción con 16 moldes cargados y
había sembrado **cero**. La ficha decía que lo trababa `INGRESO_SECRETO`, y se remidió: **es falso.**

🔴 🔑 **El hecho ya entraba al Monitor, y por otra puerta.** El webhook `oc.confirmada` del sistema
de Ingresos (`?recurso=oc-webhook`, secreto `INGRESO_WEBHOOK_SECRET`, **cargado**) trajo **79
órdenes firmadas el 27-ago**, 0 eventos rotos, `confirmada_at` en **79 de 79** — y confirmar una OC
**es** el hecho: el evento trae las unidades **contadas**, o sea que alguien recibió la mercadería.
`INGRESO_SECRETO` era **una segunda entrada, con un segundo secreto, para lo que ya entraba por la
primera**. ⇒ [el dato ya lo sabía el código y lo estaba tirando](../../lib/agenda/plantillas.core.js).

🔴 **Lo que de verdad faltaba es LA PUERTA DE ENTRADA**, que ese payload ⛔ no manda: trae proveedor
(con `proveedor_id` estable), líneas, pedidas y contadas, y ningún tipo de ingreso. Y sin puerta
`sembrar` contesta 400 **a propósito**, porque dos de los seis renglones cambian de dueña con ella.

### Lo que se construyó: preguntar, ⛔ no adivinar

Cada OC confirmada deja **UN** pendiente para Administración —*«¿Por qué puerta entró OC-0412
(RHOVE)?»*— que **arrastra**, y contestarlo con un click siembra los seis. Mientras no se contesta,
⛔ **el ingreso no se pierde**: para eso arrastra.

🔑 **Adivinar por el proveedor ⛔ no era una opción**: son **30 proveedores** en las 79 OCs; `CHINA`
se lee sola, pero `RHOVE`, `ASKDENIM` o `BOUCLE LOCAL` no. Una puerta mal puesta es **peor que no
sembrar**, porque un pendiente que ya tiene nombre no lo revisa nadie.

- La regla vive en **`lib/agenda/pregunta-ingreso.core.js`** (puro, `.js` porque lo importan los dos
  handlers). El webhook la abre; `action: 'ingreso-puerta'` de `api/_agenda.js` la contesta.
- **La pantalla son cuatro botones en el renglón de Hoy** (`PendientesHoy.tsx`), ⛔ no un modal ni un
  `select` + «Confirmar»: la gracia era que fuera **un** click, y un desplegable con confirmar son tres.

### 🔴 El freno del BACKFILL vive en la ENTRADA, ⛔ no en la plantilla

Las 79 OCs entraron en **una tanda de trece minutos**. Sin freno, conectar esto abría 79 preguntas
viejas de golpe, y una bandeja que nace con 79 renglones de junio no la mira nadie.

🔑 **Y por qué acá y no como `noSiembraSiPaso` de la plantilla `ingreso`** —la única de las cuatro
que ⛔ no lo lleva—: eso fue una decisión y **sigue siendo correcta**. El botón a mano acepta una
fecha vieja porque *la mercadería llega y a veces se avisa dos días después*, y ahí el pendiente
atrasado es justo lo que hay que ver. **El webhook es otra entrada**: no puede traer un hecho viejo
salvo que sea un backfill. **El mismo hecho, dos puertas, dos frenos.** Se reusa `hechoYaPaso`
—`fecha < ayer`— y ⛔ no un número nuevo: el margen ya cubre las 17 horas de reintentos del emisor.

### De qué fecha cuelga, y por qué las otras dos no sirven

| campo | vino en | por qué ⛔ no |
|---|---|---|
| `fecha_ingreso` | **17 de 79** | la carga una persona: colgar de ella deja mudas a 3 de cada 4 |
| `recibido_en` | 79 de 79 | es cuándo lo recibimos NOSOTROS — un backfill lo pone en hoy y **desarma el freno de arriba** |
| **`confirmada_at`** | **79 de 79** | el instante en que el hecho pasó del otro lado ✅ |

### Lo demás que se decidió, y por qué

- 🔑 **La pregunta va a Administración por ROL** y ⛔ no a una persona nombrada, como «las tres» de
  la sesión de fotos. ⚠️ **Medido contra el padrón antes de escribirlo** (16 personas): la función
  `administracion` la tiene **una sola** —Lorena Reyes— y es **la única sin `admin` con
  `agenda.cargar`**, que es el permiso que hace falta para contestar. ⇒ hoy le llega a quien puede.
  🔴 **El día que entre alguien a Administración SIN `agenda.cargar` va a ver la pregunta y no va a
  poder contestarla**: por eso la pantalla muestra el 403 tal cual en vez de tragárselo — «no pasó
  nada» al apretar es lo que hace que alguien lo intente tres veces y después no lo intente más.
- 🔑 **El nombre, la fecha y la marca salen de la FILA y ⛔ nunca del body.** Lo único que el que
  aprieta elige es la puerta: si el resto viajara desde la pantalla, esto sería un segundo «sembrá
  lo que quieras» con otro nombre, y el techo de `agenda.cargar` estaría cuidando una sola de las dos.
- 🔑 **La pregunta se TILDA, ⛔ no se borra.** Borrarla dejaría a Cumplimiento contando una
  ocurrencia que desapareció. El tilde va a la fecha del hecho, que es la única que corta el arrastre.
- 🔑 **Abrir la pregunta es MEJOR ESFUERZO y ⛔ no puede voltear el evento**, igual que el cruce con
  el espejo: si la Agenda no contesta, la OC se guarda lo mismo. Perder el evento es definitivo —no
  hay quién lo vuelva a mandar—; perder la pregunta no. ⚠️ **Pero lo que pasó se DICE** y viaja en la
  respuesta del webhook: «no se abrió ninguna pregunta» sin motivo se lee como que esto está roto, y
  es exactamente lo que lo mantuvo mudo seis días.
- **El tope es 20 preguntas por día**, y sale de una medición: en 2026 se confirmaron OCs en 29 días
  distintos, promedio **2,7** y máximo **15** (17-jun). Deja aire sobre el máximo observado, y
  **cuando se llega se dice**.

### Cómo se probó

✅ **22 mutantes, 22 muertos** —19 sobre el núcleo y la acción, 3 sobre el cable del webhook— y **un
mutante inocuo de control que SOBREVIVIÓ**, que es lo que prueba que el arnés no mata todo por
igual. Tests: `tests/agenda-pregunta-puerta.test.ts` (25) y los 6 nuevos de
`tests/oc-webhook-handler.test.ts`.
🏁 **28 de 28 caminando contra PRODUCCIÓN** con los dos handlers **en proceso**
(`scripts/caminar-pregunta-puerta.mjs`): la pregunta nació, no se repreguntó, la de junio no abrió
nada, contestarla sembró **10 clones** de importación con la puerta y la marca puestas, la pregunta
quedó **tildada y no borrada**, contestar dos veces contestó `ya`, y **se borró todo: 77 ítems antes,
77 después**. 🔑 **El `.not('datos->…','is',null)` sólo lo verifica la base**: contra un Supabase de
mentira un filtro mal escrito sale verde.

✅ **En PROD el 30-ago** (`fdac165`), verificado por **dos sondas que ⛔ no escriben nada**: el campo
nuevo del GET (`preguntaIngreso`, viaja en los 77 ítems y **0 preguntas abiertas**) y un POST con un
id inexistente, que contesta **404 «Esa pregunta ya no está»** ⇒ el verbo está en el bundle.
🔑 **Un POST de verdad no servía como oráculo**: habría creado filas si el deploy ya había llegado.

▶️ **Falta caminar LA PANTALLA**: los cuatro botones piden login, así que es mano de Bruno.
▶️ **Y decidir si va una NOVEDAD**: la próxima OC que confirme Gerardo le abre a Administración un
pendiente que nadie le anunció.
⚠️ **Lo que ⛔ NO está probado es que el emisor mande EN VIVO.** Las 79 OCs llegaron en una sola
tanda el 27-ago y ninguna desde entonces —`OC-0412` se confirmó el 26 y llegó igual en la del 27—,
así que puede que esto no se prenda hasta que Gerardo mande el primer evento en vivo. El tripwire es
`eventos.ultimo` del GET de recepciones.

## Lo que ya se rompió acá

- 🔴 **Crear `api/agenda.js` «por prolijidad» frena TODOS los deploys sin error visible**: Hobby
  admite 12 funciones. Vercel sigue sirviendo la versión anterior y no avisa. Ya pasó una vez
  (`api/_agenda.js`, encabezado).
- 🔴 **El mapa de secciones derivó en silencio y `agenda` era una de las tres que faltaban**
  (15-ago-2026). Por eso existe `tests/agents-mapa-secciones.test.ts`.
- ⚠️ Un POST sin `Content-Type: application/json` da «falta id» en vez de un error de formato:
  Vercel no parsea el cuerpo.
- 🆕 🔴 **`Number(null)` es `0`, no `NaN`** — y `guardar-item` escribe `datos` **entera**. Con el
  `Number.isFinite(Number(x))` a secas, **cada guardado a mano le escribía `offsetDias: 0`** a un
  ítem que no tiene ninguno (el formulario manda `null` en todo lo que no es molde). Se vio en
  producción el 25-ago releyendo la pasada de Tienda Nube después de ponerle el tope. Lo tapa
  `numeroDado()`, y es el mismo guard que impide que «sin tope» se guarde como «vence hoy».

## Pendiente

- ▶️ **El `info` de `lib/nav.datos.ts` la describe como si fuera sólo de promociones bancarias** y
  no nombra los pendientes rutinarios, que es la mitad de la sección. Es una descripción, no una
  regla: se corrige el texto.
- ▶️ **Cargar las 12 rutinas de marketing.** Las carga Bruno una vez, porque la rutina es la línea y
  la línea es de él. Desde el 23-ago-2026 van **con nombre** —`destino: {tipo:'personas'}`— y no con
  `roles:['marketing']`: si no, le salen a las tres.
- 🆕 🔴 🔑 **`INGRESO_SECRETO` ⛔ YA NO ES LO QUE TRABA AL DISPARADOR DEL INGRESO** — remedido
  contra producción el 30-ago-2026. **El hecho ya entra solo al Monitor, y por otra puerta**: el
  webhook `oc.confirmada` de Ingresos (`?recurso=oc-webhook`, secreto `INGRESO_WEBHOOK_SECRET`, que
  **sí** está cargado) trajo **79 órdenes de compra firmadas el 27-ago**, con 0 eventos rotos —ver
  `docs/secciones/recepciones.md`—. Confirmar una OC **es** el hecho: el evento trae las unidades
  **contadas**, o sea que alguien recibió la mercadería. ⇒ la puerta con `x-ingreso-secreto` es una
  **segunda entrada, con un segundo secreto, para un hecho que ya está entrando por la primera**.
  🔴 **Lo que de verdad falta es LA PUERTA DE ENTRADA**, que ese payload ⛔ no manda: trae proveedor
  (con `proveedor_id` estable), líneas, pedidas y contadas, y ningún tipo de ingreso. Sin puerta el
  disparador contesta 400 **a propósito** —sembrar «todo» le pone la dueña equivocada al nombre y a
  la descripción, y un pendiente que ya tiene nombre no lo revisa nadie—.
  ⚠️ **Y el freno que falta escribir antes de conectar cualquiera de los dos caminos: el BACKFILL.**
  Las 79 llegaron en una sola tanda de trece minutos; sin freno, sembrarían **cientos** de
  pendientes viejos de golpe. `ingreso` es la única plantilla **sin** `noSiembraSiPaso`, y eso fue
  una decisión (la mercadería llega y a veces se avisa dos días después) ⇒ el freno tiene que ser
  otro, y tiene que estar antes.
  📌 Los tres caminos posibles y la decisión de Bruno están escritos en
  `~/Documents/quien-hace-que/PENDIENTES.md` § 3. El `curl` de arriba sigue sirviendo si igual se
  elige la puerta propia; el alta a mano («Ingresó mercadería») anda hoy y ⛔ **nadie tiene escrito
  que la apriete**.
- 🆕 🔴 **Y el parte del 30-ago: los cuatro disparadores sembraron CERO trabajo real.** 44 moldes
  cargados (16 · 9 · 11 · 8), 77 ítems en la Agenda, **0 clones**. Tres de los cuatro tienen un día
  de vida, así que eso ⛔ no prueba nada todavía; el del ingreso lleva seis días y la observación es
  **n = 1** (una sola OC confirmada desde el 24-ago: `OC-0412`, el 26). 📌 Se remide con
  `~/Documents/quien-hace-que/scripts/estado-disparadores.mjs`, que **cuenta el clon por su FORMA y
  ⛔ no por `datos.de`** —el campo que el propio sembrador escribe—.
- 🆕 ▶️ **Cargar los pasos del ingreso como moldes** (nombre · descripción · precio · foto ·
  publicación · pantallas, con su dueña y a los cuántos días). Hasta que estén, el botón lo avisa y
  no siembra nada.
- 🆕 ▶️ **Cargar las 4 reuniones semanales** (comunidad, pauta, diseño y la mensual del sector), que
  es para lo que se escribió el arrastre. La quincenal de diseño necesita la decisión de arriba.
- 🆕 ▶️ **Tildarle `agenda.cargar` a Lorena en Config, y dejarla SIN `admin`.** Es la mano que activa
  todo el techo: hasta que exista alguien así, la regla está escrita y no la ejerce nadie.
- 🆕 🏁 **Los moldes de la sesión de fotos, CARGADOS y ejercidos en vivo** (29-ago): **9 moldes** —
  siete pasos, con «Drive» y «web» partidos, y el último cargado dos veces por origen— y una sesión
  de prueba con fecha de diciembre sembró sus **8 renglones** con las fechas corridas, sin dejar
  restos. Script: `~/Documents/quien-hace-que/scripts/moldes-sesion-fotos.mjs` (arranca en
  simulación y **se planta si ya hay moldes**: crea, ⛔ no actualiza); el oráculo por otro camino,
  `verificar-siembra-fotos.mjs`.
- 🆕 ✅ **«Reetiquetar lo que se desetiquetó» quedó con LAS TRES POR NOMBRE** (decisión de Bruno,
  29-ago). Iba a ir por rol —*«las tres = las de marketing»*, para que siguiera siendo correcto el
  día que cambie quién está en marketing— pero **el padrón dice que la función `marketing` la tienen
  CUATRO**: Sofi, Cande, Cami y **Stefania Scolari**, que es diseñadora y no va a las sesiones.
- 🆕 🏁 **Los once moldes del lanzamiento, CARGADOS y ejercidos en vivo** (29-ago): un hito de
  prueba **proyectado no sembró nada**, marcado **firme sembró los 11** con las fechas corridas
  (−7 · −5 · −2 · −1 · 0), y **re-guardarlo con otra fecha contestó `ya`**. La prueba se borró
  entera. Script: `~/Documents/quien-hace-que/scripts/moldes-lanzamiento.mjs` —arranca en
  simulación, **saltea por título lo que ya está** y **reintenta**, porque `api/datos.js` viene
  contestando 504 a intervalos—; el oráculo por otro camino, `verificar-siembra-lanzamiento.mjs`.
  ⚠️ **Cuatro de los once días los elegí yo** y están marcados en el encabezado del script: la
  tipografía (−7), los canjes (−7) y el guion (−5) — el manual ahí dice prosa, no un número.
- 🆕 ▶️ 🔴 **Y de ahí sale un pendiente que no es de la Agenda: falta la función `diseno`.** Stefi
  usa `marketing` porque no hay otra, y ⛔ **sacársela no es gratis**: es su **ÚNICA** fuente de
  acceso —no tiene un solo permiso tildado a mano, sólo exclusiones—, así que quedaría sin nada,
  incluidas Solicitudes y Sesión de fotos, que es lo que usa para pedir productos y diseñar. ⇒ La
  función nueva es código (`FUNCIONES` + `ACCESO_POR_FUNCION`, con su test de espejo) y **una
  decisión de Bruno: qué ve una diseñadora**. Hasta entonces, todo destino `roles:['marketing']`
  le llega también a ella — hoy hay **una** rutina así en la Agenda.
- ⚠️ **Las que ya estén cargadas por rol NO se migran solas.** Hay que abrirlas y reasignarlas: el
  destino viejo sigue siendo válido y el motor no adivina cuál de las tres es la dueña.

## Cómo se prueba

`npx vitest run tests/agenda.test.ts` (el motor), `tests/agenda-modal-sembrar.test.tsx` (el modal que
siembra, montado y apretado), `tests/agenda-disparadores.test.ts` (los disparadores y
su puerta) — 🆕 **el segundo es el primero que prueba `api/_agenda.js`**, que hasta el 24-ago-2026
no tenía ninguno — y las dos de pantalla, con `renderToStaticMarkup` sobre las piezas puras:
`tests/agenda-cumplimiento-pantalla.test.tsx`, `tests/agenda-grilla.test.tsx` y 🆕
`tests/agenda-eventos.test.tsx` (la fila de una actividad y el grupo de lo copiado). 🆕 El disparo de
la sesión de fotos —cuándo siembra y, sobre todo, **cuándo NO**— vive en
`tests/solicitudes-siembra.test.ts`, porque su puerta es `api/_solicitudes.js` y no la Agenda.

🆕 `npx vitest run tests/agenda-pregunta-puerta.test.ts` — **la pregunta de la puerta**, las dos
mitades: el núcleo puro y la acción que la contesta. El cable con el webhook está en
`tests/oc-webhook-handler.test.ts`, y el camino entero contra la base real en
`node scripts/caminar-pregunta-puerta.mjs` (siembra contra producción y borra).

Lo que el test **no** ejerce y hay que caminar a mano:

- Un día **con** promo y un día **sin** promo son dos pantallas distintas, y la de «sin» es la que
  se rompe callada: cargá una promo de prueba en **Rutinas** y mirá «Hoy» en los dos estados.
- **El tilde con un perfil que NO es admin**, que es quien la va a usar todos los días. Con el admin
  todo anda porque saltea el sub.
- El `destino`: un pendiente ajeno **no** tiene que encender el badge del menú.
- 🆕 **El arrastre, de punta a punta**: cargá un pendiente semanal con «Queda hasta que se tilde», no
  lo tildes dos semanas y mirá que aparezca **una sola vez** (no dos), que diga de cuándo viene, que
  el badge del menú cuente lo mismo, y que **un solo tilde lo apague**. Después mirá Cumplimiento:
  tiene que haber **una** fila, no una por semana.
- 🆕 **El tope del arrastre**: al mismo pendiente ponele «Hasta cuántos días después» en **2** y mirá
  que en el listado de **Rutinas** el renglón deje de decir *«queda hasta que se tilde»* y diga *«queda
  hasta 2 días después»*. Después dejalo pasar: al tercer día el renglón **y el badge** tienen que
  bajar solos, y en Cumplimiento esa ocurrencia tiene que seguir apareciendo sin hacer. ⚠️ El campo
  **sólo se dibuja si el ítem arrastra**: apagando el arrastre desaparece, que es lo correcto.
- 🆕 **El filtro de Cumplimiento con una persona SIN ocurrencias en la ventana.** Es lo único que
  ningún test alcanza: `useFiltroUrl` lee la URL y el entorno de vitest es `node`, así que en los
  tests el filtro siempre vale «todos». Tiene que decir *«Nada de esa persona cayó en estos días»*,
  ⛔ **no** *«todavía no hay ninguna ocurrencia»* — eso último sería mentira en una pantalla que sí
  las tiene.
- 🆕 **Los filtros de «Rutinas», después de un F5.** Filtrá por alguien, recargá, y tiene que volver
  **el filtro**. Y tipear en el buscador ⛔ no puede navegar (es `replaceState`).
- 🆕 **Las seis entradas del menú, con los DOS perfiles.** Con `agenda.cargar` se ven las seis; sin
  él, **tres** — y entrando a `/agenda/eventos` a mano tiene que caer en «Hoy», ⛔ no en blanco.
- 🆕 **El modal de una actividad, que es lo único del rediseño que ningún test monta** (necesita la
  sesión): abierto desde la tarjeta de un evento ⛔ no puede dibujar los días de la semana ni el
  tilde de arrastre, y sí «Cuándo va» y el eje. Abierto desde «+ Rutina», al revés.
- 🆕 **Semana y Mes, el `offset`.** Movete tres meses en Mes, pasá a Semana: tiene que arrancar en la
  semana de hoy, ⛔ no tres semanas adelante.
- 🆕 **El calendario, cuatro recorridos.** (1) Un mes **con muchas rutinas**: los días de rutina
  tienen que verse tranquilos y el día con algo excepcional tiene que saltar; abrí ese día y el
  detalle tiene que listar **todo** lo que la celda resumió. (2) Un **mes flaco**: que no se vea
  roto ni vacío de más. (3) **Un ítem mensual**: tiene que salir **nombrado**, ⛔ no adentro del
  contador. (4) **La semana**, y volver al mes: el `‹ ›` tiene que cambiar de unidad y **volver a
  hoy**, y el día abierto tiene que cerrarse. En el celular, dos columnas.
  ⚠️ Nada de esto lo alcanza un test: el selector es estado de React y `useFiltroUrl` no lee la URL
  en vitest.
- 🆕 🔴 **El techo tampoco se puede caminar con un admin ni con Bruno**, que son los dos que lo
  saltean: hace falta un usuario del padrón con `agenda.cargar` tildado, función `administracion` y
  **sin** `admin`. Con ése, ninguna rutina de Dirección puede aparecer en «Cargar», ni en
  «Cumplimiento», ni en el Mes; el selector de destino no puede ofrecer «Dirección» ni a Bruno o
  Darío por nombre; y **«a una persona» tiene que abrir sin pedir contraseña de administrador**, que
  es lo que hasta el 26-ago-2026 no andaba. Después entrá con Bruno: todo eso tiene que seguir
  visible y editable.
- 🔴 **El destino por persona no se puede caminar con un admin**, que es el caso que se agregó para
  arreglar: entrá con un usuario `prueba-*` del padrón, mirá que la rutina dirigida a él **sale en
  «Hoy» y prende el badge**, y con otro que no sale ni prende. Y con el admin, que el tilde ajeno
  devuelve 403.

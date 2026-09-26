# Chequeo de exhibición — ficha de sección

Sección `exhib`, área `local`, sólo Zattia. Caminar el Local con el lector confirmando que cada
prenda con stock está colgada, y de paso controlar el cartelito de papel contra el precio de hoy.

> ⛔ **«Por categoría» está OCULTO desde el 26-sep-2026.** Bruno: *«siento que no me sirve»*: la
> categoría de TN es de la tienda online y ⛔ no del salón. La pantalla abre siempre en el libre y el
> sector se declara por nombre de prenda en el balance. El código sigue en `Exhib.tsx` (sin
> botón para llegar), así que el hallazgo de `buscarItem` que se lleva la primera ya ⛔ no se alcanza
> desde la pantalla. Se pierden con él el **PDF con triage** y el aviso de **prendas con precio nuevo
> sin etiqueta** (`sospechososNoExhibidos`), que el libre ⛔ no tiene.

**Son DOS recorridos distintos**, no dos vistas del mismo:

| | **Por categoría** (el viejo) | **Libre por lugar** (19-sep-2026) |
|---|---|---|
| unidad de trabajo | una categoría de Tienda Nube | un mueble del salón («perchero tops») |
| dónde queda | **la base**, con la categoría recorrida (19-sep-2026) | **la base**, con el lugar de cada escaneo |
| qué contesta | qué quedó sin escanear, con triage y PDF | qué se escaneó en cada lugar **y qué falta colgar** |
| faltantes | los calcula sobre la categoría entera | **sólo los hermanos de lo que tocó** (ver abajo) |
| repetidos | **suman una unidad** (19-sep-2026) | **suman una unidad** (19-sep-2026) |

## Dónde vive

`components/exhib/` (`Exhib.tsx` 530 — el modo por categoría y el selector · `useExhib.ts` ·
`ExhibLibre.tsx` · `useExhibLibre.ts` · **`useColaEscaneos.ts` la cola que usan LOS DOS** ·
`ParaColgar.tsx` · **`BalanceSector.tsx`** el balance del sector) · **`lib/sonido.ts`** (el pitido/vibración/voz, compartido) · `lib/exhib/`
(**`aviso.ts`** qué se oye en cada final · **`balance.ts`** el mandado del depósito · `core.ts` puro y
compartido por los dos · `libre.ts` puro del libre · `colgar.ts` **qué falta colgar** ·
`datos.ts` la bajada · `cliente.ts` · `pdf.ts` · **`analisis.ts` el conteo del final** · `tipos.ts`) ·
`api/_exhib.js` por `api/datos.js?recurso=exhib` · tablas `exhib_recorrido` y `exhib_escaneo`
(`sql/migrate-exhib-libre.sql` + `sql/migrate-exhib-categoria.sql` + **`sql/migrate-exhib-cobertura.sql`
⏳ pendiente de correr**, **sólo en el Supabase de Zattia**) ·
`tests/exhib-core.test.ts` + `tests/exhib-libre.test.ts` + `tests/exhib-colgar.test.ts` +
`tests/exhib-analisis.test.ts` + **`tests/exhib-por-variante.test.ts`** (la regla de que una variante
⛔ no marca a sus hermanas, cruzando los cuatro módulos) + `tests/exhib-aviso.test.ts` +
`tests/exhib-balance.test.ts`.

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

- 🆕 🔑 **LA VELOCIDAD DEL ESCANEO ⛔ NO ES LA CUENTA, ES LO QUE SE DIBUJA** (20-sep-2026, lo
  preguntó Bruno antes de salir a caminar un sector entero). 📊 **Medido con los datos reales del
  Local**, con **400 escaneos** ya cargados: buscar el código entre las 2.188 del Local **0,02 ms**,
  guardar el borrador **0,4 ms** (132 KB), recalcular «falta colgar» **0,3 ms** ⇒ **0,4 ms el
  escaneo entero**, ~3 ms en un celular. Contra los **997 ms** del intervalo humano más corto que se
  midió, la cuenta ⛔ no se ve. ⇒ **optimizar la lógica acá sería trabajo desperdiciado.**
  🔴 **Lo que sí pesa es la LISTA de lo escaneado**, que se rearma en cada lectura: el sector entero
  son cientos de filas —cada una con su botón— redibujándose mientras la persona ya está pasando la
  prenda siguiente. Por eso se dibujan **las últimas 25** (`TOPE_FILAS`) con un «ver los N de este
  lugar» a mano, y al escanear se vuelve solo a la vista corta. ⚠️ **El contador de arriba sigue
  diciendo el total**: se dibuja menos, ⛔ no se esconde nada — y quien escanea sólo mira **la
  última**, para confirmar que enganchó.

- 🆕 🔴 **EL STOCK CONTRA EL QUE SE COMPARA ⛔ NO ES TIEMPO REAL, Y ESO SE DICE EN PANTALLA**
  (20-sep-2026). Lo preguntó Bruno: *«¿la comparación la hace en tiempo real? capaz que toma un
  sync viejo»*. El recorrido lee el **espejo** de Supabase, y el sync diario de Zattia corre **una
  vez por día, a las 06:00 UTC** (`sync-diario-zattia.yml`) — o sea las 3 de la mañana.
  📊 **Y el local vende ~160 unidades por día** (medido sobre las dos semanas al 19-sep-2026: 433 ·
  210 · 162 · 167 · 147 · 154; promedio 104 contando los días flojos). ⇒ un balance hecho a las 4 de
  la tarde contra la foto de las 3 AM **manda a buscar al depósito prendas que se vendieron a la
  mañana**, y ⛔ nada lo delataba: la lista salía con la misma cara de correcta.
  🔑 **Por eso el balance muestra SIEMPRE de cuándo es el stock** y ofrece «Cargar el stock de
  ahora» (el mismo `dispararSyncStock` del botón «Cargar de GN», 2-4 min). Arriba de **2 horas** el
  cartel se pone en alerta: a 160 u/día, dos horas de local abierto son unas 20 prendas que la foto
  ⛔ no conoce. ⚠️ **Y ⛔ no saber ⛔ no es estar al día**: si la consulta falla, avisa igual.
  ⚠️ **Se descartó congelar la foto al cerrar el recorrido** (opción A, 20-sep): obligaba a la
  empleada a esperar los 2-4 min del sync al finalizar. Bruno: *«desde que ella me avisa yo hago en
  el momento la comparación, no es que espere un par de días»* ⇒ con la brecha en minutos, cargar el
  stock al abrir el balance da la misma foto sin frenar a nadie. 🔴 **Si ese flujo cambia** —si los
  balances empiezan a hacerse al otro día— **esto vuelve a estar mal y hay que congelar**.

- 🆕 🔴 🔑 **EL BALANCE DEL SECTOR LO HACE UNA PERSONA, DESPUÉS, Y LA APP SÓLO PONE EL NÚMERO**
  (20-sep-2026, `lib/exhib/balance.ts`). «Para colgar» es la lista **siempre verdadera pero corta**
  —los hermanos de lo que el recorrido tocó—; el balance es el otro lado: *«caminé el sector ENTERO,
  decime todo lo que debería estar colgado acá»*.
  🔴 **Que un recorrido haya cubierto un sector es un hecho del salón que la app ⛔ no puede ver**:
  94 escaneos ⛔ no dicen si el sector tenía 94 prendas o 400. Afirmarlo sola es lo que dio los **20
  corsets faltantes falsos**. ⇒ la pantalla muestra **«pasaron por el lector 94 de las 400 que el
  sistema tiene en el local (24 %)»** y **tilda quien mira**. Un 24 % grita «caminó un perchero»; un
  95 % dice «caminó el sector».
  ⚠️ **Son DOS PERSONAS y DOS MOMENTOS, y así lo pidió Bruno**: *«no me parece erróneo que la
  empleada haga el escaneo completo del sector y luego me avise cuando esté listo; entonces yo hago
  el balance y le paso el reporte de qué falta buscar en depósito»*. La empleada ⛔ no decide nada —
  ⛔ no se le agrega un solo paso—, y la declaración se guarda **firmada por el servidor** con la
  sesión de quien la hizo (`exhib_recorrido.cobertura`, `sql/migrate-exhib-cobertura.sql`).
  🔑 **«Lo que falta» tiene una dirección concreta: el DEPÓSITO DEL LOCAL.** En GN el Local es **una
  sola ubicación** que junta el salón y el depósito del local (por eso el Conteo estándar cuenta
  *exhibido + depósito*) ⇒ **stock en Local − lo que pasó por el lector = lo que tiene que estar
  guardado ahí**, y si tampoco está, es un problema de stock. ⛔ No es un reproche: es un mandado.
  🔑 **Las vistas se miran del recorrido ENTERO y ⛔ no del lugar**: un top que apareció en la
  vidriera y se escaneó **está colgado** y ⛔ no se va a buscar al depósito.
  ⚠️ **El bolsón se explica, ⛔ no se esconde**: cada línea dice en qué otra categoría está («CORSET
  BERNA · también está en CORSETS»). Medido el 20-sep: declarando TOPS Y BODIES, **85 de los 306
  renglones** traen una categoría de afuera. Una línea que parece un error le quita autoridad a las
  otras cincuenta que están bien.
  🔴 **Y lo que el balance ⛔ NO puede juzgar se dice SIEMPRE**: las prendas sin categoría en TN ⛔ no
  entran en ningún universo —ni como presentes ni como faltantes—. Medido: **297 variantes / 95
  productos** del Local, de los cuales **36 son de Stunned**, que tiene su propia tienda y nunca va a
  cruzar. Callarlas haría leer el mandado como completo cuando ⛔ no lo es.

- 🆕 🔴 🔑 **EL RECORRIDO SE CAMINA DE OÍDO, Y SON DOS AVISOS** (20-sep-2026). Quien camina tiene el
  lector en una mano y la prenda en la otra: mirar la pantalla después de cada lectura es lo que
  hace lento el recorrido. Bruno, al final del día: *«necesito que esta chica sólo escanee: si
  detecta un producto que diga el número de escaneo, y si no, que le diga que vuelva a escanear
  porque no lo detectó; lo repetido y demás entra en el balance»*.
  - **La detectó** → pitido corto + **el número del recorrido**, que crece. **Si sube, entró.**
  - **⛔ No la detectó** → pitido grave + **«de nuevo»**: la única acción posible con la prenda
    todavía en la mano.
  🔴 **Todo lo demás se sacó del oído A PROPÓSITO, y ésa es la decisión.** La prenda repetida, la que
  el sistema tiene en cero y el código que engancha a dos **suenan igual que un escaneo bueno**: son
  hallazgos **del balance**, que mira quien decide con la pantalla delante. Cantárselos a quien
  camina le pedía entender —y recordar— cuatro palabras para cosas sobre las que ⛔ no puede hacer
  nada en ese momento. ⚠️ **Los carteles de la pantalla ⛔ no se tocaron**: el que mira, ve; el que
  camina, oye dos cosas. (Antes hubo cinco avisos distintos; duraron unas horas.)
  🔴 **El número que se canta es el AVANCE del recorrido** y ⛔ no cuántas van de esa prenda: *«cuando
  sabés que te dijo un número creciente, significa que escaneó bien»* ⇒ tiene que subir **siempre**,
  también con el repetido, que es otra unidad colgada. ⚠️ Antes se cantaba «uno» en cada prenda
  nueva: con un sector de 400 son 400 veces «uno», y la palabra dejaba de significar nada.
  ⚠️ `avanceDelRecorrido` cuenta **unidades que pasaron por el lector** (un triage ⛔ no vio nada) y
  se lee de la **ref de la cola**, ⛔ no del estado de React: `registrar` acaba de escribir y el
  estado todavía ⛔ no se re-dibujó — de ahí saldría el número de la prenda **anterior**, cantado
  sobre la que la persona tiene en la mano.
  🔑 `enPalabras` llega hasta **999** por el tamaño real de un sector (Tops son 400 variantes), y
  canta en español: la voz del navegador lee «47» según la voz instalada, y en inglés si la de
  español ⛔ no está.
  🔑 **La decisión está separada de lo que suena**: `lib/exhib/aviso.ts` (puro, con test) dice qué
  aviso le toca a cada final y `lib/sonido.ts` lo toca. Los **dos modos** usan el mismo mapa.
  🔴 **La voz cancela a la anterior antes de hablar.** El lector dispara cada ~1,5 s y hablar tarda
  ~0,5 s: encolando, a los diez escaneos estaría cantando el número de hace quince segundos, sobre
  la prenda que la persona tiene en la mano **ahora**. Gana siempre el último.
  ⚠️ **El audio del navegador arranca BLOQUEADO** hasta un toque de verdad, y el Enter del lector ⛔
  no siempre alcanza: por eso «Iniciar recorrido» y «Retomar» lo destraban, y el **«listo»** que se
  oye al empezar ⛔ no es un adorno —hablar dentro del toque es lo que destraba la voz en iPhone, y
  es la prueba de que el teléfono ⛔ no está en silencio—.
  🔑 **Y por eso hay «Escuchar los avisos»** en la pantalla de configurar: esto sirve sólo si se
  reconocen **de oído**. ⛔ **Nada de esto se puede probar con un test**: el mapa sí
  (`tests/exhib-aviso.test.ts`), el parlante ⛔ no.

- 🆕 🔴 🔑 **EL BALANCE DEL SECTOR LO HACE UNA PERSONA, DESPUÉS, Y LA APP SÓLO PONE EL NÚMERO**
  (20-sep-2026, `lib/exhib/balance.ts`). «Para colgar» es la lista **siempre verdadera pero corta**
  —los hermanos de lo que el recorrido tocó—; el balance es el otro lado: *«caminé el sector ENTERO,
  decime todo lo que debería estar colgado acá»*.
  🔴 **Que un recorrido haya cubierto un sector es un hecho del salón que la app ⛔ no puede ver**:
  94 escaneos ⛔ no dicen si el sector tenía 94 prendas o 400. Afirmarlo sola es lo que dio los **20
  corsets faltantes falsos**. ⇒ la pantalla muestra **«pasaron por el lector 94 de las 400 que el
  sistema tiene en el local (24 %)»** y **tilda quien mira**. Un 24 % grita «caminó un perchero»; un
  95 % dice «caminó el sector».
  ⚠️ **Son DOS PERSONAS y DOS MOMENTOS, y así lo pidió Bruno**: *«no me parece erróneo que la
  empleada haga el escaneo completo del sector y luego me avise cuando esté listo; entonces yo hago
  el balance y le paso el reporte de qué falta buscar en depósito»*. La empleada ⛔ no decide nada —
  ⛔ no se le agrega un solo paso—, y la declaración se guarda **firmada por el servidor** con la
  sesión de quien la hizo (`exhib_recorrido.cobertura`, `sql/migrate-exhib-cobertura.sql`).
  🔑 **«Lo que falta» tiene una dirección concreta: el DEPÓSITO DEL LOCAL.** En GN el Local es **una
  sola ubicación** que junta el salón y el depósito del local (por eso el Conteo estándar cuenta
  *exhibido + depósito*) ⇒ **stock en Local − lo que pasó por el lector = lo que tiene que estar
  guardado ahí**, y si tampoco está, es un problema de stock. ⛔ No es un reproche: es un mandado.
  🔑 **Las vistas se miran del recorrido ENTERO y ⛔ no del lugar**: un top que apareció en la
  vidriera y se escaneó **está colgado** y ⛔ no se va a buscar al depósito.
  ⚠️ **El bolsón se explica, ⛔ no se esconde**: cada línea dice en qué otra categoría está («CORSET
  BERNA · también está en CORSETS»). Medido el 20-sep: declarando TOPS Y BODIES, **85 de los 306
  renglones** traen una categoría de afuera. Una línea que parece un error le quita autoridad a las
  otras cincuenta que están bien.
  🔴 **Y lo que el balance ⛔ NO puede juzgar se dice SIEMPRE**: las prendas sin categoría en TN ⛔ no
  entran en ningún universo —ni como presentes ni como faltantes—. Medido: **297 variantes / 95
  productos** del Local, de los cuales **36 son de Stunned**, que tiene su propia tienda y nunca va a
  cruzar. Callarlas haría leer el mandado como completo cuando ⛔ no lo es.

- 🆕 🔴 🔑 **EL RECORRIDO SE CAMINA DE OÍDO** (20-sep-2026, lo pidió Bruno: *«que haga el pitido y
  además diga uno, para que la persona tenga el celular cerca pero no esté viéndolo
  constantemente»*). Cada escaneo **pita, vibra y dice una palabra**: quien camina tiene el lector
  en una mano y la prenda en la otra, y mirar la pantalla después de cada lectura es lo que hace
  lento el recorrido.
  🔴 **EL NÚMERO QUE SE CANTA ES EL AVANCE DEL RECORRIDO** (20-sep-2026, a la noche), ⛔ no cuántas
  unidades van de esa prenda: *«me interesa para saber que se escaneó correctamente sin necesidad de
  ver el celular: cuando sabés que te dijo un número creciente, significa que escaneó bien»* (Bruno)
  ⇒ **el número que sube ES la confirmación**, y por eso tiene que subir **siempre** —el repetido
  también, que es otra unidad colgada—; lo que lo distingue es el **pitido doble**, ⛔ no la palabra.
  ⚠️ **Antes se cantaba «uno» en cada prenda nueva**: con un sector de 400, eso son 400 veces «uno»,
  la palabra dejaba de significar nada y la voz perdía la atención justo cuando tenía algo que decir.
  ⚠️ `avanceDelRecorrido` cuenta **unidades que pasaron por el lector** (un triage ⛔ no vio nada), y
  se lee de la **ref de la cola** y ⛔ no del estado de React: `registrar` acaba de escribir y el
  estado todavía ⛔ no se re-dibujó — de ahí saldría el número de la prenda **anterior**, cantado
  sobre la que la persona tiene en la mano.
  🔑 `enPalabras` llega hasta **999** por el tamaño real de un sector (Tops son 400 variantes).
  🔴 **Los tonos ⛔ no son decoración: son el mensaje, y lo que EXIGE mirar suena distinto de lo que
  anduvo.** Si «anduvo» y «elegí cuál es» se parecen, la persona sigue caminando y **deja atrás la
  prenda sin resolver** —y ese escaneo se guarda solo como «no cruzó»—. Son cinco: agudo corto = **el
  número** · dos agudos = el número (el repetido que sumó) · medio largo = *en cero* · grave = *no figura*
  · **dos tonos que SUBEN** = *elegí cuál* / *otra categoría*, los únicos que piden la vista.
  🔑 **La decisión está separada de lo que suena**: `lib/exhib/aviso.ts` (puro, con test) dice qué
  aviso le toca a cada final y `lib/sonido.ts` lo toca. Los **dos modos** usan el mismo mapa: el
  mismo escaneo ⛔ no puede sonar distinto según por qué pantalla se entró.
  ⚠️ **Los números se cantan, ⛔ no se leen** («dos», no «2»): la voz del navegador lee los dígitos
  distinto según la voz instalada, y en inglés si la de español ⛔ no está.
  🔴 **La voz cancela a la anterior antes de hablar.** El lector dispara cada ~1,5 s y hablar tarda
  ~0,5 s: encolando, a los diez escaneos estaría cantando el número de hace quince segundos, sobre
  la prenda que la persona tiene en la mano **ahora**. Gana siempre el último.
  ⚠️ **El audio del navegador arranca BLOQUEADO** hasta un toque de verdad, y el Enter del lector ⛔
  no siempre alcanza: por eso «Iniciar recorrido» y «Retomar» lo destraban, y el **«listo»** que se
  oye al empezar ⛔ no es un adorno —hablar dentro del toque es lo que destraba la voz en iPhone, y
  es la prueba de que el teléfono ⛔ no está en silencio—.
  🔑 **Y por eso hay «Escuchar los avisos»** en la pantalla de configurar: esto sirve sólo si se
  reconocen **de oído**, y leer en la pantalla que «el grave es no figura» ⛔ no sirve parado en el
  salón. ⛔ **Nada de esto se puede probar con un test**: el mapa sí (`tests/exhib-aviso.test.ts`),
  el parlante ⛔ no.

- 🆕 🔴 🔑 **EL CHEQUEO ES POR VARIANTE: marcar una ⛔ NO marca a sus hermanas** (20-sep-2026, lo
  pidió Bruno antes de salir a caminar el local). ⛔ No es el caso raro: **285 de los 467 productos**
  del Local tienen más de una variante con stock, y en Zattia **el color viaja en el talle** —TOP
  ORSA es Chocolate, Beige y Negro como tres `size_name` del mismo `product_id`—.
  📊 **Medido contra producción, ⛔ no estimado** (20-sep-2026, las **2.188** filas del Local):
  **cero colisiones de `exhibId`**, cero códigos de barras repetidos, y de las 8 sin código de
  barras, ninguna repite producto+talle ⇒ hoy **ninguna variante puede confundirse con otra**.
  📊 Y ya pasó en el salón: el recorrido real `ex1789825143664_abbjt3` dio **97 escaneos ⇒ 97
  variantes distintas sobre 67 productos**, con **24 productos escaneados en varias variantes por
  separado, cada una con su hora** (TOP ORSA Chocolate 10:42:17 · Beige 10:42:26 · Negro 10:46:58).
  🔴 **La regla cruza los cuatro módulos** —el id (`exhibId`), la clave de la cola y del único de la
  base (`claveEscaneo`), lo que falta colgar y el conteo— y por eso su test está **aparte**, en
  `tests/exhib-por-variante.test.ts`: ejercida por pedazos, el pedazo que se rompe es el del módulo
  que nadie tocó. Verificado que muerde: rompiendo `exhibId` a propósito, **10 de sus 14 casos
  fallan**. ⚠️ **Los dos caminos por los que se rompería** son el SKU compartido (arriba) y una
  variante **sin código de barras** cuyo talle repita el de una hermana.

- 🆕 🔴 🔑 **EL RECORRIDO CUENTA UNIDADES, Y POR ESO SON DOS PREGUNTAS Y ⛔ NO UNA** (19-sep-2026).
  Hasta esa tarde el repetido **rebotaba** —el único de la base es (recorrido, lugar, variante)—
  así que dos prendas iguales colgadas contaban como **una**: el recorrido contestaba «apareció / ⛔
  no apareció» y ⛔ nunca **cuántas**. Bruno: *«que te permita escanear todo aunque vaya repetido…
  que se pueda anotar que hay dos repetidos, pero te deje»*.
  - **Qué falta colgar** (`colgar.ts`) = variantes de las que ⛔ **no se vio ninguna**. Es un
    **mandado**: alguien va al guardado con esa lista.
  - **El conteo** (`analisis.ts`) = de las que sí se vieron, cuántas hay contra lo que dice el
    sistema. Es un **dato**.
  🔴 **Mezclarlas rompe la útil.** Una línea «vi 1 y el sistema dice 5» en la lista de colgar manda
  al local a buscar algo **que ya está colgado** —las otras 4 pueden estar dobladas, y está bien que
  lo estén—, y una sola línea así quema la lista entera. El test que lo cuida está en
  `tests/exhib-colgar.test.ts`: las variantes **vistas** ⛔ no entran en `paraColgar`.
  ⚠️ **La fila sigue siendo UNA por (recorrido, lugar, variante)**: lo que sube es un contador
  (`veces`). Un log de un evento por escaneo habría hecho que **el rebote del lector sea una prenda
  más**.
- 🆕 🔴 **600 ms: el corte entre «hay dos colgadas» y «el aparato disparó dos veces».** 📊 Medido
  sobre los **166 escaneos reales** de los dos recorridos del 19-sep: el intervalo humano más corto
  fue **997 ms** y sólo 9 de 164 bajaron de 2 s. El lector entra como teclado y puede repetir el
  Enter solo, en decenas de ms. ⚠️ Vale **sólo para el mismo código**, y el descarte **se dice en
  pantalla**: callarlo sería inventar —o perder— una unidad.

- 🆕 🔴 🔑 **DECLARAR UN TIPO QUE EL RECORRIDO ⛔ NO CAMINÓ SE AVISA EN LA CARA** (22-sep-2026,
  `COBERTURA_FIABLE` + `declaracionesFlojas`). 📊 **Costó una vuelta al pedo en el salón**: el
  21-sep se declaró TOP con **78 %** caminado, el mandado salió con **55 tops** que nunca habían
  pasado por el lector y la chica volvió del depósito diciendo que **muchos ⛔ no estaban** —estaban
  colgados en otro mueble—. Bruno: *«no es tan fiable el chequeo y necesito que sea fiable, porque
  sino me hace trabajar de más»*.
  🔑 **El número YA estaba en pantalla.** Lo que faltaba era **la consecuencia**, dicha **arriba del
  mandado y ⛔ no al costado**: un «78 %» en un renglón de una lista de doce ⛔ no se lee como «este
  mandado va a pedir 55 prendas que están colgadas». Ahora dice, tipo por tipo, **cuántas prendas
  con stock ⛔ no pasaron por el lector** y que pueden estar en otro mueble.
  ⚠️ **Avisa y ⛔ no bloquea**, a propósito: la regla de la sección es que la app pone el número y la
  persona decide, y puede haber razones para declarar al 80 %. Lo que ⛔ no puede volver a pasar es
  declarar al 78 % **sin enterarse**.
  📌 El corte es **90 %** (`COBERTURA_FIABLE`). Abajo de eso, «⛔ no pasó por el lector» ⛔ no quiere
  decir «⛔ no está colgado»: quiere decir que **nadie lo miró**.
  📊 Medido sobre los 6 recorridos que existen (779 filas, 812 unidades): **6 lecturas fallidas,
  0,8 %**, y ⛔ ninguna se perdió en la subida. **El lector mide bien; lo que fallaba era la
  inferencia.**

- 🆕 🔴 🔑 **«¿DOS PRENDAS COLGADAS, O LA MISMA PASADA DOS VECES?» — LO DECIDE QUÉ SE ESCANEÓ EN EL
  MEDIO** (21-sep-2026, `otrasEnMedio` en `colgadasDeMas` + `horas` en `libre.ts` +
  `sql/migrate-exhib-horas.sql`). Bruno, mirando las 23 colgadas de más: *«¿estás seguro que esos
  productos están duplicados?»*. **La respuesta honesta era NO**: el dato prueba que el lector leyó
  el mismo código dos veces, ⛔ no que hubiera dos prendas.
  🔴 **El hueco de tiempo ⛔ no alcanza** —desenganchar una prenda puede llevar diez segundos—;
  **lo que ⛔ no admite otra explicación es el trabajo hecho en el medio**. 📊 Medido sobre el
  recorrido real: entre las dos lecturas de TOP MOVE blanco pasaron **43 prendas distintas** ⇒ ⛔ no
  puede ser la misma percha. **20 de 23 tenían otras lecturas en el medio; 3 entraron pegadas**
  (CAMISA ALESSA S off white 8 s, CAMISA ALTHEA M blanco 3 s, VESTIDO AIXA rojo 12 s).
  🔑 **Y por qué una lectura de más puede colarse sin que nadie se entere**: si quien camina ⛔ no
  escucha el pitido, vuelve a pasar la prenda — y **el repetido suena igual que un escaneo bueno**,
  que es una decisión tomada a propósito (`aviso.ts`) ⇒ oye un número más grande y se queda
  tranquila. ⚠️ **La prevención más barata ⛔ no es software**: decirle *«si ⛔ no escuchaste el
  pitido, ⛔ no la pases de nuevo — mirá la pantalla, que muestra la última»*.
  🔑 **Se dice en el renglón, ⛔ no se calla**: las que tienen prendas en el medio salen con «son
  dos distintas» y las pegadas con «⚠ confirmalo mirando el perchero». Presentar las 23 con la
  misma certeza es lo que hace que **la primera que resulte falsa se lleve puestas a las otras 22**.
  📌 **`horas` guarda la hora de CADA lectura** y ⛔ no sólo la primera y la última: de una prenda
  leída 3 veces, la del medio ⛔ no existía en ningún lado. ⚠️ **La cuenta anda igual sin la
  columna** (`horasDe` cae a `escaneado_en`/`ultimo_en`), que es exacta para `veces = 2` — por eso
  las 23 del 21-sep ya salen marcadas sin haber corrido nada.
  🔴 **`veces`, `ultimo_en` y `horas` se mueven JUNTOS** (`sumarUna`): son tres vistas del mismo
  hecho, y si una se actualizara sola el aviso hablaría de una prenda distinta de la que el
  contador cuenta.
  ⛔ **Y esto ⛔ NO convierte la tabla en un log de eventos**: la fila sigue siendo una por
  (recorrido, lugar, variante). Esa otra forma haría que **el rebote del lector sea una prenda más**.
  🔴 **PUENTE HASTA QUE LA MIGRACIÓN ESTÉ CORRIDA** (`api/_exhib.js`, con test): el SQL se corre a
  mano en el Supabase de Zattia, así que entre el deploy y esa consulta hay una ventana — y **una
  columna desconocida hace fallar el upsert ENTERO**, que ⛔ no es un renglón perdido: la cola deja
  todo en «sin subir», reintenta para siempre y **cerrar con pendientes está prohibido** ⇒ quien
  camina ⛔ no puede cerrar el recorrido. Es el pozo del 19-sep otra vez, y ⛔ no se paga por un
  dato de diagnóstico. ⏳ **El puente se saca cuando la migración esté verificada.**

- 🆕 🔴 🔑 **LA OTRA MITAD DEL BALANCE: LO QUE SOBRA EN EL SALÓN** (21-sep-2026, `colgadasDeMas` +
  `partirRepetidas` en `balance.ts`). Bruno, cerrando el día: *«el espacio del local es chico, por
  eso me interesa optimizar mucho eso»*. **El mandado trae del depósito lo que falta; esto manda al
  depósito lo que está colgado dos veces.**
  📊 **Medido en el primer recorrido de sector entero: 23 prendas colgadas de más, 24 perchas**
  sobre 413 unidades exhibidas — **casi el 6 % del sector**. La peor, CAMISA ALESSA S off white
  colgada **3 veces**. Por modelo: CAMISA ALTHEA ocupaba **8 perchas** y TOP ORSA **7**.
  🔑 **Está colgada dos veces de DOS formas y las dos cuentan**: dos unidades del mismo color y
  talle en el mismo mueble (el contador `veces`, que existe desde el 19-sep) **o la misma prenda en
  dos muebles distintos** —el perchero y la vidriera—, que son dos filas. ⚠️ La segunda ⛔ no se
  pudo ver el 21-sep porque se caminó **un solo lugar**, y es la que más va a aparecer cuando se
  caminen varios.
  🔴 **La app ⛔ NO decide: pregunta.** Dos unidades colgadas pueden ser **exhibición a propósito**
  —una prenda que se quiere ver de los dos lados del salón— o **espacio desperdiciado**, y eso lo
  sabe quien arma el salón. Es la misma regla que la cobertura del sector: la app pone el número.
  Las opciones son dos: «está bien que estén las dos» y «sacar la de más al depósito», y lo sacado
  baja en su propio Excel.
  🔑 **Va en la MISMA vista del balance, y así lo pidió**: *«necesito lo mismo, en la misma vista
  del chequeo, así como elijo que también quiero elegir acá»*. Quien mira el recorrido ya tiene el
  salón en la cabeza; decidir «falta» y «sobra» en dos momentos distintos es releer la misma lista
  dos veces. ⚠️ Y **⛔ no depende de los tipos declarados**, a diferencia del mandado: que una
  prenda esté colgada dos veces es un **hecho del recorrido**, ⛔ no una afirmación sobre un sector.
  ⚠️ **Acá el número de unidades SÍ va y ⛔ no contradice la regla del mandado**: allá era el stock
  del sistema —que ⛔ no cambia la tarea de colgar una—; acá es **cuántas sacar**, que es la tarea.
  📌 **Las dos mitades entran por el MISMO verbo del handler** (`MARCAS` en `api/_exhib.js`): es el
  mismo guardado con otro nombre de lista, y dos copias se despegan a la tercera vez que se toca
  una. 🔴 **Y las dos listas conviven sin pisarse** (test en `exhib-handler`): si decidir un
  repetido borrara los motivos de lo tachado, del otro lado se vería como un mandado que creció solo.
  ⚠️ El rebote del lector ⛔ no entra: las dos lecturas de menos de 600 ms se descartan en el
  teléfono. Medido el 21-sep, las 23 reales están separadas entre **3 segundos y 6 minutos**.

- 🆕 🔴 🔑 **UNA PRENDA DEL MANDADO SE PUEDE TACHAR, Y CON MOTIVO** (21-sep-2026, `partirTachadas` +
  `MotivoTachada` en `balance.ts`, acción `tachar` en `api/_exhib.js`). Salió del primer mandado
  real: Bruno lo leyó prenda por prenda y sacó **22 de las 104** por dos razones que ⛔ no son
  excusas sueltas —**son dos cosas que pasan todas las veces**—:
  - **`otro-lugar`** · *«overlay sacalas, porque están exhibidas en el perchero de los sweaters»*.
    La app ya sabe esto **adentro** de un recorrido —un top que aparece en la vidriera y se escanea
    cuenta como colgado— pero ⛔ no puede saber nada de un sector que nadie caminó.
  - **`despues`** · *«fueron productos nuevos que entraron el sábado y los exhibieron luego del
    escaneo»*. **El recorrido es una foto de un momento** y el balance se hace horas más tarde; en
    el medio el local trabaja. ⛔ No es el error de nadie.
  🔑 **Se guarda el MOTIVO y ⛔ no sólo el tachón, y ése es todo el punto.** Acumulados contestan
  preguntas que hoy ⛔ nadie puede contestar: muchas «en otro lugar» quieren decir que **el sector ⛔
  no está donde el sistema cree**; muchas «se colgó después», que **el balance se hace demasiado
  tarde**. Por eso el motivo se **valida contra la lista** en el servidor: uno escrito libre ⛔ no se
  puede contar.
  🔑 **Lo tachado se MUDA, ⛔ no desaparece**: sigue abajo, tachado, con su motivo y quién lo sacó, y
  con «volver a ponerla». Quien mira tiene que poder ver **por qué el número bajó de 104 a 82** — una
  lista que cambia sola es una lista que se deja de mirar.
  📌 **Vive adentro de `cobertura` y ⛔ no en una columna nueva**: es la misma afirmación de quien
  hizo el balance, y así ⛔ no hace falta una migración para algo que nació el mismo día que su
  pantalla. 🔴 **El servidor CONSERVA las tachaduras al guardar la declaración** (test
  `exhib-handler`): pisarlas haría que tildar un tipo más borre veinte motivos sin avisar, y del
  otro lado eso se ve como **un mandado que creció solo**.
  ⚠️ **Es leer-modificar-escribir**, así que dos personas tachando el MISMO recorrido a la vez se
  pisan. Se banca porque el balance lo hace **una** persona con la pantalla delante —la sección está
  diseñada así, dos personas y dos momentos— y lo que se pierde es un tachón que se vuelve a dar.
  ⛔ No valdría para los escaneos, que van por su camino con su único en la base.
  ⚠️ **Dos toques y ⛔ ningún menú flotante**: el motivo se elige en el renglón de la prenda. Con 82
  renglones, un modal por prenda es la razón por la que nadie tacha nada y la lista termina
  corregida a mano en un papel.

- 🆕 🔴 🔑 **UN SECTOR SE DECLARA POR TIPO DE PRENDA, ⛔ NO POR CATEGORÍA DE TIENDA NUBE**
  (21-sep-2026, `tipoDePrenda` en `core.ts` + `coberturaPorTipo`/`buscarPorTipo` en `balance.ts`).
  Bruno: *«todos los productos que arranquen con ese nombre y que tengan stock en local deberían
  estar colgados y contra esos productos debería ser la comparación»*, y antes: *«mi necesidad
  principal del chequeo de exhibición es la comparación con el stock del local; lo de Tienda Nube es
  un extra que sirve, pero no es lo que yo busco, porque es otro sector el que revisa eso»*.
  🔑 **El motivo ⛔ no es de gusto: el nombre y el stock salen los DOS de Gestión Nube.** La cuenta
  que le importa al que manda al depósito deja de depender de que Tienda Nube esté bien cargada.
  🔴 **Lo que se rompió por comparar contra TN**, medido sobre el primer recorrido de sector entero
  (21-sep, 415 unidades en 36 min):
  - El catálogo tiene **pares de nombres casi iguales** —`BLUSAS Y CAMISAS` (15 prendas) al lado de
    `BLUSAS` (66), `VESTIDOS` (9) al lado de `VESTIDOS Y MONOS` (31)—; la lista se ordenaba **por
    porcentaje cubierto**, las chiquitas daban **100 %** y quedaban **arriba de todo**. Se tildaron
    esas dos y **el mandado dio CERO**, que se lee como «no falta nada». Lo declarado explicaba
    **24 de los 389 escaneos (6 %)**.
  - **168 prendas con stock ⛔ no tienen categoría en TN** y eran invisibles para cualquier
    declaración. **Por nombre, todas entran en algún tipo** ⇒ el cartel de «sin categoría» se pudo
    sacar, porque ⛔ ya no hay nada que el balance no pueda juzgar.
  🔴 **EL ORDEN ES POR LO QUE PASÓ POR EL LECTOR, ⛔ no por porcentaje** — es el arreglo de ese
  error, ⛔ no un detalle: un tipo chico escaneado entero siempre va a dar 100 %. Hoy la pantalla
  abre con `TOP 199 de 257 · BLUSA 58 de 66 · VESTIDO 26 de 30 · CAMISA 25 de 30 · BABY TEE 21 de 26
  …` y los escaneos sueltos (una pollera, un strapless) quedan al final.
  🔑 **Y un mandado vacío ⛔ ya no puede mentir**: `tocadoSinDeclarar` cuenta lo caminado que queda
  fuera de lo declarado y la pantalla lo dice. Con la declaración equivocada de ese día habría
  avisado **«tocaste 326 prendas de tipos que ⛔ no marcaste»**.
  ⚠️ **BABY TEE son dos palabras** (`TIPOS_COMPUESTOS`, 303 productos), y **MINI BAG también** —
  ese lo encontró el salón el 22-sep: el mandado pedía colgar «MINI BAG DISTRICT Cherry» en un
  perchero de faldas, y **son carteras**. Eran 3 de las 75 con stock y bajaban la cobertura de MINI.
  🔑 **Así se descubre un compuesto nuevo**: alguien lee el mandado y ve una prenda que ⛔ no es del
  sector. La lista se agranda de a una, con el caso real al lado. ⛔ **No se adivina cuál es
  compuesto**: «si la primera palabra siempre viene seguida de la misma segunda» convierte en
  compuesto a todo tipo de **un solo producto** —SAQUITO VENECIA, MONO TIARE— y el desplegable se
  llena de modelos. Medido: 76 palabras iniciales en 2.819 productos, y sólo 4 compuestas.
  ⚠️ **Las erratas del catálogo ⛔ no se corrigen**: `CHOCKER` (99) y `CHOKER` (6) conviven, `COPRIÑO`
  es `CORPIÑO` mal escrito. Juntarlos sería inventar un dato que la base ⛔ no tiene; aparecen como
  dos renglones con su cuenta —que es como se descubren— y el aviso de arriba cuida el olvido.
  📌 **`cobertura.tipos` es el campo vigente y `cats` el viejo**: las declaraciones guardadas ⛔ no se
  borran, una lista que mandó a mover mercadería tiene que poder leerse dentro de un año tal como se
  hizo. 📌 **La columna «También está en» se cae sola** (`filasBuscar`): existía para explicar el
  bolsón de TN, y declarando por nombre ⛔ no hay nada que explicar.
  🔴 **Y SE CUENTA EN PRENDAS, ⛔ NO EN UNIDADES.** Bruno, mirando el primer mandado: *«todos los
  productos que tienen stock en local deberían estar exhibidos, no sé por qué me dice la cantidad
  total que hay del producto… no me tiene que decir son 309 items o algo así, porque no me interesa
  el stock del local, me interesa que se exhiba»*. La tarea es **colgar UNA** de cada color/talle
  que ⛔ no está colgado; que el sistema tenga 8 en el depósito ⛔ no la cambia, y el número
  invitaba a traer las 8. ⇒ se fueron **las unidades del título, de cada renglón y del Excel**, y
  el orden del mandado pasó de «el que tiene más stock» a **por nombre**, que junta los colores de
  la misma prenda —como se busca en el depósito—. Cada renglón es una prenda a colgar y **la cuenta
  es la cantidad de renglones**.
  📊 **El mandado real del 21-sep**, declarando los 10 tipos que Bruno pidió: **faltan exhibir 104
  prendas, de 65 modelos distintos**. Por tipo: TOP 58 · BLUSA 8 · CORSET 7 · REMERA 7 · CAMISA 5 ·
  BABY TEE 5 · BODY 5 · VESTIDO 4 · MUSCULOSA 4 · PANTALON 1.

- 🆕 🔴 🔑 **STUNNED ⛔ NO SE CHEQUEA ACÁ** (21-sep-2026, `seChequea` en `core.ts`). Bruno, mirando el
  primer recorrido de sector entero: *«hay que sacar stunned»*. Comparte el Gestión Nube, la base y
  el Local de Zattia —lo único que la separa es el prefijo de SKU (`lib/lineas.core.js`)— pero es
  **otra tienda, la revisa otro sector y ya tiene su propia pantalla**, el Conteo estándar de Stunned.
  📊 **Medido**: **117 variantes / 238 unidades / 36 productos** con stock en el Local, **todas buzos
  (46) y remeras (71)**.
  🔑 **Sale del UNIVERSO (`items`), ⛔ no del catálogo del lector (`buscables`).** Si alguien escanea
  un buzo de Stunned el teléfono lo reconoce y canta el número; lo que ⛔ no hace es contar. Sacarlo
  de `buscables` lo dejaría sonando **«de nuevo»** y la persona reescanearía hasta rendirse — el
  mismo pozo que las prendas en cero antes del 19-sep.
  ⚠️ **Por categoría de TN ya estaban medio afuera, pero por accidente**: Stunned tiene su propia
  Tienda Nube, ⛔ no cruza, y sus 117 caían enteras en «(Sin categoría)». ⛔ No entraban en el
  mandado, pero **sí inflaban lo que se lee**: el universo (1.066 → **949** variantes, 3.013 →
  **2.775** unidades) y el cartel de las sin categoría sin ver (285 → **168**). El día que alguien
  le ponga categorías a Stunned en TN, entran solas y nada avisa.
  🔴 **Y por NOMBRE DE PRENDA —que es como Bruno mira el salón— ensucian de entrada**: de las 81
  remeras con stock del Local **71 son de Stunned** ⇒ un recorrido que caminó las remeras de Zattia
  se lee «3 de 81» y manda a buscar **78 remeras ajenas**.
  ⚠️ **`enCero` se cuenta aparte y ⛔ no como `buscables.length - items.length`**: esa resta sumaría
  las 117 de Stunned al cartel de las en cero.

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
  🔴 **EL PANEL DE CANDIDATOS SE SACÓ DEL SALÓN** (20-sep-2026, a la noche). Le preguntaba «¿cuál de
  éstas es?» a **quien tiene el lector en la mano**, que es justamente quien ⛔ no puede pararse a
  decidir: *«yo ⛔ no la frenaría a la chica que escanea; luego prefiero hacer el balance yo mismo»*
  (Bruno). Ahora el código que ⛔ no engancha a UNA sola prenda **se guarda sin identificar** con su
  código crudo, y la voz dice **«de nuevo»** con el tono que pide atención —⛔ no el de error—:
  enganchar a varias casi siempre es una **lectura cortada**, y lo único accionable con la prenda
  todavía en la mano es volver a pasarla.
  ⚠️ **Y ⛔ no se elige la primera**, que sería marcar la prenda equivocada en silencio: para eso
  existe `coincidencias`.
  🔑 **La pregunta ⛔ no desapareció: se mudó a donde mira el que decide.** La vista del recorrido
  lista los códigos sin identificar **con a qué prendas se parecen** (`candidatosPorCodigo` sobre
  `buscables`). Sin eso, «⛔ no frenarla» sería perder el dato en silencio. ⚠️ Es informativo: dice
  qué **podía** ser, ⛔ no lo reasigna — ▶️ reasignar es el pendiente si aparece seguido.
  🔴 **Y un match EXACTO también pregunta cuando engancha más de una** (`coincidencias`): **7 grupos
  / 18 variantes con stock comparten SKU** (medido el 20-sep-2026; `4008` es TOP MIA BLANCO **y**
  CHOCOLATE, `areben` son 6 variantes de AYLA). Con el lector ⛔ no pasa —los barcodes son distintos,
  y de 97 escaneos reales los 97 engancharon por barcode— pero **un SKU tipeado a mano** marcaba la
  prenda equivocada en silencio.
  ⚠️ **`buscarItem` sigue devolviendo la primera, y lo usa el modo por categoría — que desde el
  19-sep-2026 SÍ escribe en la base.** Esta ficha decía lo contrario: era cierto a la mañana y dejó
  de serlo esa misma tarde, cuando el modo por categoría pasó a guardar. ⇒ **ahí un enganche malo
  ya no es inofensivo**, y encima ⛔ no se nota: con el repetido sumando, contesta «van 2 de TOP MIA
  CHOCOLATE» con el BLANCO en la mano. Pasarlo a `coincidencias` es el pendiente ▶️ de abajo.
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
- 🔴 **«Va acá → corregir TN» marcaba a una HERMANA, ⛔ no a la prenda escaneada** (arreglado el
  20-sep-2026). `marcarErrorCat` recibía el `productId` y resolvía con `items.find(productId ===
  pid)`, que devuelve **la primera variante de ese producto**: se escaneaba TOP ORSA **Beige** y
  quedaba exhibido el **Chocolate**, que nadie vio, mientras el Beige seguía figurando como
  faltante. ⛔ No era el caso raro: **285 de los 467 productos** del Local tienen más de una variante
  con stock. Ahora recibe la variante entera — el **error de categoría** sigue siendo del producto,
  **la tilde es de la variante**. → `components/exhib/useExhib.ts` + `components/exhib/Exhib.tsx`
- 🔴 **`tnAdminUrl` era la SEXTA copia de «cuál es el admin de cada tienda»** y se le escapó a la
  consolidación. Ahora el dominio sale de `lib/tienda.core.js`. → `lib/exhib/core.ts`
- 🔴 **El repetido podía perder su contador sin que nadie se entere** (arreglado el 26-sep-2026).
  Se subía borrando primero la fila vieja; si el borrado fallaba, el upsert con `ignoreDuplicates`
  dejaba «1 vez» en la base y contestaba `ok` ⇒ la que caminaba oía un número que el historial ⛔ no
  tenía. Ahora **la fila del teléfono pisa a la de la base, salvo que la base tenga MÁS unidades**
  (dos tandas pueden llegar al revés), y **al cerrar se compara** lo que contó el teléfono con lo
  que quedó guardado (`compararConHistorial`): ✓ verde si coincide, cartel rojo con la prenda si
  ⛔ no. Pedido de Bruno: *«si a ella le dice 198 quiero que haya 198»*. ⚠️ El número cuenta
  **unidades** (la suma de `veces`), ⛔ líneas. → `api/_exhib.js`, `useColaEscaneos.ts`,
  `ExhibLibre.tsx`, `lib/exhib/libre.ts`

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
- 🏁 **El modo por categoría ya guarda en la base** (19-sep-2026, a la tarde): entra por las MISMAS
  `exhib_recorrido` / `exhib_escaneo` con `modo='categoria'`, el `lugar` **es la categoría
  recorrida** y el triage viaja en `exhib_escaneo.estado`. Los estados de la pantalla pasaron a
  **derivarse de los escaneos**: el `localStorage` quedó como borrador de la cola y ⛔ no como la
  verdad. 🔴 **Lo que lo empujó**: el flag viejo ⛔ no tenía fecha y ⛔ no se limpiaba nunca, así que
  «EXHIBIDO CORRECTAMENTE (245)» quería decir «alguien lo marcó alguna vez». Medido contra el
  recorrido libre del mismo día: **46 variantes con stock (143 u) ⛔ no pasaron por el lector y 39
  salían «exhibido correctamente»**.
  ⚠️ **Las tildes viejas ⛔ no se migran** —no tienen ni fecha ni persona, que es justo lo que las
  vuelve inservibles—: la pantalla dice cuántas hay y deja borrarlas.
  ▶️ **Falta caminarlo en el local** y decidir si la pantalla vuelve a abrir en categoría (hoy abre
  en libre, porque el 19-sep a la mañana el local recorrió media hora sin que llegara una fila).
- ▶️ **El PDF del modo por categoría ⛔ no dice DÓNDE apareció cada prenda** y el libre sí. Cruzar los
  dos se hace **por SKU**, que es lo único que comparten.
- ⏸️ **Llevar al libre el aviso 🏷️ «precio cambiado y sin etiquetar»** (`sospechososNoExhibidos`),
  que se fue al ocultar «Por categoría» el 26-sep-2026. Bruno: *«no me parece urgente y merece ser
  bien pensado»* — ⛔ no se hace sin conversarlo. La idea sobre la mesa era marcar, dentro del
  mandado del balance, las prendas con esa segunda señal (las más seguras de estar en depósito).
  Lo que hay que pensar antes: sólo lo ve quien tiene permiso de Etiquetas; va por producto y el
  mandado por prenda; el corte es de 3 días (`sinEtiquetar` en `lib/etiquetas/cola.core.js`).

## Cómo se prueba

`npx vitest run tests/exhib-core.test.ts tests/exhib-libre.test.ts tests/exhib-colgar.test.ts
tests/exhib-por-variante.test.ts --reporter=dot` — el núcleo de los dos modos y el de «para colgar», sin red. ⚠️ **Y `tests/espejo-servidor.test.ts`**, que tiene la consulta de `datos.ts`
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

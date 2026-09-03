# PRM — ficha de sección

Sección `prm`, área `proveedores`. La relación con cada proveedor: quién es, qué se le anotó, qué
quedó prometido, si entrega lo que le pedimos y cómo vendió su mercadería. **Reemplazó la memoria**:
la decisión de volver o no a un local de Flores se tomaba de cabeza.

⛔ **No es donde se carga.** Lo de la calle —la visita, el interés, el compromiso— se anota en
`recorridas`, área Compras. Las dos secciones miran **las mismas seis tablas** y comparten
`lib/prm/`. Leer también `docs/secciones/recorridas.md`.

## Dónde vive

- Pantalla: `components/prm/` (`PRM.tsx` la lista + la pestaña «Lo prometido», `FichaProveedor.tsx`
  la ficha de a uno, `MovimientoProveedor.tsx` el bloque de compras y ventas, `usePRM.ts` la carga).
- Dominio: `lib/prm/` — `core.ts` (puro, y **re-exporta tipado** lo de `geo.core.js` y
  `sembrado.core.js`), `tipos.ts`, `cliente.ts`, `geo.core.js`, `sembrado.core.js`,
  **`movimiento.ts`** (las cuentas del bloque 5, puras).
- Servidor: `api/_prm.js`, por la puerta `api/datos?recurso=prm`. **Un handler para las dos
  secciones**, con el permiso partido acción por acción.
- Datos: Supabase **de BDI**, seis tablas — `proveedor_local`, `proveedor_visita`,
  `proveedor_interes`, `proveedor_compromiso`, `recorrida`, `recorrida_parada`
  (`sql/migrate-prm.sql`, que es la fuente de verdad del modelo y explica cada campo).
- Tests: `tests/prm-core.test.ts`, `tests/prm-handler.test.ts` y `tests/prm-movimiento.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **`lib/prm/`** es de las DOS secciones. El corte no está en el dato sino en la pregunta, y por eso
  la regla vive una sola vez. Es el mismo arreglo que `lib/crm/`, que alimenta la sección Clientes y
  el panel de WhatsApp.
- **`lib/prm/geo.core.js`** es JS plano porque lo importa `api/_prm.js`, que corre en Node sin pasar
  por el compilador de Next. `core.ts` lo re-exporta tipado (el molde es `permisos.core.js` /
  `permisos.ts`). ⛔ Copiar el orden del recorrido adentro del handler es el bug que ya costó caro
  en Canjes.
- **`api/_georef.js`**: el geocoder del Estado, que ya usaba Envíos. 🔴 **Le sacamos la provincia
  clavada** — ver abajo.
- **`api/blob-upload.js`**: las fotos van al prefijo `prm`. ⚠️ Un prefijo nuevo son DOS líneas
  (`PREFIJOS` del handler y `PrefijoBlob` de `lib/imagenes.ts`); con una sola, la foto **se guarda
  igual pero en `fundas/`**.
- **`lib/recepciones/core.ts`** (`porProveedor`): lo llama la ficha, ⛔ no el handler.
- 🆕 🔴 **`api/_oc-webhook.js` ESCRIBE en `proveedor_local`** (2-sep-2026). El receptor del webhook de
  Ingresos —que ⛔ no pide sesión— le abre la ficha al proveedor que todavía no la tiene, con la
  misma fila que el script de siembra: **`lib/prm/sembrado.core.js`**, JS plano por lo mismo que
  `geo.core.js`. ⇒ el que toque el alta de un local tiene **dos llamadores**, y uno de ellos no
  pasa por `api/_prm.js` ni por su permiso.

## Reglas que el código no dice

- 🔴 🔑 **Son DOS secciones porque son dos preguntas, y el corte lo puso Bruno** (30-ago-2026):
  *«no es lo mismo comprar o querer comprar que analizar al partner o proveedor»*. Una se contesta
  parado en una galería con el celular; la otra sentado, antes de decidir si vuelvo. Juntarlas en
  una pantalla las arruina a las dos: la de la calle se llena de números y la de decidir se llena
  de botones.
- 🔑 **El nombre «PRM» es del vocabulario interno de Bruno y Darío** (CRM/PRM), y va contra la regla
  de escribir en criollo. Fue decisión suya, sostenida después de plantearle la objeción.
  ⚠️ Queda una asimetría a la vista: la hermana figura en el menú como **«Clientes»**, no como
  «CRM». Por eso el `info` de la sección dice en criollo qué es.
- 🔴 **`recepciones` distingue `null` de `[]`, y la pantalla dibuja tres cosas distintas**: sin
  enganche · enganchado y sin ninguna OC · con datos. Devolver `[]` para los dos primeros haría que
  la ficha afirmara «este proveedor nunca nos entregó nada» cuando lo que pasa es que nadie lo
  enganchó. **El cero afirma.** Atado por test.
- 🔴 **`proveedor_gn` existe SÓLO del lado de Zattia**: la columna `productos.proveedor` no está en
  la base de BDI (dicho también en `api/_espejo.js:72`). Un proveedor de BDI **nunca** va a tener el
  bloque «Lo que vendió», y eso ⛔ no es un dato faltante — la pantalla lo dice con esas palabras.
  Por eso el GET de opciones devuelve `gnDisponible`: un desplegable vacío por no haber podido
  preguntar se lee igual que uno vacío porque no hay.
- 🆕 🔴 🔑 **El padrón ENVEJECE SOLO, y por eso el alta no puede ser un script.** Los 30 primeros
  locales salieron de `scripts/sembrar-prm.mjs` el 30-ago-2026 leyendo las OCs de ese día: es una
  **foto**. El 1-sep entraron 13 órdenes con **cuatro proveedores nuevos** —`YASANA`, `ELIANA IND`,
  `AIME`, `AUDAZ`— y sus órdenes ⛔ no se veían desde ninguna ficha, porque la ficha no existía.
  El modo de falla es mudo por partida doble: el webhook contesta 200, la OC entra, Ingresos la
  muestra, y lo único que falta es **la mitad del PRM que se supone medida**. Desde el 2-sep lo
  siembra el webhook (`abrirFichaDeProveedor`), y el script quedó para backfill y reparación.
  ⚠️ **La ficha nace sin zona igual que las sembradas**, así que sigue sin entrar a una recorrida.
- 🆕 🔑 **El de Gestión Nube se SUGIERE, y sugerir ⛔ no es adivinar** (2-sep-2026,
  `sugerirProveedorGn`). La regla de abajo sigue entera: acá ⛔ **no se escribe nada solo**, aparece
  un botón *«Enganchar con «X»»* que aprieta una persona. Lo que se dejó de pedir es buscar el
  nombre en una lista de 33.
  - **Medido**: de los 28 proveedores de Zattia, **22 dan `exacta` y 2 `probable`** (`Contamina` ←
    `CONTAMINA BY LATTE CHIC`, `Boucle` ← `BOUCLE LOCAL`). Los **4 sin sugerencia** son los que
    entraron el 1-sep y todavía ⛔ no tienen productos en GN. **Ninguno de los 6 de BDI se cruza por
    accidente.** Y al 2-sep **había 0 enganchados**: nadie lo tildó nunca desde que salió la sección.
  - ✅ 🏁 **Los 24 quedaron enganchados el 2-sep** (`scripts/enganchar-gn.mjs`, lo pidió Bruno). El
    script ⛔ no copia la regla: importa `sugerirProveedorGn` del núcleo y aprieta los mismos
    botones que la pantalla. **El oráculo ⛔ no fue que la columna quedara escrita, sino que el
    enganche SIRVIERA**: contados del otro lado, los 24 traen **649 productos** y **ninguno apunta a
    un nombre que no existe** — y las dos «probables» son de las que más traen (`Boucle` 94,
    `Contamina` 73). Los 10 que quedan sin enganche son los **6 de BDI** (donde la columna no
    existe) y los **4 del 1-sep** que todavía no tienen productos en GN.
    ⚠️ **Idempotente y ⛔ no pisa lo tildado a mano** (`… where proveedor_gn is null`): la segunda
    corrida dice `0`.
  - 🔴 **Se compara por PREFIJO, ⛔ no por «contiene»**: así crecen estos nombres —la marca primero—
    y con «contiene» un local que arranca con otra marca y nombra a `Contamina` en el medio recibe
    esa sugerencia. 🔑 **El mutante «prefijo → contiene» SOBREVIVIÓ** la primera vez: los dos casos
    que tenía los tapaba el mínimo de 4 letras, y hizo falta uno con la palabra **en el medio**.
  - 🔴 **Con DOS candidatos ⛔ no se sugiere nada**: una sugerencia entre dos parecidos es la que se
    acepta sin mirar, y es justo el caso en que hay que mirar.
  - 🔴 **El espacio ⛔ no separa**: `PLAYURBAN` en el padrón y `Play Urban` en GN son el mismo, y la
    primera versión los dejaba afuera. Sigue siendo `exacta` — es el mismo nombre carácter por
    carácter — pero se pide que sea único igual.
  - ⛔ **La sugerencia ⛔ NO se preselecciona en el desplegable**: un valor puesto de antemano se
    guarda solo en cuanto alguien toca cualquier otra cosa, y ahí deja de ser una sugerencia.
- 🔴 **Los dos enganches se tildan A MANO y ⛔ no se adivinan por nombre.** Está medido: de los 30
  proveedores de las 79 OCs, `CHINA` se lee sola y `RHOVE`/`ASKDENIM` no. **Un enganche mal puesto
  es peor que ninguno**: una ficha que ya muestra cumplimiento y margen no la vuelve a revisar
  nadie. El índice único de `proveedor_id_ingresos` existe por lo mismo: dos locales colgados del
  mismo proveedor contarían el cumplimiento dos veces (el handler contesta 409).
- 🔴 **El enganche pide el permiso `prm` y ⛔ no `recorridas`**, aunque las dos secciones entren por
  el mismo handler. Atar un local a un proveedor de Ingresos hace aparecer en la ficha las OCs de
  otro: es una decisión de escritorio, no un gesto de la calle. **Este handler es el único lugar
  donde eso se decide** ⇒ está atado por test en las dos direcciones.
- 🔑 **El agregado de entrega lo hace la PANTALLA con `porProveedor`, no el handler.** `api/*.js` no
  puede importar TypeScript, así que el handler devuelve las OCs crudas. Copiar la fórmula acá sería
  una segunda regla sobre la misma plata.
- 🆕 🔴 🔑 **«Cómo se mueve lo que le compro» (bloque 5) cuelga de las ÓRDENES, ⛔ no de
  `proveedor_gn`** — pedido de Bruno el 2-sep-2026: *«compra por semana, vendidos en los últimos
  días, curvas de venta promedio»*. Por eso es **el único bloque de venta que también contesta para
  BDI**. El puente es `recepcion_linea.producto_id`, o sea el cruce de cada renglón contra el espejo
  de Gestión Nube.
  - 🔴 🔑 **El puente es el PRODUCTO, ⛔ NO la unidad, y la pantalla lo dice arriba de todo.** Se
    cuentan las ventas **de los productos que él trajo**, que ⛔ no es «cuánto de lo suyo se
    vendió»: el mismo producto pudo entrar por otra orden, de otro proveedor, o ya estar en el
    depósito. **Medido: `CaseMe&Co` compró 793 unidades y sus productos vendieron 968.** Sin esa
    frase, el 968 se lee como un agujero de inventario. Por lo mismo lo vendido **antes** de la
    primera llegada se muestra en vez de tirarse: es la prueba de que el producto no es sólo suyo.
  - 🔴 **Cada producto entra a la curva UNA vez, desde su PRIMERA llegada.** Hacerla por orden
    contaría dos veces el solape de un producto traído dos veces — el mismo pozo común que ya mordió
    en Norte con el stock arribado.
  - 🔴 **El denominador de cada semana de la curva son los productos MADUROS**, ⛔ no todos: uno que
    llegó hace dos semanas no tiene semana 5, y meterlo en el divisor hunde la cola hasta que la
    forma dice «se deja de vender» cuando lo que pasa es que todavía no llegó.
  - 🔴 **`sinCruce` viaja contado y se dice en pantalla.** Al 2-sep cruzan **749 de 803** renglones
    en BDI y **622 de 819** en Zattia: un proveedor cuyos renglones no cruzaron mostraría «vendió 0»,
    que es falso. Lo mismo con `marcasMudas` («no pude preguntar» ⛔ no es «no vendió»).
  - 🔴 **El `order('id')` de `leerTodo` ⛔ no es decorativo**: PostgREST corta en 1.000 filas sin
    avisar y sin un orden por columna única la paginación repite filas y se come otras. CHINA trae
    **4.141** renglones de venta: sin paginar habría dicho 1.000 y nada habría fallado.
  - 🔑 **Es OTRO corte que «Lo que vendió» (bloque 4), y los dos conviven a propósito**: aquél es el
    catálogo entero del proveedor en GN (sólo Zattia, por mes), éste son los productos de sus
    órdenes (las dos marcas, por semana). Van a dar números distintos y la pantalla dice cuál
    contesta cada uno.
  - 🔴 **La acción `movimiento` pide `prm` y ⛔ no `recorridas`**, aunque el resto de la ficha se lea
    con las dos: ahí viajan las ventas del catálogo, que ⛔ no son un dato de la calle. Atado por
    test en las dos direcciones.
- 🔑 **La pestaña «Lo prometido» es lo que justifica la sección**: los compromisos abiertos de todos
  los proveedores juntos, ordenados por urgencia. Es lo único que no se puede ver desde la ficha de
  a uno, y es lo que se mira antes de salir.
- 🆕 🔴 🔑 **La LISTA tiene tres columnas medidas — y existen porque la lista no decía nada.**
  Preguntó Bruno el 2-sep-2026: *«¿y la vista PRM para qué estaría hecha?»*. Medido ese día: de sus
  cinco columnas de dato, **cuatro decían «—» en las 34 filas** (galería, zona, rubro, última visita
  y prometido salen todas de la mano de la calle, que nadie dio), y «Lo prometido» estaba en cero
  ⇒ la lista era **34 nombres y un botón «Abrir»**. Ahora lleva **Comprado · Vendido 30 d · Por
  día**, ordenables, que contestan **¿a quién le recompro?** — la única pregunta que la ficha de a
  uno ⛔ no puede contestar.
  - 🔴 **La columna «Vendido» ⛔ NO SE PUEDE SUMAR.** Un producto traído por dos proveedores cuenta
    entero en los dos: repartir la venta sería inventar de quién se vendió cada unidad y dársela a
    uno solo sería mentirle al otro. Medido: **2 de 349** (`SWEATER MONT` de ALMA y MALABICHA,
    `SWEATER ROUTE` de MADAVA y RHOVE). Esas filas llevan un `*` y el pie lo explica.
  - 🔴 **Si la base de una marca no contesta, la celda dice `?` y ⛔ NO 0** (`FilaComparativa.stores`
    existe sólo para eso). El día que falte una credencial serían **28 de 34** filas afirmando «no
    vendió nada».
  - 🔴 **Los CONTADORES de las pestañas dicen `…` mientras carga, ⛔ NO `(0)`.** Es el bug que
    reportó Bruno —*«queda en cero los datos y luego aparecen»*—: `Proveedores (0)` un segundo antes
    de decir (28) afirma que no hay ninguno, y quien lo lee ⛔ no sabe que estaba cargando. Estaban
    afuera del guard de `cargando` porque son el rótulo del botón, que se dibuja siempre.
  - 🔴 **Cambiar la ventana en la ficha deja los números VIEJOS bajo un rótulo NUEVO** —«Vendido (90
    días)» mostrando lo de 30— así que mientras llega la respuesta los KPI dicen `…`.
  - 🔴 **Mientras carga dice `…` y ⛔ no `—`.** Las columnas llegan en un pedido aparte del padrón
    —cruzan dos bases— y un guion afirmaría «no vendió nada» del que más vende durante ese segundo.
  - 🔑 **Lo único que el handler agrega es la roll-up de ventas por producto, y es TRANSPORTE**: 30
    días de BDI son **5.523 renglones** que terminan en ~350 números. La regla de negocio vive en
    `comparativa()` del núcleo.
- 🆕 🔴 🔑 **«3 SEGUNDOS DE DATOS VACÍOS»: el arreglo anterior le puso la palabra, ⛔ no le sacó la
  ESPERA.** Bruno lo volvió a reportar el 3-sep-2026 —*«cada vez que cargo PRM tiene 3 segundos de
  datos vacíos»*—, y es el MISMO reporte de dos líneas más arriba (*«queda en cero los datos y luego
  aparecen»*): aquella vez se cambió el `(0)` por `(…)` y el `—` por `…`, que es dejar de mentir,
  ⛔ pero la pantalla seguía tardando lo mismo. 🔑 **Cuando alguien reporta un vacío, el arreglo
  honesto y el arreglo del vacío son DOS trabajos, y el segundo no se hizo hasta que lo pidió de
  nuevo.**
  - 📌 **Medido en prod, sesión de Zattia, una carga** (`performance.getEntriesByType('resource')`,
    ⛔ no a ojo): el shell tarda **4,19 s** hasta disparar los pedidos del PRM, y ahí salen los tres
    juntos — padrón **679 ms** · opciones **925 ms** · comparativa **2.681 ms**. ⇒ la tabla aparecía
    a los 5,12 s y las cuatro columnas medidas se llenaban a los **6,88 s**. Los ~3 segundos que
    cuenta Bruno son de 4,19 a 6,88.
  - 🔴 **El transporte ⛔ NO era el problema: la comparativa son 10,5 KB en el cable y 2.677 ms de
    TTFB.** Es todo tiempo de servidor. Adentro: `proveedor_local` → `recepcion_oc` →
    `recepcion_linea` → las ventas de cada marca, y **las dos marcas iban una detrás de la otra**
    aunque son dos bases sin nada en común ⇒ ahora van en `Promise.all`, con el `catch` adentro del
    `map` para que la que falle ⛔ no se lleve puesta a la otra. Lo clava
    `tests/prm-comparativa-marcas.test.ts`, y su oráculo es el **SOLAPE**, ⛔ no el total.
  - 🔴 **La lista esperaba a `opciones`, que la lista ⛔ no dibuja**: son los dos desplegables de
    enganche de la FICHA. Estaban en el mismo `Promise.all` y bajo la misma bandera `cargando`
    (679 contra 925 ms). Ahora van por separado, y `opciones` arranca en **`null` = todavía
    viajando** ⇒ la ficha espera con su esqueleto. ⛔ Con una `Opciones` vacía el bloque de Gestión
    Nube **afirma** «no se pudo leer el catálogo» de algo que sigue en camino; `SIN_OPCIONES` es
    sólo lo que queda cuando el pedido **falló**, y ahí esa frase sí es cierta.
  - 🔴 **Y la flecha del encabezado afirmaba un orden que ⛔ no estaba aplicado.** El orden por
    defecto es «Vendido ↓», pero ese número llega en el otro pedido: durante esos ~2 s todos los
    valores son −1, la lista sale **alfabética** y la flecha decía otra cosa — y cuando llegaban los
    números la lista **saltaba entera**. Ahora, mientras no llegó la comparativa, la lista está por
    nombre, la flecha está ahí, y las cuatro columnas medidas ⛔ **no se ofrecen para ordenar**: un
    click que no mueve nada es peor que un botón que todavía no está. Es el mismo cero de carga del
    rótulo de las pestañas, escrito con una flecha.
  - ▶️ **Lo que queda, y es de Bruno**: las ventas se bajan CRUDAS —5.311 renglones de BDI para
    llegar a 72 números— porque el agregado del lado de la base está **APAGADO en el proyecto**
    (`select('quantity.sum()')` contesta `Use of aggregate functions is not allowed`, probado el
    3-sep-2026). Prenderlo en los dos proyectos de Supabase colapsa **6 viajes de mil filas en 1**.
    ⛔ La otra idea —pedir sólo la marca que se está mirando— ⛔ NO se hizo: `comprado` y `stores`
    hoy suman las órdenes de **las dos** marcas, y filtrar cambiaría lo que MIDE la columna para un
    proveedor que le venda a las dos. Eso lo decide Bruno, ⛔ no el que optimiza.
- 🆕 🔴 🔑 **CADA SECCIÓN MUESTRA LOS PROVEEDORES DE SU MARCA, y la marca ⛔ NO se tilda: se MIDE.**
  Pedido de Bruno el 2-sep-2026: *«hay proveedores de bdi y zattia que hay que clasificar, para que
  el dato aparezca en cada sección por separado»*. ⛔ **No hizo falta clasificar nada**: el dato ya
  estaba en `recepcion_oc.store`. El padrón devuelve `marcas` por local y `esDeLaMarca()` decide.
  Medido: **28 de Zattia · 6 de BDI** (CHINA, LOOKEADOS, CELULANDIA, CaseMe&Co, PHONE CASE y
  **SUMA**), y **ninguno en las dos** — el día que uno lo esté, aparece en las dos solo.
  - 🔴 **Un campo tipeado al lado de un dato medible envejece**: el proveedor que mañana le venda a
    la otra marca quedaría mal clasificado y ⛔ nadie lo iría a corregir.
  - ⛔ **`marcas: []` ⛔ NO es «de ninguna marca»: es «todavía no le compramos»** ⇒ aparece en las
    DOS. Un local de Flores cargado a mano antes de la primera orden sirve para la marca que sea, y
    esconderlo lo perdería justo cuando hay que ir a verlo. Hoy no hay ninguno así (los 34 nacieron
    de las órdenes), y va a haberlos apenas se cargue el primero desde Recorridas.
  - 🔑 **«Lo prometido» también se filtra**: si mostrara los compromisos de las dos, la pestaña que
    justifica la sección le hablaría a la marca equivocada.
  - 🔴 **El vacío distingue dos cosas**: «no hay ninguno cargado» y «los que hay son de la otra
    marca» — la segunda se arregla cambiando la marca arriba, ⛔ no cargando un local.

## Lo que ya se rompió acá

- ⚠️ Nada todavía: la sección salió el 30-ago-2026. Lo que sí se rompió **al construirla**:
  - **El geocoder mandaba `provincia: 'Santa Fe'` clavada** (`api/_georef.js`). Era verdad mientras
    el único que lo llamaba era Envíos. Con eso, `"Av. Avellaneda 3252"` resuelve **en Santa Fe** y
    Georef contesta **un punto plausible, no un error** — el geocoder que inventa lejos por el que
    se descartó Nominatim. Ahora `provincia` es **obligatoria por pedido** y sin ella tira.
    🔴 **No lo cubría ningún test**: los de Envíos no importan `_georef.js`. Por eso existe
    `tests/georef-provincia.test.ts`, que mira **el cuerpo del POST** y no el resultado (un mock que
    devuelva coordenadas lindas pasa igual con la provincia mal).
  - **El CSV de Google Maps perdía el punto callado.** La URL lleva comas adentro
    (`@-34.6295,-58.4635,17z`): un CSV sin comillas —abierto y vuelto a guardar en una planilla— la
    parte en tres columnas. Y en ese archivo el punto es **el único dato de ubicación que hay**, no
    viene la dirección. Ahora se busca en la fila entera si la columna no lo tiene.

## Pendiente

- ▶️ **Que un compromiso siembre un pendiente en la Agenda** (`lib/agenda/reglas.core.js`). Es el
  paso natural y no se hizo: la Agenda **la ve todo el equipo** y esto todavía es de una persona.
  Se decide después de un viaje real.
- ▶️ **Enganche con los otros dos padrones de proveedores del grupo** — `areben-produccion` (Prisma,
  facturas de tela) y `areben-dashboard` (Supabase, financiero). Están en otras bases, modelan
  facturas y **ninguno tiene dirección**. El puente, si hace falta, es `proveedor_id_ingresos`.
- 🔴 ▶️ **Nadie lo usó todavía.** Medido contra la base el 2-sep-2026: **30 locales · 0 con zona ·
  0 con dirección · 0 visitas · 0 intereses · 0 compromisos · 0 recorridas**. Es un módulo que se
  alimenta 100% a mano; por eso `scripts/sembrar-prm.mjs` lo arrancó con los proveedores de las OCs
  y por eso el webhook los sigue sembrando, para que la ficha diga algo desde el día uno.
- 🔴 ▶️ **La mano que lo destraba es una sola: la ZONA.** Los 30 están en `null` a propósito y sin
  zona ⛔ no entran a ninguna recorrida, así que «Armar recorrida» no sirve hasta que se clasifiquen.
  ⛔ **Y ⛔ no se puede hacer de este lado**: no hay dirección en ninguno de los tres padrones del
  grupo (verificado en `areben-produccion`, cuyo modelo `Proveedor` tiene cuit/contacto/notas y
  **ninguna dirección**), y adivinar por el nombre está medido y descartado.
- ⚠️ **Sin novedad, a propósito**: es para admin.

## Cómo se prueba

```bash
npx vitest run tests/prm-core.test.ts tests/prm-handler.test.ts tests/prm-movimiento.test.ts \
  tests/georef-provincia.test.ts --reporter=dot
node scripts/caminar-prm-movimiento.mjs   # el bloque 5 contra las bases REALES (sólo lee)
```

🔴 **`ZATTIA_SUPABASE_SERVICE_KEY` ⛔ NO está en el `.env` de la Mac de Bruno**, y con la anon key la
base de Zattia contesta `permission denied for table venta_detalles` — a propósito: ahí hay plata.
⇒ **en local, todo lo de ventas de Zattia sale mudo** (`marcasMudas`), que son **28 de los 34**
proveedores. En Vercel sí está: la usan el ETL, `_costos.js`, `_ventas-diarias.js`, `_tn-desc.js` y
el pase del espejo. La caminata lo dice con esas palabras en vez de contarlo como rojo.

🔴 **Y por eso la caminata elige un proveedor de Zattia DESDE LA BASE, ⛔ no a mano.** La primera
versión nombraba tres proveedores de BDI y salía **20 de 20** sin haber tocado nunca la otra base —
la mitad de las órdenes y 28 de los 34 proveedores. Lo destapó la comparativa, que las toca a las
dos. Ver [[feedback_areben_caminata_que_elige_sus_casos]].

**`caminar-prm-movimiento.mjs` ⛔ no es un test**: invoca `movimiento()` tal cual la llama el handler
contra las dos bases y **el oráculo es la misma cuenta por otro camino** (SQL directo por `pg`). Es
lo único que caza que el embed `ventas!inner` o la paginación se estén comiendo filas — un conteo
más bajo se ve exactamente igual que una semana floja. Caminada el 2-sep-2026: **20 de 20**, con
CHINA trayendo 4.141 renglones (o sea que pasó el corte de 1.000).

Lo que **no** es obvio:

- 🔴 **La migración la corre Bruno**: `node scripts/apply-prm.mjs` lo bloquea el clasificador de esta
  máquina. El script ejerce los candados y **trae su propia punta positiva** (que una fila sana
  entre, y que **dos locales sin enganche convivan** — la punta del índice PARCIAL, que es la que se
  olvida: un `unique` sin el `where` no dejaría cargar dos locales).
- ⚠️ **El `porProveedor` de la ficha se ejerce con OCs de verdad**, no con la fixture: el enganche
  cuelga de `proveedor_id`, que lo escribe el webhook.
- 🔴 **Recorridas se camina en el CELULAR**, no en el navegador de la Mac: la foto viene de la cámara
  y el borrador de `localStorage` sólo se prueba **cortando la red**.

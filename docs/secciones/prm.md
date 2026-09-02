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

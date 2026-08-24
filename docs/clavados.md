# Clavados — el recupero de lo que ya se remarcó

Transversal, como `docs/lineas.md`: no es una sección del nav. Son **tres piezas en tres lugares** y
por eso tiene doc propia — quien toque una sin saber de las otras rompe el número sin que falle nada.

⛔ **Leer antes de tocar** `lib/clavados/`, `api/_clavados.js`, `components/clavados/`,
`sql/migrate-clavados.sql`, o el bloque de clavados de `components/memo/Memo.tsx`.

## Qué es un clavado (y qué no)

> *«El clavado es clavado aunque se venda, porque ya se bajó el precio y quedó ahí. Lo que se analiza
> es la recuperación de dinero.»* — Bruno, 23-ago-2026

🔑 **No es un estado que el sistema calcula: es una DECISIÓN que queda pegada al producto.** Por eso
es una tabla y no un detector.

⛔ **No se lee `detectarComercial` para armar la lista.** Ése detecta *candidatos* —stock que no
rota— y es otra pregunta: un candidato es algo para mirar, un clavado es algo que ya se decidió. Si
alguna vez hace falta otro umbral, entra como parámetro en `lib/gerencial/umbrales.ts`, ⛔ no como una
constante nueva.

## Dónde vive

- **`sql/migrate-clavados.sql`** + `scripts/apply-clavados.mjs` — tabla `clavados`, **en la base de
  CADA marca** (`producto_id` es de su base). Corrida en las dos el 24-ago-2026.
- **`lib/clavados/core.js`** (puro) + `tipos.ts` — las reglas. `.js` plano porque lo importan
  `api/_clavados.js` y `api/_memo.js`, que corren en Node sin el compilador de Next.
- **`api/_clavados.js`** — entra por `api/datos.js?recurso=clavados`. Marcar, sacar, borrar.
- **`components/clavados/`** — el chip y su hook. 🔑 **Vive acá y no en `components/productos/`
  porque `ProductosTable.tsx` es del repo compartido con Darío**: desde allá entra en una línea.
  Mismo criterio que `useCampaniaAbierta.ts`.
- **`components/memo/Memo.tsx`** — el bloque que lo lee. El memo **lee**; no es donde se llena.

## Reglas que el código no dice

- 🔴 🔑 **El número de cada semana sale de la VENTA de esa semana, ⛔ nunca del estado de hoy.** El
  stock llega a 0 **justo en la semana en que el recupero se completó**: si el cierre lo sacara de la
  foto, el memo de esa semana perdería justo el producto que mejor salió. Decidido así por Bruno el
  24-ago-2026. Es la misma forma de defecto que ya mordió dos veces acá — el `desagendar` de Envíos y
  el botón de cerrar del memo, que apaga más de lo que su rótulo nombra.
- 🔴 **`visto_en_cero` NO decide si un clavado está agotado**: lo decide el stock de hoy. La columna
  guarda cuándo el sistema **vio** el cero, ⛔ nunca cuándo llegó a cero — **nadie guarda historial de
  stock**. Se estampa perezosamente en el GET, y eso es inocuo **sólo porque ningún número depende de
  ella**. El día que alguien haga depender el recupero de este sello, un producto que se agotó el
  martes y que nadie miró hasta septiembre va a caer en la semana equivocada.
- 🔴 🔑 **El que no tiene costo tampoco aporta al NUMERADOR del porcentaje.** Lo encontró caminar
  prod el 24-ago-2026 y el guard por renglón no alcanzaba: con **un** clavado sin costo, `parado`
  sumaba 0 y el total daba **«100 % recuperado»** con cero productos medibles. `resumirClavados`
  lleva `recuperadoMedible` aparte por eso — si el recupero de un producto cuyo denominador se
  desconoce entrara al numerador, **cada clavado sin costo empujaría el porcentaje hacia arriba**. Y
  la pantalla dice **«no medible»** en vez de «$0» cuando no hay ninguno medible: un $0 de capital
  parado afirma que ya no queda nada parado, que es lo contrario de lo que pasa.
- 🔴 🔑 **Sin costo NO hay porcentaje, y «costo 0» es lo mismo que «sin costo».** Un costo 0 hace que
  el capital parado dé 0 y el recupero dé **100 %**: un número perfecto y falso. Los dos casos van
  como **«no medible»**, y la pantalla dice **cuántos son** — un total sin ese número al lado se lee
  como si cubriera todo. Medido el 24-ago-2026: **BDI tiene 450 productos y 0 con costo** (token sin
  `costs:read`, ver `scripts/lib/costos-espejo.mjs`) y **Zattia tiene 769 con costo cero sobre 2.676**.
- ⚠️ **La plata de este bloque es MERCADERÍA, no «lo facturado».** El descuento y el envío son de la
  venta entera y no se pueden repartir entre los productos de un ticket sin inventar un criterio —
  el mismo motivo por el que la tabla por línea del memo dice «Mercadería». La pantalla lo llama así.
- 🔴 **El stock se SUMA por `product_id`** sobre todas las filas de `inventario`, que están partidas
  por variante y por depósito. Leer una fila daría el stock de un talle, y el capital parado saldría
  dividido por la cantidad de variantes **sin que nada falle**.
- 🔑 **El único de la tabla es PARCIAL** (`where visto_en_cero is null`). Un producto que se cerró se
  puede volver a marcar: es un ciclo nuevo con su propio recupero. Un único total borraría el
  historial del ciclo anterior o impediría el nuevo — las dos cosas son perder un dato que ya existía.
  Por eso el `id` lleva la fecha de arranque adentro.
- ⚠️ **`sacar` ≠ `borrar`.** `sacar` lo saca de la lista activa y **no borra**: lo que ya recuperó
  sigue contando en la foto de las semanas en que facturó. `borrar` existe sólo para el que se marcó
  por error hace un minuto. Confundirlas pierde el recupero de un producto que sí trabajó.
- 🔑 **Marcar es de admin; ver el chip, de quien vea Productos.** Si el estado sólo lo viera Bruno,
  dos personas mirando el mismo producto verían dos cosas distintas — y la que no lo ve le bajaría el
  precio de nuevo.
- 🔑 **Por qué el marcar va en la FILA DEL PRODUCTO.** Es la lección de Faltantes, textual: *una lista
  nueva no existe hasta que entra donde se toma el trabajo*. El momento en que alguien decide que un
  producto es un clavado es el momento en que lo está mirando para bajarle el precio, y a esa fila es
  adonde apunta el «Ver productos» de la señal de capital parado de Gerencial. Una pantalla aparte
  para marcar sería una pantalla que nadie abre.

## Cómo se prueba

`npx vitest run tests/clavados.test.ts --reporter=dot` (17 casos) y el padrón de gates de
`tests/handlers-autorizacion.test.ts`, donde `_clavados` está anotado.

Lo que no es obvio:

- 🔴 **Y lo que encontró el defecto del «100 %» no fue un test: fue caminarlo en prod** con un
  producto real de BDI. Los 15 casos estaban verdes. El oráculo fue `psql` contra la respuesta del
  handler — el recupero de la semana dio **$802.757 en los dos**, y al lado el resumen decía
  `sinCosto: 1` y `pct: 100` a la vez, que es la contradicción que ningún test miraba.
- **Nueve mutantes, nueve muertos** (24-ago-2026): costo 0 tratado como medible · el recupero mirando
  el estado en vez del rango · sin tope de fecha · los sin costo entrando como cero al parado · el
  porcentaje calculado sin denominador · `agotado` saliendo de la columna en vez del stock · el
  porcentaje medido contra el parado solo · el porcentaje usando el recupero TOTAL en vez del medible
  · el recupero sin costo aportando al numerador (los dos últimos son el defecto de arriba).
  ⚠️ **Dos mutantes más resultaron EQUIVALENTES** (`costo null → 0`, que cae igual en el `c <= 0`; y
  `parado += r.parado || 0`, que suma 0): un mutante vivo no siempre es un agujero de tests, a veces
  es una mutación que no cambia nada — y darlo por agujero manda a escribir un test que no prueba nada.
- 🔑 **El oráculo del RLS no es el `relrowsecurity` ni el `has_table_privilege`**, que dice
  `anon lee: true` con RLS puesto. Es escribir una fila real con la service key y **pedirla con la
  anon por PostgREST**: da `[]`, y el POST anónimo da 401. Ejercido el 24-ago-2026, y la fila borrada.
- ⚠️ El `apply-clavados.mjs` ejerce el único parcial **en los dos sentidos** (dos activas se rechazan,
  una cerrada + una activa entran). Una sola punta no mide nada: un único total daría el primer ✓.

## Pendiente

- ▶️ **El denominador de BDI no existe hasta que el secret `GN_TOKEN` de GitHub tenga `costs:read`.**
  Sus 450 productos van a salir como «sin costo» y el porcentaje va a estar mudo. El numerador —lo
  que recuperó— sí funciona desde el día uno.

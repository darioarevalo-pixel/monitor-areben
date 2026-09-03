# Etiquetas — ficha de sección

Sección `etiquetas`, área `local`. Imprime las etiquetas de 5 × 2,5 cm de las prendas (Code 128) en
una Zebra, cargando cantidades a mano o escaneando con el lector. Desde el 17-ago-2026 incluye la
**cola de reetiquetado**: qué prenda hay que volver a etiquetar porque le cambió el precio. Desde el
3-sep-2026 la pestaña de SKU imprime además la **etiqueta de bolsa de 10 × 15 cm**, con los SKU de
todos los colores de un producto juntos.

## Dónde vive

- `components/etiquetas/` — `Etiquetas.tsx` (944 l.: los seis paneles, el escáner y las dos vistas
  previas) · `useEtiquetasTn.ts` (el catálogo y los precios de Tienda Nube, con caché) ·
  `useColaReetiquetado.ts`.
- `lib/etiquetas/` — `pdf.ts` (el dibujo, **las dos geometrías**) · `core.ts` (precios, filtros, la
  secuencia de impresión, **las hermanas de una bolsa**)
  · `cola.core.js` + `cola.ts` (la regla de la cola) · `tipos.ts` (los tipos **y la tabla de
  metadatos de cada etiqueta**).
- Handler: **no tiene uno propio**. Entra por `api/_liquidacion.js` con `?etiquetas=1` (ver abajo).
- Tabla: `etiquetas_impresas` (`sql/migrate-etiquetas-impresas.sql`), una fila por producto, que se
  pisa en cada impresión. Lee además `liquidacion_bitacora` e `inventario`.
- Tests: `etiquetas-core` · `etiquetas-cola` · `etiquetas-cola-handler` · `etiquetas-pdf` ·
  `liquidacion-etiquetas`, más el candado de permisos en `handlers-autorizacion`.

## ⛔ Lo que comparte con otras secciones

- 🔴 **El handler es el de Liquidación.** `?etiquetas=1` es una de sus cuatro llaves y la única que
  además **escribe** (`action:'etiquetado'`). Tocar el gate de arriba de `api/_liquidacion.js` le
  cambia el acceso a gente que no tiene esta sección → leer `docs/secciones/liquidacion.md`.
- 🔴 **La cola se arma leyendo `liquidacion_bitacora`**, o sea que **depende de que todos los
  descuentos entren por el Monitor** (decisión de Bruno del 16-ago-2026). Un precio cargado a mano
  en Gestión Nube no deja evento; lo que igual lo caza es que la etiqueta guarde **qué número dijo**
  (ver abajo).
- **El resto que la cola descarta va al chequeo de exhibición**: `sinEtiquetar()` lo consume
  `components/exhib/Exhib.tsx` con `sospechososNoExhibidos` (`lib/exhib/core.ts`).
- ⚠️ **Para Zattia se fusiona el catálogo de Stunned y en Exhibición no** ⇒ un producto de Stunned
  se etiqueta con precio y en el control de exhibición sale «sin precio en Tienda Nube».

## Reglas que el código no dice

- 🔑 **La pestaña de SKU etiqueta BOLSAS, no prendas** (Bruno, 3-sep-2026). El depósito guarda una
  bolsa por color y cada una lleva su SKU pegado, así que un producto de cuatro colores son cuatro
  etiquetas — y hasta ese día había que escanear las cuatro. `hermanasDe` convierte un escaneo en
  todas, y `conStock` decide cuáles arrancan tildadas. ⚠️ **La lista de hermanas NO sale de
  `variantesEtiquetables`**: ésa filtra por código de barras, que hace falta para *escanear* y no
  para la etiqueta de SKU, que no dibuja barras — filtrarlo escondía la bolsa de un color sin código.
- 🔑 **En la etiqueta de 10 × 15 manda el SKU y el nombre es el pie** (Bruno: *«el depósito se ordena
  por SKU»*). Los SKU arrancan en 46 puntos y bajan de a uno hasta entrar a lo alto y a lo ancho; el
  nombre del producto va abajo, en cuerpo fijo y gris, sólo para confirmar que la bolsa es la
  correcta. ⛔ **No lleva código de barras**: con cuatro SKU adentro no se sabría cuál se escanea.
- 🔑 **Los SKU de más se reparten PAREJO entre las etiquetas, no llenando la primera**
  (`repartirSku`). Cortando de a seis, diez colores daban una hoja apretadísima y otra con dos SKU
  enormes: la misma bolsa con dos etiquetas que no se parecían en nada.
- 🔑 **Escanear imprime y recién después se puede elegir**, y es a propósito. Toda la sección es
  «escaneá y ya está»; una lista para tildar en cada escaneo le sacaba al escáner justo lo que vino a
  ahorrar. El panel de la bolsa **queda en pantalla después de imprimir** con los colores tildados,
  así que corregir es cambiar un tilde y reimprimir, sin ir a buscar la prenda de nuevo. La tilde
  «elegir antes de imprimir» invierte el orden y **arranca apagada**.
- ⚠️ **Las tres tildes de la bolsa son de la pestaña de SKU y viven en `localStorage` por marca**
  (`monitor_eti_sku_cfg_<marca>`), con `CONFIG_SKU_DEFAULT` delante al leerlas: un guardado viejo al
  que le falte una tilde la dejaría `undefined` y convertiría el checkbox en no controlado.
- ⚠️ **Juntar colores es cosa del ESCÁNER, no de las cantidades de la tabla.** Ahí cada renglón es
  una variante y su número, así que con la etiqueta grande la cantidad son **copias de la misma
  bolsa**. El tamaño sí manda en las dos.

- 🔑 **Las etiquetas se llaman por lo que DICEN, no por dónde se pegan** (Bruno, 16-ago-2026):
  información de producto · precio · precio rebajado · SKU · libre. «Depósito» y «Local» eran
  ubicaciones y ninguna línea de código dependía de dónde está la prenda. La tabla `ETIQUETA` de
  `lib/etiquetas/tipos.ts` es el único lugar donde eso se escribe — antes estaba en tres, ya
  desincronizados, y un cuarto (`lib/nav.datos.ts`) que ni conocía dos de las pestañas. Los ata
  `tests/etiquetas-core.test.ts`. ⚠️ **Queda un quinto, y es de toda la app**: el subtítulo de la
  pantalla sale del mapa de `lib/nav.ts`, que no se unificó porque son las 40 secciones. Al cambiar
  cómo se llama algo acá, ese renglón se toca a mano — se descubrió en prod, diciendo todavía
  «depósito, local, promo y SKU».
- 🔑 **Hay DOS ejes y estaban colapsados en uno**: `ModoEtiqueta` es **el dibujo**; el `Slot` es
  **sobre qué prendas**. La cola es el caso que lo prueba: no tiene dibujo propio —usa los que ya
  están, y elige **prenda por prenda** con `modoDe`, porque mezcla las que entran a una oferta con
  las que vuelven a precio de lista.
- 🔴 **El contador decía 30 y la lista salía VACÍA** (medido en prod el 3-sep-2026: Zattia 30, BDI
  18, las dos con la tabla en cero). La cola usa el **dibujo** `promo`, y la pantalla leía eso como
  «mostrá sólo lo que hoy está rebajado en Tienda Nube» ⇒ la prenda a la que se le **sacó** la
  oferta —la mitad de la razón de ser de la cola— desaparecía de la lista, y el local no tenía cómo
  saber cuál buscar. Los dos ejes otra vez: **el dibujo no elige la lista**. La regla vive en
  `variantesAListar` (`lib/etiquetas/core.ts`) con la campaña como **parámetro obligatorio**, y el
  mismo error frenaba el **escaneo** (`modoV`, el modo de esa prenda y no el de la pestaña): escanear
  una prenda que volvió a lista contestaba «no está en promoción». La pestaña además contaba **una
  sola de las dos puertas**, así que se quedaba sin número justo cuando todas entraban por la otra.
- 🔴 **Y la cola leía sólo las primeras 1.000 filas de cada tabla, sin avisar** (3-sep-2026): las
  tres consultas del bloque `&cola=1` salían sin paginar en un archivo que ya importaba `leerTodo`
  para las otras nueve. Medido en prod: el inventario de Zattia son **3.892 filas** y el mapa de
  stock llegaba con **256 productos de 734** ⇒ las otras 478 se leían «sin stock» y se descartaban,
  acá y en la comparación de números del navegador. Lo destapó Bruno cambiándole el precio a **MINI
  BLUSH** —17 unidades en el Local— y no verla aparecer. ⚠️ **El mock del test devolvía todas las
  filas**, así que el corte no existía para el CI: ahora `tests/etiquetas-cola-handler.test.ts`
  corta en 1.000 como PostgREST y pagina de verdad en `range`.
- 🔑 **La cola pregunta «¿lo que dice el cartelito es lo que el cliente paga HOY?»**, no «¿hubo una
  campaña?». Arrancó comparando fechas contra la bitácora y Bruno preguntó *«¿y si cambia el precio
  de lista?»*: ahí se vio el agujero, porque el de lista se carga a mano en GN sin dejar rastro. Por
  eso la etiqueta guarda **el número que dijo** (`precio`, `precio_lista`) y la comparación se hace
  **en el navegador**, que es donde vive el precio de Tienda Nube.
- 🔴 **Y la prenda SIN oferta volvía a la cola al segundo de imprimirla, para siempre** (3-sep-2026).
  El sello guarda `precioLista: null` cuando la etiqueta no tacha nada, y el precio de hoy trae
  `lista = aCobrar` en ese mismo caso ⇒ comparar el `null` crudo daba **siempre distinto**. Medido en
  prod: **las 118 «por número» de Zattia eran todas esto** —118 de 118 con el mismo número en la
  etiqueta y en la tienda— y la lista crecía con cada impresión. La comparación normaliza:
  `listaSello = precioLista ?? precio`. ⛔ Arreglarlo del lado que ESCRIBE no alcanzaba: los 397
  sellos ya guardados tienen el `null` adentro.
- 🆕 **Y se compara también contra el espejo de Gestión Nube** (Bruno, 3-sep-2026: *«comparalo también
  contra el espejo de GN»*). La cola pregunta por el precio de **Tienda Nube**, que es lo que el
  cliente paga, así que un precio cargado en GN que todavía no propagó no la despierta.
  `preciosDesalineados` lista los que **los dos lados no cuentan igual**. 🔴 **Va como AVISO y ⛔ no
  como filas para imprimir**: la etiqueta se dibuja con el precio de la tienda ⇒ imprimir no arregla
  el desacuerdo y la prenda volvería a acusar mañana (el mismo ciclo del `precioLista: null`). Se
  arregla emparejando el precio en uno de los dos lados. 📌 **Medido antes de escribirlo**: GN y la
  tienda coinciden en el **99,4 %** (Zattia 494 de 495 con stock, BDI 215 de 218) ⇒ lo que salga es
  señal, no ruido. ⚠️ El espejo de GN se refresca **una vez por día**: es una lista para mirar, ⛔ no
  un semáforo.
- ⚠️ **Un sello sin número no acusa a nadie.** Las 262 filas del sellado inicial (17-ago) no tienen
  precio: ahí manda la fecha. Con el `null` contando como «distinto», sellar no habría servido.
- 🔑 **Reimprimir es libre y no avisa nada** (caso «se trabó la impresora»), y **de la cola sale sólo
  el que se queda sin stock**: ⛔ sin corte por tiempo, que esconde al rezagado. Se puede sacar a
  mano con «ya está», que se guarda como `ya_estaba`, no como `impresa`.
- 🔴 **La etiqueta de precio con precio 0 imprimía la de información, en silencio.** El dibujo
  decide con `precio > 0` y se caía a la otra rama: salía una etiqueta linda, sin precio, y la
  prenda quedaba en la percha sin número. Lo frena `partirPorPrecio` (`core.ts`), que además
  **nombra** cuáles — «3 de 40 no salieron» obliga a revisar las 40.
- 🔑 **El precio que se imprime es el del chequeo de exhibición** (`precioDeGondola`): una promo que
  **no es menor** que la lista no es oferta. Antes acá ganaba `promo_price` siempre, así que con una
  promo vieja arriba de una lista nueva **se imprimía un precio más caro que el de lista** y las dos
  pantallas se contradecían sobre el mismo producto. ⛔ De las ocho reglas de precio del repo se
  unificaron **sólo estas dos**; las otras seis cambian números que la gente ya usa.
- ⚠️ **El precio tachado y el nuevo pueden venir de fuentes distintas**: el tachado tiene respaldo al
  espejo de Supabase (hasta ~30 h viejo) y el nuevo sale de TN en vivo.
- 🔴 **El caché de precios de TN tiene vencimiento de 30 minutos** (`TTL_PRECIOS_MS`) y la pantalla
  dice de cuándo es el precio que va a imprimir. Sin eso, con todos los descuentos entrando por el
  Monitor, se cambia un precio y la pestaña de al lado sigue imprimiendo el viejo, en silencio.
- ⚠️ **La geometría de 5 × 2,5 no se toca.** Esos milímetros y cada constante salen en una Zebra real
  y el archivo es un port byte-fiel del legacy. ⚠️ **La de 10 × 15 (`BOLSA`) es otra cosa**: nació
  acá el 3-sep-2026 y sí se puede ajustar, con el diff de la cinta delante. Los tres dibujos con barras comparten un solo cuerpo
  (`dibujarCuerpo`) desde el 17-ago; lo que cambió es dónde está escrito, no un milímetro.
- ⚠️ **En jsPDF el corte de línea depende de la fuente activa** ⇒ el `setFont` va **antes** del
  `splitTextToSize`. Medir en normal y escribir en negrita parte el nombre en otro lado.

## Lo que ya se rompió acá

- 🔴 **La pestaña «🏷️ Liquidaciones» mostraba CERO justo el día que más hay para etiquetar.** Al
  sacar la oferta, cada ítem vuelve de `aplicado` a `confirmado`, y la lista sólo tomaba `aplicado`;
  y si además se cerraba la campaña, `cerrada` no está en `ESTADOS_CAMPANIA_VIVA` y ni aparecía en
  el selector. La reemplazó la cola.
- 🔴 **La primera escritura de la llave de Etiquetas.** Hasta la cola, la garantía era «Etiquetas es
  sólo GET». Marcar una etiqueta es un POST ⇒ la reemplaza que `escribeEtiquetado` pida **dos
  condiciones a la vez** (`?etiquetas=1` **y** `action:'etiquetado'`) y corte con `return` antes de
  mirar ninguna otra.
- ⚠️ **La vista previa de formas de pago mentía**: era HTML con tamaños en px contra un PDF en pt.
  Ahora las dos previas de la pantalla son el PDF real, por `PreviaPdf`.

## Pendiente

- 🔴 ⛔ **La etiqueta de bolsa no se imprimió nunca de verdad.** El dibujo se miró en PDF (jsPDF real,
  no el doble de los tests) y entra bien con uno, cuatro y seis SKU, pero **falta el rollo de 10 × 15
  en la impresora**: que Bruno escanee una prenda con las dos tildes prendidas y vea salir la hoja.
  Como el resto de la sección, eso no lo puede ejercer una sesión de IA (`autoPrint` abre el diálogo
  del navegador).

- 🔴 ⛔ **NADA de la cola se ejerció a mano.** Falta que Bruno cargue una cantidad, imprima con el
  lector y vea que la prenda **sale** de la cola. `pdf.autoPrint()` abre el diálogo del navegador y
  eso mata el puente de Chrome: esa parte no la puede probar una sesión de IA.
- ⏸️ **Los sub-permisos**: los seis están declarados en `lib/nav.datos.ts` y **no hay un solo
  `puedeSub` que los consulte** ⇒ hoy las pestañas las ve cualquiera que tenga la sección.
  Ejercerlos puede dejar a alguien sin una que usa; borrarlos es decir que Etiquetas es todo o nada.
  Decide Bruno.
- ⚠️ **El doble de jsPDF de los tests no mide la fuente real** ⇒ la paridad prueba que el layout no
  se movió, **no** que un nombre largo entre en la etiqueta. Eso lo mide la Zebra.

## Cómo se prueba

```bash
npx vitest run tests/etiquetas-pdf.test.ts --reporter=dot   # y los otros cuatro
```

- 🔴 **El dibujo se prueba por PARIDAD, no por bytes.** `tests/etiquetas-pdf.test.ts` graba la cinta
  de órdenes de dibujo (`text`/`line`/`addImage` con posición y tipografía) contra
  `tests/fixtures/etiquetas-pdf-paridad.json`. Un PDF binario cambia con la versión de jsPDF y no
  dice *qué* se movió. **Si el cambio de dibujo es a propósito**: `ETIQUETAS_PARIDAD=escribir`, se
  mira el diff renglón por renglón y se commitea junto con el cambio.
- 🔴 **Los mutantes que hay que ver caer**: correr una décima un `gNameVar`, sacarle la negrita al
  nombre de la etiqueta de información, y que el encabezado de precio no corra el cuerpo hacia
  abajo. Los tres dan rojo por `expect` en la cinta.
- **La cola tiene su handler ejercido aparte** (`etiquetas-cola-handler`): lo que se fija ahí es qué
  se le pide a la base y cómo se desduplica la bitácora, que ningún test de la función pura caza.
- ⚠️ **Imprimir de verdad no se ensaya desde acá** (ver Pendiente).

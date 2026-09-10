# Liquidación — ficha de sección

Sección `liquidacion`, área `analisis`. Campañas de sale: se juntan productos, se les define un
precio uno por uno con el simulador de margen al lado, **el Monitor se lo escribe a Gestión Nube**,
y después se contrasta lo decidido contra lo que se cobró de verdad.

Reemplazó tres pantallas y un archivo: se tildaban productos en Análisis → Por producto, salía un
**PDF**, se los cargaba a mano en el simulador de Comisiones y la lista terminaba en el
`localStorage` de una sola persona.

## Dónde vive

- `components/liquidacion/` — `Liquidacion.tsx` (1.331 l.: la portada, la campaña por dentro y el
  aviso de ofertas colgadas) · `DefinirPrecio.tsx` (582) · `Resultado.tsx` (513) · `Revision.tsx`
  (389) · `Bitacora.tsx` · `MandarALiquidacion.tsx` · `CeldaEnSale.tsx`.
- `lib/liquidacion/` — `core.ts` (avisos, topes, `reprecificar`, `porEscalera`) · `resultado.ts` (el contraste
  contra lo cobrado, y los agotados que no cierran) · `bitacora.core.js` + `.ts` ·
  `colgadas.core.js` + `.ts` · `vendido.core.js` + `.ts` · `ventas.ts` · `persistencia.ts` ·
  `tipos.ts`.
- Handler: `api/_liquidacion.js` (1.280 l.), por `/api/datos?recurso=liquidacion`. **No es una
  función de Vercel**: entra por la puerta de `datos.js` (ver el invariante de las 12 funciones).
- Tablas: `liquidaciones` · `liquidacion_items` · `liquidacion_bitacora` (`sql/migrate-liquidacion*.sql`).
  Lee además `inventario`, `ventas`, `venta_detalles` y `sync_state`.
- Tests: los nueve `tests/liquidacion-*.test.ts`, más el candado de permisos en
  `tests/handlers-autorizacion.test.ts`.

## ⛔ Lo que comparte con otras secciones

- 🔴 **`api/_liquidacion.js` tiene CUATRO llaves, no una**, y tres de ellas no son de Liquidación:
  Etiquetas (`?etiquetas=1`), Análisis (`?vendido=1`, para la marca «en sale» de Por producto,
  Variantes y Ventas mensuales) y la única escritura que abre Etiquetas (`action:'etiquetado'`).
  Tocar el gate de arriba del handler le cambia el acceso a gente que no tiene esta sección. El
  porqué de cada una está comentado ahí mismo, arriba del `puedeVerAlguna`.
- **`lib/liquidacion/vendido.ts` lo consumen tres pantallas de Análisis** (`ProductosTable`,
  `VariantesTable`, `VentasMensuales`). Un cambio ahí se ve en secciones que nadie asocia con el sale.
- ⚠️ **`canalDe` (`resultado.ts`) NO es `esVentaTecnica` (`lib/etl/helpers.ts`) y no hay que
  unificarlas.** Contestan preguntas distintas y el canal vacío cae de lado opuesto en cada una — ya
  está comentado en las dos puntas, con el número medido.
- **Etiquetas depende de la bitácora de acá**: la cola de reetiquetado se arma leyendo
  `liquidacion_bitacora`, no las campañas. Ver `lib/etiquetas/cola.core.js`.

## Reglas que el código no dice

- 🔴 🔑 **Desde el 16-ago-2026 todos los descuentos se cargan desde el Monitor** (decisión de Bruno).
  Lo que lo motivó: el 15-ago Gestión Nube tenía **404 promos vivas** en Zattia y la bitácora conocía
  **262** ⇒ 142 cambios de precio invisibles para el reporte, para la marca «en sale» y para
  cualquier control. Con el agujero cerrado, **la bitácora es la lista completa de cambios de precio
  de la marca**, y de ahí cuelgan la cola de reetiquetado y el aviso de ofertas colgadas.
- 🔴 ⛔ **El Monitor escribe SÓLO el precio promocional.** El de lista (`retailer_price`) se sigue
  cargando a mano en GN. No es pereza: es el `precioNormal` de **todas las fotos congeladas**, así
  que moverlo invalidaría la base de comparación de las campañas vivas, y además pide parametrizar
  el PATCH y un `ALTER` del `check` de `liquidacion_bitacora.modo`.
- 🔑 **La foto del producto se congela al entrar a la campaña** (costo, precio, stock, ventas). Si
  leyera el ETL de hoy, un producto definido la semana pasada mostraría otro margen que el que se
  aprobó — y el ETL no guarda historia, así que el número viejo no se recupera.
  🆕 **La miniatura se toca y la foto se abre en grande**, tanto en la lista como en la ficha del
  modal. A 36 px se ve que hay una prenda, no cuál: el color y el largo —lo que decide si el precio
  es el que corresponde— sólo aparecen a tamaño completo, y hasta ahora el único camino era entrar
  a «Definir» producto por producto (la feria de Zattia son 351). Es el `Lightbox` del kit; la
  imagen guardada ya es la de 1024 px, así que no hay una segunda lectura de Tienda Nube.
- 🔑 **El estado de la campaña sigue a lo que hay puesto en Gestión Nube, en los DOS sentidos.**
  Poner la deja `aplicada`; **sacar la última oferta la devuelve a `en_curso`**. ⇒ una campaña que se
  levantó bien y una que nadie levantó **se ven igual desde el estado**: cualquier chequeo de «esto
  ya no debería estar puesto» necesita mirar también la fecha (es lo que hace `colgadas.core.js`).
- 🔑 **`liquidaciones.datos` es `jsonb`**: un campo nuevo de la campaña viaja **sin migración**. Por
  ahí entró el **`tipo` de campaña** (`liquidacion · promo · ajuste`, 17-ago-2026). 🔑 **El motor
  nunca supo de liquidaciones** —escribe un número y lo saca—, así que el tipo no bifurca nada: sólo
  apaga **por clave** los avisos que dan por sentado que el precio baja (`no-es-descuento` y
  `ya-en-oferta`, en «ajuste») y cambia rótulos. ⛔ **Lo que NO apaga es la plata**: `bajo-costo` y
  `sin-costo` siguen frenando en los tres tipos, y hay un test marcado 🔴 que lo sostiene. Las
  campañas viejas no traen el campo: `tipoDe()` las lee como `liquidacion`, y el default de `avisos`
  es el mismo, o sea que un llamador que se olvide del tipo **avisa de más, nunca de menos**. La
  lista de tipos válidos vive en `lib/liquidacion/tipo.core.js` porque **la valida el handler**.
- 🆕 🔑 **Confirmar en masa se hace desde la lista de Productos, marcando.** Cada fila tiene un
  tilde, «Marcar los N que se ven» marca de una todo lo confirmable del filtro actual —filtrar
  «Definidos», buscar «CORPIÑO» y marcar— y la barra confirma la tanda. Lo pidió Bruno: la vista de
  Productos tiene el buscador y el filtro de estado, así que es donde se puede elegir *qué* se
  confirma; la pestaña Revisión sólo sabía «confirmar todos los que faltan».
  🔑 **La selección sobrevive al filtro y a la búsqueda** —revisar 351 es ir juntando por
  tandas— y por eso la barra dice **cuántos quedaron marcados fuera de lo que se está viendo**: sin
  ese número, achicar la búsqueda y apretar confirmar toca productos que no están en pantalla.
  🔑 **Un OBJETADO no entra nunca**, aunque se lo marque: la regla es `itemsSinRevisar` del núcleo
  —`faltanRevisar` menos `objetados`—, la misma que lista la pestaña Revisión. Alguien lo miró y
  dijo que no; barrerlo en una tanda de cincuenta borraría la objeción sin que nadie leyera el
  motivo. Marcar un confirmado, un pendiente sin precio o un descartado tampoco rompe nada: no
  entran, y la barra lo dice con el número.
  🔑 **Los dos caminos usan el mismo motor** (`confirmarEnMasa`), así que el cartel que nombra
  **cuántos tienen un aviso ALTO** —precio bajo el costo, costo que no vino de GN, sin precio de
  lista— aparece igual por los dos lados. Es lo único que la revisión de a uno hubiera cazado.
- 🆕 🔑 **«Compartir con Marketing» abre la lista de precios SIN abrir la sección** (10-sep-2026).
  Pedido de Bruno con fecha encima: la Feria de Septiembre arranca el lunes 14 con 351 precios
  decididos y **sin publicar en la tienda** —va oculta en Tienda Nube—, y quien arma las piezas ⛔ no
  podía verlos. Marketing ⛔ **no** ve esta sección a propósito (acá hay costo y margen), así que lo
  que se abrió es la sección **`precios`** (`docs/secciones/precios.md`), que sirve una proyección
  por lista blanca: foto, lista, precio, % off, stock. El botón es de **admin** y escribe
  `datos.compartida` en la campaña, **leyendo y reescribiendo `datos` en el servidor** — el flag ⛔
  nunca viaja en el body, por el mismo motivo que `confirmado`. ⛔ Una campaña `cerrada` no se
  ofrece: sus precios ya no rigen.
- 🆕 **La ⭐ de la fila es «producto estrella DE esta campaña»**, y ⛔ no la general del producto (esa
  vive en Análisis → Por producto, con el mismo botón). Va acá porque **el momento de decidir cuál
  se comunica es éste**: quien barre los 351 precios es quien sabe cuál es la oferta que vale
  contar. La tabla y las dos preguntas, en `sql/migrate-destacados.sql`. 🔑 **Marcar pide lo mismo
  que ver** (decisión de Bruno) — al revés que `clavados`, que es de admin.
- 🔴 **El sub-permiso `liquidacion.aplicar` no se hereda de la función**: hay que tildarlo a mano, y
  en las dos marcas. Es el único permiso del Monitor que escribe precios en la tienda.
- 🔑 **Hay DOS masivos de precio y contestan preguntas distintas.** `reprecificar` mueve la campaña
  entera un % **sobre el precio de lista** — para terminar un sale sin volver de golpe a lista.
  `porEscalera` reparte los productos en **mesas de precio redondo**, y ahí el precio lo fija la
  mesa y no el producto: cada uno va al **primer escalón `>=` su costo**, que es la promesa de una
  mesa («nada de acá cuesta más de lo que la mesa cobra»). ⛔ **El que no entra en ningún escalón
  NO se toca** —mandarlo al más alto lo remata abajo del costo sin decisión de nadie— y ⛔ **el que
  ya tenía ese precio no vuelve a la cola de revisión**: correr la escalera dos veces mientras se
  arma una feria no puede desconfirmar lo que alguien ya miró. Los dos guardan por `decidir-masivo`,
  o sea que **ninguno toca la tienda**: escribir sigue siendo `aplicar`. 🔴 **«Precios de mesa» se
  dibuja mientras la campaña no esté `cerrada` (`campaniaEditable`), ⛔ no con la condición de
  `reprecificar`**: nació con esa —`en_curso` o `aplicada`, la de «terminar un sale»— y el botón
  **no aparecía en la campaña recién creada**, que nace en `borrador` y es donde se cargan los
  precios. Lo cazó Bruno abriendo la pantalla, ⛔ no un test.
  ✅ **Ejercido en prod el 5-sep-2026** con dos productos de «Feria Septiembre 2026»: el cartel
  dijo «Repartir 2 productos en 2 mesas · $19.900: 1 · $24.900: 1» y **la base quedó con los dos
  números redondos, los ítems en `definido` y la bitácora en CERO** — o sea que no tocó la tienda.
  ⛔ **El `window.prompt` lo tiene que apretar una persona**: un diálogo nativo congela el puente
  de Chrome, así que este camino ⛔ no se puede caminar desde una sesión de IA. 🔑 Un precio de mesa
  **no pasa por el redondeo a 90** (`precioDeSale` con `precioSale` sólo hace `Math.round`): el
  número del cartel es el que se guarda.
- 🔑 **`TOPE_APLICAR` es 5 y lo fija el tope de Gestión Nube** (60 consultas/minuto, compartidas con
  los otros sistemas de la casa) ⇒ el bucle de una campaña de 260 vive **en el cliente**, con barra
  de progreso, no en el handler. Cualquier acción nueva que escriba precios en lote hereda eso: si no
  entra en una llamada, manda a la campaña en vez de duplicar la máquina.
- 🔑 **Hay OCHO reglas distintas de «el precio que el cliente paga» en el repo**, sobre los mismos dos
  campos de Tienda Nube. En agosto de 2026 se unificaron **sólo dos** —Etiquetas y el chequeo de
  exhibición, que se contradecían y hacían imprimir un precio más caro que el de lista— en
  `precioDeGondola`. ⛔ Las otras seis (Márgenes, Comisiones, SALE, Canjes…) quedaron como estaban a
  propósito: tocarlas cambia números que la gente ya usa.
- ⚠️ **Los números de stock salen del espejo, que se sincroniza una vez por día** (~6 UTC). `inventario`
  no tiene fecha propia: de cuándo es el número lo dice `sync_state.updated_at`, y por eso viaja hasta
  la pantalla. Una lista que manda a alguien a caminar por el local no puede decir «recién» sobre un
  dato de ayer a la mañana.
- 🔑 **En «Se resigna», una suba RESTA: no cuenta cero.** El `Math.max(0, …)` que había escondía los
  productos que quedaron arriba del precio de lista —en una liquidación eso es un error que el
  resumen tapaba, y en un ajuste que sube a propósito el número no cerraba—. Medido antes de
  sacarlo: **cero ítems arriba de lista en las dos marcas**, o sea que ninguna campaña existente
  cambió de número.
- 🔑 **Al conciliar stock se cuenta TODO lo que descuenta unidades** —mayorista, canjes y fallas
  incluidos—, al revés que el resto de `resultado.ts`, que los excluye para no hundir el precio
  promedio. Las dos reglas conviven en el mismo archivo y las dos están bien.

## Lo que ya se rompió acá

- 🔴 **La pestaña «🏷️ Liquidaciones» de Etiquetas mostraba CERO justo el día que más hay para
  etiquetar.** Al sacar la oferta cada ítem vuelve de `aplicado` a `confirmado`, y la lista sólo
  tomaba `aplicado`. La reemplazó la cola de reetiquetado, que lee la bitácora.
- 🔴 **`ventas-campania` estaba debajo del guard del id de campaña** y contestaba `400 falta el id`
  a un request perfectamente válido — el mensaje mandaba a buscar el problema al lado equivocado. Las
  acciones que preguntan por productos y no por una campaña van **arriba** de ese guard
  (`ventas-campania`, `stock-campania`).
- ⚠️ **Dos docblocks afirmaron durante días que el token no podía escribir precios**, cuando GN ya
  había habilitado la ability el 13-ago-2026. Una afirmación vieja en un docblock manda a construir
  el rodeo de nuevo: se corrigieron en `resultado.ts` y en `Liquidacion.tsx`.
- 🔴 **Un 200 de Gestión Nube no quiere decir que el precio se movió.** Es el modo de falla clásico
  de esta integración («lo cargué y se revirtió solo»): el aplicador compara lo que devuelve el PATCH
  contra lo que quiso escribir, y **la bitácora se anota recién ahí** — registrar la intención diría
  que el cliente vio un precio que nunca estuvo puesto.

## Pendiente

- ⛔ **La sección no se renombra** aunque ya acepte promos y ajustes: renombrarla toca el sidebar, el
  espejo `SECCION_AREA` ↔ `PERM_CAT.area`, los permisos guardados de cada usuario y el ícono. Si se
  decide, va aparte y a propósito.
- 🔴 ⛔ **El tipo de campaña no se ejerció a mano**: nadie creó todavía una campaña de «ajuste» ni le
  escribió una suba a Gestión Nube. El handler y el núcleo están cubiertos con mutantes, la pantalla
  no.
- 🔴 ⛔ **El aviso de ofertas colgadas no se ejerció a mano**, porque al escribirlo no había ni una:
  la única campaña seguía viva. El botón «Sacarles la oferta» reusa `aplicar`, que sí está ejercido,
  pero el camino entero —aviso → botón → la oferta sale de la tienda— nadie lo caminó.
- ⏸️ **Los sub-permisos de Etiquetas**: declarados (las seis pestañas, desde el 17-ago) y **sin un
  solo `puedeSub` que los consulte** ⇒ hoy las pestañas las ve cualquiera que tenga la sección.
  Ejercerlos puede dejar a alguien sin una que usa; borrarlos es decir que Etiquetas es todo o nada.
  Decide Bruno.
- ▶️ **Etiquetas no tiene ficha** y comparte handler, bitácora y regla de precio con esta sección.
  La escribe quien la toque.

## Cómo se prueba

```bash
npx vitest run tests/liquidacion-resultado.test.ts --reporter=dot   # y los otros nueve
```

- 🔴 **El mutante que hay que ver caer**: copiarle a `agotadosQueNoCierran` el filtro de canal de
  `resultadoCampania` (excluir mayorista y técnicas). Da verde en la cabeza y en la pantalla acusa al
  local de perder prendas que salieron bien. El test que lo caza está marcado 🔴 en el archivo.
- 🔴 **El candado de permisos se ejerce, no se argumenta.** `tests/handlers-autorizacion.test.ts`
  recorre las `action` del POST con la llave de **Etiquetas** y exige 403 en todas menos
  `etiquetado`. **Una `action` nueva se agrega a esa lista**: sin eso, la garantía vuelve a ser una
  frase en un comentario.
- **Medir contra la base, no estimar**: `psql "$DATABASE_URL_ZATTIA"` / `_BDI` (están en el `.env`)
  llega a cualquier tabla de las dos marcas desde local. Es como se midieron los agotados que no
  cierran y las ofertas colgadas antes de escribir una línea — y es lo que mostró que **el caso que
  el plan daba por seguro no existía**: el botón «sacar» barre todos los `aplicado`, agotados
  incluidos.
- ⚠️ **Escribir precios de verdad no se ensaya**: `aplicar` le pega a Gestión Nube en producción y no
  hay sandbox. Se prueba con un producto y se mira en la tienda.

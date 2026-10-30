# Reposición — ficha de sección

Sección `reposicion`, área `administracion`. Qué llevar del depósito al local y qué devolver. **Las
dos marcas reponen según ventas** con la misma pantalla (`ReposicionZattia.tsx` + `porVentas.ts`):
Zattia desde el 11-oct-2026 (con selector **Zattia / Stunned**) y **BDI desde el 12-oct** (ver «BDI»
abajo). El mínimo fijo por categoría/modelo de `core.ts` quedó sin pantalla. Las reglas de Zattia las decidieron Darío y su socio ese día, medidas
contra las ventas reales; la conversación entera está en la nota viva de Darío (Claude Docs).

## Dónde vive

- `components/reposicion/Reposicion.tsx` — BDI (y el modal viejo de mínimos/topes). Para Zattia
  monta `ReposicionZattia.tsx`: dos pestañas, la config por línea y la tabla con el porqué.
- `lib/reposicion/porVentas.ts` — el cálculo de Zattia (puro). `pdf.ts` — la hoja A4 (compartida con
  BDI). `rollo.ts` — el rollo de 80 mm de «Devolver al depósito». `cliente.ts` — inventario, ventas
  (`ventasLocal(marca, días)`), hora del sync, guardado.
- Config: KV de **bdi-catalogo** (`/api/reposicion` → `api/ingresos.js?kind=reposicion`), una clave
  por marca. Zattia guarda `ventas` y `ventasStunned` adentro del mismo objeto.
- **Armar con el lector** (Zattia, 12-oct-2026): `components/reposicion/ArmadoLector.tsx` (la
  pantalla de Lorena) · `lib/reposicion/armado.ts` (qué hacer con cada código + cliente) ·
  `lib/reposicion/armado.core.js` (sanear y qué se transfiere, compartido con el servidor) ·
  `api/_repo-armado.js` por `api/datos.js?recurso=repo-armado` · tabla `repo_armado` en la base de
  ZATTIA (`sql/migrate-repo-armado.sql`, se corre en el SQL Editor: no hay `DATABASE_URL` en `.env`).
- Tests: `reposicion-ventas` (Zattia) · `reposicion-core` (BDI) · `reposicion-sync-reloj` · `repo-armado`.

## ⛔ Lo que comparte con otras secciones

- **La config la leen también Conteo (`catsOff`) y Sesión de fotos / Solicitudes (`prioridadRetiro`)**
  vía `lib/reposicion/cfg.ts`. 🔴 La pantalla guarda la config **ENTERA** que leyó: un campo que
  `leerRepoConfig` no mapea **se borra en el próximo guardado**. Campo nuevo → sumarlo ahí (lo cubre
  un test).
- `pdf.ts` es de las dos marcas: `FilaA4` **sin `local`** = papel sin columnas de stock (Zattia).

## Las palabras de la pantalla (Darío, 12-oct-2026)

«Se usa mucho texto y pocas palabras formales.» Pestañas **Reposición** / **Devolución**; columnas
**Venta semanal · Stock ideal · Motivo**; botones **Iniciar armado · Finalizar · Transferir N
prendas · Actualizar stock · Imprimir A4 / ticket**. El **Motivo** dice sólo lo que las columnas
no dicen (vacío en el caso normal). **Una sola tabla** con el producto como separador: antes era una
tabla por producto con los encabezados repetidos. Antes de sumar un texto, ver si ya lo dice otra
columna.

## Reglas que el código no dice

- 🔑 **«Local» en GN = lo colgado + el depósito del local.** Con 1 en Local, ese 1 es la exhibida, y
  descolgarla cuesta (precio, alarma, lugar). Por eso nunca menos de 1 exhibida + 1 de reserva.
- 🔑 **El mínimo depende de lo que vende** (en 60 días): 2 si vende menos de 1 por semana, 3 si vende
  más. Medido: 2.055 u en el local contra 2.507 con 3 parejo, y 29 variantes en riesgo contra 91 con
  2 parejo. La última semana **sólo sube la reserva** de lo que se disparó; ⛔ no decide el piso
  (una venta suelta le subía el mínimo a todo).
- 🔑 **Se repone todos los días y de a una** (`loteMin` 1, «estructura chica»): reserva para 2 días.
- 🔑 **Los «topes por producto» de la pantalla vieja NO se aplican en Zattia** («anticuados»): se
  pusieron para el mínimo fijo y pisaban a las ventas. Siguen guardados porque BDI los usa. Los
  **apagados sí** se respetan.
- 🔑 **Devolver al depósito es la mitad que faltaba**: el local se llenó porque sólo existía el
  camino de ida. Desde el 15-oct es una **solicitud** sin tope (ver abajo); `topeDevolucion` quedó
  guardado pero sin uso.
- 🔑 **Confirmar una devolución apaga el producto de la reposición, para siempre** (Darío, 26-oct-2026:
  «se apague cuando se confirma y de forma definitiva; si luego se quiere volver a vender, hay que
  prenderlo manualmente»). Usa `cfg.apagados` (la lista de siempre, ya respetada por `porVentas`) con
  `lib/reposicion/sinReponer.ts`: frena el «llevar», ⛔ no el «devolver». «Sacar» un producto de
  Confirmados lo vuelve a prender. Se ve y se prende en Configurar → «Sin reponer» (`Volver a reponer`).
  ⚠️ Es la misma lista que las categorías/productos «no reponer» de BDI. Hoy sólo se dispara desde la
  Devolución de Zattia/Stunned (BDI la tiene oculta). `tests/reposicion-sin-reponer.test.ts`.
- 🔑 **Los papeles llevan sólo lo que se hace** (Darío): ⛔ ni stock ni ventas ni «para exhibir». El
  A4 de Lorena: producto · talle · cuánto · una casilla (tilde / cruz / número, **en palabras**:
  Helvetica no tiene ✓ ni ✗). El rollo de Camila: SKU · «PRODUCTO - variante» · Cant. · Listo.
- 🔑 **Orden:** Camila (local) **por SKU**, que es como está ordenado el depósito del local. Lorena
  **por ubicación** del depósito (la observación de GN, hoy vacía en Zattia) y sin ubicación por SKU.
- 🔑 **OUTLET («SIN CAMBIO») y ACCESORIO** son «todo exhibido» por el nombre: no tienen categoría en
  GN. Una marca por producto les gana. «Por categoría» se sacó de la pantalla (TN mezcla «BEST
  SELLERS» y «(sin categoría)»); el cálculo la entiende igual (`modosCat`).
- ⚠️ **Stunned tiene su config propia** (`ventasStunned`) pero hoy con los mismos valores: sus
  condiciones quedaron para más adelante.
- ⚠️ **Configurar y Recargar los VEN sólo Darío y Bruno** (`puedeEliminarTn`, la regla de Caducados;
  Darío 12-oct-2026: pantalla más simple para quien arma). El POST a bdi-catalogo lo acepta
  cualquiera del equipo: el freno es la pantalla.
- Si «Actualizar stock» tarda, ⛔ no se pide tocar Recargar: la pantalla mira `sync_state` cada 30 s
  (hasta 10 min) y se pone al día sola.
- ⚠️ Un día sin stock en el local cuenta como día sin venta: el sistema no guarda el stock día por día.

## BDI (Darío, 12-oct-2026)

«Hoy no se devuelven fundas y eso es lo que más me preocupa, porque se podrían vender»: la funda
guardada en el local no se vende online (el online sale del Depósito Minorista). Todo se edita en
Configurar; los defaults son `CFG_VENTAS_BDI`.

- 🔑 Cuentan **sólo las ventas del local**. **Mínimo 1**; **2 en los modelos que venden ≥ 10 fundas
  por semana** sumando diseños (hoy la línea 17) — umbral alto a propósito: se repone a diario.
- ⛔ **Ese 2 exige que el DISEÑO venda** (`ventaDisenoMin`: 4 en 60 días, sumando todos sus modelos):
  «FLUX CASE no vende nada de nada y pide 2». Un **diseño nuevo** (< `diasNuevo`) de un modelo de
  venta alta arranca con 2 sin ventas; después se lo mide como a todos.
- 🔑 La reserva **redondea** en BDI (`ceil` le daba 2 a ~500 variantes con una venta en 60 días).
- 🔑 **Siempre queda `reservaDeposito` (1) en el depósito** para la venta online.
- ⏸️ **Devolución EN PAUSA** (Darío, 12-oct-2026: «pendiente de analizar»): la pestaña no se muestra
  en BDI. El cálculo está hecho (100 por día; la limpieza inicial medida ese día: ~1.400 fundas).
- 🔑 **Vidrios que venden **≥ 2 por semana** (`umbralCaja`): POR CAJA de 10 — debajo, de a 1 («uno que vende 1 por mes no puede recibir una caja»)** (`cajaTemplado`). Se pide una caja
  cuando en el local queda **una semana de venta** o menos (`diasPedidoTemplado` 7; Darío: «sino me pierdo ventas», sin excepciones por producto), y no se devuelve hasta
  pasar de lo que deja una caja. Darío: salían «de a 1 o 2, una locura» y el del 17 Pro igual se
  quedaba sin stock. Sin caja entera en el depósito, se lleva lo que hay. El que casi no vende, de a 1.
  🔑 **La caja cerrada NO tiene etiqueta** (9D Premium y Antiespía Premium vienen de a 10 y se
  etiquetan al abrirlas): en el armado ese renglón trae el botón **«Caja cerrada (+10)»** y no se
  escanea (`LineaPedido.caja`, sólo en «llevar»). Las sueltas ya etiquetadas se escanean de a una.
- Por caja van SÓLO el **9D Premium y el 9D Antiespía Premium** (`VIENE_EN_CAJA`). El **9D común** se está por discontinuar (de a 1). El **HIDROGEL** se compra directo al local y no pasa por el depósito: fuera de las listas (`REGLAS_NOMBRE_BDI`).
- **Accesorios**: mínimo 1; los que venden **≥ 2 por semana** tienen en el local **lo de una semana** (`umbralAccesorio`/`diasAccesorio`; hoy el enchufe y el cable Lightning BDI ≈ 4). Darío: «vamos a ir agregando más accesorios y gadgets, es esencial que de todo haya la cantidad justa» → todo sale de las ventas, sin cargar nada por producto.
- **Accesorio con variantes**: si el PRODUCTO (sumando variantes) vende ≥ 2 por semana, **2 de cada variante** (funda para cargador: 4,2/sem entre 5 diseños).
- **Vidrios: mínimo 2 en el local** (`minimoTemplado`; Darío: «son muy baratos, lo peor sería no tener»; que no haya en el depósito es error de COMPRA, no de reposición).
- `tipoBdi`: funda / templado / accesorio por prefijo de SKU (`F-`, `ATE-`, `AC-`/`SW-`) y, sin SKU,
  por el nombre; el nombre «templado/hidrogel/vidrio» le gana al SKU (hay un vidrio cargado `AC-0057`). **Sólo las fundas suman al modelo** (los templados también dicen «iPhone 17 Pro»).
- **Karen arma las DOS listas** con el lector en la compu del local (depósito 13307 → local 18393).
  Sin «para exhibir», sin reglas por nombre y sin etiquetas: son de la ropa.
- Los «topes por producto» viejos ⛔ no se aplican; los **no reponer** sí, y junto con las categorías
  a ignorar (las lee Conteo) se editan en `OpcionesBdi.tsx`.

## El correo de los lunes (BDI, 12-oct-2026)

Lo que la reposición descubre y no puede resolver, porque son decisiones de Darío: «la reposición se
ajusta sola; lo que hay que mirar es lo que ella no puede arreglar». `lib/reposicion/semanal.core.js`
(puro, `tests/reposicion-semanal.test.ts`) · `scripts/reposicion-semanal.mjs` (sólo lee BDI) ·
`.github/workflows/reposicion-semanal.yml` (cron de GitHub los lunes: que llegue tarde da igual).

1. **Para comprar: se vende y no queda en el depósito**: ≥ 4 ventas minoristas en 60 días y depósito
   ≤ 1 (la reserva online). ⛔ **Sin fundas** (casi todas se importan: no es compra de acá) ni el
   HIDROGEL (va directo al local) ni el 9D común (`DISCONTINUADO`: se está por discontinuar). `tipoBdi` vive en `lib/reposicion/tipo-bdi.core.js` por los scripts.
2. **No encontradas al armar**, últimos 7 días (si la tabla todavía no está, va sin esa lista).
3. **Sin ninguna venta en 60 días** (ningún canal, alta de más de 60 días), **sólo el primer lunes del
   mes**: de una semana a otra casi no cambia.

Medido el 12-oct: 41 sin depósito (encabeza STELLAR 17 Pro, 4,3 por semana) y 39 productos sin ventas.

## Armar con el lector (tanda 1 del escaneo, 12-oct-2026)

Lorena escanea en la **COMPU** del depósito, con lector, contra la lista de «Llevar al local»
**congelada al empezar**; al terminar, el Monitor hace la transferencia depósito → local en GN
(`POST /inventario/transferencia`, Zattia: depósito 18210 → local 11780).

- 🔑 **La transferencia sale al final y SÓLO con lo escaneado**, cortado en lo pedido (lo corta el
  servidor también). Lo no escaneado se contesta «no estaba» / «para después» y no se mueve.
- 🔴 **Nunca dos transferencias del mismo armado**: `en_curso → transfiriendo` con un update
  condicionado antes de llamar a GN, índice de «uno abierto por lista», y ⛔ **el POST a GN no se
  reintenta** salvo 429. Un 500 o un corte quedan en `revisar`: alguien mira GN y contesta.
- 🔴 **Recién transferido, la lista sigue igual hasta el próximo sync**: «Armar» queda bloqueado
  mientras el stock sea anterior a la transferencia (si no, se pide dos veces lo mismo).
- Lo que sobra o no estaba pedido **frena la pantalla** (cartel rojo, ⛔ no el `Modal`: el Enter del
  lector lo cerraba), igual que Conteo. La primera de una «para exhibir» se canta y se marca.
- El cartel rojo se cierra con **Esc o la barra espaciadora** (Darío, 12-oct-2026). ⛔ **Enter no**: el
  lector manda Enter después de cada código y lo cerraría sin que nadie lo lea. Dice «Artículo NO
  solicitado» + «Este producto no se encuentra en la reposición de hoy.» (sin «dejalo en el estante»).
- 🔈 **La voz calla en el caso normal** (Darío, 12-oct-2026: repetir cada producto «lo hace extenso»):
  prenda bien escaneada = sólo pitido (uno si faltan, dos al completarse). Habla sólo «Para exhibir» y
  los errores («Excedente», «No solicitada», «Código desconocido»).
- **Historial** (pestaña, `HistorialArmados.tsx`, `?action=historial`): un renglón por armado (sin
  los descartados) con horario, duración, pedidas/escaneadas/no encontradas y el detalle; arriba,
  **«Más veces no encontradas»** = la señal de stock mal cargado. Sólo cuenta armados transferidos.
- 🔴 **Que no quede trabada** (revisión del 12-oct-2026): a GN se le esperan como mucho 20 s
  (`PLAZO_GN_MS`, reintentos de 429 incluidos) porque el servidor se corta a los 30 s; si no contesta,
  queda `revisar`. Un `transfiriendo` de más de 90 s (`trabado`, el servidor se cortó o no pudo anotar)
  muestra los mismos botones que `revisar`. La lista lo vuelve a mirar cada 30 s.
- 🔴 **Que nadie la repita a mano**: si la respuesta no llega (internet, servidor cortado, «ya se
  cerró»), la pantalla mira cómo quedó el armado antes de mostrar un error: transferida → «realizada»;
  sin confirmar → «⛔ no la hagas a mano» y vuelve a la lista. Reintentar «Transferir» es seguro: el
  candado no deja que salga dos veces.
- 🔑 **Qué buscar en GN**: la descripción lleva el código del armado (`… · Monitor #K3X9AB (12 u)`,
  `codigoArmado`) y el cartel rojo lo muestra con la hora y las prendas. «No está: transferir de nuevo» pide confirmación (botones renombrados por Darío, 12-oct: «figura» no se entendía).
- Lo escaneado vive en `localStorage` (`monitor_repo_armado_<id>`) y se sube cada 1,5 s.
- 🔑 **Con el armado empezado, las cantidades son las del ARMADO** (Darío, 17-oct-2026). Antes, lo
  cambiado a mano en la lista vivía sólo en esa pantalla (`manual`, estado de React): en otra compu,
  con el mismo usuario, volvía el cálculo. Ahora, con un armado `en_curso`, la tabla muestra
  `armado.pedido` y cada cambio va a `action: 'cantidades'` (`cambiarCantidades` en
  `armado.core.js`): 🔴 nunca por debajo de lo escaneado o transferido, 0 sin escanear = sale de la
  lista, la lista no queda vacía. La lista se vuelve a mirar cada 20 s y el lector cada 15 s, así lo
  cambiado en una compu aparece en la otra. Antes de «Iniciar», lo cambiado sigue siendo de la
  pantalla y entra al armado al iniciar.
- GN es atómico: un 422 no movió nada; la pantalla muestra los renglones rechazados y ofrece
  sacarlos (quedan `rechazada`: diferencia de stock para la tanda 3).

## Devolución con el lector (tanda 2, 12-oct-2026)

Camila escanea en la **compu del local** la lista de «Devolución» y al **Finalizar** el Monitor
transfiere **local → depósito** (decisión de Darío: la opción A, sin re-escanear al recibir). Aviso
fijo: **«Retirar solo de la reserva, nunca la exhibida.»** Lo que sobra está en el depósito del local
(la trastienda, ordenada por SKU), no colgado.

- 🔑 **La limpieza grande** = la misma pantalla con «Ver todo» (sin tope diario) + **«Transferir y
  continuar»**: pasa lo escaneado hasta ahí y la lista sigue abierta, para hacerla en varios viajes del
  carro o en varios días. Una sola compu (Darío).
- 🔴 **Cada tanda manda SÓLO la diferencia**: lo ya transferido vive en `transfer.transferido` y cada
  tanda en `transfer.tandas`. El servidor no deja que lo escaneado baje de lo transferido (`conTransferido`),
  ni descartar un armado con tandas (esas prendas ya cambiaron de depósito). Un `revisar` a mitad de una
  tanda guarda lo que iba en `transfer.enCurso` y `resolver` lo suma.

## La devolución es una SOLICITUD (Darío, 15-oct-2026)

«Parece que todas las devoluciones valen lo mismo y hay que traer cerca de 700 productos»: la lista
diaria con tope (30) se reemplazó por una solicitud que deciden **Darío o Bruno** (`esAprobador` en
`armado.core.js`, la misma regla que `puedeEliminarTn`). `components/reposicion/SolicitudDevolucion.tsx`
+ `lib/reposicion/solicitud.ts` (puro, `tests/reposicion-solicitud.test.ts`).

- **Propuesta**: lo que sobra, **por producto**. 🔑 Orden: primero **sin ventas en 60 días** (sumando
  TODAS las variantes del producto), después **lo que más sobra**. ⛔ Sin tope diario («30 tops es re
  poco; 30 jeans se complica»): lo pone quien elige. No propone lo que ya está confirmado o en el local.
- 🔴 **Las ventas del producto incluyen los talles AGOTADOS** (19-oct-2026): `filas` sólo trae variantes
  con stock, y sumar desde ahí perdía las ventas del talle que se vendió y se agotó. Medido: 9 de los 39
  «sin ventas» habían vendido (Short Cliff 3, todas del 40 y 42; Top Laia 7). Ahora sale de las ventas
  por variante (`vendidasPorProducto(vv)`). ⏭️ Las ventas con canal «Ninguno» (25 en 60 días; Short
  Nate) siguen sin contar en ningún cálculo: falta que Darío diga qué son.
- 🔑 **«Con ventas» va por SEMANAS DE STOCK** (Darío, 19-oct-2026: «primero retirar los que más tiempo
  de venta pueden llegar a tener»): lo del local (todas las variantes) ÷ la venta semanal del producto,
  con `d.dias` (lo nuevo se mide con sus días de vida). Antes era «lo que más sobra»: Top Zara (28
  ventas) salía tercero. Columnas nuevas: **Alta en TN** y **Promo** (Sí/No, `promo_price` < `price`,
  cruzado con `matchTn` como las categorías) y **buscador** (`filtrarPropuesta`: nombre, categoría,
  código o SKU, sin tildes; lo elegido sigue elegido aunque se esconda).
- **Confirmados**: se confirma en varias veces; vive en `repo_armado` con estado **`sin_enviar`**
  (acción `confirmados`, GET y POST). ⛔ No es un armado: fuera del historial, del «hoy» y del índice
  de «uno abierto». Vacío = `cancelado`. ⚠️ No se llama «borrador»: el test del VOCABULARIO lo frena.
- **Cerrar solicitud** → resumen (productos, prendas, etiquetas de bolsa, sueltas) → **Enviar al
  local** (`enviar`): pasa a `en_curso` con `persona` vacía (la firma quien la arma, al primer
  guardado) y `transfer.solicitud = { por, hora }`. Si el local no terminó la anterior, el índice
  único frena el envío (409) y la solicitud queda guardada.
- ⛔ `abrir` con `sentido: 'devolver'` da 400: la devolución sale SÓLO de una solicitud.
- 🔑 **Bolsa por producto** (`LineaPedido.bolsa`): las etiquetas de 10 × 15 se imprimen en el local
  **antes de juntar** (`buildSkuGrandePdf`, con clave en Zattia). Por defecto van sueltos los códigos
  **RJE/RSH/RBE** y los nombres JEAN/SHORT/BERMUDA; ⛔ la categoría no cuenta («FALDAS Y SHORTS» es una
  mini, «FADE #002» es bermuda). Lo que se cambia a mano queda en `ventas.bolsaProd`.
- Al escanear, la pantalla dice **«Bolsa nueva RTO-0065»** (la primera del producto), **«A la bolsa…»**
  o **«Suelta al carro»**. La voz sigue callada.
- Medido el 15-oct: 633 prendas sobran en 225 productos; 45 sin ventas (129 prendas).
- ⏸️ BDI sigue con la pestaña oculta. Su prioridad pedida: primero los diseños que venden online y
  no tienen depósito (hoy BDI sólo mira ventas del local: falta traer las online).

## Stunned: la transferencia vive en el ERP (corte 28-oct; lista única 30-oct-2026)

- 🔑 **Qué línea va por el ERP lo dice UNA tabla**: `TRANSFERENCIA_EN_ERP` de `lib/erp/transferencia-doc.core.js` (hoy sólo
  `stunned`, con su llave `TRANSFERENCIA_STUNNED_ERP=1` en Vercel). Pasar Zattia o BDI = una fila ahí + su llave, ⛔ pantallas.
- Con la llave, «Transferir» ⛔ llama a GN: crea el documento del motor (`transferirEnErp`, `api/_repo-documento.js`) con
  `origen_ref` = `<armado>:t<tanda>`. La tanda guarda `erp: <número>` en vez de `transfer_id`.
- **Armar = transferido** (Bruno, 30-oct): `recibir: 'al_armar'` deja el documento «Recibida» al toque. Con `'en_destino'`
  queda «En camino» y el local lo recibe escaneando en ERP › Stock › Transferencias. ⛔ Está prendido para ninguna línea.
- ⛔ Hay «¿está en Gestión Nube?»: uno trabado se resuelve siempre como «transferir de nuevo», y el reintento retoma el MISMO
  documento por `origen_ref` (⛔ se duplica).
- La lista de esas transferencias es ERP › Stock › Transferencias (`MoverYRecibir unificada`): las de Reposición con lo que
  **faltó armar** (lo pedido que ⛔ salió, en la última tanda) y las movidas a mano.

## La Zebra en el armado (tanda 4, 12-oct-2026)

La Zebra está en la **misma compu** donde Lorena escanea (Darío). Sólo en la Reposición, no en la Devolución.
`components/reposicion/EtiquetasArmado.tsx` + `lib/reposicion/etiquetasExhibir.ts` (puro, `tests/reposicion-etiquetas*.test.ts*`).

- 🔑 **Qué etiqueta sale lo decide el estado de la VARIANTE** (Darío): en la **campaña elegida en
  Configurar** (`campaniaEtiqueta`, el 12-oct «Feria Septiembre 2026») → SÓLO la etiqueta de la
  campaña, con su precio (el dibujo de Etiquetas → Precio de campaña, `dibujoDeCampania`); precio
  regular → precio + formas de pago; en oferta en TN fuera de la campaña → precio rebajado + formas de pago.
  ⛔ Precio de campaña sin confirmar o sin precio: no imprime.
- 🔴 **Con una campaña elegida, si sus precios no se leen ⛔ no se imprime nada**: la prenda saldría
  con el precio regular. Una campaña que terminó también bloquea → cambiarla en Configurar.
- **Impresión rápida**: buscar por nombre / talle / SKU y reimprimir la etiqueta de información de
  producto (código de barras, sin precio), para una prenda mal etiquetada. Una o dos letras sueltas
  son el talle (palabra entera).
- Precios y formas de pago son los de Etiquetas: TN con caché de 30 min, y las formas de pago **de
  esa compu** (se editan en Etiquetas → Precio).
- 🔑 **La lectura de campañas la abre también Reposición** (`api/_liquidacion.js`, `?etiquetas=1`
  GET): quien arma puede no tener Etiquetas. ⛔ La escritura sigue siendo sólo de Etiquetas.
- `campaniaEtiqueta` viaja en `leerRepoConfig` (si no, el próximo guardado la borra).
- ⛔ «feria» en pantalla no: se dice «campaña» (VOCABULARIO §5); en el papel sale el título de la campaña.
- ⏭️ Imprimir de verdad no se ensaya desde una sesión de IA: se prueba en la compu del depósito.

## Sin etiqueta de precio (Darío, 12-oct-2026)

Configurar → «Sin etiqueta de precio»: productos que van a una caja de precio único (las bikinis «todo
a $5.000»). Al escanear, **cada unidad** sale «Con alarma · sin etiqueta de precio» (voz: «Alarma»),
y ninguna sale «para exhibir» ni con botón de etiquetas. ⛔ No cambia cuánto se lleva. Con fecha
«hasta» se apaga sola. Guardado en `ventas.sinPrecio` (`{ pid: { hasta? } }`); la marca viaja en el
pedido congelado (`soloAlarma`), así que un armado empezado antes del cambio no la tiene.

## El correo de las 10:00 (tanda 3, 12-oct-2026)

A las 10:00 abre el local y la reposición tiene que estar ahí (Darío). Un correo a Darío
(`vars.MAIL_REPOSICION_A` lo pisa) con cada armado del día: estado, hora y quién, pedidas /
llevadas / no encontradas, el número de transferencia en GN y **sólo los renglones que no salieron
completos**, con «ya faltó N veces en 14 días».

- `lib/reposicion/correo.core.js` (puro, `tests/reposicion-correo.test.ts`) ·
  `scripts/reposicion-correo.mjs` (sólo lee `repo_armado`) · `.github/workflows/reposicion-correo.yml`.
- ⛔ **Sin la devolución** («por ahora no», Darío 12-oct): el correo es sólo depósito → local.
  El asunto avisa sin iniciar / sin transferir / transferencia **sin confirmar**. Antes de
  Finalizar los números dicen **Escaneadas** (no se movió nada); después, **Transferidas**.
- ⏱️ **La duración** = de «Iniciar armado» a «Finalizar» (`creado_en` → `cerrado_en`): si se abre la
  lista y se empieza a juntar más tarde, la duración sale inflada.
- 📅 **Un correo por marca**: Zattia de lunes a sábado y **BDI de lunes a viernes** (asunto «Reposición
  BDI …»). Una marca sin ningún armado en 14 días no manda correo: así BDI no avisa «sin iniciar»
  antes de estrenarlo. Si una marca falla, la otra sale igual.
  Los feriados no se saltean: ese día llega «sin iniciar».
- Stunned aparece sólo si tuvo un armado ese día: no tiene rutina propia todavía.
- 🔴 **El reloj es de Maketa** (`/api/cron/reposicion-monitor`, 13:00 UTC de lunes a sábado), igual que el parte de la
  mañana: los crons de GitHub de este repo llegan horas tarde.
- Para mirarlo sin mandarlo: `gh workflow run reposicion-correo.yml -f simulacro=true` (deja el HTML
  como artefacto `correo-html`). Desde la Mac ⛔ se puede: el `.env` tiene sólo la clave anon de Zattia.

## La foto guardada (12-oct-2026)

Al abrir, la pantalla pide la config y la **huella** (`huellaDatos`: la hora de cada sync de
`sync_state` + el día). Si coincide con la foto guardada en la compu (`reposicion_foto_<marca>`, en
el almacén del Monitor), muestra eso **sin bajar el stock ni las ventas** (1,3 MB, 16 pedidos →
2 pedidos chicos). Si cambió —sync de la mañana, «Actualizar stock», transferencia de un armado, o
cambió el día—, baja todo como antes, en paralelo. «Recargar» y «Reintentar» fuerzan la bajada.

## Lo que ya se rompió acá

- 4-sep-2026: «Actualizado» con el stock de ayer → la hora es la del **sync**, no la de la lectura
  (comentado en `Reposicion.tsx` y `cliente.ts:ultimaSincronizacion`).
- `venta_detalles` ordenado sólo por `sale_id` pisaba empates entre páginas: va con desempate único.

## Pendiente

- ▶️ **Parte 2:** la lista de Lorena por correo a administración a las 7:00 (falta la dirección) (el de las 10:00 ya está: ver arriba).
- ▶️ **Parte 3, en tandas** (Darío, 12-oct): ✅ T1 Lorena escanea + transferencia · ✅ T2 Camila
  (devolver) + la limpieza grande · ✅ T3 correo de las 10:00 (⛔ «no estaba» → Conteo: descartado por Darío, 12-oct) · ✅ T4
  (Zebra: etiquetas para exhibir + impresión rápida, ver arriba).
- ▶️ Condiciones de Stunned. ▶️ Ubicaciones del depósito de Zattia (la sección Ubicaciones es sólo BDI).

## Cómo se prueba

`npx vitest run tests/reposicion-ventas.test.ts`. Los papeles se miran **generando el PDF** (A4:
`reposicionPDFFilas` con `compartirODescargarPDF` mockeado; rollo: `armarDevolucion` +
`pintarDevolucion`) y abriéndolo: la geometría no la cubre ningún assert.

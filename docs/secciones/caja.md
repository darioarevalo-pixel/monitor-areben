# Caja — ficha de sección

Sección `caja`, área `local`, sólo Zattia. El POS propio del local: se escanea, se cobra por cuenta
con su descuento, sale el vuelto y el ticket, y la venta queda en Gestión Nube con su número, en la
cuenta de cobro y bajando el stock. Reemplaza al POS de GN (`/ventas/pos`), que ⛔ muestra el stock
en el pedido, ⛔ tiene vuelto y ⛔ guarda el mail sin dar de alta al cliente (decidido el 3-oct-2026).
El plan completo, por fases, vive afuera del repo: `~/Documents/reunion-gerencia/2026-10-03-POS-plan-v1.md`
(v1) y `2026-10-04-POS-plan-v2.md` (v2).

## Dónde vive

`components/caja/CajaPOS.tsx` (el POS, `/pos`) · `components/caja/Caja.tsx` (la pestaña: el
informativo del turno) · `components/caja/partes.tsx` (lo que comparten) · `lib/caja/` (`core.core.js` el cobro, `gn.core.js` la respuesta de
GN, `enviar.core.js` el envío compartido con la cola, `ticket.ts` el papel, `cliente.ts`) ·
`api/_caja.js` por `?recurso=caja` · tablas `caja_venta` y `caja_config` en la base de **Zattia**
(`sql/migrate-caja.sql`) · respaldo de la cola `scripts/caja-reintentar.mjs` +
`.github/workflows/caja-reintentar.yml` · tests `tests/caja-*.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **El precio es el de Etiquetas** (`construirPrecios`, `lib/etiquetas/core.ts`): la Caja cobra lo
  que dice la etiqueta colgada, y la cajera lo puede cambiar. Tocar esa regla cambia lo que se cobra.
- `lib/gn/inventario-vivo.core.js` es también de `api/_inventario-vivo.js` (los Conteos).
- `lib/rollo80.ts` es también del ticket y el recibo de Envíos.
- **La transferencia se cruza con la MISMA lectura de Pagos recibidos** (`pagosDelDia` de
  `api/_pagos-recibidos.js`, `cruzarTransferencia` de `lib/pagos-recibidos/core.core.js`): cambiar
  qué cuenta como pago allá cambia qué confirma una venta acá.

## Reglas que el código no dice

- 🔴 **El dinero se calcula DOS veces con el MISMO núcleo**: la pantalla para mostrarlo, el servidor
  para mandarlo. Si el total que vio la cajera ⛔ coincide ⇒ 409 y ⛔ sale nada a GN.
- 🔴 **En el `POST /ventas`, `items[].discount` son PESOS; en las ventas del POS de GN, %.** Medido
  con ventas reales (#30046/#30047). Cualquier lector de ventas tiene que mirar `integration_source`.
- 🔴 **GN ⛔ acepta descuento negativo** ⇒ el redondeo PARA ARRIBA se suma al `unit_price`, y en el
  ticket se llama «Recargo por redondeo» (Bruno, 4-oct). Feria TC (recargo) ⛔ se cobra en la Caja.
- 🔑 **El id de la venta es el `integration_id` de GN, nace con el carrito y vive en el
  `localStorage` con él.** Reintentar con el mismo id ⇒ GN contesta 409 = «ya está». Se renueva sólo
  cuando el servidor contestó: renovarlo antes de saber es la forma de duplicar una venta.
  🔴 **El mismo id con OTRO pedido ⛔ es un reintento (auditoría A1, 11-oct)**: `mismaVenta`
  (`core.core.js`) compara lo que MANDÓ la pantalla —total, prendas (producto, talle, cantidad, precio) y
  cuentas— contra la fila, ⛔ recalcula. Distinto ⇒ 409 `yaCobrada` con la venta guardada: el POS la pone
  en «Última venta» para reimprimir y deja el carrito con un id nuevo. El borrador anota `enviado`, y
  «Vaciar pedido» renueva el id sólo si con él ⛔ se mandó nada. El ticket sale de la FILA guardada, ⛔
  del carrito.
- 🔑 **Con GN caído se cobra igual**: el ticket sale con el número provisorio (8 letras del id) y la
  venta queda en el cartel rojo de Pendientes. 🔑 **La reintenta el POS, cada 3 min mientras está
  abierto** (`reintentar-pendientes`, auditoría E, 11-oct): de a 2 por vuelta (techo de 30 s), las que GN
  ⛔ rechazó y las tocadas hace menos de 2 min ⛔ (`pendientesParaReintentar`, `enviar.core.js`, la
  MISMA del respaldo). 🔴 El respaldo de GitHub dice `*/10` y corrió **~3 veces por día** (7 al 11-oct):
  es para cuando nadie tiene el POS abierto, ⛔ un reloj. `enviarVenta` marca `enviando` sólo una que
  SIGUE sin llegar y un error ⛔ pisa un `en_gn`: dos envíos a la vez ⛔ la vuelven a `error`.
- 🔴 `referencias` trae el **saldo** de las cuentas de GN: al navegador va sólo id, nombre y regla.
- 🔑 **El stock que se vende es el de LOCAL** (percha + el «depósito» de atrás del local). El Depósito de
  GN ⛔ se vende desde la caja: sale como «para reponer» (Bruno, 4-oct).
- 🔑 **Se busca también por NOMBRE y talle** (`lib/caja/buscar.core.js`): sólo si el código y el SKU ⛔
  encontraron nada y hay letras. Cada palabra es comienzo de una del nombre o el talle entero, en
  cualquier orden. Elegir de la lista trae la variante por `product_id`+`size_id`, ⛔ por barcode.
- 🔑 **La lista aparece MIENTRAS se escribe, POR PRODUCTO** (`action=buscar`, Bruno 4 y 5-oct): desde 2
  caracteres con alguna letra (un código numérico del lector ⛔ la abre). La tarjeta es el PRODUCTO
  (`productosPorStock`, tope por producto) con «Elegir variante» ⇒ modal con las variantes del LOCAL y
  el resto tras «Mostrar sin stock»; con una sola variante va directo. Stock de anoche: ⛔ pega a GN,
  tipear ⛔ gasta el cupo, y ⛔ se muestra el número (confundía). Enter con UN producto a la vista abre
  el modal; si no, busca por código primero. 🔴 `inventario` se lee **paginado**: PostgREST corta en
  1.000 filas callado y «top» salía recortado.
- 🔑 **La foto es la del COLOR** (Bruno, 5-oct): `image_url` de cada variante del audit de TN
  (`traerAudit(..., { variantes: true })`), cruzada por SKU (TN y GN usan el mismo); sin foto propia, la
  del producto.
- 🔑 **Productos de FERIA TRABADOS** (Bruno, 5-oct): un admin los marca en la pestaña
  (`caja_config.reglas.feriaProductos: [{ id, nombre }]`, por `bajadas`).
  🔑 **Y sobre todo, la feria es la de LIQUIDACIÓN** (Bruno, 11-oct): un admin tilda qué campañas son feria
  (`reglas.feriaCampanias`) y el servidor resuelve `feriaIdsCampania` = los productos con el precio de esas
  campañas APLICADO (`liquidacion_items.estado`). Al sacar la campaña, dejan de ser feria solos; si la
  lectura falla, la Caja ⛔ cobra (fail cerrado). La lista a mano queda como agregado.  Precio final: sólo efectivo o
  transferencia, a la cuenta de feria, sin el % de la forma de pago. Pedido mixto = cada prenda con su
  regla: `pagosDeMedio` arma `[{ cuenta de feria, base: lo de feria }, { cuenta normal }]` y 🔴 el
  servidor lo EXIGE con `exigirFeria` (400). Con feria, débito/crédito y «Varios pagos» se traban. El
  descuento a mano a la venta se reparte como siempre; 🔴 **la promo de monto mínimo ⛔** (A9, 11-oct):
  viaja como `{ tipo: 'pesos', valor, sinFeria: true }` y `cobro()` ⛔ le da parte al pago de la cuenta
  de feria (`rebajaDeVenta`). Mixto por transferencia son DOS pagos de
  transferencia y UNA transferencia de la clienta: se espera la suma (`montoAEsperar`).
- 🔑 **La cajera ve CUATRO formas de pago; la cuenta de GN es INTERNA** (Bruno, 4-oct). `cuentaDeMedio`
  (`core.core.js`) la resuelve con `caja_config.reglas.medios` (`sql/migrate-caja-medios.sql`):
  Efectivo 12921 · Débito 20196 · Transferencia ⇒ `transferenciaA` · Crédito ⇒ 25172 (−10 %) sólo si la
  Agenda tiene promo de crédito HOY **y** la cajera contesta que la tarjeta es de ese banco; 25173 «6
  cuotas» si pasa $250.000 y lo pide; si no 25188 (lista).
  🔑 **La cuenta de GN de la TRANSFERENCIA sale de la cuenta de Mercado Pago en uso** (Bruno, 11-oct): la
  de Darío ⇒ Transferencia CG (20595), Areben Comercial ⇒ Transferencia (13015). El mapeo lo carga un admin
  en «Las transferencias se detectan en» (`reglas.transferenciaPorMp`, acción `bajadas`), y el SERVIDOR
  resuelve `transferenciaA` (`reglasDeHoy`) para la pantalla y para cobrar. Sin mapeo para la cuenta en
  uso, la transferencia ⛔ se cobra. Antes la elegía un admin aparte y quedó desparejo (MP de Darío,
  asentando en Areben Comercial).
  🔑 **⛔ Hay modo feria general** (Bruno, 11-oct): la feria es POR PRODUCTO. Un solo botón «Efectivo» (y
  uno «Transferencia»): la Caja manda sola cada prenda a su cuenta —la de feria sin el %, la común con
  el %—, ⛔ como el POS de GN, donde la cajera elegía entre «Efectivo feria» y «Efectivo». Un `feria: true`
  viejo en la config ⛔ hace nada.
  El servidor rechaza una cuenta sin forma de pago, y 🔴 **exige la que corresponde HOY** (`exigirCuentas`,
  A6, 11-oct): la normal (y la de feria sólo con prendas de feria), la transferencia a `transferenciaA`, el
  −10 % de crédito sólo si la Agenda tiene promo de crédito hoy (la lee el SERVIDOR de `agenda_promos`,
  base de BDI, con `promosDeCreditoEnMostrador` de `lib/agenda/promos.core.js`, la MISMA del POS) y las 6
  cuotas sólo arriba del mínimo (`aPagarDe`). Una pantalla abierta desde antes de un cambio da 400
  «Recargá la Caja». ⚠️ «¿Es de ese banco?» ⛔ se verifica.
- 🔑 **El ticket (papel y mail) dice el MEDIO y «Descuento 15%»**, ⛔ «Descuento Transferencia CG».
  La fila guarda en `pagos[].nombre` el medio (`nombreParaTicket`). El mail lo arma `areben-mailer`
  (`lib/email/ticket.ts`): un cambio de renglones allá se deploya a mano (`vercel --prod`).
- 🔑 **Descuentos a mano en CASCADA** (Bruno, 4-oct): por prenda (`items[].rebaja`, % o $) ⇒ a la
  venta (`descuentoVenta`, obligatorio en `cobro`: null si ⛔ hay) ⇒ el de la forma de pago, y después
  el redondeo. El de la venta se reparte entre los pagos (`pagos[].rebaja`): ⛔ tiene columna propia.
  🔑 **Libre pero A LA VISTA (B5, Bruno 11-oct)**: ⛔ permiso ni tope. La fila guarda `a_mano` = { venta,
  prendas, precios } en pesos (`precios` = lo que se bajó del precio de la etiqueta: la pantalla manda
  `precioLista` y el renglón guarda `precio_lista` si cambió), el turno lo suma (`resumen.aMano`) y la lista
  de ventas del turno lo marca.
- 🔑 **«ubicación: A1 · A2»** (`stock.atras`; Bruno, 5-oct: en pantalla «ubicación», ⛔ «atrás»): los estantes de Ubicaciones depósito por `claveDe(sku)`. Si la
  consulta falla, sale vacío y la venta sigue igual; sin estante ⛔ se dice nada (todo en percha).
- 🔴 El stock se lee con `GN_TOKEN_ZATTIA`; `GN_TOKEN_VENTAS` ⛔ lee `inventario` (caía al espejo, callado).
- ⚠️ Cada unidad viaja en su renglón con `quantity: 1`: con cantidad > 1, cómo toma GN el descuento
  en pesos ⛔ está medido.
- ⚠️ La política de cambio del pie del ticket la escribe un admin desde la pantalla (`caja_config`).
- 🔑 **El ticket es el de GN** (Bruno, 5-oct): logo, `Comprobante: #N`, `Fecha:` con el día, `Cliente:`,
  `Cant. x Precio / Descripción / Total`, TOTAL, RECIBIMOS, SALDO (y VUELTO), política y fecha de
  registro. ⛔ Las formas de pago abajo. Los descuentos siguen en su renglón (sin ellos el total ⛔ cierra).
  **Logo**: `caja_config.ticket_logo` (`sql/migrate-caja-logo.sql`), lo sube un admin; la pantalla lo
  achica a 400 px y lo pasa a PNG con fondo blanco. Sin la columna, el ticket sale con el nombre.
- 🔑 **El turno en TÉRMINOS** (Bruno, 5-oct): `Esperado · Contado · Diferencia`, ⛔ «tenía que haber… se
  contaron…». Abrir, contar, cargar salida y cerrar son MODALES (`ModalesTurno`), los mismos en la
  pestaña y en el POS, que ⛔ repite la tarjeta del turno.
- 🔑 **TODA transferencia ESPERA el pago (F5; Bruno, 5-oct)**: la regla es la FORMA de pago
  (`montoAEsperar` ⇒ `medioDeCuenta === 'transferencia'`), ⛔ el `esperaPago` de cada cuenta —sólo lo
  tenía la 13015 y en modo feria una venta de $200 fue directo a GN—. Deja la venta en `esperando_pago` —⛔ GN, ⛔ ticket, ⛔ mail— hasta que aparece en
  MP un pago aprobado del **monto exacto** (`espera_monto`: la SUMA de las partes por transferencia).
  🔑 **Dónde se detecta** es la cuenta de MP en uso de **Pagos recibidos** (`mp_cuenta_uso`, la MISMA):
  la Caja la muestra («Las transferencias se detectan en») y un admin la cambia (`usar-mp`, que llama
  a `ponerEnUso` de `api/_pagos-recibidos.js`). Cargar una cuenta nueva sigue en Pagos recibidos.
  Sola, sólo sin duda: UN pago posterior y ninguna otra venta esperando ese monto. Con duda (o un
  pago de hasta 10 min ANTES de confirmar) elige la cajera. ⛔ Alcanza el comprobante del teléfono.
  🔑 **Se leen los días desde el de la venta hasta hoy** (tope 3: el de la venta y los últimos; MP se
  lee cada 5 s) — antes sólo el de la venta y un pago después de medianoche ⛔ cruzaba nunca (A4). Y un
  pago ANTERIOR a la venta (la cancelada y vuelta a escanear) se OFRECE para elegir desde la medianoche
  de ese día (`antesManual`, obligatorio en `cruzarTransferencia`), ⛔ entra solo.
  🔴 **Sola, sólo si llegó dentro de los 15 min de la venta (A5, 11-oct, `VENTANA_SOLA_MS`)**: los totales
  van redondeados a $100 y MP ⛔ dice quién transfiere ⇒ una transferencia AJENA del mismo monto horas
  después confirmaba sola. Más tarde, la elige la cajera viendo la hora y los últimos 4 del número de
  operación. 🔑 La competidora (otra venta esperando el mismo monto) cuenta sólo si es de las últimas 12 h.
- 🔑 **Confirmar a mano (B3, sólo admin, en la pestaña)**: la que el cruce ⛔ ve nunca (Caja Gerencia es la
  cuenta de un particular) se confirma con el comprobante (`confirmar-transferencia`): `mp_cruce = 'admin'`
  y `confirmacion` = { por, en, comprobante }. Sale a GN como con el cruce; el POS imprime al verla.
- 🔴 **Un pago de MP confirma UNA venta**: `mp_pago_id` con índice único. Y **sólo `cruzar` saca
  una venta de `esperando_pago`**: `reintentar`, el respaldo de la cola y `enviarVenta` se niegan.
- ⚠️ `cancelada` = esperaba y ⛔ llegó. Cancelar una que ya cruzó ⇒ 409. Hay que volver a escanear.
- 🔑 **Pedidos web sin armar (v2, W1)** (`lib/caja/pedidos-web.core.js`, `action=pedidos-web`): los de
  TN **POR EMPAQUETAR** (`envio_estado === 'unpacked'`), pagados o **sin pagar** («a convenir»: paga al
  retirar), éstos marcados aparte —«(sin pagar)», y «Reservada» si todos lo son— (Bruno, 4-oct). ⛔ «pagada + abierta»: medido el 4-oct,
  daba 34 y 28 ya estaban empaquetadas esperando retiro. Se leen del audit de bdi-catalogo en 3 tramos
  de 3 días (corta en 200 por pedido) y lo que ⛔ llegó se dice. Caché de 60 s por instancia.
- 🔴 **El stock del Local YA descontó el pedido web**: cada orden de TN entra a GN como venta del Local
  (4 de 4 pagados y 7 de 7 sin pagar, medido), y el Depósito ⛔ lo toca. Tres avisos (Bruno, 4-oct):
  alcanza el Local ⇒ «el pedido #N lleva esta prenda»; ⛔ alcanza el Local pero sí el Depósito ⇒ ámbar
  «hay que traer N del depósito»; ⛔ alcanza ni con el Depósito ⇒ rojo «el pedido queda sin stock».
  El cruce es por SKU de variante (TN y GN usan el mismo). La Caja ⛔ frena: gana el local.
- 🔑 **«Con sonido / Sin sonido»** (botón en Escanear, Bruno 4-oct): apaga el pitido y la voz de la Caja en
  ESA computadora (`localStorage` `caja:sonido`). Todos los avisos siguen en pantalla.
- 🔑 **El TURNO es de la Caja (v2, W3, Bruno 4-oct)** (`lib/caja/cierre.core.js`, `caja_turno` +
  `caja_turno_mov`, `sql/migrate-caja-turno.sql`): la API de GN ⛔ tiene turnos y **el de GN se deja de
  usar**. Se abre con el fondo, se anotan salidas de efectivo (motivo + monto) y se cierra contando
  **sólo el efectivo**: `esperado = fondo + efectivo cobrado (cuentas con efectivo: true) + aportes − salidas`.
  🔑 **Salidas y APORTES (A8 + B4, Bruno 11-oct)**: los carga la cuenta que abrió el turno o un admin
  (`puedeMoverEfectivo`) — antes cualquiera con permiso de Caja, y otra cuenta podía tapar un faltante. El
  aporte es el efectivo que ENTRA (el cambio que trae alguien). ⛔ Se borran: se ANULAN con motivo
  (`anular-mov`, queda tachado) — un admin, o la dueña lo que cargó ella (`puedeAnularMov`), sólo en el
  turno abierto. `usuario_cuenta` = el mail del padrón de quien lo cargó.
  🔴 **Sin turno abierto ⛔ se cobra** (409 `sinTurno`). Un solo turno abierto por marca (índice único
  parcial). La venta es del turno donde se COBRÓ (`caja_venta.turno_id`). El cierre guarda la foto
  (`esperado`, `resumen`) y ⛔ se reabre. Un día puede tener dos turnos.
- 🔑 **Los cobros de GN suman al turno (v2, W3b, Bruno 4-oct)** (`cobrosDeGN`, `cierre.core.js`): el
  pedido web que se paga al retirar se cobra **EN GN, a mano** —la API ⛔ deja agregarle un pago a una
  venta que ya existe (sólo `POST /ventas` con `payments[]`; medido en la doc el 4-oct)—. El turno lee
  de GN el efectivo que entró **como cobro, ⛔ como venta en el local**, y lo suma al esperado: cuentas
  con `efectivo: true`, ⛔ canal 3 «Mi Local» (POS de GN), ⛔ `integration_source = 'monitor-caja'`.
  Va al turno por la **hora del cobro** (`payments[].created_at`, SIN zona: es hora argentina).
  🔴 El filtro de `GET /ventas` es por **día de la venta** y el pedido se cobra hasta 5 días después ⇒
  se leen **10 días** para atrás. Caché de 60 s; el cierre lee fresco. GN caído ⇒ `cobrosGN: null`, el
  turno se ve sin ellos y lo dice. ⚠️ Un cobro cargado en GN **sin turno abierto** ⛔ cae en ninguno.
- 🔑 **La calculadora de billetes (fase B, Bruno 5-oct)** (`lib/caja/conteo.core.js`,
  `components/caja/CalculadoraBilletes.tsx`, `caja_turno.conteos`, `sql/migrate-caja-conteos.sql`):
  cantidad × billete ⇒ total, al abrir (el fondo), en el **conteo intermedio** («Contar billetes» del
  turno abierto, acción `contar`: ⛔ cierra ni mueve plata) y al cerrar. 🔴 **El servidor rearma el
  total con el MISMO núcleo** y, si ⛔ es el fondo o el contado, 400: el turno ⛔ queda con un conteo
  que dice una cosa y un monto que dice otra. El input se sigue pudiendo escribir a mano: entonces va
  sin billetes. Los billetes son `caja_config.reglas.billetes` (los cambia un admin en «Formas de
  pago»); sin la lista, $20.000 a $100 sin monedas. 🔑 **Cada conteo arranca VACÍO** (Bruno, 5-oct:
  traía el anterior): sólo vuelve el borrador SIN usar del mismo momento (`caja:conteo:zattia:<apertura|
  intermedio:id|cierre:id>`, 12 h), y se olvida (`olvidarConteo`) cuando el servidor contestó. El botón
  ES la acción —«Abrir turno», «Guardar conteo», «Cerrar turno»— y al abrir/cerrar se puede escribir el
  total a mano (viaja sin billetes).
  `abierto_por_usuario` (`perfil.email`, si ⛔ `name`: el perfil ⛔ trae el usuario) es para la fase C.
- 🔑 **Se cobra en el POS, ⛔ en la pestaña (fase C, Bruno 5-oct)**: `/pos` es una rama de
  `app/[[...seccion]]/page.tsx` (⛔ una ruta de Next: el tope de Hobby), sin menú, con el formato del POS
  de GN: a la izquierda escanear/buscar con tarjetas, a la derecha el pedido fijo, el TOTAL y
  «Continuar al cobro» (Alt+C). La pestaña Caja queda como el informativo del turno, la configuración
  y «Pendientes en GN», con «Abrir POS» arriba. 🔴 **El POS lo usa SÓLO la cuenta que abrió la caja, ⛔
  ni un admin** (`puedeUsarPOS`, `cierre.core.js`): lo preguntan la pantalla y el servidor —`confirmar`
  y `contar` dan 403—. Quién es la cuenta: `caja_turno.abierto_por_usuario` = el mail del padrón (el
  perfil ⛔ trae el usuario de login), si ⛔ tiene, el nombre; un turno sin esa columna se compara por
  `abierto_por`. **La caja se cierra desde los dos lados**: en el POS la cuenta dueña, en la pestaña
  cualquiera con permiso de Caja. Las transferencias que esperan se siguen EN EL POS (imprime el ticket
  cuando llega). Sin el shell, el POS fuerza la marca Zattia antes de montar (el precio sale de sus
  datos) y pide él las promos de la Agenda.
- 🔑 **La pestaña, rediseño fase 2 (5-oct, prototipo aprobado)**: las acciones del turno («Contar
  billetes», «Cargar salida», «Cerrar turno») van al HEADER con `HeaderAcciones`, en UN portal que arma
  `TurnoCaja` (con «Abrir POS» primero, por la prop `antes`); la tarjeta muestra los mosaicos y la tabla
  por cuenta a la vista. La configuración son `Plegable variante="tarjeta"` apilados (Formas de pago
  abierto de entrada) y «Últimos turnos» es una tabla (`UltimosTurnos`), al final. 🔑 **«Así sale el
  ticket (80 mm)»** (`VistaTicket.tsx`, sólo admin) dibuja en SVG las MISMAS `ops` de `armarTicket` con un
  ticket de MUESTRA y el logo y la política guardados: ⛔ un HTML propio, que diría otra cosa que el papel.
- 🔑 **La pantalla de la clienta (`/pos/cliente`, rediseño fase 3 = V1)**: su compra en vivo, el total
  y el mail para el ticket. 🔴 **⛔ calcula**: el POS publica en `localStorage` (`caja:cliente:zattia`)
  la `VistaCliente` armada con SUS `filas` y SU `cobro` (`lib/caja/pantalla-cliente.ts`), y la pantalla
  la muestra; el mail vuelve por `caja:cliente-mail:zattia` al campo «Mail para el ticket». 🔴 **Es otra
  ventana del MISMO equipo** (segundo monitor o tablet espejada): una tablet suelta ⛔ ve nada hasta que
  el pedido viaje al servidor. Pide el permiso de Caja y ⛔ escribe en la base. La marca vive en
  `lib/caja/marca.ts` hasta la V4.
- 🔑 **El tótem (`/pos/totem`, rediseño fase 4 = V2)**: se escanea una prenda y se ve foto, talles
  del local (el stock de ANOCHE, por `buscarNombre`), precio de lista y **precio en efectivo**, que sale
  de `cobro()` con `pagosDeMedio('efectivo')` (`lib/caja/totem.ts`): el % de la cuenta, el redondeo y
  la traba de feria —una prenda de feria muestra su precio FINAL—. ⛔ «precio × 0,85» a mano. La prenda
  se resuelve con `buscarProducto`, como el POS (UNA lectura de GN por escaneo). Sólo lectura.
- 🔑 **La marca es CONFIGURACIÓN (rediseño fase 5 = V4)**: nombre, Local (11780), Depósito (18210) y el
  modo Local de GN viven en `lib/caja/marcas.core.js` (JS plano: lo lee el handler). El handler resuelve
  `marcaDeCaja(store)` y contesta 400 si ⛔ está habilitada; el chip del POS, la pantalla de la clienta,
  el tótem y el nombre del ticket sin logo salen de ahí (`lib/caja/marca.ts` le suma el color). 🔴
  **Habilitada: sólo Zattia.** Para BDI faltan sus ids de GN, sus cuentas y las tablas de la Caja en su
  base. ⚠️ Siguen fijos a Zattia: los tokens de GN, `ticket-mail.core.js` y `cliente.ts`.
- 🔑 **Las PROMOS (v2, W5, Bruno 4 y 5-oct)** (`lib/caja/promos.core.js`, `components/caja/PromosCaja.tsx`):
  NxM · 2ª unidad al X % · X % sobre un alcance (todo, **categorías de Tienda Nube** —la de GN está
  vacía en el 85 %— o productos) · $ fijos por compra desde X. Las carga un ADMIN en la pestaña
  (acción `promos`, la lista entera en `caja_config.reglas.promos`: ⛔ tabla, ⛔ SQL); el resto las ve.
  Decidido por Bruno: **una promo por prenda, la que más ahorra** (se elige de a una la que más ahorra
  sobre las prendas libres) · **se suma al % de la forma de pago** (la de prenda sale como la `rebaja`
  en pesos del renglón, la de compra como descuento a la venta: la cascada de `cobro()`) · en NxM **gratis
  la más barata** · **feria ⛔ entra** · **el descuento a mano REEMPLAZA a la promo** (en la prenda y en
  la venta). 🔴 **La pantalla manda SÓLO el descuento a mano**; el servidor aplica las promos con las de
  la base y `fechaLocal` (Argentina). Las categorías de TN las manda la pantalla (el servidor ⛔ tiene
  el catálogo): mentirlas da, a lo sumo, una promo, lo mismo que un descuento a mano. El nombre de la
  promo queda en `caja_venta.renglones[].promos` y sale en el ticket («Promo 3x2» en vez de «Descuento»).
- ⚠️ La que espera la transferencia ⛔ suma hasta que llega; si llega después del cierre queda en ese
  turno pero ⛔ en su foto. Las cobradas que ⛔ llegaron a GN SÍ suman (la clienta pagó).
  🔴 **Salvo su parte en EFECTIVO (auditoría A2, 11-oct)**: el billete ya está en el cajón ⇒ suma al
  esperado como `efectivo.deEspera`. Si se cancela deja de sumar, y el cartel dice «Devolver lo cobrado
  aparte».
- 🔴 **El cierre FRENA si GN ⛔ contestó los cobros web (auditoría A3, 11-oct)**: sin ellos el esperado
  queda corto, el cierre diría que sobra y ⛔ se reabre ⇒ 409 `sinCobrosGN`. Cerrar igual es explícito
  («Cerrar sin los cobros de Gestión Nube») y **con nota obligatoria**; la foto queda con `cobrosGN: null`.
  Leer más de 5 páginas de cobros también cuenta como «⛔ contestó» (antes cortaba callado).
- 🔴 **La carrera confirmar / cerrar turno (A7, 11-oct)**: un trigger (`sql/migrate-caja-auditoria.sql`)
  frena insertar una venta o un movimiento en un turno CERRADO y toma el turno `for share`; el cierre
  cierra PRIMERO y relee: si entró algo entre la foto y el cierre, la foto se rehace (`cambioAlCerrar`). La
  venta frenada contesta 409 `sinTurno` y ⛔ queda guardada (se cobra en el turno nuevo).
- 🔴 **La venta anulada a mano en GN deja de sumar (A12, 11-oct)**: GN ⛔ anula por API y la anulada
  DESAPARECE de `ventas/obtener` (⛔ viene con estado). El turno lee ENTEROS los días de sus ventas `en_gn`
  (`anuladasEnGN`) y las que faltan van aparte (`resumen.anuladasGN`). ⛔ Se pudo leer ⇒ `null` y el cierre
  frena como con los cobros web (cerrar igual, con nota). ⛔ Se persiste: es una lectura.
- 🔑 **Resolver una venta que GN RECHAZÓ (B2)**: sólo la `error` ⛔ reintentable (una reintentable puede
  estar en GN por un timeout: cargarla a mano la duplicaría). «Cargada a mano en GN» (con su número; la
  dueña del turno o un admin) ⇒ `en_gn` y sigue sumando; «Descartar» (sólo admin) ⇒ `descartada`, ⛔ suma.
  Las dos con nota, en `resolucion`. Con eso el respaldo de la cola deja de salir en rojo.
- 🔑 **Cerrar turno pide confirmación** con Esperado · Contado · Diferencia, y con la calculadora vacía
  el botón queda apagado (A10): un $0 de verdad se escribe en el total a mano.
- 🔑 **«Ventas del turno»** (botón del POS, B1, `action=ventas`): las del turno abierto con su estado y
  «Reimprimir» (el ticket sale de la fila). La que espera la transferencia o se canceló ⛔ tiene ticket.
  ⛔ Reenvía el mail todavía.
  🔑 **También en la PESTAÑA** (Bruno, 11-oct): «Ventas del turno» en el header con turno abierto, y
  «Ventas» en cada fila de «Últimos turnos» (`action=ventas&turno=<id>`). Lo ve cualquiera con permiso
  de Caja, como el resto de la pestaña. Tocar la cantidad de prendas abre la venta renglón por renglón
  (talle, promo, el precio de la etiqueta si se cambió). En la pestaña ⛔ hay «Reimprimir»: el ticket
  se imprime desde el POS.
- ⚠️ Varias partes por transferencia en una venta se esperan como UNA transferencia por la suma.
- 🔑 **«Varios pagos» se escribe en lo que PAGA la clienta** con cada forma de pago (ya con su %), ⛔ en la
  parte del subtotal a lista: `baseParaMonto` hace la vuelta. Un monto múltiplo de $100 da exacto.
- 🔑 **Robustez (auditoría, 11-oct)**: topes de entrada en `renglones` (60 renglones, 50 por renglón, precio
  > 0 —un precio 0 por `curl` regalaba la prenda—) y en `pagaCon`/movimientos · el SKU con guiones se busca
  TAL CUAL antes que normalizado · la búsqueda tras el 409 lee hasta 5 páginas · un `enviando` de menos de
  1 min es otro envío en vuelo y ⛔ se vuelve a mandar · `promos` y `bajadas` escriben sólo si la fila ⛔
  cambió (y con `version`, si la LISTA que editó la pantalla cambió: 409) · el precio de una prenda
  escaneada antes de que cargaran los datos se completa al llegar · el selector %/$ del descuento se elige
  antes de escribir · el tótem distingue «no está» de «no se pudo consultar» y muestra la promo.

## Pendiente

- 🔴 `sql/migrate-caja-auditoria.sql` va ANTES del deploy de la fase 2 (las columnas nuevas viajan en cada
  venta y en cada movimiento).

- Casilla «Quiero recibir novedades y promos» de `/pos/cliente`: destildada y ⛔ se guarda (Bruno, 6-oct).
  Viaja en `caja:cliente-mail:zattia` como `novedades`; falta que el POS la lea, una columna en
  `caja_venta`, sumarla a `ticketParaMail`, y que `areben-mailer` tome `tnAcceptsMkt` de ahí (hoy SIEMPRE true).
- Rediseño fase 2 (la pestaña): ⛔ vista en prod — con turno y sin turno, los 6 plegables, cambiar la
  política y verla en la vista previa, y los mosaicos del POS con el `Dato` nuevo.
- Rediseño fase 3 (`/pos/cliente`): ⛔ vista en prod con el POS al lado (agregar, cobrar, el mail de
  vuelta). ⛔ Decidido: tablet SUELTA (pide el pedido en el servidor) o segundo monitor.
- Rediseño fase 4 (`/pos/totem`): ⛔ visto en prod con el lector real. ⛔ Decidido (paso 0 de V2): si
  es la misma tablet que la de la clienta, y si escanea con la cámara.
- Rediseño fase 5: ⛔ BDI habilitada (faltan sus ids de GN, sus cuentas y su base) ni el color de cada marca.
- F5: ⛔ probado con una transferencia real (la verificación del plan).
- ⚠️ La carrera de dos pantallas cruzando la MISMA venta la cubre el `.eq('estado','esperando_pago')`
  del update, y ⛔ tiene test (el mock de la base es secuencial).
- Una semana en paralelo con el POS de GN antes de apagarlo.
- W3b: ⛔ visto con un turno abierto real en prod (el primer día hábil: mirar que el cobro web aparezca en el turno).
- Fase C: ⛔ vista en prod (el POS con la cuenta dueña y con otra; cerrar desde los dos lados).
  ⛔ Comparado con el POS de GN en la PC del local (la demo `posHtml` ⛔ se miró: el armado sale del plan).
- Fase B: ⛔ vista en prod (abrir con la calculadora, recargar y reabrir, un conteo intermedio).
  ⚠️ Dos `contar` a la vez pueden pisarse los intermedios (se lee y se escribe la lista entera): un
  turno cuenta dos o tres veces, ⛔ se cubrió. El `.is('cerrado_en', null)` del update ⛔ tiene test.
- ⛔ Probado `--kiosk-printing` en la PC del local (imprimir sin diálogo).
- W5 (promos): ⛔ vistas en prod (cargar una, verla en el POS y en el ticket). ⛔ Tocadas: el tótem
  (muestra lista y contado SIN promo), el mail del ticket (`areben-mailer`: dice «Descuento», ⛔ el
  nombre) y la pantalla de la clienta (ve el importe con la promo, ⛔ el nombre).

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
- 🔑 **Con GN caído se cobra igual**: el ticket sale con el número provisorio (8 letras del id) y la
  venta queda en el cartel rojo de Pendientes; la cola la reintenta cada 10 min.
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
  (`caja_config.reglas.feriaProductos: [{ id, nombre }]`, por `bajadas`). Precio final: sólo efectivo o
  transferencia, a la cuenta de feria, sin el % de la forma de pago. Pedido mixto = cada prenda con su
  regla: `pagosDeMedio` arma `[{ cuenta de feria, base: lo de feria }, { cuenta normal }]` y 🔴 el
  servidor lo EXIGE con `exigirFeria` (400). Con feria, débito/crédito y «Varios pagos» se traban. El
  descuento a mano a la venta se reparte como siempre. Mixto por transferencia son DOS pagos de
  transferencia y UNA transferencia de la clienta: se espera la suma (`montoAEsperar`).
- 🔑 **La cajera ve CUATRO formas de pago; la cuenta de GN es INTERNA** (Bruno, 4-oct). `cuentaDeMedio`
  (`core.core.js`) la resuelve con `caja_config.reglas.medios` (`sql/migrate-caja-medios.sql`):
  Efectivo 12921 · Débito 20196 · Transferencia ⇒ `transferenciaA` (13015 Areben Comercial | 20595 Caja
  Gerencia: dónde se ASIENTA en GN, lo baja un ADMIN, ⛔ la cajera; las dos esperan el pago) · Crédito ⇒ 25172 (−10 %) sólo si la
  Agenda tiene promo de crédito HOY **y** la cajera contesta que la tarjeta es de ese banco; 25173 «6
  cuotas» si pasa $250.000 y lo pide; si no 25188 (lista). **Modo feria** (admin): efectivo y
  transferencia van a las de feria (precio final). El servidor rechaza una cuenta sin forma de pago.
- 🔑 **El ticket (papel y mail) dice el MEDIO y «Descuento 15%»**, ⛔ «Descuento Transferencia CG».
  La fila guarda en `pagos[].nombre` el medio (`nombreParaTicket`). El mail lo arma `areben-mailer`
  (`lib/email/ticket.ts`): un cambio de renglones allá se deploya a mano (`vercel --prod`).
- 🔑 **Descuentos a mano en CASCADA** (Bruno, 4-oct): por prenda (`items[].rebaja`, % o $) ⇒ a la
  venta (`descuentoVenta`, obligatorio en `cobro`: null si ⛔ hay) ⇒ el de la forma de pago, y después
  el redondeo. El de la venta se reparte entre los pagos (`pagos[].rebaja`): ⛔ tiene columna propia.
  ⚠️ Hoy cualquier cajera puede poner un descuento a mano: permiso o tope, a decidir.
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
  **sólo el efectivo**: `esperado = fondo + efectivo cobrado (cuentas con efectivo: true) − salidas`.
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
- ⚠️ La que espera la transferencia ⛔ suma hasta que llega; si llega después del cierre queda en ese
  turno pero ⛔ en su foto. Las cobradas que ⛔ llegaron a GN SÍ suman (la clienta pagó).
- ⚠️ Varias partes por transferencia en una venta se esperan como UNA transferencia por la suma.

## Pendiente

- Rediseño fase 2 (la pestaña): ⛔ vista en prod — con turno y sin turno, los 6 plegables, cambiar la
  política y verla en la vista previa, y los mosaicos del POS con el `Dato` nuevo.
- Rediseño fase 3 (`/pos/cliente`): ⛔ vista en prod con el POS al lado (agregar, cobrar, el mail de
  vuelta). ⛔ Decidido: tablet SUELTA (pide el pedido en el servidor) o segundo monitor.
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

# Caja — ficha de sección

Sección `caja`, área `local`, sólo Zattia. El POS propio del local: se escanea, se cobra por cuenta
con su descuento, sale el vuelto y el ticket, y la venta queda en Gestión Nube con su número, en la
cuenta de cobro y bajando el stock. Reemplaza al POS de GN (`/ventas/pos`), que ⛔ muestra el stock
en el pedido, ⛔ tiene vuelto y ⛔ guarda el mail sin dar de alta al cliente (decidido el 3-oct-2026).
El plan completo, por fases, vive afuera del repo: `~/Documents/reunion-gerencia/2026-10-03-POS-plan-v1.md`
(v1) y `2026-10-04-POS-plan-v2.md` (v2).

## Dónde vive

`components/caja/Caja.tsx` · `lib/caja/` (`core.core.js` el cobro, `gn.core.js` la respuesta de
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
- 🔑 **La lista aparece MIENTRAS se escribe** (`action=buscar`, Bruno 4-oct): con 3 caracteres y alguna
  letra (un código numérico del lector ⛔ la abre), con foto y precio de etiqueta. Por defecto sólo lo
  que hay en el LOCAL (stock de anoche: ⛔ pega a GN, tipear ⛔ gasta el cupo); «Mostrar sin stock»
  suma el resto para venderlo igual. ⛔ Muestra el número de anoche (confundía: lo vendido hoy ⛔ está):
  el stock real lo dice el renglón al elegirla. El Enter sigue buscando por código primero.
- 🔑 **La cajera ve CUATRO formas de pago; la cuenta de GN es INTERNA** (Bruno, 4-oct). `cuentaDeMedio`
  (`core.core.js`) la resuelve con `caja_config.reglas.medios` (`sql/migrate-caja-medios.sql`):
  Efectivo 12921 · Débito 20196 · Transferencia ⇒ `transferenciaA` (13015 Areben Comercial, espera MP |
  20595 Caja Gerencia, a mano: lo baja un ADMIN, ⛔ la cajera) · Crédito ⇒ 25172 (−10 %) sólo si la
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
- 🔑 **«atrás: A1 · A2»** (`stock.atras`): los estantes de Ubicaciones depósito por `claveDe(sku)`. Si la
  consulta falla, sale vacío y la venta sigue igual; sin estante ⛔ se dice nada (todo en percha).
- 🔴 El stock se lee con `GN_TOKEN_ZATTIA`; `GN_TOKEN_VENTAS` ⛔ lee `inventario` (caía al espejo, callado).
- ⚠️ Cada unidad viaja en su renglón con `quantity: 1`: con cantidad > 1, cómo toma GN el descuento
  en pesos ⛔ está medido.
- ⚠️ La política de cambio del pie del ticket la escribe un admin desde la pantalla (`caja_config`).
- 🔑 **Por Transferencia la venta ESPERA el pago (F5)**: la cuenta con `esperaPago` en `caja_config`
  (hoy sólo 13015) deja la venta en `esperando_pago` —⛔ GN, ⛔ ticket, ⛔ mail— hasta que aparece en
  MP un pago aprobado del **monto exacto** (`espera_monto`, sólo la parte de la transferencia).
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
- ⚠️ La que espera la transferencia ⛔ suma hasta que llega; si llega después del cierre queda en ese
  turno pero ⛔ en su foto. Las cobradas que ⛔ llegaron a GN SÍ suman (la clienta pagó).
- ⚠️ Una sola transferencia por venta (`montoAEsperar`). Otra cuenta que espere: `jsonb_set` en
  `caja_config` (ver `sql/migrate-caja-transferencia.sql`); ⛔ hay pantalla para eso.

## Pendiente

- F5: ⛔ probado con una transferencia real (la verificación del plan).
- ⚠️ La carrera de dos pantallas cruzando la MISMA venta la cubre el `.eq('estado','esperando_pago')`
  del update, y ⛔ tiene test (el mock de la base es secuencial).
- Una semana en paralelo con el POS de GN antes de apagarlo.
- W3b: cobrar desde la Caja los pedidos web a retirar que pagan en el local (paso 0: ¿GN deja agregar un pago a una venta existente?).
- ⛔ Probado `--kiosk-printing` en la PC del local (imprimir sin diálogo).

# ERP — ficha de sección

Sección `erp`, área propia `erp` (ninguna función la hereda), **sólo admin**: grupo `adminOnly` en el
menú y `esAdmin` en el handler. Bruno, 12-oct-2026: todo lo que el monitor construye para **reemplazar a Gestión Nube** va
acá, en pestañas, mientras dura el desarrollo —lo ven él y Darío, prueban y opinan—; cuando reemplace
a GN se reparte en las secciones de siempre. Plan y mediciones del ERP: `~/Documents/erp-monitor/`.

**Stock** (14-oct, sólo lectura): busca una prenda por SKU, código o nombre y muestra lo que dice el
**libro de stock** (`stock_movimiento`, lo escribe `areben-libro-stock` una vez por día) por depósito al
lado de GN (`inventario`), y cada movimiento con el saldo después. GN ⛔ tiene historial: ésta lo
reemplaza. Núcleo puro en `lib/erp/stock.core.js` (`tests/erp-stock.test.ts`). 🔴 El libro es
inmutable: el nivel es la SUMA de los movimientos; la pantalla ⛔ escribe nada.

**Diferencias del día** (14-oct, sólo lectura): lo que el libro ⛔ pudo explicar al comparar su día con
el de GN (`stock_diff`), agrupado por clase con qué mirar, y la **sobreventa**: las prendas que el libro
deja en NEGATIVO hoy. Cada fila abre la ficha de Stock. Núcleo en `lib/erp/diferencias.core.js`
(`tests/erp-diferencias.test.ts`). 🔴 La sobreventa ⛔ es una clase del diff: si GN también quedó en
negativo, el día cierra (medido: las 13 de BDI del 14-oct están en −1/−4 en los dos) ⇒ se suma aparte, por
pg con `DATABASE_URL_<MARCA>` (supabase-js ⛔ agrupa); sin esa variable la pantalla lo dice. 🔴 Los nombres
salen del espejo PAGINADOS: una fila por talle y depósito pasa las 1000 de Supabase y cortaba callado.

Y **Facturación** (F5 del plan): el tope del mes, lo ya facturado y las ventas sin
factura, que se facturan con ARCA (ex AFIP) por web service. Reemplaza la facturación masiva de GN
y el «Pendiente de facturar» del dashboard de Darío.

- 🔑 **`erp › Precios`** (`PreciosProducto.tsx`, 15-oct): precio por LISTA y costo de un producto como los tiene el motor
  (`precio_vigente`/`costo_vigente`), de dónde salió cada uno y su historial, con GN (`productos.retailer_price`…) y TN
  (`tn_variante` por los SKU, con cuándo se leyó: puede estar vieja) al lado; avisa local ≠ TN, sin costo y costo de TN ≠ ERP.
  «Cargar en el ERP» = `cargarPrecio`/`cargarCosto` del motor (contrato §13): fila `carga` que manda sobre las copias, pero
  🔴 mientras GN vive ⛔ cambia la Caja ni TN. La `marca` del motor es la LÍNEA (`lineaDe`: un SKU `STU…` es `stunned`).
  El monto pasa por `parsearMonto` (el de compromisos: el punto decimal de `String(n)` ⛔ se lee como miles).

## Dónde vive

`components/erp/` · `lib/erp/cliente.ts` · `lib/arca/` (todo el dominio, puro y testeado:
`arca.core.js` arma y lee ARCA · `lote.core.js` el lote · `techo.core.js` el tope · `mes.core.js`
lo pendiente) · `api/_erp.js` por `?recurso=erp` · `motor/arca/cliente.js` (WSAA/WSFE) · `api/_facturacion.js`
(el repo). Tablas: `facturas`, `arca_ta`, `arca_candado`, `cuentas_cobro`, `facturacion_mes` **sólo en
BDI**; `ventas_cobros` y `ventas_factura_gn` en las dos bases, las llena el sync de ventas.
Tests: `tests/arca-*.test.ts`. Prueba contra ARCA: `scripts/arca-probar.mjs` (cert en
`~/Documents/erp-monitor/arca-certificado/`, ⛔ en el repo).

## Reglas que el código no dice

- 🔴 **Homologación por defecto.** Facturas reales sólo con `ARCA_AMBIENTE=produccion` **y**
  `ARCA_PRODUCCION_HABILITADA=si` (las pone Bruno), y con `ARCA_PTOVTA_BDI`/`_ZATTIA` cargados: en
  producción ⛔ hay punto de venta por defecto, y los de GN (00002 BDI, 00005 Zattia) se rechazan —dos
  sistemas en el mismo PV se pisan la numeración—. Los PV nuevos esperan el OK del contador.
- 🔴 **Una factura con CAE ⛔ se borra ni se edita**: se anula con nota de crédito. Por eso el número
  se reserva en la base ANTES de pedirlo y un corte se resuelve CONSULTANDO a ARCA, ⛔ reintentando
  (reintentar duplica). Medido contra homologación y Postgres local el 12-oct (`motor/arca/lote.core.js`).
- 🔑 **El tope va cobro por cobro**, por la fecha y la cuenta de cada pago (regla del contador: se
  factura lo que entra a la cuenta). Validado: sep-2026 desde producción = $29.936.566,32 = cierre del
  dashboard + $33.500 de Feria TC.
- 🔑 **Reclasificar una cuenta mueve los meses abiertos** (el 5-oct «Transferencia» pasó de areben a
  propia y agosto bajó $5,2 M) ⇒ un mes CERRADO queda con su tope en `facturacion_mes` y ⛔ se recalcula.
- 🔑 **Cada factura del monitor guarda el MES del tope** (`facturas.mes`): sale con fecha de hoy (ARCA
  acepta ±5 días) y el tope de septiembre se factura a principios de octubre.
- 🔑 **Mientras GN facture, lo facturado es GN + monitor**, y una venta con factura de GN en CUALQUIER
  mes ⛔ es candidata (se busca por id, ⛔ por fecha). GN imputa por la fecha de la VENTA.
- ⚠️ El monto de cada factura lo rearma el servidor (lo cobrado en cuentas Areben de esa venta en el
  mes, ⛔ el total); del navegador sólo viajan ids. Hoy sólo Factura B a consumidor final; la A
  (mayoristas, CUIT del cliente) falta.

- 🔑 **El PDF** (`lib/arca/factura-pdf.ts`, botón en «Facturas del monitor») se arma en el navegador con la
  fila de `facturas` tal como se le mandó a ARCA, ⛔ con la venta; el QR es el de la RG 4892
  (`motor/arca/qr.core.js`). 🔴 ⛔ Sale sin los datos fiscales del emisor (`motor/arca/emisor.core.js`: razón
  social, IIBB, inicio de actividades, domicilio de cada punto de venta): se copian de una factura de GN o
  de la constancia de ARCA, ⛔ se inventan. Una de homologación sale sellada «SIN VALIDEZ FISCAL».

## Pendiente

Factura A · nota de crédito desde la pantalla · los datos del emisor para el PDF · facturar desde la Caja · reabrir un mes ·
en producción: certificado, PV nuevos (contador) y las dos variables.

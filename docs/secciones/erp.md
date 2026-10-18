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

**Ventas** (14-oct): buscador y ficha de una venta PROPIA (la que escribe el motor, `motor/venta/`, ⛔ la de
GN) por número, cliente o fecha: prendas, pagos, factura, estado y sus cambios. Lee `venta` y la vista
`venta_ficha` (contrato: `~/Documents/erp-monitor/contrato-venta.md`). **Anular** desde la ficha, con motivo
(≥5 letras) y sólo admin: lo hace `anularVenta` del motor por **pg** (⛔ supabase-js: sin transacciones), con
`DATABASE_URL_BDI` / `DATABASE_URL_ZATTIA`; 🔴 sin esa variable en Vercel contesta 409 «⛔ está conectado» —
cargarla ES prender el anular—. La plata vuelve a los mismos pagos; si tenía factura, avisa que falta la NC.
Núcleo puro en `lib/erp/venta.core.js` (`tests/erp-venta.test.ts`). 🔑 «Prueba» = entró antes del corte de GN y ⛔ movió el libro.

Y **Facturación** (F5 del plan): el tope del mes, lo ya facturado y las ventas sin
factura, que se facturan con ARCA (ex AFIP) por web service. Reemplaza la facturación masiva de GN
y el «Pendiente de facturar» del dashboard de Darío.

- 🔑 **`erp › Precios`** (`PreciosProducto.tsx`, 15-oct): precio por LISTA y costo de un producto como los tiene el motor
  (`precio_vigente`/`costo_vigente`), de dónde salió cada uno y su historial, con GN (`productos.retailer_price`…) y TN
  (`tn_variante` por los SKU, con cuándo se leyó: puede estar vieja) al lado; avisa local ≠ TN, sin costo y costo de TN ≠ ERP.
  «Cargar en el ERP» = `cargarPrecio`/`cargarCosto` del motor (contrato §13): fila `carga` que manda sobre las copias, pero
  🔴 mientras GN vive ⛔ cambia la Caja ni TN. La `marca` del motor es la LÍNEA (`lineaDe`: un SKU `STU…` es `stunned`).
  El monto pasa por `parsearMonto` (el de compromisos: el punto decimal de `String(n)` ⛔ se lee como miles).
  🔑 **El proveedor NACE EN INGRESOS** (Bruno, 18-oct; motor sql/021): la ficha muestra el proveedor DEL PRODUCTO
  (`producto.proveedor_id`, ⛔ el del costo) y la OC que lo dio (`producto_proveedor_oc`); lo ata el motor en `traer`
  por el SKU del renglón de la OC. «Crear proveedor» queda para la excepción. El costo cargado a mano viene con ese proveedor elegido.

- 🔑 **`erp › Reglas`** (`ReglasComerciales.tsx`, 16-oct; ❓ 15 de `~/Documents/erp-monitor/reglas-comerciales.md`): las reglas por
  forma de pago como FILAS (`regla_comercial`, motor sql/016), cargar / editar / apagar, y un SIMULADOR que cobra una venta con
  las 4 formas de pago y dice qué regla ganó (una regla a medio cargar se prueba sin guardar). La cuenta es del motor
  (`motor/venta/reglas.mjs`: campaña reemplaza a temporada en sus prendas, gana la mejor, el % sobre el precio de campaña,
  canal obligatorio); el servidor es `api/_erp-reglas.js`. La promo bancaria se LEE de la Agenda (no se copia). 🔑 **Parte 3
  (17-oct): «Que la Caja cobre con estas reglas» se prende POR MARCA** (`prenderCajaErp`): copia las activas a
  `caja_config.reglas.reglasComerciales` y cada guardado la rehace; la pantalla dice con qué copia cobra, si está vieja y qué
  reglas la Caja no puede cobrar (`queNoCobraLaCaja`: banco que no es el de la Agenda, cuotas ≠ 6). Apagada, compara con
  `caja_config` y dice dónde se separan. Detalle en `docs/secciones/caja.md`. 🔑 Las
  categorías son las de TN por nombre, y las pone la PANTALLA (`matchTn`), como la Caja: la de GN la tienen 135 de 890.
  Oráculos: `oraculo-reglas-134.mjs` (el núcleo) y `oraculo-caja-con-reglas.mjs` + `caminar-caja-reglas.mjs` (la Caja
  prendida), en `~/Documents/erp-monitor/oraculos/`.

## Dónde vive

`components/erp/` · `lib/erp/cliente.ts` · `lib/arca/` (todo el dominio, puro y testeado:
`arca.core.js` arma y lee ARCA · `lote.core.js` el lote · `techo.core.js` el tope · `mes.core.js`
lo pendiente) · `api/_erp.js` por `?recurso=erp` · `motor/arca/cliente.js` (WSAA/WSFE) · `api/_facturacion.js`
(el repo). Tablas: `facturas`, `arca_ta`, `arca_candado`, `cuentas_cobro`, `facturacion_mes` **sólo en
BDI**; `ventas_cobros` y `ventas_factura_gn` en las dos bases, las llena el sync de ventas.
Tests: `tests/arca-*.test.ts`. Prueba contra ARCA: `scripts/arca-probar.mjs` (cert en
`~/Documents/erp-monitor/arca-certificado/`, ⛔ en el repo).

## Reglas que el código no dice

- 🔑 **`erp › Caja` = el CAMBIO en el local** (`CambioCaja.tsx`, Bruno 14-oct): busca la venta propia, marca lo
  devuelto (al precio que se PAGÓ), escanea lo nuevo y cobra o deja a favor la diferencia; lo registra
  `registrarCambio` del motor por `cambiarVentaPropia` (`api/_erp.js`). 🔴 Usa el MISMO código de la Caja
  (`buscarProducto`, `construirPrecios`+`precioDeFeria`, `renglones`, `exigirDevolucion`), ⛔ una copia: al cortar
  GN se muda al POS. 🔴 De PRUEBA hasta el corte (⛔ libro, ⛔ GN). Que ⛔ se devuelva de más y que el pago cierre lo
  hace cumplir el MOTOR (409); la pantalla usa `diferenciaDeCambio`, la MISMA cuenta. ✅ (Bruno, 14-oct) La diferencia
  se cobra CON el descuento de la forma de pago (`cobroDelCambio` = el `cobro()` de la Caja), la transferencia se
  ESPERA como en la Caja (`cruzarTransferencia`) y lo devuelto que vale más queda como SALDO A FAVOR (DNI + nombre).
- 🔑 **`erp › Caja › Factura` = la factura A PEDIDO** (`FacturaCaja.tsx`, 14-oct): busca la venta propia y saca UNA
  factura B (sin identificar, DNI o CUIT) o A (CUIT + inscripta/monotributista) por el MISMO `facturarLote` de la
  masiva (`facturarVentaPropia` en `api/_erp.js`, núcleo en `lib/erp/factura.core.js`). 🔴 **`facturas.venta_id` =
  la venta de GN si la refleja una** (`detalle.gn_sale_id`), si no el uuid del motor: con la misma clave, ni la
  Caja ni la masiva facturan dos veces la misma venta. Con CAE se ata en el motor (`venta_factura`); pedirla de
  nuevo devuelve la MISMA (para el PDF). Frena: GN ya la facturó (`ventas_factura_gn`), anulada, cambio, y 🔴 una
  venta de PRUEBA en producción (hasta el corte la factura real sale de GN). «Facturas del monitor» lee los
  renglones de una venta propia de `venta_ficha` (la clave ⛔ es numérica).
  🔴 **`venta_factura` es INMUTABLE (motor 009)**: se escribe SÓLO con `vincularFactura` del motor (`atarFactura`). Si ⛔
  la ata (la venta se anuló mientras ARCA autorizaba), el comprobante ya tiene CAE ⇒ vuelve con `sinAtar`, a pantalla.
- 🔑 **La A deja la FICHA de la clienta** (contrato §11, `guardarCliente`, una por EMPRESA y documento): CUIT, razón
  social (obligatoria en la A), condición y domicilio (opcional). La Caja la busca por CUIT o nombre
  (`vista=clientas`) y un CUIT completo con ficha se completa solo. Lo que viene con dato PISA la ficha; lo vacío ⛔
  borra. El PDF de la A imprime razón social y domicilio del receptor DE LA FICHA (`receptor_nombre`/`_domicilio`,
  también al reimprimir y en «Facturas del monitor»); sin ficha, sólo el CUIT (⛔ se inventa).
- 🔑 **El CAMBIO se factura desde `Caja › Factura`** (Bruno, 14-oct: NC por lo devuelto + factura por lo nuevo;
  `facturarCambio`, núcleo `armarFacturaDelCambio`): misma clase y receptor que la factura de la venta ORIGINAL (sin
  ella ⛔ se factura: dice por qué). Lo devuelto se acredita al valor FACTURADO (`× total/subtotal` de la original) y la
  factura nueva = el crédito usado + lo cobrado hoy ⇒ lo facturado neto = la plata que entró. Las dos con la clave del
  CAMBIO (una de cada una; repetir trae las mismas). La NC va asociada a la factura original y atada a la venta original;
  🔴 nunca acredita más de lo que a esa factura le queda, y la NC ENTERA de Facturación se frena si ya hay una parcial.
- 🔑 **La NC de una venta propia**: botón «Hacer nota de crédito» en la ficha de Ventas, SÓLO con la venta ANULADA
  y facturada (a una en pie la NC le anula la factura y el lote ⛔ la deja refacturar). Va por el MISMO
  `notaDeCredito` de Facturación (entera, asociada) y se ata como `nc` en `venta_factura`.
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

Factura A en la masiva (en la Caja ya está) · NC PARCIAL (la del cambio) · los datos del emisor para el PDF · reabrir un mes ·
en producción: certificado, PV nuevos (contador) y las dos variables.

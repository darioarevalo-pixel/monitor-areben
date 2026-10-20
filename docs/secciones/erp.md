# ERP — ficha de sección

Sección `erp`, área propia `erp` (ninguna función la hereda), **sólo admin**: grupo `adminOnly` en el
menú y `esAdmin` en el handler. Bruno, 12-oct-2026: todo lo que el monitor construye para **reemplazar a Gestión Nube** va
acá, en pestañas, mientras dura el desarrollo —lo ven él y Darío, prueban y opinan—; cuando reemplace
a GN se reparte en las secciones de siempre. Plan y mediciones del ERP: `~/Documents/erp-monitor/`.

🔑 **`/erp` es una pantalla PROPIA, como el POS** (Bruno, 19-oct: «que abra una sección completa nueva, que se navegue
solo sin ir atrás»): sale del shell en `app/[[...seccion]]/page.tsx` (`esERP`, antes de `permitida`: el ERP cambia la
marca adentro) con SU menú (`components/erp/Erp.tsx`, `SECCIONES_ERP`): Inicio · Ventas + Caja (POS) · Stock ·
Productos y precios · Clientes y proveedores · Configuración, y «Volver al monitor». Una dirección por sección y por
pestaña: `/erp/ventas`, `/erp/ventas/facturacion`, `/erp/stock/ajustes`… (una vieja o mal escrita se corrige sola).
Las pestañas: Ventas = Ventas · Por producto · Facturación (🎨 19-oct: «Pedidos sin pagar» pasó a ser la vista «Sin pagar» de Ventas; su
dirección vieja cae en Ventas) · Caja (POS) = Cambio · Factura · Stock =
Stock · Movimientos · Conteos y ajustes · Conciliación · Diferencias con GN · Productos = Productos (la vieja `/erp/productos/precios` cae ahí) · Configuración = Reglas · Cuentas de cobro;
Clientes y proveedores = Clientes · Cuenta corriente · Proveedores. El contenido va adentro de `.shell-content` A PROPÓSITO (las pantallas heredan de ahí tablas,
botones crudos y `select`). Tests: `tests/erp-navegacion*.test.ts*`. El registro (`registro.ts`) conserva `erp` sólo
porque el test de registro lo exige: el shell ya ⛔ lo monta.

**Stock** (14-oct, sólo lectura; 🎨 **19-oct, Diseño: rehecha con el molde de Ventas**): UNA lista con cada prenda
(variante) y lo que hay por depósito, vistas con número (Con stock · Sin stock en el Local · Negativos · Con pedidos ·
Todo), resumen ARRIBA, buscador (nombre, SKU, código entero), columnas por usuario (`erp-stock-<marca>`) y la ficha AL
COSTADO (por depósito ERP contra GN + historial con lo que quedó). 🔑 Palabras del diseño: **en estantería** = el
**libro de stock** (`stock_movimiento`, la SUMA: es inmutable) · **en pedidos** = lo que apartan los pedidos de TN SIN
PAGAR (cruce por SKU con `inventario`; el libro ⛔ los descontó) · **disponible** = estantería − pedidos, el número que
manda. 🔴 La reserva del motor (`reservasTN`) además VENCE a las 72 h; mientras GN viva eso es seco ⇒ acá cuentan todos
los sin pagar abiertos. El libro se suma POR PG (`conMotor`; sin la conexión, 409 dicho en pantalla) en `api/_erp-stock.js`
(`vista=stock-lista`); núcleo `lib/erp/stock-lista.core.js` (`tests/erp-stock-lista.test.ts`, pantalla en
`tests/erp-stock-pantalla.test.tsx`). Se dibujan de a 300 filas (la lista ⛔ es virtual). «Ajustar» (fila y ficha) lleva
la prenda a «Nuevo ajuste» de Conteos y ajustes (`AjustesStock` › `pedida`); transferir y etiquetas, al monitor (↗).
La ficha sigue leyendo `vista=stock&producto=…` (núcleo `lib/erp/stock.core.js`, `tests/erp-stock.test.ts`). La cuenta
de las columnas elegidas es una sola para todas las listas: `lib/erp/lista-columnas.core.js`.

**Movimientos** (🎨 19-oct, Diseño 7, sólo lectura; lista de REGISTRO, tablero 3 del v8): cada fila del libro
(`stock_movimiento`) del período (Hoy · Ayer · 7 días · Este mes) — cuándo · tipo · prenda · dónde · cantidad · **queda** ·
documento · quién — con vistas (Todos · Ventas, con las anulaciones · Transferencias · Ajustes · Ingresos · Del libro),
resumen ARRIBA (una transferencia ⛔ entra ni sale), buscador (prenda, SKU, código, documento, quién), columnas por usuario
(`erp-movimientos`) y «Exportar». Clic ⇒ la ficha de la PRENDA (`FichaPrenda`). 🔑 «Queda» = la suma corrida por prenda ×
depósito con el MISMO orden que el historial de la ficha (hora, id) ⇒ los dos dicen el mismo número. 🔴 El libro ⛔ guarda
quién: sale de la venta del ERP (`detalle.caja` = `venta.origen_ref` → `venta.usuario`) o del ajuste (`stock_ajuste.creado_por`); si ⛔, la
celda dice el SISTEMA en gris (⛔ una persona inventada). Más de `TOPE_MOVS` (20.000) ⇒ los más nuevos y se avisa.
Servidor `api/_erp-stock.js` (`vista=movimientos`, por pg con `conMotor`), núcleo `lib/erp/movimientos.core.js`
(`tests/erp-movimientos*.test.ts*`).

**Transferencias** (🎨 20-oct, Diseño 8, sólo lectura; tablero 3 del v8): cada transferencia con la **barrita de 4 pasos**
(Borrador · Armada · En tránsito · Recibida) — Nº de GN · creada · de → a · origen · quién · estado · prendas (pedidas → enviadas)
· «En el ERP» (lo que anotó el libro) — vistas Abiertas · Con faltantes · Transferidas · Canceladas · Todas (se entra a Abiertas
si hay), período, origen, buscador, columnas por usuario (`erp-transferencias`), «Exportar»; clic ⇒ ficha AL COSTADO con lo
pedido/armado/enviado de cada prenda. Se arman y se mandan en **Reposición** (↗). 🔑 El motor ⛔ guarda la transferencia como
documento (sólo los movimientos hechos, `grupo`) ⇒ sale de `repo_armado` de cada base (supabase-js con la clave de la marca, como
`api/_repo-armado.js`) + las hechas a mano en GN del libro (`origen = 'gn_foto'`). 🔴 «Recibida» ⛔ existe (GN mueve de un golpe,
nadie escanea al llegar): el 4º paso va RAYADO y la pantalla lo dice. «Faltó» = lo pedido que ⛔ salió, sólo si ya salió. Lo
transferido antes de que arrancara el libro (13-oct) dice «antes del libro». Servidor `api/_erp-stock.js` (`vista=transferencias`),
núcleo `lib/erp/transferencias.core.js` (`tests/erp-transferencias*.test.ts*`), barritas en `components/erp/stock/Barritas.tsx`.

**Recepciones** (🎨 20-oct, Diseño 8, sólo lectura; tablero 3 del v8; 🔑 «Llegó» = la `fecha_ingreso` que carga Ingresos,
SALVO que sea posterior a la confirmación —OC-3047 30/10 confirmada el 20/10—: ahí la confirmación, y la otra en la ficha): cada orden de compra que llegó — orden · llegó · de ·
va a · recibidas (la barrita «a de b») · estado — vistas Con diferencia · Este mes · Todas, buscador (orden, proveedor), columnas
por usuario (`erp-recepciones`), «Exportar»; clic ⇒ ficha AL COSTADO con los renglones que NO cerraron primero («Ver los N»).
⛔ alta de producto (nace en Ingresos). 🔑 Lee por la MISMA puerta de Ingresos (`api/_recepciones.js` + `lib/recepciones/cliente.ts`,
que corta el proveedor en el servidor): las órdenes viven en la base del monitor (BDI, las dos marcas), ⛔ en el motor. 🔴 Ingresos
avisa sólo al CONFIRMAR ⇒ ⛔ hay «Esperando» (pedida y sin llegar) ni depósito real («va a» = el supuesto del libro); lo dice la
pantalla. «Con diferencia» = faltantes o sobrantes > 0 (⛔ el neto: medido 20-oct, Zattia 5 por renglón contra 4 por neto). El día
es el de `diaDeIngreso` (⛔ `recibido_en`). Núcleo `lib/erp/recepciones-lista.core.ts` (`tests/erp-recepciones-pantalla.test.tsx`).

**Comparación con TN y ML** (🎨 20-oct, Diseño 8, sólo lectura; tablero 3 del v8): por variante — prenda · talle · «Según el ERP»
(el libro de los depósitos que publica ESA tienda − lo apartado por pedidos sin pagar, ⛔ < 0) · Tienda Nube · Diferencia (+ = muestra
de más: se vende sin tenerlo) · En GN (los mismos depósitos) · «Qué pasa» — vistas No coinciden · Muestra de más · Muestra de menos ·
Sin producto en el ERP · Sin publicar · Todas; buscador, tienda (Zattia/Stunned), columnas por usuario (`erp-comparacion`), «Exportar»;
clic ⇒ la ficha de la prenda. 🔑 La cuenta y las palabras son las de la CONCILIACIÓN del motor (`conciliarStockTN`; `CLASE.stock_tn`),
en vivo y con TODAS las variantes: cruce por SKU y, si no, por código; SKU repetido en TN ⇒ decide la primera. 🔴 `DEPOSITOS_TN`
(BDI depósito minorista · Zattia local · Stunned depósito + local) es COPIA del motor (`lib/tn/stock.mjs`) hasta que A traiga `lib/tn`.
🔴 Mercado Libre ⛔ se compara: el motor ⛔ guarda lo publicado (`ml_publicaciones` de BDI quedó del 24-sep) ⇒ la pantalla lo dice y
manda a Conciliación con cuántas ⛔ cerraron. Servidor `api/_erp-stock.js` (`vista=comparacion`, `tn_variante` + `tn_producto` por pg),
núcleo `lib/erp/comparacion.core.js` (`tests/erp-comparacion*.test.ts*`).

**Diferencias con GN** (14-oct, sólo lectura; 🎨 19-oct, Diseño 7: molde de REGISTRO — números arriba (sin explicar · sobreventa · explicadas solas), UNA lista con una vista por clase + «Sobreventa», buscador, y la fila abre `FichaPrenda` AL COSTADO; ⛔ cambió qué se calcula; `tests/erp-diferencias-pantalla.test.tsx`): lo que el libro ⛔ pudo explicar al comparar su día con
el de GN (`stock_diff`), agrupado por clase con qué mirar, y la **sobreventa**: las prendas que el libro
deja en NEGATIVO hoy. Cada fila abre la ficha de Stock. Núcleo en `lib/erp/diferencias.core.js`
(`tests/erp-diferencias.test.ts`). 🔴 La sobreventa ⛔ es una clase del diff: si GN también quedó en
negativo, el día cierra (medido: las 13 de BDI del 14-oct están en −1/−4 en los dos) ⇒ se suma aparte, por
pg con `DATABASE_URL_<MARCA>` (supabase-js ⛔ agrupa); sin esa variable la pantalla lo dice. 🔴 Los nombres
salen del espejo PAGINADOS: una fila por talle y depósito pasa las 1000 de Supabase y cortaba callado.

**Conciliación** (18-oct, sólo lectura, paso 7; 🎨 19-oct, Diseño 7: molde de REGISTRO — cuánto coincide en tarjetas arriba, UNA lista de lo que ⛔ coincide con una vista por clase (con su número y qué mirar), la tienda sale de la marca del ERP (Zattia trae el selector Zattia/Stunned), la prenda abre `FichaPrenda` AL COSTADO y el pedido, Tienda Nube ↗; ⛔ cambió qué se calcula): el ERP contra Tienda Nube, GN y Mercado Libre, por tienda (Zattia,
Stunned, BDI) y por día: cuánto coincide y lo que ⛔, agrupado por clase con qué mirar. Tres tipos: el **stock de TN**
(leído EN VIVO a las 13:40) contra el libro MENOS lo reservado y contra GN; los **pedidos** de 7 días contra la venta
del ERP y la de GN. Lo de GN por depósito sigue en Diferencias (acá sólo su cuenta, por `porLinea`); ML dice «sin
conexión» hasta su app. Lo escribe el MOTOR (`lib/conciliacion.mjs`, `bin/tn.mjs conciliar`, sql/024: sólo lo que ⛔
cierra, con los días seguidos); núcleo de la pantalla en `lib/erp/conciliacion.core.js` (`tests/erp-conciliacion.test.ts`).
🔴 Una clase nueva del motor se nombra en `CLASE`; si ⛔, la pantalla la avisa como desconocida (⛔ la esconde).

**Ajustes** (19-oct, paso 7; ESCRIBE en el libro): el ajuste de stock con motivo — Conteo (lo contado) · Fallado ·
Influencer / canje · Regalo / sorteo / donación (sacan) · Otro (con porqué). Se arma `para_aprobar` con lo que decía el
libro (`antes`) y al aprobarlo el motor (`motor/stock/ajuste.mjs`, sql/026, por pg en UNA transacción) escribe un
movimiento `ajuste` por renglón; descartar ⛔ mueve nada; ⛔ se edita ni se borra (otro ajuste). Handler
`api/_erp-ajustes.js`, núcleo `lib/erp/ajuste.core.js` (`tests/erp-ajuste*.test.ts*`).
🔴 EN SOMBRA: mueve SÓLO el libro, ⛔ GN ni TN (el diff lo explica como `ajuste_erp`). La lista «A contar» es
`libro_aparte` de la Conciliación (TN y ML) + `venta.detalle.contar` (Caja con PIN). 🔴 Un ajuste APROBADO antes de que
se calculara la conciliación ⛔ cierra la fila: si sigue sin coincidir, vuelve a la lista. 🔴 Un conteo del módulo de
Depósito (`conteos_deposito`) también entra solo al libro (`ajuste_conteo`) ⇒ el motor AVISA si la prenda tiene uno de
los últimos 3 días (contarla dos veces la descuenta dos veces).
🎨 **19-oct (Diseño, Bruno): la pestaña pasa a «Conteos y ajustes» (`/erp/stock/ajustes`, misma dirección).** ⛔ se
cuenta en el ERP (el libro se igualó a GN el 19-oct y el Conteo del monitor entra solo) ⇒ la pantalla ⛔ muestra «A contar»
ni ofrece «Conteo» a mano (lo de arriba sigue en el servidor y el núcleo, sin pantalla). Quedan: «Nuevo ajuste» (Fallado ·
Canje · Regalo · Otro) que GUARDA = `crearAjuste` + `aprobarAjuste` (aprobación apagada; si el 2º falla queda en «Sin
confirmar») y la lista de ajustes (`ListaTrabajo`) con la ficha al costado (antes → cambio → después por prenda).

**Ventas** (19-oct, el PILOTO del diseño aprobado — `~/Documents/erp-monitor/diseno.md` §3–§5 y §8; lo construye la sesión
Diseño): UNA lista con todo lo que es venta del motor (Caja, Tienda Nube, mayoristas, cambios) + los pedidos de TN SIN PAGAR
(los abiertos hoy, de cualquier fecha), con vistas que dicen cuántas hay (A preparar · Listas · Sin pagar · Con saldo · Sin
factura · Anuladas), el resumen del filtro ARRIBA, buscador (número, pedido de TN, cliente, nota), columnas a elección
**guardadas por usuario** (`lib/erp/lista-prefs.ts`, localStorage por usuario) y la ficha AL COSTADO con su historial.
Pantalla `components/erp/ventas/` · núcleo puro `lib/erp/ventas-lista.core.js` (`tests/erp-ventas-lista.test.ts`, también
el servidor) · servidor `api/_erp-ventas.js` (`vista=ventas-lista`, `vista=venta-extra`, `accion=editar-venta|nota-venta|cobrar-venta`)
· pantalla en `tests/erp-ventas-pantalla.test.tsx`. Las piezas nuevas son del kit (`components/ui/ListaTrabajo`,
`PanelColumnas`, `FichaCostado` con `Historial`, `DatoFicha`, `BarraSeleccion` y `AccionSeleccion`, y `PiezasLista`: `TileResumen`,
`VistasLista`, `BuscadorLista`, `InterruptorDensidad`, `ChipEstado`, `cuandoCorto`): Stock, Clientes y Productos salen con el
mismo molde. ⛔ se copian en la pantalla nueva (Ajustes y Stock ya las usan).
- 🔑 Lo que el motor ⛔ tiene se LEE de donde está y se dice: el **cliente** (0 de ~950 ventas traen `cliente_id`, medido 18-oct)
  sale del espejo de GN (`ventas.client_name`, por la venta de GN o por `tn_order`) con «de GN»; un pedido online sin nombre
  todavía ⛔ es «consumidor final» (el espejo llega al otro día). El **estado** del pedido, de `tn_orden.estado` (§14.1); el
  de un mayorista, el `sale_state` de GN. La **factura**, la del ERP (`venta_factura` → `facturas`) o la de GN (`ventas_factura_gn`).
- 🔑 Editar · notas · cobrar una venta van por el contrato §16 del motor (`motor/venta/ficha.mjs`, `motor/cuenta/cuenta.mjs`)
  por pg. 🔴 Si la COPIA del motor del monitor ⛔ trae la función, la ventana se dibuja y dice «espera al motor» (`queSabeElMotor`):
  ⛔ un camino inventado. Lo económico (prendas, precios, pagos) ⛔ se edita: lleva a Hacer cambio / Registrar cobro / Anular.
- 🔑 El cobro va IMPUTADO a esa venta (`registrarPagoACuenta`, `imputar`, nunca más que su saldo); lo que sobra va a la venta
  más vieja que deba (lo hace el motor). Clave por ventana abierta (`erp-cobro:<uuid>`): reintentar ⛔ duplica.
- 🔑 **Los pedidos sin pagar viven ACÁ** (Bruno, 17-oct: «Ventas abarca todo lo que es venta… se separan con FILTROS»; la
  pestaña se fue el 19-oct): la fila dice el medio que eligió en el origen y, desde `PEDIDO_VIEJO_DIAS` (3), cuántos días lleva
  colgado al lado del estado; el $ y el «⋯» llevan a **Cobranzas** del monitor (↗, ahí se cobra transferencia o efectivo) y a
  Tienda Nube (cancelarlo); la ficha muestra cuándo entró, el medio y las prendas que retiene. El buscador lee también las
  prendas. Al pie, cuándo se leyó Tienda Nube (`tnLeidaEn`, cada 2 h).
- 🎨 **Por producto (Diseño 8, 20-oct; pestaña `/erp/ventas/por-producto`, ⛔ «por prenda»)**: **Agrupado por producto**
  (unidades NETAS, ventas, vendido, precio promedio y, sólo con permiso `costos`, el margen) y **Cada renglón** (como GN).
  🔑 Sale del ESPEJO DE GN (`ventas` + `venta_detalles`, por pg con `conMotor`), como Inicio: el motor tiene sólo una parte
  (20-oct: Zattia local 181 ventas en el motor contra 604 en GN; BDI local 3 contra 317). El margen usa `costo_vigente`
  (el de HOY; sin costo ⇒ «sin costo», ⛔ 0) y el servidor ⛔ lo manda sin `costos`. GN guarda el DÍA sin hora ⇒ `diaCorto`
  (⛔ `cuandoCorto`: diría 00:00). Período ≤ 93 días. Clic ⇒ `FichaProducto` (sin la fila de Productos: sin la grilla de
  stock). Medido 20-oct (1–20): BDI 3.840 renglones, 2,4 s, 1,1 MB · Zattia 1.468, 1,5 s; oráculo `oraculos/por-producto-
  servidor-lectura.mjs` (Σ y unidades = la base). Núcleo `lib/erp/ventas-producto.core.js`; test `tests/erp-por-producto.test.tsx`.
- 🎨 **Anular y desarmar (Diseño 8, 20-oct; contrato-venta.md §17, 37a)**: la ventana de anular dice ADÓNDE va la
  prenda (`vueltaSiAnula` = `vueltaDe` del motor con `tn_orden.estado`: al instante · «A desarmar» si estaba empaquetada ·
  «A recibir» si ya salió) y, si entró plata, hace ELEGIR: **devolver la plata** (por el medio con que pagó) o **dejar
  saldo a favor** (a precio de LISTA; sin clienta en la venta pide documento y nombre). 🔴 Siempre manda `devolucion`
  (`leerAnular` la exige). PIN apagado (`DEVOLUCION_CON_PIN`) ⇒ ⛔ manda `autoriza`. Una anulada pendiente tiene estado
  «A desarmar»/«A recibir», su vista en la lista (entran SIEMPRE, de cualquier mes: `venta_vuelta_pendiente`) y en la
  ficha el **escaneo**: código de barras (`inventario.barcode`) o SKU, sin guiones; «+1» a mano; con TODAS contadas,
  «Confirmar que volvieron» ⇒ `confirmarVuelta` (acción `confirmar-vuelta`, permiso `desarmar`: Local y Depósito).
  Núcleo `lib/erp/desarme.core.js`; tests `tests/erp-ventas-anular.test.tsx`. 🔴 `venta_devolucion` y `venta_vuelta` son
  INMUTABLES ⇒ ⛔ ejercer en prod sin OK de Bruno y sólo en una venta de PRUEBA.
- Anular (con motivo, sólo admin) y la NC de una anulada facturada siguen como antes, desde la ficha (`anularVenta` del
  motor por pg; 🔴 sin `DATABASE_URL_<MARCA>` en Vercel contesta 409). 🔑 «Prueba» = corre en paralelo con GN y ⛔ movió el libro.

Y **Facturación** (F5 del plan): el tope del mes, lo ya facturado y las ventas sin
factura, que se facturan con ARCA (ex AFIP) por web service. Reemplaza la facturación masiva de GN
y el «Pendiente de facturar» del dashboard de Darío.
🎨 **Con el molde (19-oct, Diseño 7)**: arriba el tope (tarjeta oscura), lo facturado con su % del tope (GN · ERP), lo
pendiente (las dos marcas) y cuántas sin factura tiene la marca del menú; abajo UNA lista con tres vistas —Sin factura
(Nº y clienta de GN, último cobro, a qué cuenta entró, «A facturar»; clic o tilde ⇒ barra con «Facturar»; la barra DICE
por qué ⛔ se puede: pasa lo pendiente, más de `porPedido`, facturación apagada) · Facturas (las de GN del mes, por el día
de la venta, + las del ERP con CAE; «⋯» = PDF y NC) · Notas de crédito (sólo las del ERP)—, de a 300 («Mostrar N más»).
Núcleo `lib/erp/facturacion-lista.core.js`; el Nº, la clienta y las facturas de GN los suma el GET del mes
(`vistaDeFacturacion`, sólo lectura: ⛔ entra en `facturarVentas`). Test `tests/erp-facturacion-pantalla.test.tsx`.

- 🔑 **`erp › Productos y precios › Productos`** (🎨 19-oct, Diseño 7: lista de TRABAJO con el molde, tablero 5 del v8; reemplaza
  al «buscá un producto» de `PreciosProducto.tsx`, 15-oct): un producto por fila —variantes, disponible, costo, precio Local ·
  Online · Mayorista, si está en Tienda Nube (publicado / oculto / no está), categoría, proveedor— con vistas de lo que FALTA
  (Sin costo · Sin precio mayorista · Sin proveedor · Sin código de barras · Ocultos / No están en TN), resumen arriba,
  buscador (nombre, SKU, código entero, categoría, proveedor), columnas por usuario (`erp-productos`) y Exportar. 🔑 Medido 19-oct:
  los activos del motor (`producto.activo`) = los del espejo de GN (BDI 313, Zattia 890 con Stunned). Las variantes y su stock
  son las filas de la lista de Stock (`listaDeStock`) agrupadas; lo del producto, `precio_lista`, `costo_vigente` y el cruce con
  TN (`tn_variante` por SKU → `tn_producto.publicado`), por pg (`api/_erp-productos.js`, `vista=productos-lista`; núcleo
  `lib/erp/productos-lista.core.js`, `tests/erp-productos-*.test.ts*`). ⛔ fotos en la base ⇒ ⛔ vista «Sin foto». ⛔ alta (nace en Ingresos).
  La FICHA al costado (`components/erp/productos/FichaProducto.tsx`) es lo que era Precios: lee `vista=precio&producto=…` —precio
  por LISTA y costo como los tiene el motor (`precio_vigente`/`costo_vigente`), de dónde salió cada uno y su historial, con GN
  (`productos.retailer_price`…) y TN (`tn_variante` por los SKU, con cuándo se leyó: puede estar vieja); avisa local ≠ TN, sin costo
  y costo de TN ≠ ERP— + cada variante con su stock por depósito (en GN cada color es OTRO producto ⇒ la grilla color × talle del
  tablero es una fila por variante). «Cargar en el ERP» (`CargarPrecio.tsx`; el $ de la fila abre la ficha con el formulario) =
  `cargarPrecio`/`cargarCosto` del motor (contrato §13): fila `carga` que manda sobre las copias, pero
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

**Cuentas de cobro** (18-oct): las RUTAS de gerencia —qué cuenta REAL (las del dashboard, copiadas a `cuenta_real`)
recibe cada medio, por línea × canal, desde un momento— (`components/erp/RutasCobro.tsx`, `api/_erp-rutas.js`, núcleo
`lib/erp/rutas.core.js`). Leer y poner van por el contrato del motor (`motor/cuentas/rutas.mjs`, sql/019-020): una ruta
⛔ se edita, se pone otra, y ⛔ para atrás (lo frena el motor). 🔑 Bruno: la cajera ve sólo el MEDIO; el descuento va
en el medio (Reglas), ⛔ en la cuenta. Cambiar a una cuenta que FACTURA (`esFacturable`: Areben y ⛔ efectivo) un medio
con descuento AVISA antes y después de guardar (`avisoDeRuta`, Stunned con sus reglas o las de Zattia como la Caja):
⛔ cambia la regla. 🔴 EN SOMBRA: la ruta anota la cuenta real de cada cobro del motor (TN, Caja→motor); la Caja sigue
con su cuenta de MP hasta activar el ERP. Saldo a favor ⛔ lleva ruta (⛔ entra plata).
🎨 **Reglas y Cuentas de cobro con el molde de REGISTRO (19-oct, Diseño 7)**: las dos llevan arriba la tira cuenta · medio ·
ruta · regla (`TiraConfiguracion.tsx`; Ruta y Regla llevan a su pestaña) y toman la marca del MENÚ (`key={marca}` en
`Erp.tsx`; se fue el selector propio). Reglas: UNA lista con vistas Prendidas · Apagadas · Promos bancarias (de la Agenda,
sólo se ven) · Todas, la campaña como columna, Stunned por el selector de línea; «⋯» = Editar / Apagar-Prender; clic en
la fila ⇒ el formulario de esa regla (el formulario y el simulador siguen igual, abajo). Cuentas de cobro: una fila por
canal × medio de la línea, vistas por canal + «Sin ruta» + «Cambios» (el historial); clic o «⋯» ⇒ la ventana «Cambiar la
ruta» (mismo aviso antes de guardar). ⛔ cambió ningún contrato. Tests `tests/erp-reglas-pantalla.test.tsx`, `erp-rutas-pantalla`.

**Inicio** (🎨 19-oct, Diseño 7, `components/erp/inicio/InicioErp.tsx`): arriba el **resultado comercial del mes**
(vendido · margen bruto con su % · ventas y ticket · contra el mes pasado), del 1 a hoy contra el MISMO tramo del mes
anterior, del espejo de GN (`api/_erp-inicio.js`, `vista=inicio-resultado`; GN es el que vende hoy). 🔴 El estado de la
venta ⛔ se filtra (`lib/crm/metricas.ts` §2: «Compra Pendiente» es normal). Oráculo 19-oct
(`~/Documents/erp-monitor/oraculos/inicio-resultado-lectura.mjs`): BDI $29.525.439 = «Ventas mensuales › Día a día»
$29.525.075 (1 venta), Zattia $22.416.415 contra $22.373.468 (0,2%). Abajo, **«Para hacer» por rol** (Local ·
Administración · Productos) con el número de la vista de cada lista, contado con SU núcleo (`contarVistas` de Ventas del
mes, Stock y Productos: ⛔ otra cuenta); cada uno lleva a su pestaña y una lista que falla dice «no se pudo».

**Clientes y proveedores** (🎨 19-oct, Diseño 7: molde de TRABAJO, sólo lectura): **Clientes** = UNA lista con cada
cliente (tipo, compras, comprado, última/primera compra, canales, **saldo de la cuenta**), vistas Todos · Compraron este
mes · Mayoristas · Con saldo · Sin comprar hace +90 días, resumen arriba, buscador (nombre, DNI/CUIT), columnas por
usuario (`erp-clientes`), Exportar y la ficha AL COSTADO (saldo en grande = debe − a favor, ventas con saldo, contacto,
sus compras). 🔑 Medido 19-oct: el motor ⛔ tiene clientes (`cliente` vacía, 0 ventas con `cliente_id`, `cuenta_movimiento`
vacía) ⇒ la lista sale del espejo de GN (`ventas`, sumado por pg en `api/_erp-clientes.js`): BDI por `client_id` (13.453;
contacto de `clientes`, el CRM), Zattia por NOMBRE (4.028: su espejo ⛔ trae el id; dos homónimos se ven como uno — la
pantalla lo dice). «Consumidor Final» ⛔ es un cliente. Sin cuenta en el motor el saldo dice «sin cuenta» (⛔ un 0 que
parece al día); la cuenta del motor (§15, `cuentasCorrientes`/`cuentaDe`) se pega por `gn_client_id` o por nombre. Los de
GN viajan como TUPLAS (`aTupla`/`deTupla`: con objetos BDI pesaba 3,7 MB, así 1,1) y las arma el navegador. Núcleo
`lib/erp/clientes-lista.core.js` (`tests/erp-clientes-lista.test.ts`, pantalla `tests/erp-clientes-pantalla.test.tsx`).
**Proveedores** = los del motor (sql/013, `vista=proveedores`) con cuántos productos tiene cada uno, vistas Con/Sin
productos · Sin CUIT; sólo ver (nacen en Ingresos) y «⋯» a PRM / Ingresos ↗. ⛔ todavía: «Nuevo cliente», «Registrar
cobro a cuenta» desde Clientes (el cobro vive en la ficha de la venta) y la «decisión de cobro» por venta (⛔ existe en el motor).
**Cuenta corriente** (🎨 20-oct, Diseño 8 · 7; contrato §15): UNA lista por cliente × línea con lo de `cuentasCorrientes`
del motor (pendiente · a favor · **saldo** · vencido · la más vieja · crédito · estado · los 4 tramos de antigüedad como
columnas opcionales), vistas Con saldo · Atrasadas · Con saldo a favor · Con crédito · Todas, resumen arriba (por cobrar =
Σ saldo, vencido, a favor, por antigüedad), y la ficha AL COSTADO (`cuentaDe`): crédito, ventas con saldo nombradas por
su número (`nombresDeVentas`, del detalle del mayor), el **mayor** entre dos fechas y «Exportar» (el CSV lo arma el motor:
`mayorCSV`). **«Marcar crédito» sólo admin**: la acción `poner-credito` ⛔ está en `PERMISO_DE_ACCION` ⇒ pide `configurar`.
🔑 **Dos libros que ⛔ se suman**: real y PRUEBA (las mayoristas de GN en sombra, `sql/030` de A); **hasta el corte abre
en PRUEBA** («Reales / De prueba») y avisa que los cobros a cuenta cargados en GN ⛔ llegan (saldos de más). Sin documento
(los 233 de GN) dice «sin documento». La ficha de la VENTA avisa «GN la vendió sin crédito» (`detalle.cuenta_autoriza.motivo
= 'gn'`, `sinCreditoGN` de `fichaDeVenta`): aviso, ⛔ error. Medido 20-oct: BDI 232 clientes, 0 cuentas reales, 15 de prueba
($ 7.149.977,60); Zattia 0 clientes. Servidor `api/_erp-clientes.js` (`vista=cuentas-corrientes`, `vista=cuenta-cliente`),
núcleo `lib/erp/cuenta-corriente.core.js` (`tests/erp-cuenta-corriente.test.ts`). ⚠️ `cuentasCorrientes` hace 3 consultas
POR cliente: con 15 tardó 8,5 s desde la Mac.

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

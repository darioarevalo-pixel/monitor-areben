# PENDIENTES — legibilidad del monitor

**Lo dijo Bruno el 25-ago-2026, y es el pedido que abre este archivo:**

> «los sectores en monitor no se entienden qué hace ni qué ejecutan, está mal armado, tiene
> funciones pero no las usa nadie»

Este archivo NO es una lista de features. Es el análisis de **por qué una app con 55 secciones
terminadas se usa poco**, y los pendientes que salen de ahí. Lo que se arregle, se borra de acá.

⚠️ Antes de tocar: hay **otra sesión trabajando en este repo**. Rutas explícitas, `git fetch` al
arrancar, `git commit -F msg -- <rutas>`, ⛔ nunca `git add -A`.

---

## 🏁 «QUÉ ETIQUETO HOY SÁBADO SIN REGALAR LA VENTA DEL SÁBADO» — 12-sep-2026 (dictado, y medido)

> «si hago etiquetar el local el lunes no llego al horario de partida que son las 10am, entonces
> creo que tengo que empezar a etiquetar hoy… si la gente ve esa etiqueta, se vende a ese precio, se
> cambia manualmente, pero la forma de pago de eso es efectivo/transferencia. y además ver de todos
> los productos qué podemos etiquetar hoy, que no molesten tanto o por la cantidad o por vender a
> ese precio… hay otros que conviene etiquetarlos a la tarde pq conviene que menos gente compre a
> ese precio, pq se puede vender sin problema al precio que está hoy.»

🔑 **Lo que cuesta etiquetar algo temprano es una plata, ⛔ no una intuición:**

    riesgo = (precio que tiene HOY − precio de feria) × lo que ese modelo vende UN SÁBADO

**Las dos mitades engañan por separado**: una prenda que resigna $28.000 pero ⛔ no vende no cuesta
nada, y una que resigna $4.000 pero vende tres sí. `scripts/feria-zattia-riesgo-sabado.mjs`
(⛔ no escribe nada; `--dejar=N` mueve el corte).

- 🔴 🔑 **LA UNIDAD DEL LOCAL ES LA ETIQUETA, ⛔ NO LA PRENDA** — corregido por Bruno: *«del local
  sólo se va a etiquetar lo exhibido, una sola unidad por color»*. **Yo había contado 1.149**, que
  es el stock del salón. **El pid de Gestión Nube YA ES el color** —está adentro del nombre
  (REMERA S-MAIL BLACK, CAMPERA ROCK - VIOLETA) y en el salón **⛔ no hay un solo nombre con dos
  pids**, verificado— ⇒ **el salón son 280 etiquetas**, una por ítem vivo de la campaña que tenga
  stock en el local.
- 🔑 **Y el DEPÓSITO es otra cuenta Y OTRA GENTE** (Bruno: *«eso no tiene nada que ver la gente del
  local»*): **2 por talle por color**, que da **48 modelos · 274 etiquetas** en 3 tiradas
  ($4.990 → 176 · $12.990 → 70 · $14.990 → 28). `feria-zattia-etiquetado.mjs --min-talle=2 --max-talle=2`.
- ✅ **El techo del riesgo es chico: $199.375** — y eso es si **toda** la venta de un sábado entero
  se hiciera al precio de feria. **El depósito es riesgo CERO**: nadie compra lo que no está a la vista.
- ✅ 🔑 **EL RIESGO ESTÁ CONCENTRADO EN MODELOS SUELTOS, ⛔ NO EN MESAS** ⇒ la orden operativa es
  «etiquetá todo **salvo esta lista**», que además es la única que funciona porque **el perchero ⛔ no
  ordena por mesa**. **De 280 modelos del salón, 217 ⛔ no vendieron NI UNA en los 4 sábados medidos**
  y sólo **63** tienen riesgo. **9 modelos son el 50%**; **CORSET FRANK ($39.990 → $11.990, 8 u) y
  JEAN WORN ($56.490 → $27.990, 6 u) solos son el 32%**.
  ⇒ **dejando 20 etiquetas para el cierre se ahorra $142.350 (71%) y quedan 260 para hacer ahora.**
- ⚠️ **Qué mide el instrumento**: el «⛔ no vende un sábado» son **4 observaciones** (los 4 sábados
  con el sale ya puesto: 15, 22, 29-ago y 5-sep) ⇒ sirve para **ORDENAR**, ⛔ no para prometer que
  no se venda. Y **hoy se excluye**: el sábado está a medias y contarlo lo subestima.
- 🔑 **El «precio de hoy» sale de `aplicacion.precioEscrito` del Sale Invierno Agosto 2026**, que
  sigue `aplicada` y sigue puesto en GN; el que ⛔ no está en esa campaña está a **lista**.
  ⛔ **No sirve `foto.promoPrevia`**: la foto de la feria está congelada al 6-sep.
- 🔴 **El control contra el 11-sep ⛔ NO da igual, y la diferencia está explicada**: el salón pasó de
  294 modelos / 1.282 prendas a **280 / 1.149** porque el 11 se descartaron los 7 de CONTAMINA
  (que estaban en el salón y a precio de lista) más dos días de venta. Y de los **6 que «subían»
  quedan 2** (VESTIDO LUA +$1.000, TOP BRIA +$500): a BODY SWEET, BODY CLARI, TOP KOBE y VESTIDO
  AMBAR **alguien les igualó la mesa al precio de hoy** entre el 11 y el 12.
- 🔴 **El precio de la etiqueta es el FINAL** (confirmado por Bruno): en la caja se carga el
  descuento a mano **hasta ese número**, ⛔ **sin el 15% de efectivo ni el 10% de transferencia**
  que el sistema tiene cargado. Medido el 5-sep: con ese descuento encima el bloque queda **$6,63M
  contra $6,91M de costo**.
- ▶️ 🔴 **Sigue sin hacerse, y es lo único que puede arruinar 550 etiquetas: sacar UNA en la Zebra
  real** con el título `FERIA ZATTIA` y el renglón `EFT/TRANSF` puestos. `tamPrecio` ⛔ no se acota
  al alto de los 25 mm.

---

## 🏁 «QUE LAS CHICAS PUEDAN VER QUÉ PRECIO VAN A ESTAR» — 10-sep-2026 (dictado, y hecho)

> «ya armé la liquidación de zattia, tengo varios productos confirmados con el precio, que todavía
> no está publicado en la tienda pq se lanza el lunes y hoy es jueves, pero necesito que las chicas
> puedan ver qué precio van a estar los distintos productos. sobre esa liquidación, una vista y unas
> estrellas para poder marcar como favorito y hacerle marketing a eso. son acciones comerciales
> donde hay varios productos, pero nosotros identificamos las estrella. incluso en el análisis de
> cada producto, estaría bueno poder marcarlos en general.»

🔴 **El hueco no era una pantalla que faltaba: era un permiso que está cerrado A PROPÓSITO.**
Marketing ⛔ no ve `liquidacion` porque la foto congelada de cada ítem trae **costo, markup, margen y
ventas** —y la feria se vende **al costo**: el ítem que usa el test tiene costo $8.295,89 contra un
precio de mesa de $8.990—. Abrirle la sección era publicar el margen de la casa adentro del equipo.

🏁 **Sección nueva `precios` (área `marketing`)**: la lista de una campaña con foto, precio de lista,
precio de campaña, % off y stock. Entra por el área ⇒ ⛔ **no hay que tildarle nada a nadie**. Lo que
sale pasa entero por la **lista blanca** de `lib/precios/core.core.js` — un campo se agrega ahí o no
viaja. **5 mutantes, 5 muertos**, y el fixture del test es un ítem real de la feria. El relato
entero, en `docs/secciones/precios.md`.

🔑 **Tres cosas que la pantalla dice en voz alta, y que salieron de medir antes de escribir:**
- **286 confirmados y 65 sin revisar.** Un `definido` es un precio que nadie miró y que cambiar lo
  devuelve a la cola ⇒ van con chip **Confirmado** / **Provisorio** y un aviso arriba. Mostrarlos
  iguales le hace prometer a Marketing el **18%** de una lista que se puede mover.
- **El stock es el de HOY**, ⛔ no el de la foto congelada (la de la feria es del **6-sep**), con el
  sello de `sync_state` al lado.
- **Se comparte con un interruptor de admin, ⛔ no con el estado**: derivarlo de `en_curso` dejaba
  afuera justo esta campaña, que tiene los precios listos y todavía ⛔ no rige.

🏁 **Y la ⭐ de producto estrella** (tabla `destacados`, migrada en las **dos** bases con las sondas
ejercidas por rollback — incluida la que importa: sin `coalesce(liq_id,'')` las generales, que
tienen `liq_id` nulo, se podían marcar cien veces sin que nada fallara). **Un mecanismo, dos
alcances**: `liq_id` = campaña es «de esta acción comercial»; `liq_id` null es «producto estrella en
general», el de Análisis → Por producto. 🔑 **Marcar pide lo mismo que ver** (lo decidió Bruno:
*«también marketing»*) — al revés que `clavados`, que es de admin.

⚠️ **De paso, dos comentarios que mentían**: `lib/permisos.core.js` y `api/_mkt-ventas.js` afirmaban
que Marketing ve el resultado del sale por la llave `?resultado=1` de `_liquidacion`, que **⛔ no
existe** y que el test de autorización fija en el sentido contrario.

▶️ 🔴 **Queda UNA mano de Bruno** (11-sep, verificado por GET):
1. ✅ **«Compartir con Marketing» YA ESTÁ APRETADO** — la campaña trae `compartida: true`,
   `compartidaPor: Bruno Arevalo`, `compartidaEn: 2026-09-10T13:36:57Z` ⇒ Marketing **ya ve** la lista.
2. ▶️ **Publicar la novedad** `n1789046242845_7xbdsh` («Precios de campaña: a qué precio va cada
   producto»), que **sigue en `borrador`** — medido contra `?recurso=sistema`.

🔴 **Y la ⭐ ESTUVO ROTA hasta hoy, sin que nada lo dijera.** Prenderla, apagarla y volver a
prenderla **el mismo día** chocaba contra la clave primaria (el id llevaba sólo la fecha, copiado de
`clavados`), y el handler leía ese choque como «ya estaba» ⇒ contestaba **200 sobre una estrella que
⛔ no quedó marcada**. ⚠️ **Los tests y las sondas de la migración estaban las dos en verde**:
ninguna vuelve a marcar en el mismo día. Lo cazó **ejercer el verbo contra la base**. Arreglado en
`c186f15` (el id lleva el instante; el handler mira el nombre del índice, ⛔ no «duplicate key»), con
`tests/destacados.test.ts` y 3 mutantes muertos. El relato, en `docs/secciones/precios.md` § Lo que
ya se rompió acá. 📌 **`clavados` tiene la misma forma de id y el mismo agujero latente**; ahí casi
no muerde porque marcar se hace una vez.

✅ **Y ya está ejercida en PROD por Bruno**: `CAMPERA REVOLUTION` (pid 1012499) quedó destacada en la
feria el 11-sep 11:46, con el id del formato nuevo ⇒ el arreglo está deployado y anduvo.

▶️ **Lo que sigue sin verificarse, y es lo mismo que en Ventas de Marketing**: ⛔ **nadie con perfil
de Marketing caminó la pantalla.** Todo lo ejercido fue con admin.

📌 **Dos cosas para mirar antes del lunes, medidas el 11-sep**: quedan **65 precios en `definido`**
(la pantalla los muestra como **Provisorio** y avisa arriba), y **10 de los 351 están hoy en CERO de
stock** — comunicarlos es prometer algo que no está.

▶️ ⛔ **Nadie con perfil de Marketing la caminó**: ⛔ no pude entrar a producción —la credencial del
Monitor es de Bruno— así que lo verificado es el router de prod contestando por los dos recursos
nuevos, la proyección corrida contra los 376 ítems reales de la feria (**351 renglones = 286 + 65**,
**cero** apariciones del costo) y las sondas de la base. **La pantalla misma ⛔ no se abrió.**

📌 **Un límite que no es del código y conviene saber**: en una feria **al costo**, el precio de mesa
de un producto **puede ser** su costo —pasa en 2 de los 351— porque cada uno va al primer escalón
`>=` su costo. Eso lo puede deducir cualquiera que mire la lista, y ⛔ no lo arregla ninguna lista
blanca: es la forma de la feria, ⛔ no una fuga.

---

## 🏁 «ESTÁ COMO NOMBRE DE PRODUCTO Y NO COMO SKU» — 10-sep-2026 (dictado, y hecho)

> «cargué unos productos sin código de barra pero tenía el SKU, entonces los escaneé y los metí.
> Fijate en el de Zattia. Ahora quiero devolver los productos y está como nombre de producto y no
> como SKU. Estaría bueno que si el nombre es como un SKU, que el SKU o código de barras sea eso
> mismo. Esto en solicitudes de productos.»

**Medido antes de escribir**: la solicitud es `s1788353298507_54730` (Zattia, 2-sep, «SESION
ESTUDIO 02/09»), **152 ítems y los 152 cargados «a mano»**, con el código de nombre y el SKU vacío.
El campo «Cargalo sin código» dispara con Enter y un lector tipea código + Enter: escanear ahí crea
un ítem que **⛔ ningún escaneo puede encontrar después**.

🏁 **Ahora se vinculan solos** —que es lo que la pantalla ya prometía y ⛔ no hacía nadie:
`sfVincularNuevos` del legacy nunca se había portado— y se completan nombre real, talle, SKU y
código de barras. **Ensayado contra los datos reales: 150 de 152**, los 2 restantes son códigos que
⛔ no existen en GN y quedan con su código guardado, escaneables.

🔴 **Siguen siendo «a mano» — lo decidió Bruno**: ⛔ no generan venta en Gestión Nube. Crear la venta
ahora separaría stock de mercadería que ya salió.

▶️ **Falta que Bruno lo camine**: abrir la solicitud, ver los nombres reales sin perder los 6
preparados ni el 1 devuelto, y **escanear una etiqueta con el lector puesto**. El relato entero, en
`docs/secciones/sesionfotos.md`.

---

## 🏁 «SIGUE EL PROBLEMA, MARCA $0 EN TODA LA INFORMACIÓN» — 8-sep-2026 (dictado, y hecho)

> «mirá, sigue el problema que el resultado marca pesos $0 en toda la información» *(con la captura
> de la lista del PRM: las cuatro columnas medidas en «…»)*

**⛔ No estaba rota: estaba viajando** — y el pedido había pasado de ~2,7 s (medido el 3-sep) a
**4,36 s** sin que nadie lo volviera a medir. Lo que lo duplicó fue el **recruce que entró el
7-sep**, el arreglo de ELIANA IND: `leerEspejo` pedía sus lotes en **fila india** —8 viajes seguidos
por marca— y costaba **3,1 s** él solo.

🏁 **Ahora los lotes van en paralelo, y el padrón y las órdenes también.** Medido después, mediana de
5 corridas: **4.362 → 2.185 ms**, con la huella idéntica.

🔴 **Y la otra mitad del reporte ⛔ no era la velocidad: la pantalla ⛔ no decía nada.** Un «…» que
tarda se ve igual que una colgada. Ahora dice qué está viajando; y si ese pedido **falla**, las
celdas pasan a «?» con un aviso — antes decían «—», que afirma «no vendió nada» en las 34 filas y
⛔ no se distinguía de «este proveedor no tiene órdenes».

🏁 **Y las celdas muestran una BARRA QUE LATE, ⛔ no «…»** — lo pidió Bruno el mismo día: *«estaría
bueno que marque algo como cargando, en vez de que marque en cero los resultados»*. 🔑 **Evitar la
mentira ⛔ no es lo mismo que decir la verdad**: los puntitos ya ⛔ no afirmaban un cero, pero en una
tabla de 34 filas se leen como la celda vacía de un dato que no está.

▶️ **Queda medido y sin hacer**: el pedido son tres etapas en fila —padrón + órdenes ~1,0 s →
recruce ~0,8 s → ventas ~1,1 s—. Arrancar las ventas de los renglones que YA tienen `producto_id`
en paralelo con el recruce valdría **~0,7 s**, a cambio de dos consultas de ventas en vez de una.
Decide Bruno.

▶️ 🔴 **Falta que Bruno lo mire.** ⛔ No pude entrar a producción —la credencial del Monitor es
suya—, así que lo que está verificado es el bundle y las mediciones contra las bases reales.

---

## 🏁 «LOS PRODUCTOS ESTRELLA DEL PROVEEDOR, PERO DE LOS ÚLTIMOS 15 O 30 DÍAS» — 8-sep-2026 (dictado, y hecho)

> «seguimos con proveedores prm, necesitaría saber los productos estrella del proveedor, pero que
> sean del último mes o de los últimos 15 días, que hayan ingresado y se hayan vendido bien. se
> entiende? o sea no me sirve los estrella del histórico pq no sirve, pero si algo se trajo hace 15
> o 20 días, puede llegar a haber recompra. incluso una alerta por mail podríamos ejecutar»

🏁 **Están las dos cosas: el bloque en la ficha y el mail de los lunes.** El relato entero, con las
reglas y las mediciones, en `docs/secciones/prm.md`.

🔑 **Por qué la tabla que ya había ⛔ no servía**: ordena por unidades vendidas en toda la ventana, o
sea **el más vendido de siempre**, y ése gana siempre por acumulación. Un producto de junio con 40
vendidas le pasa por arriba a uno de la semana pasada que se colocó entero en cinco días — y el
único de los dos que se puede recomprar a tiempo es el segundo.

📌 **Lo que hay hoy, medido el 8-sep contra las dos bases**: en 30 días entraron **109 productos
nuevos** de **16 proveedores**; 61 vendieron algo y **5 llegan al umbral**, de 3 proveedores
(CONTAMINA ×3, ELIANA IND, AIME). En 15 días son 66 productos y 4 pasan el 30% colocado.

🔴 **TODO ESO ES DE ZATTIA: BDI ⛔ no recibió NINGUNA orden de compra en 30 días.** El bloque le va a
decir «ninguna orden suya trajo un producto nuevo», y eso ⛔ no es un error de la pantalla.

🔴 **El stock de hoy ⛔ NO es «lo que le queda de lo que trajo», y por poco.** Sobre los 109,
`comprado − vendido` da el stock en **97** y ⛔ no en **12** — `TOP TERRA` compró 5, vendió 5 y tiene
5 —. La resta acierta casi siempre y **por eso el que falla ⛔ no se ve**: es un número plausible que
manda a Flores a comprar algo que ya está en el depósito. La columna dice el stock de verdad y la
pantalla explica que los dos ⛔ no se restan entre sí.

▶️ 🔴 **NADIE ABRIÓ LA PANTALLA TODAVÍA, y ⛔ no se mandó ningún mail.** El mail está armado y
probado con datos reales (`node scripts/estrellas-prm.mjs --simulacro`), pero el cron de los lunes
sale a la calle recién con este deploy.

▶️ **Y es de Bruno**: el stock que muestra la columna sale de `sync-inventario.yml`, que es **sólo a
mano** —lo aprieta una persona desde Reposición—. Por eso el mail y la pantalla dicen **cuándo** se
sincronizó ese espejo, en vez de callarlo. Si conviene que el reloj de los lunes lo dispare antes de
mirar, eso toca el candado `gestion-nube` y ⛔ no se hizo.

---

## 🔴🔴 LA FICHA DE RENTABILIDAD IGNORA EL SALE — 8-sep-2026 (medido, ⛔ SIN DECIDIR, y la plata SE ESTÁ YENDO HOY)

**Es el más caro de los cuatro de hoy, y el único que ⛔ no es del script sino de acá.** Lo destapó
Bruno de memoria: *«recordá que es sale, o sea que hay problemas con el tema del costo por compra,
no puede irse tan arriba»*, y después *«hoy está todo casi al costo, con IVA pero casi al costo»*.

### Lo que pasa

`meta_ads_rentabilidad` guarda el **precio de lista** y el motor recalcula el techo **sólo por las
unidades observadas** (`calcularRentabilidad({...norm, unidades: u})`): **el precio queda clavado.**
Y los supuestos ⛔ **no tienen campo de descuento** — el único que modelan es el **10% por
transferencia** (`transf`), que es un medio de pago, ⛔ no un sale de temporada.

Zattia: lista **$32.416**/unidad, costo neto **$14.623** (el 45% del precio). El descuento sale
entero del margen, ⛔ no del costo ⇒ el techo se derrumba mucho más rápido de lo que parece:

| precio/u | = costo × | off de lista | contrib/u | techo margen | techo **caja** |
|---|---|---|---|---|---|
| $32.416 | 2,22 | 0% | $7.702 | $4.946 ← **el que usa el parte hoy** | $10.228 |
| $27.554 | 1,88 | 15% | $4.353 | $3.289 | — |
| $23.397 | 1,60 | 28% | $1.490 | $1.326 | $4.747 |
| $21.203 | 1,45 | 35% | **−$20** | **no existe** | $3.401 |
| **$17.694** | **1,21** | **45%** | **−$2.437** | **no existe** | **$554** |

🔴 **«Casi al costo con IVA» = costo × 1,21 ⇒ cada venta pierde ~$2.400 ANTES de gastar un peso en
pauta.** No es que el CPA se fue arriba del techo: **no hay techo que superar.** La única vara que
sobrevive es la de CAJA (`costoMaxCaja`, que ya existe en el motor y nadie usa) — y el CPA real de
zattia ($3.561, 7 días cerrados) queda entre **105% y 643%** de ella según cuán al costo esté. ⇒ ni
siquiera como operación de liquidación se paga.

### 🔑 La verificación independiente, que ⛔ no toca la ficha

El ticket atribuido de zattia es **$39.424**. Eso implica **1,28 items por pedido** si el precio
fuera de lista, y **1,96** si es de sale. Lo MEDIDO en Tienda Nube (`ventas`, 30 días) es
**1,94-2,04 items por pedido**. ⇒ los pedidos reales dicen **sale**, ⛔ no lista. La ficha es lo
único que sigue creyendo en el precio de lista.

### Por qué nadie se enteró

**Ninguna regla disparó nunca sobre zattia**, y ⛔ no es que las reglas fallen: con el techo inflado
2 a 9 veces, zattia se ve **sana** en todos lados — el parte, el motor de hallazgos y la pantalla de
Rendimiento. En esta misma sesión yo informé *«es la pauta más eficiente de la casa, CPA al 73% del
techo»* y era falso por esto. ⚠️ **Le pega igual a BDI y a stunned**: mismo motor, mismo agujero,
y BDI tiene promo de 2ª unidad.

⇒ 🔑 **Un techo que se recalcula por unidades pero ⛔ no por precio da la sensación de estar
midiendo la realidad.** Es lo que lo volvió invisible: el número se mueve todos los días, así que
parece vivo.

### ▶️ Lo que queda abierto (Bruno: *«dejalo anotado, lo vemos más tarde»*)

1. 🔴 **ZATTIA SIGUE GASTANDO ~$7.760/día** — un solo conjunto, `TEST INTERESES 1 - ZATTIA 07/05`,
   más dos `ACTIVE` en cero. ⛔ **NO se pausó**: queda pendiente de decisión. La nota está en
   `meta_ads_decision` id **247**, con `vence: null` **a propósito**, para que las reglas sigan
   gritando en vez de callarse.
2. **Cargar el precio efectivo en la ficha** — falta UN dato: el precio promedio real de zattia (o
   cargar «costo × 1,21»). Es lo que destraba todo lo demás.
3. **La ficha necesita un campo de descuento** que ⛔ no sea `transf`, y el techo tiene que
   recalcularse por PRECIO además de por unidades.
4. ⚠️ **`costoMaxCaja` ya existe y nadie lo usa.** Cuando el objetivo es liquidar stock —que es lo
   que un sale al costo ES— **ésa es la vara correcta**, ⛔ no el margen. Hoy no se muestra en
   ningún lado.
5. ⚠️ **La cuenta publicitaria nueva de zattia (`1766605934148471`) ⛔ NO arregla esto.** Bruno
   preguntó si convenía apagar y rearmar ahí. Ninguna cuenta, creatividad o público arregla un
   margen negativo: **lo que destraba zattia es PRECIO, no pauta.**

### 🔴 Y un tercer bug del parte, del mismo día

El renglón **«BDI · pedidos REALES de la tienda»** cuenta **BDI + Zattia juntos**: la tabla `ventas`
⛔ no separa las marcas (todo cae en `channel='Tienda Nube'` / `store='Deposito Minorista'`).
Verificado: 99 pedidos en 7 días ÷ 7 = **14,1/día**, exactamente lo que el parte atribuye a BDI solo.
⚠️ Y `ventas.total_cost` da un margen bruto del **89%**, imposible en indumentaria (la ficha misma
supone 45% de costo) ⇒ **esa columna ⛔ no sirve para medir margen**, y es la que uno agarraría
primero para arreglar lo de arriba.

---

## 🆕 LA REGLA DE BRUNO DEL 9-sep: UN OBJETO SE JUZGA POR VENTANAS, ⛔ NO POR SU VIDA

> «no me hagas el histórico de test broad, no tiene sentido. haceme análisis de 7 días, 3 días,
> antes de ayer y ayer»

**Dictado por Bruno el 9-sep-2026, y me lo dijo cortándome un análisis que ya había entregado.**
Yo había defendido `TEST BROAD BDI - 06/05` con su vida entera —111 días, $372.869, 80 compras,
CPA $4.661 = **59% del techo**, ROAS 4,83— para no tocarlo. El argumento es malo y por qué importa:

🔑 **Una vida de 111 días promedia por arriba de cambios de pieza, de público y de FICHA.** El techo
con el que se compara hoy ($7.933) ⛔ no es el que regía en mayo, y las piezas que corrían entonces
ya no existen. Un promedio de vida **siempre** va a parecer sano en un objeto viejo que anduvo bien
alguna vez, y eso lo vuelve **inmune a apagarse**: cuanto más viejo, más lo protege su propio
pasado. Es el error contrario al de los dos bugs de abajo —ahí la ventana era **demasiado corta**,
acá **demasiado larga**— y el remedio es el mismo: **la ventana se declara y se muestra**.

⇒ **Las cuatro ventanas, y son estas cuatro**: `7 días` · `3 días` · `anteayer` · `ayer`, cada una
con gasto, compras y **% del techo**. Las cuatro juntas, ⛔ nunca una sola.

⚠️ **Y lo que las columnas de día NO pueden sostener**: a este volumen un día son 0 a 6 compras,
así que **una sola compra mueve el %techo cien puntos**. El 8-sep `ADVANTAGE+ CONJUNTO ÚNICO` dio
**26% anteayer y 183% ayer** sin que cambiara nada: es la misma cosa medida dos veces. ⇒ **anteayer
y ayer sirven para ver si algo se despertó o se murió, ⛔ no para decidir.** Deciden 7d y 3d.

🔑 **La forma que sí decide, y que salió de esto**: se apaga lo que está arriba del techo en **las
cuatro ventanas**; se recorta lo que está arriba en 7d y 3d pero tiene días buenos; ⛔ no se toca lo
que ya recibió su escalón y todavía no tiene 2 días cerrados. El 9-sep las tres salieron solas:
`TEST FUNDAS` (110/141/0c/0c ⇒ **apagar**), `GIRLHOOD INTERESES 1` (139/170/98/115 ⇒ **recortar,
pero recién mañana**), `TEST BROAD` (129/138/95/0c ⇒ **esperar, la mano ya está dada**).

▶️ **Lo que falta en el `parte-del-dia`**: hoy imprime una sola ventana por sección y **⛔ no dice
cuál**. Que cada fila accionable salga con las cuatro.

### 🔴 EL BUG 2 VOLVIÓ A DISPARAR AL DÍA SIGUIENTE — sigue sin arreglar

El 9-sep el parte pidió **−20% para `GIRLHOOD FRIO - INTERESES 1 - 7/8`**. Su escalón anterior fue
el **7-sep** (decisión 235) ⇒ al 9-sep hay **UN solo día cerrado** con el presupuesto nuevo. Es
exactamente el veto que falta, descrito abajo, **24 h después de haberlo escrito**. Se frenó a mano.

⇒ 🔑 **Mientras el veto no esté en el código, todo `−20%` que proponga el parte hay que cruzarlo a
mano contra la fecha del último escalón.** No es una revisión opcional: falló dos días seguidos.

---

## 🆕 EL SÁBADO 5-sep SE CAYÓ LA TIENDA ENTERA, Y ESTÁ ADENTRO DE TODAS LAS MEDIAS DE 7 DÍAS

Medido el 9-sep mirando **todos los canales**, ⛔ no sólo Tienda Nube:

| canal | vie 4 | **sáb 5** | dom 6 | lun 7 | mar 8 |
|---|---|---|---|---|---|
| Tienda Nube | 16 | **2** | 14 | 24 | 20 |
| Mi Local | 32 | **5** | — | 25 | 22 |
| Mercadolibre | — | **2** | 2 | 2 | 2 |

**Los tres cayeron el mismo día**, con la pauta gastando sus $83.375 normales. Un día así ⛔ no es
demanda ni es pauta: o se cayó la tienda o se cayó el sync. **Sigue sin explicarse** — y la decisión
229 ya había pedido mirar el embudo del 5-sep, así que es la segunda vez que aparece.

🔴 **Lo que muerde ⛔ no es el día: es que queda DENTRO de la media de 7 días** con la que el parte
compara todos los días siguientes. Le baja la vara a todo hasta el 12-sep. ⇒ **al leer cualquier
«contra su media de 7d» hasta esa fecha, acordarse de que la media tiene un día roto adentro.**

---

## 🆕 DOS BUGS DEL `parte-del-dia` QUE CAZÓ BRUNO — 8-sep-2026 (medido, ⛔ sin arreglar)

Los dos salieron de que Bruno no le creyó al parte, ⛔ no de leer el código. Viven en
`~/Projects/analista-meta/herramientas/parte-del-dia.mjs`, que **lee** de acá pero es otro repo.
Los dos hacen lo mismo: **piden accionar con menos evidencia de la que el propio archivo exige.**

### 🔴 1. «LA PUERTA DEL TEST» ⛔ NO VE LAS TANDAS — filtra por el nombre

El bloque de la puerta se queda sólo con los conjuntos cuyo nombre matchea `/^TEST /i`. Las celdas
de la **TANDA 10** se llaman `TANDA 10 - BROAD X …` ⇒ **nunca entraron a la puerta**, y el parte
imprimió «ninguna celda con la puerta abierta» el día exacto en que las cuatro vencían.

Salieron por la puerta de atrás —la sección «A BAJAR», que juzga por CPA— y ahí la lectura sale
**dada vuelta**: BLUE CASES aparecía como «−20%» cuando por la puerta **pasaba** (2 compras ⇒
sigue), y a NEW IN y POV la puerta las mata por regla (1 compra), ⛔ no por CPA. Medido el 8-sep
sobre sus 2 días completos (6 y 7/9):

| celda | 2 días completos | compras | la puerta dice | el parte decía |
|---|---|---|---|---|
| NEW IN | $22.176 | 1 | 🔴 MUERE | «PAUSAR, CPA 301%» (coincide por casualidad) |
| POV MARCA FAVORITA | $21.214 | 1 | 🔴 MUERE | «PAUSAR, CPA 288%» (idem) |
| BLUE CASES | $20.181 | 2 | 🟡 SIGUE | 🔴 **«−20%»** — lo contrario |
| FUNDAS POPSTAR | $20.299 | 3 | 🟡 SIGUE | (no aparecía) |

🔑 **La marca de «esto es una celda de test» ⛔ no puede ser el nombre.** Es el mismo agujero que ya
está declarado arriba en la tabla de cortes —*«antes hace falta poder marcar una celda como test —
no hay dónde guardarlo»*—: mientras no haya dónde, el prefijo lo elige quien tipea el conjunto, y
cada tanda nueva se lo saltea sin que nadie se entere. ⚠️ Y el parte **declara** lo que descarta
(`· miradas: N …`) pero estas ⛔ no caen en ningún contador: no llegan ni a ser miradas.

▶️ **Lo mínimo mientras tanto**: que el filtro acepte también `/^TANDA /i`, y que el renglón de
«miradas» cuente los conjuntos nuevos que ⛔ **no** matchearon ningún prefijo.

⚠️ Aparte, el umbral está tipeado dos veces y ⛔ no coinciden: el encabezado dice **$20.000** (la
regla de Bruno del 26-ago, la de abajo en este archivo) y el código corta en **$15.000**. Las
cuatro celdas pasaban los dos, así que no cambió nada hoy — pero **gana el repo: son $20.000**.

### 🔴 2. «A BAJAR» ⛔ no pide los 2 días cerrados desde el escalón, y ⛔ no declara su ventana

«A ESCALAR» sí lo pide —*«un escalón con menos de 2 días CERRADOS no se lee»*— y **«A BAJAR» come
de la misma variable sin ese chequeo**. Resultado del 8-sep: mandó a pausar `BROAD X ASMR TIARA`
con el renglón *«sin compras y ya gastó $9.230»*, y esos $9.230 eran **un solo día — AYER**, porque
su escalón fue el 7/9. Bruno lo cazó por el reloj: *«¿9.230 de gasto hoy, si hoy es martes 9am?»*.

Son dos fallas encimadas, y la segunda es la que engaña:

1. **La ventana puede ser de 1 día** y el parte pide pausar igual.
2. **El renglón ⛔ no dice de qué ventana habla.** Imprime `${M(o.s)}` a secas, y al lado de un
   parte que arranca con «EL DÍA» eso se lee como *hoy*. Lo leí como hoy y lo informé como hoy.

🔑 Y el mismo día, la misma ventana recortada casi manda a pausar `GIRLHOOD FRIO - COPY B`, que en
7 días está **debajo del techo** (CPA $6.601, ROAS 4,57) y en su vida es de los mejores de la cuenta
(24 compras, ROAS 5,17). El parte veía sus 72h post-escalón (ROAS 1,78). **Pausar por una ventana de
3 días al 4º mejor objeto de BDI** era el error más caro del día, y lo frenó Bruno de memoria:
*«girlhood frio copy B estás seguro? el otro día cazó varias ventas»*.

▶️ **Lo mínimo**: (a) el mismo veto de «2 días cerrados desde el escalón» que ya tiene A ESCALAR;
(b) que **todo número de gasto imprima su ventana** (`$9.230 en 1 día: 7/9`), que es la regla que
este archivo ya aplica en otros lados; y (c) antes de proponer PAUSAR, **contrastar la ventana
recortada contra los 7 días y contra la vida del objeto** — si la vida está debajo del techo, lo que
corresponde es revertir el escalón, ⛔ no matar el objeto.

🔑 **Lo que une a los dos bugs, y es lo que hay que llevarse**: el parte del día está afinado para
**no repetir lo de ayer**, y por eso cada sección mira una ventana cortita distinta. Eso está bien
para *«qué cambió»* y está **mal para *«qué apago»***: una decisión irreversible ⛔ no se toma con
la ventana más corta del archivo. Las tres decisiones del 8-sep quedaron en `meta_ads_decision`
(ids 240-244) y **ninguna de las tres usó el argumento que había dado el parte**.

---

## 🆕 EL BLOB — la pantalla «Archivos» ya está, y queda plata arriba (7-sep-2026)

Ese día el store topó **el giga del plan Hobby** y **frenó TODA subida del monitor** (el link de las
creadoras, las fotos de un reclamo, los diseños, las piezas de Meta) con un cartel que hablaba del
archivo, no del lugar. 🏁 Se destrabó archivando a Drive los canjes 71, 78 y 84 —**532 MB, 65 de 65
evidencias**— y salió **Sistema → Archivos** (admin), que ahora lo muestra y lo limpia desde acá.

**El inventario real, leído en producción el 7-sep a la noche: 519,6 MB de 1 GB, 118 archivos.**

- 🏁 **Piezas de Meta: eliminados 193,9 MB** (9 archivos, 7-sep, con Bruno confirmando que tenía los
  originales) ⇒ el store quedó en **325,7 MB de 1 GB, 109 archivos**. Verificado con HEAD: las
  eliminadas dan 404 y el `UNBOXING` que un plan pendiente todavía nombra sigue en 200.
- 🔴 **227 MB en `canjes/71` son DOS SUBIDAS DUPLICADAS**: el sufijo del archivo que está arriba ⛔ no
  es el que guarda `canje_evidencias` (los suyos ya se borraron al archivar). O sea que la creadora
  subió el mismo video dos veces —o un intento se cortó al registrar— y **nadie lo iba a ver nunca**.
  ▶️ Hoy salen «Recién subido» (ventana de gracia de 24 h) ⇒ **se pueden eliminar a partir del 8-sep**.
- 🔴 **`evidencia-archivada` contesta `buzon: 'quedó arriba'` cuando el Blob no se pudo borrar, y el
  cliente ⛔ NO lo mira** (`components/canjes/ContenidoDeElla.tsx`) ⇒ un archivado que dejó los bytes
  arriba se ve idéntico a uno que los sacó. ▶️ Mostrarlo.
- 🔑 **El techo de 1 GB es del plan Hobby de la cuenta de Darío.** La salida de fondo sigue siendo
  transferir el proyecto **y el store** al team de Bruno, que ya está pago. ⛔ Nunca recrear el store:
  cambia el host de todas las URLs ya guardadas.
- ⚠️ **Zattia y Stunned ⛔ no tienen carpeta de Drive en Ajustes de Canjes** ⇒ ahí el botón «Enviar a
  Drive» ni aparece, y el contenido de una creadora de esas marcas no tiene cómo archivarse.

La ficha con las reglas (qué ⛔ nunca se ofrece para eliminar y por qué) es `docs/secciones/archivos.md`.

## 🆕 STUNNED — LA ECONOMÍA DE LA PAUTA Y EL ENVÍO GRATIS (7-sep-2026, medido + decidido)

> «tengo que analizar lo de envio gratis para stunned, incluso para que sea escalable con pauta.
> por ese motivo con este nuevo ingreso, tengo que calcular el equilibrio de costo por venta, el
> roas de equilibrio, y si tiene envio gratis, a partir de cuanto»

🏁 **DECIDIDO POR BRUNO: envío gratis a partir de $75.000, y ⛔ sin tocar ningún precio.**

### 🔴 De dónde parte esto (la tienda estuvo cerrada hasta la tarde del 7-sep)

**Estuvo cerrada con clave** —`stunned.com.ar` contestaba **302 a `/password/`**— por *Tienda online
› Página en construcción*, con el mensaje **«DROP 2 - COMING SOON»**: ⛔ **no era un olvido, esperaba
el drop**. 🏁 **Bruno la abrió el 7-sep a la tarde** (ver el bloque de abajo).
🔴 **Lo que queda como lección es lo que se pautó contra esa puerta**: online Stunned lleva **2
ventas en 180 días, las dos de abril**, el snapshot de su pauta **se corta el 23-ago** ($22.949 en 9
días, 1 compra) y el panel de TN marcaba **60 visitas únicas en un día, con la puerta cerrada**. ⇒
**el orden es CLAVE PRIMERO, PAUTA DESPUÉS.**

🔴 **Y el ROAS de equilibrio ⛔ no se puede leer en Ads Manager**: el píxel de Stunned no tiene el
evento Compra ([[project_stunned_pauta_broad]]). El único semáforo posible es el **costo por compra**
contado a mano.

### La ficha, medida — ⛔ no estimada

Ponderada por las **319 unidades que hay para vender hoy**, con precios y costos sacados de **GN
directo**: 🔴 **el espejo de Supabase todavía tiene 28 productos y ⛔ no vio el ingreso nuevo** (el
sync de productos no corrió). ⚠️ **Y el renglón de arriba de este archivo quedó viejo el mismo día**:
decía «15 sin precio ni costo» y **los 12 nuevos ya están cargados**; a $1 quedan sólo REMERA JET LAG
y REMERA LABEL (las de abril), **con stock y publicables**.

| | |
|---|---|
| precio de venta por unidad (con las promos cargadas) | **$39.799** |
| costo por unidad | **$17.078** |
| contribución por unidad | **$11.949 (30 %)** |
| unidades por pedido | **1,13** (152 pedidos / 171 u, 180 d) |

🔑 **El chequeo cruzado es lo que la vuelve creíble**: el modelo da **$39.799** de bruto contra
**$39.795** medido, y **$35.845** contra los **$35.831** que la caja efectivamente cobró (0,04 %).
Impuestos y comisiones **heredados de la ficha de Zattia** (mismo CUIT, misma ciudad, mismo checkout).

⚠️ **Las 1,13 son del LOCAL**: online ⛔ no hay con qué medirlo (2 ventas). En Zattia online la gente
compra **1,27× más** que en su local; si Stunned se le parece son ~1,43 y todo mejora.

### Los tres números

| | cliente paga el envío | envío gratis ($7.742) |
|---|---|---|
| ticket | $44.972 | $44.972 |
| **costo por venta de EQUILIBRIO** | **$13.502** | **$7.104** |
| **ROAS de EQUILIBRIO** | **3,33×** | **6,33×** |
| techo al 50/50 (el que va al semáforo) | $6.751 | $3.552 |

🔴 **El equilibrio ⛔ no es el objetivo**: entre $7.104 y $3.552 se gana plata, sólo que menos de lo
decidido. Confundirlos hace apagar campañas que están dando ganancia. 📌 [[project_bdi_umbral_rentabilidad]]

El envío está medido sobre **156 envíos pagos de Zattia online** (mediana $7.781 · p25 $6.271 ·
p90 $9.477). ⚠️ **Es un proxy**: mismo origen, mismo Envío Nube, prendas parecidas — Stunned online
⛔ no tiene con qué medirlo.

### Por qué $75.000

🔑 **El envío neto de IVA son $6.398 = el 54 % de la contribución de UNA unidad** ⇒ regalarlo sin que
el pedido crezca ⛔ no se banca. **Empata cuando el pedido pasa de 1,13 a 1,67 u (+47 %)**, o sea un
ticket de $66.283.

| umbral | 1 unidad sola alcanza | 2 unidades alcanzan | contribución | ROAS de equilibrio |
|---|---|---|---|---|
| $60.000 | 47 u (15 %) | 84 % de los pares | $12.617 | 5,15× |
| $70.000 | 27 u (8 %) | 57 % | $14.618 | 4,79× |
| **$75.000 ← el elegido** | **11 u (3 %)** | **51 %** | **$16.119** | **4,65×** |
| $80.000 | 11 u (3 %) | 45 % | $17.499 | 4,55× |

A $75.000 **sólo la CAMPERA WEAR ($81.990) lo alcanza sola**: casi nadie se lo lleva de arriba, y la
mitad de las combinaciones de dos prendas llega ⇒ el upsell es pedible y ⛔ no imposible.

⚠️ **Lo que se aceptó a sabiendas**: **BUZO FLECK sale $74.990 y queda afuera por $10.** Se propuso
subirlo a $76.990 y **Bruno dijo que no se toca ningún precio**. Son **8 de 319 unidades (2,5 %)**.
Los otros que quedan afuera comprando uno solo: BUZO MADE $71.990 · BUZO PHRASE $69.990 ·
BUZO STND $66.990.

### 🏁 8-sep · DECIDIDO: LA PAUTA VA AL DROP 2 ⇒ la ficha quedó en el techo del drop

> Bruno: **«la pauta va al drop 2»**.

🏁 **Ficha de Stunned actualizada** (8-sep 00:32, camino real, releída del servidor, ningún campo
recortado). La vara del semáforo pasó de $3.638 (la mezcla) a:

| | |
|---|---|
| **techo por compra** | **$8.486** |
| ROAS objetivo | **6,2×** |
| punto de equilibrio | **3,08×** |
| techo con el saldo de IVA | $13.022 |
| ticket · contribución | $52.271 · $16.971 (32 %) |
| presupuesto diario para 5 ventas/día | **$42.428** |
| vaciar las 137 unidades | 121 compras · **$6.337.330** · 24,2 días |

✅ **Y la landing existe y CIERRA CON LA FICHA AL PESO**: la categoría **`THE MATCH DROP`**
(`https://www.stunned.com.ar/the-match-drop/`, **200**) tiene **13 productos · 137 unidades · lista
$50.253 · costo $18.569 · markup 2,71× · 0 % de descuento** — exactamente los supuestos guardados.
🔑 **Es lo que vuelve legítima la ficha**: la vara mide **la misma vidriera a la que apunta el
anuncio**, ⛔ no un promedio de la tienda. La otra categoría, `STAGE ONE`, es el drop 1 (a −29,3 %).
⚠️ El 13º es **REMERA CIRCLE BROWN**, del drop 1 pero **sin promo y sin stock** ⇒ ⛔ no ensucia.

### 🔴 Lo que NO hay que hacer todavía

**Hoy `THE MATCH DROP` tiene 2 productos publicados de 13** (BUZO STND y REMERA STARRY, 30 u de 137).
⛔ **No prender la pauta contra esa landing hasta que esté poblada** —el viernes—: es la misma forma
del error que ya costó plata en agosto (pautar contra una puerta que ⛔ no estaba lista), sólo que
esta vez la puerta abre pero está casi vacía. 🔑 **Y con 2 productos el umbral de $75.000 es
inalcanzable en la práctica**: hacen falta dos prendas y sólo hay dos para elegir.

### 🔑 Las dos reglas que protegen este techo

1. ⛔ **Al drop 2 NO se le pone promo.** Con envío gratis y 2 unidades: **0 % ⇒ 3,94×** de
   equilibrio · −10 % ⇒ 4,96× · −15 % ⇒ 5,85× · **−30 % ⇒ 19,30×**. **Techo −15 %, y lo que conviene
   es 0.**
2. ✅ **El umbral de $75.000 le queda hecho a medida**: la prenda promedio del drop sale **$50.253**
   ⇒ una ⛔ no llega, dos llegan sobrado ($100.506). El envío gratis **empata a 1,56 u/pedido** y hoy
   el pedido es 1,13 ⇒ pedir la segunda prenda es justo lo que falta. **2 u con envío gratis dejan
   $23.509 contra $16.971** de una que paga el envío.

▶️ **Al viernes, con las 13 publicadas**: rehacer la medición (`tiendanube-audit?store=stunned`),
confirmar que ninguna salió con promo y **volver a guardar la ficha si el promedio se movió**.
▶️ Y remedir **`unidades`** —hoy 1,13, que sale del LOCAL y del drop 1— con la primera decena de
ventas online: es el supuesto que más mueve el techo y el que el umbral está empujando a propósito.

### 🔑 8-sep · MEDIDO SOBRE EL DROP 2 SOLO — y ahí SÍ cierra

Pedido de Bruno: *«pensemos con los productos nuevos, osea la tanda nueva de productos. no para el
primer drop»*. Los 12 del 7-sep, aislados de la vidriera vieja.

🔑 **El dato que lo explica todo: el DROP 2 está a precio de LISTA, sin una sola promo.** Los 12,
medidos en TN: lista = precio de venta, **0 % de descuento de vidriera**. El drop 1, al lado, va a
**−29,3 %**.

| | drop 2 (137 u) | mezcla de HOY (223 u) | drop 1 (193 u) |
|---|---|---|---|
| precio de venta | **$50.253** | $33.765 | $31.306 |
| costo | $18.569 | $16.136 | $15.885 |
| markup | **2,71×** | 2,09× | 1,97× |
| descuento de vidriera | **0 %** | 24,9 % | 29,3 % |
| contribución por pedido | **$16.971 (32 %)** | $7.276 (21 %) | $5.682 (17 %) |
| **ROAS de equilibrio** | **3,08×** | 4,83× | 5,73× |
| **techo por venta** | **$8.486** | $3.638 | $2.841 |

⇒ **el drop 2 tiene 2,3× el techo de la mezcla y 3× el del drop 1.** (Todos ya incluyen el 15 % de
«con Efectivo» con mix 53 %.)

### 🏁 Y el umbral de $75.000 le queda hecho a medida

**La prenda promedio del drop 2 sale $50.253**: una sola ⛔ no llega, **dos llegan sobrado**
($100.506). 🔑 **El envío gratis empata a 1,56 u/pedido y hoy el pedido es 1,13** ⇒ pedir la segunda
prenda es exactamente lo que falta, y el umbral es el que lo pide.

| drop 2 | contribución | ROAS de equilibrio | techo por venta |
|---|---|---|---|
| 1 u, el cliente paga el envío | $16.971 | 3,08× | $8.486 |
| **2 u con ENVÍO GRATIS** | **$23.509** | **3,94×** | **$11.754** |
| la campera sola ($81.990) con envío gratis | $15.539 | 4,86× | $7.770 |

⇒ **el que se lleva dos y activa el envío gratis deja $23.509 contra $16.971 del que se lleva una y
paga el envío.** El envío gratis **ganó plata**, ⛔ no la costó.

### 🔴 Lo único que puede romperlo: ponerle promo al drop 2

| descuento de vidriera del drop 2 (2 u, envío gratis) | ROAS de equilibrio |
|---|---|
| **0 % — como está hoy** | **3,94×** |
| −10 % | 4,96× |
| −15 % | 5,85× |
| −20 % | 7,35× |
| −30 % (como el drop 1) | **19,30×** |

⛔ **No pasar de −15 %, y lo que conviene es dejarlo en 0.** Con −30 % el drop 2 queda igual de
inservible para pauta que el drop 1.

### ▶️ Qué ficha tiene que gobernar el semáforo

Hoy la fila guardada es **la mezcla publicada** (techo $3.638) — y **envejece el viernes**, cuando
entren las 137 unidades del drop 2. Al viernes la mezcla da **$46.746 de lista · 16,2 % de descuento
· techo $5.188 · equilibrio 3,93×**.
🔑 **La pregunta que lo decide, y es de Bruno: ¿la pauta lleva a la TIENDA ENTERA o al DROP 2?**
- a la tienda entera ⇒ la vara es la mezcla del viernes: **$5.188**
- a una landing / categoría del drop 2 ⇒ la vara es **$8.486**, y es 64 % más de aire

⚠️ **Al viernes hay que rehacer la medición igual**: hoy sólo **2 de los 12** del drop 2 están
publicados (BUZO STND y REMERA STARRY, 30 u de 137).

### 🔴🔴 8-sep · DOS CORRECCIONES MÍAS, Y LA SEGUNDA DA VUELTA EL VEREDICTO

**1) «Stunned no tiene punto de retiro» era FALSO.** Lo cazó Bruno. Existe y anda:
**`Pop Up Stunned` · Santa Fe 1435, Centro, Rosario · GRATIS · Lunes a sábado 10-19 · cobertura
Santa Fe › Rosario (tildado) · plazo 0-1 días hábiles**. **Caminado en la tienda viva**: con CP 2000
y un carrito de **$31.490** —o sea **muy por debajo** de los $75.000— el checkout ofrece
«RETIRAR POR › **Pop Up Stunned … Gratis**, Retiras el martes 08/09». ⇒ **⛔ no depende del monto y
⛔ no está roto.** Los dos «Punto de retiro» de $6.650 y $7.385 de la captura son **sucursales de
Correo y Andreani**, ⛔ no el local. ▶️ La captura donde ⛔ no aparecía es de **antes** de que el
punto estuviera activo (sus tarifas son otras: $9.076 contra $7.900 ⇒ otro carrito, otro peso).
🔑 **El defecto de método**: resumí «Medios de envío» mirando **la solapa que venía abierta**.
⛔ **Una pantalla con solapas no se resume sin abrirlas todas.** 📌 [[MEMORY_probar]]

**2) 🔴 LA FICHA ESTABA MAL, Y LA CORREGÍ: el techo NO es $6.751, es $3.638.**
La primera versión salió de **Gestión Nube**, y GN ⛔ **no ve el precio real de la tienda**. Medido
contra la vidriera (`tiendanube-audit?store=stunned`, 8-sep 00:24) sobre **27 productos publicados ·
223 unidades**:

| | GN (lo que cargué primero) | la TIENDA VIVA (lo bueno) |
|---|---|---|
| lista ponderada | $46.548 | $44.974 |
| descuento de vidriera | 14,5 % | **24,9 %** |
| …y el **«con Efectivo»** encima | ⛔ no lo veía | **15 % más** |
| precio que se cobra | $39.799 | **$33.765** (o $28.701 con efectivo) |
| costo | $17.078 | $16.136 |
| **contribución por pedido** | $13.502 | **$7.276** |
| **ROAS de equilibrio** | 3,33× | **4,83×** |
| **techo por venta (50/50)** | $6.751 | **$3.638** |

🔑 **El chequeo cruzado que la valida**: el modelo da **$33.775** contra **$33.765** de vidriera y
**$28.709** contra **$28.701** con efectivo (0,03 %). 🔴 **La ficha guardada quedó actualizada** (8-sep
00:25, mismo camino real, releída del servidor, ningún campo recortado).
⚠️ **El mix casi no mueve nada** (4,78× a 4,88× entre 0 % y 100 % de efectivo) ⇒ igual que en BDI,
**el semáforo es el costo por compra, ⛔ no el ROAS**.

### 🔴 Y esto cambia la respuesta sobre el ENVÍO GRATIS

| escenario (precios reales) | contribución | ROAS de equilibrio |
|---|---|---|
| el pedido de hoy (1,13 u), cliente paga el envío | $7.276 | 4,83× |
| **el mismo, con envío gratis** | **$747 (2 %)** | **47×** |
| 2 unidades (lo que el umbral fuerza), cliente paga | $12.877 | 4,83× |
| **2 unidades con envío gratis** | **$6.348 (10 %)** | **9,79×** |

⇒ 🔴 **Con el descuento de vidriera de HOY (24,9 % + 15 %), el envío gratis a $75.000 deja el pedido
sin margen para pauta**: 9,79× de equilibrio ⛔ no lo paga ninguna campaña. **El umbral está bien
puesto; lo que ⛔ no cierra es el DESCUENTO.** Es el mismo hallazgo de la primera vuelta —«el freno
⛔ no es el envío, es la promo»— pero ahora medido sobre la tienda viva y **mucho más grande de lo
que parecía**.
▶️ **La decisión que queda, y es de Bruno**: para que la pauta tenga aire hay que mover **uno** de
los tres: bajar el descuento de vidriera, sacar el 15 % de efectivo, o subir el precio. ⛔ Tocar el
umbral de envío ⛔ no alcanza.
⚠️ **Y hay una promesa desalineada**: el banner dice **«10% OFF TRANSFERENCIA»** y la ficha del
producto cobra **15 %** ($46.590 → $39.601,50). Alguien está regalando 5 puntos, o el banner miente.

✅ **Se cae una alarma**: REMERA JET LAG y REMERA LABEL (las de $1) están entre los **13 sin publicar**
⇒ ⛔ no hay nada a $1 en la vidriera. **Publicados: 27 de 40**, coherente con el lanzamiento
escalonado hasta el viernes.

### 🏁 LA TIENDA SE ABRIÓ (7-sep, tarde) — y el lanzamiento es ESCALONADO hasta el viernes

Medido después de que Bruno la prendió: `stunned.com.ar` y `www.stunned.com.ar` contestan **200**,
⛔ ya no redirigen a `/password/`. **Se retira lo de «la puerta está cerrada»**: ya no aplica.

> Bruno: «ya esta encendida la tienda, pero **hasta el dia viernes vamos a ir lanzando los productos
> por la tienda online**».

🔴🔑 **Eso le pone fecha al umbral, y hay que leerlo así**: el $75.000 se alcanza con **2 unidades**
(el artículo promedio sale $39.799), y **con el catálogo saliendo de a poco, las combinaciones de 2
que llegan son menos que las 51 % que mide la tabla de arriba** —esa cuenta está hecha sobre las
**319 unidades de stock**, ⛔ no sobre lo que está publicado hoy—. ⇒ ▶️ **la tasa de envío gratis va
a subir sola a medida que entren productos, y el número honesto para juzgar la semana es el del
VIERNES, con todo publicado.** ⛔ No leer una semana floja de envío gratis como que el umbral está
mal puesto: puede ser sólo que el catálogo todavía no estaba entero.

▶️ **Y lo que hay que medir el viernes o el lunes, ⛔ no antes**: **qué fracción de los pedidos elige
RETIRAR** en el Pop Up. Es el número que decide si `envio` sigue en 0 o hay que cargarlo — y es el
mismo que en BDI resultó ser **el 57 % de la venta online**.

### 🏁 CAMINADO EN PROD EL 7-sep, EN LAS DOS PUNTAS

**1) El $75.000 está PUESTO y ACTIVADO** — visto en `stunned3.mitiendanube.com/admin/free-shipping`
(regla `792204`): «Monto del carrito · Mayor de **$75.000**», Zonas **Todas**, Aplica a **Toda la
tienda**, Estado **Activado**.

🔴🔑 **Pero cubre UN SOLO medio de envío de los CUATRO que la tienda ofrece.** El chip de la regla
dice **«Envío Nube - Correo Argentino Clásico a sucursal»**, y las modalidades activas en Medios de
envío son **cuatro**: Correo Argentino **a domicilio**, Correo Argentino **a sucursal**, Andreani
**a domicilio**, Andreani **a sucursal**. ⇒ **quien pase los $75.000 y quiera recibirlo en su casa,
PAGA**. Una pieza que prometa «envío gratis desde $75.000» va a decir algo que el checkout no
cumple — es el mismo defecto que las «6 cuotas» que la tienda daba en 3.
▶️ **Se arregla en la misma pantalla**, y hay dos caminos con consecuencias distintas: agregar los
otros tres chips (el envío gratis pasa a costar hasta el precio de Andreani a domicilio), o tildar
**«Ofrecer descuento solo en el medio de envío de menor costo»** (hoy DESTILDADO), que lo deja
gratis en el más barato y cobrado en el resto — que es lo que la regla hace hoy, pero **dicho en el
checkout** en vez de escondido.

⚠️ **«Permitir combinar con otras promociones» está TILDADO** ⇒ el envío gratis **se suma al −30 %**
del catálogo viejo. Es exactamente el cruce que la tabla de arriba mide en **7,71× de equilibrio**.
⚠️ Y el mínimo es **«mayor de»**: un carrito de exactamente $75.000 ⛔ no califica.

✅ **STUNNED SÍ TIENE RETIRO GRATIS** — y **acá me equivoqué y Bruno lo cazó**:
**`Pop Up Stunned` · «Con retiro» · Santa Fe 1435, Centro, Rosario (CP 2000) · Lunes a Sábado de
10 a 19 · GRATIS, listo en hasta 1 día hábil · provincias: Santa Fe (1)**.
🔴🔑 **El defecto de método, que es lo que hay que guardar**: miré la pestaña **«Gestión de envíos»**,
vi sólo Envío Nube y escribí «no tiene ninguna opción de retiro». **Los puntos de retiro viven en su
PROPIA PESTAÑA** (`Puntos de retiro`, al lado), y yo **concluí sobre una pestaña que no abrí**. ⇒
**una pantalla con solapas ⛔ no se resume mirando la que viene abierta.** 📌 [[MEMORY_probar]]

🔑 **Y cambia el análisis para MEJOR, ⛔ no para peor**: hay **tres** caminos por los que la empresa
⛔ no paga el envío —retiro gratis en el Pop Up · pedido por debajo de los $75.000 · pedido arriba
del umbral que elija domicilio o Andreani— y **uno solo** por el que sí (arriba de $75.000 y por
Correo Clásico a sucursal). ⇒ **`envio: 0` en la ficha queda MEJOR justificado de lo que estaba**, y
⛔ no hay que tocarla. En BDI el **57 %** de la venta online retira gratis en Rosario y en Zattia el
**88 %** del tramo de menos de $30k: si Stunned se le parece, el envío pesa aún menos.
⚠️ **Lo que sigue en pie**: el retiro sirve en **Rosario** y la pauta compra **tráfico nacional** —
es la misma brecha de geografía que [[project_bdi_escalado_100_ventas]] encontró del otro lado.

**2) LA FICHA DE STUNNED QUEDÓ GUARDADA** (`/meta-ads/rentabilidad`, 7-sep, por Bruno Arevalo).
Escrita por el **camino real** —`POST /api/datos?recurso=meta-rentabilidad`, el mismo que usa el
botón—, ⛔ no por SQL. Verificada **releyendo del servidor**: los 19 campos volvieron idénticos,
ninguno recortado. Y caminada en prod: la pantalla dice «Los números de **Stunned**, guardados por
Bruno Arevalo el 07 de sept de 2026», **techo por compra $6.751**, techo con el saldo $10.654,
ROAS objetivo 6,7×, punto de equilibrio 3,3×, ticket $44.972.
⇒ **sus pautas dejan de salir «Sin techo»**.

🔑 **`envio` quedó en 0, y es una decisión, ⛔ no un olvido**: hoy el envío gratis pide **más de
$75.000** y cubre **1 de 4 modalidades** ⇒ la enorme mayoría de los pedidos lo paga el cliente. **El
día que el envío gratis se generalice hay que cargarlo**: con $7.742 el techo baja de **$6.751 a
$3.552** y el equilibrio sube de 3,33× a 6,33×. ⛔ No es un ajuste fino: es la mitad del techo.

⚠️ **Lo que la pantalla agrega y hay que mirar con cuidado**: dice «**Pagás $689 · 9,8× de aire**,
medido sobre 07/08→13/08, 32 pedidos». 🔴 Esa foto es de **hace un mes**, de una cuenta cuyo snapshot
**se corta el 23-ago**, y con la tienda cerrada. ▶️ **Antes de leer ese 9,8× como permiso para
escalar, hay que saber qué contó como «pedido»** — si son pedidos del LOCAL, el aire es ficticio.
📌 [[MEMORY_numeros]]

⚠️ **`unidades: 1,13` sale del LOCAL** (online son 2 ventas en 180 días). En Zattia la gente compra
**1,27× más** online que en el local. ▶️ **Remedirlo con la primera decena de ventas online.**

### 🔴 El hallazgo grande: el problema ⛔ no es el envío, es la PROMO

| escenario (2 u/pedido, envío gratis) | contribución | ROAS de equilibrio |
|---|---|---|
| **el ingreso nuevo a precio de LISTA** | **$29.767 (30 %)** | **3,38×** |
| el ingreso nuevo con −30 % | $7.776 (11 %) | 9,05× |
| el catálogo viejo (promo −27 %) | $8.286 (13 %) | 7,71× |

⇒ **el −30 % se lleva más que el envío**. Con el catálogo viejo en promo ⛔ **no hay umbral que
cierre**: pedirle 7,71× a una pauta que hoy no registra ni una compra ⛔ no es escalar. Y llegar a
$75.000 con remeras de promo ($19-24k) pide **4 unidades**. **El umbral funciona sobre el ingreso
nuevo a precio de lista** — que es como está cargado hoy, y conviene que siga así.

### ▶️ Lo abierto, y son manos de Bruno

1. 🔴🔴 **REMERA JET LAG y REMERA LABEL están a $1 con stock — y la tienda YA ESTÁ ABIERTA.**
   Era lo que había que bajar *antes* de sacar la clave. ⇒ **es lo más urgente de esta lista.**
2. 🏁 **El umbral de $75.000 YA ESTÁ PUESTO Y ACTIVO** (lo puso Bruno el 7-sep). ▶️ Lo que queda
   es **decidir qué hacer con los otros tres medios de envío**: ver el bloque «CAMINADO EN PROD».
3. 🏁 **La ficha de Stunned YA ESTÁ GUARDADA** en `/meta-ads/rentabilidad` (7-sep) y caminada.
   ⚠️ ⛔ No hizo falta tocar ningún test: `tests/meta-ads-rentabilidad.test.ts` clava la fila de
   **BDI** y los fixtures de «Sin techo» de `memo` y `meta-rendimiento` ⛔ no leen la fila real.
4. **Decidir la promo del ingreso nuevo**: a lista 3,38× de equilibrio, con −30 % 9,05×.
5. Sigue abierto de la sección de abajo: el SKU de CAMPERA WEAR (`CAM-0001-*`, ⇒ **para el Monitor es
   Zattia**), las 10 unidades fantasma y ESSENTIAL $36.990 vs $45.990.

---

## 🆕 STUNNED EN TIENDA NUBE — 12 PRODUCTOS NUEVOS SIN PRECIO NI COSTO (7-sep-2026, dictado)

> «cargue productos en tienda nube stunned, podemos ver de cargar precios y costos de todos? y
> ordenar la integracion»

Medido el 7-sep contra GN de Zattia (`productos/obtener` + `inventario/obtener`: 746 productos,
3.988 renglones de inventario) y contra TN Stunned (`tiendanube-audit?store=stunned&variantes=1&refresh=1`:
40 productos, 160 variantes). ⛔ No se escribió nada en ninguna de las dos puntas.

### El vínculo está sano — lo que falta son NÚMEROS, no cañería

- ✅ **40 de 40 productos de TN cruzan con GN por SKU**, normalizando guiones: el barcode de la
  variante en GN (`STUBUZ0014M`) es el sku de la variante en TN (`STU-BUZ-0014-M`), y el
  `inventario.sku` de GN lo trae ya con guiones. ⛔ No hay huérfanos en ninguna punta.
- ✅ **Stock: 150 de 160 variantes coinciden.** Las 48 variantes nuevas coinciden **todas**.

### 🔴 Los 15 que están a $1 y $0

**15 productos tienen `retailer_price` = 1 y `unit_cost` = 0 en GN, y esos mismos 15 están a $1 en
TN**: los 12 cargados hoy más 3 de abril que quedaron ocultos desde entonces (REMERA CIRCLE BROWN,
REMERA JET LAG, REMERA LABEL). Los otros 25 tienen costo y precio.

🔴 **2 de los 12 nuevos están PUBLICADOS a $1 con stock**: **BUZO STND** (12 u) y **REMERA STARRY**
(18 u). Hoy ⛔ no los compra nadie porque **la tienda entera está detrás de la clave** —
`stunned.com.ar/productos/<handle>/` redirige a `/password/`, medido —. El día que se saque la
clave, salen a $1.

### 🔴 CAMPERA WEAR entró sin el prefijo `STU` ⇒ para el Monitor es ZATTIA

Su SKU es `CAM-0001-{S,M,L,XL}` (así en el `inventario` de GN y así en TN). `esStunned()`
(`lib/lineas.core.js`) es `/^stu/i` y **es la única señal que hay**: no existe columna de marca ni
depósito propio. ⇒ sus **11 unidades** y todo lo que venda se cuentan en la línea Zattia, en las 8
pantallas que parten por línea y en el conteo `conteo-estandar-stunned`.
▶️ Se arregla renombrando el SKU en GN a `STU-CAM-0001-*` (y en TN, que es donde lo lee el audit).

### Lo demás que quedó torcido, medido

- **REMERA ESSENTIAL: GN dice 36.990 y TN cobra 45.990.** El espejo del Monitor lee GN ⇒ muestra un
  precio que ⛔ no es el de la tienda. Es el único de los 40 en que GN y TN no coinciden.
- **5 productos tienen promo puesta en TN y `tiendanube_promotional_price` en 0 en GN**: REMERA
  CAMEO / PIXEL / SCOTTISH (49.990 → 42.490, −15 %), BUZO MAIN (37.490 → 29.990, −20 %) y BUZO ROAD
  (42.990 → 34.390, −20 %). Se cargaron directo en TN ⇒ desde GN esos cinco **se leen a precio de
  lista**, y cualquier margen que salga del espejo los sobreestima.
- **10 unidades de stock fantasma online**: en 10 variantes TN tiene **exactamente una unidad más**
  que GN (REMERA VINTAGE L · SUCCED XL · STUDIOS XL · STND S · OFICIAL S · ST\*NNED M · BUZO Y2K M
  y L · BUZO LABEL S · BUZO MAIN M). Es el patrón de la venta en el local que ⛔ no bajó de la
  tienda. Lo arregla el sync GN→TN de **Integraciones**, que se aplica **fila por fila y a mano**.

### Para cargar precios y costos: qué falta de verdad

- 🔴 **El Monitor hoy escribe SÓLO el precio promocional** (`api/_liquidacion.js`, PATCH a
  `productos/{id}` con `tiendanube_promotional_price`). `retailer_price` y `unit_cost` **se cargan a
  mano en GN** — lo dice `docs/secciones/liquidacion.md`. Hacerlo desde el Monitor pide
  **parametrizar ese PATCH**, y ⛔ nunca se probó que GN acepte esos dos campos.
- 🔑 **El precio sale solo si hay costo, y está medido sobre los 25 cargados**: lista ≈ **costo ×
  2,7** (min 2,59 · mediana 2,76 · max 3,22) y **promo = −30 % de lista** en **19 de 20** de los que
  tienen promo en GN (0,298-0,300; la excepción es ESSENTIAL, que es justo el del precio desfasado).
- 🔴 **El costo ⛔ no está en ningún lado todavía.** En `areben-produccion` hay **9 escandallos de
  lisos de Stunned actualizados HOY** (`STU-REM-OVER-{NG,BL,GR,MAR}`, `STU-REM-BOXY-{NG,BL}`,
  `STU-BUZ-OVER-{NG,AZ}`, `STU-BUZ-BOXY-NG`) — son el **liso**, sin la estampa, y su `datos` ⛔ no
  guarda el total: lo calcula la app.
  ▶️ **Es la pregunta que decide todo**: ¿el costo de los 12 sale de liso + estampa, o lo dicta Bruno?

▶️ **Lo abierto**: (1) los 15 costos · (2) los 15 precios · (3) el SKU de CAMPERA WEAR · (4) las 10
unidades fantasma · (5) ESSENTIAL 36.990 vs 45.990 · (6) los 5 con promo que GN ⛔ no ve.

---

## 🆕 DESCRIPCIONES DE ZATTIA — LOS DOS ÚLTIMOS INGRESOS, CERRADOS (9-sep-2026)

| estado | cuántas |
|---|---|
| 🟢 publicadas por Bruno hoy | **9** (las 4 que escribí + 5 de la cola vieja) |
| 🟡 **borradores esperando que Bruno los mire** | **39** — ⛔ **dijo que NO los va a confirmar todavía** |
| 🔴 mudas que ⛔ NO se pueden escribir | **8** — les falta la CATEGORÍA |
| ⚪ cortas de catálogo viejo | 171 (junio y antes) |

**Escritas las 39 cortas de los dos últimos ingresos** (4 del 2-sep + 35 del 12-ago), mirando las
dos fotos de cada una, con el validador real y relectura. Del 2-sep y del 12-ago ⛔ no queda nada.

🔴 **Las 8 mudas son 4 bermudas (FOUR, ZAHA, AMBER, SEOUL) y 4 shorts (VITA, CLIFF, GAIA,
NATE), todas con `NEW IN` como ÚNICA categoría** ⇒ `familiaDe` da `null`, sin familia no hay ficha
y sin ficha ⛔ no hay párrafo posible. **Es mano en Tienda Nube, ⛔ no texto.**

### 🔴🔑 CAMBIÓ LA REGLA DEL CHIVATO: ahora la ficha la CORRIGE la sesión

Bruno, 9-sep: *«¿vos no podés corregir las fichas que están mal, así dejo de mirar fichas y miro
entonces el texto?»* ⇒ cae el «⛔ nunca cambies vos un valor de ficha». **El cuello era que revisar
el texto obligaba a revisar también los bullets.** Ya está escrito en `~/.claude/commands/descripciones.md` § 4.
📊 **15 escrituras, 15 OK, 14 releídas y confirmadas** por `op:'atributos'`.

🔑 **Y lo que enseña el guard cuando rebota: si el valor no entra, la ficha ⛔ no estaba mal
— la LISTA no alcanza.** Para eso está `propuesto: true`, que guarda la palabra y **⛔ NO la
publica**.

### ▶️ LO QUE FALTA: dos palabras en el diccionario

**`halter` y `wide` están guardados como PROPUESTA en 4 prendas y van a seguir MUDOS** hasta que
entren a `lib/tn-desc/atributos.core.js`:

- **`halter` como valor de `manga`** (TOP ARIES, TOP BOULDER). Hoy `halter` existe **sólo como
  ESCOTE**, y por eso el local venía poniendo `musculosa` en todo lo que se ata al cuello — es el
  chivato más repetido de las últimas tres tandas. ⚠️ Ojo con el fondo: escote/cuello es **UN
  campo**, así que una prenda halter con escote en V hoy ⛔ no puede decir las dos cosas.
- **`wide` como valor de `calce` en la familia `faldas`** (BERMUDA HAYDEN, BERMUDA TIDE): las dos
  dicen `recta` sobre piernas anchísimas. `wide leg` ya existe, pero en `pantalon`.

📌 Y quedó un chivato **sin corregir a propósito**: HAYDEN y TIDE dicen `largo: a la rodilla` y el
ruedo llega a media pantorrilla — `faldas` sólo ofrece mini / a la rodilla / midi / maxi.

### 📌 Dos reglas del validador que sólo se ven ejerciéndolo

1. El párrafo tiene que **nombrar la prenda de la FAMILIA en los primeros 60 caracteres**: «Remera…»
   en un producto de familia `tops` se rechaza, va «Top…».
2. **La repetición se mide contra el VALOR del bullet, ⛔ no contra su etiqueta**: con `Tela: lino`
   la palabra «tela» pasa; con `Detalle: Con doble tela en el busto` quedan prohibidas «tela» y «busto».

🔑 **Y el estilo del tip lo fijó Bruno editando, ⛔ no dictando**: de los 4 textos míos que
publicó, editó 2, y los dos cambios son del mismo signo — se cayó el **adjetivo de tela** sobre la
prenda del tip («falda satinada» → «falda») y la **tercera prenda** del look («y una camisa abierta
encima»). ⇒ **el tip nombra la prenda, ⛔ no la califica ni la acumula**, y los dos pasaban `validarTip`.
📌 Al párrafo de VESTIDO BLAZE le **agregó** «con frunces», que yo había evitado por el bullet
«Detalle: elastizado» ⇒ **la regla de no repetir es sobre el DATO, ⛔ no sobre la palabra**.


## 🆕 DESCRIPCIONES DE ZATTIA — SALIERON LAS DOS PRIMERAS DE LA TANDA (7-sep-2026)

### 🔴 EL VEREDICTO DE BRUNO AL CERRAR EL DÍA, QUE ES LO PRIMERO QUE HAY QUE LEER

> «meto clear, sigo más tarde, pq **mucha fricción, tengo que revisar todo, no me está
> convenciendo**»

⛔ **⛔ No se toca nada más de este módulo sin resolver eso.** Lo dijo después de aprobar un par de
borradores a mano, y ⛔ no es una queja sobre un texto: es que **el circuito le pide revisar todo**.
Hoy, para que salga una prenda, alguien tiene que mirar el párrafo, el tip, los 6 bullets **y la
foto** — y los bullets los cargó otra persona en 27 segundos (mediana medida).

🔑 **Las tres cosas que ya se sabe que le suman fricción, y ninguna es el párrafo**:
1. **La ficha ⛔ no es confiable todavía** ⇒ revisar el párrafo obliga a revisar también los bullets.
   Medido hoy: 4 de 20 prendas de la tanda tienen la ficha peleada con la foto (TOP LOLA dice
   `Manga: 3/4` y es sin mangas · BLUSA BORA dice `Cuello: mao` y es palabra de honor · BABY TEE
   CAMO dice `Escote: asimétrico` y es barco · BLUSA HUBER dice `Detalle: trasnparencias`, con la
   ese cambiada de lugar). ⇒ ▶️ **es el 20 %, y hasta que baje, cada publicación es una auditoría**.
2. **`escote` tiene 23 «polera» contra 2 «mao»** ⇒ la lista usa palabras que en el local ⛔ no se
   usan así, y quien revisa tiene que dudar de cada una.
3. **Son TRES gestos por prenda** —Guardar, Aprobar, Publicar— más abrir la fila. Para 277 prendas
   eso es el trabajo, ⛔ no el texto.

⚠️ **Lo que ⛔ NO hay que hacer es escribir más borradores.** Hay 19 esperando y el cuello ⛔ no es
escribirlos: es que revisarlos cuesta.


### 🆕 8-sep-2026 — SE LE PREGUNTÓ, Y CONTESTÓ LAS TRES

Se le preguntó qué parte le pesa antes de tocar nada, y ⛔ **no eligió una: marcó las tres** —la
ficha, revisar de a una y los tres botones— y agregó la cuarta, que es la que las ata:

> «además en ese revisar de a uno, **poder editar rápido, o poder editar algunas partes**»

🏁 **«Revisar y publicar»: una pestaña nueva en la misma sección** (`gen-desc`, ⛔ sin permiso
nuevo). Las tarjetas se ven **todas abiertas**, con **la foto a 190×238 al lado de lo que va a
salir**, el párrafo y el tip en `textarea` que **se guardan al salir del campo**, los bullets
enteros —**cada uno es un botón que abre la ficha para corregirlo ahí mismo**— y **UN botón**:
`op:'revisar'` guarda, aprueba y publica en un solo pedido.
🔴 **El invariante ⛔ no se aflojó**: primero se escribe el borrador aprobado y **recién después** se
toca la tienda; el HTML se compone de lo GUARDADO, ⛔ no de lo que manda el navegador. Mismo permiso,
misma tela obligatoria, mismo respaldo, mismo compare-and-swap, misma relectura.
🔴 **`retenidos` es obligatorio en `paraRevisar`**: sin eso la tarjeta **se esfuma en el mismo gesto
que la publica** y quien apretó ⛔ no llega a ver si se verificó. Misma lección que `abierto`.
📌 **El relato entero, en `docs/secciones/gen-desc.md`** § «8-sep-2026 — Revisar y publicar».

▶️ 🔴 **LO QUE FALTA ES QUE BRUNO LA CAMINE**: publicar **uno** desde la tarjeta nueva. Es el único
eslabón que ningún test puede ejercer, y el que dice si la fricción se fue o cambió de lugar.
▶️ **Lo que esto ⛔ NO resuelve, y sigue abierto**: la ficha sigue peleada con la foto en 4 de 20
—la tarjeta hace que se VEA, ⛔ no que no pase— y **`escote` sigue con 23 «polera» contra 2 «mao»**,
que es la 2ª cosa que él nombró el 7-sep y ⛔ no se tocó.


### 🏁 Lo que se construyó el 7-sep después de esa entrada

- 🏁 **Las dos reglas del TIP** (`a8fb8fa`): la otra mitad del look, ⛔ nunca lo que va debajo (el
  forro ⛔ no está en la foto ni en la ficha) y ⛔ sin prescribir tiro ni corte.
- 🏁 **Una MINI ⛔ no se podía nombrar** (`c571467`): `Largo: mini` + la regla que exige nombrar la
  prenda ⇒ el validador nunca daba cero y **el botón de aprobar exige cero** ⇒ **20 productos** ⛔
  no se podían sacar por la pantalla (18 minis, BUZO BROWN, CAMISA AMELIE). Gana la regla que obliga.
- 🏁 **Filtro «En borrador» y buscador por nombre** (`f94679e`): los 19 borradores sólo se
  encontraban de memoria. La búsqueda le corre **también a la fila abierta**, y el filtro ⛔ no.
- 🏁 **«no sé» en TODO atributo cerrado** (`809611f`), con su filtro y tarjeta **«Para volver a
  mirar»**. ▶️ **Falta avisarle al local que existe**: una opción que nadie sabe que está ⛔ no se usa.
- 📌 **19 borradores escritos POR SESIÓN** —mirando las dos fotos, con el validador real— y
  **2 publicadas** (JEAN MARINA, BLUSA CLOE). ⛔ Ninguno de los 19 está aprobado.


**El relato entero está en `docs/secciones/gen-desc.md`** § «7-sep-2026 — el tip, y las dos primeras
que SALIERON de la tanda». Acá va sólo lo que queda abierto y lo que muerde.

🏁 **Cae el «nadie publicó todavía ninguno»**: **JEAN MARINA** y **BLUSA CLOE** están en la tienda,
`verificado: true` y releídas por un tercer camino. Con TOP BLISS (27-ago) van **3**.
🏁 **Las dos reglas del TIP, en producción** (`a8fb8fa`, CI verde, deploy confirmado): el tip habla
de **la otra mitad del look** —⛔ nunca de lo que va debajo, porque **el forro ⛔ no está en la foto
ni en la ficha**— y ⛔ **no prescribe tiro ni corte** (📊 de 76 prendas con tiro: **44 medio, 23
bajo, 8 alto** ⇒ pedir «tiro alto» manda a la clienta a lo que no hay). ⚠️ **El ejemplo del prompt
enseñaba la primera regla al revés** ⇒ se cambió el ejemplo, ⛔ no sólo se agregó la prohibición.

📊 **La cola, medida contra prod el 7-sep**: **335 fichas de atributos** cargadas por el local
(josefinabatter 193, camilaquintana 142) y **207 prendas con medidas** — el 1-sep eran **44 fichas y
CERO medidas** ⇒ 🔑 **la están usando**. **277 publicados con ficha completa y tela válida**, de los
cuales **24 mudos**.

### 🆕 8-sep-2026 — LA FICHA PASA A SER INSUMO, Y EL TEXTO LE AVISA CUANDO NO COINCIDE

**Decisión de Bruno**, mirando los 7 desplegables de las prendas de arriba: *«calce, cuello, manga
y largo, ¿es necesario? Porque todo eso se ve en la foto… la ficha estuvo pensada para armar la
descripción, ⛔ no para que esté expuesta en la descripción»* ⇒ **«que quede como insumo del
párrafo, y luego que el texto confirme o mejore»**.

📊 **Medido antes de tocar nada.** De las 4 prendas que sabíamos peleadas con la foto, **las 3 que
ya tenían párrafo lo tenían BIEN** (BORA «apoya fuera de los hombros» contra `Cuello: mao`; CAMO
«escote amplio» contra `Escote: asimétrico`; HUBER «cuello alto» contra `Escote: redondo`).
🔴 **Y el dato que decidió el rumbo: `tn_atributos` lo lee UN SOLO lugar en todo el repo — la
propia pantalla.** El «qué escote se vendió más» que justificó las listas cerradas ⛔ no existe:
el único consumidor real de calce, escote, manga y largo era el bullet que se publicaba.

🏁 **Las DOS fotos** (`95f5f94`): el pedido pasa de `{system, texto, imagen}` a `imagenes`. Con la
portada sola el modelo ⛔ no ve la espalda ni el ruedo. **US$0,80 el catálogo entero.**
🏁 **El CHIVATO**: el esquema pide `{parrafo, tip, discrepancias}` y cada aviso es
`{campo, dice, veo}`. Vive adentro del borrador, **muere con él** y ⛔ no sale a la tienda.
🔴 **MARCA, ⛔ NO CORRIGE** — el aviso ofrece el botón, el valor lo cambia una persona. Un invento
del modelo pisando un dato cargado con la prenda en la mano es peor que el error que arregla.
🔑 **Que esté saldado ⛔ no se guarda: se deduce de la ficha.** Y **la lista vacía AFIRMA**.
🏁 **`scripts/desc-borradores.mjs` + el comando `/descripciones`**: la dinámica de que **los
borradores los escribe la sesión** mirando las dos fotos, con el **validador real** y relectura.
Ejercido contra prod las dos puntas: el rechazo (⛔ no escribe) y el guardado idempotente.

### 🆕 8-sep-2026 (cierre) — DÓNDE QUEDÓ TODO, Y POR DÓNDE SE SIGUE

📊 **El mapa del catálogo de Zattia, medido con el audit fresco** (365 publicados):

| estado | cuántas |
|---|---|
| ✅ con nuestra descripción **publicada** | **22** |
| 🟡 **borradores esperando que Bruno los mire** | **27** |
| 🔴 mudas, sin una palabra | 25 → **quedan 12** después de los 13 escritos |
| ⚠️ cortas (menos de 120 caracteres) | 233 → **quedan ~219** |
| 🟢 con descripción larga | 85 |

▶️ **LO PRIMERO DE MAÑANA: Bruno revisa y publica las 27.** Están todas con el validador en cero.

🔑 **La prioridad la fijó él y ⛔ no es el catálogo entero: es lo último que ingresó.** Los dos
ingresos que importan son el del **2-sep (58 prendas)** y el del **12-ago (39)** — «teníamos antes
de los últimos ingresos 40 pendientes».

**Del ingreso del 2-sep ya ⛔ no queda nada mío**: 11 publicadas + 27 en borrador. Lo que falta es
de otros:
- **LOCAL**: **18 tablas de medidas** y 3 fichas (BLUSA SOUL, MILA, SHORT MINT).
- **BRUNO**: **8 categorías en TiendaNube** —BERMUDA FOUR, ZAHA, AMBER, SEOUL · SHORT VITA, CLIFF,
  GAIA, NATE—, que es **un gesto y destraba las 8**.
- **BRUNO + la diseñadora**: **5 telas fuera de la lista** — `algodon` ×2, `lentejuelas`,
  **`bambula`** (VESTIDO BLAZE) y el `denim rígido` dudoso de SHORT ZEBRA.

▶️ **Lo mío que sigue: las 31 cortas del ingreso del 12-ago.** Se listan con
`node scripts/desc-borradores.mjs listar --que cortas --alta 2026-08-12 --fresco`.

### 🔴 EL PATRÓN QUE YA NO SE PUEDE IGNORAR: `musculosa` EN PRENDAS QUE SE ATAN AL CUELLO

De los **21 chivatos** que salieron hoy revisando 44 prendas, **9 son el mismo error**. 🔑 Y ⛔ no
es distracción del local: **`halter` existe en la lista pero como valor de ESCOTE, ⛔ no de MANGA**,
y la opción correcta en manga (`sin mangas`) ⛔ no se parece a lo que la persona tiene delante.
▶️ **Es un arreglo de una línea en la lista, y lo decide Bruno.** El resto se reparte entre escote
(4), largo (3) y calce (2).

### 🔴 Y LA COLA DEL LOCAL, QUE NO SE VEÍA

Lo cazó Bruno preguntando: *«¿al local le falta seguir haciendo? porque ⛔ no les aparece en la
vista de ellos»*. Eran dos agujeros: ⛔ **no había contador ni filtro de «sin medidas»** —**134
prendas**, y con el filtro que venía puesto se veían **10**— y **«Últimas 2 tandas» se comía una
ranura con una fecha de UN producto** (el 13-ago), dejando afuera las 39 del 12-ago. Los dos
arreglados (`3f6f902`). ▶️ **Esa tarjeta es la que el local tiene que mirar todos los días.**

### 🆕 8-sep-2026 — LOS 17 BORRADORES, REVISADOS UNO POR UNO CONTRA LA FOTO

Bruno: *«primero vaciemos los 20 borradores que están esperando, ¿los vas a revisar?»* ⇒ se miraron
**las fotos de las 17** (14 en borrador + 3 aprobados) contra el párrafo y contra la ficha.

📊 **El resultado, que es también la primera medición de falsos positivos**: de ~100 valores de
ficha mirados, **6 no coinciden con la foto** (5 prendas) y **16 de 17 párrafos están bien**.

| lo que apareció | cuántas |
|---|---|
| ✅ párrafo correcto, ficha coherente | 12 |
| ⚠️ párrafo correcto, **la ficha miente** | 4 (JUNE · ASTRA · LIBIA · AVERY) |
| 🔴 **el párrafo INVENTA** | 1 — **BLUSA CAMELIA**, y estaba **APROBADA** |

🔴 **BLUSA CAMELIA decía «botones al medio» y ⛔ no hay botones**: hay un lazo y una abertura. Se
vio recortando la foto. **Estaba aprobada**, o sea a un clic de la tienda ⇒ 🔑 **el estado
«aprobado» ⛔ NO prueba que alguien lo haya contrastado con la foto.** Es el 2º caso de la misma
forma que JEAN MARINA. Corregido y guardado (vuelve a `borrador`, que es lo correcto: el texto
cambió, hay que volver a aprobarlo).

🔑 **Y el patrón de la ficha ⛔ no es aleatorio: `musculosa` en prendas HALTER**, 3 de las 4
(JUNE, ASTRA, LIBIA: se atan al cuello y dejan los hombros al aire). ⚠️ **`halter` existe en la
lista, pero como valor de ESCOTE, ⛔ no de manga** — y en manga la opción correcta (`sin mangas`)
⛔ no se parece a lo que la persona ve. ▶️ Es un arreglo de **lista**, ⛔ no de persona.
La 4ª es AVERY: `Escote: asimétrico` en un top **simétrico** con abertura en gota y cuello alto.

🏁 **Los 4 chivatos quedaron guardados** y se ven en la pantalla. ⛔ **La ficha ⛔ NO se tocó**:
marca, ⛔ no corrige — los corrige Bruno con el botón.

▶️ **BLUSA HUBER (aprobada) tiene DOS**: `Cuello: redondo` siendo cuello alto y `Manga: larga`
siendo **3/4**. ⛔ No se guardaron **a propósito**: guardar el borrador la desaprobaría, y esa
aprobación es de Bruno. Se corrigen tocando la ficha.

▶️ **Quedan 17 para publicar**: 15 en borrador y 2 aprobadas (LISBOA y HUBER).

⛔ **LA TANDA ⛔ NO SE CORRE POR LA API** (Bruno, 8-sep: *«dijimos que lo hacemos acá por este
medio, ⛔ no vamos a pagar»*). Los borradores y los chivatos los escribe **la sesión** mirando las
dos fotos — `/descripciones`. El botón con IA queda para quien lo quiera apretar, de a una.
⚠️ Se pagó **US$0,0038** el 8-sep corriendo el endpoint contra TOP LOLA *después* de que él lo
dijera: 🔑 **«ejercer a mano el verbo que gasta» ⛔ no es una excepción a «no gastar»** — es lo que
hay que preguntar antes.

▶️ 🔴 **LO QUE FALTA, EN ORDEN**: (1) **contar los FALSOS POSITIVOS del chivato sobre las 209,
mirándolas la sesión y ⛔ NO por la API** —el 3 de 3 está sesgado, son casos elegidos porque ya se sabían malos—; (2) recién ahí
**sacar los bullets** de lo que se publica y dejar tela + cuidados + medidas; (3) **silueta sale
igual**, sin esperar nada (el **94 %** es `regular` o `no aplica`).
⚠️ **Si los bullets se van, tienen que irse de las DOS puntas**: un campo que sigue alimentando el
párrafo convierte un error de ficha en **prosa afirmativa**, más difícil de cazar que un bullet
visiblemente falso.
⚠️ Hallazgo al pasar: en `calce`, **50 de 208** usaron «al cuerpo», que es una palabra **prestada
de faldas** — la lista propia de tops es sólo `entallado`/`holgado`. Si el campo se queda, la
lista está corta.

⛔ **FRENADO POR BRUNO EL 8-sep**: *«analicemos luego de las fricciones las 8 palabras con la
diseñadora, así lo vemos»* ⇒ ⛔ no se decide ninguna sin ella.
▶️ 🔴 **LO QUE ESPERA A BRUNO: las 8 palabras de tela propuestas.** `hilo` ×20 (los sweaters),
`algodon` ×5, `lentejuelas` ×3, `gamuza`, `lana`, `foil` ×2, `sastrera`, `gamuzado`. Son **36
prendas, 35 ya publicadas**, y hoy **pasan el freno de la tela y saldrían sin bullet de tela y sin
cuidados, calladas**: `sinTela` mira si la cadena está, ⛔ no si es un valor. Cuáles entran al
diccionario y **en qué grupo de cuidados**. ⚠️ El test de cobertura ⛔ no lo caza: cubre las telas de
la lista y éstas ⛔ no están en la lista.

▶️ **La tanda que sigue: los 22 mudos sanos** (los 24 menos BABY TEE NEX y BLUE, que son de
`algodon` y esperan lo de arriba). Se escriben **por sesión** —mirando las fotos, con el validador
real, `op:'borrador'`—, en tandas de ~20.

▶️ **Dos del párrafo, abiertas**: al modelo se le manda **una sola foto** (`imagenes[0]`, cuerpo
entero) y la de espalda ⛔ nunca — mandarle todas ≈ duplica el borrador (US$0,0015 → ~0,003; los 277
serían US$0,80) — y **el prompt ⛔ no le dice «si no lo ves con seguridad, ⛔ no lo nombres»**:
JEAN MARINA salió con «terminaciones deshilachadas» sobre un **dobladillo limpio**.

🔴 **Y una del oficio, que se pagó hoy**: **un borrador guardado ANTES de una corrección ⛔ no vuelve
solo**. Bruno marcó el deshilachado en la conversación y **se publicó igual**, porque lo que estaba
guardado en la base era el texto viejo ⇒ **antes de publicar se relee el texto contra lo que ya se
dijo**, ⛔ no contra la fila. Se republicó corregido el mismo día.

## 🆕 «NO EXISTEN CATEGORÍAS CLARAS PARA CUBRIR TODAS LAS OPCIONES» — 7-sep-2026 (dictado, medido, sin tocar nada)

> «miremos, se están realizando chequeos de exhibición, qué resultados están dando, para ver el tema
> de categorías» · «hay muchas categorías?» · «lo que no entiendo es por qué aparecen las categorías
> duplicadas» · y el pedido de fondo: **«no existen categorías claras para poder cubrir todas las
> opciones»**

⛔ **No se tocó Tienda Nube.** Todo lo de abajo es medición sobre el audit de Zattia
(`bdi-catalogo/api/tiendanube-audit?store=zattia`, 770 productos, `cached_at` **2026-09-07T14:53Z**).

### 🔑 No son 25 categorías: son **35**, porque el nombre no es la categoría — el ID sí

El desplegable de `/tncat/categorias` muestra **JEANS tres veces** y ACCESORIOS · BUZOS · CAMPERAS ·
CORSETS · TOPS Y BODIES · REMERAS · SWEATERS · PANTALONES **dos veces cada una**. ⛔ No es un bug de
la pantalla: en TN son categorías **distintas con el mismo nombre**.

🔑 **La causa está en los IDs: hay 13 consecutivas, `40361419` → `40361431`.** Consecutivas ⇒ creadas
todas de una sentada. Alguien armó un juego nuevo (BLUSAS Y CAMISAS, VESTIDOS, BLAZERS y las
repetidas) **sin borrar el viejo**, y les fue cargando productos encima.
⇒ los duplicados son **redundantes**: las mismas prendas están en las dos.

🔴 **El chequeo de exhibición NO ve esto y por eso no protesta**: `limpiarCats` devuelve **nombres**,
así que las tres JEANS le parecen una sola. El desorden se ve en `/tncat`, ⛔ no en el recorrido.

### ▶️ Borrar 16 categorías: qué falta antes

Fusionando por nombre quedan **19** (17 de prenda + NEW IN 416 + WINTER SALE 261). Se borran 16.
7 se borran **sin tocar nada** (REMERAS, SWEATERS, PANTALONES, BUZOS, ACCESORIOS, CORSETS, BLAZERS):
cero huérfanos. **Sólo 16 productos hay que reasignar antes** — SHORTS 8 · BLUSAS Y CAMISAS 3 ·
JEANS 2 · CAMPERAS 2 · TOPS Y BODIES 1. La lista con SKU y link al admin salió en la sesión.

🔴 **Dos cosas ⛔ NO verificadas, y las dos frenan el borrado:**
- ⛔ **No se sabe si las 13 son subcategorías de un padre ni si están en el menú de la tienda.** El
  audit sólo da `id → nombre`. `TIENDANUBE_STORE_ID` y `TIENDANUBE_TOKEN` están **vacías en el `.env`
  de la Mac de Bruno** (probado: 401). Si alguna cuelga del menú, borrarla saca el link al cliente.
- ⛔ **El monitor no borra categorías**: `/tncat/categorias` asigna y saca *productos*. Borrar es a
  mano en el admin de TN, y ahí ⛔ no hay staging ni historial.

### 🔑 El pedido de fondo: la categoría ⛔ no dice qué es la prenda

Sacada del catálogo mismo (primera palabra del nombre, 39 tipos reales contra 770 productos):

| lo que muerde | medido |
|---|---|
| **sin ninguna categoría** | **FAJA 7 · PAÑUELO 2 · SKORT 1** — caen en el vacío |
| **TOPS Y BODIES es un bolsón de 291** | se come TOP 201 · BODY 34 · BLUSA 29 · CAMISA 12 · CORSET 8 · MUSCULOSA 3 |
| **BIKINIS no es bikinis** | mete **CORPIÑO 20 y BOMBACHA 20** — es lencería, ⛔ no baño |
| **BABY: 45 prendas enteras en REMERAS** | el tipo más grande sin categoría propia |
| SHORT 55 → 13 sin cat · BERMUDA 14 → **9** sin cat · PANTALON 16 → 3 | los de abajo son los peor cubiertos |

▶️ **Falta decidir el árbol nuevo con Bruno.** ⛔ No se propuso ninguno todavía.

### 🔴 Lo que el chequeo de exhibición ⛔ no puede contestar

**El recorrido no guarda nada**: estados y errores de categoría viven en el `localStorage` del
aparato que escanea (`monitor_exhib_<cuenta>`, `monitor_exhib_err_<cuenta>`). `Exhib.tsx` ⛔ no tiene
un solo `fetch` de escritura ⇒ **desde otra máquina no hay forma de ver qué está dando un chequeo en
curso**, ni de leerlo después. Lo que marcan en el local muere en ese teléfono.

🔴 **Y la lista del recorrido viene corta, callada.** `construirItems` mete cada prenda en
`cleanCats[0]` — su **primera** categoría y nada más. Medido sobre los 770: **BLUSAS (26), SHORTS
(10) y BERMUDAS (8) muestran CERO** porque nunca son primeras; JEANS lista 40 de 79 y DENIM 57 de 96.
Elegir esa categoría da pantalla vacía, que se lee como «no hay nada que chequear».
▶️ Son dos funciones de `lib/exhib/core.ts` (`construirItems` y `esCruce`, que compara con `includes`
exacto ⇒ `SHORTS, MINIS y FALDAS` vs `...Y FALDAS` da **cruce falso**). ⛔ No se tocaron.

---

## 🏁 «ENTRÉ A ELIANA IND Y NO ME APARECE LO QUE VENDÍ» — 7-sep-2026 (dictado, y hecho)

> «seguimos con prm, que falta para saber en prm las ventas de los productos de los proveedores?
> pq entre a eliana ind pero no me aparece lo que vendi»

Nada estaba roto: **la columna era vieja**. El webhook cruza los renglones contra el espejo de
Gestión Nube **una sola vez**, y el alta en GN de un proveedor nuevo se hace **después** del aviso.
🏁 **El PRM ahora recruza en vivo** —la ficha y la lista de los 34—, con la regla en un solo lugar
(`lib/recepciones/espejo.core.js`), que es también la del webhook y la de Recepciones. El relato
entero en `docs/secciones/recepciones.md`.

🏁 **Y el OTRO bloque también quedó cerrado, el mismo día**: *«ahí cargaron los cruces de proveedor
en gestión nube»*. Con `productos.proveedor` cargado, `scripts/enganchar-gn.mjs` enganchó los 4 que
faltaban —**AIME · AUDAZ · ELIANA IND · YASANA**, las 4 exactas, 0 dudosas— y el padrón pasó a
**28 de 28** locales con órdenes de Zattia. 🔑 **El oráculo ⛔ no fue que la columna quedara escrita,
sino que el enganche SIRVIERA**: contados del otro lado traen **716 productos** y **ninguno apunta a
un nombre inexistente**; la segunda corrida dice `0`. Verificado además **en prod y por la misma
puerta que usa el ETL** (`?recurso=espejo`): los 15 productos de los 4 vuelven con su `proveedor`.
⚠️ **Los 6 que quedan sin enganchar son de BDI y así se quedan**: `productos.proveedor` ⛔ no existe
de ese lado.

▶️ **Y falta caminarlo con datos de Zattia.** Desde esta Mac esa base contesta `permission denied`
para `inventario` y `venta_detalles` (falta `ZATTIA_SUPABASE_SERVICE_KEY` en el `.env`; en Vercel
está). `scripts/caminar-prm-movimiento.mjs` ya elige el caso **desde la base** y lo imprime SIN
CAMINAR con su causa: el día que la clave esté, se ejerce solo.

---

## 🏁 «PARA SACAR DE LA CATEGORÍA, PODER VER LA FOTO Y HACE CUÁNTO ENTRÓ» — 7-sep-2026 (dictado, y hecho)

> «quiero ir a monitor categorías, para sacar de la categoría estaría bueno poder ver las fotos de
> los productos de esa categoría, se puede? además capaz que se pueda ver la fecha de ingreso del
> producto, principalmente para las categorías new in, para ir viendo eso» · y enseguida: *«ahí
> habría que poner también para buscar productos escribiendo, porque sólo me deja buscar lo que
> quiero agregar»*

Las tres cosas salieron del dato que la pantalla **ya bajaba**: `images` y `created_at` vienen en el
audit liviano (770/770 de Zattia, 252/252 de BDI), así que ⛔ no costó ni una llamada más ni el
payload `?variantes=1`. 🏁 **La fila muestra la foto, hace cuánto entró y el SKU; lo de adentro tiene
buscador y orden (más viejos / más nuevos / A–Z), con "más viejos primero" por defecto.**

📊 **Lo que se ve al abrirlo es el motivo del pedido: NEW IN de Zattia tiene 416 de los 770 productos
de la tienda, y 199 hace más de 90 días** (25 hace más de 180; el más viejo hace 325 d, del
16-oct-2025). La categoría dejó de significar «lo nuevo».
⚠️ **El número se mueve**: una hora antes eran 498, y el diff de los dos audits dice que **salieron
82 y no entró ninguno** entre las 13:47 y las 14:53 del 7-sep. Se cita con su hora.

🔴 **La fecha es el alta del producto EN TIENDANUBE, ⛔ no el ingreso de la mercadería** (eso vive en
Gestión Nube y acá no se cruza). Se dice en la fila y en el InfoPopover: leída como fecha de ingreso
manda a sacar de NEW IN lo que recién llegó.
🔴 **El buscador de adentro filtra la vista, ⛔ no el lote**: lo tildado sobrevive al cambio de texto
y la pantalla avisa con el número cuántos salen sin estar a la vista.

🏁 **Y las fotos se agrandan** (pedido de la misma charla): la miniatura abre el `Lightbox` del kit.
🔴 **Lo que había que cuidar: la fila entera es un `<label>` con el checkbox de sacar** ⇒ sin frenar
el evento, mirar una prenda la tildaba para sacarla de la tienda. Caminado en prod: amplía, cierra
con Escape, y el producto queda sin tildar.

📉 **Y mirándolo se vio moverse**: 498 (13:47) → 416 (14:53) → **335 (15:26)**, y los de 325 días ya
no están. Alguien está limpiando NEW IN ahora mismo; el más viejo que queda lleva 151 d.

El relato está en `docs/secciones/tncat.md`.

🏁 **CAMINADO EN PROD** (7-sep, con la sesión abierta en Chrome, ⛔ sin escribir nada): Zattia →
NEW IN abre en **416**, encabezado por CAMISA MICH / FALDA EMMA / TOP KAIRA / TOP ROMA (325 d) y
TOP NATE (276 d) — **el mismo orden que da el núcleo corrido aparte contra el catálogo**. Las
miniaturas cargan (la de TOP KAIRA: 700 KB de original → **1,26 KB** por `images.weserv.nl`), el
buscador de adentro dice **«1 de 416»**, y con un tildado fuera del filtro la pantalla avisa **«1
tildado no se ve con esta búsqueda, y también sale»** con su «Destildar todo». ⛔ El botón de sacar
no se apretó: lo que escribe no cambió (mismo `accion:'asignar'` por items).

---

## 🏁 CERRAR EL MEMO CONGELA LOS NÚMEROS, NO EL ACTA — 7-sep-2026 (dictado, y hecho)

> «pq no se puede seguir escribiendo lo de memo semanal personal de cada uno, o sino un boton de
> desbloquear, escribir, y volver a bloquear, para que no este abierta la seccion»

Lo dijo después de cerrar la `w2026-08-31`. El interruptor del cierre apagaba **cuatro** cosas de
una vez —foto, señales, avances y **acta**— y no había verbo de vuelta: se salía con un UPDATE a
mano. Ya había costado dos actas (`w2026-08-10` cerrada vacía para siempre; `w2026-08-31` cerrada en
blanco). 🏁 **Las dos cosas que pidió, hechas**: el acta se escribe siempre —regla en
`puedeEscribirBloque` del núcleo, aplicada por la pantalla **y por el handler**, donde el candado
⛔ no existía— y hay **Desbloquear** / **Volver a cerrar**, que ⛔ no recalcula la foto (el capital
parado es un número de HOY: se movió $133.780 en un día). El relato está en `docs/secciones/memo.md`.

▶️ Lo que queda es del ritual, ⛔ no del código: la **`w2026-08-24` sigue abierta y sin acta**.

---

## 🆕 UNA SESIÓN DE FOTOS NO SE ELIMINA: SE TERMINA — 7-sep-2026 (dictado)

> «la sesion no se tiene que eliminar, se tiene que terminar»

Lo dijo Bruno mirando lo que dejó **«SS 27»**, que era una prueba suya del 5-sep: la sesión se
**eliminó** y sus **8 renglones de Agenda quedaron huérfanos** sobre Sofi, Cande y Cami, 5 de ellos
venciendo el 6-sep. 🏁 **Los 8 los borré el 7-sep** (lista blanca de ids + la clave de siembra;
`agenda_items` pasó de 234 a 226, y quedan **0** con «SS 27»). ⛔ No quedó nada más de esa sesión:
⛔ ni el evento —ya lo había borrado él— ni solicitudes hijas.

🔴 **El hueco, que es de diseño y ⛔ no de datos**: hoy la sesión abierta ofrece **dos** salidas,
«Marcar como hecha» y **«Eliminar»**, y la segunda es la que rompe — borra el hecho y **deja el
trabajo que ese hecho sembró**. El diálogo dice *«No hay papelera»*, pero habla de la sesión, ⛔ no
de la Agenda, y quien la borra ⛔ no ve los pendientes (son de otras personas ⇒ ⛔ no salen ni en su
Hoy, ni en su Semana, ni en su Mes). Ver `docs/secciones/sesionfotos.md` § La CAMINATA del 6-sep.

▶️ **Falta decidir la forma** (dos caminos razonables, y la elección es de Bruno):
1. **Sacar «Eliminar»** y dejar sólo «Marcar como hecha» ⇒ una sesión cargada por error se termina
   igual que una real, y ⛔ nada queda colgado.
2. **Dejarlo sólo mientras la sesión ⛔ no haya sembrado ni tenga pedidos** —el guard de las hijas ya
   existe—, y en cuanto sembró, que el único camino sea terminarla.
⚠️ En los dos casos hay que decir en la pantalla **qué pasa con los pendientes ya sembrados**: hoy
⛔ no lo dice ninguno de los dos botones.

---

## 🆕 FERIA AL COSTO DE ZATTIA — 5-sep-2026 (dictado)

> «quiero armar feria de zattia con las cosas que metimos en liquidación, pero el plan es vender al
> costo, por ende sería solo presencial, con productos de invierno y que ya están en la liquidación
> actual»

El plan comercial (lote, mesas de precio, operativo) quedó en un documento aparte. Acá va **lo que
es del monitor**, que es un hueco medido, no una idea:

- 🔴 🔑 **NO HAY PRECIO QUE SEA SÓLO DEL LOCAL, y eso rompe «solo presencial».** El aplicador
  escribe `tiendanube_promotional_price` (`api/_liquidacion.js:1116`) y ese precio **rige en las dos
  puntas**: medido sobre las ventas desde el 25-ago, **134 u en Mi Local y 50 en Tienda Nube salieron
  exactamente al precio de campaña**. Una feria cargada por la sección se publica online el mismo
  día. ⇒ hoy la única salida es **cartel de mesa + descuento a mano en la caja** (ya se hace:
  **603 de 658 ventas del local desde el 1-ago llevan descuento cargado a mano**, promedio $4.647).
  ▶️ Si esto se va a repetir, lo que falta es un `tipo` de campaña **presencial**: decide precios,
  imprime carteles y ⛔ **no escribe nada en GN**.
  🆕 **Bruno lo resolvió por otro lado: OCULTA en Tienda Nube todo lo que va a la feria** ⇒ el precio
  puede vivir en el sistema sin publicarse. ▶️ **Falta probar con UNA prenda que el sync no la
  republique** (GN le escribe a TN todos los días) — ⛔ no se puede medir desde este repo: el
  `TIENDANUBE_TOKEN` del `.env` es el de BDI.
- ✅ **«Precios de mesa» EN EL REPO** (`porEscalera` + el botón, 14 casos y 6 mutantes muertos): el
  masivo que había sólo sabía «−X% sobre lista», y una feria de 8 mesas sobre 381 modelos eran 381
  modales. ✅ **EJERCIDO EN PROD** (5-sep): el cartel dio «$19.900: 1 · $24.900: 1» y la base quedó
  con los precios redondos, los ítems en `definido` y **la bitácora en cero**. 🔴 **Nació con la
  condición del botón de al lado y ⛔ no se dibujaba en `borrador`** —donde se arma la campaña—;
  arreglado con `campaniaEditable` (`9cc1ea6`). ⛔ **El prompt lo aprieta una persona**: un diálogo
  nativo congela el puente de Chrome.
- ✅ 🔑 **9-sep-2026: LA FERIA YA ESTÁ DEFINIDA — 351 ítems con precio de mesa, 0 pendientes.**
  El botón ⛔ no se apretó: se corrió por API con `porEscalera` **importado** del núcleo
  (`lib/liquidacion/core.ts`) y por `decidir-masivo`, el mismo endpoint. ⛔ No toca Gestión Nube.
  Verificado **por GET**, ⛔ no por lo que contestó el POST: `376 = 351 definido + 25 descartado`,
  **ninguno sin precio, cero por debajo del costo**.
  🔑 **Para importar el núcleo TS desde un script hay que resolver el alias `@/`**: `registerHooks`
  de `node:module` reescribiendo `@/x` → `<raíz>/x` y agregando la extensión `.ts`. Sin eso Node no
  puede leer `lib/liquidacion/core.ts` y la única salida es **copiar la regla**.
- 🔴 🔑 **LA ESCALERA DE 8 MESAS DEJABA LOS PRECIOS LEJOS DEL COSTO, Y LA FERIA ES AL COSTO.**
  Lo cazó Bruno: *«los precios de mesa van al costo, no? pq sino faltan más opciones de precio de
  mesa»*. Medido: con las 8 mesas viejas **sólo 925 de 5.335 prendas quedaban a menos de 10% del
  costo** y **2.056 quedaban más de 25% arriba** — las bombachas de $3.940 en la mesa de $5.900
  (+50%), un accesorio de $1.200 a $5.900 (+392%). El techo daba **21,4% sobre el costo**.
  🔑 **Y el problema ⛔ no era «pocas mesas»: era DÓNDE estaban.** Calculado por programación
  dinámica (partir los costos ordenados en N grupos, precio del grupo = el costo más caro
  redondeado al X.900 de arriba, minimizando la distancia al costo pesada por prendas): las
  **mejores 8** ya daban 12,4% en vez de 21,4%. De 14 mesas para arriba el rendimiento se aplana
  (14 → 8,4% · 19 → 7,0%): **seis carteles más compran $0,8M de acercamiento**.
- ✅ **La escalera quedó en 17 mesas**: `1900, 2900, 3900, 4900, 5900, 6900, 8900, 10900, 11900,
  12900, 13900, 14900, 17900, 20900, 27900, 34900, 43900`. Verificado por GET — techo
  **$51.600.500** contra **$47.830.300** de costo (**1,08×, 7,9% arriba**, era 1,21×), **56% off
  promedio sobre lista**, **3.546 prendas a menos de 10% del costo** (eran 925) y **cero por debajo
  del costo**. Reparto: $1.900 3 mod/56 u · $2.900 2/36 · $3.900 4/16 · $4.900 45/1.638 ·
  $5.900 32/890 · $6.900 30/186 · $8.900 68/325 · $10.900 30/152 · $11.900 11/253 · $12.900 24/743 ·
  $13.900 13/226 · $14.900 11/272 · $17.900 26/271 · $20.900 12/96 · $27.900 33/162 · $34.900 4/16 ·
  $43.900 3/13.
  🔑 **La mesa de $54.900 ⛔ no existía**: el costo más caro del lote es **$43.626**.
- 🔴 🔑 **UNA ESCALERA EFICIENTE ⛔ NO ES UNA ESCALERA CON BUENOS GANCHOS, y son dos objetivos
  distintos.** Bruno: *«busco conseguir también los mejores precios en sweaters y tops para que sean
  ganchos de la acción»*. La optimización pesa **por prendas** ⇒ pone las mesas donde está la masa
  (1.264 corpiños y 1.076 bombachas), ⛔ **no donde está el titular**. Las tres mesas de gancho
  ($2.900, $3.900, $10.900) se agregaron a mano: mueven 204 prendas y bajan el techo $240.000.
  🔑 **Y el techo del gancho ⛔ NO lo pone la escalera: lo pone el COSTO.** El sweater más barato
  del lote cuesta **$10.000** ⇒ ⛔ no hay escalera que dé un sweater a $7.900 sin ir a pérdida.
  Pasar de 17 a 22 mesas ⛔ **no mejora ni un gancho**: sólo el promedio (7,9% → 6,6%).
- 📌 **Los titulares medidos, con lo que cuestan** (⇒ decisión de Bruno, `porEscalera` ⛔ no la toma):
  **SWEATERS a $12.900 sobre los 5 con volumen y poca venta** (SEATTLE 42 u v90 4 · STANFORD 48 u
  **v90 1** · VIENNA 37 · MONTEREY 20 · OREGON 28) = **175 prendas al 62% off por $56.804**; a
  $13.900 son **$3.836** y 59% off; a $9.900, 71% off y **$485.038**.
  **TOPS**: el titular fuerte ya está y es **gratis** — **TOP FLARE** $4.900 con lista $16.490
  (**70% off**, costo $2.876, 25 u) y **TOP WHISPER** $1.900 con lista $10.490 (**82% off**, costo
  $1.625, 14 u). Un «TODOS LOS TOPS a $4.900» sobre las 616 prendas costaría **$1.455.157**.
- ✅ 🔑 **EL GANCHO ES EL PISO, ⛔ NO UN PRECIO PLANO** (decisión de Bruno): *«yo haría para cada
  uno un precio distinto pq no son los únicos sweaters, pero mientras más abajo sea el gancho, mejor
  es el gancho: puedo decir sweaters desde $10.900»*. ⇒ la escalera se queda como está y **lo único
  que se toca a mano es el más barato de la familia**, que es el que va al cartel.
  ✅ **Hecho: SWEATER MONTEREY $10.900 → $9.900** (20 u, costo $10.000, **63% off**) — verificado por
  GET. Resigna **$20.000** y queda **$2.000** bajo costo, y **rompe los cinco dígitos**: el titular
  pasa de «desde $10.900» a **«SWEATERS DESDE $9.900»**. Es la mejor relación de toda la feria.
  🔴 **Pero son 20 prendas**: con tope de 2 por persona son **10 clientes** ⇒ el cartel se queda
  sin respaldo el primer día. **Sostenerlo cuesta**: sumando **SEATTLE** (42 u, costo $11.977,
  v90 4) el piso pasa a **62 prendas** y resigna **$146.000** ($89.234 bajo costo); sumando también
  **STANFORD** (48 u, costo $13.007, **v90 1**) son **110 prendas** por **$338.000** ($238.370 bajo
  costo). Bajar el piso a $7.900 con esos tres: $558.000. ▶️ **Decisión de Bruno.**
  🔑 **El precio a mano se pone con `decidirItem` IMPORTADO** del núcleo (la cuenta de margen,
  markup y % off es la misma que la pantalla) y se guarda con `guardar-item`. ⛔ No toca GN.
- 🔴 🔑 **«NO BUSCO PERDER, BUSCO NO GANAR» — y eso REVIERTE el gancho bajo costo** (Bruno):
  *«si va desde 10990, que sea ese el precio»*. ⇒ **⛔ ningún precio por debajo del costo**, y el
  piso de cada familia es el que salga. SWEATER MONTEREY volvió de $9.900 a su mesa.
  ✅ 🔑 **Y el número que él tipeó destapó la mejora: la escalera va terminada en `.990`, ⛔ no en
  `.900`** — que además es **cómo Zattia escribe todos sus precios** (el sale de agosto: $6.990,
  $8.990, $10.990, $14.990). Contra la intuición, subir cada escalón $90 **acerca** al costo: el que
  cuesta $3.940 deja de saltar a $4.900 y cae en **$3.990**. Medido: **7,9% → 7,3%** sobre el costo.
  ✅ **Aplicado y verificado por GET**: `1990, 2990, 3990, 4990, 5990, 6990, 8990, 10990, 11990,
  12990, 13990, 14990, 17990, 20990, 27990, 34990, 43990` — techo **$51.345.650** sobre
  **$47.830.300** de costo (**1,07×**), **57% off promedio**, **cero por debajo del costo**.
- ✅ 🔑 **LOS GANCHOS SALIERON SOLOS Y NO CUESTAN NADA.** Piso por familia, todos sin perder un peso:
  **BOMBACHAS $3.990 — 491 prendas, 80% off** · **CORPIÑOS $4.990 — 450 prendas, 75% off** ·
  TOPS desde $1.990 (14 u, 81%) · SWEATERS desde $10.990 (22 u, 59%) · CORSETS $8.990 · BODIES
  $6.990 · VESTIDOS $8.990 · CAMPERAS $10.990. 🔑 **Los dos primeros son 941 prendas al 75-80% off
  con pérdida CERO**: es el aviso del domingo, y confirma lo que ya estaba medido (bombachas de
  costo $3.940 y lista $19.990). ⛔ No hizo falta gastar un peso en titulares.
- 📌 **Quedan 2 avisos altos**, los dos por caer con la mesa EXACTAMENTE en el costo —**TOP FRAY**
  ($5.990, 3 u) y **TOP DASH** ($6.990, 2 u)—, que es literalmente «no ganar». Avisos medios: 14.
- ✅ 🔑 **BOMBACHA Y CORPIÑO A $4.990 LA PARTE, PLANO** (Bruno: *«pondría bombacha y corpiño 4990
  la parte, así directo»*) — **36 modelos · 2.340 prendas · un solo precio**, que es el **44% de las
  prendas de la feria** y todas con lista $19.990 ⇒ **75% off en un cartel de un renglón**.
  Aplicado con `decidirItem` importado del núcleo + `decidir-masivo`; verificado por GET: los 36 en
  $4.990. Recauda **$11.676.600** contra **$11.086.423** de costo ⇒ **el bloque queda $590.177
  ARRIBA del costo**, y resigna **$323.000** contra las mesas que tenía.
  🔴 **Pero 814 prendas quedan por debajo del costo** (−$329.000, $404 por prenda): los siete
  **CORPIÑO TAYRA** ($5.295) y **CORPIÑO BORA** ($5.490). A $5.490 no perdería ninguna y daría
  73% off, pero deja de ser un solo número. **Es lo que decidió Bruno sabiendo el número.**
  🔑 **Se pierde el titular de $3.990** (491 bombachas al 80%) y se gana uno **cinco veces más
  grande**: 2.340 prendas al 75%. Los avisos altos pasaron de 2 a **9**.
- 🔴 🔑 **CUIDADO: volver a apretar «Precios de mesa» PISA este precio plano.** `porEscalera`
  reparte por costo y devolvería los corpiños caros a $5.990 — y ⛔ nada avisa que había una
  decisión a mano encima. Si hay que recorrer la escalera de nuevo, esto se vuelve a aplicar después.
- 🆕 🔑 **QUÉ SACAR DE LA FERIA, MEDIDO CONTRA LAS VENTAS A PRECIO DE LISTA** (Bruno: *«las que
  se vendieron en precio sale tenemos sesgo y no puedo hacer nada, pero sí puedo ver lo que se
  vendió bien a precio de lista»*). Se contesta con `venta_detalles.unit_price` contra
  `foto.precioNormal`, por la acción `ventas-campania` de `api/_liquidacion.js` — 10.621 líneas de
  los 351 en 12 meses. **A lista = pagó ≥90% de la lista de hoy, sin el canal Mayorista**; la
  ventana limpia es **15-may → 12-ago**, ANTES de que arrancara el sale el 13-ago.
  🔴 **El ranking crudo por «vendió a lista» ⛔ NO sirve: lo encabeza la lencería de VERANO**
  (AYLA/NYA a lista en enero). Eso ⛔ no es demanda viva, es estacionalidad — y ya estaba medido
  aparte (guardarlos a oct-dic rinde $7,6M más).
  ✅ **Con stock de repo (≥8 u) y ritmo vivo salen 14 modelos · 268 prendas · vale $4.393.000**, y
  se parten en dos con criterios opuestos:
  **abrigo** (SWEATER NEVADA 41 u · DALLAS 40 · ARIZONA 29 · BERLIN 20 · CAMPERA LINES 9 = 139
  prendas, $2.992.000) — 🔴 **su ritmo se midió EN invierno y no se sostiene en primavera**:
  sacarlos de la feria es bancarlos hasta abril-2027; y **no estacional o de verano** (JEAN FOSTER ·
  BLUSA AZALEA · BLUSA ANTHEA · TOP BELICE · ACCESORIO NRO 2 FUCSIA · TOP ZARA · TOP MOVE ·
  MINI ARLET · BABY TEE ICON BLACK = 129 prendas, $1.401.000), donde el argumento es **al revés**:
  su temporada empieza.
- 🔴 🔑 **LA SEÑAL MÁS LIMPIA ES «PAGÓ LISTA CON EL SALE PUESTO», Y ME CONTRADICE LOS GANCHOS.**
  Desde el 13-ago, con toda la tienda en oferta, estos siguieron saliendo a precio de lista:
  **TOP MOVE** 10 u · **TOP MIST** 8 u · **ACCESORIO NRO 2 FUCSIA** 7 u · **TOP WHISPER** 6 u ·
  **SWEATER MONTEREY** 4 u · **TOP ZARA** 4 u · **MINI BLUSH** 4 u (7 modelos, 120 prendas).
  🔴 **TOP WHISPER ($1.990 en la feria, lista $10.490) y TOP MIST ($2.990, lista $13.490) son
  justo los dos que yo había propuesto de titular**, y **SWEATER MONTEREY** era el piso de
  «SWEATERS DESDE $10.990». La escalera elige por COSTO y el costo bajo ⛔ no dice nada de la
  demanda: los tres tienen gente pagando lista **hoy**. ▶️ **Decisión de Bruno**, y si salen hay
  que buscar otro titular.
- 🔴 🔑 **CORREGIDO POR BRUNO EN LA VUELTA SIGUIENTE, Y LA LISTA ENTERA SE CAE**: *«el whisper y
  el mist los tengo que poner pq son de invierno, tienen manga larga»*. Yo había clasificado la
  temporada **por el NOMBRE** —«TOP» ⇒ no es abrigo—, y un top puede ser de manga larga.
  🔑 **La temporada se lee en CUÁNDO vendió a lista, ⛔ no en cómo se llama.** Rehecho por mes:
  WHISPER vendió sus 6 u **todas en agosto**, MIST 7 en agosto y 2 en septiembre. Y **los 19
  candidatos que había armado dan INVIERNO, los 19**: cero unidades a lista entre noviembre y
  febrero. ⇒ **⛔ no hay que sacar ninguno**: venden a lista **porque es su temporada, y es la que
  se termina**. De los 351, 120 dan INVIERNO y 65 VERANO por este criterio.
  🔑 **La pregunta útil es la de al revés: quién vende a lista en VERANO** (nov-feb), porque a
  ésos la feria les quema la temporada que viene. Son **34 modelos · 2.185 prendas**: 21 de
  **lencería** (1.694 prendas, justo el cartel de $4.990) y 13 más — SHORT ARES · CORSET BERNA ·
  FADE #002 · SHORT KAOS · SHORT NIX · SHORT CRONOS · SHORT ATLAS · BERMUDA DOJA · VESTIDO AIXA ·
  VESTIDO SOLANA · TOP BANGKOK · TOP NARA · TOP RISE (491 prendas).
- ✅ 🔑 **Y EL NÚMERO CIERRA EL CASO A FAVOR DE DEJARLOS**: la lencería vendió a lista **637 u en
  los 4 meses del verano pasado = 159 u/mes**; con **2.340 prendas**, vaciarla a esa velocidad son
  **15 meses**. Short + bermuda: 559 prendas, 161 u a lista en nov-feb ⇒ **14 meses**. ⇒ guardarlas
  ⛔ no es esperar UNA temporada, es esperar **dos**. ⚠️ El ritmo es sólo el de precio de lista: en
  verano también venderían con descuento, así que 15 meses es el techo, no el número exacto.
- ✅ 🔑 **LA REGLA DEFINITIVA LA DIO BRUNO Y ES DE COMPRA, ⛔ NO DE VENTA**: *«todo lo que es
  temporada vieja y no tengo recompra, no me sirve no liquidarlo. Sólo me interesaría no liquidar
  algo que se venda bien, y que haya podido recomprar en los últimos ingresos»*. ⇒ el eje que
  faltaba ⛔ no era la temporada ni el precio de lista: es **si puede REPONERLO**. Sin repo, aunque
  venda bien, liquidarlo es lo correcto — no hay línea que sostener.
  🔑 **Se contesta con la sección Recepciones** (`?recurso=recepciones&store=zattia&dias=365`,
  y el detalle por OC con `&oc=zattia:<id>`): las líneas traen `sku`, `producto_id_hoy`,
  `cantidad_contada` y **`es_nuevo`**, que distingue **alta nueva** de **RECOMPRA**.
  🔴 🔑 **PERO EL INSTRUMENTO TIENE UN AGUJERO Y CASI LO REPORTO MAL: 50 de las 74 OC se cargaron
  el 27-ago-2026 de una sola vez** —306 productos, `fecha_compra` en **null**— porque es la **carga
  histórica** del webhook, ⛔ no un ingreso. Ordenando por `recibido_en` daban «última recompra hace
  13 días» **77 modelos**. Con sólo las 24 OC de fecha real (**6-jul → 31-ago, 1.029 u, 17
  proveedores**) quedan **28 productos de la feria**, y **RECOMPRAS de verdad: 6**.
  ✅ **Los 6, y aplicando el «que venda bien» quedan 5** (TOP MONTANA tiene v90 = 0):
  **SWEATER NEVADA** (41 u, v90 45, 10 u el 6-jul, DUET) · **SWEATER BERLIN** (20 u, v90 22, 5 u) ·
  **SWEATER GEORGIA** (4 u, v90 11) · **SWEATER BOSTON** (3 u, v90 11) · **JEAN WORN** (5 u, v90 7,
  10 u el 10-ago, ASKDENIM). **73 prendas · resignan $1.761.000.**
  📌 **SWEATER MONTEREY** entró 25 u el 6-jul de DUET pero marcado como **alta nueva**: es mercadería
  fresca aunque ⛔ no figure como recompra — y es el piso de «SWEATERS DESDE $10.990».
  ▶️ **La ventana es 6-jul → 31-ago y ⛔ no hay más**: lo recomprado antes de julio ⛔ no está en el
  dato. Si hace falta mirar más atrás, hay que pedirlo del lado de Ingresos.
- 🆕 🔑 **EL FOCO LO PUSO BRUNO: CONTAMINA BY LATTE CHIC** (*«de esos no hay nada, el foco está
  en el proveedor contamina que tuvo recompra recién»*). Tiene **3 OC**: **OC-0308** (compra 10-ago,
  ingreso 11-ago, 12 productos, 89 u — la reciente) y **OC-0051** y **OC-0104**, sin fecha porque
  entraron en la carga histórica del 27-ago.
  🔴 **La compra reciente ⛔ NO repuso NADA de la feria: sus 12 modelos son todos ALTAS NUEVAS**
  (TOP CELINE · SKYLER · ODESSA · BRENNA · CIRA · ODETTE · HAVEN · SOLENE · TERRA · LIBIA · SORA ·
  BODY LIVIA) y **ninguno está en la campaña**. La línea está viva, pero lo que llegó es colección
  nueva, ⛔ no repo de lo viejo.
  ✅ **Igual, 24 productos de CONTAMINA SÍ están en la feria y 17 tuvieron repo** en las OC
  anteriores. Con la regla completa —repo **y** v90 ≥ 5— quedan **14 modelos · 80 prendas ·
  resignan $746.000**: TOP MOVE (9 u, v90 24) · TOP ZARA (14, 12) · TOP ELENA (3, 12) · TOP JUNE
  (4, 11) · TOP LILI (6, 8) · SAQUITO VENECIA (2, 8) · MINI ANNE (7, 7) · TOP COWIN (1, 7) ·
  MINI BLUSH (17, 7) · BODY ORIANA (1, 6) · SHORT VIBE (4, 6) · MINI ZEN (2, 6) · TOP CAIRO (2, 6) ·
  MINI ARLET (8, 5).
  ⚠️ **8 de esos 14 ya están `confirmado`** (TOP ELENA · TOP JUNE · SAQUITO VENECIA · TOP LILI ·
  MINI ANNE · BODY ORIANA · SHORT VIBE · TOP CAIRO). Confirmado ⛔ no es aplicado: descartarlos
  todavía ⛔ no toca la tienda.
  📌 Los otros 3 con repo pero que ⛔ no venden: TOP AZURE (v90 3) · TOP DUBAI (2) · TOP MARIAN (−1).
- 🔴 🔑 **LA COMPRA DEL 31/8 A CONTAMINA ⛔ NO ESTÁ EN EL SISTEMA, y el hueco es del feed.**
  Bruno: *«pero compré también el 31/8, fijate»*. Revisado: **las OC del 30 y 31-ago SÍ entraron
  —13 OC, 580 u, el 1-sep— pero son de otros 12 proveedores** (PSYCHIC · ASKDENIM ×2 · EFFIE ·
  RHOVE · MAIE · YASANA · ELIANA · NATURAL · SCOPO · AUDAZ · AIME · PLAYURBAN), **ninguna de
  CONTAMINA**. Su última recepción sigue siendo **OC-0308, compra 10-ago**.
  🔑 **Recepciones guarda lo RECIBIDO Y CONTADO, ⛔ no lo comprado** —lo escribe `api/_oc-webhook.js`
  cuando Ingresos confirma la OC— ⇒ una compra del 31/8 que todavía ⛔ no se recibió/confirmó **no
  puede** aparecer. ⚠️ Y de las 13 del 31-ago, **sólo un producto está en la feria**: SWEATER ZARA
  (ASKDENIM, alta nueva, 8 u, v90 0).
  🔴 **El feed tiene sólo DOS días de actividad**: 27-ago (61 OC, la carga histórica) y 1-sep
  (13 OC). **Desde el 1-sep ⛔ no entró ninguna** — 8 días. ▶️ Vale chequear del lado de Ingresos si
  la OC de CONTAMINA del 31/8 quedó sin confirmar, o si el webhook dejó de traer.
  ⇒ **Para la decisión, la palabra de Bruno reemplaza al dato**: si le volvió a comprar a CONTAMINA,
  la línea está viva y los 14 salen de la feria.
- 🛑 **CORTADO POR BRUNO**: *«dejémoslo ahí, hasta ahí. Lo que todavía no quedó confirmado
  esperemos»*. ⛔ No se saca nada más de la feria. Estado al cierre: **286 confirmado · 65 definido ·
  25 descartado**.
- 🔴 🔑 **ETIQUETAR LA FERIA ⛔ NO DEPENDE DE CONFIRMAR: DEPENDE DE APLICAR** (pregunta de Bruno:
  *«lo importante es que lo del depósito esté confirmado para empezar a etiquetar»*).
  Con la campaña `en_curso`, **`pidsAEtiquetar` devuelve SÓLO los `aplicado`** (`api/_liquidacion.js`)
  ⇒ con **0 aplicados**, la feria **⛔ no aparece en Etiquetas** aunque se confirmen los 351.
  🔑 **Y el precio de la etiqueta sale de Tienda Nube, ⛔ no de la campaña**: hoy TN tiene el precio
  del sale de agosto ⇒ etiquetar antes de aplicar **cuelga en la percha el precio viejo**.
  ⛔ **El atajo «Ya cargué los precios» ⛔ NO sirve**: pasa la campaña a `aplicada` y ahí Etiquetas
  suma los `confirmado`, pero **la etiqueta seguiría imprimiendo el precio de TN**.
  ⇒ el orden del domingo 13 no cambia: **sacar el sale → ocultar en TN → aplicar → recién ahí
  etiquetar**. 📌 Y para una feria de MESAS la prenda ⛔ no lleva etiqueta de precio: lleva el
  **cartel de la mesa** — lo que sí se puede empezar ya es **bajar del depósito y separar por mesa**,
  que ⛔ no depende de nada del sistema.
- ✅ **Y la premisa de la pregunta ⛔ no es cierta: los precios SÍ se pueden editar.**
  `campaniaEditable` es `estado !== 'cerrada'`: ni la fecha de inicio ni el `confirmado` congelan
  nada. Cambiar un precio confirmado lo devuelve a `definido` y **borra la confirmación**, a
  propósito — un precio nuevo es un precio que nadie miró. Lo único que cambia después de **aplicar**
  es que hay que reescribirlo en GN.
- ✅ 🔑 **PERO LA ETIQUETA DE LA FERIA ES SÓLO EL PRECIO, SIN NOMBRE — y eso YA SE PUEDE HACER HOY,
  sin campaña, sin aplicar y sin Tienda Nube** (Bruno: *«la idea sería sólo etiqueta de precio sin
  nombre… lo que tengo que hacer es etiquetar lo que no tengo exhibido en el local, llevarlo listo»*).
  🔑 **La pestaña «Libre» (✏️) de Etiquetas es exactamente eso**: líneas de texto opcionales,
  **campo de precio**, **copias** y tamaño; el código de barras se deja vacío. `buildLibrePdf` acepta
  precio solo. ⇒ **el etiquetado del depósito ⛔ NO depende de nada de Liquidación**: son
  **13 tiradas**, una por mesa con depósito.
- 📌 **Cuántas etiquetas por mesa** (medido contra `inventario` del espejo, `store_name` =
  Local / Deposito, sin Mayorista — **5.313 prendas vivas: 1.323 en el local y 3.990 en depósito,
  el 75%**):
  **$4.990 → 2.377** · **$12.990 → 630** · **$14.990 → 229** · **$11.990 → 211** · **$13.990 → 143** ·
  **$17.990 → 135** · **$10.990 → 63** · **$27.990 → 62** · **$8.990 → 60** · **$20.990 → 31** ·
  **$2.990 → 28** · **$1.990 → 9** · **$5.990 → 9** · **$43.990 → 3**.
  ⛔ Sin depósito: $3.990, $6.990 y $34.990 (todo lo suyo está en el local).
  ⚠️ El total del espejo (5.313) es 22 prendas menos que la foto congelada (5.335): la foto es del
  6-sep y el inventario es de hoy. La diferencia es venta, no un error.
- 🛑 🔑 **Y BRUNO FRENÓ LAS 3.990: «no voy a etiquetar algo que no sé si voy a vender, y luego
  desetiquetar»**. El plan es **progresivo**: identificar qué está y qué no en el local, analizar
  ventas sobre lo que no está, y llegar al lunes **con todos los productos etiquetados pero un
  PARCIAL** de cada uno; después se arma en el local y se sigue stockeando.
  ✅ **Paso 1, medido**: de los **351 modelos, 298 YA tienen algo en el local** y sólo **48 están en
  cero** — pero esos 48 son **2.885 prendas** (36 de lencería = 2.340, y 12 de short/bermuda = 545).
  Los 298 que sí están tienen además **1.105 en depósito**, que es refuerzo de talle y color.
  🔴 🔑 **Paso 2 ⛔ NO SE PUEDE: los 48 tienen `ventas90 = 0`, LOS 48.** Es el mismo cero por
  ocultamiento que ya estaba anotado (se apagaron online por no ser temporada y nunca estuvieron en
  el salón) ⇒ **un cero de algo que nadie pudo comprar ⛔ no dice nada del producto**, y ⛔ no se
  puede repartir el parcial por ventas. El reparto tiene que ser por **variedad de exhibición**, y
  la corrección la da el propio lunes.
  ✅ **Paso 3, el parcial dimensionado**: con **piso 3 por modelo + 15% del depósito** son
  **620 prendas** (453 de los 48 que no están + 167 de refuerzo de los 298 que sí) — el **16% del
  depósito**, y coincide con la expectativa ya medida de **500-700 prendas en los 6 días**.
  Alternativas: piso 3 + 10% → 427 · +20% → 810 · +25% → 1.016. Con el piso 3, **los 351 modelos
  están en la mesa desde el lunes**, que es lo que Bruno pidió.
- 🔴 🔑 **CORREGIDO POR BRUNO: «SÍ ESTUVIERON, EL AÑO PASADO»** — y el dato está. Los 48 vendieron
  **2.852 u** entre **ene-2025** (donde arranca el espejo de `ventas`) y hoy, **todo minorista,
  mayorista CERO**. Mi «no se puede analizar ventas» miraba **90 días**; la pregunta era por la
  **temporada anterior**. 📌 El producto en GN **ya es por color** (BOMBACHA BORA - NEGRO es su
  propio `product_id`) ⇒ el análisis por variante de color **sale solo**; el talle también está, en
  `venta_detalles.size_id`.
  🔑 **Su temporada es dic → marzo**: el mejor mes es **marzo-2026** en 38 de los 48 y
  **diciembre-2025** en el resto.
- 🔴 🔑 **Y EL HALLAZGO QUE DA VUELTA EL REPARTO: EL STOCK QUE QUEDA ES INVERSO A LO QUE VENDIÓ.**
  Los 15 con **más de 80** en depósito vendieron **35 u** en promedio; los 15 con **menos de 20**
  vendieron **70 u**. El stock alto **es el síntoma** de que no se vendía. ⇒ repartir el parcial
  **por stock estaba exactamente al revés**: le daba **37** etiquetas al CORPIÑO TAYRA NEGRO
  (58 vendidos en 20 meses, 245 parados) y **1** al CORPIÑO AYLA ZEBRA (126 vendidos, 1 parado).
  ✅ **Repartido por VENTA** —el mejor mes de cada uno, tope el depósito, piso 2— dan **504 prendas**
  de los 48. Suben: CORPIÑO TAYRA PRINT 8→27 · FADE #002 7→25 · CORPIÑO NYA ROSA 4→24 · BOMBACHA
  NYA ROSA 3→23 · BOMBACHA/CORPIÑO AYLA MARRÓN →22. Bajan: CORPIÑO TAYRA NEGRO 37→13 · BOMBACHA
  BORA NEGRO 24→13 · CORPIÑO TAYRA VIOLETA 23→9 · SHORT ARTEMIS 14→2 · BOMBACHA BORA CHERRY 16→2.
  ⚠️ El mejor mes se midió **a precio normal**, ⛔ no a precio de feria: sirve para el **reparto
  relativo entre colores**, ⛔ no para el volumen absoluto — por eso es un parcial y se repone.
- 📌 **Lo que está en el LOCAL ⛔ no se analiza** (Bruno): sigue en el local y **se etiqueta lo
  exhibido, el día antes**. ⇒ el trabajo de anticipación es **sólo el depósito**, y es este.
- ✅ **`scripts/feria-zattia-parcial.mjs`** — la cuenta entera, reproducible y sin escribir nada:
  los tres pasos (qué está en el local · qué vendió lo que no está, mirando la **temporada
  anterior** · cuántas etiquetas), con el reparto **por venta** y la comparación contra el
  **por stock** para que el error no se repita. `node scripts/feria-zattia-parcial.mjs`.
  Da hoy **502 prendas** para los 48 modelos que están en cero en el local.
- ✅ 🔑 **10-sep: LA IMPRESIÓN NO SE PIENSA POR PRODUCTO, SE PIENSA POR MESA — y eso la achica.**
  La etiqueta es sólo el precio ⇒ ⛔ no hay una etiqueta por modelo: hay **una por mesa, repetida
  N veces**, y en Etiquetas → **Libre** eso es un formulario con precio y copias. El script ahora
  lo saca solo (paso 4):
  **lo que baja del depósito son 4 tiradas · 502 etiquetas** — $4.990 → 380 · $12.990 → 70 ·
  $14.990 → 49 · $8.990 → 3 — porque los 48 modelos en cero **caen casi todos en la mesa de la
  lencería**; y **lo exhibido en el local son 17 tiradas · 1.309 etiquetas** ($8.990 → 250 ·
  $6.990 → 167 · $10.990 → 120 · $17.990 → 107 · $27.990 → 97 · $4.990 → 87 · $13.990 → 81 …).
  **Total 1.811.** ⛔ No depende de la campaña, ni de aplicar, ni de Tienda Nube: **se puede
  imprimir hoy.**
- 📌 **Estado al 10-sep, verificado por GET** (⛔ no cambió desde el cierre del 9): **286 confirmado
  (4.224 prendas · $36,8M) · 65 definido (1.111 · $14,2M) · 25 descartado** · **0 aplicados** ·
  cero sin precio. 🔴 **Los 65 sin confirmar son el 21% de la recaudación** y adentro están los
  que MÁS venden de toda la feria: CORSET FRANK (126 u, **v90 147**), CORSET NAPOLES (84, 118),
  CORSET ADAM (73, 79), CORSET FRANK SE (69, 53) — más de la mitad de esas prendas.
- ✅ 🔑 **10-sep: LA REGLA DE COMPRA CONTESTA SOLA LOS 65, Y CONTRA LA INTUICIÓN LOS DEJA TODOS
  ADENTRO.** Pasada la regla de Bruno —no liquidar sólo lo que vende bien **y** pudo recomprarse—
  sobre los 65 `definido`: **ninguno tuvo recompra en la ventana con fecha real** (6-jul → 31-ago;
  los 19 que aparecen ahí son **altas**, casi todas de 1 u del proveedor «ZATTIA», que son las
  baby tees y los tops nuevos). 🔴 **Los cuatro CORSET que más venden de toda la feria —FRANK
  v90 147 · NAPOLES 118 · ADAM 79 · FRANK SE 53, 352 prendas, $4.377.480— ⛔ no tienen NINGÚN
  ingreso registrado en 365 días** ⇒ **vender bien ⛔ no alcanza: sin repo, van.**
  📌 Con repo hay **9 modelos · 67 prendas · $594.330** (TOP MOVE · PANTALON BIZZ · CAMPERA LINES ·
  POLLERA DOT · TOP ZARA · TOP ZIAN · MINI BLUSH · TOP COWIN · MINI ARLET), y los 9 lo tienen
  **sólo en OC de la carga histórica** ⇒ ⛔ no se sabe cuándo. Es 1,6% de la feria.
  ⚠️ **Qué mide el instrumento**: «sin ingreso en 365 días» es **sin ingreso desde que existe el
  feed de recepciones**, que tiene 74 OC y sólo dos días de actividad. ⛔ No prueba que nunca se
  compró; prueba que **el sistema no lo vio**.
- 🔴 🔑 **10-sep: LA ORDEN DE ETIQUETADO ES DEL DÍA 1, Y ESO LE CAMBIA LA NATURALEZA.**
  Corrección de Bruno sobre mi primera versión: *«me parece un montón etiquetar 17 prendas, pq si no
  se vende 17, se tiene que reetiquetar o sacar la etiqueta; o sea, vamos reponiendo a demanda, pero
  necesitamos para el primer día»*. 🔑 **Una etiqueta de más ⛔ NO es trabajo de más: es trabajo que
  hay que DESHACER** —despegarla o reescribirla— sobre lo que no se vendió. Yo había dimensionado a
  **6 días** (700 prendas ⇒ 333 etiquetas, máximo 17 en un modelo) y la pregunta era **el primer**.
  ✅ **El día 1 está MEDIDO, ⛔ no estimado: el sale abrió el jueves 13-ago con 38 unidades** de
  estos mismos 351 modelos, contra **7 a 30 por día la semana previa** (6→12 ago). Con la
  expectativa de ~2,6× el ritmo del sale, **el día 1 de la feria son ~100 prendas**. 📌 El pico es
  el **día 2**: el sale hizo **58** el viernes.
  🔑 **Y a un día de horizonte la orden ⛔ NO la manda la demanda: la manda el SURTIDO.** 100 prendas
  repartidas entre 351 modelos dan **menos de una por modelo** ⇒ lo que decide es
  **la curva de talles que le falta a la mesa** (N por talle vivo, menos lo exhibido), y la demanda
  sólo pisa cuando es mayor. ✅ **49 modelos · 141 prendas · máximo 5 en un modelo** (era 17), el
  **4%** del depósito, y **todos en cero en el salón**. Tiradas: $4.990 → 91 · $12.990 → 35 ·
  $14.990 → 14 · $8.990 → 1. Curva de 2 → 287 · de 3 → 458.
  ✅ 🔑 **IMPRIMIR DE MÁS ES GRATIS, PEGAR DE MÁS NO**: la etiqueta es sólo el precio, sin nombre ni
  código ⇒ **la misma sirve para cualquier prenda de esa mesa**. Se imprime el doble (282) y se
  pegan 141: la reposición queda resuelta sin trabajo que deshacer.
  🔴 🔑 **LA UNIDAD DE LA MESA ES EL TALLE, ⛔ NO EL MODELO** — Bruno tuvo que corregirme **dos
  veces**: *«el mínimo tiene que ser 2 x talle, con un máximo de 3, pq si se vende a primera hora el
  día lunes, no tengo más para ese mismo lunes»*, y después *«lo que dije era por talle, no por
  modelo; **nunca puede ser 2 por modelo, sino me quedo sin nada**»*. **La clienta ⛔ no compra el
  modelo, compra SU TALLE**: un corpiño de 3 talles con 3 unidades tiene **un solo M**, y si el M se
  va a las 9 el modelo está agotado **para esa clienta** aunque queden dos prendas en la mesa.
  ⇒ ✅ **la banda es de 2 a 3 POR TALLE**, y la demanda sólo mueve adentro de ella:
  **53 modelos · 287 prendas** (un modelo de 3 talles baja 6, uno de 5 baja 10). Tiradas:
  $4.990 → 176 · $12.990 → 70 · $14.990 → 28 · $27.990 → 10 · $8.990 → 2 · $10.990 → 1.
  🔴 **LO QUE YA ESTÁ EN EL SALÓN ⛔ NO ES TRABAJO DE DEPÓSITO** (Bruno: *«campera rock ya hay allá,
  así que sacalo… campera lines sí hay en el local»*): completarle la curva desde el depósito a algo
  ya exhibido **era mío y ⛔ no lo pidió nadie** — se etiqueta **con lo exhibido, el día antes**.
  Salen las 3 CAMPERA ROCK, CAMPERA LINES y POLLERA DOT ⇒ **48 modelos · 274 prendas**
  ($4.990 → 176 · $12.990 → 70 · $14.990 → 28).
  ⚠️ 🔑 **POLLERA DOT sale por LISTA CON NOMBRE, ⛔ no por filtro**: el espejo dice **0 en el local**
  y Bruno dice *«tiene que haber normalmente»* ⇒ **la palabra de Bruno le gana al espejo**, y eso
  ⛔ no se puede deducir del dato.
- ✅ **LA ORDEN EN PDF, PARA ADMINISTRACIÓN** (Bruno: *«sólo lista como pdf común con precio y lista para
  imprimir, para dársela a administración y le digo: hacé esto»*):
  `node scripts/feria-zattia-etiquetado.mjs --json | node scripts/feria-zattia-etiquetado-pdf.mjs`
  → `~/Downloads/orden-etiquetado-feria.pdf`, 2 páginas. 🔑 **La regla ⛔ NO se copia en el PDF**:
  ese script sólo DIBUJA y la cuenta le llega por stdin ⇒ mover la banda o el horizonte se hace en
  un solo lugar.
- ✅ 🔑 **EL TEST QUE CAZA UN ESPEJO EQUIVOCADO: «está en CERO en el salón y sin embargo VENDIÓ».**
  Sobre los 351: da **7 modelos**, y el primero es **POLLERA DOT** (vendió 6, la última el 9-sep) — el
  mismo que cazó Bruno de memoria. Los otros 6 (BODY ORIANA, BODY SEOUL, BABY TEE UNI, BABY TEE
  CUPID, TOP OXY, JEAN MILLER) tienen **cero también en el depósito** ⇒ están **agotados**, ⛔ no
  mal ubicados. ✅ **De los 48 de la orden, NINGUNO vendió nada desde el 13-ago** ⇒ el cero de la
  lencería es real (está oculta), y la orden pasa el test.
  ⚠️ **Lo que el test ⛔ NO ve**: un modelo que esté en el salón, marcado en cero **y sin vender**.
  🔴 **CORPIÑO AYLA FUCSIA y CORPIÑO AYLA ZEBRA ⛔ no llegan al piso**: hay **1 sola unidad** de cada
  uno en el depósito.
  📌 El documento con la orden tocable (queda guardado lo marcado):
  https://claude.ai/code/artifact/ababe1d3-552a-4c74-afc0-3db2118a96d4
- ✅ **La escalera densa arregló sola casi todo lo que estaba mal**: los modelos a los que la feria
  les SUBÍA el precio respecto de la oferta que ya tienen puesta pasaron de **30 (343 prendas) a 8
  (190)**, y los que quedaban **por arriba del precio de lista pasaron de 1 a 0** (era ACCESORIO
  NRO 1 LILA, ahora en la mesa de $1.900). Los avisos medios bajaron de 30 a 8.
- 🔴 **Lo que queda es una decisión, ⛔ no un número: 8 modelos (190 prendas) a los que la mesa
  igual les sube el precio**, porque la mesa de abajo les queda debajo del costo. Los dos grandes
  son los que el sale ⛔ no movió: **BODY SWEET** (87 u, costo $12.403, hoy $10.990 → mesa $12.900,
  2 ventas en 90 días) y **BODY CLARI** (57 u, costo $14.205, hoy $10.990 → mesa $14.900, 1 venta).
  **Ya están abajo del costo y aun así no se mueven** ⇒ o se los deja subir, o se les pone precio a
  mano por debajo del costo. Bruno ya dijo que la pérdida no lo frena, pero `porEscalera` ⛔ no
  puede tomar esa decisión sola.
- 🔴 **Dos avisos ALTOS que «Confirmar todos» entierra**, los dos por caer con la mesa EXACTAMENTE
  en el costo (margen cero antes del descuento de caja): **BABY TEE IA** ($5.900, 4 u) y
  **REMERA OVERLAY** ($17.900, 15 u).
- ▶️ **El estado quedó en `definido`, ⛔ no en `confirmado`**: la segunda mirada sigue pendiente y es
  la que habilita «Escribir los precios en Gestión Nube». El orden del domingo 13 ⛔ no cambia.
- ▶️ 🔴 **El ORDEN de la feria, que es lo que sale caro al revés**: ocultar en Tienda Nube **primero**,
  aplicar los precios **después**. Aplicar antes deja el precio de feria publicado online, que es
  justo lo que la feria no quiere.
- 🔴 **La campaña «Sale Invierno Agosto 2026» venció el 2-sep y sigue puesta**: 259 de 262 productos
  con el promocional vivo en GN y los 262 ítems en `aplicado`. El aviso de vigencia vencida ⛔ no la
  cerró sola.
- 🔑 **GN ya devuelve el precio promocional por API** (`tiendanube_promotional_price` viene en
  `GET /productos/obtener`) y **el ETL no lo baja** (`scripts/sync-diario.js:96` mapea una lista
  fija) ⇒ el espejo muestra a los 262 productos **a precio de lista** y Análisis no puede ver qué
  está liquidado. Es la corrección de un dato viejo: cuando se armó la sección, GN no lo exponía.
- 🔑 **La etiqueta por prenda no sirve para una feria**: sale del precio de TN, o sea el de sale.

## 🆕 RENDIMIENTO DE META — 5-sep-2026 (dictado, y ya medido contra producción)

Dicho por Bruno en una vuelta, sobre `/meta-ads`. **El filtro de fecha anda bien y no se toca** —lo
dijo él—; lo que sigue es todo lo demás. ⚠️ A diferencia de los dictados anteriores, éste **ya está
medido**: los números salieron de ejercer prod, ⛔ no de leer el código.

> «Lo único que las decisiones automáticas o lo que hay que decidir no me está convenciendo,
> principalmente porque son 14 pendientes que alargan la lista y que no estoy ejecutando nada por
> ahí. Además considero que los análisis no los hace bien, como que no está bien armado, entonces
> son inconsistentes. Incluso pensaría en una sección exclusiva en el Side bar que sea decidir y que
> ahí se ponga todo. Luego obvio el no hay que hacer nada y toda la tipografía no está en infinitivo,
> osea no está bien armado. Después parece que están todas quemando plata, raro raro. Luego las
> celdas de hoy y ayer, la terminología que no es infinitiva no me convence. Incluso la vista no me
> convence como está, me gusta más la de totales por cuenta, no sé si se puede buscar que sea algo
> parecido, está mucho más clara. Incluso más ordenado, y la vista está menos alargada
> horizontalmente. Me parece que la mejor idea sería que una pauta se vea la información súper
> importante ahí. Y si tocás en cualquier lado de la fila, que abra la información adicional
> importante para tomar decisiones.»
>
> «De todas maneras, primordialmente en la vista rendimiento tiene que estar los rendimientos más
> arriba. Está muy muy rara la vista de esta sección, muy larga, comprimida toda hacia la de
> veredicto, no me convence nada.»

**Las tres quejas son la misma falla con tres caras: la pantalla afirma más de lo que sabe.**

### Lo medido el 5-sep (BDI, ventana 29-ago→4-sep)

1. 🔴 **8 de las 11 pautas que entregan salen «pausar», y no porque estén mal: el corte ⛔ no mira
   cuántas compras lo sostienen.** `veredictoDeCelda` clasifica `alto` con `gasto/compras > techo` a
   **1,0× exacto, sin tolerancia y sin piso de observaciones**. Cuatro de esas ocho se apoyan en
   **2 o 3 compras**. Con el error relativo de una tasa (~1/√n) quedan **2**.
   ⚠️ Y el bloque de aprendizaje **ya lo decía en la misma fila**: *«2 de 50 compras/semana»*. La
   pantalla dice al mismo tiempo «no alcanza para juzgarla» y «pausala».

2. 🔴 **El techo de BDI está 13% bajo, y la causa ⛔ NO es la que estaba anotada.**
   📊 `scripts/medir-economia-bdi.mjs --dias 30`, 375 ventas online, dos caminos independientes:
   **las unidades por pedido están BIEN** (1,94 por `items_sold` y 1,94 por `venta_detalles`, contra
   1,93 cargadas) ⇒ ⛔ **cae la nota de «2,2-2,3»: corregir ese campo no arreglaba nada.**
   El tilde real es **`usaRaspa: 100`** —la ficha asume que el 100% de los compradores usa la
   raspadita y descuenta 16,9%; la caja descuenta **9,3%**—. Con `usaRaspa: 25` el ticket del modelo
   da $25.737 contra $25.546 medidos (**0,7%**) ⇒ techo **$6.668 → $7.558**.
   ⚠️ **Zattia sin medir**: el script está clavado a la base de BDI, y `ZATTIA_SUPABASE_KEY` ⛔ no
   tiene permiso sobre `ventas`. Su ficha ya tiene `usaRaspa: 0`, así que ahí el sospechoso sí son
   las unidades (1,57 cargadas contra 1,03 de una medición vieja).

3. 🔴 **Los pendientes son 19, no 14, y ~2 sirven.** Cruzados uno por uno contra el estado de hoy:
   **7 apuntan a algo ya apagado** (gasto $0 en la ventana) · 1 a un objeto que no está en la
   ventana · **1 contradice a la tabla de abajo en la misma pantalla** (`GIRLHOOD FRIO`: el hallazgo
   dice *«156% del techo, pausar»* y la fila dice **`Rinde` · 58%**; el hallazgo es del **26-ago,
   diez días viejo**) · 4 son `atribucion-tardia`, que ⛔ no es una decisión sino un dato · 1 es
   `fatiga` por frecuencia 1,4 contra un máximo de 1,3.
   🔑 **Las 11 reglas corrieron el 4-sep 14:34Z y 13 de los 19 tienen `fecha` anterior**: la regla ya
   dejó de detectarlos y **nadie los cerró**. ⇒ ⛔ no falta un detector de obsolescencia: falta
   **cerrar lo que la corrida de hoy no revalidó**.
   ⚠️ La lista ⛔ **no está larga porque falte una pantalla: está larga porque el 89% no debería
   estar ahí.** El 30-ago se la subió de lugar por el mismo síntoma; eso trató la posición, ⛔ no la
   causa.

4. 🔴 **Dos varas con el mismo nombre en la misma pantalla**: la tarjeta de KPI calcula el `% del
   techo` con **pedidos reales de Tienda Nube** y cada fila con **compras de Meta**.
   🔑 **Y lo corrigió Bruno**: *«los pedidos reales pueden ser de otros canales que no sean Meta, por
   ese motivo, solo tiene que ser META»*. Tiene razón — los 113 pedidos incluyen orgánico, mail y
   directo, así que 84/113 ⛔ **no** es «lo que Meta no ve». ⇒ el veredicto se juzga **sólo con
   Meta**, y los pedidos reales quedan rotulados como referencia de negocio, **nunca adentro del
   veredicto**.

5. **La vista pone el rendimiento sexto**: hay ≈1.080 px de cosas arriba de la tabla, y la tabla
   tiene **11 columnas sin ancho declarado**, con la de veredicto llevando pill + una frase de hasta
   diez palabras + badges en 320 px. 🔑 Y en **7 de las 8 ramas** el `porque[0]` es la versión en
   prosa de columnas que están dibujadas al lado: **el mismo dato dos veces.**

### Lo que Bruno decidió (5-sep)

- **El techo**: medir antes de corregir. Ya está medido para BDI y fue la decisión correcta, porque
  la causa era otra. Falta Zattia.
- **Con qué se juzga**: **sólo Meta** (ver punto 4).
- **Dónde se decide**: **«Decidir» como una entrada más dentro del menú de Meta**, ⛔ no una sección
  propia del sidebar. En Rendimiento queda un solo renglón. El badge del sidebar, Inicio y el mail
  de las 07:50 siguen empujando igual.
- **Orden**: una sola tanda, números y vista al mismo deploy.

### 🏁 HECHO Y VERIFICADO EJERCIENDO PRODUCCIÓN (5-sep, mismo día)

Commit `35127c8`, CI verde, **el relato entero con archivo:línea en `docs/secciones/meta-ads.md`**.
Medido contra prod DESPUÉS de deployar, ⛔ no leyendo un verde de Actions:

| | antes | después |
|---|---|---|
| pautas que dicen «pausar» (techo actual $6.668) | **8** | **5** |
| …y con el techo medido ($7.558) | 8 | **2** |
| hallazgos abiertos | **19** | **6** |
| el contador del renglón, del badge y del mail | 19 | **4** |

El asunto del mail de las 07:50 ya salió con el texto nuevo: *«Pauta · 4 para decidir, 4 para
pausar»*. La ventana de juicio se estiró sola en 4 pautas (dos a 14 días, dos a 30).

▶️ **Las dos manos de Bruno, y la primera es la que falta para llegar a 2:**
1. 🔴 **Poner `usaRaspa` en ~25 en la ficha de BDI** (`/meta-ads/rentabilidad`). Hoy está en **100**
   —el modelo asume que el 100% de los compradores usa la raspadita— y con eso descuenta 16,9%
   cuando la caja descuenta **9,3%**. El techo pasa de **$6.668 a $7.558**. ⚠️ Después de guardarla
   hay que **releer `FILA_BDI` en `tests/meta-ads-rentabilidad.test.ts`**: es una copia de producción
   y va a afirmar algo falso **quedándose verde**.
2. **Caminar la pantalla**: que la tabla esté arriba, que la fila se abra tocando cualquier lado, y
   que el número de «Decidir» del menú coincida con el del mail de mañana.

▶️ **Y lo que ⛔ no se pudo medir**: las fichas de **Zattia** y **Stunned**. `medir-economia-bdi.mjs`
está clavado a la base de BDI y `ZATTIA_SUPABASE_KEY` ⛔ no tiene permiso sobre `ventas` — hace falta
la service key de Zattia o entrar por `DATABASE_URL_ZATTIA` con `pg`. Stunned ⛔ no tiene ficha: sus
2 pautas salen «Sin techo», que es correcto.

Este renglón se borra cuando Bruno lo camine.

---

## 🆕 LOS SIETE DE BRUNO — 3-sep-2026 (dictado, sin analizar todavía)

Dicho por él, textual, en una sola vuelta. ⛔ Nada de acá está verificado aún: se anota primero,
se mide después. Cada punto se borra de esta lista cuando esté hecho y **caminado por Bruno**.

1. 🏁 **RENDIMIENTO — hecho el 3-sep. Era UNA causa y explicaba los dos síntomas.**
   > «En rendimiento cambio la fecha y no anda el filtro de hoy, ni de hoy y ayer. Por eso no la
   > uso. Tampoco actualiza ninguna info.»

   El día en curso lo trae el **parte**, que es de **una cuenta publicitaria sola**, y el eje
   arranca en «Todas» sin autoseleccionar ⇒ entrando por el menú **el parte no se pedía nunca** y
   las tres ventanas dibujaban la misma foto de 7 días, sin que saliera un fetch. El relato entero
   —y el cartel que mentía diciendo «Meta no contestó»— en `docs/secciones/meta-ads.md`.
   ⚠️ **Es la SEGUNDA vez que lo reporta**: el 30-ago se arregló otra cosa real y quedó sin caminar.
   🏁 **Esta vez SÍ se caminó, en producción**: con «Todas (3)» y Zattia, «Hoy» ahora abre la banda
   del día en curso y el Gasto pasa de $ 66.751 (7 días) a $ 1.756 (hoy, en vivo).

2. 🏁/▶️ **AGENDA — el SECTOR ya está; los títulos los tenés que elegir vos.**
   > «La agenda - los títulos están medios extraños. Además, en las reuniones no dice qué sector, y
   > tengo 3 sectores que dirijo.»

   🏁 El sector ya se dibuja en cada renglón del Hoy —**caminado en producción**: dice «Local» y
   «Bruno Arevalo y Camila Budek»— (el dato viajaba y era la única pantalla que no lo mostraba). ⚠️ Una reunión dirigida **por nombre** no tiene sector: eso se cambia cargando.
   ▶️ **Los títulos son DATA, ⛔ no código** — se editan en `/agenda/eventos`. Falta que Bruno diga
   cuáles. Ver `docs/secciones/agenda.md` § 3-sep.

3. 🏁/▶️ **PERMISOS — la respuesta a la pregunta es NO, y por eso hubo que cambiar el motor.**
   > «¿Puede ser que yo tenga permisos del local? Porque veo lo de descripciones, y preparar
   > pedidos. El usuario de Bruno. Si es así, córramelos. Y también a Darío.»

   🔑 **Medido el padrón (16 usuarios): Bruno y Darío tienen `funcion: ['direccion']` y CERO
   tildes.** ⛔ No hay ningún rol de local asignado de más: los ven por ser **admin**, que en
   `puedeVer` ganaba arriba de todo.
   🔴 **Y por eso «córramelas» ⛔ no se podía hacer**: la única forma de sacarle una sección a un
   administrador era **destildarle «Administrador»** —la ficha lo decía con todas las letras—, y
   eso le saca además Config, el memo, el calendario y la liquidación. La matriz de permisos ni
   siquiera se le dibujaba.
   🏁 **Hecho el 3-sep**: la **excepción ahora le gana al admin** (paso 1 de `puedeVer`) y la ficha
   de un administrador dibuja la matriz. Destildar una sección le escribe la excepción, por marca;
   volver a tildarla la saca. ⛔ **Config no se puede cerrar sobre uno mismo**: `usuarios` no pasa
   por `puedeVer` ni está en la matriz, y hay un test que se pone rojo si eso cambia.
   ⚠️ Lo que **no** cambia son los ~160 `esAdmin(perfil) || …` de `api/`: casi todos contestan
   «¿puede escribir?», no «¿la ve?». La sección desaparece del menú y el guard rebota; que un
   handler suelto conteste el dato ⛔ no es un agujero — es el dueño sacándose una entrada de la
   vista, no un candado.
   ▶️ **Falta que Bruno destilde las que no quiere ver** —en Config, su ficha, «Sacarle secciones
   del menú»—, o que diga cuáles y las escribo yo. ⚠️ Lo pidió **también para Darío**, y eso ⛔ no
   lo toco sin que lo diga de nuevo: son dos nombres que él nombró en una sola frase y «descripciones»
   puede ser **Descripción y medidas** (`gen-desc`) o **Fotos y descripciones** (`marketing`).

4. 🏁 **AGENDA — hecho el 3-sep. Eran dos defectos apilados, y uno era de DATO.**
   > «En la [pregunta] de cómo entró la orden, voy a agenda hoy, y no puedo ver lo de la selección
   > que hice o la decisión que tomé. O sea no aparece la opción apretada como sí aparece la tilde
   > en las OCs.»

   La tarjeta unificada dibujaba los botones **sin mirar el tilde** (el renglón suelto sí lo
   miraba, por eso se veía bien con una sola orden), y abajo **la puerta elegida no se guardaba en
   ningún lado**. Ahora el renglón contestado muestra ✓ y «Entró por …».
   ⛔ **Sin caminar todavía**: ese día no había ninguna pregunta en el Hoy. Se mira cuando entre una OC.
   El relato, en `docs/secciones/agenda.md` § 3-sep.

5. 🏁/▶️ **FOTOS — el talle de la modelo ya se anota y ya se ve en la ficha. Publicarlo choca con
   una regla tuya, y esa decisión falta.**
   > «Dinámica sesión de fotos con talle de la modelo - para luego cargar el talle que usa la
   > modelo en la descripción del producto.»

   🏁 **La sesión lo guarda** (nombre · talle · altura) y **«Descripción y medidas» lo muestra** en
   la ficha del producto: *«La modelo mide 1,70 m y usa talle S»*. El relato entero en
   `docs/secciones/sesionfotos.md` § La modelo y su talle.
   🔑 **Es de la SESIÓN y no de la prenda** (elegido por Bruno): una sesión es una modelo, y su
   talle es el mismo en las 30 prendas. **El talle es lo obligatorio, el nombre no.**
   🔴 **El puente con la descripción es el SKU, ⛔ no el id**: la sesión usa el catálogo de Gestión
   Nube y la ficha el de TiendaNube. 📌 **Medido: 79 de 79 SKU cruzan** (en BDI; en Zattia la tabla
   tiene RLS y no se pudo medir desde afuera).
   ▶️ 🔴 **Falta UNA decisión tuya: cómo se publica.** El párrafo ⛔ **no puede nombrar un talle** —lo
   rechaza `validarParrafo` desde el 27-ago, por decisión tuya: *«eso lo dicen el selector y la
   tabla»*—. El de la modelo ⛔ no es ese talle y ⛔ no se desactualiza nunca, así que tiene que salir
   como **un bloque compuesto**, al lado de los bullets y de la tabla. **Hoy se ve en el monitor y
   ⛔ no sale a la tienda.** Falta decir: ¿va en todas las fichas?, ¿con qué palabras?
   ▶️ Y falta **caminarlo**: cargar una modelo en una sesión real y ver la frase en la ficha.

6. 🏁/▶️ **MODEL MANAGEMENT — la FICHA ya está y la base también; falta CAMINARLA.**
   > «Sección en monitor de Model Management - fichas - Booker - Portafolio con mejores fotos de la
   > modelo con nosotros. Principalmente para análisis. También que se pueda agregar ideas,
   > modelos, como si fuese una base de datos.»

   🏁 **Sección nueva «Modelos», en Marketing** (3-sep): el padrón y la ficha de cada una —quién es,
   Instagram y teléfono, **agencia y booker** (las tres vacías dicen «Directa», que acá es lo más
   común), talle, altura y medidas, para qué marcas trabaja y notas—. El relato entero en
   `docs/secciones/modelos.md`.
   🔑 **Su primer lector ⛔ no es su pantalla: es la sesión de fotos.** El talle y la altura de la
   sesión (el punto 5) se tipeaban a mano porque este padrón no existía; ahora los dos normalizan
   con **la misma función**, que se mudó a `lib/modelos/core.core.js`. Eso decide texto que sale a
   la ficha de un producto que lee una clienta.
   ⛔ **La pantalla no dibuja ninguna columna medida** —cuántas sesiones hizo, qué vendió lo que
   fotografió—: 📌 medido el 3-sep, **0 de 11 sesiones de BDI tienen modelo anotada** (y en Zattia la
   tabla ⛔ no se pudo leer desde afuera, así que ese 0 es «no se pudo medir»). Con 0 enganchadas
   esas columnas dirían **0 para todas**, y un cero afirma.
   ✅ **La migración ya corrió en BDI** y está verificada por otro camino que el que la corrió
   (PostgREST contesta `200 []`, y una tabla inventada al lado contesta 404).
   🏁 **Y la sesión de fotos ya ELIGE la modelo del padrón** (3-sep, más tarde): un selector «Del
   padrón» arriba de los tres campos que trae su talle y su altura y —lo que importa— **deja el
   `id` de la ficha adentro de la sesión**. Era el enganche que faltaba: tipear el nombre ⛔ no cruza
   nada, y sin cruce el análisis que pediste ⛔ no se puede calcular. Los tres campos siguen libres,
   así que la modelo sin ficha se anota como siempre.
   🔴 **Lo que hubo que abrir para eso**: quien carga una sesión ⛔ puede no tener Modelos tildada
   —justo desde el punto 3, que permite sacar secciones de a una— y el selector no podía empezar a
   contestar 403. La lista corta (`?modo=elegibles`) la puede pedir también `sesion-fotos`, y por
   ahí viajan **cuatro campos**: id, nombre, talle y altura. El teléfono, el mail, la agencia, la
   nota y **escribir** siguen pidiendo Modelos.
   ▶️ **Falta caminarla**: cargar una modelo de verdad, elegirla en una sesión y ver que quede. ⚠️ El
   padrón está vacío, así que el selector ⛔ no se dibujó nunca con una ficha adentro.
   ▶️ **Lo que sigue, en este orden**: (1) **el análisis** («principalmente para análisis»): cuántas
   sesiones hizo cada una y cómo vendió lo que fotografió —ahora ya hay con qué cruzarlo, pero
   ⚠️ **la primera columna medida ⛔ no se dibuja hasta que haya sesiones enganchadas**: hoy serían 0
   para todas, y un cero afirma—; (2) **el portafolio** de fotos.
   ▶️ ⚠️ **Y dos preguntas tuyas**: las **«ideas»** del dictado, ¿son de producción, de looks o de
   modelos a contactar? —hoy entran en la nota de cada ficha—; y el **cachet**, que ⛔ no puse: lo
   vería todo el que ve la sección, y ése no es el permiso de la liquidación.

7. 🏁 **ANÁLISIS — hecho el 3-sep: el buscador miraba SÓLO el nombre.**
   > «Sumar en análisis, también poder buscar por código de proveedor las ventas de producto.»
   > Aclarado con una captura: *«sería buscar 5000 y que aparezca ese top skyler»* — o sea el
   > **SKU**, que la fila ya dibujaba (`5000 · Contamina`) y no se podía buscar.

   «Por producto» ahora matchea **nombre · SKU · proveedor**, y «Por variante» suma **SKU y código
   de barras**. Sin migración ni endpoint: los tres campos ya viajaban en el payload del ETL.
   🏁 **Caminado en producción**: buscar `5000` devuelve el TOP SKYLER, 1 producto.
   ⚠️ Si algún código no aparece, es el campo **«Código»** de Gestión Nube —otro campo, que hoy ⛔ no
   se guarda: en BDI el sync lo descarta— y eso sí es una migración en las dos bases.

---

## 🆕 EL OCTAVO: LA SESIÓN DE FOTOS COMO **EVENTO** — 3-sep-2026 (dictado, sin analizar todavía)

Textual, en una sola vuelta, y ⛔ **nada de acá está diseñado**: se anota primero, se mide después.
Lo abrió él mismo diciendo por qué: *«estoy teniendo inconvenientes con el armado de los mismos, las
solicitudes de productos y demás»* ⇒ el pedido sale de **usarla**, ⛔ no de leer el código.

> «Sobre sesión de fotos me gustaría profundizar un poco más. Sesión de fotos es un evento que viene
> de tres motivos. Por eso mismo necesito que el evento opción de fotos también despliegue una
> disparada de tareas a cada persona con la sesión de fotos, siendo un evento con **modelo, fecha,
> hora, tiempo aproximado**. Dentro de la misma además tiene que poder solicitarse **varias
> solicitudes de productos**. Además la solicitud de fotos tiene que poder pedirse productos **de
> stock o de ingresos directamente, sacar info de la OC**. Eso tiene que generar un **banco de
> productos de la sesión**, donde se realiza una **clasificación rápida** y se generan **outfits
> digitales** con distintos productos de arriba y abajo. Si el producto de la OC que ingresó no
> alcanza para armar outfits, se procede a pedir una **solicitud a local**, es decir, el armado de
> outfits se realiza desde ahí, entonces va más ordenado.»

🔑 **El pedido de fondo da vuelta el objeto**: hoy **la solicitud ES la sesión** (1 a 1), y esto pide
que la **SESIÓN sea el padre** —un evento con modelo, fecha, hora y duración— y que las solicitudes
de productos sean **hijas** (varias). Todo lo demás cuelga de ese cambio.

📌 **Primera lectura, medida contra el código el 3-sep — la mitad ya existe:**

| lo que pide | cómo está hoy |
|---|---|
| «viene de tres motivos» | ✅ **ya es un eje**: `disparador` = faltante · campaña · ingreso (`lib/solicitudes/disparador.ts`) ▶️ pero **ninguna puerta lo llena sola**: hoy se elige a mano |
| «que despliegue una disparada de tareas a cada persona» | ✅ **ya existe y está vivo**: los **9 moldes** de la plantilla `sesion-fotos` (Agenda), que se siembran solos cuando alguien crea la sesión, **cada paso con su dueña** y su offset (la modelo −2, las referencias −1, el día 0). Cargados y ejercidos el 29-ago |
| «con modelo» | ✅ **desde hoy**, y ahora sale del padrón (punto 6) |
| «fecha, **hora, tiempo aproximado**» | 🔴 **fecha sí; hora y duración ⛔ NO EXISTEN** en la solicitud |
| «varias solicitudes de productos dentro de la misma» | 🔴 **⛔ no se puede**: la sesión **es** la solicitud. Es el cambio estructural del pedido ⚠️ y ya hay un caso real que lo pide desde otro lado: una sesión que fotografía Zattia y Stunned **son dos solicitudes** |
| «pedir de stock **o de ingresos, sacando info de la OC**» | 🔴 el borrador se arma sólo sobre el **stock** (`allProductos`/`allVariantes`); de la OC o de la recepción ⛔ nada |
| «banco de productos + clasificación rápida + **outfits digitales** arriba/abajo» | 🔴 **⛔ no existe**. Lo único cercano es **físico**: las bolsas numeradas, donde cada bolsa **es un look** (`lib/sesionfotos/tipos.ts:70`) |
| «si la OC no alcanza, pedir una **solicitud a local** desde ahí» | ⚠️ el sistema ya decide **depósito o local por ítem** (`origen`), pero ⛔ no como «completar un outfit» |

### ✅ Las cinco decisiones, CONTESTADAS por Bruno el 3-sep — y el plan que salió

1. **El evento se crea primero**, con modelo, fecha, hora y duración; las solicitudes se le cuelgan
   después y pueden ser **varias**.
2. **Un outfit es arriba + abajo, o una prenda entera** (un vestido o un mono ocupa las dos ranuras).
3. **La clasificación se propone sola y se corrige** a mano.
4. 🔑 **El outfit ES la bolsa que YA EXISTE** (`ItemSolicitud.bolsa`), ⛔ no un objeto nuevo. Está
   construido entero —selector por ítem, `bolsasDe`, etiqueta «BOLSA n/N» y reporte A4 de armado— y
   📌 **nunca se usó: 0 ítems con bolsa en las dos marcas**.
5. **Del ingreso alcanza la OC ya recibida** — que además es lo único que existe: la tabla se llena
   con el evento `oc.confirmada` y ⛔ **no hay ninguna OC «en camino»** en el monitor.

▶️ **La sexta la salteó dos veces, y dijo por qué**: *«el motor es de administración, habría que ver
si no hay problema»*. **Tiene razón y por eso se ENVUELVE, ⛔ no se reemplaza**: la pantalla de la
solicitud queda intacta —retiro, escaneo, devolución y anulación contra Gestión Nube— y la sesión
nace arriba. 🔑 **Medido, ⛔ no supuesto**: la vista `/solicitudes` es de área **local** y la función
`administracion` la tiene entre sus keys; pero el bloque de siembra ya exige `kind === 'sesionfotos'`
(`api/_solicitudes.js:149`) ⇒ **una solicitud interna nunca entra ahí**, ni hoy ni después. Y el
motor (`useHistorialSolicitudes` + `preset.ts`) ⛔ no se toca: carga **por `kind`**, y el evento es un
`kind` nuevo que Administración no pide nunca.

### 🔑 El modelo de datos — SIN una sola migración

**El evento es un `kind` nuevo (`sesion-evento`) en la MISMA tabla `solicitudes`**, ⛔ no una tabla
aparte. Verificado: `sql/migrate-solicitudes.sql` **⛔ no tiene CHECK** sobre `kind` ni sobre `estado`
—la única lista blanca vive en `KINDS` de `api/_solicitudes.js`— ⇒ sumar un valor es **una línea**.
`filaDe` sirve tal cual (el evento también tiene `fecha`, `estado`, `creado`, `creadoPor`), reusa
`leerCajon`/`diffSolicitudes` y ⛔ **no gasta una de las 12 funciones de Vercel**.

- `SesionEvento`: `id · fecha · hora? · duracionMin? · modelo?` (el MISMO `ModeloSesion`) `·
  disparador? · descripcion · estado · banco?[] · creado · creadoPor`.
- `Solicitud` suma **un solo campo**: `eventoId?: string` (jsonb ⇒ sin migración). Ausente = solicitud
  suelta, que es como quedan las existentes: siguen abriéndose igual, **sin backfill**.
- 🔑 **El outfit se numera por EVENTO y al pedir viaja a `item.bolsa`** ⇒ la etiqueta y el reporte de
  armado siguen andando sin tocarlos, y **un outfit puede cruzar dos solicitudes** —el top del
  depósito y el jean del local—, que es exactamente el caso que Bruno describe.

### 🏁 Lo que había que MEDIR: medido el 4-sep, y contestó que NO

La pregunta era si el `category` de Gestión Nube cruza con `FAMILIAS`. **No cruza, y por dos
motivos distintos** (medido contra las dos bases por `pg` directo):

| | BDI | Zattia |
|---|---|---|
| productos con stock | 223 | 501 |
| cruzan con una familia | **0 (0%)** | **36 (7,2%)** |
| sin categoría en GN | 1 | **400 (79,8%)** |

- 🔴 **La categoría de GN dejó de llenarse.** De lo dado de alta **desde julio-2026** con stock en
  Zattia, **el 100% viene sin categoría** (35/35 · 50/50 · 67/67). Y una sesión de fotos pide,
  justamente, **lo que acaba de entrar** ⇒ la categoría ⛔ no puede contestar, ni siquiera bien
  llenada.
- 🔴 **En BDI el 0% ⛔ no es un defecto: no vende ropa.** Fundas, cables y vidrios templados.
- 🔑 **En GN `category` ⛔ no es una categoría: es una lista separada por comas** (`'NEW IN, DAY,
  DENIM'`). Medirla como cadena sola daba «casi nada cruza»; partida, Zattia pasa de 9,9% a 24,1%.

⇒ 🔑 **la zona sale del NOMBRE**, que está siempre: `TOP` 131 · `SHORT` 40 · `MINI` 34 · `BABY` 31…
La categoría queda de segunda fuente. ⛔ **La salida por SKU contra TiendaNube ⛔ no hacía falta.**
El relato entero, en `docs/secciones/sesionfotos.md` § Los OUTFITS.

### Las cinco fases, por valor entregado

1. 🏁 **HECHA el 4-sep-2026 — clasificación + el aviso «al outfit 3 le falta el abajo», sobre las
   bolsas que ya existían.** Sin evento, sin tabla, sin banco y **sin migración**: vive adentro de
   la solicitud de hoy. `lib/sesionfotos/outfits.ts` (`zonaSugerida` desde el NOMBRE,
   `esPrendaDeOutfit`, `aplicaOutfits`, `alertasDe`, `sinZona`), `Solicitud.clasifOutfits?`,
   `conZona` en `core.ts` y el bloque «Bolsas» de la pantalla extendido con el selector por ítem.
   ✅ 31 tests nuevos · suite entera verde (6.961) · `tsc` y `eslint` limpios.
   📌 **Caminado contra el catálogo real**: Zattia **481 de 501 con zona (96,0%)** —322 arriba, 137
   abajo, 22 enteras—; de las 20 restantes **19 son accesorios reconocidos** y **una sola prenda**
   queda sin decir (`FADE #002`). BDI: **223 sin zona, y está bien**.
   🔴 **Dos cosas las cazó la caminata y el test ⛔ no podía**: (a) «no es una prenda» y «no sé qué
   es» eran el mismo `null` ⇒ la pantalla iba a pedir clasificar **un cinto**; (b) en BDI
   `fueraDeAlcance` ⛔ no alcanza para una funda ⇒ una sesión de BDI mostraba **223 pendientes**.
   Por eso existe `aplicaOutfits`: **sin una sola prenda, el módulo entero se calla**.
   🏁 **CAMINADA EN PROD el 6-sep-2026** (Zattia y BDI, la ficha tiene el detalle): la zona
   propuesta salió bien en las dos prendas (TOP → Arriba, SHORT → Abajo), el bloque «Bolsas» avisó
   **«Al outfit 1 le falta el abajo»**, se apagó al sumar el abajo, **volvió** al corregir la zona a
   mano, y la corrección **sobrevivió a salir y volver a entrar**. En **BDI** ⛔ no apareció ni el
   selector, ni bolsas, ni aviso, ni «faltan clasificar».
2. 🏁 **HECHA el 4-sep-2026 — el evento como padre, con modelo, fecha, hora y duración.**
   `kind` nuevo `sesion-evento` en la MISMA tabla, `lib/sesionfotos/evento.ts`, `procesarDraft`
   acepta `eventoId`, bloque «Sesiones planificadas» arriba del historial y `FichaModelo` mudada a
   su archivo, genérica y **reusada tal cual** por el evento.
   ✅ 38 tests nuevos · suite entera verde (6.999) · `tsc` y `eslint` limpios · 2 mutantes muertos.
   📌 **Verificado contra las dos bases, ⛔ no contra el `.sql`**: el único constraint de
   `solicitudes` es `PRIMARY KEY (store, id)` — ⛔ ni un CHECK sobre `kind` ni sobre `estado` ⇒
   ⛔ **sin migración**. Las 35 solicitudes existentes (BDI 11 · Zattia 18 + 6 internas) quedan
   **sueltas, sin backfill**.
   🔴 **El kind nuevo abrió un agujero que ningún test del núcleo veía**: el GET de
   `api/_solicitudes.js` **siempre aceptó omitir el `kind`** y eso significaba «todo el historial»
   ⇒ pasaba a devolver eventos mezclados con solicitudes, y un evento ⛔ no tiene `items`. Medido:
   ⛔ ningún llamador lo omite hoy, **y por eso se arregló ahora** — sin `kind` filtra por los dos
   de siempre. Con test y los dos mutantes muertos.
   ⚠️ Editar el día del evento ⛔ no reescribe las hijas ya creadas: se corrige a mano, y la
   pantalla lo dice. Y un evento con hijas ⛔ no se elimina de un click.
   ⛔ **No siembra en la Agenda** (Fase 5) y ⛔ **no toca el motor de Administración**: el bloque lo
   dibuja sólo Sesión de fotos. Las dos cosas, con test.
   🏁 **CAMINADA EN PROD el 6-sep-2026**, los seis pasos: sin hora dice sólo la fecha (⛔ ningún
   «00:00»); con hora y duración dice «15:30 a 17:00 (1 h 30)»; la modelo quedó tras salir y volver;
   «+ Pedir productos» dejó la solicitud colgada (chip «2 pedidos» + rótulo «de una sesión»); la
   segunda solicitud de la misma sesión anduvo; y eliminar una sesión con pedidos **frenó**
   («tiene 2 solicitudes de productos colgadas»). En **Solicitudes internas** ⛔ no aparece nada.
   🔴 **Lo que ⛔ no se pudo caminar**: elegir la modelo **del padrón** — en Zattia ⛔ no hay ni una
   ficha cargada en Modelos, así que se anotó a mano.
3. 🏁 **HECHA el 4-sep-2026 — el banco y los outfits ANTES de pedir.** `lib/sesionfotos/banco.ts`
   + `components/sesionfotos/BancoSesion.tsx`, colgado del evento (`SesionEvento.banco`, jsonb ⇒
   ⛔ sin migración). El orden pasó de *busco → pido → después agrupo* a **candidatos → outfits →
   pido**, y cada pieza sale con su número de outfit puesto.
   ✅ 23 tests nuevos · suite entera verde (7.051) · `tsc` y `eslint` limpios.
   🔑 **El adaptador, ⛔ no la copia**: `outfits.ts` pasó a hablar `PrendaClasificable` y el banco
   mapea su `outfit` al `bolsa` de esa forma **en una línea**. Las reglas de zona y de aviso son
   **las mismas** que las de la solicitud, escritas una vez.
   🔑 **Un outfit puede CRUZAR dos solicitudes** —el top del depósito y el jean del local son el
   mismo outfit 5—, que es el caso que Bruno describió. Con test.
   🔴 **Invariante: ninguna pieza pedida se pierde.** Se reusa `expandirProductos`, que deja afuera
   lo que se quedó sin stock ⇒ ese control se hereda gratis y lo que ⛔ no entró **se nombra con su
   causa** y queda en el banco. ⛔ Nunca desaparece en silencio.
   🔴 **La secuencia de pedir vive en el NÚCLEO** (`pedidoDesdeBanco`), ⛔ no en la pantalla: estaba
   escrita en las dos y **un test que prueba una copia deja de vigilar** el día que el botón cambia.
   🔴 Lo ya pedido ⛔ no se saca del banco ni se vuelve a pedir (serían **dos ventas en GN por una
   prenda sola**) · un candidato sin outfit deja el ítem **sin bolsa**, ⛔ no se le inventa número ·
   al pedir se guardan las dos puntas **en orden**: primero la solicitud, después el banco.
   🏁 **CAMINADA EN PROD el 6-sep-2026**, los seis pasos: las dos prendas cayeron en «Sin repartir»
   con su zona, el aviso del outfit se prendió y se apagó, «Pedir al depósito» y «Pedir al local»
   nacieron **dos solicitudes con el MISMO outfit 1** (verificado en la base: las dos hijas con
   `bolsa: 1`), la ya pedida ⛔ no se puede sacar del banco (**se le va el `×`**) y todo sobrevivió
   a salir y volver.
   🔴 🔑 **Y la caminata destapó una honestidad que falta**: apretar **«Pedir al depósito»** sobre una
   prenda con 0 en depósito crea la solicitud **al LOCAL** —el fallback por stock, que está bien— y
   **⛔ nada lo dice en el momento**: se ve recién al abrir la solicitud, que dice «Retirar de Local».
   📌 **Y ⛔ no es un caso raro: de las 1.011 variantes de Zattia con stock, 738 (73%) tienen 0 en
   depósito.** El botón acierta 1 de cada 4 veces.
4. 🏁 **HECHA el 4-sep-2026 — la orden recibida entra al banco.** `lib/sesionfotos/banco-oc.ts`
   (`itemsBancoDesdeOC`) + `components/sesionfotos/AgregarDesdeOC.tsx`, colgado arriba del buscador
   del banco. Lee por `?recurso=recepciones`, el endpoint de «Lo que entró» ⇒ ⛔ sin permiso nuevo,
   ⛔ sin tabla y ⛔ sin migración.
   ✅ 23 tests nuevos (17 del cruce + 6 de la pantalla montada) · suite entera verde (7.192, con el
   rojo conocido de `crm-paridad` que ⛔ no es de acá) · `tsc`, `eslint` y `build` limpios.
   🔴 🔑 **La foto vieja del renglón ⛔ NO decide nada, y está MEDIDO**: de las 74 órdenes de Zattia
   (819 renglones), **186 llegaron con `en_gn` en false o null y HOY sí cruzan** —el caso normal de
   una importación es que el alta en GN venga después—. Leerla habría tirado **uno de cada cuatro**
   llamándolo «no está cargado». Por eso `LineaOC` **⛔ ni siquiera declara `en_gn`/`producto_id`**:
   ⛔ no es un comentario pidiendo que no se usen, es `tsc` diciendo que no están.
   📌 **Cobertura medida contra las dos bases**: cruzan por código **Zattia 802/819 (97,9%)** y
   **BDI 749/803 (93,3%)** —casi todo por SKU: el de la orden lo escribe el mismo Ingresos que carga
   GN—. Sobre las **10 órdenes más recientes**, que es el caso real, **Zattia 167/167** y
   **BDI 402/424**. El resto se va casi todo por **sin stock**, que son las OCs viejas ya vendidas.
   🔑 **El cruce ⛔ no se reescribió: se abrieron dos FIRMAS.** `variantesGnDe` pasó a pedir
   `ConCodigos` (`{sku?, barcode?}`) en vez de `VarianteFchk`, y `porMotivo` sólo `{motivo}` ⇒ la
   cola de fotos y el banco ⛔ no pueden llegar a productos distintos con el mismo código, ni
   ordenar los motivos distinto.
   🔴 **Lo cazó el test de la PANTALLA y ⛔ no la revisión**: con la lectura fallada el desplegable
   decía «Sin órdenes en los últimos 90 días» — la mentira que manda a buscar una OC que sí existe.
   Ahora son **cuatro estados**: cargando · ⛔ no se pudieron leer · sin órdenes · elegí una.
   ⚠️ **`ambiguo` ⛔ no pasó nunca** (0 de 1.622) y **ninguna orden trajo un SKU de Stunned** (0 de
   819) ⇒ ⛔ no se inventó el motivo «es de la otra línea». El guard de ambiguo queda igual.
   🏁 **CAMINADA EN PROD el 6-sep-2026**, los seis pasos: el desplegable trajo **74 órdenes** con
   rótulo, fecha y renglones; OC-0469 metió «2 prendas al banco» con el badge **«de la OC»**;
   volver a agregarla dijo **«0 prendas al banco · 2 ya estaban»** y el banco ⛔ no se duplicó; se
   armó el outfit con lo que entró, avisó que le faltaba el abajo y ese faltante se pidió al local;
   y todo siguió ahí, con su «de la OC», tras salir y volver.
   ▶️ **Lo único sin caminar**: el mensaje con un usuario **sin la sección «Lo que entró»** — hace
   falta otro usuario.
5. 🏁 **HECHA el 4-sep-2026 — la Agenda sale del EVENTO, con la hora. CIERRA EL OCTAVO.**
   `lib/sesionfotos/evento.core.js` (`siembraDeSesion`, JS plano porque lo importa el handler) +
   `api/_solicitudes.js`. Clave `sesion-fotos·evento:<id>` —espacio de nombres **nuevo**: lo
   sembrado antes queda **intacto y ⛔ no se re-siembra ni se migra**—.
   ✅ 16 tests nuevos · suite entera verde (7.213, con el rojo conocido de `crm-paridad`, que ⛔ no
   es de acá) · `tsc`, `eslint` y `build` limpios · **4 mutantes muertos**.
   🔴 🔑 **Lo caro es EL DOBLE, y ⛔ ningún test del núcleo lo veía**: cada guardado por separado
   está bien y lo que rompe es la **combinación**. Un evento con tres hijas sembraría los nueve
   pasos **cuatro veces** = 36 renglones encima de tres personas. El test que lo fija guarda el
   evento **y después** sus tres hijas.
   🔑 **La hora va en el TÍTULO** («Cápsula primavera 15:30 · Buscar modelo») y ⛔ **`Regla` ⛔ no se
   toca**: es día calendario en toda la Agenda —Hoy, Mes, arrastre y cumplimiento— y bajarla a
   hora-del-día tocaría las cuatro a la vez. ⛔ **Sin hora ⛔ no se inventa ninguna.**
   🔑 **`horaNormalizada` se MUDÓ** a `evento.core.js` (`evento.ts` la re-exporta): desde acá la
   hora ⛔ ya no decide sólo una pantalla, **entra a un pendiente que leen otros**. Mismo movimiento
   que `talleNormalizado`.
   🔴 **Un mutante que SOBREVIVIÓ destapó una copia**: la lista de kinds que siembran estaba en el
   handler *y* en el núcleo. Ahora vive en el núcleo y el handler la **importa**.
   📌 **Medido antes de dar por bueno que sirve**: hay **9 moldes** cargados de la plantilla
   `sesion-fotos`, ninguno atado a marca, y para **cualquier** eje quedan 9 ⇒ el módulo ⛔ no nace
   mudo. Y hay **2 sesiones ya sembradas con la clave vieja** (16 clones), **0** con el prefijo nuevo.
   🔴 ▶️ **LO QUE ⛔ NO SE VE, y hay que decirlo**: el resultado de sembrar ⛔ **no llega a la
   pantalla** —la respuesta lo trae y el cliente lo descarta, **desde el 24-ago**—. Si un día ⛔ no
   hubiera moldes para ese eje y esa marca, el evento se guarda y ⛔ nadie se entera: se ve
   **abriendo la Agenda**. Surfacearlo toca el **motor compartido con Administración** ⇒ es una
   decisión aparte.
   ⚠️ **⛔ No siembra al EDITAR**: el hecho es crear la sesión ⇒ corregirle la hora después deja el
   título con la hora **con la que se creó**. Misma ausencia que la fecha de las hijas.
   🏁 **CAMINADA EN PROD el 6-sep-2026**: una sesión con hora y origen sembró **8 renglones**
   —⛔ no nueve: por el eje «campaña» el molde 08 va una sola vez— con el título
   **«PRUEBA CLAUDE 2 - borrar 16:45 · 03) Sacar las fotos»** y cada uno en su día por el offset
   (01 a −2, 02 a −1, 07 a +2). Pedir del banco ⛔ **no sumó ni un renglón**; **editar la hora**
   ⛔ no re-sembró **ni cambió el título** (quedó la hora vieja); y una sesión **sin origen** ⛔ no
   sembró nada y se guardó igual. Todo lo de la prueba se borró después.
   🔴 🔑 **Y acá está el hallazgo que ⛔ ningún test podía ver: el que planifica la sesión ⛔ NO
   PUEDE VER lo que sembró.** La respuesta del POST ⛔ no llega a la pantalla (ya estaba escrito), y
   **la Agenda es personal**: los 8 renglones van a Sofi, Cande y Cami, así que en el **Hoy**, la
   **Semana** y el **Mes** de Bruno ⛔ no aparece ninguno. El único lugar donde se ven es
   `/agenda/eventos`, abajo de todo, en **«LO QUE YA SE COPIÓ»** — un renglón por sesión, **sin
   botones**.
   🔴 **Corolario medido, y éste muerde**: hay **8 renglones de «SS 27» colgados de una sesión que
   ya ⛔ no existe** —se creó el 5-sep, sembró, y después alguien **eliminó la sesión**—. 5 de esos 8
   vencían el 6-sep sobre Sofi, Cande y Cami. ⇒ **borrar una sesión ⛔ no borra sus pendientes, y la
   pantalla del borrado ⛔ no lo dice** («No hay papelera» habla de la sesión, ⛔ no de la Agenda).
   ▶️ Y ⛔ no hay forma de borrarlos desde el monitor: `borrar-item` existe en la API, pero la lista
   de «LO QUE YA SE COPIÓ» ⛔ no ofrece el botón.

⛔ **Lo que este plan NO hace**: tocar el motor compartido con Administración ni el ciclo contra
Gestión Nube · migrar nada (ni tabla, ni solicitudes, ni clones de agenda ya sembrados) · inventar un
objeto «outfit» · traer OCs «en camino» · estrenar permiso o sección nueva.

📌 El plan largo, con rutas archivo por archivo y cómo se camina cada fase, quedó en
`~/.claude/plans/a-ver-planiemos-eso-inherited-gem.md`.

---

## 🏁 LA PUERTA DE MARKETING: «Sesión de fotos» vuelve al menú — 5-sep-2026 (pedido de Bruno)

> «no entiendo cómo llegar… la puerta de entrada de marketing es siempre sesión de fotos, porque
> sesión de video y contenido también es sesión de fotos; muestra, moldería y uso interno no aplica
> para marketing. Ese lugar es sólo de marketing; dentro de sesión de fotos quedan las solicitudes,
> que el motor está en administración. Luego vemos cómo ordenarlo.»

🔴 **El octavo entero (evento, banco, outfits, OC, Agenda) estuvo CINCO DÍAS en producción sin que
nadie pudiera llegar, y ⛔ no era la pantalla: era que no había puerta.** Desde el 24-jul
(`d0b4eca`) `sesion-fotos` ⛔ no era entrada de menú, y las dos formas de llegar —el botón «Ver» y
el puente de Marketing— **aterrizan con una solicitud abierta**, o sea tapando el bloque «Sesiones
planificadas», que vive arriba de la lista. 🔑 **Un módulo sin entrada propia ⛔ no se estrena solo.**

**Hecho** (⛔ sin commitear todavía: los archivos del nav los está tocando la otra sesión):
- **`sesion-fotos` es el PRIMER renglón del grupo Marketing**, con la cámara de la cola de fotos.
- **`solicitudes` pasó a llamarse «Estado de las solicitudes»** dentro de Marketing: dejaba de
  quedar claro cuál era la puerta con las dos compitiendo por el mismo nombre.
- 🔑 **`puedeVerPropio` en `lib/permisos.core.js`, y el filtro del menú bajó a `lib/nav.ts`**
  (`keyVisibleEnMenu` · `itemVisibleEnMenu` · `catsVisibles`). **El menú y la ruta preguntan
  distinto**: el menú «¿esto es suyo?», la ruta «¿puede abrirlo?». Sin eso, a Depósito, Local y
  Administración —que abren la pantalla por `DETALLE_DE`— les aparecía un grupo «Marketing» entero,
  de un solo renglón, que hoy ⛔ no ven. ⛔ **El guard sigue con `puedeVer`**: unificarlo reabre el
  bug de `6d84591` en silencio.
- **«Video/contenido» pasó al cajón de fotos.** Estaba en internas (área **local**), tomaba
  `estadoTrasVenta: 'retirada'` y **perdía el eje «De dónde viene»** ⇒ un video de campaña ⛔ no
  podía decir que venía de una campaña. ⚠️ ⛔ Sin backfill: la que ya existe se queda en internas.
- ✅ 8 tests nuevos en `tests/nav-menu.test.ts` (archivo nuevo a propósito:
  `tests/permisos-funcion.test.ts` lo tiene tomado la otra sesión) · `tsc` y `eslint` limpios.
  🔑 **El invariante se verificó al revés**: con `puedeVer` en vez de `puedeVerPropio`, el test se
  pone rojo. Un verde que no se prueba que caza ⛔ no prueba nada.

▶️ 🔴 **NADIE ABRIÓ LA PANTALLA.** Falta ver, con `npm run dev`: el renglón primero y con ícono ·
que caiga en **la lista** y ⛔ no en un detalle · el eyebrow «MARKETING», que antes ⛔ no existía ·
y, con una cuenta de **Local o Depósito**, que el grupo Marketing ⛔ no aparezca **y** que el botón
«Ver» siga abriendo la pantalla — las dos mitades, juntas.

▶️ **El reemplazo completo quedó afuera, y por qué**: sacarle `solicitudes` a Marketing hace que
`sectorVisible` caiga en su rama de compatibilidad y le **aparezcan tres grupos ajenos** (Local,
Depósito, Administración), cada uno de un renglón — el bug que esa función vino a arreglar. Es una
decisión aparte: arrastra `ACCESO_POR_FUNCION` o `sectorVisible`, y `tests/permisos-funcion.test.ts`.

▶️ **Sectorizar los motivos.** Bruno: *«si pusimos algún otro motivo sería porque lo usa otro
sector, pero hay que empezar a clarificar y sectorizar»*. Hoy `NuevaSolicitud` ⛔ **no recibe el
perfil** y le muestra los seis motivos a cualquiera.

🏁 **El TOUR de la sección — HECHO el 5-sep-2026.** Idea de Bruno: *«si cambia mucho, no estaría
mal pensar en un tour virtual»*. 🔑 **No hizo falta ningún módulo nuevo: el motor ya estaba**, hecho
para Envíos (`lib/guia/core.ts` + `components/ui/Guia.tsx` + `store/useGuia.ts`), y el botón «Cómo
se usa» aparece solo en cuanto una sección registra sus pasos. Se escribieron los 13 pasos
(`lib/sesionfotos/guia.ts`) y las 12 anclas, repartidas en cinco archivos.
🔴 **Esta pantalla ⛔ no tiene pestañas, tiene ESTADOS, y el tour ⛔ no puede abrirlos**: no hay
sesión que abrir hasta que alguien cree la primera, y acá los botones **crean ventas en GN**. Por
eso casi todo ancla en el bloque «Sesiones planificadas» y el control puntual va como `anclaFina`:
con la sesión cerrada el globo se para en el bloque y dice **dónde aparece**. Ningún paso se saltea.
✅ 6 tests nuevos, y **el de deriva se verificó al revés**: sacando un `data-guia` a mano, se pone
rojo.
🔴 **Caminado por Bruno el mismo día, y encontró lo que ningún test veía**: *«desde la 4 no muestra
nada, porque no hay nada creado»*. Nueve de los trece pasos hablan de lo que hay ADENTRO de una
sesión ⇒ con la lista vacía el tour repetía «esto aparece cuando abrís una» en vez de mostrarlo.
🏁 **Arreglado**: mientras el globo está abierto se dibuja una **sesión de EJEMPLO** —rotulada, ya
desplegada, con modelo, hora y un outfit completo de dos prendas—, que ⛔ no se guarda ni la ve
nadie más. ⛔ **⛔ No se crea una sesión de verdad**: el cajón es compartido y desde adentro se piden
productos que **crean ventas en GN**. 🔑 **El candado vive en `conEvento`, ⛔ no en un comentario**:
rechaza el id del ejemplo pase por donde pase. ✅ 9 tests más —4 de ellos **montando la pantalla**,
que es la mitad que el test de fuente ⛔ no puede ver— y el guard verificado sacándolo.

---

## 🆕 AGENDA — el primer día del webhook en vivo — 1-sep-2026 (pedido de Bruno)

> «la selección de opciones tiene que ser según marca: Zattia es producción propia o compra
> nacional, y bdi el resto» · «cuando hay varias OC estaría bueno las actividades de cada evento,
> unificarlas en factor común» · «la vista mía, tengo cosas de administración, ¿puede ser? ¿por qué
> sería?»

Aclarado por él en la misma vuelta: *«bdi y zattia tienen compra nacional; la diferencia es que bdi
tiene importado, y zattia tiene producción propia»* y *«accesorios nacionales sería compra
nacional»*.

🏁 **Las tres, hechas** — el relato entero en `docs/secciones/agenda.md` § «EL PRIMER DÍA EN VIVO».
Lo medido ese día contra la base: **11 preguntas de puerta**, **10 contestadas** (todas Zattia,
todas «compra nacional») ⇒ **100 renglones sembrados**.

1. **Las puertas pasaron de cuatro a tres, y cada una vive en su marca.** «Accesorios nacionales» era
   la compra nacional de BDI. Zattia ofrece propia + nacional; BDI, nacional + importación. El
   servidor corta por la misma lista que la pantalla, y `accesorios` **sigue entrando** desde
   `ingreso2` traducido a `nacional`.
2. **Las actividades repetidas se unifican en una fila** («05) Decidir el PRECIO · 3 de 10», con una
   orden por ficha). Cada orden conserva **su** tilde; ⛔ no cambió qué se guarda. 🆕 **Segunda
   vuelta**: el tilde quedó **afuera** del número de orden —eran un solo botón, así que ir a mirar
   qué vino marcaba el paso como hecho— y **el número abre la orden** en Ingresos (`?oc=`).
3. **Lo de Administración en el «Hoy» de Bruno es el atajo del admin**, que recibe todo lo dirigido
   **por rol** —las 11 preguntas (`administracion`) y los 10 «04) La DESCRIPCIÓN» (`local`)—. Lo que
   va por nombre ⛔ no le llega. Con el punto 2, esos 21 renglones son **dos filas**.

### ▶️ Lo que queda

1. 🏁 **Caminado por Bruno el 1-sep-2026 y anda** (*«si anda perfecto, ahí lo probé»*): el tilde, el
   «Marcar las N» y el número de orden abriendo la orden en Ingresos. ⚠️ Lo caminó **con su usuario,
   que es admin**: falta verlo con **Lorena**, que es la que tiene los 36 renglones y la única sin
   `admin` que puede contestar la puerta.
   ⚠️ Los cien renglones sembrados ese día ⛔ **no traen el id de la orden** —el campo nació
   después—: abren por **rótulo**, que `recepciones` resuelve igual. Los que se siembren de ahora en
   más van por id.
2. ▶️ **Decidir si el «Hoy» del admin lleva un filtro «sólo lo mío»** — o si la pregunta de la puerta
   se dirige por nombre en vez de por rol. ⛔ **La salida barata NO es tocar `esParaMi`**: lo comparte
   Novedades. Hoy queda como está: el volumen lo arregló la unificación.
3. ▶️ **La novedad**, si Bruno quiere: la unificación **la ve todo el equipo**, no sólo quien carga.

---

## 🆕 CANJES → la venta va a GESTIÓN NUBE — 1-sep-2026 (pedido de Bruno)

> «quiero ver tema canjes, de poder escribir los canjes de las personas en ventas de gestión nube
> con el nombre de canjes bdi — en la nota que diga el nombre de la persona, y luego le genero
> etiqueta por afuera»

🏁 **Hecho y en el repo** (el relato entero, en `docs/secciones/canjes.md`): el paso 1 de un canje
con envío crea la venta a $0 en GN contra el cliente **`Canjes BDI` (645369)**, con la nota
`Canje C-0079 — Nombre Apellido — envío (Monitor)`, descontando del **Depósito Minorista**. La orden
de Tienda Nube dejó de ser el camino principal y quedó plegada.

### ▶️ Lo que está en manos de Bruno

1. 🏁 **El canal quedó resuelto (1-sep): es el 15 «Influencer».** Bruno creó el canal propio
   «Canjes» pero GN **no lo ofrece en el selector de la venta** (habría que habilitarlo en
   Preferencias → «Personalizar Canales de Venta»), así que eligió uno preseteado. Con eso los
   canjes **cuentan** en rotación, vida útil, caducados y CRM. 🔴 **Ese canal queda reservado para
   canjes**: `canalDe` lo manda a `tecnica` para que las ventas a $0 no hundan el precio promedio,
   así que **una venta cobrada cargada ahí tampoco contaría** para el promedio.
2. 🏁 **El precio congelado quedó corregido (1-sep).** La vitrina «Girlhood Collection» tenía sus
   **19 ítems a $1.490** cuando en la tienda valen **$13.990–14.990**, y ese número se había copiado
   a los ítems que las creadoras eligieron ⇒ el balance contaba ~10 veces menos de lo que costaron.
   🔑 **El precio no existía en la tienda ni existió como promo**: medido contra el catálogo real de
   Tienda Nube (`tiendanube-audit`), **0 de 252 productos** tienen 1.490 y el más barato es 1.990.
   Fue la foto del **4-ago**, día en que se importó la vitrina, que quedó congelada.
   ✅ Corregidos **19 ítems de vitrina** y **39 ítems vivos de los 13 canjes abiertos**, con el
   precio de hoy de cada SKU (misma regla `precioVigente`, mismo catálogo — no un tercer precio).
   ⛔ **No se tocaron** los de canjes cerrados o cancelados (su balance es historia) ni los ítems
   `quitado`. ✅ Verificado antes de escribir que ninguno de los 13 se pasa de tope: **todos son por
   unidades**, así que el precio no traba la venta de ninguno.
3. ▶️ **Probarlo con un canje real**, y mirar dos cosas en GN: que la venta quedó a nombre de Canjes
   BDI con la nota, y **si el stock de la tienda online bajó**. Sin la orden de Tienda Nube, eso
   depende de la integración GN↔TN y **no está verificado**.

### 🆕 Las ETIQUETAS: las 13 a domicilio están CREADAS (2-sep)

🏁 **Las 13 etiquetas a domicilio quedaron creadas en Envío Nube, todas «Por enviar» y SIN COMPRAR.**
El saldo no se movió: sigue en **$39.721** (crear no cobra; el gasto es «Comprar etiqueta», que es
además lo que genera el código de seguimiento).
- 1-sep, 7: `EM4240` Mercedes Jaime · `EM4241` Jennifer Bilbao · `EM4242` Lourdes Cuchero ·
  `EM4243` Melisa Bruno · `EM4244` Delfina Cassarino · `EM4246` Maia Cigorraga ·
  `EM4247` Giuliana Gardonio.
- 2-sep, 6: `EM4254` Luisina Bidart (C-0075) · `EM4255` Berenise Ahumada (C-0077) · `EM4256` Julieta
  Clara (C-0078) · `EM4257` Manuela Melkun (C-0079) · `EM4258` Abril Gobio (C-0080) · `EM4259`
  Victoria Bartos (C-0081; Rosario→Rosario sale **$7.600**, el resto **$8.776**).

4. ▶️ **La mano que queda es de Bruno: COMPRAR las 13.** Son ~$113.500 y el saldo alcanza para 4.
5. ▶️ **Falta C-0082 Julieta Junco, que va a SUCURSAL** — el formulario es otro («Agregar envío
   manual → A sucursal») y **falta que Bruno diga a qué sucursal**. ⛔ C-0051 Celeste Aloe la sacó él:
   no lleva etiqueta.
6. 🏁 **«Barrio» ya está en el link que llena la creadora** (2-sep). Es obligatorio **sólo con
   envío** —con retiro en el local no se pide nada del domicilio— y la ayuda del campo dice qué poner
   si en su ciudad no se usan los barrios: repetir la localidad, que es lo que se cargó a mano las
   trece veces. Está también en la ficha del equipo y en la grilla de campos que se copia a Envío
   Nube. ⛔ **No entra a `tieneDireccion`**: las fichas viejas no lo tienen y sumarlo al criterio de
   «se puede despachar» frenaría canjes en curso por un dato que nadie les pidió.
7. 🏁 **El guard de la provincia ya está** (2-sep): con un CP de 1000 a 1499 la provincia se corrige a
   CABA al guardar, **en los dos lados que escriben** —el portal y la ficha del equipo—, porque las
   cuatro que salieron mal las había tipeado el equipo. Hay **un solo rango y es a propósito**: los
   demás se pisan entre sí y una tabla escrita de memoria corregiría direcciones que están bien.
   ✅ **Migración corrida en BDI y EN PROD** (2-sep): la columna verificada contra
   `information_schema` y la escritura **ejercida de verdad por PostgREST y revertida** —el caché de
   esquema de PostgREST ya mordió una vez—. El campo se leyó en el bundle de producción.
   ⛔ **Las 6 fichas que hoy tienen la provincia peleada con el CP quedan como están, por decisión de
   Bruno** (4 mal de verdad —Mercedes Jaime, Melisa Bruno, Maia Cigorraga, laureana bottini— y 2
   escritas «CABA» en corto). El guard las corrige al próximo guardado; hasta entonces siguen así.
   ▶️ **Falta lo único que ningún test puede**: abrir el link desde un **celular**, cargar el barrio
   y ver que se guarda. El bundle dice que el campo está dibujado, ⛔ no que la escritura funcione.
8. ⚠️ **Tres direcciones se cargaron interpretándolas, y conviene que la ficha lo refleje**:
   C-0078 «Av 101 9 de julio» **no eran dos calles** —es la Avenida 101, que en Villa Ballester se
   conoce como 9 de Julio; se cargó `Av. 101 (9 de Julio)`—; C-0075 el timbre no tiene campo propio y
   entró en Departamento (`5 C (timbre 53)`); C-0081 piso y depto venían como `03`/`06` y se cargó
   `Piso 3 Dto 6`.

---

## 0. La corrida de VOCABULARIO — 28-ago-2026 (pedido de Bruno)

> «no me están gustando los títulos y los términos de los mensajes: lo que falta tendría que ser
> pendiente, sacar tiene que ser eliminar»

📌 **La regla vive en [`VOCABULARIO.md`](./VOCABULARIO.md)** —el MISMO archivo en este repo y en
`areben-marketing`, versión `2026-08-29`— y la clava `tests/vocabulario.test.ts`. ⛔ Antes de escribir
un botón, un título o un cartel de vacío, se lee. El nombre del trabajo, para pedirlo afuera: es
**UX writing**; lo que se pide es un **glosario de producto con vocabulario controlado** más una
**guía de estilo de contenido**, y después la **auditoría de contenido** que los aplica.

### 🏁 Hecho

- **Los rótulos del menú.** 15 nombres en `lib/nav.datos.ts`: `Objetivo de ventas` · `Fotos y
  descripciones` · `Importaciones` · `Conteo de depósito` · `Posventa` · `Fallas del local` ·
  `Fallas de depósito` · `Productos` · `Variantes` · `Clientes` · `Iniciar un reclamo` ·
  `Retornos a depósito` · `Solicitudes de todas las marcas` · `Cola de fotos`.
  🔑 **Las nueve palabras que significaban dos cosas las cerró Bruno**: `Faltantes` se la queda
  Compras · `Importaciones`/`Ingresos` · `Conteo de depósito` · `Solicitudes` queda (es la misma
  pantalla vista desde cuatro lugares) · `Canjes` y `Talles` ⛔ **no se tocan, decisión suya** ·
  Posventa es **una cadena** (local → depósito → el motor), ⛔ no tres nombres de lo mismo.
- 🔴 **Una descripción que MENTÍA.** El `info` de `marketing` en `PERM_CAT` decía «Armado de
  publicaciones para redes y TiendaNube» — esa pantalla no existe: es una auditoría de fichas de TN.
  Y ese texto sale como **tooltip en la matriz de permisos** (`components/usuarios/MatrizPermisos.tsx`),
  así que quien repartía permisos leía la descripción de otra cosa. ⚠️ Había **dos** descripciones por
  sección (`PERM_CAT.info` y `DESCRIPCIONES` de `lib/nav.ts`) y sólo una estaba bien.
- 🔑 **El rename destrabó un eyebrow.** `categoriaDe('marketing')` daba `null` **porque la sección se
  llamaba igual que su grupo**: era el síntoma, no una decisión. Era la única pantalla que no decía
  de qué grupo venía.
- **Familia *eliminar*: 330 textos.** `borrar` → **Eliminar**, `quitar` → **Sacar**, decidiendo cada
  uno con *¿la cosa sigue existiendo después?*.
- **Familia *publicar*: 25 gestos** a `Enviar`. Se terminó el caso de las dos puntas del mismo flujo
  diciéndose distinto («Mandar a sesión de fotos» / «Enviar a Marketing»).
- **`tests/vocabulario.test.ts`**, con el mecanismo de MAKETA (saca comentarios, junta identificadores,
  allowlist de 94 símbolos) más las **34 pantallas destructivas que TIENEN que decir la palabra** —sin
  eso el test se cumple perfecto en una app sin ningún botón—. **Mutado tres veces y murió las tres.**

### 🔴 Lo que ya mordió y no hay que repetir

- **Tres claves de datos se rompieron con la barrida**: `'quitado'` (estado de un ítem de canje),
  `'quitar'` (union de acción de Tienda Nube) y la firma de `lib/tncat/categorias.ts`. ⛔ **Un string
  que es CLAVE no es texto**: la regla es del texto que lee una persona. Lo cazó el `typecheck`, que
  es el oráculo barato para esto.
- ⚠️ **Y una era las dos cosas**: en Sesión de fotos el historial **guarda el verbo y lo dibuja tal
  cual** (`{c.por} {c.accion} {c.detalle}`). Ahí `quitó` → `sacó` es correcto, y **las filas viejas
  siguen diciendo `quitó`**: van a convivir un tiempo. Decidido con el costo delante.
- 🔴 **La regla de `Mandar` estaba MAL ESCRITA y hubo que corregirla.** Prohibía la palabra; medido,
  de **99 apariciones sólo 17 nombraban un gesto**. Las otras son prosa al cliente («Te mandamos la
  etiqueta», que en castellano está bien) y **otro verbo que se escribe igual**: «el corte que manda»,
  «Gestión Nube es quien manda sobre el precio» son *gobernar*. ⇒ la regla ahora dice **sólo como
  nombre del gesto**.

### 🏁 Hecho el 29-ago — las otras cuatro familias

- **Las seis familias, clavadas, y `tests/vocabulario.test.ts` pasó de 3 tests a 12.** Una prueba por
  familia sobre **el nombre del gesto**, más un piso de cuántos rótulos vio el extractor y la lista de
  pantallas que tienen que aportar alguno. 🔑 **Es el MISMO bloque que `areben-marketing`**, byte a
  byte salvo los números medidos.
- 🔴 **Y ese test nació con un PUNTO CIEGO que dejó vivo a un mutante.** La primera versión parseaba
  las etiquetas contando llaves para saltarse el `>` de `onClick={() => x()}`, y llegaba **hasta tres
  niveles**: un `<Button>` con `onClick={async () => { try { … } catch { … } }}` ⛔ no matcheaba, así
  que su rótulo era invisible — y ésos son justo los botones que escriben. Medido: devolver un
  «Sumar» a `components/canjes/BloqueEntregables.tsx` **no puso nada en rojo**.
  ⇒ **el extractor ya no parsea nada**: toma todo el texto JSX y los atributos de texto, y se queda
  con **lo que puede ser un rótulo** (hasta cinco palabras, sin `(`, `:`, `;` ni `=`). 🔑 **El tope de
  palabras es lo que separa el rótulo de la PROSA**, que es la lección de `Mandar` resuelta con una
  medida en vez de una lista de excepciones. Con el cambio aparecieron **cuatro rótulos más** que
  ninguna versión anterior veía.
- **Familia *agregar*: 30 rótulos.** `Anotar`/`Sumar` repartidos con la pregunta de §1.3 — **Crear**
  lo que nace al escribirlo (una idea, una decisión) y **Agregar** lo que ya pasó afuera y acá queda
  registrado (un faltante, un movimiento, un intento de entrega, un pedido de insumos).
- **Familia *guardar*.** ⚠️ Y confirmó lo que este archivo ya avisaba: **«Aplicar ajuste» no era
  guardar**… pero tampoco era aplicar. Relee el stock y **arma un Excel** ⇒ quedó **«Generar el
  ajuste»** (los dos conteos y el instructivo). Lo que sí escribe afuera se queda con `Aplicar` **y
  ahora nombra dónde**: «Aplicar en Tienda Nube», «Aplicar en TN».
- **Familia *publicar*.** `Mandar a Drive` · `Mandar a sesión de fotos` · `Mandar` · `Sin mandar` →
  **Enviar**.
- **Familia *editar*: ⛔ no había ni uno.** `Modificar` y `Retocar` no aparecen en ningún rótulo.
- 🏁 **Se cerró la deuda de `Borrar` y `Quitar` a secas en la allowlist**, que estaba escrita acá como
  debilidad conocida: los dos últimos usos vivos eran **texto** —«Borrar … de esta computadora» y
  «Quitar el elegido», cuyo propio diálogo ya decía «Sacar»— y con ésos arreglados la lista quedó
  **sólo con nombres que ninguna pantalla podría decir**. 🔑 **Lo cazó el test de al lado**, el que
  exige que la lista se vacíe sola.
- **El glosario subió a `2026-08-29c`** y está byte a byte en los dos repos. Entraron dos carve-outs
  medidos, los dos con la misma forma: la palabra se queda **cuando el gesto escribe en OTRO sistema y
  el rótulo nombra cuál** (`Aplicar en …`, `Dar de baja en GN` — es la palabra del sistema de
  destino, y traducirla manda a buscar un botón que allá no existe).

### ▶️ Lo que falta

- 🔴 **`components/crm/CRM.tsx` quedó SIN COMMITEAR a propósito.** El cambio de vocabulario está
  hecho en el archivo (`+ Sumar` → `+ Agregar`), pero **la otra sesión tiene ese archivo a medio
  editar** —le sacó el import de `vistaTemp` y está tocando `components/crm/temperatura.ts`—, así que
  commitearlo publicaría su trabajo por la mitad. 📌 [[feedback_areben_checkout_compartido_no_hay_merge]].
  ▶️ **Entra en el próximo commit que toque CRM**, o se vuelve a aplicar si se pierde.
- 🏁 **Los dos homónimos se cerraron** (29-ago, decisión de Bruno: la palabra se la queda el sentido
  que ya la tenía). `Faltantes` queda en Compras y en **Exhib** pasó a **«Sin escanear»**; en
  Recepciones ya decía «Unidades que faltaron» y ⛔ no hubo nada que tocar. `clavado` queda para el
  **producto sin rotación**, y la cuenta atada a una marca pasó a **«el que tiene una sola marca»**.
  🔑 **Los cuatro homónimos de los dos repos se cerraron SIN bautizar una palabra nueva.**
- 🏁 **La jerga de §3 tiene test** (`corrida` · `copy` · `moodboard`), y salió de los 8 textos que lee
  una persona. 🔑 **El oráculo de que una palabra es jerga es que alguien no la entienda**, y pasó:
  Bruno leyendo el pendiente de MAKETA — *«no sé lo que es corrida de un reloj»*. ⇒ ⛔ no se le busca
  un sinónimo, **se dice qué pasa**: «no hay ninguna corrida exitosa reciente» → **«hace rato que no
  termina bien»**.
- 🏁 **Y de las tres que iban a preguntarse, DOS no eran una decisión: eran un resto.**
  - **`Sembrar`** ya ⛔ no era el nombre de ningún botón —el de la Agenda dice **«Cargar los
    pendientes»**— y sólo sobrevivía en el **mensaje de error**, que decía otra cosa que el botón que
    lo dispara. ⇒ «No se pudieron cargar los pendientes.»
  - **`Bitácora`**, la pestaña de Liquidación, es la MISMA palabra que el menú de MAKETA ya había
    resuelto como **Actividad**.
  🔑 **Antes de mandar a decidir una palabra, mirar si el gesto ya se llama de otra manera en su
  propio botón, o si la otra app ya la resolvió.**
- ⛔ **`padrón` NO entra al test, y ⛔ no es un olvido**: sus 13 apariciones son todas de **Canjes**,
  que Bruno dejó afuera de la corrida. Es una decisión suya **ya tomada**, ⛔ no una pendiente. Está
  escrita en el test como **lista de archivos** —y con un segundo test que exige que la excepción
  siga excusando algo— para que el día que se levante se vea exactamente qué entra.
- 🏁 **La novedad está cargada, y queda de BORRADOR: `n1788020491323_anup1v`.** ▶️ **La publica Bruno
  de un click**, en `/novedades` → «Sin publicar». Le llega a **todos**, y ⛔ **no va como importante**:
  📌 medido, las 17 publicadas están las 17 en importante, así que un cartel bloqueante más no
  distingue nada — y un renombre ⛔ no frena el trabajo de nadie hoy.
- 🔑 **Lo que la disparó no fue la lista de renombres, sino una novedad YA PUBLICADA**: *«Lo que te
  piden y no tenemos: **anotalo** desde Atención»* nombra un botón que hoy dice **«Agregar un
  faltante»**. 📌 Es la regla de la ficha leída al revés, y por eso esa línea es la segunda de la
  novedad: quien siga la vieja va a buscar una palabra que ya no está.
- ⚠️ **`tests/crm-paridad.test.ts` sigue con 13 tests en rojo, y ⛔ no son de esta corrida**: se midió
  guardando los cambios aparte y dieron los mismos 13. Estaban rotos de antes.

---

## 1. La evidencia, medida — no es impresión

Contado contra la base de producción el **25-ago-2026**, módulo de Meta Ads:

| tabla | filas | qué significa |
|---|---|---|
| `meta_ads_regla` | ~~0~~ → **11** | 🏁 **prendidas el 26-ago** (P2). Los diales y el porqué, en el desplegable de P2 |
| `meta_ads_umbral` | **0** | y está bien: de los dos cortes que corren, uno se deriva y el otro sale de la ficha de rentabilidad. Sólo se llena para pisar un derivado o para las marcas sin ventas |
| `meta_ads_hallazgo` | ~~0~~ → **4** | 🏁 **los primeros de la historia, el 26-ago**: se corrió el reloj de verdad (`gh workflow run meta-reglas.yml`) y las 11 reglas quedaron con `ultima_corrida` |
| `meta_ads_favorito` | **0** | el botón de favorito de la Biblioteca no se tocó nunca |
| `meta_ads_informe` | 2 | y los dos **sin publicar** |
| `meta_ads_plan` | 4 | 2 `duplicar` (8-ago) + 1 `piezas` (10-ago) + 1 del 25-ago |
| `meta_ads_accion` | 37 | **todas de UNA persona**, del 6 al 25 de agosto |

🔑 **Lo que esto decía el 25-ago: el módulo se usa para EJECUTAR, nunca para DECIDIR.** Las tres
tablas que convertirían datos en «qué hago hoy» —reglas, umbrales, hallazgos— estaban las tres en
cero. 🏁 **La primera dejó de estarlo el 26.**

✅ **Al 26-ago-2026 la zona de Rendimiento contesta esa pregunta** (P3, abajo). Las tres tablas de
reglas siguen en cero: eso es P2, y resultó ser más que mover un dial.

🔴 **Y la prueba más incómoda:** el 25-ago se hizo una sesión entera de análisis de la pauta
—cruce con pedidos reales, elasticidad, techo re-medido, veredicto por conjunto— y **no se abrió
el monitor ni una vez**. Se contestó con ~20 consultas directas a la base y a la API. *Si la
pantalla contestara la pregunta, se habría abierto.*

## 2. El diagnóstico

### 2.1 🔴 No se entiende qué hace ni qué EJECUTA cada sección

Es el pedido literal de Bruno y es el problema raíz. Hoy, para saber qué hace una sección hay que
**abrir el código**. Concretamente:

- `docs/mapa-secciones.md` dice **dónde vive el código** de cada pantalla. Es una tabla de
  ubicaciones para quien programa.
- `docs/secciones/*.md` son **25 fichas sobre 55 secciones**, y su plantilla dice textual que se
  leen «ANTES de abrir los archivos» y que su trabajo es «decir qué mirar con cuidado».

⇒ **Toda la documentación del monitor está escrita para quien lo CONSTRUYE.** No existe una sola
línea escrita para quien abre la pantalla y no sabe qué va a pasar si aprieta.

Y el caso peor es el de los botones que **escriben afuera**: pausar, presupuesto, duplicar, piezas,
planes. Ahí «no entender qué ejecuta» no es incomodidad, es **miedo justificado**: son botones que
mueven plata en Meta y la pantalla no dice ni qué va a tocar, ni si es reversible, ni quién se
entera.

### 2.2 Está armado para ejecutar, no para decidir

Todo lo que funciona —accionar, planes, la foto, la Biblioteca, el Parte— **presupone que ya sabés
qué querés hacer**. Ninguna pantalla contesta *«¿qué apago, qué escalo, qué testeo hoy?»*.

El «Parte del día» es lo más cerca que hay, **y es un botón que copia texto para pegar en otro
lado**: la herramienta admite que la decisión se toma afuera.

### 2.3 Todo es *pull*

Hay que acordarse de entrar y de mirar. Un conjunto que compra al doble del techo tres días
seguidos, el catálogo de Meta parado, un sync en rojo: nada de eso sale a buscar a nadie.

### 2.4 Las pantallas hablan en el idioma del sistema, no del negocio

`conjunto`, `objeto_id`, `estado_real`, «efectivo vs configurado», `OPT_IN`. Quien decide piensa en
«esta pieza compra caro» y «este público está agotado».

### 2.5 Hubo un motivo real para desconfiar de los números

El techo de costo por compra de BDI estuvo semanas calculado con **2,6 unidades por pedido** cuando
lo medido eran 1,93-1,99: **26% de sobrestimación**, o sea conjuntos que la app daba por rentables y
no lo eran. Si el número con el que la app juzga está mal, se deja de creerle a la app entera —y no
vuelve sola cuando el número se arregla.

## 3. Los pendientes, en orden

### 🆕 ▶️ P0 — Lo que queda de la Agenda partida en seis (29-ago-2026)

La sección se partió en seis entradas de menú y las tres poblaciones de `agenda_items` se separaron
(ficha: `docs/secciones/agenda.md` § «SEIS pantallas»). Lo que queda es **de Bruno**:

- ▶️ **Publicar la novedad**, que quedó cargada como borrador: *«La Agenda, ahora por partes»*
  (`n1788054663959_yw2xuq`), en `/novedades` → «Sin publicar». El deploy **ya está en la calle**
  (verificado el 29-ago con la cadena nueva adentro del chunk del nav).
- ▶️ **Caminar a mano lo que ningún test alcanza**, listado al final de la ficha: las seis entradas
  con los dos perfiles, el modal de una actividad, y el `offset` al pasar de Mes a Semana.

### 🆕 🏁 P0b — Horas extras: HECHO Y CAMINADO (30-ago-2026)

Pedido de Bruno: *«en agenda de monitor, que esté el link de dashboard para que puedan cargar sus
horas extras; y la alerta de fin de mes, que sea sólo para las personas que tienen autorizadas las
horas extras»*. La ficha: `docs/secciones/agenda.md` § «la quinta forma de destino».

🔴 **El agujero era de DATOS y estaba a la vista sólo si se medía: `0 de 11` empleados activos tenía
el link generado.** La rutina les caía desde el 23-ago y **no había nada que abrir**.

✅ **Cerrado el 30-ago, con Bruno mirando**: se generaron los links de las **cuatro que él nombró**
—**Camila Budek, Candela Luis, Josefina Batter y Camila Quintana**— en el dashboard, se pegaron en
sus perfiles de `/usuarios`, y la rutina `it178752572363714_6wxkmp` pasó de los tres nombres a
`destino: {tipo:'horas-extras'}`.

- ⚠️ **Sofi quedó AFUERA a propósito** (no estaba en la lista de Bruno). Hasta el 30-ago la rutina la
  nombraba: era justo el caso que el pedido venía a arreglar.
- ⛔ **Gerardo Tamayo no tiene cuenta en el monitor**: si algún día hace horas, el link se le pasa
  por afuera, porque no hay perfil donde tildarlo.
- **Los oráculos que se corrieron** (⛔ ninguno es «lo vi en la pantalla»): el padrón quedó en
  **16 usuarios y 16 con contraseña**, igual que antes de guardar —es lo único que detecta el borrado
  silencioso de contraseñas—; cada link se cruzó contra la fila de esa persona en la base del
  dashboard; el `manual_id` de la rutina quedó **intacto**; y `/horas/<token>` se abrió **en el
  navegador, sin sesión** (salió «Hola, Camila» con su carga vieja del 31/07).
- **El control de dos lados en la ficha de Organización**: a **Cami Budek** (tildada) la rutina le
  aparece; a **Sofi** (sin tildar) ⛔ no —con una rutina suya visible en el mismo barrido, que es lo
  que prueba que la lista no estaba ciega—.
- ✅ **La novedad ya está escrita y cargada como BORRADOR**: `n1788116275709_u56o8j`, «Tus horas
  extras las cargás vos», destino `horas-extras` (⇒ le llega **sólo a las cuatro**, y la lista se
  ajusta sola) y **sin `importante`** —las 15 publicadas están las 15 en importante, y si todas
  frenan, ninguna frena—. ▶️ **Queda el click de Bruno en Publicar.**
- ✅ **Y el botón se renombró a «Cargar horas extras»** (era «Cargar mis horas») y pasó a ser un
  botón de verdad: ver el 🔴 de `ButtonLink` en la ficha de la Agenda.

### 🆕 🔴 ▶️ El modal de la Agenda dice «— sin manual —» en 75 de 75 rutinas (30-ago-2026)

Salió de caminar lo de arriba. El desplegable **«Cómo se hace»** de `ModalItem.tsx` sólo lista los
manuales **publicados** (`publicados = manuales.filter((m) => m.publicado)`), y hay **1 publicado de
12**. ⇒ **medido: las 75 rutinas activas que tienen manual abren el modal diciendo que no tienen.**

- ✅ **No borra nada solo**, y se verificó: `manualId` vive en el estado y el `onChange` sólo dispara
  si alguien toca el desplegable, así que guardar otro campo lo conserva. Se comprobó guardando el
  destino de «Cargar las horas extras» y releyendo `manual_id` de la base: intacto.
- 🔴 **Pero si lo tocás, no lo podés volver a poner**: el manual que la rutina tenía **no está entre
  las opciones**. ⇒ ⛔ hasta que se publiquen los manuales, editar una rutina y **no tocar «Cómo se
  hace»**.
- ▶️ Se arregla solo el día que se **publiquen los 11 manuales** (ya estaba en la lista de manos de
  Bruno). La alternativa, si eso tarda: que el desplegable incluya el manual que la fila ya tiene,
  aunque esté en borrador, marcado como «sin publicar».

### ▶️ P1 — Cada sección declara, EN LA PANTALLA, qué hace y qué ejecuta

Lo mínimo, en el encabezado de cada sección: **una línea de qué resuelve** y, si tiene botones que
escriben, **qué toca cada uno, dónde, y si se puede volver atrás**.

Cómo hacerlo sin escribir 55 textos sueltos:
- El registro de secciones ya existe y ya está amarrado por `tests/agents-mapa-secciones.test.ts`.
  **Sumarle dos campos obligatorios: `queHace` y `queEscribe`** (este último `null` si la sección
  sólo lee). Un test que exija los dos, igual que hoy exige que la sección figure en el mapa.
- Las acciones de Meta ya tienen la mitad hecha: `lib/meta-ads/acciones.core.js` tiene `rotulo`
  («pausar o activar», «cambiar el presupuesto diario») y `reintentable`. **Falta que eso se lea en
  la pantalla ANTES de apretar**, no sólo en el modal de confirmación. ▶️ Sigue pendiente: la zona
  monta los botones en la fila pero el rótulo y el «¿se puede volver atrás?» se siguen leyendo recién
  adentro del modal. Y en el de presupuesto falta el aviso de si el paso **reinicia el aprendizaje**
  —el dato ya lo calcula `aprendizajeDe()` y se muestra en el «por qué» de la celda, pero no en el
  modal, que es donde se decide.

⚠️ **Esto es lo primero porque es lo que pidió el usuario**, y porque sin esto ninguna de las otras
mejoras se descubre.

### 🏁 P2 — HECHO (26-ago-2026): el motor de reglas está PRENDIDO

**`meta_ads_regla` pasó de 0 a 11 filas.** Las prendió Bruno con el script, verificado por relectura.
El cron de las 07:50 ya no corre en vacío: el simulacro del mismo día deja **4 hallazgos** —
`GIRLHOOD FRIO - INTERESES 1` al 156% del techo, `AD01 - UNBOXING LOCAL` vendiendo dos días después
de pausado, `AD02 - GIRLHOOD COLLECTION` con el CTR 31% abajo, y el radar de Zattia.

🔴 **Y prenderlas destapó dos defectos que ningún test veía, los dos del mismo tipo: un número que
existe pero no significa.** Están contados en `docs/secciones/meta-ads.md`:
1. el **piso derivado de UNA sola compra** ($330.528 en Stunned) dejaba la regla **prendida y muda**;
2. la **fatiga miraba una semana**, donde el desgaste no se ve, y confirmaba con la dirección sin la
   magnitud ⇒ decía «Está quemado» sobre una caída del CTR del **2%**.

🔑 **Los dos los encontró EJERCER —calibrar marca por marca y correr el simulacro—, ⛔ no la suite.**
Es la tercera vez seguida en este módulo.

▶️ **Lo que queda del motor** son los 3 cortes de la tabla de abajo que siguen en 🔴, y **los dos
presets que quedaron afuera a propósito**: `gastos-hormiga` (pide `roas_objetivo`, la vara que este
repo decidió no usar) y `ganador-escalar` (pide `techo_diario_crudo`, que es plata y la firma Bruno).

<details><summary>Cómo se prendieron, y con qué diales</summary>

**El detalle de la calibración (26-ago)**

🔑 **El techo quedó enganchado**: sale de la ficha de rentabilidad de la marca (`desdeFicha`), así
que `cpa_maximo` ya no es un dial huérfano y **el corte principal se prende sin que nadie elija un
número**. Y `leerTechos()` es una sola lectura para los cuatro que la usan. El detalle, la
verificación contra la pauta real y por qué la regla es más exigente que la pantalla:
**`docs/secciones/meta-ads.md`**. Los cortes:

| corte | ¿hay preset? |
|---|---|
| 3 días de gasto con **0 compras** → apagar | ✅ `freno-emergencia` (ventana 3 + `gasto_minimo`) |
| CPA > techo × 1,5 en 5 días → apagar | 🆕✅ `costo-alto` — **el corte principal, ya corre** |
| ≥95% del tope **y** CPA < 75% del techo → escalar +20% | ✅ existe (`ganador-escalar`, corta por COSTO si la marca tiene ficha) — ⛔ **sin prender**: pide `techo_diario_crudo`, que es plata |
| celda de test — **ver «La regla del test» abajo**, corregida por Bruno el 26-ago | 🔴 **no existe**, y antes hace falta poder **marcar una celda como test** — no hay dónde guardarlo |
| CPM del núcleo +15% contra la semana previa | 🔴 **no existe**, y con esta forma no debería: es un tripwire **de la línea** y todos los detectores son por objeto |
| pedidos de Tienda Nube/día contra la meta de Norte | 🔴 **no existe**: cruza fuera de la foto, y correr sólo sobre la foto es lo que hace que las reglas anden **sin token y sin cupo** |

### 🔑 La regla del test — LA VERSIÓN VIGENTE (26-ago-2026, la fijó Bruno)

⛔ **Deroga a la de «$10.000 en UN día · 0 muere · 1 sigue · 2+ aprobado»**, que estuvo escrita en
la memoria de las sesiones y en este archivo. Bruno: *«para mi son dos dias la puerta. 2/3 sigue
4/5 aprobado / 6 escalar»*.

**Plata: $10.000/día × 2 días = $20.000.** Se lee **el 2º día** — el 2º día es el que habla de la
pauta. 🔴 **Manda el TOTAL, no el diario**: se puede bajar el diario estirando los días
($5.000 × 4 días = los mismos $20.000, mismas puertas). ⛔ **Lo que no se puede es bajar el total**,
porque las puertas son cuentas de compras. Medido con Poisson contra el techo de BDI ($7.641):

| presupuesto | total | mata una pieza que está JUSTO en el techo |
|---|---|---|
| $2.000/día × 2 | $4.000 | **90%** — no es un test, es una lotería |
| $5.000/día × 2 | $10.000 | 62% |
| $7.500/día × 2 | $15.000 | 42% |
| **$10.000/día × 2** | **$20.000** | **26%** ← el piso |

**Las puertas, por compras acumuladas al 2º día: 0-1 muere · 2-3 sigue otra tanda · 4-5 aprobado ·
6+ escalar.** Cómo se porta (Poisson, $20.000, techo $7.641):

| lo que la pieza REALMENTE cuesta | muere | sigue | aprobado | escalar |
|---|---|---|---|---|
| $3.400 (44% del techo) | 2% | 14% | 30% | **54%** |
| $5.000 (65%) | 9% | 34% | 35% | 21% |
| **en el techo, $7.641** | **26%** | 47% | 22% | 5% |
| 2× el techo | 62% | 33% | 4% | 0% |
| 3× el techo | 78% | 21% | 1% | **0%** |

🔑 **Un desastre de 3× el techo escala el 0% de las veces** — la regla vieja lo aprobaba el 39%.
✅ **El `1` MUERE — cerrado por Bruno el 26-ago**: *«si es 20mil de gasto y hizo 0 o 1 venta,
muere»*. Se evaluó mover el `1` a «sigue» (bajaba los falsos muertos del 26% al 7%, a cambio de que
una pieza de 2× el techo se llevara una 2ª tanda el 38% de las veces) y **se descartó**. ⇒ **la
regla está COMPLETA: no queda nada abierto en las puertas.** El 26% de falsos muertos es el precio
aceptado, y es el error barato: matar una pieza buena cuesta la oportunidad, escalar una mala quema
plata todos los días.

🔴 **El 1er día de una celda creada ESE MISMO día es PARCIAL y no cuenta.** `TEST IP AZUL BROAD` se
creó el 25-ago y gastó $3.612 de sus $10.000 (36%): su primer día completo fue el 26. Leerlo como
«dos días, 0 compras ⇒ muere» es matarlo antes de que corra el test.

🔑 **«6 compras» y «$2.000 por compra» NO son la misma puerta, y gana la de las compras.** A
$20.000, 6 compras = $3.333 (44% del techo) y $2.000 = 10 compras (26%). Una pieza que de verdad
cuesta $2.000 llega a 6+ el **93%** de las veces pero a 10+ sólo el **54%** ⇒ cortar por
«$2.000 observado» se pierde la mitad de las piezas que hay que escalar. **El costo por compra del
test no es una puerta: dice cuánto AIRE tiene la celda para escalar.** Con la elasticidad medida
(0,54 ⇒ el costo sube con el gasto^0,46), una celda a $2.000 aguanta **18× su presupuesto** antes de
tocar el techo — y el `TOPE_ESCALONES = 6` del código la frena en 3× ($3.308, 43% del techo).
⚠️ Ese 18× es optimista: la elasticidad se midió sobre la cuenta entera, y **una celda sola satura
su público más rápido**. ▶️ Vale revisar el tope para celdas que arrancan muy abajo.
### 🔑 La regla del ESCALADO — la VENTANA no puede cruzar un cambio de presupuesto (3-sep-2026)

**Escalar pide las TRES de siempre** —CPA < 75% del techo, entrega ≥ 85% en días cerrados,
frecuencia que no se esté yendo— **y el paso es de 20% MÁXIMO**, porque cada cambio reinicia el
aprendizaje del conjunto. Esta sección agrega **la cuarta, que es sobre QUÉ DÍAS se miden esas
tres**. ⛔ No deroga nada de arriba.

🔴 **La ventana arranca en el ÚLTIMO CAMBIO DE PRESUPUESTO del objeto, no hace 7 días.** Un cambio
parte la historia en dos regímenes distintos y promediarlos **miente**: da el CPA de un presupuesto
que ya no existe.

**El caso que la fijó — 3-sep-2026, lo objetó Bruno**: *«si se le realizó el escalado días previos,
el análisis tiene que ser cómo rindió luego del escalado previo, no un análisis de ventas de los
últimos 7 días»*. El parte ofrecía escalar **GIRLHOOD FRIO - INTERESES 1** con *«CPA $4.125 = 54%
del techo»*. Se le había subido el presupuesto **el 1-sep** ($8.640 → $10.368, +20%). Los días
cerrados **desde ese escalón** eran dos:

| día | gasto | compras | CPA |
|---|---|---|---|
| 1-sep | $10.800 | 3 | $3.600 |
| 2-sep | $10.763 | **0** | — |
| **desde el escalón** | **$21.563** | **3** | **$7.188 = 95% del techo ($7.595)** |

⇒ **no pasaba el < 75%: estaba al 95%.** El «54%» salía de que la ventana fija se comía el 29 y
30-ago, **anteriores al escalón**, cuando corría a $8.640 y compraba a $1.726 y $3.408. Escalar así
es subirle plata a un escalón **que todavía no devolvió nada**.

🔴 **Y un escalón con menos de 2 días CERRADOS no se lee**: no es que rinda mal, es que **no hay
lectura todavía**. Mismo espíritu que el 1er día parcial de una celda de test.

✅ **Contracaso, el mismo día**: **GIRLHOOD FRIO - COPY B** sí pasó, y por el motivo contrario — su
último cambio fue el **26-ago** (−20% a $8.000) y **nunca se tocó desde entonces**, así que los 7
días del 27/8 al 2/9 son **un tramo homogéneo al mismo presupuesto**: $56.513 / 13 compras =
**$4.347 = 57% del techo**, entrega 101%, frecuencia plana 1,04-1,10. Ésa es la lectura que vale.

🔧 **Está en el código**: `herramientas/parte-del-dia.mjs` del repo `analista-meta`
(`ultimoCambioDePresupuesto`). El parte ahora imprime, debajo de cada candidato, **en cuántos días y
desde qué fecha lo midió**, y contra qué escalón.

🔴 **CORRECCIÓN de la misma tarde**: se escribió acá que «A BAJAR sigue con ventana fija». **Es
falso** — `A BAJAR` se alimenta del MISMO array `cands` que `A ESCALAR`, así que quedó alcanzada por
el cambio sin que nadie lo pidiera. Se vio a las 18:26 del 3-sep porque **dos veredictos de bajada
cambiaron**: FUNDAS MENOS 15MIL pasó de 221% (PAUSAR) a 117% (−20%) —el 221% mezclaba días
anteriores a su propio −20% del 1-sep— y apareció TEST BROAD BDI a 208%. 🔑 **La lección no es el
error de tipeo: es que una ventana compartida propaga el cambio a secciones que no se están
mirando.** ⇒ al tocar `cands`, revisar quién más lo consume.

🔴 ▶️ **ABIERTO, y lo destapó esa propagación: el umbral de PAUSAR (≥150%) NO tiene piso de
observaciones.** Se calibró sobre ventanas de 5-7 días; con la ventana recortada al post-escalón,
**2 días y 1 compra alcanzan para pedir una pausa**. Caso real, 3-sep: `TEST BROAD BDI - 06/05` se
escaló el 1-sep ($6.552 → $7.862) y el parte lo mandó a PAUSAR con $15.771 / **1 compra** = 208%…
mientras que **en los 5 días ANTERIORES al escalón iba a $31.927 / 6 compras = $5.321 = 70% del
techo**. Lo que corresponde ahí ⛔ no es pausar: es **revertir el escalón** (−20%: $7.862 → $6.552),
al presupuesto donde rendía. ⇒ mientras no haya piso, **una pausa medida en menos de 3 días o menos
de 3 compras se lee como "revertir el escalón", no como "matar"**.

⚠️ Sólo se miran los últimos 10 días: si el último cambio quedó fuera de esa ventana, se toma como
que no hubo cambio, que es lo correcto.


### 🆕 ▶️ ZATTIA: se termina la SALE y entran PRIMAVERA-VERANO y la FERIA (3-sep-2026, dictado)

**Lo que viene, en palabras de Bruno**: la sale *«ya está terminando»*; la semana del **8-sep**
arranca la **feria** —*«montar la feria»*— y además la **temporada primavera-verano**, con todo
nuevo. 🔑 **La feria ⛔ NO es sale**: es otra propuesta, no la continuación de la que está corriendo.

🔴 **Zattia es UN SOLO conjunto** (`TEST INTERESES 1 - ZATTIA 07/05`). Bajarlo o apagarlo es bajar o
apagar **la línea entera**, no una celda. Hoy quedó en **$7.760/día** (−20% del 3-sep, aplicado y
verificado).

⛔ **NI PV NI LA FERIA SE CUELGAN DE ESE CONJUNTO.** Es el 🔴 medido del 28-ago, en la sección «La
FORMA del test» de más arriba: en los **10** conjuntos donde se sumó un aviso a uno que **ya
gastaba**, el incumbente se llevó el **100%** de los dos primeros días —10 de 10— y la pieza nueva
se quedó con **$0 en 8 de 10**. Ese conjunto viene gastando $93.376 en diez días ⇒ una pieza de PV
metida adentro **no sale al aire**, y a los dos días se concluye «PV no funciona» cuando nunca
corrió. **Van en conjuntos NUEVOS.**

⛔ **Y PV y la feria tampoco comparten conjunto entre sí**: arrancando juntas la #1 se lleva el 79%
y la #2 el 20%. Son dos propuestas con público y mensaje distintos; mezclarlas es no poder leer
ninguna. **Dos celdas separadas, arrancadas a la vez.**

▶️ **Las dos preguntas abiertas, las dos de Bruno:**

1. **La plata.** Zattia queda en $7.760/día. Dos celdas de test son **$10.000/día cada una por dos
   días** ⇒ **más que triplica** la línea mientras la sale todavía corre. ¿Van las dos juntas, o
   primero PV y la feria después?
2. 🔴 **¿La feria es PRESENCIAL?** *«Montar la feria»* suena a stand físico. Si lo es, **el
   instrumento no sirve**: el techo de Zattia ($4.428) es por **compra ONLINE**, y una pauta que
   trae gente al lugar ⛔ no genera esa compra. La regla del test la leería como «$20.000, 0
   compras ⇒ MUERE» **a los dos días, funcionando perfecto**. ⇒ **antes de prenderla** hay que
   decidir contra qué se la mide (visitas al lugar, mensajes, alcance local), o queda afuera de la
   regla del test explícitamente.

📌 **Por qué el −20% de hoy fue el único toque**: el aprendizaje de ese conjunto se pierde igual
cuando entre lo nuevo, así que el paso salió gratis; lo que se compró con él es llegar al estreno
con el público **menos quemado** (venía en frecuencia 1,65-1,79 diez días seguidos, con el alcance
cayendo de 3.981 a 2.017). ⚠️ **Si la feria REUSA este conjunto**, entonces ⛔ no se lo toca otra vez
antes del arranque: cada cambio reinicia el aprendizaje.

### 🔴 REGLA DE INSTRUMENTO — el snapshot tiene una VENTANA CIEGA de 21:00 a 24:00 (3-sep-2026)

**Un cambio de presupuesto o una PAUSA hechos después de las 21:00 hora argentina ⛔ NO quedan
registrados en la foto de ese día.** El monitor sigue mostrando el valor viejo y el objeto sigue
figurando `ACTIVE`.

**Por qué.** `snapshot-meta.mjs` parte las filas en dos lotes: sólo la fila de **HOY** lleva las
columnas de configuración (`CONFIG_COLS` = objetivo, estado, estado_efectivo, estado_real,
**diario_crudo**); las demás van sin ellas, a propósito, para que releer los últimos días no pise el
presupuesto correcto de ayer con el de hoy. Y **`hoyLocal = isoDia(new Date())` usa la hora del
runner, que en GitHub Actions es UTC**. Pasadas las 00:00 UTC (21:00 en Argentina) el script cree
que «hoy» es el día siguiente ⇒ la fila del día que de verdad está corriendo cae en el lote **sin
configuración**, y la fila del día nuevo no se escribe porque Meta todavía no tiene métricas para
una fecha que, en la zona de la cuenta, no empezó.

**Cómo se descubrió, y por qué importa.** El 3-sep a las 22:03 Bruno aplicó un −20% en
`TEST INTERESES 1 - ZATTIA 07/05` ($9.700 → $7.760) y se sacó una foto para verificarlo: seguía
diciendo **$9.700**, y ningún presupuesto de la cuenta figuraba cambiado. 🔑 **La foto no desmentía
el cambio: no podía verlo.** La prueba de que la fila igual se reescribió es que el `spend` de Zattia
del 3-sep sí se actualizó ($5.557 → $7.669) y el `capturado_at` quedó en 01:03Z — **métricas nuevas,
configuración vieja**.

⇒ **Cómo se trabaja mientras esto esté así:**
- ⛔ **Después de las 21:00 no se verifica un cambio de config contra la foto.** Se verifica a la
  mañana siguiente, cuando UTC y la cuenta vuelven a coincidir.
- 🔴 Y al revés, que es lo peligroso: **un `ACTIVE` o un presupuesto leídos en esa franja pueden ser
  de hasta 3 h antes.** Vale para el parte del día y para cualquier regla que se apoye en el estado.
- ▶️ **El arreglo**: `hoyLocal` tiene que salir de la **zona de la cuenta** —`timezone_name`, que el
  propio script ya trae en `me/adaccounts`— y no de la hora del runner.

### 🔑 La FORMA del test — cuántos avisos por conjunto (28-ago-2026)

La sección de arriba dice **cuánta plata y qué puertas**. Ésta dice **cómo se agrupan los avisos**.
⛔ **No deroga nada de arriba**: el total de $20.000 y las puertas por compras siguen mandando.

**De dónde salió.** El 28-ago la consultoría que paga Bruno propuso **testear 3 avisos dentro de un
mismo conjunto** y, si uno se lleva todo el presupuesto, **aislar a los otros dos**. La primera
respuesta de la sesión fue que eso no servía, apoyándose en el *«Meta no reparte: la pieza #1 se
lleva el 80%»* del 26-ago. **Bruno lo objetó: *«esos testeos los hicimos luego de tener aprendizaje
en el CDA, no los arrancamos al mismo momento»*. Tenía razón y la medición vieja estaba
contaminada** — mezclaba dos casos que se portan al revés. Es, además, la misma regla que traía la
consultoría: *«los testeos son siempre en paralelo, nunca meter en uno que ya tenga aprendizaje»*.

🔑 **Re-medido el 28-ago con `scripts/medir-reparto-conjunto.mjs`** —queda para volver a correrlo,
es la partición y no el promedio— sobre `meta_ads_snapshot_dia`, nivel aviso, 11-may→28-ago. De 23
conjuntos con 2+ avisos se descartan **8 censurados** (arrancaron en el 1er día de la foto o antes:
no se sabe cuándo empezaron de verdad). Quedan 15, partidos por **cuándo arrancó cada aviso**, y
mirando **los 2 primeros días**, que es la ventana del test:

| | conjuntos | cuota de la #1 (mediana) | #1 ≥90% | la #2 se quedó con |
|---|---|---|---|---|
| **escalonado** — el aviso se sumó a un conjunto que ya gastaba | 10 | **100%** | **10/10** | **$0 en 8 de 10** |
| **arrancaron juntos** — misma cohorte inicial | 5 | **79%** (min 62%) | 1/5 | ~20% del gasto |

🔴🔴 **El caso escalonado es total: en los 10 conjuntos el incumbente se lleva el 100% de los dos
primeros días.** Poner una pieza nueva al lado de una que ya corre ⛔ **no la testea: no sale al
aire**, y después se concluye «no funcionó» cuando nunca corrió. Casos: la segunda pieza recibió
**$0** en 8 de 10, y **$47** en otro. Precedente: *«el duelo del 15-ago NO OCURRIÓ»*.

✅ **Arrancando juntos es otra cosa: la #1 se lleva 79% y la #2 se queda con ~20%.** ⚠️ Y la
concentración **se agrava con los días**: a 7 días la mediana sube de 79% a 83%. ⇒ **la ventana
corta del test juega a favor.**

🔑🔑 **PARA QUÉ SIRVE EL CONJUNTO COMPARTIDO — lo fijó Bruno el 28-ago, y es lo que ordena todo lo
de arriba:** *«testear de a 2 o 3 sólo sirve para encontrar al ganador, y aislarlo. El resto va a
tener su oportunidad más adelante cuando se cree otro CDA, porque poco presupuesto gastado no quiere
decir que va a morir ahí»*.

⇒ **Es un BUSCADOR, ⛔ no un juez.** La sesión venía tratándolo como un descarte —«¿alcanzan las
impresiones de la #2 para leerle el CTR?»— y esa pregunta **no hay que hacérsela**: a la #2 no se la
lee. La concentración de Meta **es** la selección: se queda con la que puede entregar mejor, esa se
aísla, y las otras vuelven al banco sin veredicto.

**⇒ Lo que queda decidido:**

1. ⛔ **NUNCA sumar un aviso a un conjunto que ya gasta.** Medido: 100% al incumbente, 10 de 10. Esto
   vale para cualquier prueba, no sólo para las formales. Lo que se prueba se arranca **a la par**.
2. ✅ **2 o 3 piezas en un conjunto nuevo, arrancadas el mismo día**, a los $20.000 / 2 días de
   siempre. Con 3 hay más chances de que asome la buena, y ⛔ **no importa** que la #3 se lleve el
   6%: no se la va a leer.
3. 🔑 **El ganador sale con su lectura HECHA.** Se lleva el 79-100% ⇒ **$16.000-20.000 de los
   $20.000**: es prácticamente la celda entera. ⇒ **el buscador no cuesta una celda extra, ES la
   celda** — y a la salida ya tiene compras acumuladas contra las puertas. Después se aísla, y ⛔
   **sin subirle el presupuesto**.
4. 🔴🔑 **Las que no gastaron ⛔ NO MUEREN Y NO SE ANOTAN COMO PROBADAS.** Gastar poco ⛔ no es un
   resultado: vuelven al banco de piezas y les toca **su propio conjunto** más adelante. ⚠️ El
   riesgo operativo es que queden registradas como «testeadas y no funcionó» —ya pasó: *«el duelo
   del 15-ago NO OCURRIÓ»*— ⇒ **al cerrar la tanda hay que dejar escrito que no tuvieron veredicto**,
   no dejar que el silencio se lea como fracaso.
5. ⚠️ **n = 5.** Es lo que hay. Vale para decidir, ⛔ no para dar por cerrado; se re-mide cuando haya
   más conjuntos arrancados a la par.

▶️ **Lo que queda ABIERTO y es la pregunta de fondo del método: ¿la que Meta elige temprano es la
que más vende?** La concentración se decide en las primeras horas con señal de **clicks**, ⛔ no de
compras. Que eso sea un buen proxy es **plausible acá** —el desgaste medido en esta cuenta aparece
como CTR cayendo con el CPM clavado— pero ⛔ **no está medido**. Se puede medir hacia adelante:
anotar a quién eligió Meta en cada tanda y comparar con el costo por compra que esa pieza saca
después, ya aislada.

**El rescate** — para el que quiera darle su turno a una pieza que no gastó, ya sea en la tanda de
arriba o en un conjunto viejo que quedó con varios avisos adentro:

- El **ganador se queda donde está** y ⛔ **sin subirle el presupuesto** — subirlo le resetea el
  aprendizaje.
- El que no gastó **sale a conjunto propio**. ⛔ Si son dos, **NO van juntos al mismo conjunto
  nuevo**: se repite el reparto y uno vuelve a quedar mudo. **Uno por conjunto.**
- ⚠️ Y esto ⛔ no es urgente: la pieza que no gastó **no perdió nada**, sigue entera en el banco. El
  turno se le da cuando haya presupuesto libre, no para «cerrarle el caso».
- 🔴🔑 **El aislado ⛔ NO se pauta «con el mínimo».** La consultoría dice mínimo y eso **choca con la
  puerta**: a $3.000/día junta $6.000 en 2 días, saca 0-1 compras y «muere» — **muerto por falta de
  plata, no por malo**, que es el defecto que se está reparando. O va a **$20.000 totales** y le
  corre la puerta, o **se acepta que no tiene veredicto**. Las dos cosas juntas, no. (Mismo
  invariante de arriba: **manda el TOTAL**.)
- 🔴 **Duplicar el conjunto le prende el CATÁLOGO solo** ⇒ chequearlo **antes** de contar el
  resultado, o el aislado no mide la pieza, mide otra cosa.
- 🔴 Vale igual **el 1er día parcial**: el día en que se crea la celda no cuenta.

⚠️ **Lo que la forma ⛔ no arregla: cuánto se le puede creer al ganador.** Sale del conjunto con
$16.000-20.000 encima, así que **sí** tiene lectura contra las puertas — pero $20.000 compran 0-4
compras y la diferencia entre 1 y 3 sigue siendo ruido. Eso ⛔ no lo causa el agrupamiento, lo causa
el **TAMAÑO DE MUESTRA**, y sin más plata por celda no hay forma que lo arregle. Lo que sí baja la
exposición diaria es **estirar el diario** ($5.000 × 4 días, mismos $20.000).

🔴 **Y para el escalado (CBO con los ganadores):** CBO reparte entre conjuntos, pero **adentro de
cada uno sigue valiendo el 79/21**. Además reparte hacia el que ya gana, y hoy **una sola pieza
(`AD02 GIRLHOOD`) es el 52% del gasto de BDI** ⇒ acelera el desgaste de la única pieza que sostiene
la cuenta. Si se va a CBO: 5-6 avisos y **al menos 3 piezas nuevas adentro**.

🔑 **El marco: la forma del test no fabrica piezas.** El cuello medido son las PIEZAS —CTR −42% con
CPM clavado, ninguna pieza virgen, ~$38.000/día libres y ninguna celda nueva esperando—. Ninguna
grilla reemplaza tener **4-6 piezas nuevas con ángulos distintos**.

**Los once renglones que se prendieron**, calibrados contra la pauta real antes de tocar nada. La
columna que importa es **7 días**, que es el ruido que iba a llegar por la mañana; los 90 son casi
todos objetos que ya están apagados:

| línea | preset | dial | saltos 7d | 90d / objetos |
|---|---|---|---|---|
| bdi | `costo-alto` | — | **8** | 25 / 7 |
| bdi | `freno-emergencia` | — | **10** | 59 / 8 |
| bdi | `atribucion-tardia` | — | **10** | 12 / 3 |
| bdi | `fatiga` | `frecuencia_maxima 1.3` | 5 ⚠️ | 15 / 1 |
| bdi | `sin-avisos` | — | 0 | 0 |
| zattia | `freno-emergencia` | — | **6** | 54 / 2 |
| zattia | `atribucion-tardia` | — | **2** | 2 / 1 |
| zattia | `fatiga` | `frecuencia_maxima 1.6` | 4 ⚠️ | 15 / 1 |
| zattia | `costo-alto` | — | 0 | 6 / 2 |
| zattia | `sin-avisos` | — | 0 | 62 / 1 |
| stunned | `sin-avisos` | — | 0 | 8 / 1 |

⇒ **~5 hallazgos por mañana entre las tres marcas.** Es una lista que se lee, ⛔ no un tablero que se
ignora. ⚠️ **Las dos filas de `fatiga` son de ANTES del arreglo de la ventana** —eran casi todas
falsos positivos por caídas del tamaño del ruido— y hoy dan menos: en la corrida del 26-ago queda
**una sola**, `AD02 - GIRLHOOD COLLECTION`, y la de Zattia se cayó sola porque su CTR venía SUBIENDO.

🔑 **Los diales de `fatiga` no son un número elegido: son el CODO de la curva de frecuencia.** En BDI,
`1,2` arrastra 8 avisos y `1,3` deja **exactamente uno — `AD02 - GIRLHOOD COLLECTION`**, que es el 52%
del gasto de la marca. En Zattia la curva es plana de `1,3` a `1,6` ⇒ va `1,6`, el más alto que no
pierde nada.

</details>

▶️ Y una segunda, en la otra pantalla: **Zattia corta contra un techo que hoy no aplica** —su ficha
está cargada a precio de LISTA y la tienda está en liquidación— ⇒ la regla hereda la ficha, que es
como tiene que ser, y **arreglar la ficha arregla la regla**.

🏁 **Y el cartel del bloque vacío dejó de mentir** (26-ago, 4ª tanda): decía «no hay reglas cargadas»
con el texto clavado y siguió diciéndolo la tarde en que se prendieron las once. Ahora el motivo se
**mide** (`silencioDeReglas`): sin reglas · prendidas pero todavía sin correr · corrieron y no
encontraron nada — **sólo la última significa «está todo bien»**, y lleva la fecha de las dos puntas.
El detalle, en `docs/secciones/meta-ads.md`.

### 🏁 P3 — HECHO (26-ago-2026): la zona de Rendimiento

`/meta-ads` es la zona: veredicto por celda contra el techo, el desgaste, el aprendizaje, el cruce
con los pedidos reales y los botones en la fila. El menú bajó de **once entradas a cuatro**
(Rendimiento · Producir · Analizar · Configurar). Detalle y verificación en
`docs/secciones/meta-ads.md`.

🔑 **Y quedó resuelta la tensión que este archivo tenía con la ficha**: aquélla defendía que el parte
fuera un botón (cinco llamadas a Graph, el cupo es un porcentaje) y esto pedía que fuera la pantalla.
**La pantalla no es el parte: es la FOTO** —se pide sola, es barata, tiene 90 días y contesta con el
token vencido—, y el parte quedó siendo el botón que trae el día EN CURSO, que es lo único que sólo
existe en Graph.

### 🏁 P4 — HECHO (26-ago-2026): los hallazgos salen a buscar a Bruno

**Los hallazgos entran al badge del sidebar y al bloque de Inicio**, como noveno aviso derivado
(`avisosDeHallazgo`). ⛔ No hace falta acordarse de entrar a `/meta-ads`, y el clic lleva a la zona
**con la línea puesta**.

🔴 **El agujero estaba medido:** el motor escribió sus primeros cuatro hallazgos a las 07:50 —uno, un
conjunto comprando al **156% del techo**— y a media tarde los cuatro seguían en `nuevo`. Nadie abrió
la sección en todo el día. Es exactamente lo que dice el punto 4 de este archivo: con un solo
operador, **lo que no le llega no existe**.

🔑 **Y ⛔ no contradice el «no hay pantalla nueva de alertas» de la ficha: lo cumple.** No es un
segundo lugar al que entrar — es el contador que ya está en todas las pantallas. Accionar sigue
pasando en un solo lado.

🔴 **Construirlo destapó el tercer «número que existe y no significa» del módulo en dos días:**
`veces` decía «días seguidos» y contaba **filas**, así que un hueco en el medio se leía como racha. De
arreglarlo sale `desde` —cuándo EMPEZÓ—, que es el `ts` del aviso: con la fecha del último renglón el
aviso diría «apareció hoy» todas las mañanas y el «NUEVO» no se apagaría nunca. Detalle en
`docs/secciones/meta-ads.md`. **16 mutantes, 16 muertos.**

🏁 **Y el mail también** (26-ago, 6ª tanda). El reloj de las 07:50 manda un mail después de escribir
los hallazgos. 🔑 **Lleva los ABIERTOS y ⛔ no los de hoy** —si no, un hallazgo del lunes que nadie
accionó desaparece del mail del martes—, y **con cero ⛔ no manda nada**, porque un mail diario que
dice «no hay nada» enseña a no abrirlo. Detalle en `docs/secciones/meta-ads.md`.

🔴 **Va por el MISMO SES que ya usa `areben-mailer`** —lo corrigió Bruno—: dominio verificado, DKIM,
fuera del sandbox, 50.000/día de cuota. ⛔ No hizo falta cuenta nueva ni verificar nada. **El mail ya
se mandó de verdad** con los 4 hallazgos reales.

🏁 **PRENDIDO.** Bruno cargó los 3 secrets y **se verificó CORRIENDO EL WORKFLOW**, ⛔ no la Mac: el
log de la corrida dice `Mail mandado` con su `MessageId`. ⚠️ El `--simulacro` ⛔ no sirve para esto
—sale antes de tocar las credenciales—, así que la prueba tenía que ser una corrida real.
▶️ Falta que Bruno confirme que **llegó a la bandeja y ⛔ no a spam**: es lo único que desde acá no se
puede ver.
⚠️ Lo limpio sería un usuario de IAM con `ses:SendEmail` y nada más, en vez de reusar la clave del
mailer. Es consola de AWS y queda anotado.

### ▶️ P5 — Traducir el idioma

Glosario mínimo y consistente en pantalla: conjunto → «celda/público», `estado_real` → «¿está
entregando?», etc. Barato y se nota enseguida.

### 🆕 ▶️ P6 — Lo que queda de las seis tandas de Meta (30-ago-2026)

Bruno caminó `/meta-ads` entero y salieron seis tandas, **todas en prod y verificadas** (el relato
completo, en `docs/secciones/meta-ads.md`; acá sólo lo que **falta**).

**🔴 Manos de Bruno — caminar la pantalla.** El login pide contraseña, así que esto ⛔ no lo puede
hacer nadie más. Cinco cosas que sólo se ven abriéndola:
1. Que la marca **venga preseleccionada** con la del sidebar, y que si elegís «Todas» a mano **se
   quede** (es el caso que el default en `'todas'` hacía imposible).
2. Que `Hoy •` cambie los **números** y ⛔ no el **veredicto**, y que el cartel de arriba lo diga.
   🏁 **Arreglado el 30-ago (tarde), y era un defecto real que Bruno cazó acá**: *«cambio la fecha
   en rendimiento con hoy, ayer o hace 3 días pero no cambian los resultados»*. La fila de KPIs
   salía **siempre de la foto** —`fusionarVivo` pisaba las celdas y ⛔ no los totales— y además
   «Hoy», «Hoy y ayer» y «7 días» le piden a la foto **la misma ventana**, así que las tres hacían
   el mismo pedido. Relato en la ficha. ▶️ **Falta mirarlo**: que «Hoy» mueva el **Gasto** de arriba
   y ⛔ no sólo la tabla, y que diga «Compras · Meta» en vez de «Pedidos reales».
3. Que la fila mida **un renglón**, que el «⋯» cierre con Escape y clickeando afuera, y que la cara
   del anuncio aparezca (**tarda ~6 s la primera vez**: son 257 piezas).
4. Que el hallazgo de `AD01 - UNBOXING LOCAL` —que es de nivel **aviso**— aparezca **adentro de la
   fila de su conjunto**. Es el caso que prueba el reparto.
5. Que Producir ya ⛔ no te explique Rendimiento.
6. 🆕 **El aire de la ficha de Rentabilidad, que desde el 30-ago sale de la foto**: que BDI diga
   **~1,2× de aire** y ⛔ no 2,7×, que Zattia muestre su ventana terminando el **26** y ⛔ no el 29
   (cada línea tiene su último día cerrado), y que **Stunned muestre el costo SIN aire** —su techo
   es el prestado de BDI—. Y que el aviso «la ficha quedó vieja» aparezca en las dos, con el botón
   **«Emparejar la ficha»**.

**▶️ Lo que queda escrito y ⛔ sin hacer:**
- **`link` → `enlace`: 23 rótulos** en Atención, Canjes y Envíos. 📊 Medido. Está prohibido en
  `VOCABULARIO.md` §1.6 y ⛔ **no** en el test — son tres secciones que esta tanda ⛔ no tocó, y
  barrerlas a medias es peor que no barrerlas.
- **§3 (título = sustantivo, ⛔ no frase) sigue SIN test**, y ⛔ no es un olvido: «¿esto es una
  frase?» ⛔ no lo decide un regex. El proxy barato —un `?` en el rótulo— da **46 casos y la mayoría
  son legítimos** (ayudas en voz de pregunta: «¿De qué marca?»). Un test así **nace rojo sobre lo que
  está bien**, y ése es el que alguien apaga.
- 🏁 **«La pieza más grande es el 32%» era el 52%, y la tarjeta se dibujaba NEUTRA — HECHO el
  30-ago (noche).** La concentración agrupaba los avisos por **nombre exacto**, y el mismo video
  corre con la fecha de lanzamiento cambiada, con el `- Copia` de Meta y con el gemelo de
  Advantage+ (`<base> -  ADV+ -18/8`). Como la tarjeta se pinta de aviso recién a partir del 40%,
  **la marca de riesgo estructural más grande de la cuenta salía en neutro**. Ahora agrupa por
  `firmaDePieza()` y dice **«+N nombres»**, para poder vetar una fusión de un vistazo. 📊 El
  instrumento es `scripts/medir-concentracion-pieza.mjs` y **trae el control adentro**: reproduce
  los 32,0% en 1 caja de BDI 18→24-ago antes de medir nada, y si no le da, para.
  ⛔ **Corrige lo que decía este plan**: *«el arreglo es sumarle `creative{id}`»* ⛔ no arreglaba el
  caso —duplicar un aviso crea un creativo nuevo con id nuevo—. ▶️ **Lo que queda es guardar en la
  foto la firma del CONTENIDO** (`video_id` ‖ `image_hash` ‖ `effective_object_story_id`), que
  `lib/meta-ads/creativos.core.js` ya trae viva de Graph para la Biblioteca. Es **hacia adelante**:
  el nombre va a seguir siendo el respaldo de todo lo anterior al día que se prenda.
  ▶️ **La mano de Bruno**: ver la tarjeta en ~52% con el color de aviso. Y las otras cuatro fusiones
  de BDI ⛔ no están verificadas contra el video — la de GIRLHOOD sí, en prod el 26-ago.
- **El puente MAKETA → «Anuncio nuevo»**: una pieza terminada allá ⛔ no llega sola acá. Hoy el camino
  es Drive → arrastrar. ⛔ No lo cubre ninguna de las dos apps.
- 🏁 **«¿Cuánta plata le compra a gente que YA nos conocía?» — HECHA el 30-ago (tarde).** Era el
  único renglón de código que dejó abierto la caminata de Bruno: su objeción al Embudo —*«contesta
  qué etapa está vacía y esa pregunta ⛔ no tiene una acción del otro lado»*—. Nueva pestaña **«Fría
  vs remarketing»** en Analizar, al lado del Embudo: cruza el `targeting` de cada conjunto con la
  plata de la foto. 🔴 **Son TRES públicos y el tercero es el hallazgo**: «abierto» ⛔ **no es «gente
  nueva»** —Meta elige y le habla a los dos—, y si se lleva la mayoría de la plata el veredicto es
  que la pregunta ⛔ no se puede contestar, **con la mano al lado** (excluir compradores en esos
  conjuntos). Relato en la ficha.
  ▶️ 🔴 **La primera apertura ES la medición**: ⛔ no hay token en el entorno local, así que el
  reparto real de BDI ⛔ **no se midió**. La hipótesis a tumbar es que casi todo esté en «abierto».
- ⛔ **El Embudo NO estaba pendiente, y este renglón estaba mal leído** (corregido el 30-ago-2026).
  Decía *«📊 `meta_ads_etapa` en 0 filas»* como si fuera un módulo que nace mudo. 📌 **Esa tabla es
  el OVERRIDE MANUAL**, y lo dice su propio núcleo (`lib/meta-ads/etapas.core.js`): la clasificación
  sale del `objective` de cada campaña vía `ETAPA_POR_OBJETIVO`, y la tabla sólo guarda **las
  correcciones a mano**. ⇒ **0 filas = nadie corrigió ninguna clasificación**, que es lo esperable y
  ⛔ no un agujero. 🔑 **El cero afirma, y acá afirmaba lo contrario de lo que se le leyó**: el
  tripwire —«que esa tabla se mueva»— sigue en pie, pero mide **cuándo el objetivo miente**, ⛔ no si
  el Embudo tiene datos.
  🏁 **Y al medirlo aparecieron DOS cosas que sí eran trabajo, hechas el 30-ago** (relato en la
  ficha): la **premisa del módulo estaba al revés** —decía que toda la pauta es de la primera etapa
  y el 84% del gasto es de la de compra; el agujero real es **MOFU, en cero**— y el Embudo **se
  moría con el token vencido**, cuando el dato ya estaba en la foto. Ahora tiene respaldo y la
  pantalla dice de dónde salió.
  🏁 **HECHO el 30-ago (tarde): el respaldo está EJERCITADO con el token caído de verdad**, y el
  cartel ya estaba en las dos pantallas —el renglón pedía algo que el código tenía—. 15 tests
  nuevos (`tests/meta-etapas-handler.test.ts`, `tests/meta-de-donde-sale.test.tsx`), **8 mutantes
  muertos**. Lo que ⛔ no veía el test del núcleo son las tres decisiones que **sólo toma el
  handler**: cuándo cae a la foto (sin token, y con Graph caído en **todas** las cuentas — con UNA
  sola caída ⛔ **no**, mezclar los dos censos cuenta una campaña dos veces), qué ventana mira (el
  cierre sale de las filas de **conjunto**) y que lo **diga** (`fuente`/`completo`/`motivo`). El
  token vencido se ejerce como lo manda Meta de verdad: **Graph contestando código 190**, ⛔ no una
  variable de entorno vacía.
  ▶️ **La mano que queda es de Bruno**: abrir el Embudo con el token vencido y ver el cartel
  dibujado. El test ve que la pantalla lo **usa**, ⛔ no que se dibuje.
- **Informes**: 2 filas, las dos **sin publicar**. Se quedó como pestaña y ⛔ no subió al menú. Si en
  un mes sigue en dos, se elimina.
- **«Hoy + ayer + anteayer» como una suma sola** ⛔ no se ofrece: pediría cruzar Graph con la foto por
  celda, y ese gesto ya lo contesta la **tira de días**.

⚠️ **Y un rojo que ⛔ NO es de esta tanda**: `tests/seccion-header.test.ts` falla porque
`organizacion` se registró en `SECCIONES` sin entrada en `DESCRIPCIONES` (commit `e0f4eff`).
Verificado: ya fallaba en `HEAD` antes de tocar nada. ⛔ No se arregló desde acá para ⛔ no pisarle el
texto a la sesión que la está escribiendo — **es una línea en `lib/nav.ts`**.

## 4. ✅ CONTESTADO: se construye PARA BRUNO

**Lo contestó Bruno el 25-ago-2026: «todo para Bruno».** El módulo se construye para que **una sola
persona experta decida más rápido**, ⛔ no para que el equipo pueda operar la pauta sin ella.

🔑 **Y eso reordena la lista de arriba**, porque lo escaso pasa a ser el TIEMPO de esa persona, no
su comprensión:

- **P2 (motor de reglas) y P3 (el parte como pantalla) SUBEN a lo primero.** «Qué hago hoy» es
  exactamente lo que le falta a alguien que ya sabe leer los números.
- **P4 (que salga a buscarte) sube también**: si hay un solo operador, lo que no le llega no existe.
  🏁 **Hecho**: el badge del sidebar y el mail de las 07:50. ▶️ Falta la mano de la key.
- **P1 se angosta**: de las dos mitades —«qué hace» y «qué ESCRIBE»— la que sigue valiendo es la
  segunda. No hace falta enseñarle qué es un conjunto; hace falta que antes de apretar sepa **qué
  se toca, dónde, y si se puede volver atrás**. Es lo que pidió textual.
- **P5 (traducir el idioma) BAJA casi a cero.** Era para un lector no experto y no lo hay.

⚠️ Si algún día entra otra persona a operar la pauta, **P5 vuelve y P1 se ensancha**. Anotarlo acá
antes de rehacerlo.

## 5. Fricción concreta ya detectada (chica, y se arregla sola)

- **`prepararPiezas` exige un aviso modelo en Meta para tomar el copy** (`api/_meta-planes.js`,
  `copyDeCreativo` en `lib/meta-ads/pieza.core.js`). Para estrenar un copy nuevo hay que ir a Ads
  Manager a crear un aviso — que es exactamente la fricción que el usuario señala. ⇒ **Aceptar el
  copy en el pedido** (título, mensaje, descripción, destino, CTA) y dejar el aviso modelo sólo para
  la página y el Instagram.
  📊 **Medido el 26-ago-2026 con `TANDA VIDEOS 26-8` (4 videos)**: la tanda salió con el copy del
  modelo en las 4 y hubo que **editar las 4 a mano en Ads Manager**. Lo que más costó no fue el
  texto: fue el **destino**, que viaja adentro del copy — las 4 nacieron apuntando a
  `/fundas/girlhood-collection/` y dos de ellas iban a otra página (`/productos/stellar-case/` y
  `/new-in/`). ⇒ **el campo que más se paga por no poder mandar es el `link`, no el `message`.**
  🔴 Y las ediciones **quedaron en BORRADOR**: releyendo Graph, Meta seguía teniendo el copy del
  modelo cuando ya se las daba por editadas. ⇒ si el plan aceptara el copy, no habría paso manual
  que se pueda olvidar de publicar.

- ✅ **El memo mostraba el estado de la semana ANTERIOR al cambiar de semana** (reportado por Bruno
  el 29-ago-2026, arreglado el mismo día). El chip, la firma del cierre y el botón «Cerrar la
  semana» viven fuera del esqueleto de carga, así que durante los segundos de la lectura quedaba el
  título de una semana con el estado de otra. ⇒ el dato viaja sellado con su semana (`deLaSemana`)
  y el encabezado acepta `estado: null` = "no lo sé", que dice «Leyendo la semana…» y ⛔ no ofrece
  cerrar. 3 mutantes, 3 muertos. El relato está en `docs/secciones/memo.md`.

- ✅ 🔴 **El post-venta ⛔ no tenía UN SOLO NÚMERO que dijera si está midiendo bien** (30-ago-2026).
  Salió el medidor: **reclamos registrados por cada 100 ventas online**, seis meses, por marca, en
  Reclamos (Administración). El relato entero está en `docs/secciones/reclamos.md` § «El medidor».
  📊 **Lo que se ve al prenderlo, medido contra las dos bases**: BDI tiene **2 reclamos sobre 283
  ventas online de agosto** y **Zattia ⛔ NUNCA registró ni uno** (167 ventas online en agosto, 0
  reclamos, y ninguno en toda la tabla). ⚠️ Eso ⛔ **no es una tasa baja: es que el reclamo que se
  resuelve en un chat ⛔ no deja fila** — y por eso el número sale con los meses de atrás diciendo
  *«todavía no se registraban reclamos»* en vez de un cero, que afirmaría lo contrario.
  ▶️ **Lo que sigue estando trabado por falta de datos**: los cuatro diales de la válvula (§5 del
  plan) y las tres decisiones de Bruno (§6) — el piso del retorno, cuánto vale un cupón y el costo
  operativo. Se destraban con un mes de volumen del alta pública, que es la mitad de Darío.

- ✅ 🔴 **El paso 1 del alta pública: la llave orden + mail** (30-ago-2026). Está en `bdi-catalogo`
  (`api/_verificacion-orden.js`), no acá; el relato entero en `docs/secciones/reclamos.md` § «La
  llave del alta pública». 🔑 **No hubo que traer ningún dato nuevo**: Tienda Nube ya mandaba el mail
  del comprador y `mapOrdenTN` lo tiraba una línea después. ✅ Confirmado en las dos órdenes reales
  de BDI (`?mail_diag=1` → `tiene_mail: true`) y caminado en prod: el mail correcto abre, una letra
  cambiada da 404.
  ✅ **Y se cerró el `GET ?orden=N`**, que estaba abierto a internet: devolvía nombre del comprador,
  lo que pagó, forma de pago, envío, seguimiento y cada producto, por un número **correlativo**, con
  el repo público en GitHub. No era una decisión sino un olvido de una migración ya hecha (quedaban
  dos llamadores). Caminado en prod: sin credencial 403, con credencial 200 como siempre.
  ✅ **Caminado en el navegador el mismo día**: `/postventa?tab=reclamos`, orden 21033, aparece con
  sus 2 productos. Nada que hacer acá.

- ✅ **BKL-01: «Borrador» era un mal nombre y encima tapaba DOS estados** (30-ago-2026). El informe
  pedía llamarlo «Pendiente» ⛔ **y esa palabra ⛔ no se podía usar**: en la misma fila, la columna de
  al lado dice *«Pendientes: anular la venta · devolver la plata»*. Y «Sin revisar» tampoco, porque
  `en_revision` es «Para revisar».
  🔴 🔑 **Y abajo estaba lo que el informe ⛔ no vio**: un **cambio decidido vuelve a `borrador` a
  propósito**, esperando que el cliente pague — las dos poblaciones mostraban el mismo cartel, así
  que renombrarlo plano dejaba el defecto intacto con otro nombre. El discriminador **ya existía**
  (`compensacion`, el mismo que usa `alertasDe`). ⇒ «Sin escribirle» / «Esperando que pague», ⛔ sin
  tocar la base. **5 mutantes, 5 muertos + 1 control vivo.** Relato en
  `docs/secciones/reclamos.md` § «BKL-01».
  ⇒ 🏁 **con esto el informe de post-venta del 30-ago queda CERRADO ENTERO: los 10 BKL contestados.**

- ✅ 🔴 **BKL-05, lo último que quedaba del informe de post-venta: el texto largo rompía la tabla**
  (30-ago-2026). El informe señalaba la columna de **pendientes** —que ya estaba arreglada— y el
  desborde real estaba en la **primera columna**, y ⛔ no lo produce el nombre del cliente: **es la
  alerta**. `<Td>` hereda `white-space: nowrap`, así que sale en una línea indivisible y empuja la
  tabla entera.
  🔴 🔑 **Y lo empeoró un arreglo del MISMO DÍA**: el aviso de D4 pasó a ser el texto más largo del
  módulo —**77 caracteres medidos**, 20 más que el anterior— ⇒ arreglar una cosa alargó el texto
  que rompía otra, y los dos salieron verdes por separado.
  ⚠️ **La barra de acciones ⛔ NO desbordaba**: su div es un flex con `flexWrap` y ahí corta
  flexbox, ⛔ no `white-space` — la primera versión del test la daba por rota.
  ✅ `tests/reclamos-tabla-desborde.test.tsx` lo cuida sobre **toda celda** · **3 mutantes, 3
  muertos + 1 control vivo** · el relato en `docs/secciones/reclamos.md` § «BKL-05».

- ✅ 🔴 **La auditoría de post-venta quedó CERRADA: 19 de 19** (30-ago-2026). El último era **D4**,
  y estaba trabado en **B1**, que Bruno contestó ese día: *«se parte en dos — armar la oferta exige
  la decisión, contestarla siempre se puede»*. El relato entero en `docs/secciones/reclamos.md`
  § «D4».
  🔴 **Lo que estaba vivo**: `liberar-decision` borra la resolución y **deja la oferta en pie a
  propósito**, así que existe la fila con oferta viva y ninguna rama guardada (así quedó R-0022).
  Ahí apretar «Registrar que no aceptó» **apagaba las tres formas que el caso tenía de aparecer** —
  el aviso de la oferta, la columna de mensajes, y el reloj de «hay que decidir», que contaba desde
  `updated_at` y **el propio gesto de anotar el «no» lo ponía en cero**.
  🔑 **Y la premisa falsa estaba escrita en tres lugares**: el núcleo, la nota del historial y **el
  confirm de la pantalla**. ⛔ Sin migración · **18 mutantes, 18 muertos** (2 controles inocuos
  vivos) · **18 de 18 caminado contra la base real de BDI**, 3 filas sembradas y borradas y las 2
  reales intactas.
  ✅ ~~Lo que queda de post-venta no es código: son las decisiones de Bruno (`PISO_RETORNO`, cuánto
  vale un cupón, el costo operativo, y los cuatro plazos)~~ — **las cuatro contestadas el 30-ago**
  (B4/B5/B6/B7), en prod y verificadas; ver la entrada del final de este archivo.
  ▶️ **Lo que sigue abierto es «que alguien lo apriete»**: el módulo tiene **2 filas en BDI y 0 en
  Zattia**, así que casi nada de esto lo tocó una persona.

- ✅ 🔴 **El alta pública, paso 2 y paso 3: la puerta que CREA, y LA PANTALLA** (30-ago-2026). El
  núcleo (`lib/reclamos/alta-publica.core.js`) y el servidor (`api/_reclamo.js`, acción `alta`) están
  y probados; el relato entero en `docs/secciones/reclamos.md` § «El alta pública, paso 2».
  🔑 **Lo que hay que saber**: la verificación del mail corre **en el servidor, adentro del mismo
  pedido que crea la fila** —hacerla en el navegador es no hacerla— y los productos salen de la orden
  verificada, ⛔ nunca del body: el cliente manda **índices**. Las cinco opciones son **familias** de
  motivos y entran por el que ⛔ no afirma lo que el cliente no sabe ni enciende un pendiente (por eso
  «todavía no me llegó» entra por `demora` y ⛔ no por `no_llego`).
  🔴 **Y destapó una CUARTA copia de la regla del portal**: `reemitir-token` acuñaba un link nuevo
  para un cambio ya decidido y contestaba «listo», y el portal después le daba **404 al cliente**.
  ⛔ Sin migración · **31 mutantes, 31 muertos** (2 controles inocuos vivos) · ✅ **caminado contra
  PRODUCCIÓN, 16 de 16** (`node scripts/caminar-alta-publica.mjs`), con una fila sembrada y borrada y
  **las 2 reales intactas**.
  ✅ **Y la pantalla salió el mismo día** (`10fc671` + `a468879`): la puerta es **`/reclamo?m=bdi`**
  (o `m=zattia`), **caminada en el navegador contra producción** con la orden real 21148, 1 fila
  sembrada y borrada. 🔑 Fue **la primera pantalla de postventa que se pudo caminar sin Bruno**, y
  ⛔ no por suerte: **el portal ⛔ no pide login**.
  ⚠️ **STUNNED ⛔ no tiene puerta pública, y ⛔ no es un olvido**: sus reclamos vivirían en la base de
  Zattia, donde el freno «un reclamo abierto por orden» compara `(store, orden_tn)` ⇒ dos órdenes
  con el mismo número le contestarían a una persona **el token del reclamo de otra**.
  ✅ **Y por dónde le llega el link, contestado por Bruno el mismo día**: *«mandan la consulta a
  algún canal de comunicación, y le enviamos el link»* ⇒ **lo pega una persona**, ⛔ no un
  automatismo. La puerta estaba abierta y **⛔ no estaba en ninguna pantalla**: quien contesta el
  canal tenía que saberla de memoria, y ⛔ no había mensaje para mandarla —era el único momento del
  circuito sin texto, porque los doce mensajes **cuelgan de una fila** y acá todavía no hay
  reclamo—. Ahora hay dos botones arriba de «Nuevo reclamo», en Reclamos **y en la pantalla del
  local**, que es quien atiende el canal.
  🔴 🔑 **La mitad útil del mensaje es decir qué le va a pedir la puerta**: el número de pedido **y
  el mail con el que compró**. Sin las dos ⛔ no entra, y el link a secas deja a la persona
  rebotando en el primer paso creyendo que no anda.
  **9 mutantes, 9 muertos** + 1 control vivo. El relato entero en `docs/secciones/reclamos.md`
  § «Por dónde le llega el link».
  ▶️ **De Bruno, más adelante**: sumar el canal de reclamos **al mail de la venta o al de
  post-venta** — decidió dejarlo para después.

- ✅ 🔴 **Las cuatro decisiones que trababan post-venta, contestadas — y prenderlas destapó un
  defecto vivo** (30-ago-2026). B4, B5, B6 y B7 de `docs/postventa-auditoria-2026-08-28.md`. Eran
  política, ⛔ no defectos, y el relato entero está en `docs/secciones/reclamos.md` § «Las cuatro
  decisiones de la auditoría».
  🔴 🔑 **Lo que hay que saber, porque cambia números que ya se muestran**:
  **B4** el piso del retorno pasó de ser un **monto por marca** a un **múltiplo de lo que sale
  traerlo** (`MULTIPLO_PISO_RETORNO = 2`) — el monto fijo vivió en `null` en las dos desde que
  existió y **nunca cambió una cuenta**, porque un corte en pesos al lado del flete envejece solo.
  ⚠️ **`2` da vuelta el caso testigo de BDI**: $12.000 recuperables contra $7.500 de costo pasan de
  «conviene pedirlo» a «apenas empata». Se cambia en una línea.
  **B5** el costo operativo es **$1.500 por unidad** en las dos marcas (`COSTO_OPERATIVO_RETORNO`),
  el parámetro pasó a ser **obligatorio y por unidad**, y el techo de un sano de BDI subió de
  $6.000 a $7.500 ⇒ **se le puede ofrecer más**.
  **B6** el cupón vale **×2** (`MULTIPLO_CUPON`): mueve el techo Y el sugerido, y **avisa sin
  trabar** cuando el monto se pasa. **B7** los cuatro plazos, confirmados como estaban.
  🔴 🔑 **Y el hallazgo, que ⛔ no estaba en el informe: el envío SIN CARGAR valía cero.** La
  pantalla lo aplastaba con `Number(envioVuelta) || 0`, así que «sin cargar» y «traerlo es gratis»
  eran el mismo número. Con el costo operativo en 0 ⛔ **no se veía** —contestaba «no perdés plata
  porque vuelva», que suena a veredicto prudente—; con el costo prendido la misma pantalla pasó a
  decir **«Ofrecele $750»**, o sea **plata sugerida sobre un dato que nadie cargó**. Ahora
  `cuentaDescuento` recibe `number | ''` y contesta `falta: 'envio'`, como ya hacía con el PVP de
  feria. ⚠️ **Un 0 tipeado sigue siendo un dato** —«lo trae al local»— y ahí sí queda el trabajo de
  recibirlo que ofrecer.
  ⛔ **Sin migración** (⛔ no hay columnas nuevas) · **17 mutantes, 17 muertos + 2 controles vivos**;
  🔴 **cinco sobrevivieron a la 1ª tanda y los cinco eran reales**, entre ellos el peor: los casos
  del cupón se medían **contra la propia constante**, así que bajarla a 1 los dejaba verdes.
  ▶️ **Quedan B3** (si «Volver a decidir» borra también los montos) **y B8** (si un cambio sale por
  cadete: `VIAS_CAMBIO` lo sigue ofreciendo y Reclamos lo sacó el 27-ago).
  🔴 ▶️ **NO deployado**: el commit está sin pushear y la pantalla ⛔ no se caminó en el navegador
  —el login pide contraseña—; los tres números que cambian se ven en **Reclamos → Decidir → El
  producto**.

- ✅ 🏁 **B3 y B8: las dos últimas decisiones de post-venta, contestadas ⇒ NO QUEDA NINGUNA**
  (30-ago-2026). El relato en `docs/secciones/reclamos.md` y en la § 3 de
  `docs/postventa-auditoria-2026-08-28.md`, que **queda cerrada entera: las ocho**.
  **B3 · «Volver a decidir» ahora borra la decisión ENTERA.** La línea es **qué se DECIDIÓ contra
  qué se MIDIÓ**: se van los cuatro montos, `costo_caso`, `retorno_sugerido`, `devolver_envio`,
  `destino_prenda`, `via_retorno`, `cupon_codigo` y los dos booleanos del retorno; **se quedan** el
  flete, el PVP de feria, `items_correctos`, el escenario **y la oferta de retención** (eso ya lo
  decidió B1: *«contestarla siempre se puede»*).
  🔴 🔑 **Y se borra el destino POR UNIDAD del jsonb junto con la columna**: `destinoDeUnidad` es
  `item.destino || fila.destino_prenda`, así que borrar sólo la columna dejaba a las unidades con
  destino propio contestando por una decisión que ya nadie sostiene ⇒ **media decisión borrada**.
  📊 **Lo que hizo barata la respuesta**: `DecidirReclamo` ⛔ **no prefila ninguno** de los campos que
  se borran (los ocho `useState` que leen la fila son otros) ⇒ limpiarlos ⛔ no le saca nada a nadie.
  ⚠️ **Hoy ninguno se leía con la decisión soltada** —los cuatro caminos vivos están gateados por
  `compensacion`, por los pendientes o por `estado`— y eso ⛔ **no era razón para dejarlos**: una
  columna que dice «lo que costó el caso» sobre un reclamo sin decisión **afirma**. La invariante
  quedó **fijada por test** (`tests/reclamos-soltar-decision.test.ts`).
  **B8 · un CAMBIO sí sale por cadete** y la diferencia con Reclamos es **a propósito** ⇒ la lista
  se mudó de `ArmarCambio.tsx` a `tipos.ts`, **al lado de `VIAS_VIGENTES`**, con el porqué y fijada
  por test: escritas en dos archivos distintos, el próximo que viera la diferencia la iba a
  «emparejar». 📊 ⚠️ **El dato ⛔ NO pudo contestarla**: **0 cambios en toda la historia de las dos
  bases** ⇒ el cero acá significa «no hay nada medido», ⛔ no «no se usa».
  ⛔ **Sin migración** · **12 mutantes, 12 muertos + 2 controles vivos** (uno tenía el **ancla
  repetida** —estaba en las dos funciones del archivo— y hubo que re-apuntarlo antes de leerlo).
  ▶️ **De post-venta queda SÓLO que se use**: 2 reclamos en BDI, 0 en Zattia.

---

## 🆕 MEDIDAS — el flujo para que las saque el local (1-sep-2026, pedido de Bruno)

### 🏁 4-sep-2026 — LA ESTRUCTURA DE LA DESCRIPCIÓN, CERRADA CON BRUNO

Salió de comparar **FALDA SAGE** —una descripción escrita a mano que quedó bien— con la primera
corrida real del módulo. Relato entero en `docs/secciones/gen-desc.md`; acá lo que falta.

**Lo decidido y ya en producción** (`379813b` → `603215e`): cuidados derivados de la tela (5 grupos,
gana la más restrictiva) · segunda tela en la ficha · **sin tela no se redacta ni se publica** ·
tip de look opcional · el párrafo ⛔ no puede nombrar el producto · el detalle en mayúsculas baja a
minúscula palabra por palabra · **al publicar se PISA el texto viejo** · y el prompt le dice de qué
SÍ hablar, con el relleno prohibido.
📊 El párrafo bueno sale **US$0,0014**: los 40 de la tanda del 2-sep son menos de seis centavos.

🏁 **El pie de marca quedó cerrado el 4-sep**: sale de la **orden de compra** (lo contestó Bruno), y
producción propia es la OC cuyo proveedor se llama `ZATTIA` —confirmado por él—. Cubre **220 de 356
publicados (62 %)**; los otros 136 son anteriores al webhook de Ingresos y **la regla falla cerrada:
sin OC, sin pie**. 📌 De la tanda del 2-sep, **ninguno es propio** ⇒ el pie ⛔ no va en esos 40.
▶️ 🔴 **Y falta la MANO: nadie publicó todavía ninguno de la tanda.** El circuito está entero y
caminado hasta el párrafo (JEAN MARINA y BLUSA SOUTH, un intento cada uno, sin problemas del
validador), pero **ninguno se aprobó ni salió a la tienda**. Los **16 mudos con ficha completa** son
los de menor riesgo: no hay texto que pisar.

▶️ ⚠️ **Los `no identifico` quedaron frenados** —TOP SHAPE entre ellos, que ya está publicado—: es
lo que Bruno pidió, pero significa que alguien tiene que volver a mirar esas prendas.

### 🏁 DÓNDE QUEDÓ AL CERRAR EL 1-sep-2026

**Construido y en producción** (`cb3ef88` → `62c38ad`), con el relato entero en
`docs/secciones/gen-desc.md`:

- 🏁 La sección se llama **«Descripción y medidas»** (Bruno: *«no me gusta que diga redacción»*).
  ⚠️ Cambió el **rótulo**, ⛔ no la key `gen-desc` ni la ruta.
- 🏁 Las **medidas viven adentro de la fila**, con la tabla `tn_medidas` (migración **corrida en las
  dos bases**), los talles saliendo de las variantes, el ×2 de la cintura del lado del sistema, el
  botón «estira» —que ⛔ no existe en el largo— y el «No lleva tabla» con motivo.
- 🏁 El **bloque que sale a la tienda** reemplaza al de la Tabla de talles vieja, con el vocabulario
  de la guía y sin filas vacías.
- 🏁 Los **tres pedidos de Redacción**: la foto se agranda y son todas · «no aplica» · «+ agregar un
  dato de otra prenda» · y la **palabra propuesta** con su aviso.
- 🏁 El **aviso de la cola**, en tres formas —aprobadas sin publicar · cargadas sin descripción ·
  palabras propuestas—, y **sólo lo ve quien puede publicar**.
- 🏁 Se cerró un agujero que la decisión de Bruno destapó: `gen-talles` ⛔ no tenía sub de publicar y
  las dos que cargan lo tenían tildado ⇒ ese botón les escribía en la tienda viva.
- 🏁 **Novedad publicada** por Bruno (`n1788310480693_vmmg5h`), y el WhatsApp para el equipo quedó
  en `~/Desktop/whatsapp-descripcion-y-medidas.txt`.

🔑 **MEDIDO CONTRA LA BASE DE ZATTIA AL CERRAR** —y esto es lo que dice qué falta de verdad:

| | |
|---|---|
| productos con la ficha empezada | **44** (41 con los 7 campos) |
| **medidas cargadas** | **0** — ⛔ ni una |
| párrafos escritos y aprobados | **0** |
| palabras propuestas | **0** |
| las cargó | **`josefinabatter`**, ⛔ no Bruno |

- 🔑 **El diccionario aguantó 44 prendas reales sin que nadie necesitara una palabra nueva.** Es lo
  que valida haber empezado chico con las propuestas: mover las listas a la base ⛔ no hace falta
  todavía.
- 🔴 **La ficha se usa y las medidas ⛔ no las tocó nadie**: el circuito completo —cargar, escribir,
  aprobar, publicar y **mirarlo en TiendaNube**— sigue sin ejercerlo una persona **ni una vez**. Es
  el único oráculo que vale y sigue pendiente.
- 📌 **5 prendas quedaron con la tela en «no identifico»**: alguien las miró y no supo. Son las que
  hay que volver a mirar, y ese dato ⛔ no existía antes de esta sección.

### ▶️ Lo que queda

1. 🔴 **Que alguien cargue UNA prenda entera y se publique**, mirándola en la tienda. ⛔ Ningún test
   toca el verbo que escribe.
2. ▶️ **Los 7 dibujos de la guía**, subidos al Blob con **pathname fijo** —una vez adentro de 300
   fichas publicadas esa URL ⛔ no se puede mover— y cableados por familia. `diagramaUrl` existe en
   las plantillas viejas y **⛔ ninguna ficha lo publica**; el único cargado es un screenshot en
   `postimg.cc`, que ⛔ no es nuestro.
3. ▶️ **Rehacer `lib/gen-talles/plantillas.ts` contra la guía**, o retirar la Tabla de talles: su
   vocabulario (`Contorno busto`, `Ancho de hombros`, `Tiro`) ⛔ ya no es el que se mide.
4. ▶️ **Importar las 205 tablas ya escritas** en la tienda, clasificando por convención y **marcando**
   las que no coinciden. ⛔ Importar a ciegas mete los dos criterios en la misma columna.
5. ▶️ **Partir `SHORTS` en familia propia**: la guía los mide como pantalón, y su `largo` de pollera
   ⛔ no les sirve.


Sigue a Redacción (`gen-desc`), que Bruno dio por buena: *«descripción está bastante bien, me gusta
lo que vi»*. La pregunta que abre esto es suya: **«¿cómo sería el flujo de medidas para el local que
las saque?»**

### La cola, medida contra la tienda viva el 1-sep-2026

| | |
|---|---|
| publicados de Zattia | **316** |
| ya tienen tabla | **205** — 49 con nuestra firma `AREBEN-TALLES`, **156 escritas a mano** |
| sin ninguna medida | **111**, de los cuales 9 son bags/accesorios ⇒ **102 prendas** |
| de esos 111, con eje de TALLE en las variantes | **13** |
| BDI | ⛔ fuera de alcance: son fundas de iPhone (165 publicados, 0 tablas, 0 talles) |

🔴 **Sólo 13 de los 111 tienen talles: para las otras 89 la tabla es UNA columna de 3-4 números.**
Hoy `GEN_TALLES_PLANTILLAS` arranca con `['S','M','L','XL']` clavados ⇒ le pone al que carga una
grilla de cuatro columnas a una prenda que tiene un solo talle, e invita a inventar tres. El trabajo
real de la cola son **~480 números sobre ~102 prendas**, no 370 productos.

🔑 **Y son DOS caminos, no uno**: 205 productos ya tienen las medidas escritas en el texto de TN y
ésos ⛔ no se vuelven a medir con cinta — se importan (`extraerTabla` + `emparejarMedidas` ya
existen). La cinta es para 102.

### 🔴 La convención — la decisión de Bruno del 1-sep-2026

> **«media prenda apoyada, es como mide el local»**

⚠️ **Pero medido, la convención publicada no es una por prenda: es una por MEDIDA**, y el local ya
la tiene decidida por el uso. Contado sobre las tablas publicadas de Zattia:

| medida | n | apoyada (<45 cm) | contorno (≥45) | lo aclara el texto |
|---|---|---|---|---|
| busto | 39 | **26** | 13 | 2 |
| cintura | 69 | 6 | **63** | 12 |
| cadera | 47 | 2 | **45** | 5 |

⇒ «apoyada para todo» choca con **108 de 116** filas de cintura y cadera ya publicadas, y
convertirlas dividiendo por dos es lo que ⛔ no se puede hacer a ciegas: una faja elastizada apoyada
⛔ no es contorno ÷ 2. ▶️ **Propuesto a Bruno y esperando su confirmación**: apoyada donde el local
ya mide apoyado (busto, ancho, hombros, largo) y **contorno en cintura y cadera**.

🔴 **Y el texto que hoy publicamos dice lo contrario de lo que publicamos.** `GT_M.busto` dice
«Medir alrededor de la parte más ancha del busto» —contorno— mientras 26 de 39 fichas publicaron la
prenda apoyada. La instrucción publicada contradice al número publicado en la misma ficha.

### La bajada de línea son tres cosas, y ninguna es un manual

1. **La etiqueta lo dice en la ficha publicada** («Busto (prenda apoyada)»). Hoy lo aclaran **19 de
   155 filas**: el cliente lee «BUSTO 32 CM» y tiene que adivinar si lo duplica.
2. **El casillero lo dice al cargar, con el dibujo al lado.** 📌 `diagramaUrl` está vacío en 12 de
   las 13 plantillas y el único que hay es un screenshot en `postimg.cc` — ⛔ no es nuestro, y el día
   que lo borren la ficha publicada queda con una imagen rota.
3. 🔴 **Lo que frena es un rango por (medida, familia), no el texto.** Un busto de 64 en un top es un
   contorno tipeado por error y hoy ⛔ no hay nada que lo mire.
   📌 [[feedback_areben_invariante_escrito_no_frena]].

⚠️ **Y por eso la importación de las 205 tablas viejas ⛔ no puede ser ciega**: clasifica por
convención, importa las que coinciden y **marca** las que no, en vez de meter los dos criterios en la
misma columna.

### El flujo propuesto — calcado del de descripciones

1. **La cola dice qué medir y arranca por lo accionable**: 102 prendas, sin accesorios, y con el
   camino de importar separado del de la cinta.
2. **La familia decide qué medidas se piden** — la misma `familiaDe` que ya decide los atributos, ⛔
   no un desplegable de 13 tipos que hoy se adivina por el nombre del producto (`tipoDesdeNombre`).
3. **Los talles salen de las variantes de TN, ⛔ no se tipean.** Sin eje de talle, una sola columna.
4. **Se guarda al tipear, sin botón**, en `tn_medidas`, **una fila por (producto, talle, medida)** —
   igual que `tn_atributos`: sumar una medida ⛔ no es una migración, y queda quién midió y cuándo.
   Teclado numérico y un talle por pantalla: el que mide tiene la cinta en la otra mano.
5. **Publica Marketing**, con el verbo que ya existe (respaldo → CAS → relectura). El local carga,
   Marketing publica — la misma línea que en `gen-desc`; hoy `gen-talles` es sólo `marketing` y sin
   sub-permiso.

### 🔑 La dinámica real, dicha por Bruno el 1-sep-2026

> «hoy miden Camila Quintana y Josefina Batter de Zattia, la dinámica es entra la mercadería al
> depósito, y luego se va la ropa al local. y ahí se hace la descripción y las medidas»

1. 🔴 **La descripción y las medidas son EL MISMO MOMENTO, con la misma prenda en la mano** ⇒ ⛔ no
   pueden ser dos pantallas. Hoy son dos, cada una con su cola y su buscador: Redacción
   (`/tncat/redaccion`) y Tabla de talles (`/tncat/descripciones`). ⇒ **las medidas van ADENTRO de
   la fila de Redacción**, debajo de la ficha: se abre el producto una vez y se contesta todo.
   📌 Es la misma lección que la prenda que pasa una sola vez por la mesa.
2. ✅ **Las dos ya tienen los permisos.** `josefinabatter` y `camilaquintana` tienen `gen-desc` y
   `gen-talles` tildados **desde el día uno**, verificado contra el padrón el 27-ago-2026
   (`tests/nav-estructura.test.ts`). ⚠️ Y hasta ese día **la Tabla de talles no les abría** por el
   guard que resolvía sólo el primer tramo de la ruta: la puerta está abierta hace días y ⛔ no
   entró nadie.
3. 🔑 **El disparador es la llegada AL LOCAL, ⛔ no el alta en TiendaNube** — y el sistema lo puede
   saber. Gestión Nube trae el stock separado `local` / `deposito` por variante, y está medido
   (31-jul-2026, `lib/tncat/stock-variante.ts`) que **en Zattia el stock de TiendaNube coincide con
   el Local en el 98%**. ⇒ ⚠️ **Se corrige lo que decía este pendiente**: la cola SÍ se puede
   ordenar por lo que está en el local. Medido el 1-sep: de las 111 sin medidas, **110 tienen
   stock** ⇒ están casi todas en el local y la cola nace accionable.
4. ⚠️ **Lo que se queda en el depósito ⛔ no lo mide nadie**: si una prenda no baja al local, no hay
   mano que le ponga la cinta. La cola lo tiene que decir **aparte** —«esperando llegar al local»—
   en vez de mezclarlo con lo que sí se puede hacer hoy. Misma lección que la cola de fotos: 441
   aparentes contra 168 reales.
5. **Dos personas sobre la misma tanda**: se guarda al tipear (ya es la regla de la ficha) y queda
   **quién cargó cada valor** — `tn_atributos.por` ya lo hace y las medidas van igual. El reparto es
   físico (cada una agarra una prenda) ⇒ ⛔ no hace falta reservar nada; lo que sí hace falta es que
   la fila muestre lo cargado al toque, para que no midan dos veces la misma.

### 🆕 ▶️ REDACCIÓN — los tres cambios que pidió Bruno el 1-sep-2026

Salieron de usarla, no de leer el código:

> «no se puede agrandar foto. Principalmente para poder completar información complementaria del
> producto» · «hay un short de ecocuero que tiene puesto como short minis y demás, pero habla de
> tiro y demás» · «capaz ver de no cerrar las opciones, ver la opción de sumar *no aplica*, y poder
> sumar alguna información de otra categoría»

1. ▶️ **La foto se agranda, y son TODAS.** `components/gen-desc/GenDesc.tsx:269` la dibuja en
   **44×55 px** y ⛔ no es cliqueable; `components/ui/Lightbox.tsx` ya existe en el kit (Escape y
   toque para cerrar) ⇒ es reusar. 🔑 **Y la mitad que falta es otra**: hoy se muestra sólo
   `imagenes[0]`, la de portada, y el tajo, el botón, el escote de atrás o el largo real casi nunca
   están ahí. Sin las otras fotos, agrandar la portada ⛔ no contesta «información complementaria».
2. ▶️ **El desajuste del short NO es Tiro: es Calce.** Verificado — `SHORT HILTON`, `SHORT VITTORIA`
   y 12 más están en `SHORTS, MINIS y FALDAS` ⇒ familia `faldas`, cuyo `calce` ofrece palabras de
   pollera (`al cuerpo`, `recta`, `con vuelo`, `plisada`), y un short de ecocuero ⛔ no es ninguna de
   las cuatro. La familia mezcla porque **la categoría de TiendaNube los tiene juntos**. 📌 Medido el
   1-sep-2026: de los **40 publicados** de esa familia, **14 son shorts o bermudas** y 26 son minis,
   polleras y faldas.
3. ▶️ **De los tres pedidos, sólo uno toca la decisión del 27-ago:**
   - **«No aplica»** — entra sin discusión, con el precedente exacto de `TELA_SIN_IDENTIFICAR`: se
     guarda y ⛔ no sale a la ficha. «No tiene» es distinto de «nadie lo cargó», y esa diferencia es
     la que dice si hay que volver a mirar la prenda.
   - **«+ agregar un dato» de otra familia** — ⛔ no rompe nada: el valor sigue saliendo de una lista
     cerrada y lo único que se afloja es **qué se le pregunta** a cada familia, que hoy es la lista
     fija de `FAMILIAS[x].atributos`. Con esto los 14 shorts se arreglan **sin tocar el mapa de
     familias**, y partir `SHORTS` en familia propia queda para el final.
   - 🔴 **No cerrar las opciones** — es exactamente lo que la lista cerrada existe para impedir: con
     texto libre el catálogo deja de poder SUMARSE, que era el motivo de fondo. ⇒ **válvula**: se
     escribe igual y queda **marcado como valor propuesto**, afuera del análisis hasta que Bruno lo
     apruebe; ahí entra a la lista con su palabra, como entraron `bandó` y `volcado`.
     ⚠️ Y el valor propuesto necesita **su propio reloj**: sin un aviso de «hace X días que nadie
     mira esto», la bandeja se convierte en el campo libre por la puerta de atrás.
     📌 [[feedback_areben_freno_sin_valvula]].

▶️ **Orden recomendado**: «no aplica» + «+ agregar un dato» primero (cubren cualquier desajuste de
familia, no sólo el del short), el valor propuesto después, el corte de `SHORTS` al final.

### 🆕 📌 La guía de medidas de Bruno — el PDF (1-sep-2026)

`~/Downloads/TOMA DE MEDIDAS CON GUÍA.pdf`, **9 páginas**. Leída la 1: dibujo técnico de la prenda
**apoyada y plana**, con las flechas `ANCHO`, `LARGO` y `LARGO DE MANGA`, y la lista de a qué prendas
aplica (buzos, sweaters, camperas, blazers, remeras con mangas, tops con mangas) — o sea **nuestra
familia `abrigo` entera más parte de `tops`**.

🔑 **Confirma la convención y además la NOMBRA bien**: la guía dice **ANCHO**, no «contorno de
busto». `GT_M.busto` de `lib/gen-talles/plantillas.ts` dice «Contorno busto / Medir alrededor de la
parte más ancha del busto», que es **otra medida**.

🏁 **Las 9 páginas, leídas el 1-sep-2026.** ⚠️ `brew install poppler` quedó colgado sin escribir una
línea de log; el camino que sirvió es **sin instalar nada**: partir el PDF con Quartz vía
`osascript -l JavaScript` (`PDFDocument`) y pasar cada hoja por `sips -s format png`.

### 🔴 La guía contesta la convención, y de una manera que no habíamos considerado

Página 9, textual: **«CONTORNO DE CINTURA: ESTE SE MIDE AGARRANDO LA CINTURA POR LA MITAD, Y
MULTIPLICANDO POR 2 LA CIFRA MEDIDA.»**

⇒ ⛔ **No hay dos convenciones**: se mide **siempre la prenda apoyada**, y la cintura **se publica
× 2**. Encaja con lo medido en la tienda (busto en media prenda, cintura en contorno): ⛔ no era una
inconsistencia, era la guía. Y explica los **6 casos de cintura por debajo de 45 cm sobre 69**: son
las veces que alguien **se olvidó de multiplicar**.

🔑 **La multiplicación la hace el SISTEMA, ⛔ no la persona.** El local tipea lo que midió y la
pantalla publica el doble ⇒ ese olvido **deja de poder ocurrir**.
📌 Es la misma forma que los bullets: [[feedback_areben_escribir_la_regla_no_el_caso]].

### Las 7 hojas de dibujos, contra qué familia van

| hoja | prendas | → familia |
|---|---|---|
| 1 | buzos, sweaters, camperas, blazers, remeras y tops **con** mangas | abrigo + parte de tops |
| 2 | tops sin mangas, musculosas, chalecos, corsets | tops |
| 3 | jeans, pantalones, **shorts, bermudas** | pantalón |
| 4 | monos | vestidos |
| 5 | minis, polleras largas | faldas |
| 6 | vestidos cortos y largos | vestidos |
| 7 | bodys | tops |

Las páginas **8 y 9 ⛔ no son dibujos de prenda**: son la bajada de línea A/B/C, una para prendas de
arriba y otra para prendas de abajo.

### 🔴 La guía manda partir SHORTS, y ⛔ no van a `pantalon`

Pone **shorts y bermudas con jeans y pantalones**, ⛔ no con minis y polleras ⇒ los 14 shorts de la
familia `faldas` se **miden** como pantalón. Sube «partir SHORTS» de «para el final» a decisión ya
tomada. ⚠️ **Pero tampoco entran en `pantalon` tal cual**: su `largo` ofrece `capri / al tobillo /
al piso`, que a un short ⛔ no le sirve. Es **familia propia**.

### 🔴 Las plantillas de la Tabla de talles hay que REHACERLAS, no ajustarlas

De las 3-4 medidas que pide cada una, entre 2 y 3 ⛔ no son las que la guía mide:

| pide la plantilla hoy (`lib/gen-talles/plantillas.ts`) | mide la guía |
|---|---|
| `Contorno busto` — «medir alrededor de la parte más ancha» | **Ancho**, de sisa a sisa, prenda apoyada |
| `Ancho de hombros` | ⛔ no existe en la guía |
| `Contorno cadera` | **Ancho**, desde donde termina el tiro hasta el lateral |
| `Tiro` | ⛔ no se mide: sólo es la referencia de dónde va el Ancho |
| `Contorno cintura` | ✅ coincide — y la guía dice cómo: mitad × 2 |

⚠️ **Y una consecuencia de forma**: la tabla publicada rotula las filas con letras (`a. Contorno
busto`) y **los dibujos ⛔ no tienen letras** — rotulan con la palabra (ANCHO, LARGO, LARGO DE
MANGA). Publicando el dibujo al lado, las filas pasan a la palabra o el cliente busca una «a» que en
la imagen no está.

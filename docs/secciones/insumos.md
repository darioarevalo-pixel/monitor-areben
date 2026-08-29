# Insumos — ficha de sección

Sección `insumos`, área `administracion`. **Lo que la empresa consume y no vende**: bolsas, rollos
de etiquetas, ribbon, cajas, papel, yerba. Qué hay en cada lugar, cuánto se paga por unidad, a qué
ritmo se gasta, cuántos días dura — y el aviso cuando queda el anteúltimo.

Reemplaza a WhatsApp: **80 avisos de insumos en 2026** medidos sobre los chats del grupo
(*«estamos usando el último rollo de etiquetas zebra»*, *«no hay más bolsas de despachos de
zattia»*), más la rutina #5 del análisis del puesto — *avisar el insumo antes de que se acabe, por
umbral, 25 días distintos*. ⛔ **No podía vivir en la Agenda**: la Agenda dispara por día del
calendario y esto dispara por un hecho.

## Dónde vive

`components/insumos/` (`Insumos.tsx` la lista, `FichaInsumo.tsx` la ficha + el libro + los pedidos,
`useInsumos.ts`) · `lib/insumos/core.core.js` (listas cerradas y validación, **lo importa el
handler**) · `lib/insumos/core.ts` (todo lo derivado, puro) · `lib/insumos/consumo.core.js`
(las compras por día) · `lib/insumos/cliente.ts` · handler `api/_insumos.js`, por
`api/datos.js?recurso=insumos` (**ninguna función nueva de Vercel: siguen 7 de 12**) · tablas en
`sql/migrate-insumos.sql` (`scripts/apply-insumos.mjs`) y `sql/migrate-insumo-pedido.sql`
(`scripts/apply-insumo-pedido.mjs`) · semilla `scripts/sembrar-insumos.mjs` ·
tests `tests/insumos.test.ts`, `tests/insumos-handler.test.ts`, el bloque de `avisosDeInsumo` en
`tests/notificaciones.test.ts` y la fila en `tests/handlers-autorizacion.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **El motor de avisos.** `avisosDeInsumo` vive en `lib/notificaciones/derivar.ts` y se acarrea en
  `store/useAvisos.ts` — tocar cualquiera de los dos toca el badge de todo el equipo.
- **Las reglas de canal**, importadas y ⛔ no copiadas: `canalDe` (`lib/liquidacion/canal.core.js`)
  y `esVentaTecnica` (`lib/etl/tecnica.core.js`). Si el día de mañana GN cambia los nombres de los
  canales, se arregla allá y esta sección se entera sola.

## Reglas que el código no dice

- 🔑 **El stock no es una columna: se suma del libro** (`insumo_movimiento`). Es lo que permite
  contestar *desde cuándo* falta, que es el `ts` del aviso — con `updated_at` el aviso diría
  «apareció hoy» todas las mañanas y el «NUEVO» no se apagaría nunca.
- 🔴 **`null` no es 0, en los cuatro lugares donde aparece**: stock sin contar, ritmo sin medir,
  precio sin cargar, `dias_reposicion` sin saber. Un 0 en cualquiera de los cuatro *afirma* —«se
  contó y no hay ninguna», «no se gasta nunca», «salió gratis», «llega el mismo día»— y los cuatro
  cambian lo que la pantalla decide.
- 🔴 **Un insumo sin contar NO dispara ningún aviso.** Es correcto y es incómodo: hasta que alguien
  haga el primer recuento por lugar, la sección está muda. Por eso los KPIs tienen «Sin contar» como
  filtro y no como nota al pie.
- 🔴 **Comprar y subir son dos acciones distintas y por eso son dos avisos.** Un lugar en cero
  teniendo en el depósito ⛔ no se compra: se sube. Confundirlas cuesta los días que tarda un
  proveedor, y es literalmente la mitad de lo que hoy se resuelve por WhatsApp (*«si me pueden subir
  del depo»*).
- 🔑 **El corte del «subir» es el CERO**, no un mínimo por lugar. Así no hay que inventar un umbral
  por ubicación, y el cero es el único número que no se discute.
- 🔑 **`paraReponer(insumo, movs, ritmo)` con `ritmo` OBLIGATORIO.** La llaman la pantalla y el
  derivador de avisos; con un default, el día que la regla mire otra cosa el compilador no señalaría
  a los llamadores y media regla se quedaría en el JSX.
- 🔴 **La unidad del insumo es UNA sola.** Se compra una caja de 1.000 bolsas y se consume de a una:
  el libro entero viaja en la unidad del insumo. `bulto`/`por_bulto` son ayuda **de la pantalla**
  para tipear («3 cajas × 1.000») y ⛔ no una segunda unidad.
- 🔴 **Un traslado son DOS filas** con el mismo `grupo`. Con una sola fila y una columna `destino`,
  todo el que sume stock tendría que acordarse de restar de un lado y sumar del otro. Por eso
  borrarlo se lleva las dos, y por eso `guardar-movimiento` **rechaza** `tipo:'traslado'`.
- 🔑 **El precio de referencia es ponderado por cantidad, sobre 180 días, y va con su denominador.**
  Con una sola compra ⛔ no se rotula «promedio»: dice «última compra» con su fecha. Un derivado de
  una sola observación con cara de promedio ya dejó una regla de Meta prendida y muda.
- 🔑 **La marca del ritmo sale de `insumo.marcas`, ⛔ no de la regla de consumo.** «Bolsas chicas de
  Zattia» ya dice de quién es; repetirlo en la regla sería un lugar más donde puede decir otra cosa.
- ⚠️ **La pantalla NO filtra por marca**, a propósito: el depósito es uno solo y el pedido al
  proveedor se hace una vez. Filtrar escondería la mitad de lo que hay que comprar. Cada fila lleva
  su chip cuando el insumo es de una marca sola, y el aviso sale **una** vez (por eso su lectura va
  fuera del `Promise.all` por marca en `useAvisos`).
- 🔑 **Sin sub-permiso: quien ve la sección, carga.** Un sub ⛔ no se hereda de la función, así que
  habría que tildárselo a alguien a mano el día del deploy — y este módulo no sirve si nadie carga.
  El día que haga falta separar mirar de escribir, se agrega `insumos.cargar` y se tilda ANTES.
- 🔴 **El handler no manda plata de ventas.** `comprasPorDia` cuenta filas de `ventas`, sin un peso.
  El endpoint que sí la lleva (`_ventas-diarias.js`) pide `ventas-mensuales`, que es de Análisis:
  colgarse de él le daría la facturación a quien sólo tiene que saber cuántas bolsas se gastan.
  Hay un test que lo fija.
- ⚠️ **Las ubicaciones son una lista cerrada** en `core.core.js` (depósito y los dos locales). Un
  local nuevo se suma ahí y sale con un deploy. Se eligió así porque el catálogo de ubicaciones
  **gobierna** a dónde apunta el aviso, y una pantalla para editarlas no la pidió nadie.

## El pedido — la promesa, que es otra cosa que el hecho

Se sumó el 28-ago-2026. Tapa lo que faltaba de «gestión de compras»: entre *«hay que pedir bolsas»*
y *«llegaron las bolsas»* no existía nada, y eso costaba tres cosas medibles — el aviso **seguía
gritando** después de que alguien llamó al proveedor, nadie sabía **si el pedido salió**, y
`dias_reposicion` **no tenía contra qué medirse**.

- 🔴 **Un pedido ⛔ NO es un quinto tipo del libro: no mueve una sola unidad.** Que
  `insumo_movimiento` tenga sólo hechos que suman o restan es lo que deja que `stockPor()` sea una
  suma pelada; una fila con signo 0 habría que acordarse de saltearla en cada suma. Tabla propia,
  `insumo_pedido`.
- 🔑 **La compra CIERRA el pedido, por `grupo`** — la columna que el esquema del libro ya había
  reservado el día uno («las dos patas de un traslado, **o un pedido**»). Cero columnas nuevas en el
  libro y cero filas migradas. Y **recibir no es un verbo aparte**: es la compra de siempre, con el
  `grupo` puesto.
- 🔑 **No hay columna `estado`.** Que un pedido esté abierto se **deriva**: no descartado y sin
  ninguna compra que lo nombre. Un estado guardado sería un segundo lugar donde puede decir otra
  cosa que el libro, y el libro es el que manda.
- 🔴 **`paraReponer()` ⛔ NO mira los pedidos, y ése es el punto.** Que el insumo esté bajo el mínimo
  es un **hecho** y no deja de serlo porque alguien llamó al proveedor: lo que cambia es **de quién
  es la pelota**. El que mira el pedido es `paraComprar()` —la cola del aviso—, y la fila **sigue
  mostrando que falta**, con el pedido al lado. Misma línea que partió el reloj de Postventa.
- 🔴 **Un pedido demorado es OTRO aviso** (`insumo-demorado`), ⛔ no el mismo con otro texto:
  «falta» lo resolvemos nosotros comprando, «no llegó» lo resuelve el proveedor y la acción es
  reclamar. Su `ts` es **cuándo se lo esperaba**, ⛔ no cuándo se pidió.
- ⚠️ **Sin promesa ni `dias_reposicion`, un pedido NUNCA se marca demorado.** No se sabe cuánto
  tendría que tardar, y un demorado inventado acusa a un proveedor que puede estar en fecha.
- 🔑 **La demora se MIDE y se ofrece, ⛔ no se escribe sola.** `demoraMedida()` promedia
  `llegada − pedido_at` de los cerrados y viaja con su denominador: con una sola dice «la última
  vez» y ⛔ no «promedio». Sirve para que alguien cargue `dias_reposicion` mirando un número real —
  ⛔ **no alimenta la regla**, porque un derivado de una observación manejando un aviso es lo que ya
  dejó una regla de Meta prendida y muda.
- 🔴 **Un insumo ⛔ no puede tener DOS pedidos abiertos**: «hace cuánto que espera» tendría dos
  respuestas. El freno es un **409 del servidor**, no sólo de la pantalla.
- 🔑 **Descartar ⛔ no es eliminar** (`VOCABULARIO.md`): descartar deja la fila con quién y cuándo
  —el pedido existió y no llegó, y eso es lo que mide al proveedor—; eliminar es sólo para el que se
  cargó mal. Los símbolos del código (`cancelar-pedido`, `cancelado_at`) ⛔ no se tocaron.

## Pendiente

- ▶️ **El local no ve esta sección.** El que se queda sin bolsas es el local (*«no hay más bolsas en
  local»*, *«habrá posibilidad de que alguien me traiga bolsas»*) y el área es Administración, así
  que hoy el que avisa por WhatsApp sigue siendo el que no puede anotarlo. Es la primera candidata a
  ampliar — y ⛔ no se resolvió adivinando: es una decisión de quién puede escribir.
- ▶️ **`dias_reposicion` está vacío en todo el catálogo sembrado**, así que el corte por días no
  corre todavía. Bruno marcó que **las bolsas son lo que más demora**: es el primero que hay que
  cargar. 🆕 Desde el 28-ago **ya no hay que inventarlo**: con dos pedidos cerrados la ficha dice
  cuánto tardó de verdad ese proveedor, y ese número se copia a mano.
- ▶️ **Nadie hizo el primer recuento.** Hasta que alguien cuente, la sección está muda a propósito.
- ⚠️ **El ritmo `manual` necesita dos consumos anotados** para existir. Si nadie anota consumos, los
  insumos que no están atados a las ventas nunca van a tener días de vida — sólo el corte por
  unidades, que es la regla del manual y alcanza.

- ▶️ **La novedad está cargada como BORRADOR** (`n1787922095235_h4tx2x`, destino `seccion:insumos`):
  la publica Bruno de un click.

## Cómo se prueba

```bash
npx vitest run tests/insumos.test.ts --reporter=dot          # el libro, el precio, el ritmo, la regla
npx vitest run tests/insumos-handler.test.ts --reporter=dot  # el handler: qué frena y qué NO manda
npx vitest run tests/notificaciones.test.ts --reporter=dot   # el aviso
node scripts/apply-insumos.mjs                               # corre la migración y la verifica
node scripts/sembrar-insumos.mjs --simulacro                 # qué sembraría, sin escribir
node scripts/apply-insumo-pedido.mjs                         # la tabla del pedido + ejerce sus 2 check
node scripts/caminar-insumos.mjs                             # el handler contra la base REAL
node scripts/verificar-deploy-insumos.mjs                    # ¿llegó a prod? con cadena de control
```

`caminar-insumos.mjs` ⛔ no es un test: **invoca el handler contra la base de BDI**, siembra un
insumo `ZZ CAMINATA`, le hace una compra, un traslado y un consumo, y el oráculo es la base leída
por otro camino. Borra lo que sembró y verifica que los contadores vuelvan. Caminada el
28-ago-2026: **14 de 14**, y **25 de 25** después de sumarle el pedido (los dos `check` de
`insumo_pedido`, el 409 contra la base de verdad, el `grupo` de la compra que cierra, y que el
`on delete cascade` se lleve también los pedidos). ⛔ Lo derivado no se comprueba ahí —`core.ts` es TypeScript y no lo puede
importar un script de Node, y reimplementarlo sería una segunda versión de la regla—: eso lo cubren
los mutantes.

**Los ocho mutantes del PEDIDO** (28-ago-2026, 8 de 8): el pedido deja de callar el aviso · la
demora se mide desde que se cargó y no desde que se pidió · una sola demora se rotula «promedio» ·
sin fecha esperada se marca demorado igual · el descartado sigue contando como abierto · la llegada
anterior al pedido entra al promedio · cualquier movimiento cierra el pedido · el `ts` del demorado
pasa a ser cuándo se pidió. 🔴 **El ancla de cada uno se verifica ÚNICA** (`count == 1`) o le pega a
la función equivocada y sale verde.

**Los siete mutantes que tienen que morir** (corridos el 28-ago-2026, 7 de 7): stock `null`→`0` ·
el recuento deja de cortar · las dos patas del traslado con el mismo signo · `<=` por `<` en el
mínimo · el `ts` del aviso pasa a ser hoy · el ritmo cuenta el día en curso · el precio promedia
unitarios en vez de ponderar.

✅ **CAMINADA EN LA PANTALLA REAL, en prod, el 28-ago-2026** — que es lo que la suite ⛔ no puede
probar. Alta desde el formulario → compra de 10 a $5.000 → traslado de 3 al Local BDI → consumo de
3 en el local → **el aviso apareció en Inicio** («Insumos que faltan en un local», con NUEVO) y el
clic cayó en `/insumos?ver=subir&ubicacion=local-bdi` **con los dos filtros puestos**. Después se
borró el insumo de prueba y **la base volvió a 16 insumos y 0 movimientos**, releída por otro
camino. Lo que se vio y no se podía ver en un test:
- **«sin contar» y «0 unidades» conviven en la misma fila** y se distinguen: Local Zattia decía
  «sin contar» mientras Local BDI decía «0 unidades». Eso es toda la regla del `null` ≠ 0, en la
  pantalla.
- **El precio con una sola compra sale rotulado «últ.»** ($ 500 = 5.000/10), ⛔ no «prom.».
- **El aviso eligió SUBIR y no comprar** con 7 unidades en el depósito: la distinción que separa un
  viaje al depósito de una compra que tarda días.
- El diálogo de borrar **dice cuántos movimientos se lleva** (4), que es lo único que deja medir lo
  que se pierde antes de apretar.
⚠️ Sin errores en la consola. ⛔ Lo que sigue sin ejercerse en pantalla: el corte por **días**
(pide `dias_reposicion`, que está vacío) y el ritmo **atado a las ventas**.

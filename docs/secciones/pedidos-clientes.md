# Faltantes — ficha de sección

Sección `pedidos-clientes`, área `compras`, label **«Faltantes»**. Lo que un cliente pide y no
tenemos, con el ranking de lo más pedido en una ventana de días.

Nació el 23-ago-2026 (sesión 4 de `~/.claude/plans/cambios-en-monitor-el-lovely-honey.md`). Pedido
de Bruno: *«escuchar qué producto pide el cliente y no tenemos, para mejorar la variedad en local y
en la tienda»*. No reemplazó nada: **antes esto no existía en ningún lado**, se lo decía a quien
estuviera al lado y a la semana no se acordaba nadie.

🔑 **Es el único dato del monitor que ninguna otra pantalla puede tener.** Todo lo demás sale de una
venta; esto es la demanda de lo que **no** se vendió porque no estaba, y no hay ninguna venta que la
registre. Si esta lista está vacía, no hay forma de reconstruirla después.

## Dónde vive

`components/pedidos-clientes/` (`PedidosClientes.tsx` la pantalla · `AnotarFaltante.tsx` el alta, que
monta `components/ui/BuscarArticuloGN.tsx` para elegir el artículo ·
`usePedidosClientes.ts`) · `lib/pedidos-clientes/` (`reglas.core.js` lo que comparten handler y
pantalla · `core.ts` el agregado · `tipos.ts` · `cliente.ts`) · handler `api/_pedidos-clientes.js`,
que entra por `api/datos.js?recurso=pedidos-clientes` (⛔ **no es una función de ruta**: Hobby admite
12 y hay 7) · tabla `pedidos_clientes` **en la base de CADA marca** (`sql/migrate-pedidos-clientes.sql`,
se aplica con `node scripts/apply-pedidos-clientes.mjs`, que corre en las dos) · tests
`tests/pedidos-clientes-core.test.ts` (29) y `tests/pedidos-clientes-handler.test.ts` (17).

## ⛔ Lo que comparte con otras secciones

**`AnotarFaltante.tsx` lo monta también «Atención al cliente»** (`components/atencion/Atencion.tsx`),
en **tres** lugares: un botón del encabezado, el `action` del `EmptyState` de «Productos de la
tienda» cuando la búsqueda no encuentra nada, y —desde el 24-ago— el botón **«Sin stock»** de cada
fila de producto encontrado, que abre el alta con el buscador de artículo ya apuntado a ese
producto. Los dos últimos son los dos momentos en que el dato existe: el `EmptyState` es *no lo
tenemos*, la fila es *lo tenemos y se acabó*. Tocar ese componente toca las dos
pantallas, y es a propósito que sea uno solo: copiado, el día que se agregue un campo una de las dos
lo pierde y sus filas entran incompletas sin que falle nada.

## Reglas que el código no dice

- 🔴 **Lo que hace existir a la sección es dónde se CARGA, no la sección.** Una lista nueva no existe
  hasta que entra donde se toma el trabajo. Si anotar obligara a salir de Atención, buscar Faltantes
  y volver, no se anota nunca — y la trampa es que después **una lista vacía se lee como «no piden
  nada que no tengamos»**, que es una conclusión sobre el negocio sacada de que nadie cargó. Por eso
  el alta vive adentro de Atención y por eso el `EmptyState` de la búsqueda sin resultados es el
  lugar de mayor señal de todo el monitor para esto: es el momento exacto —el único del día— en que
  el sistema *sabe* que hubo un faltante.
- 🔴 **Dos permisos, no uno.** Anotar entra con `atencion`; decidir (conseguido / descartado) pide
  `pedidos-clientes`. Si anotar pidiera la sección, la única persona que escucha el pedido sería la
  única que no puede anotarlo. Y hay una **puerta de al lado**: `estado` viaja adentro del alta, así
  que sin un candado propio quien sólo atiende manda `estado:'descartado'` en el `guardar` y esquiva
  el gate → `api/_pedidos-clientes.js`, y el mutante que lo prueba en el test del handler.
- 🔑 **El nombre `solicitudes` estaba OCUPADO** y significa lo contrario (pedir un producto para
  fotografiarlo; en Marketing se llama literalmente «Solicitudes de productos»). De ahí la key
  `pedidos-clientes` con label «Faltantes».
- 🔑 **`tipo` no estaba en el pedido y es lo que hace que la lista no se pudra.** El pedido era sólo
  variedad, pero con el rótulo «Faltantes» entra sí o sí lo que se acabó. Son **dos decisiones
  distintas** —comprar variedad nueva / reponer— que decide gente distinta con plata distinta, así
  que el ranking las cuenta separadas y nunca las suma bajo un solo total sin decirlo.
- 🔴 🔑 **El artículo se ELIGE, no se escribe — y sólo para la mitad que existe** (24-ago-2026,
  pedido de Bruno: *«si no lo tenemos está perfecto; ahora si está sin stock, estaría bueno
  seleccionar el artículo»*). Las dos mitades de «faltante» no se anotan igual: lo que **no
  trabajamos** no está en ningún catálogo nuestro —no hay nada que elegir— pero lo que **se acabó**
  ya tiene ficha, variante y SKU en Gestión Nube. Escribirlo a mano ahí tira las tres cosas y le
  deja al que compra un texto que tiene que volver a buscar. De ahí las tres columnas
  `producto_id` / `sku` / `variante`, y que el buscador esté **plegado**: delante del campo
  obligaría a todos a pasar por una búsqueda que para la mitad no puede dar nada.
- 🔴 **Con artículo elegido, la llave del ranking es el id y no el texto** (`claveDePedido`). Un id
  nunca junta dos productos distintos; el texto sí puede. El precio que se paga —y se elige a
  sabiendas— es que el mismo producto anotado a mano y elegido del catálogo cae en **dos grupos**:
  es el mismo criterio de `colores`/`color`, sub-agrupar deja los dos renglones a la vista y
  sobre-agrupar suma dos productos en un número plausible que nadie puede contrastar.
- 🔑 **Se agrupa por PRODUCTO y se muestran TODOS los sku del grupo.** El ranking contesta «qué
  comprar» —«el corset, 7 veces»— y partido en cuatro talles de 2 ese producto no aparece en ningún
  lado; los talles se leen abajo, en la lista cruda. Y mostrar **un** sku afirmaría que las 7 veces
  fueron de ése.
- ⚠️ **Las tres columnas del artículo viajan juntas o no viaja ninguna** (`filaDe`): un sku sin
  `producto_id` no tiene con qué agrupar y una variante sola no dice de qué producto es.
- ⚠️ **`producto_id` no está atado a `tipo` ni en la base ni en el validador**, y no es un olvido:
  elegir el artículo con `no_trabajamos` es un caso real —«el corset sí, pero ese talle no lo
  traemos nunca»—. Elegirlo pone `sin_stock` como **default**, y nada más.
- 🔑 **El artículo NO se recuerda entre altas**, al revés que el tipo y el canal: el faltante
  siguiente es otro producto, y un artículo pegado del anterior manda a reponer lo que no falta.
- 🔑 **El ranking mide DEMANDA, no trabajo pendiente**: cuenta también lo ya `conseguido` y lo
  `descartado`. Que después lo hayamos traído no borra que nos lo pidieron seis veces. Lo pendiente
  va al lado, en su contador. Y por eso **`descartado` no es «me equivoqué»** —para eso está
  borrar—: es «lo miramos y no lo vamos a traer», y sigue contando.
- 🔴 **La regla de agrupado elige su modo de falla, y la elección está escrita como test.** El
  singular es a lo bruto (una `s` final) y no la regla del español, que rompería `iphones` → `iphon`.
  Consecuencia aceptada: `colores` y `color` quedan en dos grupos. El motivo es la asimetría —
  **sub-agrupar se ve** (los dos renglones están a la vista y alguien los junta a ojo) y
  **sobre-agrupar no se ve nunca**: suma dos productos distintos en un número plausible que nadie
  tiene con qué contrastar, y ese número es el que hace comprar.
- 🔴 **Lo que queda afuera del número se cuenta y se muestra** (`comoSeConto`, `porQueVacio`). Un
  ranking vacío puede significar tres cosas distintas —nadie cargó / lo cargado es más viejo que la
  ventana / el filtro— y cada una manda a hacer algo diferente. Sin esa línea, el cero afirma.
- ⚠️ **No hay `stunned`.** Es una línea que se separa por prefijo de SKU, y un producto que **no
  tenemos** no tiene SKU: no hay con qué clasificarlo. Se corta en 400 en la puerta. ⚠️ Desde el
  24-ago **lo elegido sí trae sku**, así que la mitad `sin_stock` sería clasificable — pero la otra
  mitad sigue sin serlo, y una sección que corta bien la mitad de las filas es peor que una que no
  corta: el corte en 400 se queda como está.
- ⚠️ **El servidor devuelve la lista entera (tope 2.000) y la ventana la aplica el núcleo.** No es
  descuido: para poder decir «hay 12 anotados de antes» cuando la ventana sale vacía hacen falta
  esos 12. Recortar en el servidor haría imposible el cartel que separa «nadie pide» de «nadie
  carga», que es la mitad del valor de la pantalla.

## Lo que ya se rompió acá

Nada todavía — la sección es del 23-ago-2026. Los dos antecedentes que la formaron son de otras:

- El defecto de **la lista invisible** (Novedades de Stunned, 23-ago): se guardaba bien y no la veía
  nadie. De ahí que el alta esté en Atención y no acá.
- El **store del ETL publicando datos de una marca bajo el nombre de la otra** (18-ago): por eso
  `usePedidosClientes` **vacía la lista antes de pedir la nueva** al cambiar de marca. Acá muerde más
  que en otras pantallas porque lo que se muestra son números agregados: un ranking viejo no se lee
  como «está cargando», se lee como el ranking de esta marca.

## Pendiente

- ▶️ **La migración no corrió todavía**: `node scripts/apply-pedidos-clientes.mjs` (las dos bases).
- ▶️ **Falta caminarlo en prod con un perfil de local**, que es quien lo va a usar, y con uno de
  Compras. Todo se ejerció con admin.
- ▶️ **Nadie sabe que existe**: hace falta una novedad para el local y para marketing, con el énfasis
  en que se anota **desde Atención**. Sin eso la sección arranca vacía y se lee como que no piden nada.
- ▶️ **La migración de las tres columnas del artículo** (`producto_id`, `sku`, `variante`) tiene que
  correr **antes** de deployar: `filaDe` las manda siempre, y contra una tabla sin ellas PostgREST
  rechaza **toda** el alta, también la de lo escrito a mano.
- ⚠️ **No hay forma de pasar un faltante a una compra** (a `ingresos`, ni a un pedido a proveedor).
  Hoy el ranking se lee y se decide afuera. Es deliberado por ahora: atarlo antes de saber si la
  lista se llena sería construir sobre un supuesto.
- ⚠️ **El agrupado no tiene sinónimos**: «clear case» y «funda transparente» son dos grupos. Si al
  leer los primeros datos reales eso parte demasiado, la respuesta es un diccionario chico de
  sinónimos en `reglas.core.js`, ⛔ **no** aflojar `claveDeTexto`.

## Cómo se prueba

```bash
npx vitest run tests/pedidos-clientes-core.test.ts --reporter=dot
npx vitest run tests/pedidos-clientes-handler.test.ts --reporter=dot
```

**Lo que ningún test puede ejercer y hay que hacer a mano**: cargar tres pedidos del mismo producto
escrito distinto («fundas iphone 15», «Funda iPhone15», «funda para iphone 15») **desde Atención** y
ver que el ranking los cuenta **como uno**. Ése es el oráculo del plan, y viene por otro camino que
el hecho: se escribe en una pantalla y se lee en otra.

**Los tres mutantes del artículo elegido** (24-ago-2026, los tres muertos): que `claveDePedido`
ignore el `producto_id` y agrupe por texto · que el sku entre a la base sin producto · que el grupo
muestre un solo sku en vez de todos.

**Los seis mutantes que se vieron caer** (23-ago-2026, los seis muertos): sacarle el `.sort()` a
`claveDeTexto` · sacarle el corte letra/número (`iphone15`) · el borde de la ventana de inclusivo a
exclusivo · sacar el candado del `estado` colado en el alta · sacar el candado de borrar lo ajeno ·
darle `atencion` a `PARA_DECIDIR`. ⚠️ El primer intento del segundo dio **«vivo» y era mentira**: la
mutación no había entrado en el archivo. Antes de creerle a un mutante vivo, verificar con `grep`
que el cambio está puesto.

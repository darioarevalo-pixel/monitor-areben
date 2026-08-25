# Integraciones (GN ↔ TN de Stunned) — ficha de sección

Sección `integraciones`, área `integraciones`, **marca `zattia` únicamente**. Es el puente entre
Gestión Nube y la tienda propia de Stunned: mapea los SKU de los dos lados, y sobre ese mapeo corre
el sync de **stock** (GN→TN) y el de **ventas** (TN→GN). Reemplaza que alguien cargue a mano en GN
las órdenes de la tienda como si fueran del local.

🔴 **Es la sección que ESCRIBE EN LA TIENDA VIVA y en la contabilidad.** Todo lo demás de la ficha
sale de eso.

## Dónde vive

`components/integraciones/Integraciones.tsx` (~870 líneas, las tres pestañas en un archivo) ·
`lib/sku-map/` (`proponer.ts` es puro) · `lib/sync-tn/` (`core.ts` decide qué venta se importa;
`stock.core.ts` resuelve la tanda de stock; `nota.core.js` es la nota que queda en GN) · handlers
`api/sku-map.js` (ruta propia) y `api/_sync-tn.js` (por `datos.js?recurso=sync-tn`) · tablas
`sku_map` y `sync_procesados` · tests `sync-tn-core` · `sync-tn-nota` · `sync-tn-stock-core`.

⛔ **Y la mitad que escribe la tienda vive en OTRO REPO**: `bdi-catalogo`, en
`api/tn-categorias.js` (acción `'stock'`) y `api/tiendanube-audit` (lectura). Un POST con una acción
que ese deploy todavía no conoce contesta como si nada.

⛔ **La venta en GN NO se crea desde acá**: la crea `api/crear-venta.js`, el único lugar del repo con
el token de ventas de GN.

## ⛔ Lo que comparte con otras secciones

- **`bdi-catalogo`** (`tiendanube-audit`, `tn-categorias`) — lo comparte con Tienda Nube
  (`docs/secciones/tncat.md`). Cambiarle la forma de la respuesta rompe las dos.
- **`api/crear-venta.js`** — lo comparten Canjes y este sync. Es el que tiene el token de GN.
- **`lib/sync-tn/core.ts`** es el mismo motor que va a usar cualquier otra tienda que se sume: la
  config sale por parámetro (`CFG_STUNNED`), no está adentro.

## Reglas que el código no dice

- 🔴 **Gestión Nube NO anula ventas por API.** Todo lo raro de la pestaña de Ventas viene de acá:
  una venta creada de más se limpia **a mano en la web de GN**. Por eso se importa **de a una**, con
  el cartel amarillo de duplicado a la vista, y ⛔ **no hay «importar todo» ni cron** — a diferencia
  de stock, donde escribir dos veces el mismo número es inocuo. El volumen real es de 1-2 órdenes
  online por mes.
- 🔴 **La fecha de corte (`CORTE_STUNNED`) es un ACUERDO CON UNA PERSONA, no una constante.** Desde
  ese día quien cargaba las ventas a mano **deja de cargarlas**; si nadie le avisa, lo del día se
  carga dos veces.
- 🔴 **Tanda parcial: el handler de stock escribe variante por variante y en serie**, y puede
  contestar 17 de 20. Por eso «Aplicar las N con diferencia» manda de a **20** (⛔ no las 500 que el
  handler acepta: no entran en el timeout de la función y chocan el rate limit de TN) y **cada fila
  se resuelve sola** — la regla vive en `lib/sync-tn/stock.core.ts`, con tests.
- 🔑 **Y si una tanda NO contesta, las filas quedan «sin confirmar», ni escritas ni falladas, y el
  bucle FRENA.** No se sabe si TN quedó escrito, y decir cualquiera de las dos cosas sería inventar.
  El que contesta de verdad es volver a verificar.
- 🔑 **`refresh=1` en el dry-run de stock no es una optimización al revés: es el oráculo.** El
  endpoint cachea una hora; sin eso, después de aplicar se releería el stock viejo y las diferencias
  darían cero **igual si no se escribió nada**.
- 🔑 **Sólo se sincroniza lo VALIDADO.** «Proponer» sube el cruce sin validar y el sync lo ignora
  hasta que alguien tilda. «Validar verdes» valida de una todo lo confiable (match por SKU exacto o
  por código de barras); el resto se mira de a uno.
- ⚠️ **El SKU real vive a nivel VARIANTE (talle) en los dos lados**, no a nivel producto: en el GN de
  Zattia el `sku` de `productos` es «STUNNED» para toda la línea, y el bueno
  (`STU-REM-0001-S`) está en `inventario`. Mapear por producto no cierra.
- ⚠️ **El stock de GN es la SUMA de todas las ubicaciones** (Depósito + Local). Si algún día hay que
  publicar sólo el depósito, es un cambio de criterio, no un bug.
- 🔑 **Stunned no tiene base propia**: `store='stunned'` se rutea a la de Zattia (`api/sku-map.js`,
  `cfgFor`). Es la misma decisión que en el resto del monitor — Stunned es una **línea**, no una
  marca.
- 🔑 **`ESCRITURA_HABILITADA` (arriba del archivo) es el interruptor de la importación de ventas.**
  Prenderlo **no importa nada solo**: hace aparecer el botón por fila. Está en `true` desde el
  11-ago-2026.
- 🔴 **`liberar` del ledger no es una lectura**: suelta la reserva de una orden. Liberar una que ya
  se importó es lo que habilita crear la venta dos veces en GN. Se usa sólo cuando GN cortó con 5xx
  y **alguien fue a mirar a GN**.
- ⚠️ El dry-run de ventas corta a los **31 días** de rango: TN es lento y el endpoint corta a los
  20 s.

## Lo que ya se rompió acá

- 🔴 Hasta el **13-ago-2026** `liberar` sólo exigía estar logueado: cualquiera podía soltar una
  reserva y habilitar la venta duplicada (`api/_sync-tn.js`, el comentario está en el archivo).
- ⚠️ `tn-categorias` **lee la tienda del query param (`?store=`), no del body**: sin eso asume
  `'bdi'` — o sea, escribiría el stock de Stunned en la tienda de BDI.

## Los nombres de los botones (25-ago-2026)

⚠️ **La pantalla ya no dice «Correr dry-run».** Salió de una crítica del equipo: *«la explicación
usa terminología técnica que no aporta a comunicar el mensaje principal»*. El criterio que quedó es
**el nombre en criollo primero y el término técnico entre paréntesis** —
`Verificar diferencias de stock (dry-run)` y `Verificar órdenes a importar (dry-run)` —, y las dos
pestañas pasaron a llamarse **Stock** y **Ventas** a secas. 🔑 **El «(dry-run)» se conserva a
propósito**: las dos novedades publicadas el 22-ago nombran el botón viejo al pie de la letra, y sin
el término entre paréntesis esos textos dejarían de encontrarse en la pantalla. Con la misma vuelta
salieron `matcheadas` → `emparejadas`, `El endpoint contestó` → `Tienda Nube contestó`, `Tandas` →
`Se escribe de a`, `GN product_id` → `ID en Gestión Nube` y `el sync` → `la sincronización`. La regla
entera vive en `docs/secciones/novedades.md`.

## Pendiente

- ▶️ **El dry-run de ventas no tiene botón masivo y NO debe tenerlo** mientras GN no anule por API.
  Está escrito acá para que no se «empareje» con el de stock por prolijidad.
- ⚠️ El `info` de `lib/nav.datos.ts` dice *«más adelante suma el panel de sincronización»*: las tres
  pestañas ya están.
- ▶️ La pestaña de stock no tiene forma de **reintentar sólo las que fallaron**: hay que volver a
  correr el dry-run entero (que es correcto, pero cuesta ~10 s contra TN).

## Cómo se prueba

`npx vitest run tests/sync-tn-core.test.ts tests/sync-tn-stock-core.test.ts tests/sync-tn-nota.test.ts`

🔴 **Lo que ningún test ejerce es lo único que importa: la escritura contra Tienda Nube.** Se camina
en prod, con la marca en **Zattia** (con BDI la sección no existe y `/integraciones` redirige a
Inicio, callado):

1. Stock → «Verificar diferencias de stock (dry-run)» (solo lectura, ~10 s).
2. Aplicar —una fila o la tanda entera— y mirar qué dice cada fila.
3. **Volver a verificar**: pide `refresh=1`, así que lee TN de verdad. Las diferencias tienen
   que dar **cero**. Ése es el oráculo por otro camino, y es el único que vale.

Caminado así el 23-ago-2026: 112 validadas, 8 con diferencia → 8 de 8 escritas → 0 con diferencia.

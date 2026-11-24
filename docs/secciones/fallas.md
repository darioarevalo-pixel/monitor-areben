# Fallas (Post-venta) — ficha de sección

Secciones `postventa` (Administración), `postventa-local` y `postventa-deposito`. El ledger de la
mercadería fallada: el Local o el Depósito la carga eligiendo el artículo de Gestión Nube, y esa
carga **descuenta la unidad de GN** con una venta técnica a $0 (precio de lista + 100 % de
descuento, cliente «Falla ZATTIA» / «Falla BDI»). Administración recibe, confirma y la valúa.

## Dónde vive

`components/postventa/Postventa.tsx` (un motor, tres modos) · `lib/postventa/fallas/`
(`core.ts` la decisión, `cliente.ts` el I/O, `tipos.ts`) · handler `api/_fallas.js` por la puerta
`api/postventa.js` · tabla `fallas_deposito` · la venta la crea `api/crear-venta.js` (PROD, es el
único que tiene los tokens de ventas) · tests `tests/fallas-ubicacion.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **La regla de de dónde sale una unidad es de Sesión de fotos**: `ubicaSola` / `origenDe`
  (`lib/sesionfotos/core.ts`). `ubicacionDeFalla` **delega**, ⛔ no la copia — ya se había escrito
  dos veces con el mismo agujero en las dos (`3597dff3`).
- **El buscador es de todos**: `components/ui/BuscarArticuloGN.tsx` lo usan siete pantallas.
- **La venta técnica es la misma** que usan Canjes, Reclamos y Sesión de fotos.

## 🔴 La ubicación la decide el STOCK, ⛔ no la sección (21-sep-2026)

> «cuando se procesa un producto como falla en este caso me parece que toco el stock del deposito»
> — Bruno, sobre TOP ALAIA CELESTE: **Local 2, Depósito −1**

Hasta hoy la sección ERA la respuesta: quien entraba por «Fallas de depósito» descontaba de
depósito. 📊 **Medido sobre el espejo de Zattia: los tres negativos de depósito eran las tres
fallas descontadas del depósito** —SHORT MAITE S (venta GN 28587), TOP ALAIA CELESTE (28688) y TOP
MONTANA Negro (21220, dic-2025)— y **ninguna** de las que cargó el Local dejó uno. 3 de 3.

🔴 **Y la pantalla ⛔ no tenía cómo avisar**: `BuscarArticuloGN` mostraba el stock **SUMADO** de las
dos ubicaciones, así que decía «stock 2» —las 2 del Local— con el depósito en 0. Ahora muestra
`Local N · Dep N`, y el stock viaja partido (`stock_local`, `stock_deposito`, `stock_otros`).

Ahora **gana el stock cuando ubica la prenda de un solo lado**; la sección (o el selector de
Administración) decide sólo cuando alcanza en los dos. 📊 Ensayado contra las **7 fallas reales**
antes de deployar: las 4 del Local ⛔ no se mueven, las 3 del Depósito pasan al Local.

⚠️ **Y una divergencia deliberada**: cuando ⛔ **no alcanza en NINGUNO** de los dos, manda la
sección —⛔ no el desempate de `origenDe`, que probaría el otro lado—. La unidad está en la mano de
quien la carga, y que el negativo quede de ese lado es lo que después deja arreglarlo.

## 🚚 Redespacho por falla (24-nov-2026)

> «me gustaria hacer el movimiento mas corto posible, y luego vemos como vamos ganando terreno, pq si tiene muchos
> pasos, no lo saben usar» — Bruno

A la clienta le llegó algo con falla y se le manda otro **desde el depósito**. Antes del corte se hacía en GN: venta
al cliente «Falla» con ubicación Depósito. Desde el corte, la única orden que Logística recibe para eso es el
**reemplazo de un reclamo** (`GET /internal-orders` del motor, `reason: replacement`). Así que el redespacho **es un
reclamo**, armado en un toque:

- Botón **«Redespacho por falla»** arriba de «Fallas del local» y «Fallas de depósito», y **«🚚 Redespacho»** en Inicio
  (`?redespacho=1` abre la tarjeta). Lo aprietan **Local y Depósito** (Bruno 24-nov) ⇒ la acción está en
  `ACCIONES_DE_LA_BANDEJA`: Depósito entra a Reclamos sólo por esa puerta.
- `components/postventa/Redespacho.tsx` → `redespachar` → `action: 'redespacho'` (`api/_reclamos.js`): crea el reclamo
  **resuelto, `otra_unidad`, motivo `falla`**, y descuenta con `fallaAlErp` (ajuste `fallado`, ref
  `devolucion-<id>-reemplazo:<depósito>`, **siempre del depósito**: es de donde sale lo que se despacha).
- 🔴 **El ref es el contrato con Logística** (`tests/redespacho.test.ts`): con otro ref el stock baja igual y la orden
  ⛔ llega. Si el ERP ⛔ descuenta (sin stock en el depósito, línea sin cortar), **el reclamo se elimina**: ⛔ queda un
  reemplazo sin orden.
- ⛔ Todavía no: lo que vuelve de la clienta, el motivo detallado, la decisión de Administración. El caso queda en
  Reclamos (`gn_venta_reemplazo_*` = `A-<ajuste>`) para seguirlo desde ahí.

## Reglas que el código no dice

- 🔑 **La falla de una línea que YA ESTÁ EN EL ERP ⛔ va a GN** (Bruno 30-oct-2026): «está en el ERP» = fila en `erp_corte` y el
  instante ya pasó (`lib/erp/corte.core.js`: Stunned desde el 28-oct, BDI 15/16-nov, Zattia 23-nov). Desde el corte el GN de esa
  línea ⛔ mueve el libro, así que `api/crear-venta.js` la manda al ERP como **ajuste «Fallado»** (su línea, `ref` =
  `falla-<id>:<depósito>`) **aplicado en el acto** —baja al cargarla, como la venta de GN— (`fallaAlErp`, `api/_salida-documento.js`).
  La línea la decide el servidor con `productos.sku` (⛔ el sku de la pantalla); una falla que mezcla líneas frena. Si el ERP ⛔ la
  puede anotar —o ⛔ se puede leer `erp_corte`— **frena (409)**, ⛔ cae a GN. La falla queda sin `gn_venta_*` y con **`erp_ajuste`**
  (sql/migrate-fallas-5.sql): la lista muestra «ajuste ERP A-N». Eliminar la falla ⛔ deshace el ajuste, y el cartel lo dice.

- **Una falla SIN `product_id`/`size_id` ⛔ no descuenta nada**: es la «falla libre» de
  Administración, que sólo anota. Es también lo que pasa cuando falta la credencial.
- **`recibir` mueve `ubicacion` a `deposito`**, y ⛔ ése no es el mismo dato que el de dónde se
  descontó: la venta ya se hizo al cargar. El campo cuenta dos historias.
- **Eliminar una falla ⛔ NO anula la venta en GN** — lo dice el `confirm`, y es de verdad.
- 🔴 **GN ⛔ no anula ni edita por API** (`api/crear-venta.js`): una venta contra la sucursal
  equivocada se arregla **a mano en GN**, con un ajuste de stock o anulando y rehaciendo.

## Lo que ya se rompió acá

- **Las dos ventas mal ubicadas de Zattia (28688 y 28587) se arreglaron a mano**, con una
  transferencia de 1 u Local → Depósito: el arreglo del código ⛔ no corrige lo ya escrito en GN.
  ⚠️ **Queda TOP MONTANA Negro en −1** (venta 21220, dic-2025).
- **«Se puede rehacer desde Administración» es una promesa falsa**: cuando falta la credencial la
  falla queda cargada y sin descontar, y ⛔ **no existe ningún botón que rehaga esa venta**.

## Pendiente

- ▶️ El botón que falta: **rehacer la venta técnica** de una falla cargada sin credencial.
- ✅ 24-nov: `descontarReemplazo` anota el ajuste del ERP (`A-n`) en `gn_venta_reemplazo_*`: antes quedaba en null y el botón seguía a la vista.
- ▶️ `pasarAFallas`, `descontarReemplazo` y `descontarRegaladas` (`lib/reclamos/cliente.ts`)
  **siguen fijando `'deposito'`**: misma forma, y ahí muerde en BDI.

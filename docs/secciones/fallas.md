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

## Reglas que el código no dice

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
- ▶️ `pasarAFallas`, `descontarReemplazo` y `descontarRegaladas` (`lib/reclamos/cliente.ts`)
  **siguen fijando `'deposito'`**: misma forma, y ahí muerde en BDI.

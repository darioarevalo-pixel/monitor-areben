# Productos caducados — ficha de sección

Sección `caducados`, área Administración. Lista lo que hay que dar de baja: **sin stock en ningún
depósito y sin vender hace más de N días** (30 por defecto). La usan Darío y Bruno para limpiar
Tienda Nube y Gestión Nube por familia («top», «jean»…).

## Dónde vive

`components/caducados/` (pantalla + `datosCaducados.ts`, que baja sus propios datos) ·
`lib/caducados.ts` (todo el cálculo, puro) · `tests/caducados.test.ts`. Lee el espejo por
`fetchAll` (inventario, productos, ventas, venta_detalles) y la tienda por `traerAudit(…,
{variantes:true})` (`lib/tn-audit.ts`, caché compartido con la sección Tienda Nube).

## Reglas que el código no dice

- **Los 30 días son el plazo máximo de cambio** (lo definió Darío, 5-oct-2026): antes de eso un
  producto puede volver por un cambio. Vale para todas las familias, temporada incluida.
- **Dos pestañas, una por sistema, y cada una mira SÓLO el suyo.** La de TN incluye productos ya
  desactivados en GN: el ETL baja sólo activos (`active=eq.1`), por eso `datosCaducados` baja
  `productos` entero. Medido el 5-oct: de 194 tops caducados, 149 ya estaban inactivos en GN y 78
  seguían (ocultos) en la tienda. Filtrar la pestaña de TN por activos en GN los vuelve invisibles.
- **Gemelos de nombre**: Zattia carga productos distintos con el mismo nombre (temporadas,
  duplicados). Una publicación de TN que cruza con un gemelo VIGENTE no se lista. → la regla
  exacta, con los casos medidos, en el comentario de `pendientesTn`. 🔴 **Ya costó una**: TOP ALO
  se eliminó de TN con un gemelo vendido 19 días antes, porque el conteo a mano miró el stock del
  gemelo y no su última venta.
- **El cruce con TN es por nombre EXACTO**, a propósito distinto de `matchTn`: ver `normNombre`.
- **Eliminar en TN no tiene vuelta atrás y TN no guarda historial.**

## Eliminar de Tienda Nube (6-oct-2026)

- Botón en la pestaña TN, **sólo Darío y Bruno** (`puedeEliminarTn`; no alcanza `admin`: la cuenta
  técnica «CRM» también lo es). Escribe por `bdi-catalogo/api/tn-categorias.js` acción `eliminar`,
  de a 10 por pedido.
- 🔴 **Los frenos viven en el SERVIDOR** (`bdi-catalogo/api/_tn-eliminar.js`, probado con
  `node scripts/check-tn-eliminar.mjs`): relee el producto en la tienda y se saltea si cambió de
  nombre, si tiene stock en TN o si no se pudo guardar el respaldo. Lo de la pantalla es comodidad.
- **Respaldo**: el JSON entero de TN en el KV de bdi-catalogo, `tn-eliminado:<store>:<id>`, y el
  registro en la lista `tn-eliminados:<store>` (quién, cuándo), que muestra la pestaña
  **Eliminados** (`GET tn-categorias?accion=eliminados`). Lo eliminado ANTES del botón (5 tops el
  5/6-oct: ALASKA, ALO, AMELIA, ANGIE, BALI) no está ahí. ⚠️ Las fotos quedan como LINKS al
  CDN de TN: no está medido si sobreviven a la eliminación. No hay pantalla para recuperar.

## Lo que falta

- **GN**: confirmar si la API deja desactivar (hoy el aviso dice que no). Si no, sigue a mano.
- Recuperar un producto desde su respaldo (la pestaña Eliminados hoy sólo muestra).
- ⛔ Desde una sesión de Claude Code en modo automático **no se puede eliminar en serie** en la
  tienda (ni por Chrome, ni por Lumi, ni con reglas `allow`): por eso el botón.

/**
 * Recupero de los clavados: cuánta plata vuelve de los productos a los que ya se les bajó el precio.
 *
 * `.js` plano: lo importan `api/_clavados.js`, `api/_memo.js` y la pantalla. `tipos.ts` es el
 * re-export tipado.
 *
 * # Lo que este archivo NO hace
 *
 * ⛔ **No decide quién es clavado.** Es una decisión de Bruno que vive en la tabla `clavados`
 * (`sql/migrate-clavados.sql`). `detectarComercial` detecta *candidatos* — stock que no rota — y es
 * otra pregunta: un candidato es algo para mirar, un clavado es algo que ya se decidió.
 *
 * # 🔴 La regla que ordena todo lo de abajo: el numerador es un RANGO, no un estado
 *
 * El stock llega a 0 **justo en la semana en que el recupero se completó**. Si el número de la
 * semana saliera del estado de hoy, el memo de esa semana perdería justo el producto que mejor
 * salió. Por eso lo que se factura en una semana sale de **las ventas de esa semana**, y
 * `visto_en_cero` no entra en esa cuenta: sólo decide si el producto sigue en la lista activa.
 */

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Lo que facturó cada producto marcado, en un rango de fechas.
 *
 * ⚠️ **Esto es MERCADERÍA, no «lo facturado».** El descuento y el envío son de la venta entera y no
 * se pueden repartir entre los productos de un ticket sin inventar un criterio — el mismo motivo
 * por el que la tabla por línea del memo dice «Mercadería». La pantalla lo llama por su nombre.
 *
 * 🔑 **La fecha sale del mapa de ventas, NUNCA del rango de `sale_id`.** `venta_detalles` no tiene
 * fecha propia y se pide por rango de id, que arrastra ventas de otras fechas. Misma disciplina que
 * `ventaPorLinea`.
 *
 * @param ventas   filas de `ventas` (`id`, `date_sale`)
 * @param detalles filas de `venta_detalles` (`sale_id`, `product_id`, `quantity`, `total`)
 * @returns Map product_id (string) → `{ mercaderia, unidades }`
 */
export function ventaPorProducto({ ventas, detalles, desde, hasta }) {
  const enRango = new Set()
  for (const v of ventas || []) {
    const fecha = String(v.date_sale || '').slice(0, 10)
    if (fecha && fecha >= desde && fecha <= hasta) enRango.add(String(v.id))
  }
  const out = new Map()
  for (const d of detalles || []) {
    if (!enRango.has(String(d.sale_id))) continue
    const pid = String(d.product_id)
    const a = out.get(pid) || { mercaderia: 0, unidades: 0 }
    a.mercaderia += num(d.total)
    a.unidades += num(d.quantity)
    out.set(pid, a)
  }
  return out
}

/**
 * El capital que **sigue** parado en un producto: lo que queda en el depósito, a lo que costó.
 *
 * 🔴 🔑 **`null` no es cero, y acá esa diferencia es la que hace que el número signifique algo.**
 * Sin denominador, «recuperaste $X» no dice si vamos bien o mal. Con un denominador inventado, dice
 * que vamos bárbaro:
 *
 * - **costo `null`** = no lo sabemos. Hoy son los 450 productos de BDI, que están en NULL porque el
 *   token del sync no tiene `costs:read` (ver `scripts/lib/costos-espejo.mjs`). ⛔ Tratarlo como 0
 *   haría que TODA la marca diera 100 % de recupero.
 * - **costo `0`** = el producto está cargado sin costo. En Zattia son **769 de 2.676** (medido el
 *   24-ago-2026). Su capital parado da 0 y el recupero da 100 % — un número perfecto y falso.
 *
 * ⇒ Los dos casos son **«no medible»**, ⛔ nunca «recuperado». El cero afirma.
 */
export function capitalParado({ stock, costo }) {
  const c = costo == null ? null : Number(costo)
  if (c === null || !Number.isFinite(c) || c <= 0) return null
  return num(stock) * c
}

/**
 * Arma el renglón de un clavado para un rango: cuánto volvió y cuánto sigue parado.
 *
 * @param clavado  fila de `clavados` (`producto_id`, `sku`, `nombre`, `marcado_en`, `visto_en_cero`)
 * @param venta    `{ mercaderia, unidades }` del rango, o `undefined` si no vendió
 * @param stock    unidades que quedan hoy
 * @param costo    `unit_cost` del espejo — `null` cuando el sync no lo pudo leer
 */
export function renglonClavado({ clavado, venta, stock, costo }) {
  const recuperado = venta ? num(venta.mercaderia) : 0
  const parado = capitalParado({ stock, costo })
  return {
    producto_id: String(clavado.producto_id),
    sku: clavado.sku || null,
    nombre: clavado.nombre || null,
    marcado_en: clavado.marcado_en || null,
    // 📌 Se calcula acá y no se lee de la fila: la columna guarda cuándo el sistema VIO el cero, y
    // lo que la pantalla necesita saber es si hoy queda algo. Son dos cosas distintas y la segunda
    // es la cierta.
    agotado: num(stock) <= 0,
    stock: num(stock),
    unidades: venta ? num(venta.unidades) : 0,
    recuperado,
    parado,
    // 🔴 El porcentaje SÓLO existe cuando hay denominador. Un `recuperado / 0` da Infinity y un
    // `recuperado / null` da un número; los dos se dibujan lindo y los dos mienten.
    pct: parado != null && parado + recuperado > 0 ? (recuperado / (parado + recuperado)) * 100 : null,
  }
}

/**
 * El total del bloque, con lo que no se puede medir contado aparte.
 *
 * 🔑 **`sinCosto` no es una curiosidad técnica: es el tamaño de lo que el total NO está diciendo.**
 * Un total de recupero sin ese número al lado se lee como si cubriera todo, y hoy en BDI no cubre
 * nada. Mismo criterio que los `problemas[]` de la foto del memo — media foto sin aviso se lee como
 * foto entera.
 */
export function resumirClavados(renglones) {
  const filas = renglones || []
  let recuperado = 0
  let parado = 0
  let sinCosto = 0
  for (const r of filas) {
    recuperado += num(r.recuperado)
    if (r.parado == null) sinCosto += 1
    else parado += r.parado
  }
  return {
    productos: filas.length,
    agotados: filas.filter((r) => r.agotado).length,
    recuperado,
    parado,
    /** Cuántos productos no tienen costo legible. El total de arriba **no los incluye**. */
    sinCosto,
    pct: parado + recuperado > 0 ? (recuperado / (parado + recuperado)) * 100 : null,
  }
}

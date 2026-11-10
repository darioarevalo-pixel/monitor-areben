/**
 * ERP › Ventas › «Nueva venta» (Bruno 10-nov, maqueta aprobada https://claude.ai/artifact/3Nutg1d5DUosBacCS6JZnF): la cuenta de la
 * venta a mano. «Es muy parecido al POS, pero sin la validación» y «más manual y más libre»: el precio de lista, el descuento de
 * cada prenda y el % de la forma de pago se EDITAN; el redondeo es el del POS (`redondeo` de `lib/caja/core.core.js`, paso de
 * `caja_config.reglas.redondeo`).
 *
 * La forma es la de la venta del POS en el motor (`entradaDelMotor`): cada línea con `precio` (de lista, por unidad), `descuento` (pesos)
 * e `importe` (lo que queda); cada pago con `base` (la parte del subtotal que paga), `porcentaje`, `descuento` (pesos), `redondeo` y
 * `monto` = base − descuento + redondeo. Σ importe = subtotal; Σ monto = total.
 *
 * 🔑 La MISMA función arma la pantalla y la entrada del servidor (`api/_erp-cargar.js`): el servidor ⛔ confía en los montos del
 * navegador, los vuelve a calcular con lo que se eligió.
 * Puro (⛔ red ni base): JS plano porque lo importa el handler.
 */
import { redondeo } from '../caja/core.core.js'

const centavos = (x) => Math.round(Number(x) * 100) / 100
const PASOS = [0, 1, 10, 50, 100, 500, 1000]

/** El paso de redondeo de la Caja (0 = sin redondeo). Uno raro ⇒ 0 (⛔ se inventa). */
export function pasoDeRedondeo(paso) {
  const n = Number(paso)
  return PASOS.includes(n) ? n : 0
}

/**
 * @param {{ lineas: Array<{ precio: number, cantidad: number, descuentoPct?: number }>,
 *   pagos: Array<{ base?: number|null, porcentaje?: number, redondear?: boolean }>, paso: number }} e
 *   `pagos[i].base`: la parte del subtotal que paga cada uno; el ÚLTIMO sin base paga lo que falta (con un solo pago, todo).
 * @returns {{ ok: true, lineas: Array<{ precio: number, cantidad: number, descuento: number, importe: number }>, subtotal: number,
 *   pagos: Array<{ base: number, porcentaje: number, descuento: number, redondeo: number, monto: number }>, total: number }
 *   | { ok: false, error: string }}
 */
export function cuentaDeNuevaVenta({ lineas, pagos, paso }) {
  if (!Array.isArray(lineas) || !lineas.length) return { ok: false, error: 'Agregá al menos un producto.' }
  const ls = []
  for (const l of lineas) {
    const precio = centavos(l.precio), cantidad = Number(l.cantidad), pct = Number(l.descuentoPct ?? 0)
    if (!Number.isInteger(cantidad) || cantidad <= 0) return { ok: false, error: 'Cada producto lleva una cantidad entera mayor a 0.' }
    if (!(precio >= 0)) return { ok: false, error: 'Falta el precio de algún producto.' }
    if (!(pct >= 0 && pct <= 100)) return { ok: false, error: 'El descuento de un producto va de 0 a 100 %.' }
    const bruto = centavos(precio * cantidad)
    const importe = centavos(bruto * (1 - pct / 100))
    ls.push({ precio, cantidad, descuento: centavos(bruto - importe), importe })
  }
  const subtotal = centavos(ls.reduce((a, l) => a + l.importe, 0))
  if (!Array.isArray(pagos) || !pagos.length) return { ok: false, error: 'Falta cómo pagó.' }
  const p = pasoDeRedondeo(paso)
  const ps = []
  let resto = subtotal
  for (let i = 0; i < pagos.length; i++) {
    const x = pagos[i]
    const ultimo = i === pagos.length - 1
    const base = ultimo && (x.base == null || x.base === '') ? centavos(resto) : centavos(x.base)
    const porcentaje = Number(x.porcentaje ?? 0)
    if (!(base >= 0)) return { ok: false, error: `Falta cuánto paga con la forma ${i + 1}.` }
    if (!(porcentaje >= 0 && porcentaje <= 100)) return { ok: false, error: 'El % de la forma de pago va de 0 a 100.' }
    const descuento = centavos(base * porcentaje / 100)
    const neto = centavos(base - descuento)
    const r = x.redondear && p > 0 ? redondeo(neto, p) : { total: neto, ajuste: 0 }
    ps.push({ base, porcentaje, descuento, redondeo: centavos(r.ajuste), monto: centavos(r.total) })
    resto = centavos(resto - base)
  }
  if (Math.abs(resto) > 0.009) return { ok: false, error: `Las formas de pago cubren ${centavos(subtotal - resto)} y la venta es de ${subtotal}.` }
  return { ok: true, lineas: ls, subtotal, pagos: ps, total: centavos(ps.reduce((a, x) => a + x.monto, 0)) }
}

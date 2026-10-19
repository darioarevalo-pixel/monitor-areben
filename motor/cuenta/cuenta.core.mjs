/**
 * La CUENTA CORRIENTE de un cliente (paso 8, BDI; sql/025). Puro: recibe los movimientos y devuelve la cuenta.
 *
 * 🔑 Bruno y Darío (18-oct): el mayorista con crédito paga A CUENTA (un monto que cubre varias ventas) ⇒ cada pago se
 * aplica a la compra MÁS VIEJA que todavía debe (lo que sobra queda a favor y paga la compra siguiente). El saldo y la
 * antigüedad se CALCULAN, ⛔ se guardan. Lo que el ERP da solo: cuánto debe cada uno, quién está atrasado, FRENAR a
 * quien debe, y el MAYOR de compras y pagos (Darío) para exportar.
 *
 * Un movimiento: `{ tipo: 'compra'|'pago', ref, fecha: 'AAAA-MM-DD', monto > 0, detalle? }` — de las filas del libro
 * (`cuenta_movimiento`, sql/025) con `movimientosDeLibro`.
 * La fecha es el DÍA de Argentina (la pone quien lee la base): la antigüedad se cuenta en días enteros.
 */

const pesos = (x) => Math.round(Number(x) * 100) / 100
/** Medio peso de tolerancia: todo se guarda con 2 decimales. */
const casi0 = (x) => Math.abs(x) < 0.5

const DIA_MS = 86_400_000
/** Días entre dos fechas `AAAA-MM-DD` (b − a). */
export const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS)

/**
 * El orden del mayor: por día; en el mismo día, la compra antes que el pago (el pago del día salda la compra del día), y
 * entre dos del mismo tipo, como vinieron (el libro las trae por hora: `sort` es estable).
 */
const orden = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.tipo === b.tipo ? 0 : a.tipo === 'compra' ? -1 : 1)

function validar(movs) {
  for (const m of movs) {
    if (m.tipo !== 'compra' && m.tipo !== 'pago') throw new Error(`movimiento de tipo desconocido: ${m.tipo}`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.fecha)) throw new Error(`fecha inválida en ${m.ref}: ${m.fecha}`)
    if (!(Number(m.monto) > 0)) throw new Error(`monto inválido en ${m.ref}: ${m.monto}`)
  }
  return [...movs].sort(orden)
}

/**
 * Aplica los pagos a las compras, la más vieja primero.
 * @returns {{ compras: Array<{ref, fecha, monto, pendiente}>, a_favor: number, saldo: number }}
 *   `saldo` = compras − pagos (> 0 debe, < 0 a favor) · `a_favor` = lo pagado de más que ⛔ tuvo compra que pagar.
 */
export function aplicar(movs) {
  const compras = []
  let a_favor = 0
  let i = 0 // la compra más vieja con algo pendiente
  for (const m of validar(movs)) {
    if (m.tipo === 'compra') {
      const c = { ref: m.ref, fecha: m.fecha, monto: pesos(m.monto), pendiente: pesos(m.monto) }
      const usa = Math.min(a_favor, c.pendiente)
      c.pendiente = pesos(c.pendiente - usa)
      a_favor = pesos(a_favor - usa)
      compras.push(c)
      continue
    }
    let resto = pesos(m.monto)
    for (; i < compras.length && resto > 0; i++) {
      const usa = Math.min(resto, compras[i].pendiente)
      compras[i].pendiente = pesos(compras[i].pendiente - usa)
      resto = pesos(resto - usa)
      if (compras[i].pendiente > 0) break
    }
    a_favor = pesos(a_favor + resto)
  }
  for (const c of compras) if (casi0(c.pendiente)) c.pendiente = 0
  const saldo = pesos(compras.reduce((s, c) => s + c.pendiente, 0) - a_favor)
  return { compras, a_favor, saldo }
}

/**
 * Las filas de `cuenta_movimiento` (sql/025) → los movimientos de la cuenta. La anulación (`<ref>:anulacion`) se
 * NETEA con lo que da vuelta: una compra o un pago anulado del todo ⛔ aparece; la fecha es la del movimiento original.
 * @param {Array<{ tipo: string, ref: string, monto: any, fecha: string, detalle?: string }>} filas  `fecha` = el día AR
 */
export function movimientosDeLibro(filas) {
  const por = new Map()
  for (const f of filas) {
    const base = f.tipo === 'anulacion' ? String(f.ref).replace(/:anulacion$/, '') : f.ref
    const m = por.get(base) ?? { ref: base, neto: 0, fecha: null, detalle: '' }
    m.neto = pesos(m.neto + Number(f.monto))
    if (f.tipo !== 'anulacion') { m.fecha = f.fecha; m.detalle = f.detalle ?? '' }
    por.set(base, m)
  }
  const movs = []
  for (const m of por.values()) {
    if (casi0(m.neto)) continue
    if (!m.fecha) throw new Error(`anulación sin su movimiento: ${m.ref}`)
    movs.push({ tipo: m.neto > 0 ? 'compra' : 'pago', ref: m.ref, fecha: m.fecha, monto: Math.abs(m.neto), detalle: m.detalle })
  }
  return movs
}

export const TRAMOS = [
  { hasta: 30, nombre: '0–30' }, { hasta: 60, nombre: '31–60' }, { hasta: 90, nombre: '61–90' }, { hasta: Infinity, nombre: 'más de 90' },
]

/**
 * El estado de la cuenta a un día.
 * @param {{ movs: any[], credito?: { credito: boolean, tope?: number|null, dias?: number|null } | null, hoy: string }} e
 * @returns {{ saldo, a_favor, debe, dias_mayor, vencido, atrasado, tramos: Record<string, number>, pendientes: any[], sin_credito: boolean }}
 *   `dias_mayor` = la antigüedad de la compra más vieja que debe · `vencido` = lo que debe de compras más viejas que el
 *   plazo · `atrasado` = hay vencido · `sin_credito` = debe sin tener crédito marcado.
 */
export function estado({ movs, credito = null, hoy }) {
  const { compras, a_favor, saldo } = aplicar(movs)
  const pendientes = compras.filter((c) => c.pendiente > 0).map((c) => ({ ...c, dias: diasEntre(c.fecha, hoy) }))
  const debe = pesos(pendientes.reduce((s, c) => s + c.pendiente, 0))
  const tramos = Object.fromEntries(TRAMOS.map((t) => [t.nombre, 0]))
  for (const c of pendientes) {
    const t = TRAMOS.find((x) => c.dias <= x.hasta)
    tramos[t.nombre] = pesos(tramos[t.nombre] + c.pendiente)
  }
  const tiene = Boolean(credito?.credito)
  // Sin plazo marcado, ⛔ se atrasa: el plazo lo pone quien marca el crédito. Sin crédito, todo lo que debe ya está vencido.
  const plazo = tiene ? (credito.dias ?? null) : 0
  const vencido = plazo == null ? 0 : pesos(pendientes.filter((c) => c.dias > plazo).reduce((s, c) => s + c.pendiente, 0))
  return {
    saldo, a_favor, debe,
    dias_mayor: pendientes.length ? Math.max(...pendientes.map((c) => c.dias)) : 0,
    vencido, atrasado: vencido > 0, tramos, pendientes,
    sin_credito: !tiene && debe > 0,
  }
}

/**
 * ¿Se le puede vender A CUENTA `monto` más? `null` si sí; si no, el motivo. La venta se frena con PIN de admin
 * (hasta el corte vende GN: es sólo un AVISO).
 * @param {{ cuenta: ReturnType<typeof estado>, credito?: { credito: boolean, tope?: number|null } | null, monto: number }} e
 */
export function frena({ cuenta, credito = null, monto }) {
  if (!credito?.credito) return { codigo: 'SIN_CREDITO', mensaje: 'El cliente no tiene crédito: la venta a cuenta necesita el PIN de un admin' }
  if (cuenta.atrasado) return { codigo: 'ATRASADO', mensaje: `Debe ${cuenta.vencido} de compras con más de ${credito.dias} días: la venta a cuenta necesita el PIN de un admin` }
  if (credito.tope != null && cuenta.saldo + Number(monto) > Number(credito.tope) + 0.5) {
    return { codigo: 'SUPERA_TOPE', mensaje: `Con esta venta debería ${pesos(cuenta.saldo + Number(monto))} y el tope es ${pesos(credito.tope)}: necesita el PIN de un admin` }
  }
  return null
}

/**
 * El MAYOR (Darío): un renglón por movimiento, con el saldo que va quedando. Lo anterior a `desde` entra como
 * «saldo anterior» en un renglón.
 * @param {{ movs: any[], desde?: string, hasta?: string }} e
 * @returns {{ anterior: number, renglones: Array<{ fecha, tipo, ref, detalle, debe, haber, saldo }>, final: number }}
 */
export function mayor({ movs, desde = null, hasta = null }) {
  let saldo = 0
  let anterior = 0
  const renglones = []
  for (const m of validar(movs)) {
    if (hasta && m.fecha > hasta) break
    const debe = m.tipo === 'compra' ? pesos(m.monto) : 0
    const haber = m.tipo === 'pago' ? pesos(m.monto) : 0
    saldo = pesos(saldo + debe - haber)
    if (desde && m.fecha < desde) { anterior = saldo; continue }
    renglones.push({ fecha: m.fecha, tipo: m.tipo, ref: m.ref, detalle: m.detalle ?? '', debe, haber, saldo })
  }
  return { anterior, renglones, final: saldo }
}

const celda = (v) => {
  const s = String(v ?? '')
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
/** Número para el Excel de Argentina: coma decimal, sin miles. */
const num = (x) => (x ? pesos(x).toFixed(2).replace('.', ',') : '')

/**
 * El mayor en CSV para Excel (separador `;`, coma decimal, BOM para los acentos).
 * @param {ReturnType<typeof mayor>} m @param {{ cliente: string, marca: string, desde?: string, hasta?: string }} cab
 */
export function mayorCSV(m, cab) {
  const filas = [
    ['Cuenta corriente', cab.cliente], ['Marca', cab.marca], ['Desde', cab.desde ?? ''], ['Hasta', cab.hasta ?? ''], [],
    ['Fecha', 'Movimiento', 'Comprobante', 'Detalle', 'Debe', 'Haber', 'Saldo'],
    ['', 'Saldo anterior', '', '', '', '', num(m.anterior) || '0,00'],
    // La compra se nombra por su venta («Venta 12»), ⛔ por la clave interna; el pago, por su comprobante y su cuenta.
    ...m.renglones.map((r) => {
      const interna = String(r.ref).startsWith('venta:')
      return [r.fecha, r.tipo === 'compra' ? 'Compra' : 'Pago', interna ? r.detalle : r.ref, interna ? '' : r.detalle, num(r.debe), num(r.haber), num(r.saldo) || '0,00']
    }),
    ['', 'Saldo final', '', '', '', '', num(m.final) || '0,00'],
  ]
  return `﻿${filas.map((f) => f.map(celda).join(';')).join('\r\n')}\r\n`
}

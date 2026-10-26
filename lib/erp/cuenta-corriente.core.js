/**
 * ERP › Clientes y proveedores › Cuenta corriente (tablero 4 del v8, pestaña «Cuenta corriente»; contrato §15 de
 * `~/Documents/erp-monitor/contrato-venta.md`): el núcleo PURO de la lista. Los datos son los de `cuentasCorrientes` del
 * motor (uno por cliente × línea); lo arma `api/_erp-clientes.js` y lo dibuja `components/erp/clientes/CuentaCorriente.tsx`.
 *
 * 🔑 Un solo saldo: el de la cuenta = lo que debe compra por compra − lo que tiene a favor (lo calcula el motor; acá ⛔ se
 *    recalcula nada, sólo se suma para el resumen).
 * 🔑 «Atrasada» es la del motor: sin crédito marcado TODO lo que debe ya está vencido; con crédito, lo que pasa el plazo.
 */

import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'
import { normal } from './stock-lista.core.js'

const num = (x) => Number(x) || 0
export const NOMBRE_LINEA = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
export const TRAMOS = ['0–30', '31–60', '61–90', 'más de 90']

/** El estado de la fila: atrasada (debe y está vencido) · a favor · al día (debe sin vencer) · sin saldo (sólo el crédito). */
export function estadoDe(c) {
  if (num(c.vencido) > 0) return 'atrasada'
  if (num(c.saldo) < 0) return 'favor'
  if (num(c.debe) > 0) return 'aldia'
  return 'cero'
}

/** El crédito en palabras: «Sin crédito» · «Sin tope · 30 días» · «Tope $ … · sin plazo». */
export function textoCredito(credito, plata = (n) => `$ ${Math.round(n).toLocaleString('es-AR')}`) {
  if (!credito?.credito) return 'Sin crédito'
  return `${credito.tope == null ? 'Sin tope' : `Tope ${plata(num(credito.tope))}`} · ${credito.dias == null ? 'sin plazo' : `${credito.dias} días`}`
}

/** @param {Array<{ linea: string } & Record<string, any>>} cuentas lo de `cuentasCorrientes`, con la línea pegada */
export function armarFilasCuenta(cuentas) {
  return cuentas.map((c) => ({
    id: `${c.cliente_id}|${c.linea}`, clienteId: c.cliente_id, linea: c.linea, nombre: String(c.nombre ?? '').trim() || 'Sin nombre',
    doc: c.doc ?? null, whatsapp: c.whatsapp ?? null, saldo: num(c.saldo), debe: num(c.debe), aFavor: num(c.a_favor), vencido: num(c.vencido),
    diasMayor: num(c.dias_mayor), tramos: Object.fromEntries(TRAMOS.map((t) => [t, num(c.tramos?.[t])])),
    credito: c.credito ?? null, sinCredito: !!c.sin_credito, estado: estadoDe(c),
    // Del motor desde febbb99 (§18): cuántas compras debe y el último pago a cuenta en pie (null = ninguno).
    ventasConSaldo: c.ventas_con_saldo == null ? null : num(c.ventas_con_saldo), ultimoCobro: c.ultimo_cobro ?? null,
  }))
}

/** Las vistas, con su número arriba. @type {Array<[string, string, (f: any) => boolean]>} */
export const VISTAS = [
  ['saldo', 'Con saldo', (f) => f.saldo !== 0],
  ['atrasadas', 'Atrasadas', (f) => f.estado === 'atrasada'],
  ['favor', 'Con saldo a favor', (f) => f.aFavor > 0],
  ['credito', 'Con crédito', (f) => !!f.credito?.credito],
  ['todas', 'Todas', () => true],
]

/** @param {any[]} filas @returns {Record<string, number>} */
export function contarVistas(filas) {
  return Object.fromEntries(VISTAS.map(([k, , entra]) => [k, filas.filter(entra).length]))
}

/** @param {any[]} filas @param {{ vista?: string, q?: string }} [p] @returns {any[]} */
export function filtrar(filas, { vista = 'todas', q = '' } = {}) {
  const entra = VISTAS.find(([k]) => k === vista)?.[2] ?? (() => true)
  const t = normal(q)
  return filas.filter((f) => entra(f) && (!t || normal(`${f.nombre} ${f.doc ?? ''}`).includes(t)))
}

/** Por cobrar = Σ saldo (lo que deben − lo que tienen a favor): el mismo número que la ficha, cliente por cliente. */
/** @param {any[]} filas */
export function resumen(filas) {
  const r = { cuentas: filas.length, porCobrar: 0, debe: 0, conSaldo: 0, aFavor: 0, conFavor: 0, vencido: 0, atrasadas: 0, conCredito: 0, tramos: Object.fromEntries(TRAMOS.map((t) => [t, 0])) }
  for (const f of filas) {
    r.porCobrar += f.saldo
    r.debe += f.debe
    if (f.saldo !== 0) r.conSaldo++
    r.aFavor += f.aFavor
    if (f.aFavor > 0) r.conFavor++
    r.vencido += f.vencido
    if (f.estado === 'atrasada') r.atrasadas++
    if (f.credito?.credito) r.conCredito++
    for (const t of TRAMOS) r.tramos[t] += f.tramos[t]
  }
  for (const k of ['porCobrar', 'debe', 'aFavor', 'vencido']) r[k] = Math.round(r[k] * 100) / 100
  for (const t of TRAMOS) r.tramos[t] = Math.round(r.tramos[t] * 100) / 100
  return r
}

/**
 * Sin orden elegido: el del motor (atrasadas primero, después la que más debe).
 * @param {any[]} filas @param {{ col: string, dir: string } | null} orden @returns {any[]}
 */
export function ordenar(filas, orden) {
  const k = orden?.col
  if (!k) return filas.slice()
  const dir = orden.dir === 'asc' ? 1 : -1
  const val = (f) => (k === 'c' ? normal(f.nombre) : k === 'linea' ? f.linea : k === 'credito' ? (f.credito?.credito ? 1 : 0)
    : TRAMOS.includes(k) ? f.tramos[k] : { debe: f.debe, favor: f.aFavor, saldo: f.saldo, vencido: f.vencido, dias: f.diasMayor, ventas: f.ventasConSaldo ?? 0, cobro: f.ultimoCobro?.fecha ?? '' }[k] ?? 0)
  return filas.slice().sort((a, b) => {
    const x = val(a), y = val(b)
    return (x > y ? 1 : x < y ? -1 : 0) * dir || normal(a.nombre).localeCompare(normal(b.nombre))
  })
}

/** [título, ancho, ordena, fija] @returns {Record<string, [string, string, boolean, boolean]>} */
export function columnasDe() {
  return {
    c: ['Cliente', 'minmax(200px, 1.6fr)', true, true],
    linea: ['Línea', '84px', true, false],
    debe: ['Pendiente', '120px', true, false],
    favor: ['Saldo a favor', '120px', true, false],
    saldo: ['Saldo de la cuenta', '140px', true, true],
    vencido: ['Vencido', '120px', true, false],
    dias: ['La más vieja', '104px', true, false],
    ventas: ['Ventas con saldo', '104px', true, false],
    cobro: ['Último cobro', '130px', true, false],
    credito: ['Crédito', 'minmax(150px, 1fr)', true, false],
    estado: ['Estado', '110px', false, false],
    '0–30': ['0–30 días', '110px', true, false],
    '31–60': ['31–60 días', '110px', true, false],
    '61–90': ['61–90 días', '110px', true, false],
    'más de 90': ['Más de 90', '110px', true, false],
  }
}

export function columnasDeSiempre() {
  return {
    orden: ['c', 'linea', 'debe', 'favor', 'saldo', 'vencido', 'dias', 'ventas', 'cobro', 'credito', 'estado', '0–30', '31–60', '61–90', 'más de 90'],
    visibles: ['c', 'debe', 'favor', 'saldo', 'dias', 'cobro', 'credito', 'estado'],
  }
}

export const normalizarPrefs = (raw) => normalizarPrefsDe(columnasDe(), columnasDeSiempre(), raw)
export const alternarColumna = (prefs, col) => alternarColumnaDe(columnasDe(), prefs, col)
export { moverColumna }

/** Lo que el mayor y los pendientes llaman «venta:<uuid>» se nombra por su venta («Venta 860», del detalle del mayor). */
export function nombresDeVentas(mayor) {
  const m = new Map()
  for (const r of mayor?.renglones ?? []) if (String(r.ref).startsWith('venta:') && r.detalle) m.set(r.ref, r.detalle)
  return m
}

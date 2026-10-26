/**
 * ERP › Ventas › Cobros, con el molde del diseño (`~/Documents/erp-monitor/diseno.md` §3, §4 y §7; tablero 2 del v8): la
 * lista de REGISTRO de lo que se cobró — los cobros de las ventas, los pagos a cuenta y las devoluciones en plata, del
 * motor (`cobrosDe`, contrato §18). Nada se borra: lo anulado queda con su marca. Puro: el servidor (`api/_erp-cobros.js`,
 * `vista=cobros`) trae las filas del motor y esto las arma.
 *
 * 🔑 Los TOTALES de plata salen del motor, ⛔ de sumar las filas: una venta anulada sin devolución propia (la de TN, la del
 *    repaso de la Caja) ⛔ suma — la plata se devolvió afuera — y la fila ⛔ trae con qué se devolvió.
 * 🔴 «Quedó debiendo» (a cuenta) y «saldo a favor» ⛔ son plata: se ven, ⛔ se suman al cobrado.
 * 🔑 La CONTRAENTREGA (contrato §20) ⛔ es un cobro: es una venta que el cadete cobra al entregar. Las abiertas
 *    (`contraentregasAbiertas`) entran como filas de clase `entrega` SÓLO en su vista; ⛔ «Todos», ⛔ el resumen de plata.
 *    Su cierre sí es un cobro y ya viene en `cobrosDe`, el día que se cerró.
 * 🔑 La ENTREGA SIN COBRAR (`entrega` / `entrega_cobro`, sql/039 del motor): Logística entregó un pedido de Tienda Nube y el ERP
 *    ⛔ pudo crear la venta del cobro (falta la cuenta de ese medio, una variante…). Entra como fila de clase `sin_cobrar` SÓLO
 *    en su vista: ⛔ «Todos», ⛔ el resumen de plata. Se reintenta sola cuando se arregla (`reintentarEntregas`).
 * ⛔ Todavía (del motor, `PENDIENTES.md` Diseño 8 · 6): por validar contra MP, cobros masivos, cheques.
 */
import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'
import { ORIGEN, rangoDePeriodo } from './ventas-lista.core.js'
import { rangoDeMovimientos } from './movimientos.core.js'

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const pesos = (x) => Math.round(Number(x) * 100) / 100
const NOMBRE_LINEA = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }

export const NOMBRE_MEDIO = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito', credito: 'Crédito', mp: 'Mercado Pago',
  pagonube: 'Pago Nube', saldo: 'Saldo a favor', cuenta: 'A cuenta', entrega: 'Contraentrega',
}

/** Qué fue, en palabras: la venta con su número y de dónde vino, el pago a cuenta, la devolución. */
export function queFue(c) {
  if (c.origen === 'pago_a_cuenta') return 'Pago a cuenta'
  const n = c.venta?.numero != null ? ` ${c.venta.numero}` : ''
  const de = c.venta?.origen ? ` · ${ORIGEN[c.venta.origen]?.nombre ?? c.venta.origen}` : ''
  if (c.origen === 'devolucion') return `Devolución de la venta${n}`
  return `${c.monto < 0 ? 'Vuelto · venta' : 'Venta'}${n}${de}`
}

/**
 * Una fila del motor ⇒ la fila de la lista (con lo que la pantalla escribe y lo que el buscador lee).
 * @param {any} c un cobro de `cobrosDe` con su `linea`
 */
export function armarCobro(c) {
  const medioTexto = c.medio ? (NOMBRE_MEDIO[c.medio] ?? c.medio) : 'Sin medio'
  const que = queFue(c)
  const cliente = c.cliente?.nombre ?? null
  const fila = {
    id: `${c.origen}:${c.id}`, origen: c.origen, cuando: c.en, fecha: c.fecha, clase: c.clase, monto: pesos(c.monto),
    medio: c.medio ?? null, medioTexto, cuenta: c.cuenta?.nombre ?? '—', entraA: c.cuenta_real?.nombre ?? null,
    que, ventaNumero: c.venta?.numero ?? null, ventaOrigen: c.venta?.origen ?? null, cliente, clienteId: c.cliente?.id ?? null,
    quien: c.usuario ?? null, comision: c.comision == null ? null : pesos(c.comision), acreditaEl: c.acredita_el ?? null,
    anulado: Boolean(c.anulado), ref: c.ref ?? null, linea: c.linea,
  }
  return { ...fila, busca: normal([que, cliente, medioTexto, fila.cuenta, fila.entraA, fila.quien, fila.ventaNumero, fila.ref].filter(Boolean).join(' ')) }
}

/**
 * Una contraentrega abierta ⇒ una fila de la lista (clase `entrega`: ⛔ es plata, todavía está en la calle).
 * @param {any} a una de `contraentregasAbiertas` con su `linea`
 */
export function armarContraentrega(a) {
  const que = queFue({ origen: 'venta', monto: a.monto, venta: { numero: a.numero, origen: a.origen } })
  const cliente = a.cliente?.nombre ?? null
  const fila = {
    id: `contraentrega:${a.venta_id}`, origen: 'contraentrega', cuando: a.en, fecha: String(a.en).slice(0, 10), clase: 'entrega', monto: pesos(a.monto),
    medio: 'entrega', medioTexto: NOMBRE_MEDIO.entrega, cuenta: NOMBRE_MEDIO.entrega, entraA: null,
    que, ventaNumero: a.numero ?? null, ventaOrigen: a.origen ?? null, cliente, clienteId: a.cliente?.id ?? null,
    quien: null, comision: null, acreditaEl: null, anulado: false, ref: null, linea: a.linea,
  }
  return { ...fila, busca: normal([que, cliente, fila.medioTexto, fila.ventaNumero].filter(Boolean).join(' ')) }
}

/** Lo que el motor anota como motivo de un cobro pendiente, en palabras (lo demás se muestra tal cual). */
export function motivoDeEntrega(m) {
  if (!m) return 'El ERP no dejó el motivo.'
  if (m === 'sin_venta') return 'La venta de ese pedido ya existe con otra clave: el ERP no la duplica.'
  return String(m)
}

/**
 * Una entrega con el cobro pendiente ⇒ una fila de la lista (clase `sin_cobrar`: ⛔ es plata, el ERP todavía no la anotó).
 * @param {any} a una de `entregasSinCobro` (`api/_erp-cobros.js`) con su `linea`
 */
export function armarEntregaSinCobrar(a) {
  const medio = a.forma_pago === 'transferencia' ? 'transferencia' : 'efectivo'
  const motivo = motivoDeEntrega(a.motivo)
  const que = `Pedido ${a.numero} · entregó ${a.entrego}`
  const fila = {
    id: `sin_cobrar:${a.id}`, origen: 'entrega', cuando: a.entregada_en, fecha: String(a.entregada_en).slice(0, 10), clase: 'sin_cobrar',
    monto: a.monto == null ? 0 : pesos(a.monto), montoDicho: a.monto != null, medio, medioTexto: NOMBRE_MEDIO[medio], cuenta: motivo, entraA: null,
    que, motivo, intentoEn: a.intento_en ?? null, intentos: Number(a.intentos ?? 1), avisos: a.avisos ?? [],
    ventaNumero: null, ventaOrigen: null, cliente: null, clienteId: null,
    quien: a.entrego, comision: null, acreditaEl: null, anulado: false, ref: a.id, linea: a.linea,
  }
  return { ...fila, busca: normal([que, motivo, fila.medioTexto, a.numero].filter(Boolean).join(' ')) }
}

/**
 * Las vistas: [clave, título, entra]. «Entró» y «Salió» son plata (⛔ a cuenta ni saldo).
 * @type {Array<[string, string, (f: any) => boolean]>}
 */
export const VISTAS = [
  ['todos', 'Todos', (f) => f.clase !== 'entrega' && f.clase !== 'sin_cobrar'],
  ['entro', 'Entró plata', (f) => f.clase === 'plata' && f.monto > 0 && !f.anulado],
  ['salio', 'Salió plata', (f) => f.clase === 'plata' && f.monto < 0 && !f.anulado],
  ['a_cuenta', 'Pagos a cuenta', (f) => f.origen === 'pago_a_cuenta'],
  ['debe', 'Quedó debiendo', (f) => f.clase === 'a_cuenta'],
  ['saldo', 'Con saldo a favor', (f) => f.clase === 'saldo'],
  ['anulados', 'Anulados', (f) => f.anulado],
  ['contraentrega', 'Contraentrega', (f) => f.clase === 'entrega'],
  ['sin_cobrar', 'Entrega sin cobrar', (f) => f.clase === 'sin_cobrar'],
]

/** @param {any[]} filas */
export function contarVistas(filas) {
  return Object.fromEntries(VISTAS.map(([k, , entra]) => [k, filas.filter(entra).length]))
}

/**
 * La vista, el buscador (qué fue, Nº de venta, cliente, medio, cuenta, quién), la línea y el medio.
 * @param {any[]} filas @param {{ vista?: string, q?: string, linea?: string, medio?: string }} o
 */
export function filtrar(filas, { vista = 'todos', q = '', linea = '', medio = '' } = {}) {
  const entra = VISTAS.find(([k]) => k === vista)?.[2] ?? (() => true)
  const t = normal(q).trim().replace(/^#/, '')
  return filas.filter((f) => entra(f) && (!linea || f.linea === linea) && (!medio || (f.medio ?? 'sin_medio') === medio) && (!t || f.busca.includes(t)))
}

/**
 * El resumen ARRIBA, de los totales del MOTOR por línea (ver arriba por qué ⛔ se suman las filas) + lo que ⛔ es plata,
 * contado de las filas.
 * @param {Record<string, { plata: number, entro: number, salio: number, por_medio: Record<string, number> }>} totales
 * @param {any[]} filas @param {string} linea '' = todas
 */
export function resumen(totales, filas, linea = '') {
  const r = { cobrado: 0, entro: 0, salio: 0, porMedio: /** @type {Record<string, number>} */ ({}), debe: 0, saldo: 0, cobros: 0, calle: 0, enLaCalle: 0, calleDesde: /** @type {string | null} */ (null), sinCobrar: 0, sinCobrarDesde: /** @type {string | null} */ (null) }
  for (const [l, t] of Object.entries(totales ?? {})) {
    if (linea && l !== linea) continue
    r.cobrado = pesos(r.cobrado + t.plata)
    r.entro = pesos(r.entro + t.entro)
    r.salio = pesos(r.salio + t.salio)
    for (const [m, v] of Object.entries(t.por_medio ?? {})) r.porMedio[m] = pesos((r.porMedio[m] ?? 0) + v)
  }
  for (const f of filas) {
    if (linea && f.linea !== linea) continue
    if (f.anulado) continue
    if (f.clase === 'entrega') {
      r.calle = pesos(r.calle + f.monto)
      r.enLaCalle += 1
      if (!r.calleDesde || f.cuando < r.calleDesde) r.calleDesde = f.cuando
    } else if (f.clase === 'sin_cobrar') {
      r.sinCobrar += 1
      if (!r.sinCobrarDesde || f.cuando < r.sinCobrarDesde) r.sinCobrarDesde = f.cuando
    } else if (f.clase === 'a_cuenta') r.debe = pesos(r.debe + f.monto)
    else if (f.clase === 'saldo') r.saldo = pesos(r.saldo + f.monto)
    else r.cobros += 1
  }
  return r
}

/** Los medios del resumen, de mayor a menor, en palabras. @param {Record<string, number>} porMedio */
export const mediosOrdenados = (porMedio) => Object.entries(porMedio)
  .filter(([, v]) => v !== 0)
  .sort((a, b) => b[1] - a[1])
  .map(([m, v]) => ({ medio: m, nombre: m === 'sin_medio' ? 'Sin medio' : (NOMBRE_MEDIO[m] ?? m), monto: v }))

/**
 * Por columna (↓ ↑); sin orden elegido, el más nuevo arriba.
 * @param {any[]} filas @param {{ col: string, dir: 'asc' | 'desc' } | null} orden
 */
export function ordenar(filas, orden) {
  const k = orden?.col
  const dir = orden?.dir === 'asc' ? 1 : -1
  const val = (f) => (k === 'monto' ? f.monto : k === 'cliente' ? normal(f.cliente ?? '') : k === 'medio' ? normal(f.medioTexto) : Date.parse(f.cuando))
  const nuevo = (a, b) => Date.parse(b.cuando) - Date.parse(a.cuando) || a.id.localeCompare(b.id)
  return filas.slice().sort((a, b) => {
    if (!k) return nuevo(a, b)
    const x = val(a), y = val(b)
    return (x > y ? 1 : x < y ? -1 : 0) * dir || nuevo(a, b)
  })
}

/**
 * Las columnas: clave → [título, ancho, ordena, fija]. Las de siempre suman ~1.000 px con el tilde y el «⋯» (entran a
 * 1333 px al lado del menú del ERP, como Movimientos).
 * @type {Record<string, [string, string, boolean, boolean]>}
 */
export const COLUMNAS = {
  h: ['Cuándo', '96px', true, true],
  que: ['Qué', 'minmax(170px, 1.4fr)', false, true],
  cliente: ['Cliente', 'minmax(140px, 1.2fr)', true, false],
  medio: ['Medio', '112px', true, false],
  cuenta: ['Cuenta', 'minmax(120px, 1fr)', false, false],
  entra: ['Entra a', '130px', false, false],
  monto: ['Monto', '112px', true, true],
  quien: ['Quién', '104px', false, false],
  comision: ['Comisión', '96px', false, false],
  acredita: ['Se acredita', '96px', false, false],
  linea: ['Línea', '76px', false, false],
}
export const COLUMNAS_DE_SIEMPRE = {
  orden: ['h', 'que', 'cliente', 'medio', 'cuenta', 'entra', 'monto', 'quien', 'comision', 'acredita', 'linea'],
  visibles: ['h', 'que', 'cliente', 'medio', 'cuenta', 'monto', 'quien'],
}
export const normalizarPrefs = (raw) => normalizarPrefsDe(COLUMNAS, COLUMNAS_DE_SIEMPRE, raw)
export const alternarColumna = (prefs, col) => alternarColumnaDe(COLUMNAS, prefs, col)
export { moverColumna }

/** @type {Array<[string, string]>} */
export const PERIODOS_COBROS = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7d', 'Últimos 7 días'], ['mes', 'Este mes'], ['anterior', 'El mes pasado']]

/** El período en días argentinos (YYYY-MM-DD, inclusive). */
export function rangoDeCobros(periodo, hoy) {
  return periodo === 'anterior' ? rangoDePeriodo('anterior', hoy) : rangoDeMovimientos(periodo, hoy)
}

export { NOMBRE_LINEA }

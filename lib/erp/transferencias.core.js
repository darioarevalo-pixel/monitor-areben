/**
 * ERP › Stock › Transferencias (diseño `~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 3 del v8): cada transferencia
 * con la barrita de 4 pasos (Borrador · Armada · En tránsito · Recibida). Sólo LEE. Lo arma `api/_erp-stock.js`
 * (`vista=transferencias`); la pantalla es `components/erp/stock/TransferenciasStock.tsx`.
 *
 * 🔑 MEDIDO 20-oct: el motor ⛔ guarda la transferencia como documento (sólo los movimientos ya hechos, `stock_movimiento`
 * con `grupo`) ⇒ lo único con ESTADO es el armado de Reposición del monitor (`repo_armado`: borrador · en_curso ·
 * transfiriendo · transferido · revisar · cancelado; BDI 7, Zattia 13 al 20-oct). Las hechas a mano en la pantalla de GN
 * las trae el libro (`origen = 'gn_foto'`, desde el 20-oct) y ya están hechas.
 * 🔴 «Recibida» ⛔ existe todavía: GN mueve el stock de un golpe y nadie escanea al llegar ⇒ una transferida pinta el
 * 4º paso RAYADO («sin control al llegar»), ⛔ verde. Lo dice la pantalla; el pedido para A está en `PENDIENTES.md`.
 */
import { NOMBRE_DEPOSITO } from './stock.core.js'
import { normalizarPrefsDe, alternarColumnaDe, moverColumna } from './lista-columnas.core.js'

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export const PASOS = ['Borrador', 'Armada', 'En tránsito', 'Recibida']

/** De dónde sale la prenda en cada marca (el depósito de Reposición, `api/_repo-armado.js` › `DEPOSITOS_GN`). */
const DEPOSITO_DE = { zattia: 'deposito', bdi: 'deposito_minorista' }

/**
 * Estado → [tono del chip, texto, paso al que llegó (1..4), cómo se pinta el último]. `rayado`: el 4º paso ⛔ se
 * controla (GN lo mueve de un golpe); `rojo`: quedó a medias y hay que mirarla.
 * @type {Record<string, [string, string, number, 'curso' | 'rayado' | 'rojo' | 'gris']>}
 */
export const ESTADOS = {
  borrador: ['neutral', 'Borrador', 1, 'curso'],
  en_curso: ['action', 'Armándose', 2, 'curso'],
  transfiriendo: ['action', 'Enviándose a GN', 3, 'curso'],
  revisar: ['danger', 'A revisar', 3, 'rojo'],
  transferido: ['success', 'Transferida', 4, 'rayado'],
  en_gn: ['success', 'Hecha en GN', 4, 'rayado'],
  cancelado: ['neutral', 'Cancelada', 0, 'gris'],
}
export const ABIERTOS = ['borrador', 'en_curso', 'transfiriendo', 'revisar']

const suma = (o) => Object.values(o || {}).reduce((a, n) => a + (Number(n) || 0), 0)

/**
 * Un armado de Reposición (`repo_armado`) como transferencia. `enLibro`: las unidades que el libro del ERP anotó como
 * entradas de ese armado (la pata que entra), para ver si el ERP la tiene.
 * @param {any} a @param {string} marca @param {number | null} enLibro
 */
export function deArmado(a, marca, enLibro) {
  const pedido = Array.isArray(a.pedido) ? a.pedido : []
  const escaneos = a.escaneos || {}
  const tandas = Array.isArray(a.transfer?.tandas) ? a.transfer.tandas : []
  const enviado = {}
  for (const t of tandas) for (const [vid, n] of Object.entries(t.prendas || {})) enviado[vid] = (enviado[vid] || 0) + (Number(n) || 0)
  const renglones = new Map()
  for (const p of pedido) {
    const r = renglones.get(p.vid) || { vid: p.vid, nombre: p.name ?? null, talle: p.size ?? null, sku: p.sku ?? null, pedida: 0, armada: 0, enviada: 0 }
    r.pedida += Number(p.cant) || 0
    renglones.set(p.vid, r)
  }
  for (const vid of new Set([...Object.keys(escaneos), ...Object.keys(enviado)])) {
    if (!renglones.has(vid)) renglones.set(vid, { vid, nombre: null, talle: null, sku: null, pedida: 0, armada: 0, enviada: 0 })
  }
  for (const r of renglones.values()) { r.armada = Number(escaneos[r.vid]) || 0; r.enviada = enviado[r.vid] || 0 }
  const lista = [...renglones.values()]
  const deposito = DEPOSITO_DE[marca] ?? 'deposito'
  const [desde, hacia] = a.sentido === 'devolver' ? ['local', deposito] : [deposito, 'local']
  const pedidas = lista.reduce((s, r) => s + r.pedida, 0)
  const armadas = suma(escaneos)
  const enviadas = tandas.reduce((s, t) => s + (Number(t.unidades) || suma(t.prendas)), 0)
  const estado = ESTADOS[a.estado] ? a.estado : 'borrador'
  const numeros = tandas.map((t) => t.transfer_id).filter(Boolean)
  return armarFila({
    id: `repo:${a.id}`, numero: numeros.length ? numeros.map((n) => `T-${n}`).join(' · ') : null,
    creada: a.creado_en, cerrada: a.cerrado_en ?? null, desde, hacia,
    origen: a.sentido === 'devolver' ? 'devolucion' : 'reposicion', persona: a.persona ?? null, estado,
    pedidas, armadas, enviadas, // Faltó = lo pedido que ⛔ salió, sólo cuando ya salió (un borrador o uno armándose todavía ⛔ «le falta»).
    faltan: estado === 'transferido' || estado === 'revisar' ? Math.max(pedidas - enviadas, 0) : 0,
    enLibro, renglones: lista, tandas: tandas.map((t) => ({ hora: t.hora, numero: t.transfer_id ? `T-${t.transfer_id}` : null, unidades: Number(t.unidades) || suma(t.prendas) })),
    error: a.error ?? null,
  })
}

/**
 * Una transferencia hecha a mano en GN, del libro: las filas de un `grupo` (la pata que sale y la que entra).
 * @param {string} grupo @param {any[]} movs las filas del libro de ese grupo
 */
export function deLibro(grupo, movs) {
  const sale = movs.find((m) => Number(m.cantidad) < 0), entra = movs.find((m) => Number(m.cantidad) > 0)
  const renglones = new Map()
  for (const m of movs) {
    if (Number(m.cantidad) <= 0) continue
    const vid = `${m.product_id}_${m.size_id}`
    const r = renglones.get(vid) || { vid, nombre: m.nombre ?? null, talle: m.talle ?? null, sku: m.sku ?? null, pedida: 0, armada: 0, enviada: 0 }
    r.enviada += Number(m.cantidad)
    renglones.set(vid, r)
  }
  const enviadas = [...renglones.values()].reduce((s, r) => s + r.enviada, 0)
  const cuando = new Date(movs.reduce((a, m) => (new Date(m.ocurrido_en) < new Date(a) ? m.ocurrido_en : a), movs[0].ocurrido_en)).toISOString()
  const ref = movs[0].detalle?.transfer_id ?? movs[0].detalle?.foto ?? null
  return armarFila({
    id: `libro:${grupo}`, numero: ref && movs[0].detalle?.transfer_id ? `T-${ref}` : null, creada: cuando, cerrada: cuando,
    desde: sale?.deposito ?? null, hacia: entra?.deposito ?? null, origen: 'gn', persona: null, estado: 'en_gn',
    pedidas: 0, armadas: 0, enviadas, faltan: 0, enLibro: enviadas, renglones: [...renglones.values()], tandas: [], error: null,
  })
}

export const NOMBRE_ORIGEN = { reposicion: 'Reposición del monitor', devolucion: 'Devolución del monitor', gn: 'A mano en GN' }

function armarFila(f) {
  const [tono, estadoTexto, paso, fin] = ESTADOS[f.estado]
  const dep = (d) => (d ? NOMBRE_DEPOSITO[d] ?? d : '—')
  const fila = { ...f, tono, estadoTexto, paso, fin, desdeTexto: dep(f.desde), haciaTexto: dep(f.hacia), origenTexto: NOMBRE_ORIGEN[f.origen] }
  return { ...fila, busca: normal([f.numero, f.persona, fila.origenTexto, ...f.renglones.flatMap((r) => [r.nombre, r.sku])].join(' ')) }
}

/** Lo que dice la columna «Prendas» («14 en borrador», «8 de 10 armadas», «8 enviadas», «12 → 11»). */
export function prendasTexto(f) {
  if (f.estado === 'borrador') return `${f.pedidas} en borrador`
  if (f.estado === 'en_curso') return `${f.armadas} de ${f.pedidas} armadas`
  if (f.estado === 'cancelado') return `${f.pedidas} pedidas`
  if (f.pedidas && f.pedidas !== f.enviadas) return `${f.pedidas} → ${f.enviadas}`
  return `${f.enviadas} enviadas`
}

/** @type {Array<[string, string, (f: any) => boolean]>} */
export const VISTAS = [
  ['abiertas', 'Abiertas', (f) => ABIERTOS.includes(f.estado)],
  ['faltantes', 'Con faltantes', (f) => f.faltan > 0],
  ['hechas', 'Transferidas', (f) => f.estado === 'transferido' || f.estado === 'en_gn'],
  ['canceladas', 'Canceladas', (f) => f.estado === 'cancelado'],
  ['todas', 'Todas', () => true],
]

/** @param {any[]} filas */
export const contarVistas = (filas) => Object.fromEntries(VISTAS.map(([k, , entra]) => [k, filas.filter(entra).length]))

/** Se entra filtrado (§3): a las abiertas si hay; si ⛔, a todas. */
export const vistaDeEntrada = (conteo) => (conteo.abiertas ? 'abiertas' : 'todas')

/**
 * @param {any[]} filas @param {{ vista?: string, q?: string, origen?: string, desde?: string }} o `desde`: día AR (YYYY-MM-DD) o ''
 */
export function filtrar(filas, { vista = 'todas', q = '', origen = '', desde = '' } = {}) {
  const entra = VISTAS.find(([k]) => k === vista)?.[2] ?? (() => true)
  const t = normal(q).trim()
  return filas.filter((f) => entra(f) && (!origen || f.origen === origen) && (!desde || diaAR(f.creada) >= desde) && (!t || f.busca.includes(t)))
}

const diaAR = (iso) => new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 10)

/** Arriba: abiertas, lo que está armándose o yendo, las transferidas del mes (con faltantes) y lo que movieron. @param {any[]} filas @param {string} mes YYYY-MM */
export function resumen(filas, mes) {
  let abiertas = 0, enCamino = 0, hechasMes = 0, conFaltantes = 0, movidas = 0
  for (const f of filas) {
    if (ABIERTOS.includes(f.estado)) { abiertas++; enCamino += f.estado === 'en_curso' ? f.armadas : f.estado === 'borrador' ? 0 : f.enviadas || f.armadas }
    if ((f.estado === 'transferido' || f.estado === 'en_gn') && diaAR(f.creada).startsWith(mes)) { hechasMes++; movidas += f.enviadas; if (f.faltan > 0) conFaltantes++ }
  }
  return { abiertas, enCamino, hechasMes, conFaltantes, movidas }
}

/** @param {any[]} filas @param {{ col: string, dir: 'asc' | 'desc' } | null} orden */
export function ordenar(filas, orden) {
  const k = orden?.col
  const dir = orden?.dir === 'asc' ? 1 : -1
  const val = (f) => (k === 'prendas' ? f.enviadas || f.armadas || f.pedidas : Date.parse(f.creada))
  return filas.slice().sort((a, b) => {
    const x = val(a), y = val(b)
    return (k ? (x > y ? 1 : x < y ? -1 : 0) * dir : 0) || Date.parse(b.creada) - Date.parse(a.creada)
  })
}

/** @type {Record<string, [string, string, boolean, boolean]>} */
export const COLUMNAS = {
  n: ['Nº', '132px', false, true],
  creada: ['Creada', '96px', true, true],
  ruta: ['De → A', 'minmax(170px, 1.2fr)', false, true],
  origen: ['Origen', '170px', false, false],
  quien: ['Quién', '120px', false, false],
  estado: ['Estado', '250px', false, true],
  prendas: ['Prendas', '120px', true, true],
  libro: ['En el ERP', '96px', false, false],
}
export const COLUMNAS_DE_SIEMPRE = { orden: ['n', 'creada', 'ruta', 'origen', 'quien', 'estado', 'prendas', 'libro'], visibles: ['n', 'creada', 'ruta', 'origen', 'quien', 'estado', 'prendas'] }
export const normalizarPrefs = (raw) => normalizarPrefsDe(COLUMNAS, COLUMNAS_DE_SIEMPRE, raw)
export const alternarColumna = (prefs, col) => alternarColumnaDe(COLUMNAS, prefs, col)
export { moverColumna }

/**
 * ERP › Ventas › Cajas, con el molde del diseño (`~/Documents/erp-monitor/diseno.md` §7; v8 `VentasMas.dc.html`, pestaña
 * «Cajas»): cada turno de la Caja (POS) del período —quién abrió y cerró, ventas, efectivo esperado, contado y diferencia—,
 * de SÓLO LECTURA salvo el arqueo del sobre. Los turnos los escribe la Caja (`caja_turno`, `lib/caja/cierre.core.js`); acá sólo se arman.
 *
 * 🔑 Medido 20-oct (`oraculos/cajas-medir-lectura.mjs`): octubre Zattia 20 turnos (19 cerrados, 11 con diferencia, Σ
 *    +$ 25.247,15), BDI 3 (2 cerrados, 0 con diferencia). Una caja por marca ⇒ ⛔ filtro «Caja».
 * 🧾 ARQUEO DE CAJA (Bruno, 30-oct): cada cierre tiene su código de sobre (`Z-0142`) y un estado del sobre —sin recibir ·
 *    Lista · con diferencia— (`lib/caja/arqueo.core.js`). Lo arquea un admin desde la ficha; la lista sólo lo muestra.
 * 🔑 La diferencia es la del cierre (`contado − esperado`, + sobra / − falta), con la MISMA cuenta de la Caja (`diferencia`).
 *    El esperado de un turno ABIERTO ⛔ está en la fila: lo calcula la Caja en vivo (`action=turno`, lee GN).
 */

import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'
import { billetesDelSobre, codigoArqueo, estadoDelSobre, leerCodigo, sobreEsperado } from '../caja/arqueo.core.js'

const centavos = (n) => Math.round(n * 100) / 100
const num = (v) => (v == null || v === '' ? null : Number(v))

/** Los períodos: [clave, nombre]. */
export const PERIODOS_CAJA = [['mes', 'Este mes'], ['pasado', 'El mes pasado'], ['7', 'Últimos 7 días']]

/**
 * Los días argentinos (YYYY-MM-DD) del período, contados desde `hoy` (también YYYY-MM-DD).
 * @param {string} periodo @param {string} hoy
 */
export function rangoCaja(periodo, hoy) {
  const [a, m] = hoy.split('-').map(Number)
  const dia = (d) => d.toISOString().slice(0, 10)
  if (periodo === 'pasado') {
    const ini = new Date(Date.UTC(a, m - 2, 1))
    return { desde: dia(ini), hasta: dia(new Date(Date.UTC(a, m - 1, 0))) }
  }
  if (periodo === '7') return { desde: dia(new Date(Date.parse(`${hoy}T12:00:00Z`) - 6 * 864e5)), hasta: hoy }
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }
}

/**
 * @typedef {{ id: string, abiertoEn: string, abiertoPor: string | null, cerradoEn: string | null, cerradoPor: string | null,
 *   abierta: boolean, ventas: number | null, total: number | null, fondo: number, esperado: number | null, contado: number | null,
 *   diferencia: number | null, nota: string | null,
 *   efectivo: { fondo: number, cobrado: number, deEspera: number, cobradoGN: number, aportes: number, salidas: number, esperado: number } | null,
 *   porForma: Array<{ nombre: string, monto: number, cobros: number }>,
 *   numero: number | null, codigo: string | null, sobre: number | null,
 *   billetesSobre: Array<{ valor: number, esperado: number }> | null,
 *   sobreEstado: 'abierta' | 'sin_recibir' | 'lista' | 'diferencia',
 *   arqueo: { estado: string, esperado: number, contado: number, diferencia: number, nota: string | null, por: string | null, en: string,
 *     billetes?: Record<string, number>, esperados?: Record<string, number> } | null }} FilaCaja
 */

/**
 * Un turno por fila. @param {Array<Record<string, any>>} turnos (las filas de `caja_turno`) @param {string} store la marca
 * de la caja (el prefijo del código del sobre)
 * @returns {FilaCaja[]}
 */
export function armarFilasCajas(turnos, store = 'zattia') {
  return turnos.map((t) => {
    const esperado = num(t.esperado), contado = num(t.contado)
    const r = t.resumen ?? null
    return {
      id: String(t.id),
      abiertoEn: t.abierto_en,
      abiertoPor: t.abierto_por ?? null,
      cerradoEn: t.cerrado_en ?? null,
      cerradoPor: t.cerrado_por ?? null,
      abierta: !t.cerrado_en,
      ventas: r?.ventas ?? null,
      total: num(r?.total),
      fondo: Number(t.fondo ?? 0),
      esperado,
      contado,
      diferencia: t.cerrado_en && esperado != null && contado != null ? centavos(contado - esperado) : null,
      nota: t.nota ?? null,
      efectivo: r?.efectivo ?? null,
      porForma: (r?.porForma ?? []).map((x) => ({ nombre: x.nombre, monto: Number(x.monto), cobros: Number(x.cobros) })),
      numero: t.numero == null ? null : Number(t.numero),
      codigo: codigoArqueo(store, t.numero),
      sobre: t.cerrado_en ? sobreEsperado(t) : null,
      billetesSobre: t.cerrado_en ? billetesDelSobre(t) : null,
      sobreEstado: estadoDelSobre(t),
      arqueo: t.arqueo ?? null,
    }
  })
}

/** @type {Array<[string, string, (f: FilaCaja) => boolean]>} */
export const VISTAS_CAJA = [
  ['todas', 'Todas', () => true],
  ['dif', 'Con diferencia', (f) => f.diferencia != null && f.diferencia !== 0],
  ['sin_recibir', 'Sin recibir', (f) => f.sobreEstado === 'sin_recibir'],
  ['sobre_dif', 'Sobre con diferencia', (f) => f.sobreEstado === 'diferencia'],
  ['listas', 'Listas', (f) => f.sobreEstado === 'lista'],
]

/**
 * La caja escaneada o tipeada (su código) ⇒ su caja entre las del período, o null (la pantalla la busca entonces en el servidor).
 * @param {FilaCaja[]} filas @param {string} texto @param {string} store
 */
export function cajaDelCodigo(filas, texto, store) {
  const n = leerCodigo(texto, store)
  return n == null ? null : filas.find((f) => f.numero === n) ?? null
}

/** @param {FilaCaja[]} filas */
export const contarVistasCaja = (filas) => Object.fromEntries(VISTAS_CAJA.map(([k, , entra]) => [k, filas.filter(entra).length]))

/** @param {FilaCaja[]} filas */
export function filtrarCaja(filas, vista = 'todas') {
  const entra = VISTAS_CAJA.find(([k]) => k === vista)?.[2] ?? (() => true)
  return filas.filter(entra)
}

/** Los cierres del período: cuántos, cuántos con diferencia, la suma de las diferencias y lo que faltó y sobró aparte. */
export function resumenCaja(filas) {
  let cierres = 0, conDiferencia = 0, diferencia = 0, falto = 0, sobro = 0
  for (const f of filas) {
    if (f.diferencia == null) continue
    cierres++
    diferencia += f.diferencia
    if (f.diferencia !== 0) conDiferencia++
    if (f.diferencia < 0) falto += f.diferencia
    else sobro += f.diferencia
  }
  return { cierres, conDiferencia, diferencia: centavos(diferencia), falto: centavos(falto), sobro: centavos(sobro) }
}

/** Por columna (↓ ↑); sin orden, la más nueva arriba. @param {FilaCaja[]} filas */
export function ordenarCaja(filas, orden) {
  const k = orden?.col
  const dir = orden?.dir === 'asc' ? 1 : -1
  const val = (f) => (k === 'ventas' ? (f.ventas ?? -Infinity) : k === 'esp' ? (f.esperado ?? -Infinity) : k === 'cont' ? (f.contado ?? -Infinity)
    : k === 'dif' ? (f.diferencia ?? -Infinity) : k === 'cerro' ? (f.cerradoEn ? Date.parse(f.cerradoEn) : Infinity) : Date.parse(f.abiertoEn))
  return filas.slice().sort((a, b) => {
    const x = k ? val(a) : Date.parse(a.abiertoEn), y = k ? val(b) : Date.parse(b.abiertoEn)
    return (x > y ? 1 : x < y ? -1 : 0) * (k ? dir : -1) || Date.parse(b.abiertoEn) - Date.parse(a.abiertoEn)
  })
}

/** clave → [título, ancho, ordena, fija]. @returns {Record<string, [string, string, boolean, boolean]>} */
export function columnasCaja() {
  return {
    abrio: ['Abrió', 'minmax(170px, 1.2fr)', true, true],
    cerro: ['Cerró', 'minmax(170px, 1.2fr)', true, false],
    estado: ['Estado', '130px', false, false],
    ventas: ['Ventas', '72px', true, false],
    esp: ['Efectivo esperado', '140px', true, false],
    cont: ['Contado', '110px', true, false],
    dif: ['Diferencia', '110px', true, true],
    fondo: ['Fondo', '100px', false, false],
    nota: ['Nota', 'minmax(140px, 1fr)', false, false],
    codigo: ['Código', '90px', false, false],
    sobre: ['En el sobre', '130px', false, false],
    arqueo: ['Arqueo', '170px', false, true],
  }
}

export function columnasCajaDeSiempre() {
  return { orden: ['abrio', 'cerro', 'estado', 'ventas', 'esp', 'cont', 'dif', 'codigo', 'arqueo', 'sobre', 'fondo', 'nota'], visibles: ['abrio', 'cerro', 'estado', 'ventas', 'esp', 'cont', 'dif', 'codigo', 'arqueo'] }
}

/** @param {unknown} raw */
export const normalizarPrefsCaja = (raw) => normalizarPrefsDe(columnasCaja(), columnasCajaDeSiempre(), raw)
export const alternarColumnaCaja = (prefs, col) => alternarColumnaDe(columnasCaja(), prefs, col)
export { moverColumna }

/**
 * Los billetes que ⛔ coincidieron en la revisión: lo esperado contra lo verificado, de mayor a menor. La ficha de una caja
 * revisada muestra sólo éstos (Bruno, 30-oct: ver qué billete faltó).
 * @param {Record<string, number>} esperados @param {Record<string, number>} verificados
 * @returns {Array<{ valor: number, esperado: number, verificado: number }>}
 */
export function billetesQueNoCoinciden(esperados, verificados) {
  return [...new Set([...Object.keys(esperados || {}), ...Object.keys(verificados || {})])]
    .map((k) => ({ valor: Number(k), esperado: Number(esperados?.[k]) || 0, verificado: Number(verificados?.[k]) || 0 }))
    .filter((x) => x.esperado !== x.verificado)
    .sort((a, b) => b.valor - a.valor)
}

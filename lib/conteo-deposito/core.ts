/**
 * Lógica pura del Conteo de Depósito. Port de las funciones `_cdep*`/`conteoDep*`
 * (index.html:11549-12021) SIN DOM: agrupado del vivo, apertura/conteo/terminar
 * (con snap y dif congeladas), cálculo del ajuste (`nuevo = vivo + dif` + candado de
 * seguridad), el AOA del Excel (byte-fiel, es lo que ajusta stock en GN) y las
 * fechas del último conteo.
 *
 * Todas las mutaciones devuelven un CdepState NUEVO (para React). El "ahora" viaja
 * por parámetro (el legacy usa Date.now()) para que terminar sea determinista.
 */

import type { FilaVivo } from '../inventario-vivo/tipos'
import type {
  CdepDetalleConteo,
  CdepProducto,
  CdepState,
  ConteoHistorial,
  EstadoDeProd,
  FilaAjuste,
  Preview,
  ResumenAjuste,
} from './tipos'

const prodVacio = (): EstadoDeProd => ({ estado: 'sin_iniciar', contado: {}, snap: {}, dif: {} })

// `ordenarModelo` (=_repoModelSort) vive en lib/reposicion/grupos (hogar compartido).
// Se re-exporta acá para no cambiar los imports de conteo-deposito/-estandar.
export { ordenarModelo } from '../reposicion/grupos'

/** Agrupa las filas reales del vivo en productos con sus variantes. Port de conteoDepInit @11648-11655. */
export function agruparVivo(realMap: Record<string, FilaVivo>): CdepProducto[] {
  const byPid: Record<string, CdepProducto> = {}
  Object.values(realMap).forEach((r) => {
    const pid = String(r.product_id)
    if (!byPid[pid]) byPid[pid] = { pid, name: r.product_name || '—', variants: [] }
    byPid[pid].variants.push({
      vid: pid + '_' + r.size_id,
      sid: r.size_id,
      size: r.size_name || '—',
      barcode: r.barcode,
      inventory_id: r.inventory_id,
      esperado: Number(r.available_quantity) || 0,
    })
  })
  return Object.values(byPid).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export function estadoDe(state: CdepState, pid: string | number): EstadoDeProd['estado'] {
  return state[String(pid)]?.estado ?? 'sin_iniciar'
}

/** ms del último conteo: el más reciente entre el sello local y el historial. Port de _cdepUltimoMs. */
export function ultimoMs(state: CdepState, lastCount: Record<string, number>, pid: string | number): number {
  return Math.max(state[String(pid)]?.terminadoAt || 0, lastCount[String(pid)] || 0)
}

/**
 * Abre un producto para contar: congela el `snap` (sistema) la primera vez y pasa a
 * `en_progreso`. Port de conteoDepOpen @11773-11783.
 */
export function abrirProducto(state: CdepState, prod: CdepProducto): CdepState {
  const prev = state[prod.pid] || prodVacio()
  const snap = { ...prev.snap }
  if (!Object.keys(snap).length) prod.variants.forEach((v) => (snap[v.vid] = v.esperado))
  const estado = prev.estado === 'sin_iniciar' || prev.estado === 'terminado' ? 'en_progreso' : prev.estado
  return { ...state, [prod.pid]: { ...prev, snap, estado } }
}

/** Setea la cantidad física de una variante (vacío = sin contar). Port de conteoDepSetCount. */
export function setCount(state: CdepState, pid: string, vid: string, val: string): CdepState {
  const prev = state[pid]
  if (!prev) return state
  const contado = { ...prev.contado }
  const s = String(val).trim()
  if (s === '') delete contado[vid]
  else contado[vid] = Math.max(0, parseInt(s, 10) || 0)
  return { ...state, [pid]: { ...prev, contado } }
}

/**
 * Termina un producto: las variantes en blanco cuentan como 0, y se CONGELA la
 * diferencia `dif = contado − snap`. Port de conteoDepFinish @11837-11845.
 */
export function terminarProducto(state: CdepState, prod: CdepProducto, ahora: number): CdepState {
  const prev = state[prod.pid] || prodVacio()
  const contado = { ...prev.contado }
  const snap = { ...prev.snap }
  const dif: Record<string, number> = {}
  prod.variants.forEach((v) => {
    if (contado[v.vid] == null) contado[v.vid] = 0
    const sis = snap[v.vid] != null ? snap[v.vid] : v.esperado
    snap[v.vid] = sis
    dif[v.vid] = (contado[v.vid] || 0) - sis
  })
  return { ...state, [prod.pid]: { ...prev, contado, snap, dif, estado: 'terminado', terminadoAt: ahora } }
}

/** Al volver sin terminar: el estado baja a en_progreso/sin_iniciar según haya algo contado. Port de conteoDepBack. */
export function volverSinTerminar(state: CdepState, pid: string): CdepState {
  const prev = state[pid]
  if (!prev || prev.estado === 'terminado') return state
  const any = Object.keys(prev.contado).length > 0
  return { ...state, [pid]: { ...prev, estado: any ? 'en_progreso' : 'sin_iniciar' } }
}

/**
 * Calcula el ajuste: por cada variante terminada con diferencia, `nuevo = vivo + dif`.
 * CANDADO DE SEGURIDAD: solo ajusta si el stock está confirmado EN VIVO (live e
 * inventory_id no nulos); si no, va a `missing` ("revisar a mano"). Port de
 * conteoDepAplicar @11859-11878.
 */
export function calcularAjuste(
  terminados: CdepProducto[],
  state: CdepState,
  vivo: Record<string, FilaVivo>,
  ubicacion: string,
  store: string,
  horaStock: number | null,
): Preview {
  const rows: FilaAjuste[] = []
  const missing: { prod: string; size: string }[] = []
  let mas = 0
  let menos = 0
  let unidades = 0
  terminados.forEach((p) => {
    const st = state[String(p.pid)]
    p.variants.forEach((v) => {
      const dif = st?.dif ? st.dif[v.vid] : 0
      if (!dif) return
      const live = vivo[v.vid]
      if (!live || live.inventory_id == null || v.inventory_id == null) {
        missing.push({ prod: p.name, size: v.size })
        return
      }
      const stockVivo = Number(live.available_quantity) || 0
      const nuevo = stockVivo + dif
      rows.push({
        inventory_id: live.inventory_id,
        product_code: live.product_code || '',
        producto: p.name,
        variante: v.size,
        ubicacion,
        barcode: live.barcode || '',
        vivo: stockVivo,
        dif,
        nuevo,
        sistema: st?.snap ? st.snap[v.vid] : null,
        contado: st?.contado ? st.contado[v.vid] : null,
      })
      if (dif > 0) mas++
      else if (dif < 0) menos++
      unidades += Math.abs(dif)
    })
  })
  const productos = terminados.map((p) => ({ pid: String(p.pid), nombre: p.name }))
  const resumen: ResumenAjuste = {
    mas,
    menos,
    lineas: rows.length,
    unidades_ajustadas: unidades,
    hora_stock: horaStock ? new Date(horaStock).toISOString() : null,
    productos,
  }
  return { rows, registro: registroConteo(terminados, state, vivo), resumen, missing, ubicacion, store }
}

/** El header EXACTO de GN. No tocar: es lo que espera "Importar y Ajustar". */
export const HEADER_AJUSTE = ['id_inventario', 'codigo_producto', 'producto', 'variante', 'ubicacion', 'codigo_barras', 'stock_actual', 'nuevo_stock'] as const

/** El array-of-arrays del Excel de ajuste (header + una fila por diferencia). BYTE-FIEL a conteoDepConfirmar @11960-11962. */
export function aoaAjuste(rows: FilaAjuste[]): (string | number)[][] {
  const aoa: (string | number)[][] = [[...HEADER_AJUSTE]]
  rows.forEach((r) => aoa.push([r.inventory_id, r.product_code || '', r.producto, r.variante, r.ubicacion, r.barcode || '', r.vivo, r.nuevo]))
  return aoa
}

/** El `detalle` que se guarda en el historial. Port de conteoDepConfirmar @11976. */
export function detalleHistorial(rows: FilaAjuste[]): Array<Record<string, unknown>> {
  return rows.map((r) => ({
    inventory_id: r.inventory_id,
    barcode: r.barcode,
    producto: r.producto,
    variante: r.variante,
    sistema: r.sistema,
    contado: r.contado,
    diferencia: r.dif,
    vivo_aplicado: r.vivo,
    nuevo_stock: r.nuevo,
  }))
}

/**
 * Registro COMPLETO del conteo: TODAS las variantes de TODOS los terminados,
 * incluidas las que coinciden con el sistema (diferencia 0) y las que quedaron en
 * 0. Es lo que se guarda como `detalle` del historial, para mostrar el balance y
 * para que los productos sin diferencia también reciban fecha de último conteo. El
 * ajuste/Excel siguen usando solo `rows` (las diferencias).
 */
export function registroConteo(terminados: CdepProducto[], state: CdepState, vivo: Record<string, FilaVivo>): CdepDetalleConteo[] {
  const out: CdepDetalleConteo[] = []
  terminados.forEach((p) => {
    const st = state[String(p.pid)]
    p.variants.forEach((v) => {
      const live = vivo[v.vid]
      const vivoQty = live ? Number(live.available_quantity) || 0 : null
      const dif = st?.dif ? st.dif[v.vid] || 0 : 0
      out.push({
        inventory_id: (live && live.inventory_id != null ? live.inventory_id : v.inventory_id) ?? null,
        barcode: (live && live.barcode) || v.barcode || '',
        producto: p.name,
        variante: v.size,
        sistema: st?.snap && st.snap[v.vid] != null ? st.snap[v.vid] : v.esperado,
        contado: st?.contado && st.contado[v.vid] != null ? st.contado[v.vid] : null,
        diferencia: dif,
        vivo_aplicado: vivoQty,
        nuevo_stock: vivoQty != null ? vivoQty + dif : null,
      })
    })
  })
  return out
}

/**
 * Fecha (ms) del último conteo APLICADO por producto, matcheando por pid (registros
 * nuevos) y por nombre (fallback). Port de _cdepCargarUltimos @11595-11613.
 */
export function ultimosPorProducto(conteos: ConteoHistorial[], products: CdepProducto[]): Record<string, number> {
  const porPid: Record<string, number> = {}
  const porNombre: Record<string, number> = {}
  conteos.forEach((c) => {
    // Solo conteos de DEPÓSITO: los conteos de otras secciones (estándar del Local,
    // fundas de BDI) comparten la misma tabla por `store` y traen un `modo` propio.
    const modo = (c.resumen as { modo?: string } | undefined)?.modo
    if (modo && modo !== 'deposito') return
    const ms = c.fecha_aplicado ? new Date(c.fecha_aplicado).getTime() : 0
    if (!ms) return
    const rr = c.resumen || {}
    ;(Array.isArray(rr.productos) ? rr.productos : []).forEach((p) => {
      const pid = String(p.pid != null ? p.pid : '')
      if (pid) porPid[pid] = Math.max(porPid[pid] || 0, ms)
      const nom = String(p.nombre || '').trim()
      if (nom) porNombre[nom] = Math.max(porNombre[nom] || 0, ms)
    })
    ;(Array.isArray(c.detalle) ? c.detalle : []).forEach((x) => {
      const nom = String((x as { producto?: string }).producto || '').trim()
      if (nom) porNombre[nom] = Math.max(porNombre[nom] || 0, ms)
    })
  })
  const map: Record<string, number> = {}
  products.forEach((p) => {
    const pid = String(p.pid)
    const ms = Math.max(porPid[pid] || 0, porNombre[String(p.name || '').trim()] || 0)
    if (ms) map[pid] = ms
  })
  return map
}

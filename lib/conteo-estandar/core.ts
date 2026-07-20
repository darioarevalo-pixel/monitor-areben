/**
 * Lógica pura del Conteo estándar del Local. Port de las funciones `ce*`/`_ce*`
 * (index.html:12023-12402) SIN DOM. Diferencias con el Conteo de Depósito:
 * clasificación de línea (STU→stunned), byBc para el escaneo, DOS acumuladores por
 * talle (exhibido+depósito) y el ajuste con `modo:'estandar'` + línea. Reusa el AOA
 * del Excel, `ordenarModelo` y el cliente del conteo de depósito (mismo endpoint).
 */

import type { FilaVivo } from '../inventario-vivo/tipos'
import type { ConteoHistorial } from '../conteo-deposito/tipos'
import type { CeDetalleConteo, CeEstadoProd, CeFilaAjuste, CePreview, CeProducto, CeResumen, CeState, Linea } from './tipos'

const vacio = (): CeEstadoProd => ({ estado: 'sin_iniciar', exhibido: {}, deposito: {}, snap: {}, dif: {} })

/** Normaliza un código de barras (trim + mayúsculas). Port de _ceNormBc. */
export function normBc(b: unknown): string {
  return String(b || '').trim().toUpperCase()
}

/** La línea de un producto: stunned si alguna variante tiene SKU que empieza con STU. Port de _ceLineaOf. */
export function lineaDe(variants: { sku?: string }[]): Linea {
  return (variants || []).some((v) => /^STU/i.test(String(v.sku || ''))) ? 'stunned' : 'zattia'
}

/** Total de un talle = exhibido + depósito. Port de _ceTotal. */
export function total(st: CeEstadoProd, vid: string): number {
  return (st.exhibido?.[vid] || 0) + (st.deposito?.[vid] != null ? st.deposito[vid] : 0)
}
/** ¿Se tocó el talle? (exhibido>0 o depósito cargado). Port de _ceTocada. */
export function tocada(st: CeEstadoProd, vid: string): boolean {
  return (st.exhibido?.[vid] || 0) > 0 || st.deposito?.[vid] != null
}

/** Agrupa el vivo del Local en productos con `linea` + arma el mapa barcode→vid. Port de ceInit @12080-12087. */
export function agruparVivo(realMap: Record<string, FilaVivo>): { products: CeProducto[]; byBc: Record<string, string> } {
  const byPid: Record<string, CeProducto> = {}
  Object.values(realMap).forEach((r) => {
    const pid = String(r.product_id)
    if (!byPid[pid]) byPid[pid] = { pid, name: r.product_name || '—', linea: 'zattia', variants: [] }
    byPid[pid].variants.push({ vid: pid + '_' + r.size_id, sid: r.size_id, size: r.size_name || '—', barcode: r.barcode, sku: r.sku, inventory_id: r.inventory_id, esperado: Number(r.available_quantity) || 0 })
  })
  const products = Object.values(byPid)
    .map((p) => ({ ...p, linea: lineaDe(p.variants) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const byBc: Record<string, string> = {}
  products.forEach((p) => p.variants.forEach((v) => { const bc = normBc(v.barcode); if (bc) byBc[bc] = v.vid }))
  return { products, byBc }
}

export function estadoDe(state: CeState, pid: string | number): CeEstadoProd['estado'] {
  return state[String(pid)]?.estado ?? 'sin_iniciar'
}
export function ultimoMs(state: CeState, lastCount: Record<string, number>, pid: string | number): number {
  return Math.max(state[String(pid)]?.terminadoAt || 0, lastCount[String(pid)] || 0)
}

/** Asegura snap congelado + estado en_progreso (base de abrir/escanear). */
function asegurar(prev: CeEstadoProd, prod: CeProducto): CeEstadoProd {
  const snap = { ...prev.snap }
  if (!Object.keys(snap).length) prod.variants.forEach((v) => (snap[v.vid] = v.esperado))
  const estado = prev.estado === 'sin_iniciar' || prev.estado === 'terminado' ? 'en_progreso' : prev.estado
  return { ...prev, snap, estado }
}

/** Abre un producto para contar. Port de ceOpen. */
export function abrir(state: CeState, prod: CeProducto): CeState {
  return { ...state, [prod.pid]: asegurar(state[prod.pid] || vacio(), prod) }
}

/** Un escaneo: +1 en exhibido de la variante. Port de ceScan @12209-12215. */
export function escanear(state: CeState, prod: CeProducto, vid: string): CeState {
  const base = asegurar(state[prod.pid] || vacio(), prod)
  const exhibido = { ...base.exhibido, [vid]: (base.exhibido[vid] || 0) + 1 }
  return { ...state, [prod.pid]: { ...base, exhibido } }
}

export function setExhibido(state: CeState, pid: string, vid: string, val: string): CeState {
  const prev = state[pid]
  if (!prev) return state
  const exhibido = { ...prev.exhibido }
  const s = String(val).trim()
  if (s === '') delete exhibido[vid]
  else exhibido[vid] = Math.max(0, parseInt(s, 10) || 0)
  return { ...state, [pid]: { ...prev, exhibido } }
}
export function setDeposito(state: CeState, pid: string, vid: string, val: string): CeState {
  const prev = state[pid]
  if (!prev) return state
  const deposito = { ...prev.deposito }
  const s = String(val).trim()
  if (s === '') delete deposito[vid]
  else deposito[vid] = Math.max(0, parseInt(s, 10) || 0)
  return { ...state, [pid]: { ...prev, deposito } }
}

/** Termina un producto: congela `dif = (exhibido+deposito) − sistema`. Port de ceFinish @12275-12281. */
export function terminar(state: CeState, prod: CeProducto, ahora: number): CeState {
  const prev = state[prod.pid] || vacio()
  const snap = { ...prev.snap }
  const dif: Record<string, number> = {}
  const stForTotal = prev
  prod.variants.forEach((v) => {
    const sis = snap[v.vid] != null ? snap[v.vid] : v.esperado
    snap[v.vid] = sis
    dif[v.vid] = total(stForTotal, v.vid) - sis
  })
  return { ...state, [prod.pid]: { ...prev, snap, dif, estado: 'terminado', terminadoAt: ahora } }
}

export function volverSinTerminar(state: CeState, pid: string): CeState {
  const prev = state[pid]
  if (!prev || prev.estado === 'terminado') return state
  const any = Object.keys(prev.exhibido).length > 0 || Object.keys(prev.deposito).length > 0
  return { ...state, [pid]: { ...prev, estado: any ? 'en_progreso' : 'sin_iniciar' } }
}

/** vid de un código escaneado (o null). Port de la resolución de ceScan. */
export function resolverScan(byBc: Record<string, string>, code: string): string | null {
  return byBc[normBc(code)] || null
}

/** Ajuste: `nuevo = vivo + dif` con candado de seguridad. Port de ceAplicar @12294-12307. */
export function calcularAjuste(
  terminados: CeProducto[],
  state: CeState,
  vivo: Record<string, FilaVivo>,
  ubicacion: string,
  store: string,
  horaStock: number | null,
  linea: Linea,
): CePreview {
  const rows: CeFilaAjuste[] = []
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
        exhibido: st?.exhibido ? st.exhibido[v.vid] || 0 : 0,
        deposito: st?.deposito ? st.deposito[v.vid] || 0 : 0,
        contado: st ? total(st, v.vid) : null,
      })
      if (dif > 0) mas++
      else if (dif < 0) menos++
      unidades += Math.abs(dif)
    })
  })
  const productos = terminados.map((p) => ({ pid: String(p.pid), nombre: p.name }))
  const resumen: CeResumen = {
    mas,
    menos,
    lineas: rows.length,
    unidades_ajustadas: unidades,
    hora_stock: horaStock ? new Date(horaStock).toISOString() : null,
    modo: 'estandar',
    linea,
    productos,
  }
  return { rows, registro: registroConteo(terminados, state, vivo), resumen, missing, ubicacion, store }
}

/** El `detalle` del historial: incluye el desglose exhibido/depósito. Port de ceConfirmar @12356. */
export function detalleHistorial(rows: CeFilaAjuste[]): Array<Record<string, unknown>> {
  return rows.map((r) => ({
    inventory_id: r.inventory_id,
    barcode: r.barcode,
    producto: r.producto,
    variante: r.variante,
    sistema: r.sistema,
    exhibido: r.exhibido,
    deposito: r.deposito,
    contado: r.contado,
    diferencia: r.dif,
    vivo_aplicado: r.vivo,
    nuevo_stock: r.nuevo,
  }))
}

/**
 * Registro COMPLETO del conteo: TODAS las variantes de TODOS los terminados,
 * incluidas las que coinciden con el sistema (diferencia 0) y las que quedaron en
 * 0. Es lo que se guarda como `detalle` del historial, para poder mostrar el
 * balance ("se contaron estos productos") y para que los talles sin diferencia
 * también reciban fecha de último conteo (ver `ultimosPorProducto`, que matchea el
 * detalle por nombre). El ajuste/Excel siguen usando solo `rows` (las diferencias).
 */
export function registroConteo(terminados: CeProducto[], state: CeState, vivo: Record<string, FilaVivo>): CeDetalleConteo[] {
  const out: CeDetalleConteo[] = []
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
        exhibido: st?.exhibido ? st.exhibido[v.vid] || 0 : 0,
        deposito: st?.deposito ? st.deposito[v.vid] || 0 : 0,
        contado: st ? total(st, v.vid) : null,
        diferencia: dif,
        vivo_aplicado: vivoQty,
        nuevo_stock: vivoQty != null ? vivoQty + dif : null,
      })
    })
  })
  return out
}

/** Fechas del último conteo por producto, SOLO de esta línea (modo estandar). Port de _ceCargarUltimos @12120-12128. */
export function ultimosPorProducto(conteos: ConteoHistorial[], products: CeProducto[], linea: Linea): Record<string, number> {
  const porPid: Record<string, number> = {}
  const porNombre: Record<string, number> = {}
  conteos.forEach((c) => {
    const rr = (c.resumen || {}) as { modo?: string; linea?: string; productos?: { pid?: string; nombre?: string }[] }
    if (rr.modo !== 'estandar' || rr.linea !== linea) return
    const ms = c.fecha_aplicado ? new Date(c.fecha_aplicado).getTime() : 0
    if (!ms) return
    ;(Array.isArray(rr.productos) ? rr.productos : []).forEach((p) => {
      const pid = String(p.pid || '')
      if (pid) porPid[pid] = Math.max(porPid[pid] || 0, ms)
      const n = String(p.nombre || '').trim()
      if (n) porNombre[n] = Math.max(porNombre[n] || 0, ms)
    })
    ;(Array.isArray(c.detalle) ? c.detalle : []).forEach((x) => {
      const n = String((x as { producto?: string }).producto || '').trim()
      if (n) porNombre[n] = Math.max(porNombre[n] || 0, ms)
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

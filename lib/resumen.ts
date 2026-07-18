/**
 * Panel "Resumen / KPIs" (key `resumen`): los 5 indicadores del `#stats-overview`
 * (index.html:2646-2650) y la línea de estado de sincronización (renderSyncInfo,
 * 2193). Todo derivado del store del ETL, sin DOM.
 */

import type { DatosETL, SyncMeta } from './etl/tipos'

export type Kpis = {
  productos: number
  sinVenta30: number
  declive: number
  crecimiento: number
  variantes: number
}

/** Los 5 KPIs del panel, port literal de los `.textContent =` del legacy (2646-2650). */
export function computarKpis(datos: DatosETL): Kpis {
  const p = datos.allProductos
  return {
    productos: p.length,
    sinVenta30: p.filter((x) => x.daysSinceLast > 30).length,
    declive: p.filter((x) => x.phase.label === 'declive').length,
    crecimiento: p.filter((x) => x.phase.label === 'crecimiento').length,
    variantes: datos.allVariantes.length,
  }
}

/** "hace X min / h / días". Port literal de fmtHace (index.html:2160). */
export function fmtHace(ms: number): string {
  const min = ms / 60000
  if (min < 60) return 'hace ' + Math.max(1, Math.round(min)) + ' min'
  const h = min / 60
  if (h < 24) return 'hace ' + Math.round(h) + ' h'
  const d = Math.floor(h / 24)
  return 'hace ' + d + (d === 1 ? ' día' : ' días')
}

export type ResumenSync =
  | { tipo: 'ok'; dot: string; fecha: string; hace: string; nota: string }
  | { tipo: 'fallando' }
  | { tipo: 'sin-lectura' }

/**
 * Estado de la última sincronización (semáforo + nota). Port de renderSyncInfo
 * (index.html:2198-2218), sin el DOM. `now` entra por parámetro (era `Date.now()`).
 */
export function estadoSync(syncMeta: SyncMeta, now: Date): ResumenSync {
  if (syncMeta && syncMeta.last_run) {
    const run = new Date(syncMeta.last_run)
    const ageMs = now.getTime() - run.getTime()
    const ageH = ageMs / 3600000
    let dot = '🟢'
    let nota = ''
    if (ageH >= 52) {
      dot = '🔴'
      nota = ' — ¡revisar! no se actualiza hace más de 2 días'
    } else if (ageH >= 28) {
      dot = '🟡'
      nota = ' — atención: pasó más de un día sin actualizar'
    }
    if (syncMeta.latest_conclusion === 'failure') {
      dot = '🔴'
      nota = ' — ⚠️ la última corrida del sync FALLÓ (mostrando la última exitosa)'
    } else if (syncMeta.latest_status && syncMeta.latest_status !== 'completed') {
      nota += ' — 🔄 sync en curso ahora…'
    }
    const fecha =
      run.toLocaleDateString('es-AR') + ' ' + run.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    return { tipo: 'ok', dot, fecha, hace: fmtHace(ageMs), nota }
  }
  if (syncMeta && syncMeta.latest_conclusion === 'failure') return { tipo: 'fallando' }
  return { tipo: 'sin-lectura' }
}

/** Formatea `YYYY-MM-DD` → `DD/MM/YYYY` (la venta más reciente cargada). */
export function fmtFechaVenta(maxVentaDate: string | null): string | null {
  if (!maxVentaDate) return null
  const [y, m, d] = maxVentaDate.split('-')
  return `${d}/${m}/${y}`
}

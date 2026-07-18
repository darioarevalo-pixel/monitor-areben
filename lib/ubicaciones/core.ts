/**
 * Lógica pura de Ubicaciones. Port de las funciones puras de la sección
 * (index.html:14420-14475): el diagnóstico por producto (ubicación dominante,
 * inconsistencia, formato viejo, reparable), la validación del formato y el filtrado.
 */

import type { FilaInvUbi, UbiProducto } from './tipos'

/** ¿Es un código de ubicación NN-N (número-número)? Port de esNNN/_ubiValido. */
export function esNNN(v: string | null | undefined): boolean {
  return /^\d+-\d+$/.test(String(v ?? '').trim())
}

/** Formato válido para guardar: vacío (limpia) o NN-N. Port de _ubiValido. */
export function ubiValido(v: string | null | undefined): boolean {
  const s = String(v ?? '').trim()
  return s === '' || esNNN(s)
}

/**
 * Compone la lista por producto a partir de las filas de inventario (una por
 * variante) y el set de productos activos. Port del cómputo de ubicacionesInit.
 */
export function computarUbicaciones(rows: FilaInvUbi[], activos: Set<number | string>): UbiProducto[] {
  const map = new Map<number | string, { product_id: number | string; name: string; sku: string; obsList: string[] }>()
  for (const r of rows) {
    const pid = r.product_id
    if (activos.size && !activos.has(pid)) continue // saltear inactivos
    if (!map.has(pid)) map.set(pid, { product_id: pid, name: r.product_name || '#' + pid, sku: r.sku || '', obsList: [] })
    map.get(pid)!.obsList.push((r.observation == null ? '' : String(r.observation)).trim()) // una entrada por variante
  }
  return [...map.values()]
    .map((p): UbiProducto => {
      const obs = p.obsList
      const distinct = [...new Set(obs)] // incluye '' (variantes sin valor)
      const valores = [...new Set(obs.filter(Boolean))] // valores no vacíos distintos
      const validos = obs.filter((o) => /^\d+-\d+$/.test(o)) // formato NN-N
      let actual = ''
      if (validos.length) {
        const f: Record<string, number> = {}
        validos.forEach((v) => (f[v] = (f[v] || 0) + 1))
        actual = Object.keys(f).sort((a, b) => f[b] - f[a])[0]
      }
      const inconsistente = distinct.length > 1
      const malFormato = valores.length > 0 && !actual
      return { product_id: p.product_id, name: p.name, sku: p.sku, actual, valores, nvar: obs.length, inconsistente, malFormato, reparable: inconsistente && !!actual }
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
}

/** El valor a mostrar en el input: lo tipeado (cambios) o el actual. */
export function valorMostrado(p: UbiProducto, cambios: Record<string, string>): string {
  const c = cambios[String(p.product_id)]
  return c ?? p.actual
}

/** Filtra por búsqueda + "solo sin ubicación" + "solo a reparar". Port de ubicacionesRenderTabla. */
export function filtrar(data: UbiProducto[], q: string, soloSin: boolean, soloRep: boolean, cambios: Record<string, string>): UbiProducto[] {
  const query = q.toLowerCase().trim()
  let lista = data
  if (query) lista = lista.filter((p) => (p.name || '').toLowerCase().includes(query) || (p.sku || '').toLowerCase().includes(query))
  // "Sin ubicación" = sin un NN-N válido (casillero vacío o formato viejo, ambos a cargar a mano).
  if (soloSin) lista = lista.filter((p) => !esNNN(valorMostrado(p, cambios)))
  if (soloRep) lista = lista.filter((p) => p.reparable)
  return lista
}

/** Los productos con un cambio válido pendiente de guardar (distinto del actual). Port del filtro de ubicacionesGuardar. */
export function cambiosPendientes(data: UbiProducto[], cambios: Record<string, string>): { validos: UbiProducto[]; invalidos: UbiProducto[] } {
  const cambiados = data.filter((p) => {
    const c = cambios[String(p.product_id)]
    return c != null && c.trim() !== (p.actual || '').trim()
  })
  return {
    validos: cambiados.filter((p) => ubiValido(cambios[String(p.product_id)])),
    invalidos: cambiados.filter((p) => !ubiValido(cambios[String(p.product_id)])),
  }
}

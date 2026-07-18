/**
 * Consulta el cruce TN↔GN. El endpoint `tiendanube-audit?verificar_ventas=1` hace el
 * cruce server-side y devuelve las discrepancias. Port del fetch de vvtaVerificar
 * (index.html:11145). El checklist de resueltas va por el seam KV (leerResueltas/
 * guardarResueltas).
 */

import type { Marca } from '../nav.generated'
import type { VvtaData } from './tipos'

const VVTA_AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

export async function verificarVentas(marca: Marca, from: string, to: string): Promise<VvtaData> {
  try {
    const r = await fetch(`${VVTA_AUDIT}?verificar_ventas=1&store=${marca}&from=${from}&to=${to}&nc=${Date.now()}`)
    return (await r.json()) as VvtaData
  } catch {
    return { error: 'No se pudo consultar. Probá de nuevo en un momento.' }
  }
}

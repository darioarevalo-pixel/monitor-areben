/**
 * Consulta el cruce TN↔GN. El endpoint `tiendanube-audit?verificar_ventas=1` hace el
 * cruce server-side y devuelve las discrepancias. Port del fetch de vvtaVerificar
 * (index.html:11145). El checklist de resueltas va por el seam KV (leerResueltas/
 * guardarResueltas).
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '../nav.datos'
import type { VvtaData } from './tipos'

const VVTA_AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

export async function verificarVentas(marca: Marca, from: string, to: string): Promise<VvtaData> {
  try {
    // Con apiFetch viaja la credencial del Monitor: el cruce muestra clientes y montos, y
    // bdi-catalogo lo cierra a quien no esté en el padrón (7-nov-2026).
    const r = await apiFetch(`${VVTA_AUDIT}?verificar_ventas=1&store=${marca}&from=${from}&to=${to}&nc=${Date.now()}`)
    return (await r.json()) as VvtaData
  } catch {
    return { error: 'No se pudo consultar. Probá de nuevo en un momento.' }
  }
}

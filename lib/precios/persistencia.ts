/**
 * Precios de campaña, del lado del cliente (`/api/datos?recurso=precios`).
 *
 * ⛔ **No entra por `?recurso=liquidacion`, y es a propósito.** Ese handler ya tiene CUATRO llaves
 * (Liquidación, Etiquetas, la escritura de Etiquetas y la vista de Análisis), y
 * `tests/handlers-autorizacion.test.ts` está construido sobre la garantía de que una llave ajena
 * corta con `return` antes de llegar a las `action`. Una quinta llave con un permiso nuevo adentro
 * es como se cuela el verbo que se olvidó de pedir sesión — mismo criterio que
 * `disenos-rondas`/`votacion`.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import type { CampaniaPrecios, ListaDePrecios } from './tipos'

const API = '/api/datos?recurso=precios'

/** Las campañas que alguien compartió con Marketing. Vacío es lo normal si nadie compartió nada. */
export async function leerCampaniasCompartidas(store: Marca): Promise<CampaniaPrecios[]> {
  const r = await apiFetch(`${API}&store=${store}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer la lista de campañas.')
  return (d.campanias || []) as CampaniaPrecios[]
}

/** La lista de precios de una campaña compartida. */
export async function leerListaDePrecios(store: Marca, liqId: string): Promise<ListaDePrecios> {
  const r = await apiFetch(`${API}&store=${store}&liq=${encodeURIComponent(liqId)}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer la lista de precios.')
  return {
    campania: d.campania,
    items: d.items || [],
    tiendas: d.tiendas || [],
    leidoEn: d.leidoEn ?? null,
  }
}

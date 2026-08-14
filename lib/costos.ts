/**
 * El costo de los productos, pedido al servidor. Pieza B del escalón 3 de la Fase S.
 *
 * 🔑 **Ya no sale de Supabase con la anon key.** `productos.unit_cost` viajaba al navegador de las
 * 14 personas —450 costos en BDI, 2.676 en Zattia— y con la key del bundle se lo bajaba cualquiera.
 * Ahora lo sirve `api/_costos.js` con la clave de servicio, gateado por el permiso de las cinco
 * secciones que muestran una cifra.
 *
 * 🔴 **Nunca lanza.** El costo es un enriquecimiento opcional del payload del ETL: quien no lo
 * puede ver igual necesita que la carga termine. Sin permiso el servidor contesta 200 con `{}`, y
 * si la puerta se cae del todo esto devuelve `{}` también. En los dos casos `computarDatos` marca
 * cada producto con `sinCosto: true`, que es exactamente lo que hay que mostrar.
 */
import { apiFetch } from './api-fetch'
import type { Marca } from './nav.datos'

/** `{ '<product_id>': <unit_cost> }`. `null` es "GN no mandó el costo", igual que en la tabla. */
export type MapaCostos = Record<string, number | null>

type Respuesta = { ok?: boolean; costos?: MapaCostos; sinPermiso?: boolean; error?: string }

/**
 * @param ids Sólo esos `product_id`. Sin la lista vienen todos los productos activos, que es lo
 *            que pide el ETL.
 */
export async function traerCostos(marca: Marca, ids?: (number | string)[]): Promise<MapaCostos> {
  try {
    const r = await apiFetch('/api/datos?recurso=costos', {
      method: 'POST',
      // ⚠️ Sin este header Vercel no parsea el body y el handler ve `store` vacío, sin error.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids ? { store: marca, ids } : { store: marca }),
    })
    const d = (await r.json().catch(() => ({}))) as Respuesta
    if (!r.ok || !d.ok) return {}
    return d.costos || {}
  } catch {
    return {}
  }
}

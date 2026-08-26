// Lo que comparten el receptor del webhook (`_oc-webhook.js`) y la lectura de la sección
// (`_recepciones.js`). ⛔ Archivo `_`: no es una ruta.
//
// Está partido en un tercer archivo justamente porque los otros dos NO se pueden juntar: uno es un
// verbo abierto a internet y el otro pide sesión. Lo único que comparten es a qué base le hablan.
import { baseDeLinea } from '../lib/lineas.core.js'

/** Techo del cuerpo del webhook. Una OC de 800 renglones no llega a 500 KB. */
export const LIMITE_CRUDO = 2 * 1024 * 1024

/**
 * La base donde viven las tres tablas de recepciones: **la de BDI, para las dos marcas**.
 *
 * 🔴 Un webhook no puede elegir base. Si el evento llegara para una marca cuya credencial no está
 * cargada, el POST contestaría 500, el emisor reintentaría 17 horas y después lo marcaría fallido:
 * **el evento se pierde y no hay quién lo vuelva a mandar**. Con una sola base, la única credencial
 * que tiene que estar es una. Mismo criterio que `_canjes.js`, que también habla siempre con BDI.
 */
export function cfgDelMonitor() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  }
}

/**
 * La base de CADA marca, sólo para LEER su espejo de Gestión Nube (`inventario`).
 *
 * El espejo sí es de cada marca: el SKU de una no existe en la otra. Su falla no voltea nada — ver
 * `cruzarConElEspejo`.
 */
export function cfgDeMarca(store) {
  if (baseDeLinea(store) === 'zattia') {
    return {
      url: process.env.ZATTIA_SUPABASE_URL,
      key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY,
    }
  }
  return cfgDelMonitor()
}

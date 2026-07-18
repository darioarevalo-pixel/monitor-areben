/**
 * Extracción DOM de la tabla vieja de una descripción de TN. Es la ÚNICA parte de
 * gen-talles que toca el DOM (usa `DOMParser`), por eso vive aislada del dominio
 * puro (`lib/gen-talles/core.ts`) y sólo se llama desde el cliente. Port de la parte
 * DOM de gtRenderTablaActual (index.html:7420) y genTallesImportar (7432-7449); el
 * emparejado de medidas contra la plantilla lo hace `emparejarMedidas` (puro).
 */

import type { MedidaImportada } from '@/lib/gen-talles/core'

/** El HTML de la primera `<table>` de la descripción, o null si no hay. Port de gtRenderTablaActual. */
export function tablaActualHtml(rawDesc: string | undefined): string | null {
  const doc = new DOMParser().parseFromString(rawDesc || '', 'text/html')
  const tabla = doc.querySelector('table')
  return tabla ? tabla.outerHTML : null
}

export type TablaExtraida = { talles: string[]; medidas: MedidaImportada[] }

/**
 * Lee la tabla vieja: talles (cabecera, sin el "T " y el "cm") y una medida por fila
 * con su valor por talle. Devuelve null si no hay tabla o tiene menos de 2 filas.
 * Port de la parte DOM de genTallesImportar.
 */
export function extraerTabla(rawDesc: string | undefined): TablaExtraida | null {
  const doc = new DOMParser().parseFromString(rawDesc || '', 'text/html')
  const tabla = doc.querySelector('table')
  if (!tabla) return null
  const rows = [...tabla.querySelectorAll('tr')].filter((tr) => tr.querySelector('th,td'))
  if (rows.length < 2) return null
  const head = [...rows[0].querySelectorAll('th,td')].map((c) => (c.textContent || '').trim())
  const limpiarTalle = (t: string) => t.replace(/^t\s*(?=\d)/i, '').trim() // "T 36" → "36"
  const limpiarValor = (v: string) => v.replace(/cm\.?/gi, '').replace(/\s+/g, ' ').trim() // "68 CM" → "68"
  const talles = head.slice(1).map(limpiarTalle).filter(Boolean)
  if (!talles.length) return null
  const medidas: MedidaImportada[] = []
  for (let i = 1; i < rows.length; i++) {
    const cells = [...rows[i].querySelectorAll('th,td')].map((c) => (c.textContent || '').trim())
    if (!cells.length || !cells[0]) continue
    const nombre = cells[0].replace(/^[a-zA-Z][.)]\s*/, '').trim()
    const valores: Record<string, string> = {}
    talles.forEach((t, idx) => {
      valores[t] = limpiarValor(cells[idx + 1] || '')
    })
    medidas.push({ nombre, valores })
  }
  return medidas.length ? { talles, medidas } : null
}

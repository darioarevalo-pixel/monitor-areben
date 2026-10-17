/**
 * **La confirmación del ticket** (Darío, 17-oct-2026): *«un proceso es la búsqueda y otra cosa es el
 * escaneo confirmatorio de exhibición, y debería pasar lo mismo con los productos que retira»*.
 *
 * Al imprimir el ticket se congela su lista —lo pendiente de exhibición y las variantes duplicadas—
 * en el primer recorrido del día. Con el ticket en la mano, la empleada pasa por el lector **cada
 * prenda al colgarla** y **cada duplicada al retirarla**; el celular la tacha. Al terminar, los dueños
 * reciben qué se hizo y qué no, producto por producto. Reemplaza a la foto del ticket tildado: la
 * tilde en el papel ⛔ dice qué prenda se tuvo en la mano, el lector sí.
 *
 * 🔑 **La lista es la del PAPEL, ⛔ la del reporte de ahora**: el reporte se rearma con cada stock
 * nuevo, y lo que se confirma es lo que se le dio a la empleada para hacer.
 * 🔑 **Una prenda ⛔ puede estar en las dos listas**: pendiente = ⛔ pasó por el lector; duplicada =
 * pasó dos veces o más. Por eso un escaneo se resuelve sin preguntar.
 *
 * ⛔ Copia de la cuenta en `api/_exhib.js` (`resumenDeConfirmacion`): un handler ⛔ importa TypeScript.
 */

import { exhibId } from './core'
import type { Duplicada, Pendiente } from './reporte'
import type { ExhibItem } from './tipos'

/** Un renglón del ticket, lo justo para reconocerlo y mostrarlo. */
export type RenglonTicket = { clave: string; sku: string; nombre: string; variante: string }

export type Confirmacion = {
  lista: { pendientes: RenglonTicket[]; duplicadas: RenglonTicket[] }
  impreso_en: string
  impreso_por: string | null
  /** `clave` → hora en que se pasó por el lector. */
  exhibidos: Record<string, string>
  retirados: Record<string, string>
  terminado_en?: string | null
  terminado_por?: string | null
  correo?: { enviado_en?: string; a?: string[]; error?: string } | null
}

const renglon = (r: Pendiente | Duplicada): RenglonTicket => ({ clave: r.clave, sku: r.sku, nombre: r.nombre, variante: r.variante })

/** Lo que se congela al imprimir: las mismas dos listas que salen en el papel. */
export function listaDelTicket(pendientes: Pendiente[], duplicadas: Duplicada[]): Confirmacion['lista'] {
  return { pendientes: pendientes.map(renglon), duplicadas: duplicadas.map(renglon) }
}

export type ResultadoConfirmar =
  | { que: 'exhibido' | 'retirado'; renglon: RenglonTicket }
  /** Ya se había pasado: ⛔ cambia nada. */
  | { que: 'ya'; renglon: RenglonTicket; lista: 'exhibidos' | 'retirados' }
  /** La prenda existe pero ⛔ está en el ticket. */
  | { que: 'fuera' }

/**
 * Qué es la prenda escaneada para el ticket.
 *
 * 🔑 El pendiente «una cualquiera» (`<productId>|*`, los modelos que se exhiben con una sola variante)
 * se cumple con CUALQUIER variante del modelo.
 */
export function resolverEscaneo(conf: Confirmacion, it: Pick<ExhibItem, 'barcode' | 'productId' | 'size'>): ResultadoConfirmar {
  const id = exhibId(it)
  const pend = conf.lista.pendientes.find((p) => p.clave === id) ?? conf.lista.pendientes.find((p) => p.clave === `${it.productId}|*`)
  if (pend) return conf.exhibidos[pend.clave] ? { que: 'ya', renglon: pend, lista: 'exhibidos' } : { que: 'exhibido', renglon: pend }
  const dup = conf.lista.duplicadas.find((d) => d.clave === id)
  if (dup) return conf.retirados[dup.clave] ? { que: 'ya', renglon: dup, lista: 'retirados' } : { que: 'retirado', renglon: dup }
  return { que: 'fuera' }
}

/** La confirmación con el escaneo anotado. Sólo cambia en `exhibido`/`retirado`. */
export function anotar(conf: Confirmacion, r: ResultadoConfirmar, ahora: string): Confirmacion {
  if (r.que === 'exhibido') return { ...conf, exhibidos: { ...conf.exhibidos, [r.renglon.clave]: ahora } }
  if (r.que === 'retirado') return { ...conf, retirados: { ...conf.retirados, [r.renglon.clave]: ahora } }
  return conf
}

export type ResumenConfirmacion = {
  exhibidos: number
  pendientes: number
  retirados: number
  duplicadas: number
  /** Lo del ticket que ⛔ pasó por el lector: ⛔ se encontró o ⛔ se exhibió. */
  sinExhibir: RenglonTicket[]
  /** Duplicadas que siguen colgadas: exhibición frontal, o ⛔ se retiraron. */
  sinRetirar: RenglonTicket[]
}

export function resumenConfirmacion(conf: Confirmacion): ResumenConfirmacion {
  const { pendientes, duplicadas } = conf.lista
  return {
    exhibidos: pendientes.filter((p) => conf.exhibidos[p.clave]).length,
    pendientes: pendientes.length,
    retirados: duplicadas.filter((d) => conf.retirados[d.clave]).length,
    duplicadas: duplicadas.length,
    sinExhibir: pendientes.filter((p) => !conf.exhibidos[p.clave]),
    sinRetirar: duplicadas.filter((d) => !conf.retirados[d.clave]),
  }
}

/**
 * Junta las marcas del servidor con las del teléfono (las que todavía ⛔ subieron por falta de señal):
 * se queda con todas, y de cada una con la hora más temprana.
 */
export function juntarMarcas(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) if (!out[k] || v < out[k]) out[k] = v
  return out
}

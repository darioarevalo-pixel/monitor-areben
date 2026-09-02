/**
 * Qué le falta a la cola de «Descripción y medidas» para estar en la tienda.
 *
 * 🔴 **Es una función pura y vive acá, no adentro del aviso.** El aviso cuenta lo mismo que la
 * pantalla; si la regla se escribiera en el derivador, el badge y la lista empezarían a decir
 * cosas distintas el día que alguien toque una de las dos. Es la misma forma que `mirarTodos` en
 * Insumos.
 */

import type { Familia } from '@/lib/tn-desc/atributos'

/** Lo que el aviso necesita de cada fila de la cola. Un subconjunto de `FilaCola`. */
export type FilaPendiente = {
  tn_id: string
  nombre: string | null
  familia: Familia | null
  borrador: { parrafo?: string } | null
  estado: string
  aprobado_at: string | null
  updated_at: string | null
  sin_medidas: string | null
}

export type Pendientes = {
  /** Aprobadas y todavía no escritas en la tienda. Es lo único que espera UN CLIC. */
  aprobadas: FilaPendiente[]
  /** Con la ficha empezada y sin un borrador aprobado: esperan que alguien escriba y apruebe. */
  empezadas: FilaPendiente[]
  /**
   * El milisegundo desde el que espera la más vieja de las aprobadas.
   *
   * 🔴 Sale de `aprobado_at` y ⛔ NO de `updated_at`: `updated_at` se mueve cada vez que alguien
   * toca cualquier cosa de la fila —cargar una medida, corregir la tela— así que mediría «hace
   * cuánto que nadie la toca», que es otra pregunta. La espera arranca cuando quedó lista.
   */
  esperaDesde: number
}

const ms = (iso: string | null): number => {
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}

/**
 * Parte la cola en lo que espera un clic y lo que espera que alguien escriba.
 *
 * ⚠️ Son **dos avisos distintos y a propósito**: publicar lo aprieta quien puede publicar, y
 * escribir el párrafo también — pero son dos gestos con dos botones. Juntarlos en un número daría
 * «17 pendientes» sin decir cuáles se resuelven en un clic.
 *
 * ⛔ Una prenda marcada «no lleva tabla de medidas» ⛔ NO es un pendiente: es una respuesta. Si
 * contara, la cola nunca bajaría a cero — y una cola que nunca baja a cero deja de mirarse.
 */
export function pendientesDePublicar(filas: FilaPendiente[]): Pendientes {
  const aprobadas: FilaPendiente[] = []
  const empezadas: FilaPendiente[] = []
  for (const f of filas || []) {
    if (f.estado === 'aprobado') aprobadas.push(f)
    // `escrito` con la relectura hecha ya está en la tienda; `escribiendo` y `falla` son de
    // publicar y los muestra la fila con su propio cartel, no un aviso de «falta publicar».
    else if (f.estado !== 'escrito' && f.estado !== 'escribiendo' && f.estado !== 'falla' && f.familia) empezadas.push(f)
  }
  const tiempos = aprobadas.map((f) => ms(f.aprobado_at)).filter(Boolean)
  return { aprobadas, empezadas, esperaDesde: tiempos.length ? Math.min(...tiempos) : 0 }
}

/** Los primeros nombres, para que el aviso diga QUÉ y no sólo cuántos. */
export function nombrarFilas(filas: FilaPendiente[], hasta = 3): string {
  const nombres = filas.map((f) => f.nombre || f.tn_id).filter(Boolean)
  const cabeza = nombres.slice(0, hasta).join(' · ')
  return nombres.length > hasta ? `${cabeza} y ${nombres.length - hasta} más` : cabeza
}

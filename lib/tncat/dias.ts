/**
 * Días enteros desde una fecha ISO. Vive suelto porque lo usan las dos pantallas que ordenan
 * por antigüedad —la cola de fotos y Explorar categoría— y **una segunda copia se desincroniza
 * sin que nadie lo note**: ya pasó con `diasDesde`, que estaba dos veces y cada test miraba el
 * suyo, así que el mutante sobrevivía → [[feedback_areben_guard_duplicado_lo_caza_el_mutante]].
 */

const DIA = 86400000

/** Días enteros entre el alta y ahora. Negativo se recorta a 0: una fecha futura no es una espera. */
export function diasDesde(iso: string | null | undefined, ahora: number): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((ahora - t) / DIA))
}

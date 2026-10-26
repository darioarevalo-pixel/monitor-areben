// Cómo se escribe un aviso del celular (Darío, 25-oct-2026): el iPhone suma «from Monitor» a los
// avisos de páginas web y el texto se corta con «…», así que el cuerpo va en UNA línea corta.

export const MAX_AVISO = 60

/** Una sola línea, con tope. ⛔ Lo completo se lee al tocar el aviso. */
export function corto(texto, max = MAX_AVISO) {
  const t = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

/** «mañana» o «28/10» si la tarea no es de hoy; vacío si es de hoy (o no hay fecha). */
export function cuandoAviso(fecha, hoy) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(hoy)) || fecha <= hoy) return ''
  const dias = Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000)
  return dias === 1 ? 'mañana' : `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
}

/** El cuerpo de «nueva tarea»: el nombre de la tarea y, si no es de hoy, para cuándo. */
export function cuerpoTarea(titulo, fecha, hoy) {
  const cuando = cuandoAviso(fecha, hoy)
  return cuando ? `${corto(titulo, MAX_AVISO - cuando.length - 3)} · ${cuando}` : corto(titulo)
}

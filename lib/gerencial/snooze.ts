/**
 * Silenciar (snooze) accionables: los oculta del panel por un tiempo, para bajar el
 * ruido y que quede solo lo que importa. Es preferencia LOCAL del navegador (no del
 * equipo), así que va en localStorage, no en el KV. La clave del snooze es el `id`
 * estable del accionable.
 */

const CLAVE = 'monitor_gerencial_snooze'
/** Cuánto dura un silencio, por defecto. */
export const DIAS_SNOOZE = 7

/** `{ [accionableId]: expiraTs }`. Una entrada vencida es como si no existiera. */
type MapaSnooze = Record<string, number>

function leer(): MapaSnooze {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(CLAVE)
    return raw ? (JSON.parse(raw) as MapaSnooze) : {}
  } catch {
    return {}
  }
}

function guardar(m: MapaSnooze): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CLAVE, JSON.stringify(m))
  } catch {
    /* localStorage lleno o bloqueado: silenciar es best-effort */
  }
}

/**
 * Los ids silenciados que siguen vigentes (y limpia los vencidos). `Date.now()` va acá,
 * en código de módulo, no en el render del componente (que debe ser puro).
 */
export function idsSilenciados(): Set<string> {
  const now = Date.now()
  const m = leer()
  const vigentes: MapaSnooze = {}
  let cambio = false
  for (const [id, exp] of Object.entries(m)) {
    if (exp > now) vigentes[id] = exp
    else cambio = true
  }
  if (cambio) guardar(vigentes)
  return new Set(Object.keys(vigentes))
}

/** Silencia un accionable por `dias` a partir de ahora. */
export function silenciar(id: string, dias: number = DIAS_SNOOZE): void {
  const m = leer()
  m[id] = Date.now() + dias * 86400000
  guardar(m)
}

/** Quita el silencio de un accionable (volver a mostrarlo). */
export function reactivar(id: string): void {
  const m = leer()
  if (id in m) {
    delete m[id]
    guardar(m)
  }
}

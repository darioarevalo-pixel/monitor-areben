/**
 * Hasta cuándo miró sus avisos cada persona. Es **lo único que persiste** toda la feature de
 * notificaciones: un número por usuario.
 *
 * Va en `localStorage` y no en el KV, igual que el snooze del panel Gerencial: es preferencia de
 * este navegador, no del equipo. La consecuencia hay que decirla: si alguien entra desde la
 * compu y desde el celular, cada uno lleva su cuenta. Se puede mover al KV el día que moleste —
 * es una clave más—, pero mientras el monitor viva abierto en la máquina del sector, no molesta.
 */

const CLAVE = 'monitor_avisos_visto'

type MapaVisto = Record<string, number>

function leer(): MapaVisto {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(CLAVE)
    return raw ? (JSON.parse(raw) as MapaVisto) : {}
  } catch {
    return {}
  }
}

/** Se keyea por usuario para que dos personas que comparten el puesto no se pisen el contador. */
function clave(usuario: string | null | undefined): string {
  return String(usuario || '(anon)').toLowerCase()
}

export function vistoHasta(usuario: string | null | undefined): number {
  return leer()[clave(usuario)] || 0
}

/** Marca todo lo de hasta ahora como visto. Lo llama Inicio al abrirse. */
export function marcarVisto(usuario: string | null | undefined, ts: number = Date.now()): void {
  if (typeof localStorage === 'undefined') return
  try {
    const m = leer()
    m[clave(usuario)] = ts
    localStorage.setItem(CLAVE, JSON.stringify(m))
  } catch {
    /* localStorage lleno o bloqueado: el contador es best-effort */
  }
}

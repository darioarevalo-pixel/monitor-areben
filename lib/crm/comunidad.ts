/**
 * ¿Está en la comunidad mayorista de WhatsApp?
 *
 * La lista sale de WhatsApp Web: la extensión del panel lee los participantes de la comunidad
 * (`BDI Accesorios Mayorista`) de la memoria de la aplicación y se la pasa al panel, que la guarda
 * en el KV (`crm:comunidad:bdi`). Medido el 25-ago-2026: los 458 participantes se traducen a
 * teléfono, porque Darío tiene a todos agendados.
 *
 * 🔑 **Esto reemplaza a la marca a mano `en_difusion` sin borrarla.** La marca decía 120 de 772 con
 * una comunidad de 458: estaba muy por debajo de la realidad. Con la foto cargada, el CRM usa la
 * foto; sin foto (nunca se mandó, o no se pudo leer) sigue mostrando la marca de siempre. Las 120
 * marcas quedan en el KV intactas.
 */
import { normalizeArgPhone } from './telefono.core.js'

export type FotoComunidad = {
  tels: string[]
  grupo: string
  participantes: number
  actualizado: string
}

/**
 * Cuántos dígitos del final alcanzan para decir que es el mismo número. Diez es característica +
 * abonado: absorbe el `9` y el `15` que un lado tiene y el otro no, y entre ~500 números no choca.
 */
const COLA = 10

export type IndiceComunidad = { exactos: Set<string>; colas: Set<string>; total: number }

export function indexarComunidad(tels: readonly string[]): IndiceComunidad {
  const exactos = new Set<string>()
  const colas = new Set<string>()
  for (const t of tels) {
    const n = normalizeArgPhone(t) || String(t).replace(/\D/g, '')
    if (n.length < COLA) continue
    exactos.add(n)
    colas.add(n.slice(-COLA))
  }
  return { exactos, colas, total: exactos.size }
}

/** `true`/`false` si se puede decir; `null` si el teléfono no sirve para comparar. */
export function estaEnComunidad(indice: IndiceComunidad, telefono: string | null | undefined): boolean | null {
  const n = normalizeArgPhone(telefono || '')
  if (n.length < COLA) return null
  return indice.exactos.has(n) || indice.colas.has(n.slice(-COLA))
}

/** "hoy", "ayer", "hace 5 días": cuánto tiene la foto. Se muestra para que nadie confíe en una vieja. */
export function antiguedadFoto(actualizado: string, hoy: Date = new Date()): string {
  const t = Date.parse(actualizado)
  if (!Number.isFinite(t)) return ''
  const dias = Math.floor((hoy.getTime() - t) / 86400000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

/**
 * ¿Hay que volver a guardar la foto? Sólo si cambió quién está, o si la guardada tiene más de un
 * día (para que "actualizado" diga la verdad aunque nadie haya entrado ni salido).
 */
export function fotoDistinta(guardada: FotoComunidad | null, tels: readonly string[], ahora: Date = new Date()): boolean {
  if (!guardada) return true
  const a = new Set(guardada.tels)
  if (a.size !== new Set(tels).size || tels.some((t) => !a.has(t))) return true
  const t = Date.parse(guardada.actualizado)
  return !Number.isFinite(t) || ahora.getTime() - t > 20 * 3600000
}

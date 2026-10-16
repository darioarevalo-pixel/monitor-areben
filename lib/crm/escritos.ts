import { cola } from './telefono.core.js'

/**
 * A quién le escribiste hoy, según WhatsApp Web (16-oct-2026, a prueba). La extensión manda sólo
 * teléfonos (`extension/pagina.js` → `escritosHoy`); acá se guardan por los últimos 8 dígitos, el
 * mismo cruce que usa el resto del panel.
 */
export type EscritosHoy = Set<string>

export const indexarEscritos = (tels: unknown[]): EscritosHoy => new Set(tels.map((t) => cola(String(t))).filter(Boolean))

export const leEscribisteHoy = (escritos: EscritosHoy, tels: (string | null | undefined)[]) =>
  tels.some((t) => {
    const c = cola(t || '')
    return !!c && escritos.has(c)
  })

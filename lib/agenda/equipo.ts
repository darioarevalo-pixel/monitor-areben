/**
 * **Cómo va cada una hoy** — la pantalla «Equipo» de la Agenda (Darío, 19-oct-2026).
 *
 * 🔑 **Las personas son las del correo diario** (`EQUIPO` de `correo-diario.core.js`): la pantalla y
 * el correo de la noche hablan del mismo equipo. Quien entra o sale se cambia ahí, una sola vez.
 *
 * 🔑 **Lo de cada una sale de `pendientesDe`, la misma función de su «Hoy»**: lo que se ve acá es lo
 * que ella ve en su teléfono, atrasadas incluidas. Lo único que cambia es el `paraMi`, que el
 * servidor calcula para quien mira (Darío) y acá se recalcula con `esParaMi` para cada persona.
 * ⚠️ Lo dirigido a una **pantalla** (`{tipo:'seccion'}`) ⛔ no le cae a nadie acá: eso pide los
 * permisos del padrón. Mismo criterio que el correo.
 */
import { EQUIPO } from './correo-diario.core.js'
import { esParaMi } from '../novedades/destino.core.js'
import { pendientesDe, type PendienteHoy } from './index'
import type { FechaIso, Hecho, ItemAgenda } from './tipos'
import type { Marca } from '../nav.datos'

export type PersonaEquipo = {
  name: string
  nombre: string
  lugar: string
  funcion: string[]
  cuenta: Marca | null
}

export const EQUIPO_AGENDA = EQUIPO as PersonaEquipo[]

export type EstadoEquipo = 'al-dia' | 'a-medias' | 'nada' | 'sin-tareas'

export type FilaEquipo = {
  persona: PersonaEquipo
  pendientes: PendienteHoy[]
  hechas: number
  total: number
  atrasadas: number
  /** La hora del último tilde de HOY, o `null`. Es la única huella de uso que hay. */
  ultima: string | null
  estado: EstadoEquipo
}

export function avanceDelEquipo(
  items: ItemAgenda[],
  hechos: Hecho[],
  hoy: FechaIso,
  equipo: PersonaEquipo[] = EQUIPO_AGENDA,
): FilaEquipo[] {
  return equipo.map((persona) => {
    const perfil = { name: persona.name, funcion: persona.funcion, cuenta: persona.cuenta || undefined }
    const suyos = items.map((i) => ({ ...i, paraMi: esParaMi(i.destino, perfil) as boolean }))
    const pendientes = pendientesDe(suyos, hechos, hoy, { marca: persona.cuenta || undefined })
    const hechas = pendientes.filter((p) => p.hecho).length
    const total = pendientes.length
    const ultima = hechos
      .filter((h) => h.usuario === persona.name && h.hechoAt && h.hechoAt.slice(0, 10) >= hoy)
      .map((h) => h.hechoAt as string)
      .sort()
      .pop() ?? null
    const estado: EstadoEquipo = !total ? 'sin-tareas' : hechas === total ? 'al-dia' : hechas || ultima ? 'a-medias' : 'nada'
    return { persona, pendientes, hechas, total, atrasadas: pendientes.filter((p) => p.desde && !p.hecho).length, ultima, estado }
  })
}

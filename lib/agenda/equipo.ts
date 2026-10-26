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
import { companerasDe as companerasCore } from './celular-compartido.core.js'
import { esParaMi } from '../novedades/destino.core.js'
import { diaArgentina, pendientesDe, type PendienteHoy } from './index'
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
  /** La hora del último tilde de ESE día (en Argentina), o `null`. Es la única huella de uso que hay. */
  ultima: string | null
  estado: EstadoEquipo
}

export function avanceDelEquipo(
  items: ItemAgenda[],
  todos: Hecho[],
  hoy: FechaIso,
  equipo: PersonaEquipo[] = EQUIPO_AGENDA,
): FilaEquipo[] {
  // 📅 `hoy` puede ser un día pasado (las flechas de Equipo, Darío 26-oct-2026). Se mira **como
  // quedó ese día al cerrar**: un tilde puesto después no cuenta, así lo que se hizo tarde sale
  // pendiente en su día y hecho en el día en que se hizo. Hoy esto no saca nada.
  const hechos = todos.filter((h) => !h.hechoAt || diaArgentina(h.hechoAt) <= hoy)
  return equipo.map((persona) => {
    const suyos = deLaPersona(items, persona)
    const pendientes = pendientesDe(suyos, hechos, hoy, { marca: persona.cuenta || undefined })
    const hechas = pendientes.filter((p) => p.hecho).length
    const total = pendientes.length
    const ultima = hechos
      .filter((h) => h.usuario === persona.name && !!h.hechoAt && diaArgentina(h.hechoAt) === hoy)
      .map((h) => h.hechoAt as string)
      .sort()
      .pop() ?? null
    const estado: EstadoEquipo = !total ? 'sin-tareas' : hechas === total ? 'al-dia' : hechas || ultima ? 'a-medias' : 'nada'
    return { persona, pendientes, hechas, total, atrasadas: pendientes.filter((p) => p.desde && !p.hecho).length, ultima, estado }
  })
}

/**
 * La persona del equipo operativo con ese usuario, o `null`. Decide **qué Monitor ve quien entra**
 * (Darío, 18-oct-2026: «según quién entra, no según el aparato»): al equipo el Monitor le abre en
 * «Hoy», con su saludo y sus pantallas; Darío, Bruno y el resto siguen entrando por Inicio.
 */
export function personaDelEquipo(name: string | null | undefined): PersonaEquipo | null {
  return EQUIPO_AGENDA.find((p) => p.name === name) ?? null
}

/** Los ítems con `paraMi` recalculado para otra persona del equipo, como si ella hubiera entrado. */
export function deLaPersona(items: ItemAgenda[], persona: PersonaEquipo): ItemAgenda[] {
  const perfil = { name: persona.name, funcion: persona.funcion, cuenta: persona.cuenta || undefined }
  return items.map((i) => ({ ...i, paraMi: esParaMi(i.destino, perfil) as boolean }))
}

/** 📱 Con quién comparte el celular quien entró (`celular-compartido.core.js`). `[]` casi siempre. */
export function companerasDe(name: string | null | undefined): PersonaEquipo[] {
  return companerasCore(name) as PersonaEquipo[]
}

/**
 * **Quién hay en el equipo, y de qué sector es cada uno.** Para no-admins.
 *
 * # El problema que resuelve
 *
 * El selector «a una persona» de la Agenda leía el padrón con `traerConfigAdmin`, que es **admin
 * only**: pide contraseña de administrador y contesta 403 al resto. Mientras el único que cargaba
 * rutinas fue el admin eso no se notó. El día que Administración tiene `agenda.cargar` —que es para
 * lo que se escribió— **no puede asignarle a nadie por nombre**: la pantalla se degrada y avisa.
 *
 * # Por qué esto SÍ puede
 *
 * Son dos puertas distintas del mismo endpoint y hace falta no confundirlas:
 *
 * | | quién | qué devuelve |
 * |---|---|---|
 * | `POST {action:'config'}` | **sólo admin** | la config para editarla, con `tienePass` |
 * | `GET` con credencial | **cualquiera logueado** | la config **sin contraseñas** |
 *
 * El GET ya existía y ya estaba cerrado a quien tiene sesión en el Monitor (antes contestaba a
 * cualquiera con un `curl`, y se cerró). Acá se usa ése.
 *
 * ⚠️ **Y de todo lo que devuelve sale sólo `{name, apodo, funcion, horasExtras}`.** El achique se
 * hace acá, en la frontera, y no en cada pantalla: lo que no se devuelve no se puede dibujar por
 * accidente. Los permisos de cada uno, los mails, quién es admin y **el link de carga de horas**
 * siguen siendo asunto de la pantalla de Usuarios — el link, además, porque es una credencial.
 *
 * 🔑 **La clave es `name`, no el mail** — es la única que existe para todos: los puestos compartidos
 * (`Local`, `Depósito`, `bdilocal`) tienen `email: null`. Es la misma con la que se guardan
 * `agenda_items.destino`, `agenda_items.autor` y `agenda_hechos.usuario`.
 */

import { sobreDeAuth } from '@/lib/api-fetch'
import { USU_API } from '@/lib/sesion'
import type { Funcion } from '@/lib/permisos'

/** Una persona del padrón, con lo justo para elegirla y saber de qué sector es. */
export type Companero = {
  /** La clave. Es lo que se guarda en el destino. */
  name: string
  /** Cómo le decimos. Sin apodo cae al `name`, que en los puestos es `bdilocal` o `deposito`. */
  apodo: string
  funcion: Funcion[]
  /**
   * ¿Hace horas extras? Entra al recorte porque hay una rutina cuyo destino es exactamente esto
   * (`{tipo:'horas-extras'}`), y sin este dato la ficha de Organización dejaría de mostrársela a
   * las personas que la tienen — que es el agujero que esa sección vino a cerrar.
   *
   * ⛔ **El LINK no entra, y no es un olvido.** El link es una credencial sin sesión: quien lo
   * tiene carga horas a nombre de otra. Viaja sólo en el perfil de su dueña. Acá va el booleano,
   * que es lo único que hace falta para saber de quién es una rutina.
   */
  horasExtras: boolean
}

type UsuarioDelGet = { name?: string; apodo?: string | null; funcion?: Funcion[] | Funcion | null; horasExtras?: boolean }

/**
 * El equipo, ordenado por cómo le decimos a cada uno.
 *
 * ⚠️ **Devuelve `null` si no se pudo leer**, y no una lista vacía: son dos cosas distintas y la
 * pantalla las dice distinto. Vacío sería «no hay nadie», que nunca es cierto; `null` es «no se
 * pudo preguntar», que es lo que hay que mostrar para que alguien sepa que no es que falte gente.
 */
export async function traerEquipo(): Promise<Companero[] | null> {
  const sobre = await sobreDeAuth()
  if (!sobre) return null
  try {
    const r = await fetch(USU_API, { headers: { 'x-monitor-auth': sobre } })
    const d = await r.json()
    const users: UsuarioDelGet[] = d?.config?.users
    if (!Array.isArray(users)) return null
    return users
      .filter((u): u is UsuarioDelGet & { name: string } => !!u?.name)
      .map((u) => ({
        name: u.name,
        apodo: u.apodo || u.name,
        funcion: Array.isArray(u.funcion) ? u.funcion : u.funcion ? [u.funcion] : [],
        horasExtras: u.horasExtras === true,
      }))
      .sort((a, b) => a.apodo.localeCompare(b.apodo, 'es'))
  } catch {
    return null
  }
}

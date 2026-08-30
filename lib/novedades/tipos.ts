/** Novedades: qué cambió en los sistemas, y quién lo leyó. */

import {
  ESTADOS as ESTADOS_JS,
  esEstado as esEstadoJs,
  seMarcanAlEntrar as seMarcanAlEntrarJs,
  sinLeer as sinLeerJs,
} from './estados.core.js'
import { normalizarDestino as normalizarDestinoJs, TODOS as TODOS_JS } from './destino.core.js'
import type { ManualIndice } from '@/lib/manuales/tipos'
import { tituloLimpio } from '@/lib/nav'
import type { Marca } from '@/lib/nav.datos'
import { FUNCIONES } from '@/lib/permisos'

export type EstadoNovedad = 'borrador' | 'publicada' | 'archivada'

/**
 * A quién le llega. Ver `destino.core.js`: el filtro corre en el servidor, no en la pantalla.
 *
 * `marca` es ortogonal al tipo y **ausente significa las dos**: acota a quién le llega, no de quién
 * es la novedad, que sigue siendo una sola fila sin marca.
 *
 * ⚠️ `personas` es la única forma que **no la recibe el admin**: lo que se dirige por nombre es de
 * quien lleva el nombre. Hoy la usa sólo la Agenda; el editor de Novedades no la ofrece.
 */
export type Destino =
  | { tipo: 'todos'; marca?: Marca }
  | { tipo: 'seccion'; key: string; marca?: Marca }
  | { tipo: 'roles'; roles: string[]; marca?: Marca }
  /** Por nombre de usuario (`perfil.name`), no por mail: los puestos compartidos no tienen. */
  | { tipo: 'personas'; personas: string[]; marca?: Marca }
  /**
   * A quien tenga el tilde «hace horas extras» en su perfil. No lleva lista: la lista se deriva
   * del padrón en `esParaMi`, para que el interruptor sea uno solo. Ver `destino.core.js`.
   */
  | { tipo: 'horas-extras'; marca?: Marca }

export type Novedad = {
  id: string
  estado: EstadoNovedad
  /** Las importantes frenan al entrar hasta que se leen. Se usa poco a propósito. */
  importante: boolean
  titulo: string
  /** Markdown del subconjunto de `lib/markdown/core.ts`. */
  cuerpo: string
  /** Sube cuando hay que volver a hacerla leer. Ver el `.sql`. */
  version: number
  autor?: string | null
  publicada_at?: string | null
  destino?: Destino
  /**
   * Si además le toca a quien está mirando. **Lo calcula el servidor**, que es el único que sabe.
   * No es lo mismo que "la puede ver": quien publica recibe todas para administrarlas, y esto dice
   * cuáles le suman al badge y cuáles lo frenan con el cartel.
   */
  paraMi?: boolean
  created_at?: string
  updated_at?: string
}

/** Una lectura: esta persona leyó esta novedad en esta versión. */
export type Lectura = { novedad_id: string; version: number; usuario?: string; leida_at?: string }

export type DatosSistema = {
  novedades: Novedad[]
  leidas: Lectura[]
  manuales: ManualIndice[]
  puede: { publicar: boolean; editarManuales: boolean }
}

export const ESTADOS = ESTADOS_JS as readonly EstadoNovedad[]
export const esEstado = esEstadoJs as (v: unknown) => boolean

/** Las publicadas que esta persona todavía no leyó en la versión de hoy. */
export const sinLeer = sinLeerJs as (novedades: Novedad[], leidas: Lectura[]) => Novedad[]

/** Las que se dan por leídas con sólo abrir la sección. ⚠️ Las importantes NO: ver el core. */
export const seMarcanAlEntrar = seMarcanAlEntrarJs as (novedades: Novedad[]) => Novedad[]

export const TODOS = TODOS_JS as Destino
export const normalizarDestino = normalizarDestinoJs as (d: unknown) => Destino

/** La novedad vacía del editor. Nace en borrador siempre: publicar es un acto aparte. */
export const NUEVA: Novedad = {
  id: '',
  estado: 'borrador',
  importante: false,
  titulo: '',
  cuerpo: '',
  version: 1,
  destino: { tipo: 'todos' },
}

// ── Cómo se LEE un destino ───────────────────────────────────────────────────────
//
// 📌 Vivían privadas adentro de `components/agenda/Agenda.tsx`, y estaba bien mientras las usara una
// sola pantalla. Con tres —la lista de «Cargar», el informe de Cumplimiento y el detalle del día del
// calendario— la copia sería el camino corto a que una diga «a Sofi» y otra «a sofi». Van acá y no
// en `lib/agenda/` porque son del **destino**, que es de Novedades y lo comparte la Agenda.
//
// ⛔ **No van en `destino.core.js`**: los rótulos se quedan del lado TS, igual que en la Agenda. El
// servidor decide a quién le llega un destino; leerlo en voz alta es cosa de la pantalla.

/** «a todo el equipo» · «a Local y Depósito» · «a quien usa Atención al cliente» · «a Sofi». */
export function rotuloDestino(d: Destino): string {
  if (d.tipo === 'roles') {
    const labels = d.roles.map((r) => FUNCIONES.find((f) => f.key === r)?.label ?? r)
    return `a ${labels.join(' y ')}`
  }
  // Sale el nombre de usuario y no el apodo a propósito: el apodo vive en el padrón, que es
  // admin-only y no viaja con la agenda. Guardar el apodo al elegir lo dejaría viejo el día que
  // alguien se cambie el nombre en pantalla, y esta lista se lee para saber a quién reclamarle.
  if (d.tipo === 'personas') return `a ${d.personas.join(' y ')}`
  if (d.tipo === 'seccion') return `a quien usa ${tituloLimpio(d.key)}`
  // ⛔ No dice cuántas ni quiénes, a propósito: son las que están tildadas en Usuarios, que es
  // admin-only. Un rótulo con nombres acá sería una segunda lista envejeciendo al lado de la real.
  if (d.tipo === 'horas-extras') return 'a quien hace horas extras'
  return 'a todo el equipo'
}

/**
 * Lo mismo, para un renglón apretado: «Sofi» · «Local y Depósito» · «Atención al cliente».
 *
 * 🔑 **`{tipo:'todos'}` devuelve la cadena vacía**, ⛔ no «todo el equipo». Ese es el caso más común
 * y repetirlo en cada renglón es exactamente el ruido que estas pantallas están tratando de sacar:
 * un rótulo que aparece siempre no distingue nada.
 */
export function rotuloDestinoCorto(d: Destino): string {
  if (d.tipo === 'todos') return ''
  // Caso propio y no el `replace` de abajo, que dejaría la «q» en minúscula. ⚠️ Y dice «Quien
  // hace…» y no «Horas extras» a secas: es una columna de a QUIÉN le llega, al lado de «Sofi» y
  // «Marketing», y ahí «Horas extras» se leería como el nombre de la tarea. ⛔ Tiene que dar
  // exactamente lo mismo que `rotuloDeClave('hx')` — hay un test de ida y vuelta que lo amarra.
  if (d.tipo === 'horas-extras') return 'Quien hace horas extras'
  return rotuloDestino(d).replace(/^a (quien usa )?/, '')
}

/**
 * Con qué claves se lo puede filtrar. Una por responsable, ⛔ no una por destino.
 *
 * 🔴 **Un destino con dos personas devuelve DOS claves**, y es lo que hace que «mostrame lo de Sofi»
 * traiga también lo que Sofi comparte con Cande: las dos son responsables de eso. Devolver una sola
 * clave `p:sofi·cande` haría que el ítem no salga en ninguno de los dos filtros.
 *
 * El prefijo separa los espacios de nombres: una persona llamada como un rol no puede colisionar.
 */
export function clavesDestino(d: Destino): string[] {
  if (d.tipo === 'roles') return d.roles.map((r) => `r:${r}`)
  if (d.tipo === 'personas') return d.personas.map((p) => `p:${p}`)
  if (d.tipo === 'seccion') return [`s:${d.key}`]
  // 🔴 Caso propio, ⛔ NO el `['todos']` de abajo. Sin esta línea la rutina de las horas extras se
  // filtraría como si fuera para todo el equipo: aparecería en el filtro «Todo el equipo» de
  // Cumplimiento y en la ficha de las once personas, que es exactamente lo contrario de lo que es.
  if (d.tipo === 'horas-extras') return ['hx']
  return ['todos']
}

/** El rótulo de una clave suelta, sin tener el destino entero delante. */
export function rotuloDeClave(clave: string): string {
  if (clave === 'todos') return 'Todo el equipo'
  if (clave === 'hx') return 'Quien hace horas extras'
  const [pref, ...resto] = clave.split(':')
  const valor = resto.join(':')
  if (pref === 'r') return FUNCIONES.find((f) => f.key === valor)?.label ?? valor
  if (pref === 's') return tituloLimpio(valor)
  return valor
}

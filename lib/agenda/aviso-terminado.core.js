// 🔔 Avisos a Darío cuando alguien del equipo termina (Darío, 20-oct-2026: «la 2, con aviso en las
// importantes»). Dos casos, y ⛔ ningún otro, para que no se llene de avisos:
//   - terminó TODO lo de hoy: un solo aviso por persona y por día;
//   - terminó una tarea marcada «Importante»: ése sí, al momento. También le llega a quien la cargó.
// Las cuentas salen de `resumirDia`, la misma del correo diario: el aviso y el correo dicen lo mismo.
import { corto } from './aviso-texto.core.js'
import { EQUIPO, resumirDia } from './correo-diario.core.js'

/** Quién recibe los avisos de «terminó». `AVISOS_AGENDA_A` en Vercel, separado por comas. */
export function quienesSeEnteran(env = process.env) {
  return String(env.AVISOS_AGENDA_A || 'Dario Arevalo').split(',').map((x) => x.trim()).filter(Boolean)
}

/**
 * Los avisos que dispara el tilde de `yo` sobre `item` en `fecha`. Devuelve `[{ para, titulo, cuerpo, url, tag }]`.
 * `items`/`hechos` son los de la base (con `datos`, `item_id`), y sólo hacen falta para el caso «todo».
 * ⛔ A quien tildó no se le avisa lo suyo.
 */
export function avisosAlTildar({ yo, item, fecha, hoy, items, hechos, para = quienesSeEnteran(), equipo = EQUIPO }) {
  const persona = equipo.find((p) => p.name === yo)
  const nombre = persona ? persona.nombre.split(' ')[0] : String(yo || 'Alguien')
  const sinMi = (xs) => [...new Set(xs)].filter((x) => x && x !== yo)
  const out = []

  if (item.datos && item.datos.importante) {
    const a = sinMi([...para, item.autor])
    if (a.length) out.push({ para: a, titulo: `⭐ ${nombre} terminó`, cuerpo: corto(item.titulo), url: '/agenda/equipo', tag: `importante-${item.id}-${fecha}` })
  }

  // «Todo lo de hoy» cuenta sólo las de HOY, como el correo: tildar una atrasada de ayer no cierra el día.
  if (persona && fecha === hoy) {
    const [r] = resumirDia({ hoy, items, hechos, equipo: [persona] })
    const a = sinMi(para)
    if (r && r.tareas.length && r.hechas === r.tareas.length && a.length) {
      const n = r.tareas.length
      out.push({ para: a, titulo: `✅ ${nombre}: tareas listas`, cuerpo: `${n} de ${n} hechas.`, url: '/agenda/equipo', tag: `todo-${persona.name}-${hoy}` })
    }
  }
  return out
}

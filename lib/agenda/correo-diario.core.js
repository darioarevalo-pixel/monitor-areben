/**
 * **El correo diario de la Agenda** (Darío, 18-oct-2026): al cierre del día, quién del equipo
 * operativo usó la Agenda, cuánto de lo suyo marcó y qué le quedó. Puro: recibe las filas de
 * `agenda_items` y `agenda_hechos` y devuelve asunto, texto y HTML. Lo manda `api/_agenda.js`
 * (`?tarea=correo-diario`, el reloj de Vercel). Ficha: `docs/secciones/agenda.md`.
 *
 * 🔑 Lo que pidió Darío: *«recibir alguna especie de notificación de si están usando o no la app»*.
 * Un aviso por cada entrada serían decenas por día; un correo al cierre se lee.
 *
 * ⚠️ **«Empezó a marcar» ⛔ no es «entró».** El Monitor no guarda cuándo entra cada una: la única
 * huella es el tilde (`hecho_at`). Quien abrió la Agenda y no marcó nada sale igual que quien no la
 * abrió, y el correo lo dice con esas palabras.
 *
 * Las reglas de un mail (todo inline, en tablas, Arial) son las de `lib/parte/html.core.js`.
 */

import { BASE } from '../parte/formato.core.js'
import { esParaMi } from '../novedades/destino.core.js'
import { aplicaEn } from './reglas.core.js'

/**
 * **El equipo que entra en el correo**, en el orden en que se lee (Darío, 18-oct-2026).
 *
 * 🔑 **Escrito acá y ⛔ no leído del padrón**, a propósito: el padrón vive en el KV de `bdi-catalogo`
 * y sólo se lee con la sesión de alguien —el reloj no tiene—. Y de yapa esta lista dice **quién
 * entra en el correo**, que es una decisión de Darío y no de los permisos.
 * `name` es el usuario del Monitor (`perfil.name`, la clave de los tildes); `funcion` y `cuenta`
 * son las del padrón (Config → Usuarios), para que `esParaMi` conteste lo mismo que la pantalla.
 * ⛔ Lo dirigido a una **sección** (`{tipo:'seccion'}`) no les cae acá: eso pide los permisos.
 */
export const EQUIPO = [
  { name: 'camilaquintana', nombre: 'Camila Quintana', lugar: 'Local Zattia · mañana', funcion: ['local'], cuenta: 'zattia' },
  { name: 'josefinabatter', nombre: 'Josefina Batter', lugar: 'Local Zattia · tarde', funcion: ['local'], cuenta: 'zattia' },
  { name: 'karenf', nombre: 'Karen Francischina', lugar: 'Local BDI · mañana', funcion: ['local'], cuenta: 'bdi' },
  { name: 'micaresolani', nombre: 'Micaela Resolani', lugar: 'Local BDI · tarde', funcion: ['local'], cuenta: 'bdi' },
  { name: 'agustinapiriz', nombre: 'Agustina Piriz', lugar: 'Depósito', funcion: ['deposito'], cuenta: null },
  { name: 'Lorena Reyes', nombre: 'Lorena Reyes', lugar: 'Administración', funcion: ['local', 'deposito', 'administracion'], cuenta: null },
]

const TZ = 'America/Argentina/Buenos_Aires'

const C = {
  pagina: '#eef0f4', carta: '#ffffff', borde: '#e5e7eb', tinta: '#111827', texto: '#374151', gris: '#6b7280',
  indigo: '#4f46e5', rojo: '#dc2626', rojoFondo: '#fef2f2', ambar: '#b45309', ambarFondo: '#fffbeb', verde: '#15803d', verdeFondo: '#f0fdf4',
}
const FUENTE = 'Arial,Helvetica,sans-serif'
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** El día de HOY en Argentina: el servidor está en UTC y a las 21:00 de acá ya es mañana. */
export function hoyAR(ahoraMs = Date.now()) {
  return new Date(ahoraMs - 3 * 3600_000).toISOString().slice(0, 10)
}

/** `HH:MM` en Argentina. */
export function horaAR(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
}

/** `sábado 18-oct` a partir de `2026-10-18`. */
export function diaLargo(fecha) {
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const [y, m, d] = String(fecha).split('-').map(Number)
  return `${DIA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}-${MES[m - 1]}`
}

/** ¿Le cae HOY este ítem a esta persona? Mismo criterio que «Hoy»: activo, no molde, su destino y su marca. */
function leToca(item, persona, hoy) {
  if (item.clase !== 'pendiente' || item.activo === false) return false
  if (item.datos && item.datos.plantilla) return false
  if (!aplicaEn(item.regla, hoy)) return false
  if (!esParaMi(item.destino, { name: persona.name, funcion: persona.funcion, cuenta: persona.cuenta || undefined })) return false
  const marcas = item.marcas || []
  return !marcas.length || !persona.cuenta || marcas.includes(persona.cuenta)
}

/**
 * Cómo le fue a cada una hoy.
 *
 * - `tareas`: lo que le cae hoy, con su tilde (el de la ocurrencia de HOY).
 * - `marcadas`: todo lo que ella tildó hoy —por la hora del tilde, en Argentina—, incluido lo que
 *   venía de días anteriores. 🔑 De ahí sale «empezó a marcar»: es la única huella de uso.
 * - `estado`: `al-dia` · `a-medias` · `nada` (tenía y no marcó) · `sin-tareas` (no tenía nada cargado).
 */
export function resumirDia({ hoy, items, hechos, equipo = EQUIPO }) {
  const porId = new Map(items.map((i) => [i.id, i]))
  return equipo.map((persona) => {
    const tareas = items
      .filter((i) => leToca(i, persona, hoy))
      .map((item) => ({ item, hecho: hechos.find((h) => h.item_id === item.id && h.fecha === hoy) || null }))
      .sort((a, b) => String(a.item.titulo).localeCompare(String(b.item.titulo), 'es'))
    const marcadas = hechos
      .filter((h) => h.usuario === persona.name && h.hecho_at && hoyAR(Date.parse(h.hecho_at)) === hoy)
      .sort((a, b) => String(a.hecho_at).localeCompare(String(b.hecho_at)))
    const hechas = tareas.filter((t) => t.hecho).length
    const deAntes = marcadas.filter((h) => h.fecha !== hoy).map((h) => porId.get(h.item_id)).filter(Boolean)
    const estado = !tareas.length ? (marcadas.length ? 'a-medias' : 'sin-tareas') : hechas === tareas.length ? 'al-dia' : marcadas.length || hechas ? 'a-medias' : 'nada'
    return {
      persona,
      tareas,
      hechas,
      faltan: tareas.filter((t) => !t.hecho).map((t) => t.item.titulo),
      primera: marcadas.length ? marcadas[0].hecho_at : null,
      ultima: marcadas.length ? marcadas[marcadas.length - 1].hecho_at : null,
      marcadasHoy: marcadas.length,
      deAntes: deAntes.map((i) => i.titulo),
      estado,
    }
  })
}

const PUNTO = { 'al-dia': '🟢', 'a-medias': '🟡', nada: '🔴', 'sin-tareas': '⚪' }

function linea(r) {
  if (r.estado === 'sin-tareas') return 'No tenía tareas cargadas para hoy.'
  const partes = []
  if (r.tareas.length) partes.push(`${r.hechas} de ${r.tareas.length} hechas`)
  partes.push(r.primera ? `empezó a marcar ${horaAR(r.primera)}${r.ultima && r.ultima !== r.primera ? ` · última ${horaAR(r.ultima)}` : ''}` : 'no marcó nada')
  return partes.join(' · ')
}

/** Asunto, texto y HTML del correo. */
export function armarCorreoDiario({ hoy, items, hechos, equipo = EQUIPO }) {
  const filas = resumirDia({ hoy, items, hechos, equipo })
  const alDia = filas.filter((r) => r.estado === 'al-dia').length
  const nada = filas.filter((r) => r.estado === 'nada').length
  const sinTareas = filas.filter((r) => r.estado === 'sin-tareas').length
  const conTareas = filas.length - sinTareas

  // Sin ninguna con tareas, «0 de 0 al día» no dice nada: se dice lo que pasa.
  const partes = conTareas ? [`${alDia} de ${conTareas} al día`] : ['nadie tenía tareas cargadas']
  if (nada) partes.push(`${nada} sin marcar nada`)
  if (sinTareas && conTareas) partes.push(`${sinTareas} sin tareas cargadas`)
  const asunto = `Agenda ${diaLargo(hoy)}: ${partes.join(' · ')}`

  const texto = [
    asunto,
    '',
    ...filas.flatMap((r) => [
      `${PUNTO[r.estado]} ${r.persona.nombre} (${r.persona.lugar}): ${linea(r)}`,
      ...r.faltan.map((t) => `     · pendiente: ${t}`),
      ...(r.deAntes.length ? [`     · además marcó ${r.deAntes.length} de días anteriores`] : []),
    ]),
    '',
    '«Empezó a marcar» es la hora del primer tilde: el Monitor no guarda cuándo entra cada una.',
    `${BASE}/agenda/equipo`,
  ].join('\n')

  const FONDO = { 'al-dia': C.verdeFondo, 'a-medias': C.ambarFondo, nada: C.rojoFondo, 'sin-tareas': '#f3f4f6' }
  const TINTA = { 'al-dia': C.verde, 'a-medias': C.ambar, nada: C.rojo, 'sin-tareas': C.gris }
  const bloques = filas.map((r) => `<tr><td style="padding:14px 20px;border-top:1px solid ${C.borde};font-family:${FUENTE}">
<div style="font-size:15px;font-weight:bold;color:${C.tinta}">${PUNTO[r.estado]} ${esc(r.persona.nombre)} <span style="font-weight:normal;font-size:12px;color:${C.gris}">${esc(r.persona.lugar)}</span></div>
<div style="margin:6px 0 0;padding:8px 10px;border-radius:8px;background:${FONDO[r.estado]};color:${TINTA[r.estado]};font-size:13px;font-weight:bold">${esc(linea(r))}</div>
${r.faltan.length ? `<div style="margin:8px 0 0;font-size:12px;color:${C.gris};text-transform:uppercase">Pendientes</div>${r.faltan.map((t) => `<div style="font-size:13px;color:${C.texto};padding:2px 0">· ${esc(t)}</div>`).join('')}` : ''}
${r.deAntes.length ? `<div style="margin:6px 0 0;font-size:12px;color:${C.gris}">Además marcó ${r.deAntes.length} de días anteriores.</div>` : ''}
</td></tr>`).join('\n')

  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${C.pagina}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.pagina}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.carta};border-radius:12px;border:1px solid ${C.borde}">
<tr><td style="padding:18px 20px 10px;font-family:${FUENTE}"><div style="font-size:12px;color:${C.gris};text-transform:uppercase;letter-spacing:.04em">Agenda · ${esc(diaLargo(hoy))}</div>
<div style="font-size:19px;font-weight:bold;color:${C.tinta};margin-top:4px">${esc(partes.join(' · '))}</div></td></tr>
${bloques}
<tr><td style="padding:12px 20px;border-top:1px solid ${C.borde};font-family:${FUENTE};font-size:12px;color:${C.gris}">«Empezó a marcar» es la hora del primer tilde: el Monitor no guarda cuándo entra cada una.</td></tr>
<tr><td style="padding:0 20px 18px;font-family:${FUENTE}"><a href="${BASE}/agenda/equipo" style="color:${C.indigo};text-decoration:none;font-weight:bold;font-size:13px">Ver el equipo en el Monitor →</a></td></tr>
</table></td></tr></table></body></html>`

  return { asunto, texto, html, filas }
}

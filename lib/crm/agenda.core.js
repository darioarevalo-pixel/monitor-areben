/**
 * Repartir los recontactos del CRM en días hábiles.
 *
 * # Por qué es `.core.js` y no `.ts`
 *
 * Lo consume `scripts/crm-agenda.mjs`, y los scripts corren en Node sin pasar por el
 * compilador de Next: no pueden importar TypeScript. Misma razón que
 * `lib/permisos.core.js` y `lib/calendario/fechas.core.js`.
 *
 * # Los feriados NO se escriben a mano
 *
 * Salen de `lib/calendario/fechas.core.js`, que ya sabe que San Martín es el **tercer
 * lunes** de agosto y no el 17 de agosto (art. 6 de la Ley 27.399). Hardcodear
 * "2026-08-17" daría bien este año y mal el que viene — es exactamente el error contra el
 * que advierte ese archivo. Como efecto de regalo, el goteo largo esquiva solo los
 * feriados de octubre, noviembre y diciembre sin que nadie los tenga que recordar.
 *
 * # Adentro de cada grupo, primero el que más compró
 *
 * No es un detalle cosmético: es la razón de ser del reparto. Los fríos son 571 y el
 * goteo tarda más de un mes, así que **el orden decide a quién se llama esta semana y a
 * quién dentro de cuarenta días**. Por monto descendente, los primeros días se llevan los
 * clientes que más plata dejaron — que es lo que se quiere levantar.
 */

import { sumarDias, diaDeSemanaDe } from '../calendario/fechas.core.js'
import { FECHAS_COMERCIALES, resolverComercial } from '../calendario/fechas.core.js'

/** Cortes de los grupos, en días desde la última compra. */
export const DIAS_ACTIVO = 60
export const DIAS_TIBIO = 180

/** Tope de seguridad para no colgar el proceso si alguien pasa un Set de feriados absurdo. */
const MAX_BUSQUEDA_DIAS = 400

/**
 * Los feriados nacionales de esos años, como Set de `YYYY-MM-DD`.
 *
 * Solo `tipo: 'feriado'`: las fechas comerciales (Hot Sale, Día del Niño) son días
 * hábiles normales, se trabaja igual.
 */
export function feriadosDe(anios) {
  const out = new Set()
  for (const f of FECHAS_COMERCIALES) {
    if (f.tipo !== 'feriado') continue
    for (const anio of anios) {
      const r = resolverComercial(f.clave, anio)
      if (r && r.fecha) out.add(r.fecha)
    }
  }
  return out
}

/** ¿Se trabaja ese día? Lunes a viernes y que no sea feriado. */
export function esHabil(fecha, feriados) {
  const dow = diaDeSemanaDe(fecha)
  if (dow === 0 || dow === 6) return false
  return !feriados.has(fecha)
}

/** El primer día hábil desde `fecha`, incluyéndola si ya lo es. */
export function proximoHabil(fecha, feriados) {
  let f = fecha
  for (let i = 0; i < MAX_BUSQUEDA_DIAS; i++) {
    if (esHabil(f, feriados)) return f
    f = sumarDias(f, 1)
  }
  throw new Error(`No apareció un día hábil en ${MAX_BUSQUEDA_DIAS} días desde ${fecha}`)
}

/** Los próximos `n` días hábiles desde `desde` (incluyéndolo si lo es). */
export function habilesDesde(desde, n, feriados) {
  const out = []
  let f = desde
  while (out.length < n) {
    f = proximoHabil(f, feriados)
    out.push(f)
    f = sumarDias(f, 1)
  }
  return out
}

/** En qué grupo cae un cliente según hace cuánto compró. Sin compras conocidas → frío. */
export function grupoDe(diasUltimo) {
  if (diasUltimo == null) return 'frio'
  if (diasUltimo < DIAS_ACTIVO) return 'activo'
  if (diasUltimo <= DIAS_TIBIO) return 'tibio'
  return 'frio'
}

/**
 * Reparte una tanda de clientes en días hábiles, `porDia` en cada uno.
 *
 * Devuelve `[{ id, fecha }]`. La lista entra YA ordenada por prioridad: el primero se
 * lleva el primer día.
 */
function repartir(ids, desde, porDia, feriados) {
  if (!ids.length) return []
  const dias = habilesDesde(desde, Math.ceil(ids.length / porDia), feriados)
  return ids.map((id, i) => ({ id, fecha: dias[Math.floor(i / porDia)] }))
}

/**
 * El plan completo.
 *
 * `clientes`: `[{ id, diasUltimo, total }]` — ya sin descartados, que no entran al
 * circuito y no se tocan.
 *
 * `config`: por grupo, `{ desde, porDia }`. `desde` se corre solo al próximo hábil, así
 * que se le puede pasar un sábado sin pensarlo.
 *
 * Devuelve `{ asignaciones, porFecha, porGrupo }`.
 */
export function planificarAgenda({ clientes, feriados, config }) {
  const grupos = { activo: [], tibio: [], frio: [] }
  for (const c of clientes) grupos[grupoDe(c.diasUltimo)].push(c)

  // Primero el que más compró. El desempate por id es lo que hace que dos corridas con
  // los mismos datos den el mismo plan — sin eso, dos clientes con el mismo monto
  // podrían cambiar de día entre la simulación y la aplicación.
  for (const g of Object.keys(grupos)) {
    grupos[g].sort((a, b) => (b.total || 0) - (a.total || 0) || a.id - b.id)
  }

  const asignaciones = []
  for (const g of ['activo', 'tibio', 'frio']) {
    const cfg = config[g]
    if (!cfg) continue
    const ids = grupos[g].map((c) => c.id)
    for (const a of repartir(ids, proximoHabil(cfg.desde, feriados), cfg.porDia, feriados)) {
      asignaciones.push({ ...a, grupo: g })
    }
  }

  const porFecha = new Map()
  for (const a of asignaciones) {
    const fila = porFecha.get(a.fecha) || { activo: 0, tibio: 0, frio: 0, total: 0 }
    fila[a.grupo]++
    fila.total++
    porFecha.set(a.fecha, fila)
  }

  return {
    asignaciones,
    porFecha: new Map([...porFecha.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    porGrupo: { activo: grupos.activo.length, tibio: grupos.tibio.length, frio: grupos.frio.length },
  }
}

/**
 * Aplica el plan sobre el mapa de seguimiento, devolviendo uno nuevo.
 *
 * Dos reglas que este archivo existe para hacer cumplir:
 *
 *  1. **Solo se toca `proximo_manual`.** `ultimo_contacto` es el registro real de cuándo
 *     se habló con cada uno y las `notas` son 39 escritas a mano sin backup: no se rozan.
 *  2. **La limpieza de fechas viejas alcanza a TODOS los que no entraron al plan, incluidos
 *     los descartados.** El llamador los saca del reparto —no se les asigna día— pero sus
 *     entradas sí llegan hasta acá, y si arrastran un vencimiento viejo se les pone en
 *     null. Es a propósito: el día que se reactive a uno, conviene que vuelva sin fecha y
 *     no figurando "vencido hace 40 días" por una fecha de cuando todavía se le vendía.
 *     Medido en la corrida del 13-ago-2026: 4 de los 27 descartados, y sólo ese campo.
 */
export function aplicarAgenda(crmSeg, asignaciones, hoy) {
  const out = { ...crmSeg }
  const nuevaFecha = new Map(asignaciones.map((a) => [String(a.id), a.fecha]))

  for (const k of new Set([...Object.keys(crmSeg), ...nuevaFecha.keys()])) {
    const base = crmSeg[k] || { cadencia: '', ultimo_contacto: null, proximo_manual: null, notas: [] }
    const notas = Array.isArray(base.notas) ? base.notas : []
    const asignada = nuevaFecha.get(k)
    if (asignada) {
      out[k] = { ...base, notas, proximo_manual: asignada }
    } else if (base.proximo_manual && base.proximo_manual < hoy) {
      out[k] = { ...base, notas, proximo_manual: null }
    }
  }
  return out
}

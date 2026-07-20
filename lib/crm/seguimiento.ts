/**
 * Escrituras del seguimiento del CRM (`crm:seg:<marca>`), como transformaciones
 * PURAS e inmutables del mapa. Port de las funciones `crmSet…`, `crmAgregarNota`,
 * `crmBorrarNota` y `crmSugerirCadencias` (index.html:13452-13580) sin el DOM ni
 * el POST — cada una devuelve un mapa nuevo y el que persiste es la capa de arriba.
 *
 * **El dato más delicado de todo el monitor**: 305 clientes, 274 ★, 39 notas a
 * mano, sin backup. Cada op toca UN cliente; el POST del mapa entero (con el flag
 * `cargado`) es lo que evita el borrado en masa. La verificación en prod es que
 * el diff contra el dump sea exactamente el cliente tocado.
 */

import { addDiasISO, segmentoCliente, TOP_LIMIT } from './core'
import type { ClienteCRM, MapaSeguimiento, Seguimiento } from './tipos'

/** Fecha local YYYY-MM-DD. Port de hoyISO (13279): usa el día REAL, no el TODAY
 *  congelado, para que "Hablé hoy" y las notas no queden con fecha vieja. */
export function hoyISO(today: Date = new Date()): string {
  return (
    today.getFullYear() +
    '-' +
    String(today.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(today.getDate()).padStart(2, '0')
  )
}

/**
 * Garantiza la entrada del cliente en una COPIA del mapa. Port de crmSegRef
 * (13445): entrada nueva → defaults completos; entrada existente → se respeta tal
 * cual, solo se asegura que `notas` sea array. Así el diff contra el dump no suma
 * claves de más en clientes que no se tocaron.
 */
function conEntrada(crmSeg: MapaSeguimiento, id: number | string): { mapa: MapaSeguimiento; k: string } {
  const k = String(id)
  const existe = !!crmSeg[k]
  const base: Seguimiento = existe
    ? crmSeg[k]
    : { cadencia: '', ultimo_contacto: null, proximo_manual: null, notas: [] }
  const notas = Array.isArray(base.notas) ? base.notas : []
  return { mapa: { ...crmSeg, [k]: { ...base, notas } }, k }
}

/** Aplica un patch a la entrada del cliente, devolviendo un mapa nuevo. */
function conPatch(crmSeg: MapaSeguimiento, id: number | string, patch: Partial<Seguimiento>): MapaSeguimiento {
  const { mapa, k } = conEntrada(crmSeg, id)
  return { ...mapa, [k]: { ...mapa[k], ...patch } }
}

export const setCadencia = (crmSeg: MapaSeguimiento, id: number | string, value: string) =>
  conPatch(crmSeg, id, { cadencia: value || '' })

export const setMayorista = (crmSeg: MapaSeguimiento, id: number | string, value: boolean) =>
  conPatch(crmSeg, id, { es_mayorista: !!value })

export const setPagina = (crmSeg: MapaSeguimiento, id: number | string, value: string) =>
  conPatch(crmSeg, id, { pagina: (value || '').trim() })

export const setDescartado = (crmSeg: MapaSeguimiento, id: number | string, value: boolean) =>
  conPatch(crmSeg, id, { descartado: !!value })

export const setDifusion = (crmSeg: MapaSeguimiento, id: number | string, value: boolean) =>
  conPatch(crmSeg, id, { en_difusion: !!value })

/** "Hablé hoy": registra contacto y deja que el próximo lo recalcule la cadencia. */
export const hableHoy = (crmSeg: MapaSeguimiento, id: number | string, today?: Date) =>
  conPatch(crmSeg, id, { ultimo_contacto: hoyISO(today), proximo_manual: null })

/** "Le escribí hoy": fija el próximo a hoy + `dias`. */
export const escribiHoy = (crmSeg: MapaSeguimiento, id: number | string, dias: number, today?: Date) => {
  const hoy = hoyISO(today)
  return conPatch(crmSeg, id, { ultimo_contacto: hoy, proximo_manual: addDiasISO(hoy, dias) })
}

export const setProximoManual = (crmSeg: MapaSeguimiento, id: number | string, value: string) =>
  conPatch(crmSeg, id, { proximo_manual: value || null })

/** Agrega una nota y reordena por fecha desc (sort estable: conserva el orden de
 *  carga entre notas del mismo día). Port de crmAgregarNota (13537). */
export function agregarNota(crmSeg: MapaSeguimiento, id: number | string, texto: string, fecha: string): MapaSeguimiento {
  const { mapa, k } = conEntrada(crmSeg, id)
  const notas = [{ fecha, texto }, ...(mapa[k].notas || [])].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
  return { ...mapa, [k]: { ...mapa[k], notas } }
}

/** Borra la nota en el índice `idx`. Port de crmBorrarNota (13553). */
export function borrarNota(crmSeg: MapaSeguimiento, id: number | string, idx: number): MapaSeguimiento {
  const { mapa, k } = conEntrada(crmSeg, id)
  const notas = (mapa[k].notas || []).filter((_, i) => i !== idx)
  return { ...mapa, [k]: { ...mapa[k], notas } }
}

// ── Sugerir cadencias (escritura masiva) ──────────────────────────────────────

export type Sugerencia = { id: number; cad: string }
export type PlanCadencias = { plan: Sugerencia[]; omitidos: number; nSem: number; nMen: number }

/**
 * Planifica las cadencias a asignar SIN tocar el mapa (así, si se cancela, no
 * cambia nada). Port de crmSugerirCadencias (13560): top por monto → semanal;
 * activos recurrentes → mensual; respeta lo que ya tiene cadencia.
 */
export function planSugerirCadencias(agregado: ClienteCRM[], crmSeg: MapaSeguimiento): PlanCadencias {
  const topIds = new Set(
    [...agregado].sort((a, b) => b.total_amount - a.total_amount).slice(0, TOP_LIMIT).map((c) => String(c.id)),
  )
  const plan: Sugerencia[] = []
  let omitidos = 0
  for (const c of agregado) {
    const actual = crmSeg[String(c.id)]
    if (actual && actual.cadencia) {
      omitidos++
      continue
    }
    if (topIds.has(String(c.id))) plan.push({ id: c.id, cad: 'semanal' })
    else if (segmentoCliente(c) === 'activos') plan.push({ id: c.id, cad: 'mensual' })
  }
  return { plan, omitidos, nSem: plan.filter((p) => p.cad === 'semanal').length, nMen: plan.filter((p) => p.cad === 'mensual').length }
}

/** Aplica el plan de cadencias al mapa (inmutable). */
export function aplicarSugerencias(crmSeg: MapaSeguimiento, plan: Sugerencia[]): MapaSeguimiento {
  return plan.reduce((m, p) => setCadencia(m, p.id, p.cad), crmSeg)
}

// ── Carga de teléfonos (crm:tel) ──────────────────────────────────────────────

/**
 * Parsea el AOA del Excel de clientes de GN a un mapa id→teléfono, filtrando a
 * los clientes del CRM. Port de la parte pura de crmCargarTelefonos (13157).
 * La lectura del Excel (XLSX) queda en el componente; acá va la lógica testeable.
 */
export function parsearTelefonos(
  aoa: unknown[][],
  idsCRM: Set<string>,
  normalizar: (t: string) => string,
): { ok: true; map: Record<string, string>; vinculados: number } | { ok: false; motivo: string } {
  const hdr = (aoa[0] || []).map((h) => String(h ?? '').trim().toLowerCase())
  const ci = (n: string) => hdr.indexOf(n)
  const cId = ci('id_interno') >= 0 ? ci('id_interno') : ci('id')
  const cCel = ci('celular')
  const cTel = ci('telefono')
  if (cId < 0 || (cCel < 0 && cTel < 0)) {
    return { ok: false, motivo: 'El archivo no tiene las columnas esperadas (id_interno y celular/telefono). ¿Es el export de clientes de GN?' }
  }
  const map: Record<string, string> = {}
  let vinculados = 0
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i]
    if (!row) continue
    const id = String(row[cId] ?? '').trim()
    if (!id || !idsCRM.has(id)) continue
    const tel = String((cCel >= 0 && row[cCel]) || (cTel >= 0 && row[cTel]) || '').trim()
    if (tel && normalizar(tel)) {
      map[id] = tel
      vinculados++
    }
  }
  if (!vinculados) return { ok: false, motivo: 'No se encontraron teléfonos para los clientes del CRM en ese archivo.' }
  return { ok: true, map, vinculados }
}

/**
 * Leads del CRM: prospectos con local a los que se les habla y todavía no
 * compraron. Port de index.html:13936-14247.
 *
 * Viven en `crm:leads:bdi`. Hoy son **11** (medido con `crm-kv.mjs --dump`,
 * 17-jul-2026): pocos, pero cargados a mano y sin otra copia en ningún lado.
 *
 * `leadEstadoSeg` es la misma lógica que `estadoSeguimiento` de core.ts, pero
 * sobre el lead en vez de sobre el mapa de seguimiento. **Se portan las dos por
 * separado, como están.** Unificarlas es tentador y sería arreglar lógica en medio
 * de un port: si divergen en algo, se descubre después y con su propia
 * verificación, no acá.
 */

import { addDiasISO, CADENCIA_DIAS, diasHasta } from './core'
import type { EstadoSeg, Nota } from './tipos'

export type EstadoLead = 'activo' | 'comprado' | 'descartado'

export const LEAD_ESTADO_LABEL: Record<EstadoLead, string> = {
  activo: '🔥 Activo',
  comprado: '✓ Compró',
  descartado: '✕ Descartado',
}

/** La forma exacta que crea leadsRef (13974). */
export type Lead = {
  id: string
  nombre: string
  telefono: string
  instagram: string
  ciudad: string
  estado: EstadoLead
  cadencia: string
  ultimo_contacto: string | null
  proximo_manual: string | null
  notas: Nota[]
  creado: string
}

export type MapaLeads = Record<string, Lead>

export type SegLead = {
  proximo: string | null
  estado: EstadoSeg
  dias: number | null
}

/** leadsNewId (13952). Recibe `ahora` para no depender del reloj y poder testearlo. */
export function nuevoIdLead(ahora: number, rnd: number): string {
  return 'l' + ahora + '_' + Math.floor(rnd * 100000)
}

/** hoyISO (13271): la fecha REAL del momento, no la de TODAY congelada al cargar. */
export function hoyISO(hoy: Date = new Date()): string {
  return hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0')
}

/** leadsRef (13973): el default de un lead nuevo, con las notas siempre array. */
export function leadNuevo(id: string, hoy: Date = new Date()): Lead {
  return {
    id,
    nombre: '',
    telefono: '',
    instagram: '',
    ciudad: '',
    estado: 'activo',
    cadencia: '',
    ultimo_contacto: null,
    proximo_manual: null,
    notas: [],
    creado: hoyISO(hoy),
  }
}

/** leadEstadoSeg (13980). Misma forma que estadoSeguimiento, sobre el lead. */
export function leadEstadoSeg(lead: Lead, today: Date): SegLead {
  const cad = lead.cadencia || ''
  let proximo: string | null = lead.proximo_manual || null
  if (!proximo && cad && lead.ultimo_contacto) proximo = addDiasISO(lead.ultimo_contacto, CADENCIA_DIAS[cad] || 30)
  if (!cad && !proximo) return { proximo: null, estado: 'none', dias: null }
  const dias = proximo ? diasHasta(proximo, today) : null
  let estado: EstadoSeg
  if (!proximo) estado = 'pendiente'
  else if ((dias as number) <= 0) estado = 'vencido'
  else if ((dias as number) <= 7) estado = 'semana'
  else estado = 'aldia'
  return { proximo, estado, dias }
}

/** leadInstaHref (14012). */
export function leadInstaHref(v: string | null | undefined): string {
  const s = (v || '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  return 'https://instagram.com/' + s.replace(/^@/, '')
}

export type OpcionesLeads = {
  /** Ya trimmeado y en minúsculas. */
  q: string
  /** El check "Ver archivados": muestra los que NO están activos. */
  verArchivados: boolean
  today: Date
}

export type LeadConSeg = Lead & { _seg: SegLead }

/**
 * leadsRender (14017), sin el DOM: qué leads y en qué orden.
 *
 * El orden es por urgencia del próximo contacto y después por nombre, con
 * `localeCompare(..., 'es')` — que ordena la ñ y los acentos como se espera en
 * castellano. Sin el locale, el orden cambia.
 */
export function filtrarLeads(leads: MapaLeads, { q, verArchivados, today }: OpcionesLeads): LeadConSeg[] {
  let lista = Object.values(leads).filter((l) => (verArchivados ? l.estado !== 'activo' : l.estado === 'activo'))

  if (q) {
    lista = lista.filter(
      (l) =>
        (l.nombre || '').toLowerCase().includes(q) ||
        (l.telefono || '').toLowerCase().includes(q) ||
        (l.instagram || '').toLowerCase().includes(q),
    )
  }

  const ord: Record<string, number> = { vencido: 0, pendiente: 1, semana: 2, aldia: 3, none: 4 }
  const conSeg: LeadConSeg[] = lista.map((l) => ({ ...l, _seg: leadEstadoSeg(l, today) }))
  conSeg.sort((a, b) => ord[a._seg.estado] - ord[b._seg.estado] || (a.nombre || '').localeCompare(b.nombre || '', 'es'))
  return conSeg
}

// ── Mutaciones ───────────────────────────────────────────────────────────────
// El legacy muta leadsData en el lugar y llama a leadsGuardar (14177-14247).
// Acá devuelven un mapa nuevo: React necesita otra referencia, y así el guardado
// recibe exactamente lo que se va a mostrar.

function conLead(leads: MapaLeads, id: string, f: (l: Lead) => Lead): MapaLeads {
  const actual = leads[id]
  if (!actual) return leads
  return { ...leads, [id]: f({ ...actual, notas: Array.isArray(actual.notas) ? actual.notas : [] }) }
}

/** leadsSetCampo (14177). */
export function setCampo(leads: MapaLeads, id: string, campo: 'nombre' | 'telefono' | 'instagram' | 'ciudad', val: string): MapaLeads {
  return conLead(leads, id, (l) => ({ ...l, [campo]: val }))
}

/** leadsSetCadencia (14185). */
export function setCadencia(leads: MapaLeads, id: string, val: string): MapaLeads {
  return conLead(leads, id, (l) => ({ ...l, cadencia: val }))
}

/**
 * leadsHableHoy (14191): marca el contacto de hoy y **limpia la fecha manual**,
 * para que el próximo lo calcule la cadencia. Si no se limpiara, la fecha vieja
 * seguiría mandando.
 */
export function hableHoy(leads: MapaLeads, id: string, hoy: Date = new Date()): MapaLeads {
  return conLead(leads, id, (l) => ({ ...l, ultimo_contacto: hoyISO(hoy), proximo_manual: null }))
}

/** leadsSetProximoManual (14197). */
export function setProximoManual(leads: MapaLeads, id: string, val: string): MapaLeads {
  return conLead(leads, id, (l) => ({ ...l, proximo_manual: val || null }))
}

/** leadsAgregarNota (14203): las notas se guardan más nueva primero. */
export function agregarNota(leads: MapaLeads, id: string, texto: string, hoy: Date = new Date()): MapaLeads {
  const t = texto.trim()
  if (!t) return leads
  return conLead(leads, id, (l) => ({ ...l, notas: [{ fecha: hoyISO(hoy), texto: t }, ...l.notas] }))
}

/**
 * leadsBorrarNota (14216).
 *
 * ⚠️ Borra **por índice posicional**, igual que el legacy, y las notas no tienen
 * id. Si la lista que ve el usuario está ordenada distinto de la que está
 * guardada, se borra la nota equivocada — sin confirmación y sin deshacer. Se
 * porta así, y el componente NO reordena antes de mostrar. Arreglarlo (darles id)
 * es un cambio de datos y va aparte.
 */
export function borrarNota(leads: MapaLeads, id: string, idx: number): MapaLeads {
  return conLead(leads, id, (l) => ({ ...l, notas: l.notas.filter((_, i) => i !== idx) }))
}

/** leadsMarcarComprado / leadsDescartar / leadsReactivar (14222-14241). */
export function setEstado(leads: MapaLeads, id: string, estado: EstadoLead): MapaLeads {
  return conLead(leads, id, (l) => ({ ...l, estado }))
}

/** leadsEliminar (14241). Irreversible: el KV no tiene papelera. */
export function eliminar(leads: MapaLeads, id: string): MapaLeads {
  const out = { ...leads }
  delete out[id]
  return out
}

/** leadsAgregar (14067). */
export function agregar(leads: MapaLeads, id: string, hoy: Date = new Date()): MapaLeads {
  return { ...leads, [id]: leadNuevo(id, hoy) }
}

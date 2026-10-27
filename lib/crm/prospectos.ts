/**
 * Mapa de locales del CRM, del lado del navegador (`/api/datos?recurso=prospectos`).
 *
 * Son los locales sacados de Google Maps que todavía no compran ni son leads. Viven sólo acá
 * —«Sin contactar»— hasta que responden: ahí pasan a Leads (`crm:leads:bdi`) con `aLead`, y el
 * local queda atado por `lead_id`. ⛔ No entran al panel de WhatsApp hasta ese momento.
 */
import { apiFetch } from '@/lib/api-fetch'
import { agregar, agregarNota, leadsPorTelefono, setCampo, type MapaLeads } from './leads'
import { ESTADO_LABEL, MEDIO_LABEL, elegirParaTanda as elegirCore, resumenTanda as resumenCore } from './prospectos.core.js'

export { ESTADOS, ESTADO_LABEL, MAX_TANDA, MEDIOS, MEDIO_LABEL } from './prospectos.core.js'

export type EstadoProspecto = 'sin_contactar' | 'contactado' | 'respondio' | 'descartado'
export type Medio = 'whatsapp' | 'llamada' | 'instagram' | 'correo'

export type Prospecto = {
  id: string
  nombre: string
  rubro: string | null
  direccion: string | null
  ciudad: string | null
  lat: number | null
  lng: number | null
  telefono: string | null
  tel_maps: string | null
  whatsapp_seguro: boolean
  instagram: string | null
  facebook: string | null
  web: string | null
  correo: string | null
  estrellas: number | null
  resenas: number | null
  estado: EstadoProspecto
  ultimo_contacto: string | null
  ultimo_medio: Medio | null
  lead_id: string | null
  tanda_id: number | null
}

export type Tanda = { id: number; nombre: string; creada_en: string; por: string | null }

export type EventoProspecto = {
  id: number
  local_id: string
  en: string
  tipo: 'contacto' | 'estado' | 'nota'
  medio: Medio | null
  estado: EstadoProspecto | null
  texto: string | null
  por: string | null
}

const API = '/api/datos?recurso=prospectos'

async function leerJson(r: Response) {
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.ok) throw new Error(j.error || `Error ${r.status}`)
  return j
}

export async function cargarProspectos(): Promise<{
  locales: Prospecto[]
  eventos: EventoProspecto[]
  tandas: Tanda[]
  sinTabla: boolean
  sinTandas: boolean
}> {
  const j = await leerJson(await apiFetch(API))
  return { locales: j.locales, eventos: j.eventos, tandas: j.tandas || [], sinTabla: !!j.sinTabla, sinTandas: !!j.sinTandas }
}

export async function crearTanda(nombre: string, ids: string[]): Promise<{ tanda: Tanda; locales: Prospecto[] }> {
  const j = await leerJson(
    await apiFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recurso: 'prospectos', action: 'tanda', nombre, ids }) }),
  )
  return { tanda: j.tanda, locales: j.locales }
}

export const elegirParaTanda = elegirCore as (locales: Prospecto[], o: { ciudad?: string; cantidad: number }) => Prospecto[]

export type ResumenTanda = { locales: number; contactados: number; respondieron: number; descartados: number }
export const resumenTanda = resumenCore as (locales: Prospecto[], tandaId: number) => ResumenTanda

export type CuerpoAccion =
  | { action: 'contacto'; id: string; medio: Medio }
  | { action: 'estado'; id: string; estado: EstadoProspecto; lead_id?: string; texto?: string }
  | { action: 'nota'; id: string; texto: string }

export async function accionProspecto(b: CuerpoAccion): Promise<{ local: Prospecto; evento: EventoProspecto }> {
  const j = await leerJson(
    await apiFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recurso: 'prospectos', ...b }) }),
  )
  return { local: j.local, evento: j.evento }
}

// ── Lo que se muestra ────────────────────────────────────────────────────────

/** Los enlaces de cada medio. `null` = el local no tiene ese dato. */
export function enlaces(p: Prospecto): Record<Medio, string | null> {
  const tel = (p.telefono || '').replace(/\D/g, '')
  const ig = (p.instagram || '').replace(/^@/, '').trim()
  return {
    whatsapp: tel ? `https://wa.me/${tel}` : null,
    llamada: tel ? `tel:+${tel}` : null,
    instagram: ig ? `https://www.instagram.com/${encodeURIComponent(ig)}/` : null,
    correo: p.correo ? `mailto:${p.correo}` : null,
  }
}

export function enlaceMaps(p: Prospecto): string | null {
  const q = [p.nombre, p.direccion, p.ciudad].filter(Boolean).join(' ')
  if (q) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
  if (p.lat == null || p.lng == null) return null
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
}

export type FiltroProspectos = { ciudad: string; estado: EstadoProspecto | 'todos'; q: string; tanda?: number | 'todas' }

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filtrarProspectos(lista: Prospecto[], f: FiltroProspectos): Prospecto[] {
  const q = sinTildes(f.q.trim())
  return lista.filter(
    (p) =>
      (f.ciudad === 'todas' || p.ciudad === f.ciudad) &&
      (f.estado === 'todos' || p.estado === f.estado) &&
      (f.tanda == null || f.tanda === 'todas' || p.tanda_id === f.tanda) &&
      (!q || sinTildes(`${p.nombre} ${p.direccion || ''} ${p.instagram || ''} ${p.telefono || ''}`).includes(q)),
  )
}

/** Cuántos hay por estado, sobre la lista ya filtrada por ciudad. */
export function contarPorEstado(lista: Prospecto[]): Record<EstadoProspecto, number> {
  const n: Record<EstadoProspecto, number> = { sin_contactar: 0, contactado: 0, respondio: 0, descartado: 0 }
  for (const p of lista) n[p.estado] = (n[p.estado] || 0) + 1
  return n
}

/** Las ciudades, de la que más locales tiene a la que menos. */
export function ciudades(lista: Prospecto[]): { ciudad: string; n: number }[] {
  const m = new Map<string, number>()
  for (const p of lista) if (p.ciudad) m.set(p.ciudad, (m.get(p.ciudad) || 0) + 1)
  return [...m.entries()].map(([ciudad, n]) => ({ ciudad, n })).sort((a, b) => b.n - a.n)
}

/** Una línea del historial. */
export function textoEvento(e: EventoProspecto): string {
  if (e.tipo === 'contacto') return `Contactado por ${MEDIO_LABEL[e.medio as Medio] || e.medio}`
  if (e.tipo === 'estado') return `Pasó a ${ESTADO_LABEL[e.estado as EstadoProspecto] || e.estado}` + (e.texto ? ` · ${e.texto}` : '')
  return e.texto || ''
}

// ── El paso a Leads ──────────────────────────────────────────────────────────

/**
 * El lead que ya existe con el teléfono del local, si hay. 🔴 Antes de crear se mira: un local que
 * se cargó a mano como lead desde el panel no puede quedar dos veces (ya pasó con «Maximo»).
 */
export function leadExistente(leads: MapaLeads, p: Prospecto): string | null {
  if (!p.telefono) return null
  const r = leadsPorTelefono(leads, p.telefono)
  return r.leads.length === 1 ? r.leads[0].id : null
}

/**
 * El PATCH que crea el lead desde el local. Se pasa a `guardarLeadsConRelectura`, que lo aplica
 * sobre el mapa recién leído. Nace agendado (`agregar`), con los datos del local y una nota que
 * dice de dónde vino.
 */
export function patchLeadDesdeProspecto(p: Prospecto, id: string, hoy: Date = new Date()) {
  return (m: MapaLeads): MapaLeads => {
    let r = agregar(m, id, hoy)
    r = setCampo(r, id, 'nombre', p.nombre)
    if (p.telefono) r = setCampo(r, id, 'telefono', p.telefono)
    if (p.instagram) r = setCampo(r, id, 'instagram', p.instagram)
    if (p.ciudad) r = setCampo(r, id, 'ciudad', p.ciudad)
    const medio = p.ultimo_medio ? ` (le habíamos escrito por ${MEDIO_LABEL[p.ultimo_medio]})` : ''
    return agregarNota(r, id, `Vino del mapa de locales: respondió${medio}.`, hoy)
  }
}

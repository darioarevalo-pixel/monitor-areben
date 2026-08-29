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

import { addDiasISO, diaHabil, diasHasta } from './core'
import { cola, normalizeArgPhone } from './telefono.core.js'
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

/**
 * leadEstadoSeg (13980). Misma forma que estadoSeguimiento, sobre el lead: **la fecha que se
 * puso a mano y nada más**.
 *
 * 🔴 La cadencia salió el 24-ago-2026, acá también y por decisión de Bruno: *"lo sacaría también
 * al de leads y le pondría la fecha del próximo recontacto; eso lo elijo yo al momento de ver si
 * está frío o caliente"*. En un prospecto es todavía más claro que en un cliente — no hay historia
 * de compras de la cual salga ningún ritmo, así que la única que sabe cuándo volver es la persona
 * que acaba de hablar con él.
 *
 * Medido ese día: de 31 leads activos, la cadencia le calculaba la fecha a **2**. Esos dos quedan
 * sin fecha, o sea "sin agendar" — y **siguen entrando en la lista del día**, que es justamente
 * donde se les pone una.
 */
export function leadEstadoSeg(lead: Lead, today: Date): SegLead {
  const proximo: string | null = lead.proximo_manual || null
  if (!proximo) return { proximo: null, estado: 'none', dias: null }
  // `proximo` ya se sabe no vacío: `diasHasta` sólo devuelve null cuando no hay fecha.
  const dias = diasHasta(proximo, today) as number
  const estado: EstadoSeg = dias <= 0 ? 'vencido' : dias <= 7 ? 'semana' : 'aldia'
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

/**
 * Los leads que entran en la lista del día, con el MISMO criterio que los clientes
 * (`filtrarOrdenar` + `FILTROS_POR_DIA` de core.ts).
 *
 * 🔑 **Por qué existe.** Medido el 23-ago-2026: hay 37 leads cargados y **sólo 4 tienen un
 * contacto registrado**. No es que no sirvan —6 de los 37 ya compraron—, es que viven en una
 * pestaña aparte, sin fechas ni "para hoy", así que en el momento de trabajar no aparecen. Un
 * prospecto que no entra en la lista del día no se contacta nunca.
 *
 * ⚠️ **Sólo los activos.** El que ya compró es cliente y sale por el otro lado; el descartado
 * se descartó.
 *
 * ⚠️ **Los leads no tienen temperatura**, así que la regla de "al frío no se le escribe" no los
 * toca. Un lead recién cargado es, por definición, alguien con quien se está hablando.
 *
 * 🔑 **El lead SIN AGENDAR (`none`) entra igual, y es la mitad del problema.** Medido el
 * 23-ago-2026: de 28 leads activos, **25 no tienen ni cadencia ni fecha** — vienen del CRM viejo,
 * donde cargarlos no obligaba a agendarlos. En un cliente, `none` significa "no está en
 * seguimiento" y se lo deja afuera; en un lead activo significa "lo cargaste para hablarle y
 * nunca le pusiste fecha", que es justo el que hay que rescatar. Van al final de la lista, que
 * es donde `filtrarLeads` ya los deja.
 */
export function leadsDelDia(
  leads: MapaLeads,
  { seg, hoy, manana, today }: { seg: string; hoy?: string; manana?: string; today: Date },
): LeadConSeg[] {
  const lista = filtrarLeads(leads, { q: '', verArchivados: false, today })
  const sinAgendar = (l: LeadConSeg) => l._seg.estado === 'none' || l._seg.estado === 'pendiente'
  if (seg === 'atrasados') return lista.filter((l) => sinAgendar(l) || (!!l._seg.proximo && !!hoy && l._seg.proximo < hoy))
  if (seg === 'hoy') return lista.filter((l) => !!hoy && l._seg.proximo === hoy)
  if (seg === 'manana') return lista.filter((l) => !!manana && l._seg.proximo === manana)
  if (seg === 'semana') return lista.filter((l) => l._seg.estado === 'vencido' || l._seg.estado === 'semana' || sinAgendar(l))
  return []
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

/**
 * leadsSetProximoManual (14197). Pasa por `diaHabil`: ningún próximo contacto cae en fin de semana.
 */
export function setProximoManual(leads: MapaLeads, id: string, val: string): MapaLeads {
  return conLead(leads, id, (l) => ({ ...l, proximo_manual: val ? diaHabil(val) : null }))
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

/** Con cuántos días de plazo nace un prospecto cargado desde la pestaña Leads. */
export const PLAZO_LEAD_NUEVO = 7

/**
 * leadsAgregar (14067). **Nace agendado**, no en blanco.
 *
 * 🔴 **Un prospecto sin fecha no entra en ninguna cola de trabajo**, así que se carga y ahí queda:
 * medido el 29-ago-2026, **29 de 37 activos** no tenían ninguna. La pestaña no tiene formulario de
 * alta —crea el lead y abre su ficha—, así que acá la fecha no se puede preguntar: se pone, queda
 * a la vista en la ficha que se abre y se corre de un toque. En el panel de WhatsApp, que sí tiene
 * formulario, **se pregunta** (ver `NuevoLead`).
 *
 * ⚠️ Esto no reintroduce la cadencia automática, que salió el 24-ago-2026: no calcula un ritmo a
 * partir de nada, pone un plazo por defecto que se cambia en el acto.
 */
export function agregar(leads: MapaLeads, id: string, hoy: Date = new Date()): MapaLeads {
  // `setProximoManual` ya corre el fin de semana al lunes.
  return setProximoManual({ ...leads, [id]: leadNuevo(id, hoy) }, id, addDiasISO(hoyISO(hoy), PLAZO_LEAD_NUEVO))
}

// ── Encontrar el lead del chat abierto ───────────────────────────────────────

/**
 * ¿De qué lead es este teléfono?
 *
 * 🔴 **Existe porque el panel de WhatsApp no miraba acá.** Buscaba en el padrón, después en
 * `crm:tel`, y si no aparecía daba el número por desconocido **y ofrecía cargarlo como lead otra
 * vez**. Medido el 24-ago-2026 sobre los 40 leads reales: **2 números ya están duplicados**
 * ("Maximo"/"Maximo Valdiviezo", "Ximena"/"Ximena") — el mismo prospecto cargado dos veces porque
 * al volver a su chat el panel no lo reconocía. Y 25 de los 31 activos no tienen ninguna fecha,
 * porque desde el chat no había forma de ponérsela.
 *
 * Cruza con el mismo criterio que los clientes (`telefono.core.js`): exacto primero, últimos 8
 * dígitos después. **Devuelve TODOS los que coinciden**, no el primero: con dos candidatos hay que
 * preguntar, porque elegir solo es anotar el contacto en la ficha de otro, en silencio.
 */
export function leadsPorTelefono(leads: MapaLeads, tel: string): { leads: Lead[]; via: string } {
  const lista = Object.values(leads)

  /**
   * ⚠️ **No se usa `indexarTelefonos`, y no es por gusto.** Ese índice descarta toda fila sin id
   * numérico entero, y los ids de los leads son texto (`l1756…_12345`): pasarlos por ahí devuelve
   * vacío SIEMPRE, sin error y sin aviso. Es el mismo cruce de dos pasos, a mano, sobre 40
   * prospectos — no sobre los 12.500 del padrón, que es para lo que existe el índice.
   */
  const n = normalizeArgPhone(tel)
  if (n) {
    const exacto = lista.filter((l) => normalizeArgPhone(l.telefono || '') === n)
    if (exacto.length) return { leads: exacto, via: 'exacto' }
  }
  const c = cola(tel)
  if (c) {
    const aprox = lista.filter((l) => cola(l.telefono || '') === c)
    if (aprox.length) return { leads: aprox, via: 'cola' }
  }
  return { leads: [], via: '' }
}

/**
 * "Le escribí hoy, recordarme en N días" para un lead.
 *
 * Es el gemelo de `escribiHoy` de `seguimiento.ts`, que los leads no tenían: `hableHoy` marca el
 * contacto y deja que la cadencia calcule el próximo, y `setProximoManual` fija la fecha sin marcar
 * contacto. Los botones del panel necesitan **las dos cosas de un saque**, que es lo que hace el
 * botón equivalente del cliente.
 *
 * ⚠️ El orden importa: `hableHoy` limpia `proximo_manual` (para que mande la cadencia), así que la
 * fecha se fija DESPUÉS o se pierde.
 */
export function escribiHoyLead(leads: MapaLeads, id: string, dias: number, hoy: Date = new Date()): MapaLeads {
  // `setProximoManual` ya corre el fin de semana al lunes.
  return setProximoManual(hableHoy(leads, id, hoy), id, addDiasISO(hoyISO(hoy), dias))
}

/**
 * Los prospectos que hay que contactar, para el panel de WhatsApp (29-ago-2026).
 *
 * 🔴 **Existe porque en el panel los leads no aparecían: ni uno.** La solapa "Hoy" se armaba sólo
 * con `crm:seg` —clientes— y el bloque "Leads para contactar" vive en la sección Clientes del
 * monitor, que es justo la pantalla que no se mira mientras se atiende WhatsApp. Un prospecto que
 * no aparece donde se trabaja no se contacta nunca, que es el mismo problema que `leadsDelDia`
 * vino a resolver del otro lado.
 *
 * El corte es el del panel, no el de la sección: **lo que ya vence** (incluido HOY, que
 * `atrasados` deja afuera) **más los que no tienen fecha**. Esos últimos son la mitad del padrón
 * —29 de 37 activos el 29-ago-2026— y van al final: sin fecha no hay atraso que medir.
 *
 * ⚠️ **Los leads no tienen temperatura**, así que los botones 🔥/🟡/⚪/🧊 no los tocan: es un
 * bloque aparte, abajo, y por eso esta función no recibe filtro.
 */
export function leadsDelPanel(leads: MapaLeads, today: Date): LeadConSeg[] {
  const sinAgendar = (l: LeadConSeg) => l._seg.estado === 'none' || l._seg.estado === 'pendiente'
  return filtrarLeads(leads, { q: '', verArchivados: false, today }).filter((l) => l._seg.estado === 'vencido' || sinAgendar(l))
}

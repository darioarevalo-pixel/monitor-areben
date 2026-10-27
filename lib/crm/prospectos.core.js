// Mapa de locales del CRM: las reglas que comparten el servidor (`api/_prospectos.js`), la carga
// inicial (`scripts/prospectos-cargar.mjs`) y la pantalla (`components/crm/MapaLocales.tsx`).
//
// ⛔ JS plano porque lo importa el handler, que corre en Node sin pasar por el compilador de Next.

export const ESTADOS = ['sin_contactar', 'contactado', 'respondio', 'descartado']

export const ESTADO_LABEL = {
  sin_contactar: 'Sin contactar',
  contactado: 'Contactado',
  respondio: 'Respondió',
  descartado: 'Descartado',
}

export const MEDIOS = ['whatsapp', 'llamada', 'instagram', 'correo']

export const MEDIO_LABEL = {
  whatsapp: 'WhatsApp',
  llamada: 'Llamada',
  instagram: 'Instagram',
  correo: 'Correo',
}

/** Sin tildes, minúsculas y guiones: la parte legible del id. */
function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * El id del local: nombre + punto. 🔑 Tiene que salir IGUAL cada vez que se vuelva a buscar la
 * misma ciudad (cada ~6 meses): es lo que hace que la carga nueva no duplique ni pise el estado de
 * los que ya están. El nombre solo no alcanza (hay cadenas con sucursales); el punto solo tampoco
 * (dos locales en la misma galería).
 */
export function idDeLocal(nombre, lat, lng) {
  const p = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(4) : 'x')
  return `${slug(nombre) || 'local'}@${p(lat)},${p(lng)}`
}

const txt = (v) => {
  const s = String(v ?? '').trim()
  return s || null
}
const num = (v) => {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) ? n : null
}

/** Una fila de `locales_costa.json` (~/Bruno/leads-mapa) → una fila de `prospecto_local`. */
export function filaDesdeMaps(r, origen) {
  const lat = num(r.lat)
  const lng = num(r.lng)
  return {
    id: idDeLocal(r.nombre, lat, lng),
    nombre: txt(r.nombre) || 'Sin nombre',
    rubro: txt(r.rubro),
    direccion: txt(r.direccion),
    ciudad: txt(r.ciudad),
    lat,
    lng,
    telefono: txt(r.telefono),
    tel_maps: txt(r.tel_maps),
    whatsapp_seguro: String(r.whatsapp || '').toLowerCase() === 'seguro',
    instagram: txt(String(r.instagram || '').replace(/^@/, '')),
    facebook: txt(r.facebook),
    web: txt(r.pagina || r.web),
    correo: txt(r.correo),
    estrellas: num(r.estrellas),
    resenas: num(r.resenas),
    origen: origen || null,
  }
}

/**
 * Qué estado queda después de un contacto. 🔑 Contactar ⛔ baja a quien ya respondió: escribirle
 * de nuevo a un local que ya es lead es seguimiento, no un primer contacto. Al descartado sí lo
 * vuelve a «Contactado»: si se le escribió, es que se lo retomó.
 */
export function estadoTrasContacto(actual) {
  return actual === 'respondio' ? 'respondio' : 'contactado'
}

/**
 * Valida el cuerpo de un POST. Devuelve `{ ok:true, accion }` o `{ ok:false, error }`.
 * ⛔ La firma (`por`) nunca sale de acá: la pone el servidor con el perfil.
 */
export function validarAccion(b) {
  const id = txt(b && b.id)
  if (!id) return { ok: false, error: 'Falta el local.' }
  const action = b.action
  if (action === 'contacto') {
    if (!MEDIOS.includes(b.medio)) return { ok: false, error: 'Medio inválido.' }
    return { ok: true, accion: { action, id, medio: b.medio } }
  }
  if (action === 'estado') {
    if (!ESTADOS.includes(b.estado)) return { ok: false, error: 'Estado inválido.' }
    // 🔴 «Respondió» sin lead no existe: es justamente el paso que lo pasa a Leads.
    const leadId = txt(b.lead_id)
    if (b.estado === 'respondio' && !leadId) return { ok: false, error: 'Falta el lead.' }
    return { ok: true, accion: { action, id, estado: b.estado, lead_id: leadId, texto: txt(b.texto) } }
  }
  if (action === 'nota') {
    const texto = txt(b.texto)
    if (!texto) return { ok: false, error: 'La nota está vacía.' }
    if (texto.length > 2000) return { ok: false, error: 'La nota es demasiado larga.' }
    return { ok: true, accion: { action, id, texto } }
  }
  return { ok: false, error: 'action inválida (usá contacto, estado o nota)' }
}

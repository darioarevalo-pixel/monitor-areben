/**
 * Los tokens de la API externa del ERP, lo que no toca la base (estándar de Ger B.13). La puerta es `api/_erp-tokens.js`; la pantalla,
 * `components/erp/TokensApi.tsx`. Lo que un token puede hacer lo dice el catálogo del motor (`motor/ext/contrato.mjs`).
 */
export const DIAS_POR_VENCER = 15
export const DIAS_POR_DEFECTO = 90
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const DIA = 864e5

export const ESTADOS_TOKEN = Object.freeze({
  activo: ['success', 'Activo'],
  por_vencer: ['warning', 'Por vencer'],
  vencido: ['danger', 'Vencido'],
  revocado: ['neutral', 'Revocado'],
  sin_dueno: ['danger', 'Persona desactivada'],
})

/** @param {{ revocado_en?: any, vence_en?: any, dueno_activo?: boolean }} t @param {Date} [ahora] */
export function estadoToken(t, ahora = new Date()) {
  if (t.revocado_en) return 'revocado'
  if (t.vence_en && new Date(t.vence_en) <= ahora) return 'vencido'
  if (t.dueno_activo === false) return 'sin_dueno'
  if (t.vence_en && new Date(t.vence_en) - ahora < DIAS_POR_VENCER * DIA) return 'por_vencer'
  return 'activo'
}

/** La fecha sugerida para un token nuevo (A.1 recomienda 90 días), en AAAA-MM-DD de Argentina. */
export function vencePorDefecto(ahora = new Date()) {
  return new Date(ahora.getTime() + DIAS_POR_DEFECTO * DIA - 3 * 3600e3).toISOString().slice(0, 10)
}

/**
 * Qué puede hacer, qué datos salen y qué no puede hacer nunca: el resumen antes de confirmar (B.13).
 * @param {string[]} permisos @param {Record<string, { explica: string, datos: string }>} catalogo @param {readonly string[]} nunca
 * @returns {{ puede: Array<{ permiso: string, explica: string, datos: string }>, nunca: string[] }}
 */
export function resumenDePermisos(permisos, catalogo, nunca) {
  return {
    puede: (permisos || []).filter((p) => catalogo[p]).map((p) => ({ permiso: p, explica: catalogo[p].explica, datos: catalogo[p].datos })),
    nunca: [...nunca],
  }
}

function fechaValida(v, ahora) {
  if (typeof v !== 'string' || !FECHA.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) return 'Elegí la fecha de vencimiento.'
  if (new Date(`${v}T23:59:59-03:00`) <= ahora) return 'La fecha de vencimiento ya pasó.'
  return null
}
function permisosValidos(v, catalogo) {
  if (!Array.isArray(v) || !v.length) return 'Elegí al menos un permiso.'
  if (v.some((p) => !catalogo[p])) return 'Hay un permiso que no existe.'
  return null
}

/** Lo que se puede dar de alta. @returns {string|null} el error, o null. */
export function errorDeAlta(b, { catalogo, negocios, ahora = new Date() }) {
  if (!negocios[b?.negocio]) return 'Elegí el negocio.'
  if (typeof b?.app !== 'string' || !b.app.trim() || b.app.length > 60) return 'Escribí el nombre de la app.'
  if (typeof b?.dueno !== 'string' || !b.dueno.trim() || b.dueno.length > 100) return 'Escribí a nombre de quién queda.'
  return permisosValidos(b?.permisos, catalogo) || fechaValida(b?.vence, ahora)
}

/** Editar: permisos y fecha, sin cambiar el secreto. */
export function errorDeEdicion(b, { catalogo, ahora = new Date() }) {
  return permisosValidos(b?.permisos, catalogo) || fechaValida(b?.vence, ahora)
}

export const idDeToken = (v) => {
  const n = Number(v)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * El resultado de `autenticar` para la pantalla. 🔴 Lista cerrada: `autenticar` trae el hash del token.
 * @param {any} r
 * @returns {any}
 */
export function resultadoDePrueba(r) {
  const t = r.token
  const quien = t ? { id: Number(t.id), app: t.app, negocio: t.negocio, key_prefix: t.key_prefix, permisos: t.permisos, vence_en: t.vence_en, dueno: t.dueno_nombre } : null
  return r.ok ? { ok: true, token: quien } : { ok: false, code: r.code, detalle: r.detail, token: quien }
}

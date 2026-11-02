/**
 * Los tokens `erk_` (estándar de Ger B.3): 32 bytes aleatorios, se guarda SHA-256 y se compara a tiempo constante. El valor sólo
 * existe en la respuesta de `crearToken` / `regenerarToken`: ⛔ se guarda, ⛔ se loguea. Las funciones con `db` reciben un cliente
 * pg conectado a la base de control (BDI).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { NEGOCIOS, PERMISOS } from './contrato.mjs'

export const PREFIJO = 'erk_'
const FORMA = /^erk_[A-Za-z0-9_-]{43}$/
const LARGO_PREFIJO = 12

export const hashDe = (token) => createHash('sha256').update(String(token)).digest('hex')
export const coincide = (candidato, guardado) => {
  const a = Buffer.from(hashDe(candidato), 'hex'), b = Buffer.from(String(guardado), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
export function generarToken() {
  const token = PREFIJO + randomBytes(32).toString('base64url')
  return { token, key_prefix: token.slice(0, LARGO_PREFIJO), key_hash: hashDe(token) }
}

const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const COLUMNAS = `t.id, t.negocio, t.app, t.key_prefix, t.key_hash, t.permisos, t.vence_en, t.revocado_en, t.ultimo_uso_en, t.dueno_id,
  d.nombre as dueno_nombre, d.email as dueno_email, d.activo as dueno_activo`

/**
 * Quién llama, de la cabecera `Authorization`. Sólo `Bearer`.
 * @returns {Promise<{ ok: true, token: object } | { ok: false, status: number, code: string, detail: string, token?: object }>}
 */
export async function autenticar(db, cabecera, { ahora = new Date() } = {}) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(String(cabecera ?? ''))
  if (!m) return { ok: false, status: 401, code: 'missing_token', detail: 'Falta el token: mandalo en `Authorization: Bearer erk_…`.' }
  const invalido = { ok: false, status: 401, code: 'invalid_token', detail: 'El token no es válido.' }
  if (!FORMA.test(m[1])) return invalido
  const [t] = await q(db, `select ${COLUMNAS} from ext_token t join ext_dueno d on d.id = t.dueno_id where t.key_prefix = $1`, [m[1].slice(0, LARGO_PREFIJO)])
  if (!t || !coincide(m[1], t.key_hash)) return invalido
  if (t.revocado_en) return { ok: false, status: 401, code: 'token_revoked', detail: 'Este token fue revocado: pedí uno nuevo.', token: t }
  if (t.vence_en && new Date(t.vence_en) <= ahora) return { ok: false, status: 401, code: 'token_expired', detail: 'Este token venció: pedí uno nuevo.', token: t }
  if (!t.dueno_activo) return { ok: false, status: 401, code: 'token_owner_disabled', detail: 'La persona dueña de este token está desactivada: pedí uno nuevo.', token: t }
  if (!NEGOCIOS[t.negocio]) return { ok: false, status: 403, code: 'business_disabled', detail: 'Este negocio no está habilitado en la API.', token: t }
  return { ok: true, token: t }
}

/** `last_used_at` y la IP de último uso, como mucho una vez por minuto (B.3). */
export async function anotarUso(db, token, ip, { ahora = new Date() } = {}) {
  if (token.ultimo_uso_en && ahora - new Date(token.ultimo_uso_en) < 60000) return
  await db.query('update ext_token set ultimo_uso_en = $2, ultimo_uso_ip = $3 where id = $1', [token.id, ahora, ip])
}

// ── El ciclo de vida (B.3). Lo usa `bin/ext-token.mjs`; la pantalla (B.13) va después. ─────────────

const vencimiento = (fecha) => {
  if (fecha == null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`Vencimiento inválido: ${fecha} (va AAAA-MM-DD)`)
  return new Date(`${fecha}T23:59:59-03:00`) // el final de ese día en Argentina
}
function permisosValidos(permisos) {
  if (!Array.isArray(permisos) || !permisos.length) throw new Error('Faltan los permisos')
  for (const p of permisos) if (!PERMISOS[p]) throw new Error(`Permiso desconocido: ${p}. Son: ${Object.keys(PERMISOS).join(', ')}`)
  return [...new Set(permisos)]
}

/** Da de alta (o reusa, por nombre) al dueño. */
export async function duenoDe(db, { nombre, email = null }) {
  if (!nombre?.trim()) throw new Error('Falta el dueño')
  const [d] = await q(db, `insert into ext_dueno (empresa_id, nombre, email) values ('areben', $1, $2)
    on conflict (nombre) do update set email = coalesce(excluded.email, ext_dueno.email) returning id, nombre, email, activo`, [nombre.trim(), email])
  return d
}

/** @returns {Promise<{ id: number, key_prefix: string, token: string }>} `token` se muestra UNA vez. */
export async function crearToken(db, { negocio, app, dueno, email = null, permisos, vence, creado_por }) {
  if (!NEGOCIOS[negocio]) throw new Error(`Negocio desconocido: ${negocio}. Son: ${Object.keys(NEGOCIOS).join(', ')}`)
  if (!app?.trim()) throw new Error('Falta el nombre de la app')
  if (!creado_por?.trim()) throw new Error('Falta quién lo crea')
  const lista = permisosValidos(permisos)
  const d = await duenoDe(db, { nombre: dueno, email })
  const g = generarToken()
  const [t] = await q(db, `insert into ext_token (empresa_id, negocio, app, dueno_id, key_prefix, key_hash, permisos, vence_en, creado_por)
    values ('areben', $1, $2, $3, $4, $5, $6, $7, $8) returning id, key_prefix`, [negocio, app.trim(), d.id, g.key_prefix, g.key_hash, lista, vencimiento(vence), creado_por.trim()])
  return { ...t, token: g.token }
}

/** Cambia permisos o vencimiento SIN cambiar el secreto. */
export async function editarToken(db, { id, permisos, vence }) {
  const lista = permisos ? permisosValidos(permisos) : null
  const [t] = await q(db, `update ext_token set permisos = coalesce($2, permisos), vence_en = case when $3::boolean then $4::timestamptz else vence_en end
    where id = $1 returning id, key_prefix, permisos, vence_en`, [id, lista, vence !== undefined, vence === undefined ? null : vencimiento(vence)])
  return t ?? null
}

/** Secreto nuevo: el anterior deja de funcionar en el acto. */
export async function regenerarToken(db, { id }) {
  const g = generarToken()
  const [t] = await q(db, 'update ext_token set key_prefix = $2, key_hash = $3 where id = $1 and revocado_en is null returning id, key_prefix', [id, g.key_prefix, g.key_hash])
  return t ? { ...t, token: g.token } : null
}

export async function revocarToken(db, { id }) {
  const [t] = await q(db, 'update ext_token set revocado_en = coalesce(revocado_en, now()) where id = $1 returning id, key_prefix, revocado_en', [id])
  return t ?? null
}

/** Apagar o prender a la persona: sus tokens dejan de funcionar sin revocarlos. */
export async function ponerDuenoActivo(db, { nombre, activo }) {
  const [d] = await q(db, 'update ext_dueno set activo = $2 where nombre = $1 returning id, nombre, activo', [nombre, activo])
  return d ?? null
}

/** ⛔ trae el hash. */
export const listarTokens = (db) => q(db, `select t.id, t.negocio, t.app, t.key_prefix, t.permisos, t.vence_en, t.revocado_en, t.ultimo_uso_en, t.ultimo_uso_ip, d.nombre as dueno, d.activo as dueno_activo
  from ext_token t join ext_dueno d on d.id = t.dueno_id order by t.id`)

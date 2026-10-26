/**
 * EL PIN DE LA ENCARGADA, por persona (paso 7, «el libro MANDA»; Bruno 25/26-oct). Tabla: sql/051.
 * Alimenta `autoriza: { usuario, motivo: 'pin_encargada' }` de la venta (`registrarVenta`, llave VENTA_SIN_NEGATIVOS).
 * 4 dígitos, 5 fallos seguidos ⇒ bloqueo de 15 min, lo fija SÓLO Admin (lo exige el monitor). ⛔ Se devuelve el hash ni el PIN.
 * Esto sólo dice si el PIN es de esa persona; si su ROL puede autorizar en la marca lo decide el monitor (permiso `autorizar-pin`).
 * Los intentos se reservan ANTES de comparar, en un solo UPDATE: diez pedidos en paralelo ⛔ prueban más de 5 claves.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const LARGO = 4
export const MAX_FALLOS = 5
export const BLOQUEO_MINUTOS = 15
const FORMA_PIN = new RegExp(`^\\d{${LARGO}}$`)

const falla = (codigo, mensaje, extra = {}) => ({ ok: false, error: { codigo, mensaje, ...extra } })
const quien = (u) => String(u ?? '').trim().toLowerCase()
const hashear = (pin, sal) => scryptSync(pin, Buffer.from(sal, 'hex'), 32).toString('hex')

/** Fija o cambia el PIN de `usuario` (y lo desbloquea). `por` = el Admin que lo hizo. */
export async function ponerPin(db, { usuario, pin, por }) {
  const u = quien(usuario), admin = String(por ?? '').trim()
  if (!u) return falla('ENTRADA_INVALIDA', 'Falta de quién es el PIN', { campo: 'usuario' })
  if (!admin) return falla('ENTRADA_INVALIDA', 'Falta quién lo cambia', { campo: 'por' })
  if (!FORMA_PIN.test(String(pin ?? ''))) return falla('PIN_INVALIDO', `El PIN son ${LARGO} dígitos`, { campo: 'pin' })
  const sal = randomBytes(16).toString('hex')
  await db.query(
    `insert into erp_pin (usuario, hash, sal, cambiado_por) values ($1, $2, $3, $4)
     on conflict (usuario) do update set hash = excluded.hash, sal = excluded.sal, intentos = 0, bloqueado_hasta = null,
       cambiado_por = excluded.cambiado_por, cambiado_en = now()`,
    [u, hashear(pin, sal), sal, admin],
  )
  return { ok: true }
}

/** Borra el PIN de `usuario` (deja de poder autorizar). */
export async function quitarPin(db, { usuario }) {
  await db.query('delete from erp_pin where usuario = $1', [quien(usuario)])
  return { ok: true }
}

/**
 * ¿Es ese el PIN de `usuario`? → `{ ok: true, usuario }` o `{ ok: false, error }` con código
 * `SIN_PIN` · `PIN_INVALIDO` (no son 4 dígitos; ⛔ gasta intento) · `BLOQUEADO` (con `hasta`) · `PIN_INCORRECTO` (con `quedan`).
 * Si la base no responde LANZA: la pantalla lo dice, ⛔ lo toma por «PIN incorrecto» ni deja pasar.
 */
export async function verificarPin(db, { usuario, pin }) {
  const u = quien(usuario)
  if (!u) return falla('ENTRADA_INVALIDA', 'Falta quién autoriza', { campo: 'usuario' })
  if (!FORMA_PIN.test(String(pin ?? ''))) return falla('PIN_INVALIDO', `El PIN son ${LARGO} dígitos`, { campo: 'pin' })
  const { rows: [fila] } = await db.query('select bloqueado_hasta from erp_pin where usuario = $1', [u])
  if (!fila) return falla('SIN_PIN', 'Esa persona no tiene PIN: lo fija un Admin')
  const { rows: [r] } = await db.query(
    `update erp_pin set
       intentos = case when intentos + 1 >= $2 then 0 else intentos + 1 end,
       bloqueado_hasta = case when intentos + 1 >= $2 then now() + make_interval(mins => $3) else bloqueado_hasta end
     where usuario = $1 and (bloqueado_hasta is null or bloqueado_hasta <= now())
     returning hash, sal, intentos`,
    [u, MAX_FALLOS, BLOQUEO_MINUTOS],
  )
  if (!r) {
    const { rows: [b] } = await db.query('select bloqueado_hasta from erp_pin where usuario = $1', [u])
    return falla('BLOQUEADO', 'Demasiados intentos: probá de nuevo más tarde o pedile a un Admin', { hasta: b?.bloqueado_hasta ?? null })
  }
  const bueno = Buffer.from(r.hash, 'hex'), dado = Buffer.from(hashear(String(pin), r.sal), 'hex')
  if (bueno.length === dado.length && timingSafeEqual(bueno, dado)) {
    await db.query('update erp_pin set intentos = 0, bloqueado_hasta = null where usuario = $1', [u])
    return { ok: true, usuario: u }
  }
  return falla('PIN_INCORRECTO', 'PIN incorrecto', { quedan: r.intentos === 0 ? 0 : MAX_FALLOS - r.intentos })
}

/** Quién tiene PIN, desde cuándo y quién lo puso (para la pantalla de Admin). ⛔ Nunca el hash. */
export async function pinesDe(db) {
  const { rows } = await db.query(
    `select usuario, cambiado_por, cambiado_en, (bloqueado_hasta > now()) as bloqueado, bloqueado_hasta from erp_pin order by usuario`)
  return rows.map((f) => ({ usuario: f.usuario, cambiado_por: f.cambiado_por, cambiado_en: f.cambiado_en, bloqueado: !!f.bloqueado, bloqueado_hasta: f.bloqueado ? f.bloqueado_hasta : null }))
}

/**
 * Las RUTAS de cobro contra la base: lo que usa la pantalla de gerencia (erp › Configuración › Cuentas de cobro, de B).
 * Una ruta dice qué cuenta REAL recibe un medio, por marca × canal, DESDE una fecha. ⛔ se edita: cambiar es poner una
 * nueva (sql/019, trigger `ruta_cobro_inmutable`) ⇒ el pasado ⛔ se reescribe. Núcleo: `cuentas.mjs`.
 *
 * Devuelve `{ ok: true, … }` o `{ ok: false, error: { codigo, mensaje, campo? } }`, como la venta.
 */
import { MEDIOS, rutaVigente } from './cuentas.mjs'

const fallo = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const q = async (db, sql, p) => (await db.query(sql, p)).rows
/** Un `desde` hasta 1 minuto atrás es «ahora» (el reloj de la pantalla y el de la base ⛔ son el mismo). */
const TOLERANCIA_MS = 60_000

/** Las cuentas reales activas, para elegir en la pantalla. */
export async function cuentasParaRutas(db) {
  return q(db, `select id::text, titular, nombre, banco, tipo from cuenta_real where activa order by titular, banco, nombre`)
}

/**
 * La ruta vigente de cada canal × medio de una marca, y la que viene después si ya hay una puesta para más adelante.
 * @param {{ marca: string, en?: Date|string }} e
 * @returns {Promise<Array<{ canal, medio, vigente: any|null, proxima: any|null }>>}  una fila por canal × medio con alguna ruta
 */
export async function rutasVigentes(db, { marca, en = new Date() }) {
  const rutas = await q(db, `select r.id::text, r.marca, r.canal, r.medio, r.cuenta_real_id::text, r.tasa::float, r.dias_acreditacion,
      r.desde, r.puesta_por, r.puesta_en, c.nombre as cuenta_nombre, c.banco as cuenta_banco, c.titular as cuenta_titular, c.activa as cuenta_activa
    from ruta_cobro r left join cuenta_real c on c.id = r.cuenta_real_id where r.marca = $1 order by r.canal, r.medio, r.desde`, [marca])
  const t = new Date(en).getTime()
  const claves = [...new Set(rutas.map((r) => `${r.canal}|${r.medio}`))]
  return claves.map((k) => {
    const [canal, medio] = k.split('|')
    const vigente = rutaVigente(rutas, { marca, canal, medio, en })
    const proxima = rutas.find((r) => r.canal === canal && r.medio === medio && new Date(r.desde).getTime() > t) ?? null
    return { canal, medio, vigente, proxima }
  })
}

/**
 * Pone una ruta nueva. `cuenta_real_id` null = «se elige en cada cobro» (la transferencia mayorista). `desde` por defecto
 * es ahora; ⛔ puede ser para atrás (Bruno: el cambio vale desde ese momento).
 * @param {{ marca: string, canal: string, medio: string, cuenta_real_id: string|null, tasa?: number|null,
 *   dias_acreditacion?: number|null, desde?: Date|string, usuario: string }} e
 */
export async function ponerRuta(db, e, { ahora = new Date() } = {}) {
  if (!e || typeof e !== 'object') return fallo('ENTRADA_INVALIDA', 'Falta la ruta')
  if (!(typeof e.usuario === 'string' && e.usuario.trim())) return fallo('ENTRADA_INVALIDA', 'Falta quién la pone', 'usuario')
  if (!MEDIOS.includes(e.medio)) return fallo('ENTRADA_INVALIDA', `Medio desconocido: ${e.medio}`, 'medio')
  const tasa = e.tasa == null || e.tasa === '' ? null : Number(e.tasa)
  if (tasa != null && !(Number.isFinite(tasa) && tasa >= 0 && tasa < 100)) return fallo('ENTRADA_INVALIDA', 'La comisión es un % entre 0 y 100', 'tasa')
  const dias = e.dias_acreditacion == null || e.dias_acreditacion === '' ? null : Number(e.dias_acreditacion)
  if (dias != null && !(Number.isInteger(dias) && dias >= 0 && dias <= 120)) return fallo('ENTRADA_INVALIDA', 'Los días de acreditación van de 0 a 120', 'dias_acreditacion')
  const desde = new Date(e.desde ?? ahora)
  if (Number.isNaN(desde.getTime())) return fallo('ENTRADA_INVALIDA', 'Fecha inválida', 'desde')
  if (desde.getTime() < ahora.getTime() - TOLERANCIA_MS) return fallo('DESDE_PASADO', 'Una ruta vale desde ahora en adelante: el pasado no se cambia', 'desde')

  const [m] = await q(db, 'select empresa_id from marca where id = $1', [e.marca])
  if (!m) return fallo('MARCA_DESCONOCIDA', `Marca desconocida: ${e.marca}`, 'marca')
  const [c] = await q(db, 'select id from canal where id = $1', [e.canal])
  if (!c) return fallo('CANAL_DESCONOCIDO', `Canal desconocido: ${e.canal}`, 'canal')
  if (e.cuenta_real_id != null) {
    const [cr] = await q(db, 'select empresa_id, activa from cuenta_real where id = $1', [e.cuenta_real_id])
    if (!cr || !cr.activa) return fallo('CUENTA_REAL_DESCONOCIDA', 'Esa cuenta no está o está inactiva en el dashboard', 'cuenta_real_id')
    if (cr.empresa_id !== m.empresa_id) return fallo('CUENTA_REAL_DESCONOCIDA', 'Esa cuenta es de otra empresa', 'cuenta_real_id')
  }
  try {
    const [r] = await q(db, `insert into ruta_cobro (empresa_id, marca, canal, medio, cuenta_real_id, tasa, dias_acreditacion, desde, puesta_por)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id::text, desde`,
      [m.empresa_id, e.marca, e.canal, e.medio, e.cuenta_real_id ?? null, tasa, dias, desde.toISOString(), e.usuario.trim()])
    return { ok: true, ruta: r }
  } catch (err) {
    if (err && err.code === '23505') return fallo('RUTA_REPETIDA', 'Ya hay una ruta para ese medio con esa misma fecha', 'desde')
    throw err
  }
}

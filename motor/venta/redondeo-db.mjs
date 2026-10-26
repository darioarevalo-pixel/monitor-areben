/**
 * El REDONDEO contra la base (sql/029): el que vale ahora y ponerle uno nuevo. Lo usan la puerta del catálogo y la
 * pantalla de gerencia (`erp › Configuración`, la arma Diseño). Núcleo: `redondeo.mjs`.
 *
 * Devuelve `{ ok: true, … }` o `{ ok: false, error: { codigo, mensaje, campo? } }`, como la venta y las rutas.
 */
import { MODOS, PASOS, redondeoVigente } from './redondeo.mjs'

const fallo = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const q = async (db, sql, p) => (await db.query(sql, p)).rows
/** Un `desde` hasta 1 minuto atrás es «ahora» (como en las rutas). */
const TOLERANCIA_MS = 60_000

/** El redondeo vigente de una marca × canal, o null (⛔ se redondea). @param {{ marca: string, canal: string, en?: Date|string }} e */
export async function redondeoDe(db, { marca, canal, en = new Date() }) {
  return redondeoVigente(await q(db, 'select marca, canal, paso::float, modo, desde from redondeo where marca = $1 and canal = $2', [marca, canal]), { marca, canal, en })
}

/** Todos los de una marca, el vigente y el próximo por canal, para la pantalla. @param {{ marca: string, en?: Date|string }} e */
export async function redondeosDe(db, { marca, en = new Date() }) {
  const filas = await q(db, 'select id::text, marca, canal, paso::float, modo, desde, puesto_por, puesto_en from redondeo where marca = $1 order by canal, desde', [marca])
  const t = new Date(en).getTime()
  return [...new Set(filas.map((f) => f.canal))].map((canal) => ({
    canal,
    vigente: redondeoVigente(filas, { marca, canal, en }),
    proximo: filas.find((f) => f.canal === canal && new Date(f.desde).getTime() > t) ?? null,
  }))
}

/**
 * Pone un redondeo nuevo para una marca × canal, desde ahora (o más adelante). ⛔ para atrás: el pasado ⛔ se reescribe.
 * @param {{ marca: string, canal: string, paso: number, modo: 'cercano'|'abajo'|'arriba', desde?: Date|string, usuario: string }} e
 */
export async function ponerRedondeo(db, e, { ahora = new Date() } = {}) {
  if (!e || typeof e !== 'object') return fallo('ENTRADA_INVALIDA', 'Falta el redondeo')
  if (!(typeof e.usuario === 'string' && e.usuario.trim())) return fallo('ENTRADA_INVALIDA', 'Falta quién lo pone', 'usuario')
  if (!PASOS.includes(Number(e.paso))) return fallo('ENTRADA_INVALIDA', `El redondeo es a ${PASOS.map((p) => `$${p}`).join(', ')}`, 'paso')
  if (!MODOS.includes(e.modo)) return fallo('ENTRADA_INVALIDA', 'Elegí si redondea al más cercano, hacia abajo o hacia arriba', 'modo')
  const desde = new Date(e.desde ?? ahora)
  if (Number.isNaN(desde.getTime())) return fallo('ENTRADA_INVALIDA', 'Fecha inválida', 'desde')
  if (desde.getTime() < ahora.getTime() - TOLERANCIA_MS) return fallo('DESDE_PASADO', 'Un redondeo vale desde ahora en adelante: el pasado no se cambia', 'desde')
  const [m] = await q(db, 'select empresa_id from marca where id = $1', [e.marca])
  if (!m) return fallo('MARCA_DESCONOCIDA', `Marca desconocida: ${e.marca}`, 'marca')
  const [c] = await q(db, 'select id from canal where id = $1', [e.canal])
  if (!c) return fallo('CANAL_DESCONOCIDO', `Canal desconocido: ${e.canal}`, 'canal')
  const [r] = await q(db, `insert into redondeo (empresa_id, marca, canal, paso, modo, desde, puesto_por) values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (marca, canal, desde) do nothing returning id::text`, [m.empresa_id, e.marca, e.canal, Number(e.paso), e.modo, desde, e.usuario.trim()])
  if (!r) return fallo('REDONDEO_REPETIDO', 'Ya hay un redondeo puesto para ese momento', 'desde')
  return { ok: true, id: r.id }
}

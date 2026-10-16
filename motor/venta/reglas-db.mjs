/**
 * Las REGLAS COMERCIALES en la base (`sql/016`): leer, cargar, corregir/apagar y sembrar las de la Caja. La cuenta la
 * hace el núcleo puro (`reglas.mjs`); acá sólo se guarda lo que él valida (`validarRegla`), con el mismo texto de error.
 *
 * Devuelven `{ ok: true, ... }` o `{ ok: false, error: { codigo, mensaje, campo? } }`. Sólo lanzan si la BASE falla.
 */
import { reglasDeCaja, validarRegla } from './reglas.mjs'

const q = async (db, sql, params = []) => (await db.query(sql, params)).rows
const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })

/** ¿Está la 016 en esta base? (sin ella la pantalla dice que falta, ⛔ un 500). */
export async function hayReglas(db) {
  const [r] = await q(db, `select to_regclass('public.regla_comercial') is not null as hay`)
  return !!r.hay
}

/** Una fila de la base con la forma del núcleo (ids y números como el núcleo los espera). */
export function deFila(f) {
  return {
    id: String(f.id), marca: f.marca, nombre: f.nombre, fin: f.fin ?? null, canal: f.canal, campania: f.campania ?? null,
    alcance: f.alcance, alcance_ids: f.alcance_ids || [], medios: f.medios, banco: f.banco ?? null,
    cuotas: f.cuotas == null ? null : Number(f.cuotas), monto_minimo: f.monto_minimo == null ? null : Number(f.monto_minimo),
    efecto: f.efecto, pct: f.pct == null ? null : Number(f.pct),
    desde: f.desde ? new Date(f.desde).toISOString() : null, hasta: f.hasta ? new Date(f.hasta).toISOString() : null,
    dias: f.dias ? f.dias.map(Number) : null, activa: f.activa, origen: f.origen,
    usuario: f.usuario, creada_en: f.creada_en, actualizada_por: f.actualizada_por ?? null, actualizada_en: f.actualizada_en ?? null,
  }
}

/** Las reglas de las marcas pedidas (todas si `marcas` falta), activas y apagadas. */
export async function leerReglas(db, { marcas } = {}) {
  const filas = marcas
    ? await q(db, 'select * from regla_comercial where marca = any($1) order by marca, canal, campania nulls first, id', [marcas])
    : await q(db, 'select * from regla_comercial order by marca, canal, campania nulls first, id')
  return filas.map(deFila)
}

const COLUMNAS = ['marca', 'nombre', 'fin', 'canal', 'campania', 'alcance', 'alcance_ids', 'medios', 'banco', 'cuotas', 'monto_minimo', 'efecto', 'pct', 'desde', 'hasta', 'dias', 'activa', 'origen']

/**
 * Cargar una regla nueva (sin `id`) o corregir/apagar una (con `id`). Cada cambio deja su foto (antes/después).
 * @param {import('pg').ClientBase} db @param {{ regla: any, usuario: string }} e
 */
export async function guardarRegla(db, { regla, usuario }) {
  if (typeof usuario !== 'string' || !usuario.trim()) return falla('ENTRADA_INVALIDA', 'Falta quién carga', 'usuario')
  const v = validarRegla(regla)
  if (!v.ok) return falla('ENTRADA_INVALIDA', v.error.mensaje, v.error.campo)
  const r = v.regla
  const [m] = await q(db, 'select empresa_id from marca where id = $1', [r.marca])
  if (!m) return falla('MARCA_DESCONOCIDA', `Marca desconocida: ${r.marca}`, 'marca')
  const valores = () => COLUMNAS.map((c) => r[c])
  await db.query('begin')
  try {
    let antes = null, fila
    if (r.id != null) {
      if (!/^\d+$/.test(r.id)) { await db.query('rollback'); return falla('ENTRADA_INVALIDA', 'Regla inválida', 'id') }
      ;[antes] = await q(db, 'select * from regla_comercial where empresa_id = $1 and id = $2 for update', [m.empresa_id, r.id])
      if (!antes) { await db.query('rollback'); return falla('NO_EXISTE', 'Esa regla no existe') }
      if (antes.marca !== r.marca) { await db.query('rollback'); return falla('ENTRADA_INVALIDA', 'Una regla no cambia de marca', 'marca') }
      r.origen = antes.origen // corregir una regla sembrada de la Caja ⛔ la vuelve «cargada»: sigue diciendo de dónde nació
      ;[fila] = await q(db,
        `update regla_comercial set ${COLUMNAS.map((c, i) => `${c} = $${i + 3}`).join(', ')}, actualizada_por = $${COLUMNAS.length + 3}, actualizada_en = now()
         where empresa_id = $1 and id = $2 returning *`, [m.empresa_id, r.id, ...valores(), usuario.trim()])
    } else {
      ;[fila] = await q(db,
        `insert into regla_comercial (empresa_id, ${COLUMNAS.join(', ')}, usuario) values ($1, ${COLUMNAS.map((_, i) => `$${i + 2}`).join(', ')}, $${COLUMNAS.length + 2}) returning *`,
        [m.empresa_id, ...valores(), usuario.trim()])
    }
    await q(db, 'insert into regla_comercial_cambio (empresa_id, regla_id, usuario, antes, despues) values ($1, $2, $3, $4, $5)',
      [m.empresa_id, fila.id, usuario.trim(), antes ? JSON.stringify(deFila(antes)) : null, JSON.stringify(deFila(fila))])
    await db.query('commit')
    return { ok: true, regla: deFila(fila), nueva: r.id == null }
  } catch (e) {
    await db.query('rollback')
    throw e
  }
}

/**
 * SEMBRAR las reglas de hoy de la Caja de una marca (`reglasDeCaja`: el % de las cuentas de GN, la oferta y las 6
 * cuotas) como filas `origen = 'caja'`. 🔑 Una sola vez: si la marca ya tiene reglas de la Caja ⛔ siembra (un admin ya
 * pudo corregirlas). `escribir: false` = seco: dice qué sembraría.
 * @param {import('pg').ClientBase} db @param {{ marca: string, config: any, usuario: string, escribir: boolean }} e
 */
export async function sembrarDeCaja(db, { marca, config, usuario, escribir }) {
  const [ya] = await q(db, `select count(*)::int as n from regla_comercial where marca = $1 and origen = 'caja'`, [marca])
  const { reglas, avisos } = reglasDeCaja(config, { marca })
  if (ya.n > 0) return { ok: true, sembradas: 0, yaEstaban: ya.n, reglas: [], avisos }
  if (!escribir) return { ok: true, sembradas: 0, yaEstaban: 0, reglas, avisos, seco: true }
  const guardadas = []
  for (const r of reglas) {
    const g = await guardarRegla(db, { regla: r, usuario })
    if (!g.ok) return g
    guardadas.push(g.regla)
  }
  return { ok: true, sembradas: guardadas.length, yaEstaban: 0, reglas: guardadas, avisos }
}

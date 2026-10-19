/**
 * ERP › Ajustes (sólo admin, lo chequea `api/_erp.js`): el AJUSTE DE STOCK CON MOTIVO contra la base del motor (sql/026).
 * Armar, aprobar y descartar van por el contrato del motor (`motor/stock/ajuste.mjs`) por pg, en una transacción; la
 * pantalla se arma en `lib/erp/ajuste.core.js`.
 *
 *   GET  ?recurso=erp&vista=ajustes&linea=bdi|zattia|stunned    los ajustes de la línea + la lista «A contar»
 *   POST {recurso:'erp', accion:'crear-ajuste', linea, deposito, motivo, detalle?, fuente?, renglones}
 *   POST {recurso:'erp', accion:'aprobar-ajuste', linea, ajusteId}
 *   POST {recurso:'erp', accion:'descartar-ajuste', linea, ajusteId, motivo}
 *
 * 🔑 EN SOMBRA (Bruno, 18-oct: todo en paralelo con GN): el ajuste mueve SÓLO el libro del ERP. ⛔ GN ni Tienda Nube: el
 * equipo sigue ajustando en GN como hoy. Sirve para cerrar «El ERP dice otro stock» de la conciliación contando la prenda.
 */
import { LINEAS, armarAContar, baseDe, filaDeAjuste, leerCrearAjuste, textoDeAviso } from '../lib/erp/ajuste.core.js'
import { textoDelMotor } from '../lib/erp/venta.core.js'

const SIN_TABLA = 'Los ajustes todavía no están en la base del motor (migración 026).'
const STATUS = { ENTRADA_INVALIDA: 400, QUEDA_NEGATIVO: 409, SIN_DIFERENCIAS: 409, YA_RESUELTO: 409, NO_ENCONTRADO: 404 }
const motor = () => import('../motor/stock/ajuste.mjs')
/** Lo que el motor dice en palabras del motor («libro», «aplicado», `local`), dicho como en la pantalla. */
const MENSAJE = {
  SIN_DIFERENCIAS: 'Lo contado coincide con el ERP: no hay nada que ajustar.',
  QUEDA_NEGATIVO: 'En ese depósito el ERP tiene menos de las que salen. Si la prenda está, primero contala (motivo «Conteo»).',
  YA_RESUELTO: 'Ese ajuste ya se aprobó o se descartó: volvé a leer.',
  NO_ENCONTRADO: 'No está ese ajuste.',
}
const errorDe = (r) => ({ status: STATUS[r.error.codigo] ?? 409, error: MENSAJE[r.error.codigo] ?? textoDelMotor(r.error) })
const conAvisos = (r) => (r.avisos || []).map((a) => ({ ...a, texto: textoDeAviso(a) }))

/** Las ventas del motor que entraron con el PIN de la encargada y piden contar (`detalle.contar`, motor 2/3). */
async function ventasAContar(pg, linea) {
  return (await pg.query(`select id, numero, deposito, ocurrida_en, detalle->'contar' as contar from venta
    where marca = $1 and detalle ? 'contar' and estado <> 'anulada' order by ocurrida_en desc limit 200`, [linea])).rows
}

export async function ajustesDeLinea({ linea }, deps) {
  if (!LINEAS.includes(linea)) return { status: 400, error: 'Línea inválida' }
  const m = await motor()
  // La conciliación sale por supabase-js (⛔ ocupa la conexión pg); va en paralelo con lo del motor.
  const conciliacion = deps.conciliacionDelDia({ tienda: linea, fecha: null }).catch(() => null)
  const r = await deps.conMotor(baseDe(linea), 'Los ajustes', async (pg) => {
    const { sinTablas, ajustes } = await m.ajustesDe(pg, { linea, limite: 200 })
    if (sinTablas) return { status: 409, error: SIN_TABLA }
    return { ajustes, contar: await ventasAContar(pg, linea) }
  })
  if (r.status) return r
  const conc = await conciliacion
  const ids = [...r.ajustes.flatMap((a) => a.renglones.map((x) => Number(x.product_id))), ...r.contar.flatMap((v) => (v.contar || []).map((c) => Number(c.product_id)))]
  const nombres = await deps.nombresDeVariantes(baseDe(linea), ids)
  return {
    ...armarAContar({ linea, conciliacion: conc && !conc.status && !conc.sinTablas ? conc : null, contar: r.contar, ajustes: r.ajustes, nombres }),
    sinConciliacion: !conc || Boolean(conc.status) || Boolean(conc.sinTablas),
    ajustes: r.ajustes.map((a) => filaDeAjuste(a, nombres)),
  }
}

export async function crearAjusteErp({ body, usuario }, deps) {
  const e = leerCrearAjuste(body)
  if (e.error) return { status: 400, error: e.error }
  const m = await motor()
  return deps.conMotor(baseDe(e.linea), 'Los ajustes', async (pg) => {
    const r = await m.crearAjuste(pg, { ...e, usuario })
    if (!r.ok) return errorDe(r)
    return { ok: true, numero: r.ajuste.numero, id: r.ajuste.id, renglones: r.renglones.length, avisos: conAvisos(r) }
  })
}

export async function resolverAjusteErp({ body, usuario, aprobar }, deps) {
  const linea = String(body?.linea || '')
  if (!LINEAS.includes(linea)) return { status: 400, error: 'Línea inválida' }
  const m = await motor()
  return deps.conMotor(baseDe(linea), 'Los ajustes', async (pg) => {
    // El ajuste tiene que ser de ESTA línea: el id viaja del navegador.
    const [a] = (await pg.query('select linea from stock_ajuste where id = $1', [String(body?.ajusteId || '')]).catch(() => ({ rows: [] }))).rows
    if (!a || a.linea !== linea) return { status: 404, error: 'No está ese ajuste' }
    const r = aprobar
      ? await m.aprobarAjuste(pg, { ajuste_id: body.ajusteId, usuario })
      : await m.rechazarAjuste(pg, { ajuste_id: body.ajusteId, usuario, motivo: body.motivo })
    if (!r.ok) return errorDe(r)
    return { ok: true, numero: r.ajuste.numero, estado: r.ajuste.estado, movimientos: r.movimientos ?? 0, avisos: conAvisos(r) }
  })
}

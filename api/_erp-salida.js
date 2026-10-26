/**
 * ERP › Salida con vuelta: la puerta del monitor al motor (`motor/stock/salida.mjs`, sql/048). Los verbos van por pg en una
 * transacción; lo puro (leer el pedido, decir el error) está en `lib/erp/salida.core.js`.
 *
 *   GET  ?recurso=erp&vista=salidas&marca=bdi|zattia|stunned[&estado=…][&ref=…]   las salidas con sus renglones y lo que falta
 *   POST {recurso:'erp', accion:'salida-crear', linea, tipo, ref, detalle?, gn_sale_ids?, renglones}
 *   POST {recurso:'erp', accion:'salida-devolver', linea, salidaId, renglones:[{n, cantidad}]}
 *   POST {recurso:'erp', accion:'salida-cerrar', linea, salidaId, renglones:[{n, devuelta?, consumida?, danada?, perdida?}]}
 *   POST {recurso:'erp', accion:'salida-cancelar', linea, salidaId, motivo}
 *
 * 🔑 EN SOMBRA hasta el corte: con la llave `salida_mueve_libro` apagada el documento ⛔ mueve el libro (lo mueve la venta de
 * GN). Los ajustes del cierre ⛔ lo mueven nunca: son sólo gasto. Detalle en `areben-motor/SALIDA.md`.
 */
import { LINEAS, baseDe, errorDe, leerAccion, textoDeAviso } from '../lib/erp/salida.core.js'

const SIN_TABLA = 'La salida con vuelta todavía no está en la base del motor (migración 048).'
const motor = () => import('../motor/stock/salida.mjs')
const conAvisos = (r) => (r.avisos || []).map((a) => ({ ...a, texto: textoDeAviso(a) }))

export async function salidasDeLinea({ linea, estado, ref }, deps) {
  if (!LINEAS.includes(linea)) return { status: 400, error: 'Línea inválida' }
  const m = await motor()
  return deps.conMotor(baseDe(linea), 'Las salidas', async (pg) => {
    const { sinTablas, salidas } = await m.salidasDe(pg, { linea, estado: estado || null, ref: ref || null, limite: 200 })
    if (sinTablas) return { status: 409, error: SIN_TABLA }
    return { salidas }
  })
}

/** Una acción sobre una salida. El id viaja del navegador ⇒ tiene que ser de ESTA línea. */
export async function accionDeSalida({ body, usuario }, deps) {
  const e = leerAccion(body)
  if (e.error) return { status: 400, error: e.error }
  const m = await motor()
  return deps.conMotor(baseDe(e.linea), 'Las salidas', async (pg) => {
    if (e.id) {
      const [s] = (await pg.query('select linea from salida where id = $1', [e.id]).catch(() => ({ rows: [] }))).rows
      if (!s || s.linea !== e.linea) return { status: 404, error: 'No está esa salida.' }
    }
    const op = { usuario, salida_id: e.id, ...e.entrada }
    const r = body.accion === 'salida-crear' ? await m.crearSalida(pg, op)
      : body.accion === 'salida-devolver' ? await m.devolver(pg, op)
      : body.accion === 'salida-cerrar' ? await m.cerrarSalida(pg, op)
      : await m.cancelarSalida(pg, op)
    if (!r.ok) return errorDe(r)
    return { ok: true, salida: r.salida, renglones: r.renglones, ya: r.ya ?? false, faltan: r.faltan ?? [], ajustes: r.ajustes ?? [], movimientos: r.movimientos ?? 0, avisos: conAvisos(r) }
  })
}

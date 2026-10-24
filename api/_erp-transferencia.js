/**
 * ERP › Stock › Transferencias COMO DOCUMENTO: la puerta del monitor al motor (`motor/stock/transferencia.mjs`, sql/034).
 * Los verbos van por pg en una transacción; lo puro (leer el pedido, decir el error) está en `lib/erp/transferencia-doc.core.js`.
 *
 *   GET  ?recurso=erp&vista=transferencias-doc&marca=bdi|zattia|stunned[&estado=…]   los documentos + lo que está en tránsito
 *   POST {recurso:'erp', accion:'transferencia-crear', linea, desde, hacia, origen?, origen_ref?, nota?, renglones?}
 *   POST {recurso:'erp', accion:'transferencia-armar'|'transferencia-recibir', linea, transferenciaId, renglones}
 *   POST {recurso:'erp', accion:'transferencia-enviar', linea, transferenciaId, gn_transfer_id?}
 *   POST {recurso:'erp', accion:'transferencia-cancelar', linea, transferenciaId, motivo}
 *
 * 🔑 EN SOMBRA (Bruno, 18-oct): estos verbos mueven SÓLO el libro del ERP. ⛔ GN ni Tienda Nube: mientras GN sirva, la Reposición
 * sigue escribiendo allá como hoy (`api/_repo-armado.js`). Un documento de Reposición ⛔ se crea desde acá hasta que exista la
 * pantalla de Recibir: si no, el ERP anotaría la salida y nadie la entrada.
 */
import { LINEAS, baseDe, errorDe, leerAccion, textoDeAviso } from '../lib/erp/transferencia-doc.core.js'

const SIN_TABLA = 'Las transferencias como documento todavía no están en la base del motor (migración 034).'
const motor = () => import('../motor/stock/transferencia.mjs')
const conAvisos = (r) => (r.avisos || []).map((a) => ({ ...a, texto: textoDeAviso(a) }))

export async function documentosDeLinea({ linea, estado }, deps) {
  if (!LINEAS.includes(linea)) return { status: 400, error: 'Línea inválida' }
  const m = await motor()
  return deps.conMotor(baseDe(linea), 'Las transferencias', async (pg) => {
    const { sinTablas, transferencias } = await m.transferenciasDe(pg, { linea, estado: estado ? String(estado).split(',') : null, limite: 200 })
    if (sinTablas) return { status: 409, error: SIN_TABLA }
    return { transferencias, enTransito: await m.enTransito(pg, { linea }) }
  })
}

/** Una acción sobre un documento. El id viaja del navegador ⇒ tiene que ser de ESTA línea. */
export async function accionDeTransferencia({ body, usuario }, deps) {
  const e = leerAccion(body)
  if (e.error) return { status: 400, error: e.error }
  const m = await motor()
  return deps.conMotor(baseDe(e.linea), 'Las transferencias', async (pg) => {
    if (e.id) {
      const [t] = (await pg.query('select linea from stock_transferencia where id = $1', [e.id]).catch(() => ({ rows: [] }))).rows
      if (!t || t.linea !== e.linea) return { status: 404, error: 'No está esa transferencia.' }
    }
    const op = { usuario, transferencia_id: e.id, ...e.entrada }
    const r = body.accion === 'transferencia-crear' ? await m.crearTransferencia(pg, op)
      : body.accion === 'transferencia-armar' ? await m.armarTransferencia(pg, op)
      : body.accion === 'transferencia-enviar' ? await m.enviarTransferencia(pg, op)
      : body.accion === 'transferencia-recibir' ? await m.recibirTransferencia(pg, op)
      : await m.cancelarTransferencia(pg, op)
    if (!r.ok) return errorDe(r)
    return { ok: true, transferencia: r.transferencia, renglones: r.renglones, ya: r.ya ?? false, movimientos: r.movimientos ?? 0, unidades: r.unidades ?? 0, diferencias: r.diferencias ?? [], avisos: conAvisos(r) }
  })
}

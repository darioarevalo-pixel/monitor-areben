/**
 * Pedidos de TN ya guardados ⇒ ventas del motor (registrar / anular). La regla es `planVentasTN` (venta.mjs); acá sólo
 * lo que lee y escribe. La usan los DOS caminos — el CLI de Actions (`tn.mjs ventas`, la red de cada 2 h) y la puerta
 * del ERP (`api/tn-aviso.js`, al instante) — para que haya UNA sola forma de pasar un pedido a venta.
 */
import { cargarIndice } from '../cargar.mjs'
import { anularVenta, registrarVenta } from '../venta/registrar.mjs'
import { origenRef, planVentasTN, ventaRealEn } from './venta.mjs'

/** @param {{ q: Function }} db  @param {string} tienda  @param {Array} ordenes  filas de `tn_orden` con `lineas` */
export async function planDe(db, tienda, ordenes) {
  const indice = await cargarIndice(db)
  const cuentas = await db.q('select id, nombre, medio, activa from cuenta_cobro where marca = $1', [tienda])
  const refs = ordenes.map((o) => origenRef(tienda, o.tn_id))
  const ya = new Map((refs.length ? await db.q(`select origen_ref, id, estado from venta where origen = 'tn' and origen_ref = any($1)`, [refs]) : []).map((v) => [v.origen_ref, v]))
  return planVentasTN({ tienda, ordenes, indice, cuentas, ya, real: ventaRealEn(tienda) })
}

/** @param {import('pg').Client} conexion  sin transacción abierta: `registrarVenta` maneja la suya */
export async function aplicarPlan(conexion, plan, { usuario = 'tienda-nube' } = {}) {
  const mal = []
  let registradas = 0, anuladas = 0
  for (const e of plan.registrar) {
    const r = await registrarVenta(conexion, e)
    if (r.ok) registradas += r.ya_existia ? 0 : 1
    else mal.push(`#${e.detalle.tn.numero} ${r.error.codigo}: ${r.error.mensaje}`)
  }
  for (const a of plan.anular) {
    const r = await anularVenta(conexion, { venta_id: a.venta_id, motivo: a.motivo, usuario })
    if (r.ok) anuladas++
    else mal.push(`#${a.numero} anular ${r.error.codigo}: ${r.error.mensaje}`)
  }
  return { registradas, anuladas, mal }
}

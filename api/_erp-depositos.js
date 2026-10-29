/**
 * ERP › Configuración › Depósito Evento: la puerta del monitor al motor (`motor/stock/deposito.mjs`, sql/058). Bruno 29-oct:
 * «tiene que ser un depósito opcional, que se activa y se desactiva». Se activa para una feria o un evento, se le transfiere
 * mercadería (Mover y recibir), se vende desde ahí con la caja del evento (`api/_caja.js`, puesto `evento`) y se desactiva
 * SÓLO con el stock en 0: si quedó algo, el motor lo lista.
 *
 *   GET  ?recurso=erp&vista=depositos&marca=stunned            los depósitos de la línea, con activo y unidades
 *   POST {recurso:'erp', accion:'deposito-activar'|'deposito-desactivar', linea, deposito}   sólo Admin (`configurar`)
 */
const LINEAS = ['bdi', 'zattia', 'stunned']
const baseDe = (linea) => (linea === 'bdi' ? 'bdi' : 'zattia')
export const ACCIONES_DEPOSITO = ['deposito-activar', 'deposito-desactivar']
const motor = () => import('../motor/stock/deposito.mjs')

export async function depositosDeLinea({ linea }, deps) {
  if (!LINEAS.includes(linea)) return { status: 400, error: 'Línea inválida' }
  const m = await motor()
  return deps.conMotor(baseDe(linea), 'Los depósitos', async (pg) => ({ depositos: await m.depositosDe(pg, { linea }) }))
}

export async function accionDeDeposito({ body, usuario }, deps) {
  const linea = String(body.linea || '')
  if (!LINEAS.includes(linea)) return { status: 400, error: 'Línea inválida' }
  const deposito = String(body.deposito || '')
  if (!/^[a-z_]{1,40}$/.test(deposito)) return { status: 400, error: 'Falta el depósito' }
  const m = await motor()
  return deps.conMotor(baseDe(linea), 'Los depósitos', async (pg) => {
    const verbo = body.accion === 'deposito-activar' ? m.activarDeposito : m.desactivarDeposito
    const r = await verbo(pg, { linea, deposito, usuario })
    if (r.ok) return { ...r, depositos: await m.depositosDe(pg, { linea }) }
    const status = r.error.codigo === 'ENTRADA_INVALIDA' ? 400 : 409
    return { status, error: r.error.mensaje, codigo: r.error.codigo, ...(r.quedan ? { quedan: r.quedan } : {}), ...(r.abiertas ? { abiertas: r.abiertas } : {}) }
  })
}

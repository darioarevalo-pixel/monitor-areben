/**
 * Los INTERRUPTORES DE APROBACIÓN del ERP, por marca (motor sql/035; Bruno 24-oct). `api/_erp.js` los lee en cada pedido y los
 * pasa a `puedeErp`: prendido = esa acción la hace sólo Admin. Se cambian desde Configuración › Usuarios y roles (sólo Admin).
 *
 *   GET  ?recurso=erp&vista=interruptores                       { interruptores: { bdi: {…}, zattia: {…} } }
 *   POST {recurso:'erp', accion:'poner-interruptor', marca, clave: 'anular'|'conteo'|'precio', valor: true|false}
 *
 * 🔴 Si la base no responde, el pedido sigue con todo APAGADO (la conducta de antes) y queda un `console.warn`: ⛔ callado.
 */
const importar = () => import('../motor/stock/interruptores.mjs')
export const APAGADOS = { anular: false, conteo: false, precio: false }

/** `{ bdi: {…}, zattia: {…} }` de las marcas pedidas. Una que falla queda apagada y se avisa en el log. */
export async function interruptoresDeMarcas(marcas, { conMotor }) {
  const { interruptoresDe } = await importar()
  const out = {}
  await Promise.all(marcas.map(async (marca) => {
    try {
      const r = await conMotor(marca, 'Los interruptores', (db) => interruptoresDe(db, { linea: marca }))
      if (r && r.status) { out[marca] = { ...APAGADOS }; console.warn(`[interruptores] ${marca}: ${r.error}`); return }
      out[marca] = r
    } catch (e) {
      out[marca] = { ...APAGADOS }
      console.warn(`[interruptores] ${marca}: ${e.message}`)
    }
  }))
  return out
}

/** Prende o apaga UNO en la base de esa marca. `body`: `{ marca, clave, valor }`. */
export async function ponerInterruptorErp({ body, usuario }, { conMotor }) {
  const marca = String(body?.marca || '')
  if (!['bdi', 'zattia'].includes(marca)) return { status: 400, error: 'Marca inválida' }
  const { ponerInterruptor } = await importar()
  let r
  try {
    r = await conMotor(marca, 'Los interruptores', (db) => ponerInterruptor(db, { linea: marca, clave: body.clave, valor: body.valor, usuario }))
  } catch (e) {
    if (e?.code === '42P01') return { status: 409, error: 'Los interruptores todavía no están en la base del motor (migración 035).' }
    throw e
  }
  if (r && r.status) return r
  if (!r.ok) return { status: 400, error: r.error.mensaje }
  return { ok: true, marca, interruptores: r.interruptores }
}

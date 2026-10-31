/**
 * Los INTERRUPTORES DE APROBACIÓN del ERP, por marca (motor sql/035; Bruno 24-oct). `api/_erp.js` los lee en cada pedido y los
 * pasa a `puedeErp`: prendido = esa acción la hace sólo Admin. Se cambian desde Configuración › Usuarios y roles (sólo Admin).
 *
 *   GET  ?recurso=erp&vista=interruptores                       { interruptores: { bdi: {…}, zattia: {…} } }
 *   POST {recurso:'erp', accion:'poner-interruptor', marca, clave: 'anular'|'conteo'|'precio'|'sin_pagar_a_preparar', valor: true|false}
 *   GET  ?recurso=erp&vista=configuracion                       { configuracion: { bdi: { sin_pagar_a_preparar }, zattia: {…} } }
 *
 * `sin_pagar_a_preparar` (motor sql/040, Darío 26-oct: opción A) ⛔ es una aprobación sino una CONFIGURACIÓN: prendido, el pedido de TN sin
 * pagar entra a «A preparar». Por BASE (Zattia lleva a Stunned). Al cambiarla el motor reclasifica los pedidos que ya estaban:
 * la respuesta trae `reclasificados`. ⛔ aparece en `interruptores` (esa forma es la de la pantalla de Aprobaciones).
 *
 * 🔴 Si la base no responde, el pedido sigue con todo APAGADO (la conducta de antes) y queda un `console.warn`: ⛔ callado.
 */
const importar = () => import('../motor/stock/interruptores.mjs')
export const APAGADOS = { anular: false, conteo: false, precio: false }
const CONFIG_APAGADA = { sin_pagar_a_preparar: false }

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

/** `{ bdi: { sin_pagar_a_preparar }, zattia: {…} }`. Una base que falla queda apagada y se avisa en el log. */
export async function configuracionDeMarcas(marcas, { conMotor }) {
  const { configuracionDe } = await importar()
  const out = {}
  await Promise.all(marcas.map(async (marca) => {
    try {
      const r = await conMotor(marca, 'La configuración', (db) => configuracionDe(db, { linea: marca }))
      if (r && r.status) { out[marca] = { ...CONFIG_APAGADA }; console.warn(`[configuracion] ${marca}: ${r.error}`); return }
      out[marca] = r
    } catch (e) {
      out[marca] = { ...CONFIG_APAGADA }
      console.warn(`[configuracion] ${marca}: ${e.message}`)
    }
  }))
  return out
}

/** Prende o apaga UNO en la base de esa marca. `body`: `{ marca, clave, valor }`. */
export async function ponerInterruptorErp({ body, usuario }, { conMotor }) {
  const marca = String(body?.marca || '')
  // Stunned (línea de Zattia, en su base) tiene UNA sola: la salida con vuelta mueve su libro desde que ⛔ pasa por GN (erp-stunned §8.3).
  const stunned = marca === 'stunned' && body?.clave === 'salida_mueve_libro'
  if (!['bdi', 'zattia'].includes(marca) && !stunned) return { status: 400, error: 'Marca inválida' }
  const { ponerInterruptor } = await importar()
  let r
  try {
    r = await conMotor(stunned ? 'zattia' : marca, 'Los interruptores', (db) => ponerInterruptor(db, { linea: marca, clave: body.clave, valor: body.valor, usuario }))
  } catch (e) {
    if (e?.code === '42P01') return { status: 409, error: 'Los interruptores todavía no están en la base del motor (migración 035).' }
    if (e?.code === '23514') return { status: 409, error: 'Esa configuración todavía no está en la base del motor (migración 040).' }
    throw e
  }
  if (r && r.status) return r
  if (!r.ok) return { status: 400, error: r.error.mensaje }
  return { ok: true, marca, interruptores: r.interruptores, ...(r.reclasificados === undefined ? {} : { reclasificados: r.reclasificados }) }
}

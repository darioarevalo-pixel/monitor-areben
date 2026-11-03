/**
 * ERP › Stock › Ingresos de mercadería › Actualizar Ingresos: lo que Ingresos tiene y el ERP ⛔, para elegir e importar. A pedido, ⛔ hay cron. Bruno, 3-nov: «OC confirmada, se trae», y un botón
 * excepcional sólo para Admin para el producto sin OC. Sólo desde el corte de la marca; antes, `PRODUCTO_INGRESOS_PRUEBA` y sólo Admin. La regla vive en el motor (`motor/conexion.mjs`,
 * `motor/catalogo-ingresos.mjs`). ⛔ Archivo `_`: NO es una ruta. Quién puede lo chequea `api/_erp.js` con `permisoErpDe`.
 *
 *   GET  ?recurso=erp&vista=ingresos-productos&marca=bdi|zattia       la lista habitual (Admin y Administración)
 *   GET  ?recurso=erp&vista=ingresos-excepcional&marca=bdi|zattia     lo tocado desde el corte sin OC (sólo Admin)
 *   POST {recurso:'erp', accion:'importar-ingresos' | 'importar-ingresos-excepcional', marca, elegidos:[id de Ingresos]}
 *
 * 🔑 Mirar la lista lee las OC en ese momento, por el mismo camino del cron (`leerOcsDeMarca`). Importar deja entradas sus unidades y escrito el espejo (`_erp-stock-corte.js`).
 * 🔴 Stunned ⛔ opera en Ingresos: ⛔ se ofrece. Las OC viven en la base de BDI para las dos marcas ⇒ Zattia abre las dos.
 * 🔴 El token va sólo en la cabecera (`pedirExt`) y ⛔ aparece en ningún error.
 */
import { refrescarStockDeCorte } from './_erp-stock-corte.js'
import { leerOcsDeMarca } from './_ingresos-lectura.js'

const motor = () => import('../motor/conexion.mjs')
const TOKEN = { bdi: 'INGRESOS_TOKEN_BDI', zattia: 'INGRESOS_TOKEN_ZATTIA' }
const MAX_ELEGIDOS = 300

const textoDelError = (e) => {
  if (e?.code === 'otro_negocio') return 'El token de Ingresos es de otro negocio.'
  if (e?.status === 401) return 'Ingresos rechazó el token: hay que pedir uno nuevo.'
  if (e?.status) return `Ingresos contestó ${e.status}${e.code ? ` (${e.code})` : ''}.`
  throw e
}

async function conLasDosBases(marca, deps, fn) {
  const correr = (control) => deps.conMotor(marca, 'Actualizar Ingresos', (db) => fn(control ?? db, db))
  return marca === 'bdi' ? correr(null) : deps.conMotor('bdi', 'Actualizar Ingresos', correr)
}

async function correr(marca, deps, fn) {
  if (!TOKEN[marca]) return { status: 400, error: 'Marca inválida' }
  const token = process.env[TOKEN[marca]]
  if (!token) return { status: 409, error: 'Falta el token de Ingresos de esta marca.' }
  try {
    return await conLasDosBases(marca, deps, (control, db) => fn({ control, db, negocio: marca, token }))
  } catch (e) {
    return { status: 502, error: textoDelError(e) }
  }
}

/** El plazo para las OC al apretar: la función tiene 30 s, y lo que ⛔ entre lo toma la vuelta de la hora. */
const PLAZO_OC_MS = 8_000

/**
 * @param {{ marca: string, modo?: 'habitual'|'excepcional', admin: boolean }} p
 * @param {{ conMotor: Function, leerOcs?: Function, refrescar?: Function }} deps
 */
export async function productosDeIngresos({ marca, modo = 'habitual', admin }, deps) {
  const { leerParaImportar, puedeImportar } = await motor()
  const leerOcs = deps.leerOcs ?? leerOcsDeMarca
  const refrescar = deps.refrescar ?? refrescarStockDeCorte
  return correr(marca, deps, async (a) => {
    // ⛔ se le pregunta nada a Ingresos si no corresponde.
    const p = await puedeImportar({ db: a.db, negocio: marca, admin, modo })
    if (!p.manda) return p
    // 🔑 Una falla de las OC ⛔ esconde la lista: la lista dice lo último guardado, y avisa.
    let oc_error = null
    try {
      const { skus } = await leerOcs({ store: marca, token: a.token, hasta: Date.now() + PLAZO_OC_MS })
      if (skus.length) await refrescar({ marca, skus, espera: 8_000 })
    } catch (e) {
      console.error(`[erp-ingresos] ${marca}: las OC ⛔ se pudieron leer al apretar (${e?.status ?? e?.message ?? 'error'})`)
      oc_error = 'No se pudieron leer las órdenes de compra recién: la lista puede estar atrasada.'
    }
    const lista = await leerParaImportar({ ...a, admin, modo })
    return oc_error ? { ...lista, oc_error } : lista
  })
}

/**
 * @param {{ body: any, usuario: string|null, modo?: 'habitual'|'excepcional', admin: boolean }} p
 * @param {{ conMotor: Function, refrescar?: Function }} deps
 */
export async function importarDeIngresosErp({ body, usuario, modo = 'habitual', admin }, deps) {
  const { marca, elegidos } = body ?? {}
  if (!Array.isArray(elegidos) || !elegidos.length || elegidos.length > MAX_ELEGIDOS || !elegidos.every((x) => /^\d{1,18}$/.test(String(x)))) return { status: 400, error: 'No hay productos elegidos.' }
  if (!usuario) return { status: 400, error: 'No sé quién importa.' }
  const { importarDeIngresos } = await motor()
  const r = await correr(marca, deps, (a) => importarDeIngresos({ ...a, elegidos: elegidos.map(Number), usuario, admin, modo }))
  if (r.status || !r.manda || !r.skus?.length) return r
  // 🔑 El producto YA entró: una falla acá ⛔ lo deshace. Se dice, y lo termina la vuelta de la hora.
  try {
    return { ...r, stock: await (deps.refrescar ?? refrescarStockDeCorte)({ marca, skus: r.skus, espera: 12_000 }) }
  } catch (e) {
    console.error(`[erp-ingresos] ${marca}: importado, sin refrescar el stock (${e?.message ?? 'error'})`)
    return { ...r, stock: { corrio: true, libro: false, filas: 0, unidades: 0 } }
  }
}

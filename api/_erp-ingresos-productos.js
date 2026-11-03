/**
 * ERP › Stock › Ingresos de mercadería › Actualizar Ingresos (sólo admin, lo chequea `api/_erp.js`): lo que Ingresos tiene y el ERP ⛔, para elegir e importar. A pedido, ⛔ hay cron (Bruno, 3-nov:
 * «actualizar ingresos, y los seleccionas y lo importas, pq estimo que en ingresos también existe la precarga»). Sólo desde el corte de la marca. La regla vive en el motor
 * (`motor/conexion.mjs`, `motor/catalogo-ingresos.mjs`). ⛔ Archivo `_`: NO es una ruta.
 *
 *   GET  ?recurso=erp&vista=ingresos-productos&marca=bdi|zattia     la lista (⛔ escribe)
 *   POST {recurso:'erp', accion:'importar-ingresos', marca, elegidos:[id de Ingresos]}
 *
 * 🔴 Stunned ⛔ opera en Ingresos: ⛔ se ofrece. Las OC viven en la base de BDI para las dos marcas ⇒ Zattia abre las dos.
 * 🔴 El token va sólo en la cabecera (`pedirExt`) y ⛔ aparece en ningún error.
 */
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

export async function productosDeIngresos({ marca }, deps) {
  const { leerParaImportar } = await motor()
  return correr(marca, deps, (a) => leerParaImportar(a))
}

export async function importarDeIngresosErp({ body, usuario }, deps) {
  const { marca, elegidos } = body ?? {}
  if (!Array.isArray(elegidos) || !elegidos.length || elegidos.length > MAX_ELEGIDOS || !elegidos.every((x) => /^\d{1,18}$/.test(String(x)))) return { status: 400, error: 'No hay productos elegidos.' }
  if (!usuario) return { status: 400, error: 'No sé quién importa.' }
  const { importarDeIngresos } = await motor()
  return correr(marca, deps, (a) => importarDeIngresos({ ...a, elegidos: elegidos.map(Number), usuario }))
}

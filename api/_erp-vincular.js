/**
 * ERP › Productos › Vincular (sólo admin, lo chequea `api/_erp.js`): qué variante del ERP es cada variante de Tienda Nube, contra la
 * base del motor (sql/076). Desde el corte nadie más vincula: el próximo iPhone se resuelve acá. La regla vive en el motor
 * (`motor/tn/vinculo-db.mjs`); acá sólo se valida la forma del pedido. ⛔ Archivo `_`: NO es una ruta.
 *
 *   GET  ?recurso=erp&vista=vinculos&marca=bdi|zattia&tienda=…            lo que falta vincular y lo ya elegido
 *   GET  ?recurso=erp&vista=vinculos-buscar&marca=…&tienda=…&q=…          las variantes del ERP de esa línea
 *   POST {recurso:'erp', accion:'poner-vinculo', marca, tienda, variant_id, product_id, size_id}
 */
const motor = () => import('../motor/tn/vinculo-db.mjs')
const MARCAS = ['bdi', 'zattia']
const TIENDAS_DE = { bdi: ['bdi'], zattia: ['zattia', 'stunned'] }
const STATUS = { NO_ENCONTRADA: 404, TIENDA_DESCONOCIDA: 400, VARIANTE_DESCONOCIDA: 400 }

const envolver = (pg) => ({ q: async (sql, p) => (await pg.query(sql, p)).rows })
const delMotor = (r) => (r.ok ? r : { status: STATUS[r.error.codigo] || 409, error: r.error.mensaje, codigo: r.error.codigo })
const invalido = (marca, tienda) => (!MARCAS.includes(marca) ? 'Marca inválida' : !TIENDAS_DE[marca].includes(tienda) ? 'Esa tienda no es de esta marca' : null)
const idValido = (x) => /^\d{1,18}$/.test(String(x ?? ''))

export async function vinculosDeTienda({ marca, tienda }, deps) {
  const mal = invalido(marca, tienda)
  if (mal) return { status: 400, error: mal }
  const { leerVinculos } = await motor()
  return deps.conMotor(marca, 'Vincular', async (pg) => delMotor(await leerVinculos(envolver(pg), { tienda })))
}

export async function buscarVariantesVinculo({ marca, tienda, q }, deps) {
  const mal = invalido(marca, tienda)
  if (mal) return { status: 400, error: mal }
  const { buscarVariantes } = await motor()
  return deps.conMotor(marca, 'Vincular', async (pg) => delMotor(await buscarVariantes(envolver(pg), { tienda, texto: q })))
}

export async function ponerVinculoErp({ body, usuario }, deps) {
  const { marca, tienda, variant_id, product_id, size_id } = body ?? {}
  const mal = invalido(marca, tienda)
  if (mal) return { status: 400, error: mal }
  if (![variant_id, product_id, size_id].every(idValido)) return { status: 400, error: 'Faltan la variante de Tienda Nube y la del ERP.' }
  const { guardarVinculoDelERP } = await motor()
  return deps.conMotor(marca, 'Vincular', async (pg) => delMotor(await guardarVinculoDelERP(envolver(pg), {
    tienda, variant_id: Number(variant_id), product_id: Number(product_id), size_id: Number(size_id), usuario: usuario || null,
  })))
}

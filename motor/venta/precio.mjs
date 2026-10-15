/**
 * CARGAR precio y costo en el ERP (paso 5; pedido de B, contrato §13; `sql/009` + `sql/011`). Cada carga es una fila NUEVA
 * (`fuente = 'carga'`, inmutable): corregir es cargar otra. Lo cargado manda sobre las copias (GN y TN ⛔ lo pisan).
 *
 * `vigente_desde` opcional (un precio que empieza a valer el lunes); sin él, ya. Devuelven `{ ok: true, precio|costo,
 * vigente }` —`vigente` es lo que dice la vista DESPUÉS de cargar: con un `vigente_desde` futuro, sigue el anterior— o
 * `{ ok: false, error }`. Sólo lanzan si la BASE falla.
 * ⛔ se valida que el producto esté en el espejo de GN: después del corte nace en TN o en Ingresos.
 */
const q = async (db, sql, params = []) => (await db.query(sql, params)).rows
const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Lo común de las dos cargas. Devuelve la falla, o los valores limpios. */
async function validar(db, e, campoMonto) {
  if (!e || typeof e !== 'object') return { falla: falla('ENTRADA_INVALIDA', 'Falta la carga') }
  const pid = Number(e.product_id)
  if (!Number.isSafeInteger(pid) || pid <= 0) return { falla: falla('ENTRADA_INVALIDA', 'Producto inválido', 'product_id') }
  const monto = e[campoMonto] === '' || e[campoMonto] == null ? NaN : Number(e[campoMonto])
  if (!Number.isFinite(monto) || monto < 0) return { falla: falla('ENTRADA_INVALIDA', `${campoMonto === 'precio' ? 'Precio' : 'Costo'} inválido`, campoMonto) }
  const usuario = texto(e.usuario)
  if (!usuario) return { falla: falla('ENTRADA_INVALIDA', 'Falta quién carga', 'usuario') }
  let desde = null
  if (e.vigente_desde != null && e.vigente_desde !== '') {
    if (Number.isNaN(Date.parse(e.vigente_desde))) return { falla: falla('ENTRADA_INVALIDA', 'Fecha inválida', 'vigente_desde') }
    desde = new Date(e.vigente_desde).toISOString()
  }
  const [m] = await q(db, 'select empresa_id from marca where id = $1', [String(e.marca ?? '')])
  if (!m) return { falla: falla('MARCA_DESCONOCIDA', `Marca desconocida: ${e.marca}`, 'marca') }
  return { pid, monto: Math.round(monto * 100) / 100, usuario, desde, empresa: m.empresa_id, motivo: texto(e.motivo) }
}

/**
 * @param {import('pg').ClientBase} db
 * @param {{ marca: string, product_id: number, lista: string, precio: number, vigente_desde?: string, usuario: string, motivo?: string }} e
 */
export async function cargarPrecio(db, e) {
  const v = await validar(db, e, 'precio')
  if (v.falla) return v.falla
  const lista = texto(e.lista)
  const [l] = lista ? await q(db, 'select id from lista_precio where empresa_id = $1 and id = $2', [v.empresa, lista]) : []
  if (!l) return falla('LISTA_DESCONOCIDA', `Lista desconocida: ${e.lista}`, 'lista')
  const [fila] = await q(db,
    `insert into producto_precio (empresa_id, marca, product_id, lista, precio, vigente_desde, usuario, motivo, fuente)
     values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), $7, $8, 'carga') returning *`,
    [v.empresa, e.marca, v.pid, lista, v.monto, v.desde, v.usuario, v.motivo])
  const [vigente] = await q(db, 'select * from precio_vigente where marca = $1 and product_id = $2 and lista = $3', [e.marca, v.pid, lista])
  return { ok: true, precio: fila, vigente: vigente ?? null }
}

/**
 * @param {import('pg').ClientBase} db
 * @param {{ marca: string, product_id: number, costo: number, proveedor?: string, vigente_desde?: string, usuario: string, motivo?: string }} e
 */
export async function cargarCosto(db, e) {
  const v = await validar(db, e, 'costo')
  if (v.falla) return v.falla
  const [fila] = await q(db,
    `insert into producto_costo (empresa_id, marca, product_id, costo, proveedor, vigente_desde, usuario, motivo, fuente)
     values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), $7, $8, 'carga') returning *`,
    [v.empresa, e.marca, v.pid, v.monto, texto(e.proveedor), v.desde, v.usuario, v.motivo])
  const [vigente] = await q(db, 'select * from costo_vigente where marca = $1 and product_id = $2', [e.marca, v.pid])
  return { ok: true, costo: fila, vigente: vigente ?? null }
}

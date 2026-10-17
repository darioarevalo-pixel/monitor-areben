/**
 * CARGAR precio y costo en el ERP (paso 5; pedido de B, contrato §13; `sql/009` + `sql/011`). Cada carga es una fila NUEVA
 * (`fuente = 'carga'`, inmutable): corregir es cargar otra. Lo cargado manda sobre las copias (GN y TN ⛔ lo pisan).
 *
 * `vigente_desde` opcional (un precio que empieza a valer el lunes); sin él, ya. Devuelven `{ ok: true, precio|costo,
 * vigente }` —`vigente` es lo que dice la vista DESPUÉS de cargar: con un `vigente_desde` futuro, sigue el anterior— o
 * `{ ok: false, error }`. Sólo lanzan si la BASE falla.
 * ⛔ se valida que el producto esté en el espejo de GN: después del corte nace en TN o en Ingresos.
 * `soltarPrecio` (018) deshace una carga: la lista vuelve a seguir a su copia.
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
 * SOLTAR el precio cargado de una lista (`sql/018`): una fila `fuente = 'suelta'` (sin precio, inmutable como las demás)
 * tapa a la carga ⇒ la lista vuelve a SEGUIR a la suya (`local` → `oferta`, lo que cobra TN); en una lista que ⛔ sigue a
 * nadie, la próxima copia (GN o TN) vuelve a escribir. Sólo se suelta lo que hoy VALE cargado (`precio_vigente` con
 * `fuente = 'carga'`); otra cosa ⇒ `NO_CARGADO` (⛔ se escribe nada). Devuelve `{ ok: true, suelta, vigente }` —`vigente`
 * es la fila de `precio_lista` después— o `{ ok: false, error }`.
 * @param {import('pg').ClientBase} db
 * @param {{ marca: string, product_id: number, lista: string, usuario: string, motivo?: string }} e
 */
export async function soltarPrecio(db, e) {
  const v = await validar(db, { ...e, precio: 0 }, 'precio')
  if (v.falla) return v.falla
  const lista = texto(e.lista)
  const [l] = lista ? await q(db, 'select id from lista_precio where empresa_id = $1 and id = $2', [v.empresa, lista]) : []
  if (!l) return falla('LISTA_DESCONOCIDA', `Lista desconocida: ${e.lista}`, 'lista')
  const [s018] = await q(db, `select exists (select 1 from pg_constraint where conname = 'producto_precio_suelta_sin_precio') as hay`)
  if (!s018.hay) return falla('FALTA_MIGRACION', 'Falta `sql/018-precio-oferta.sql` en esta base')
  const [ahora] = await q(db, 'select fuente from precio_vigente where marca = $1 and product_id = $2 and lista = $3', [e.marca, v.pid, lista])
  if (ahora?.fuente !== 'carga') return falla('NO_CARGADO', 'Ese precio no está cargado en el ERP: ya sigue a su copia', 'lista')
  const [fila] = await q(db,
    `insert into producto_precio (empresa_id, marca, product_id, lista, precio, usuario, motivo, fuente)
     values ($1, $2, $3, $4, null, $5, $6, 'suelta') returning *`,
    [v.empresa, e.marca, v.pid, lista, v.usuario, v.motivo])
  const [vigente] = await q(db, 'select * from precio_lista where marca = $1 and product_id = $2 and lista = $3', [e.marca, v.pid, lista])
  return { ok: true, suelta: fila, vigente: vigente ?? null }
}

/**
 * @param {import('pg').ClientBase} db
 * @param {{ marca: string, product_id: number, costo: number, proveedor?: string, proveedor_id?: number, vigente_desde?: string, usuario: string, motivo?: string }} e
 */
export async function cargarCosto(db, e) {
  const v = await validar(db, e, 'costo')
  if (v.falla) return v.falla
  // Con 013 el proveedor es una FICHA (`proveedor_id`, de la misma empresa); su nombre queda también en el texto.
  let proveedor = texto(e.proveedor), proveedorId = null
  if (e.proveedor_id != null && e.proveedor_id !== '') {
    const id = Number(e.proveedor_id)
    const [p] = Number.isSafeInteger(id) && id > 0 ? await q(db, 'select id, nombre from proveedor where empresa_id = $1 and id = $2', [v.empresa, id]) : []
    if (!p) return falla('PROVEEDOR_DESCONOCIDO', 'Ese proveedor no está en la lista', 'proveedor_id')
    proveedor = p.nombre
    proveedorId = Number(p.id)
  }
  const conId = proveedorId != null
  const [fila] = await q(db,
    `insert into producto_costo (empresa_id, marca, product_id, costo, proveedor, vigente_desde, usuario, motivo, fuente${conId ? ', proveedor_id' : ''})
     values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), $7, $8, 'carga'${conId ? ', $9' : ''}) returning *`,
    [v.empresa, e.marca, v.pid, v.monto, proveedor, v.desde, v.usuario, v.motivo, ...(conId ? [proveedorId] : [])])
  const [vigente] = await q(db, 'select * from costo_vigente where marca = $1 and product_id = $2', [e.marca, v.pid])
  return { ok: true, costo: fila, vigente: vigente ?? null }
}

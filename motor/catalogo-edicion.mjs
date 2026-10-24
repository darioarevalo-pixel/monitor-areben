/**
 * EDITAR EL PRODUCTO EN EL ERP (paso 5; Bruno 20-oct: «se tiene que poder hacer»). Tablas: sql/012 (`producto`, `variante`)
 * y sql/037 (`catalogo_edicion`, una fila inmutable por campo cambiado: antes, después, quién, cuándo).
 *
 * - `editarProducto`: nombre, categoría, activo. · `editarVariante`: talle, SKU, código de barras, activa.
 * - `agregarVariante`: una variante nueva (id desde `catalogo_id`, ⛔ choca con GN).
 * - ⛔ Crear productos: nacen en Ingresos. ⛔ Proveedor y costo: nacen en Ingresos (reglas-vigentes). ⛔ Mueven stock ni plata.
 * - El código de barras es la llave de la variante para el mundo: ⛔ puede repetirse en la empresa (`BARCODE_REPETIDO`).
 *   El SKU sí se repite (BDI 30, Zattia 16 ya repetidos en GN): se avisa, ⛔ se frena.
 * - 🔴 Editar una fila que vino de GN la pasa a `carga`: si no, la próxima copia deshace la edición (el resultado trae
 *   `desde_gn: true`). Repetir la misma edición ⛔ escribe nada (`cambios: []`).
 *
 * Todo verbo recibe `db` (cliente pg, sin transacción abierta) y devuelve `{ ok: true, … }` o `{ ok: false, error: {
 * codigo, mensaje, campo? } }`. ⛔ lanza por una entrada inválida.
 */

const falla = (codigo, mensaje, campo) => ({ ok: false, error: { codigo, mensaje, ...(campo ? { campo } : {}) } })
const q = async (db, sql, params = []) => (await db.query(sql, params)).rows

async function enTransaccion(db, fn) {
  await db.query('begin')
  try {
    const r = await fn()
    await db.query(r && r.ok ? 'commit' : 'rollback')
    return r
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
}

const texto = (v) => (v == null ? null : (String(v).trim() || null))
const entero = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null)
const mostrar = (v) => (v == null ? null : String(v))

const CAMPOS_PRODUCTO = ['nombre', 'categoria', 'activo']
const CAMPOS_VARIANTE = ['talle', 'sku', 'barcode', 'activa']

/**
 * Valida y normaliza `cambios` contra la lista de campos. Puro.
 * @returns {{ ok: true, cambios: object } | { ok: false, error: object }}
 */
export function normalizarCambios(cambios, campos, { obligatorio = [] } = {}) {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) return falla('ENTRADA_INVALIDA', 'Faltan los cambios', 'cambios')
  const raros = Object.keys(cambios).filter((k) => !campos.includes(k))
  if (raros.length) return falla('CAMPO_NO_EDITABLE', `No se edita: ${raros.join(', ')}`, raros[0])
  const out = {}
  for (const [k, v] of Object.entries(cambios)) {
    if (k === 'activo' || k === 'activa') {
      if (typeof v !== 'boolean') return falla('ENTRADA_INVALIDA', 'Activo es sí o no', k)
      out[k] = v
    } else {
      const t = texto(v)
      if (t == null && obligatorio.includes(k)) return falla('ENTRADA_INVALIDA', `Falta ${k}`, k)
      out[k] = t
    }
  }
  if (!Object.keys(out).length) return falla('ENTRADA_INVALIDA', 'No hay nada que cambiar', 'cambios')
  return { ok: true, cambios: out }
}

async function contexto(db, marca, usuario) {
  if (!texto(marca)) return falla('ENTRADA_INVALIDA', 'Falta la marca', 'marca')
  const quien = texto(usuario)
  if (!quien) return falla('ENTRADA_INVALIDA', 'Falta quién lo cambia', 'usuario')
  const [m] = await q(db, 'select empresa_id from marca where id = $1', [marca])
  if (!m) return falla('NO_ENCONTRADO', `Marca desconocida: ${marca}`, 'marca')
  return { ok: true, empresa_id: m.empresa_id, usuario: quien }
}

const anotar = (db, { empresa_id, entidad, product_id, size_id = null, campo, antes, despues, desde_gn, usuario }) =>
  db.query(
    `insert into catalogo_edicion (empresa_id, entidad, product_id, size_id, campo, antes, despues, desde_gn, usuario)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [empresa_id, entidad, product_id, size_id, campo, mostrar(antes), mostrar(despues), desde_gn, usuario],
  )

/**
 * Edita un producto del catálogo propio.
 * @param {{ marca: string, product_id: number|string, cambios: { nombre?: string, categoria?: string|null, activo?: boolean }, usuario: string }} e
 * @returns {Promise<{ ok: true, cambios: {campo,antes,despues}[], desde_gn: boolean } | { ok: false, error: object }>}
 */
export async function editarProducto(db, e) {
  const cx = await contexto(db, e?.marca, e?.usuario)
  if (!cx.ok) return cx
  const id = entero(e.product_id)
  if (id == null) return falla('ENTRADA_INVALIDA', 'Falta el producto', 'product_id')
  const n = normalizarCambios(e.cambios, CAMPOS_PRODUCTO, { obligatorio: ['nombre'] })
  if (!n.ok) return n
  return enTransaccion(db, async () => {
    const [p] = await q(db, 'select * from producto where empresa_id = $1 and id = $2 and marca = $3 for update', [cx.empresa_id, id, e.marca])
    if (!p) return falla('NO_ENCONTRADO', 'No existe ese producto en esa marca', 'product_id')
    const hechos = Object.entries(n.cambios).filter(([k, v]) => (p[k] ?? null) !== v).map(([campo, despues]) => ({ campo, antes: p[campo] ?? null, despues }))
    if (!hechos.length) return { ok: true, cambios: [], desde_gn: false }
    const desde_gn = p.fuente === 'gn'
    const sets = hechos.map((h, i) => `${h.campo} = $${i + 3}`)
    await db.query(
      `update producto set ${sets.join(', ')}, fuente = 'carga', actualizado_en = now(), usuario = $${hechos.length + 3} where empresa_id = $1 and id = $2`,
      [cx.empresa_id, id, ...hechos.map((h) => h.despues), cx.usuario],
    )
    for (const h of hechos) await anotar(db, { empresa_id: cx.empresa_id, entidad: 'producto', product_id: id, ...h, desde_gn, usuario: cx.usuario })
    return { ok: true, cambios: hechos, desde_gn }
  })
}

/** El código de barras que ya tiene OTRA variante de la empresa (con el candado de esa empresa tomado). */
async function dueñoDelBarcode(db, empresa_id, barcode, salvo) {
  const [o] = await q(
    db,
    `select product_id::bigint as product_id, size_id::bigint as size_id from variante where empresa_id = $1 and barcode = $2
       and not (product_id = $3 and size_id = $4)`,
    [empresa_id, barcode, salvo?.product_id ?? -1, salvo?.size_id ?? -1],
  )
  return o ? { product_id: Number(o.product_id), size_id: Number(o.size_id) } : null
}

const repetido = (o) => ({ ok: false, error: { codigo: 'BARCODE_REPETIDO', mensaje: 'Ese código de barras ya es de otra variante', campo: 'barcode', otra: o } })

const lockBarcode = (db, empresa_id) => db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`catalogo-barcode:${empresa_id}`])

/** ¿Otra variante usa el mismo SKU? (aviso, ⛔ freno). */
async function skuRepetido(db, empresa_id, sku, salvo) {
  if (!sku) return false
  const [r] = await q(
    db,
    `select count(*)::int as n from variante where empresa_id = $1 and upper(sku) = upper($2) and not (product_id = $3 and size_id = $4)`,
    [empresa_id, sku, salvo?.product_id ?? -1, salvo?.size_id ?? -1],
  )
  return r.n > 0
}

/**
 * Edita una variante: talle, SKU, código de barras, activa.
 * @param {{ marca: string, product_id: number|string, size_id: number|string, cambios: { talle?: string, sku?: string|null, barcode?: string|null, activa?: boolean }, usuario: string }} e
 */
export async function editarVariante(db, e) {
  const cx = await contexto(db, e?.marca, e?.usuario)
  if (!cx.ok) return cx
  const pid = entero(e.product_id)
  const sid = entero(e.size_id)
  if (pid == null) return falla('ENTRADA_INVALIDA', 'Falta el producto', 'product_id')
  if (sid == null) return falla('ENTRADA_INVALIDA', 'Falta la variante', 'size_id')
  const n = normalizarCambios(e.cambios, CAMPOS_VARIANTE)
  if (!n.ok) return n
  return enTransaccion(db, async () => {
    if ('barcode' in n.cambios) await lockBarcode(db, cx.empresa_id)
    const [v] = await q(
      db,
      `select v.* from variante v join producto p on p.empresa_id = v.empresa_id and p.id = v.product_id
        where v.empresa_id = $1 and v.product_id = $2 and v.size_id = $3 and p.marca = $4 for update of v`,
      [cx.empresa_id, pid, sid, e.marca],
    )
    if (!v) return falla('NO_ENCONTRADO', 'No existe esa variante en esa marca', 'size_id')
    const hechos = Object.entries(n.cambios).filter(([k, val]) => (v[k] ?? null) !== val).map(([campo, despues]) => ({ campo, antes: v[campo] ?? null, despues }))
    if (!hechos.length) return { ok: true, cambios: [], desde_gn: false, avisos: [] }
    const nuevoBarcode = hechos.find((h) => h.campo === 'barcode')?.despues
    if (nuevoBarcode) {
      const otra = await dueñoDelBarcode(db, cx.empresa_id, nuevoBarcode, { product_id: pid, size_id: sid })
      if (otra) return repetido(otra)
    }
    const avisos = []
    const nuevoSku = hechos.find((h) => h.campo === 'sku')?.despues
    if (nuevoSku && (await skuRepetido(db, cx.empresa_id, nuevoSku, { product_id: pid, size_id: sid }))) avisos.push('SKU_REPETIDO')
    const desde_gn = v.fuente === 'gn'
    const sets = hechos.map((h, i) => `${h.campo} = $${i + 4}`)
    await db.query(
      `update variante set ${sets.join(', ')}, fuente = 'carga', actualizado_en = now(), usuario = $${hechos.length + 4}
        where empresa_id = $1 and product_id = $2 and size_id = $3`,
      [cx.empresa_id, pid, sid, ...hechos.map((h) => h.despues), cx.usuario],
    )
    for (const h of hechos) await anotar(db, { empresa_id: cx.empresa_id, entidad: 'variante', product_id: pid, size_id: sid, ...h, desde_gn, usuario: cx.usuario })
    return { ok: true, cambios: hechos, desde_gn, avisos }
  })
}

/**
 * Agrega una variante a un producto. El `size_id` sale de `catalogo_id` (≥ 1.000.000.000).
 * @param {{ marca: string, product_id: number|string, talle: string, sku?: string, barcode?: string, usuario: string }} e
 * @returns {Promise<{ ok: true, variante: { product_id, size_id, talle, sku, barcode }, avisos: string[] } | { ok: false, error: object }>}
 */
export async function agregarVariante(db, e) {
  const cx = await contexto(db, e?.marca, e?.usuario)
  if (!cx.ok) return cx
  const pid = entero(e.product_id)
  if (pid == null) return falla('ENTRADA_INVALIDA', 'Falta el producto', 'product_id')
  const talle = texto(e.talle)
  if (!talle) return falla('ENTRADA_INVALIDA', 'Falta el talle', 'talle')
  const sku = texto(e.sku)
  const barcode = texto(e.barcode)
  return enTransaccion(db, async () => {
    if (barcode) await lockBarcode(db, cx.empresa_id)
    const [p] = await q(db, 'select id from producto where empresa_id = $1 and id = $2 and marca = $3 for update', [cx.empresa_id, pid, e.marca])
    if (!p) return falla('NO_ENCONTRADO', 'No existe ese producto en esa marca', 'product_id')
    const [t] = await q(db, `select 1 from variante where empresa_id = $1 and product_id = $2 and lower(talle) = lower($3)`, [cx.empresa_id, pid, talle])
    if (t) return falla('TALLE_REPETIDO', 'Ese producto ya tiene ese talle', 'talle')
    if (barcode) {
      const otra = await dueñoDelBarcode(db, cx.empresa_id, barcode, null)
      if (otra) return repetido(otra)
    }
    const avisos = (await skuRepetido(db, cx.empresa_id, sku, null)) ? ['SKU_REPETIDO'] : []
    const [{ size_id }] = await q(db, `select nextval('catalogo_id')::bigint as size_id`)
    await db.query(
      `insert into variante (empresa_id, product_id, size_id, talle, sku, barcode, fuente, usuario) values ($1, $2, $3, $4, $5, $6, 'carga', $7)`,
      [cx.empresa_id, pid, size_id, talle, sku, barcode, cx.usuario],
    )
    await anotar(db, { empresa_id: cx.empresa_id, entidad: 'variante', product_id: pid, size_id, campo: 'alta', antes: null, despues: talle, desde_gn: false, usuario: cx.usuario })
    return { ok: true, variante: { product_id: pid, size_id: Number(size_id), talle, sku, barcode }, avisos }
  })
}

/** El historial de un producto y sus variantes, más nuevo primero: `[{ entidad, size_id, campo, antes, despues, usuario, creada_en, desde_gn }]`. */
export async function historialDeProducto(db, { marca, product_id, limite = 100 }) {
  const [m] = await q(db, 'select empresa_id from marca where id = $1', [marca])
  if (!m) return []
  return q(
    db,
    `select entidad, size_id::bigint as size_id, campo, antes, despues, usuario, creada_en, desde_gn from catalogo_edicion
      where empresa_id = $1 and product_id = $2 order by creada_en desc, id limit $3`,
    [m.empresa_id, entero(product_id) ?? -1, Math.min(Math.max(Number(limite) || 100, 1), 500)],
  )
}

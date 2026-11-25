/**
 * EL PROVEEDOR Y SU CÓDIGO, DE INGRESOS A LA FICHA (pedido de Darío, 23-nov; Bruno: «dale hacelo»). Cada producto de Ingresos
 * (`/products`) trae `supplier_id` (el 100%: Zattia 823/823, BDI 266/266) y, a veces, `supplier_code`. Antes ⛔ llegaban:
 * `importarElegidos` creaba el producto sin proveedor y `atarProveedores` sólo mira lo copiado de GN ⇒ los 52 de Zattia que
 * entraron por Ingresos (los bikinis de la OC 3067) quedaban «Sin proveedor».
 *
 * - El cruce es el SKU de la variante (como el costo, `planCostos`): un SKU que está en dos productos nuestros ⛔ se usa, y dos
 *   productos de Ingresos que caen en uno nuestro con datos distintos ⛔ se cargan (se cuentan en `distintos`).
 * - 🔴 PROVEEDOR: sólo al producto `carga` (el que nació en el ERP) que ⛔ tiene. Lo de GN lo ata `atarProveedores`, que en cada
 *   corrida RECALCULA las filas `gn` (lo que se le pusiera acá lo borraría) ⇒ ⛔ se toca. Uno ya puesto ⛔ se pisa.
 *   La ficha se busca por `proveedor.ingresos_id`; si Ingresos tiene un proveedor sin ficha acá, se cuenta (`sin_ficha`) ⛔ se crea.
 * - CÓDIGO (`producto.codigo_proveedor`, sql/095): de TODO producto que cruza, y sigue a Ingresos (es su dato, en el ERP ⛔ se
 *   edita). Un código vacío en Ingresos ⛔ borra el de acá.
 * - 🔑 Sin `escribir` corre LO MISMO en una transacción y la deshace: el seco cuenta exactamente lo que escribiría.
 */
const q = async (db, sql, params = []) => (await db.query(sql, params)).rows
const norm = (x) => String(x ?? '').trim().toUpperCase()
const texto = (x) => { const t = String(x ?? '').trim(); return t ? t.slice(0, 120) : null }

/** ¿Está la columna del código (sql/095)? Sin ella, sólo el proveedor. */
export async function hayCodigoProveedor(db) {
  const [h] = await q(db, `select exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'producto' and column_name = 'codigo_proveedor') as hay`)
  return !!h.hay
}

/**
 * De los productos de Ingresos a lo que le corresponde a cada producto nuestro. Puro.
 * @param {{ productos: Array<{ id: number, supplier_id?: number|string|null, supplier_code?: string|null, status?: string, variants?: Array<{ sku?: string|null }> }>,
 *   variantes: Array<{ sku: string, product_id: number|string }> }} o `variantes`: las del ERP de esa marca
 * @returns {{ leidos: number, sin_cruce: number, sku_compartido: number, distintos: Array<{ product_id: string, ingresos: number[] }>,
 *   fichas: Map<string, { proveedor: string|null, codigo: string|null, ingresos_id: number }> }}
 */
export function planFicha({ productos, variantes }) {
  const nuestros = new Map()
  for (const v of variantes) {
    const s = norm(v.sku)
    if (!s) continue
    if (!nuestros.has(s)) nuestros.set(s, new Set())
    nuestros.get(s).add(String(v.product_id))
  }
  const r = { leidos: 0, sin_cruce: 0, sku_compartido: 0, distintos: [], fichas: new Map() }
  const de = new Map()
  for (const p of productos) {
    if (p.status === 'deleted') continue
    r.leidos++
    const pids = new Set()
    for (const v of p.variants ?? []) {
      const m = nuestros.get(norm(v.sku))
      if (!m) continue
      if (m.size > 1) { r.sku_compartido++; continue }
      pids.add([...m][0])
    }
    if (!pids.size) { r.sin_cruce++; continue }
    const dato = { proveedor: p.supplier_id == null || p.supplier_id === '' ? null : String(p.supplier_id), codigo: texto(p.supplier_code), ingresos_id: Number(p.id) }
    for (const pid of pids) {
      if (!de.has(pid)) de.set(pid, [])
      de.get(pid).push(dato)
    }
  }
  for (const [pid, datos] of de) {
    const firma = new Set(datos.map((d) => `${d.proveedor}|${d.codigo}`))
    if (firma.size > 1) { r.distintos.push({ product_id: pid, ingresos: datos.map((d) => d.ingresos_id) }); continue }
    r.fichas.set(pid, datos[0])
  }
  return r
}

/**
 * Lleva el proveedor y el código de Ingresos a los productos de la marca. Ver el encabezado.
 * @param {import('pg').ClientBase} db la base de la marca, sin transacción abierta
 * @param {{ marca: 'bdi'|'zattia', productos: any[], escribir?: boolean, soloIds?: Array<number|string> }} o `soloIds`: sólo esos productos nuestros (el alta)
 */
export async function fichaDeIngresos(db, { marca, productos, escribir = false, soloIds = null }) {
  if (!['bdi', 'zattia'].includes(marca)) throw new Error(`fichaDeIngresos: marca inválida ${marca}`)
  const conCodigo = await hayCodigoProveedor(db)
  const conProveedor = !!(await q(db, `select to_regclass('public.proveedor') is not null as hay`))[0].hay
  const variantes = await q(db, `select v.sku, v.product_id from variante v join producto p on p.empresa_id = v.empresa_id and p.id = v.product_id
    where p.marca = $1 and v.sku is not null`, [marca])
  const plan = planFicha({ productos, variantes })
  const solo = soloIds ? new Set(soloIds.map(String)) : null
  const filas = [...plan.fichas].filter(([pid]) => !solo || solo.has(pid))
    .map(([pid, d]) => ({ product_id: pid, ingresos_proveedor: d.proveedor, codigo: d.codigo }))
  const r = { leidos: plan.leidos, cruzan: plan.fichas.size, sin_cruce: plan.sin_cruce, sku_compartido: plan.sku_compartido, distintos: plan.distintos.length,
    hay_codigo: conCodigo, proveedor_puesto: 0, sin_ficha: [], codigo_puesto: 0, codigo_cambia: 0, muestra: [] }
  if (!filas.length) return { ...r, escribio: false }
  const json = JSON.stringify(filas)
  await db.query('begin')
  try {
    await db.query(`select pg_advisory_xact_lock(hashtext('ficha-ingresos'))`)
    if (conProveedor) {
      // Los proveedores de Ingresos que ⛔ tienen ficha acá (sólo los de productos que la necesitan).
      r.sin_ficha = (await q(db, `select f.ingresos_proveedor as ingresos_id, count(*)::int as productos
        from jsonb_to_recordset($1::jsonb) as f(product_id bigint, ingresos_proveedor text, codigo text)
        join producto x on x.id = f.product_id and x.marca = $2 and x.fuente = 'carga' and x.proveedor_id is null
        where f.ingresos_proveedor is not null and not exists (select 1 from proveedor p where p.empresa_id = x.empresa_id and p.ingresos_id = f.ingresos_proveedor)
        group by 1 order by 2 desc, 1`, [json, marca]))
      const puestos = await q(db, `update producto x set proveedor_id = p.id, actualizado_en = now()
        from jsonb_to_recordset($1::jsonb) as f(product_id bigint, ingresos_proveedor text, codigo text), proveedor p
        where x.id = f.product_id and x.marca = $2 and x.fuente = 'carga' and x.proveedor_id is null
          and p.empresa_id = x.empresa_id and p.ingresos_id = f.ingresos_proveedor
        returning x.id, x.nombre, p.nombre as proveedor`, [json, marca])
      r.proveedor_puesto = puestos.length
      r.muestra = puestos.slice(0, 10).map((x) => ({ product_id: Number(x.id), nombre: x.nombre, proveedor: x.proveedor }))
    }
    if (conCodigo) {
      const donde = `from jsonb_to_recordset($1::jsonb) as f(product_id bigint, ingresos_proveedor text, codigo text)
        where x.id = f.product_id and x.marca = $2 and f.codigo is not null and x.codigo_proveedor is distinct from f.codigo`
      const [c] = await q(db, `select count(*) filter (where x.codigo_proveedor is null)::int as nuevos, count(*)::int as todos
        from producto x, jsonb_to_recordset($1::jsonb) as f(product_id bigint, ingresos_proveedor text, codigo text)
        where x.id = f.product_id and x.marca = $2 and f.codigo is not null and x.codigo_proveedor is distinct from f.codigo`, [json, marca])
      await db.query(`update producto x set codigo_proveedor = f.codigo, actualizado_en = now() ${donde}`, [json, marca])
      r.codigo_puesto = c.nuevos
      r.codigo_cambia = c.todos - c.nuevos
    }
    await db.query(escribir ? 'commit' : 'rollback')
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
  return { ...r, escribio: escribir }
}

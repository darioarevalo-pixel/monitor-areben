/**
 * El COSTO y el TIPO DE INGRESO que publica Ingresos (`GET /product-costs`, `entry_type` de `/suppliers`; Ger 2-nov §5.1). Reemplaza al
 * `costo_unitario` del aviso `oc.confirmada`, que ya ⛔ existe (`lib/costo-oc.mjs` queda para lo viejo).
 *
 * - Sólo es firme lo que trae `cost_confirmed_at`. Sin eso, o con costo 0, ⛔ se carga. ⚠️ La API ⛔ distingue las 143 estimaciones de Ger.
 * - El `product_id` es de Ingresos: se cruza por el SKU de sus variantes contra `variante` de ESA marca. Un SKU en dos productos
 *   nuestros (pasa en BDI) ⛔ se usa: ⛔ se sabe de cuál es. Dos costos distintos para un producto nuestro ⛔ se cargan.
 * - Va a `producto_costo` con `fuente = 'oc'`: la copia de GN y la de TN ya respetan esa fuente. La tabla es inmutable, así que el
 *   historial queda solo.
 * - 🔴 **Sólo se carga el producto SIN costo (Bruno, 3-nov):** los costos que ya están (los de GN) quedan como están, también en la
 *   recompra, hasta decidir FIFO. El corte ⛔ los pisa.
 * - 🔑 Sin `escribir` corre LO MISMO en una transacción y la deshace: el seco cuenta exactamente lo que escribiría.
 */
const q = async (db, sql, params = []) => (await db.query(sql, params)).rows

/** ❓ Bruno ⛔ decidió: `final_cost_ex_vat` incluye el flete (lo recomienda Ger para valuar), `cost_before_freight` es lo que se le paga al proveedor. Se cambia ACÁ. */
export const CAMPO_COSTO = 'final_cost_ex_vat'

/** Un costo de la API. @returns {{ costo: number } | { motivo: 'sin_confirmar' | 'sin_valor' | 'invalido' }} */
export function costoFirme(item, campo = CAMPO_COSTO) {
  if (!item?.cost_confirmed_at) return { motivo: 'sin_confirmar' }
  const v = item[campo]
  if (v == null) return { motivo: 'sin_valor' }
  if (!/^\d+(\.\d+)?$/.test(String(v))) return { motivo: 'invalido' }
  const costo = Math.round(Number(v) * 100) / 100
  return costo > 0 ? { costo } : { motivo: 'sin_valor' }
}

/**
 * Del costo de Ingresos a lo que se carga en cada producto nuestro. Puro.
 * @param {{ costos: any[], productos: Array<{ id: number, variants?: Array<{ sku?: string|null }> }>, variantes: Array<{ sku: string, product_id: number|string, empresa_id: string }>, campo?: string }} o
 */
export function planCostos({ costos, productos, variantes, campo = CAMPO_COSTO }) {
  const r = { leidos: costos.length, sin_confirmar: 0, sin_valor: 0, invalidos: 0, sin_cruce: [], sku_compartido: [], distintos: [], cargar: [] }
  const nuestros = new Map()
  for (const v of variantes) {
    const sku = String(v.sku).trim().toUpperCase()
    if (!nuestros.has(sku)) nuestros.set(sku, new Map())
    nuestros.get(sku).set(String(v.product_id), v)
  }
  const skusDe = new Map(productos.map((p) => [Number(p.id), (p.variants ?? []).map((x) => String(x?.sku ?? '').trim().toUpperCase()).filter(Boolean)]))
  const compartidos = new Set()
  const porProducto = new Map()
  for (const item of costos) {
    const f = costoFirme(item, campo)
    if (f.motivo) { r[f.motivo === 'invalido' ? 'invalidos' : f.motivo]++; continue }
    const aca = new Map()
    for (const sku of skusDe.get(Number(item.product_id)) ?? []) {
      const m = nuestros.get(sku)
      if (!m) continue
      if (m.size > 1) { compartidos.add(sku); continue }
      for (const [pid, v] of m) aca.set(pid, v)
    }
    if (!aca.size) { r.sin_cruce.push(Number(item.product_id)); continue }
    for (const [pid, v] of aca) {
      if (!porProducto.has(pid)) porProducto.set(pid, { v, pid, costos: new Set(), item })
      porProducto.get(pid).costos.add(f.costo)
    }
  }
  for (const x of porProducto.values()) {
    if (x.costos.size > 1) { r.distintos.push(x.pid); continue }
    r.cargar.push({ product_id: x.pid, empresa_id: x.v.empresa_id, costo: [...x.costos][0], ingresos_id: Number(x.item.product_id), confirmado_en: x.item.cost_confirmed_at })
  }
  r.sku_compartido = [...compartidos].sort()
  return r
}

/**
 * @param {import('pg').ClientBase} db la base de la marca, sin transacción abierta
 * @param {{ marca: 'bdi'|'zattia', costos: any[], productos: any[], escribir?: boolean, usuario?: string, campo?: string }} o
 */
export async function cargarCostosDeIngresos(db, { marca, costos, productos, escribir = false, usuario = 'ingresos-api', campo = CAMPO_COSTO }) {
  if (!['bdi', 'zattia'].includes(marca)) throw new Error(`marca inválida: ${marca}`)
  const skus = [...new Set(productos.flatMap((p) => (p.variants ?? []).map((x) => String(x?.sku ?? '').trim().toUpperCase()).filter(Boolean)))]
  const variantes = skus.length
    ? await q(db, `select upper(trim(v.sku)) as sku, v.product_id, p.empresa_id from variante v
        join producto p on p.empresa_id = v.empresa_id and p.id = v.product_id where p.marca = $1 and upper(trim(v.sku)) = any($2::text[])`, [marca, skus])
    : []
  const plan = planCostos({ costos, productos, variantes, campo })
  const { cargar, ...r } = plan
  Object.assign(r, { campo, productos: cargar.length, sin_costo: 0, ya_tienen: 0, muestra: [] })
  await db.query('begin')
  try {
    await db.query(`select pg_advisory_xact_lock(hashtext('costo-oc'))`)
    const ids = cargar.map((x) => x.product_id)
    const vigentes = new Map((ids.length ? await q(db, `select distinct on (product_id) product_id, costo::float as costo, fuente, proveedor, proveedor_id, creada_en from producto_costo
      where marca = $1 and product_id = any($2::bigint[]) and vigente_desde <= clock_timestamp() order by product_id, vigente_desde desc, creada_en desc`, [marca, ids]) : []).map((f) => [String(f.product_id), f]))
    const filas = []
    for (const x of cargar) {
      const ult = vigentes.get(String(x.product_id))
      if (ult && Number(ult.costo) > 0) { r.ya_tienen++; continue }
      r.sin_costo++
      if (r.muestra.length < 10) r.muestra.push({ product_id: Number(x.product_id), costo: x.costo })
      filas.push({ ...x, proveedor: ult?.proveedor ?? null, proveedor_id: ult?.proveedor_id ?? null })
    }
    if (filas.length) {
      await db.query(`insert into producto_costo (empresa_id, marca, product_id, costo, proveedor, proveedor_id, usuario, motivo, fuente)
        select f.empresa_id, $1, f.product_id, f.costo, f.proveedor, f.proveedor_id, $2, f.motivo, 'oc'
        from jsonb_to_recordset($3::jsonb) as f(empresa_id text, product_id bigint, costo numeric, proveedor text, proveedor_id bigint, motivo text)`,
      [marca, usuario, JSON.stringify(filas.map((x) => ({ ...x, motivo: `Ingresos: producto ${x.ingresos_id}, ${campo}, confirmado ${x.confirmado_en}` })))])
    }
    await db.query(escribir ? 'commit' : 'rollback')
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
  return { ...r, escribio: escribir }
}

/** El `entry_type` de cada proveedor, por `proveedor.ingresos_id`. Valor nuevo ⇒ se guarda igual (A.9). @returns {Promise<{ leidos: number, cambian: number, sin_cruce: number }>} */
export async function guardarTiposDeIngreso(db, { proveedores, escribir = false }) {
  const lista = proveedores.map((s) => ({ id: String(s.id), tipo: s.entry_type == null ? null : String(s.entry_type).slice(0, 40) }))
  const [c] = await q(db, `select count(*) filter (where p.id is null)::int as sin_cruce, count(*) filter (where p.id is not null and p.tipo_ingreso is distinct from f.tipo)::int as cambian
    from jsonb_to_recordset($1::jsonb) as f(id text, tipo text) left join proveedor p on p.ingresos_id = f.id`, [JSON.stringify(lista)])
  if (escribir && c.cambian) {
    await db.query(`update proveedor p set tipo_ingreso = f.tipo from jsonb_to_recordset($1::jsonb) as f(id text, tipo text)
      where p.ingresos_id = f.id and p.tipo_ingreso is distinct from f.tipo`, [JSON.stringify(lista)])
  }
  return { leidos: lista.length, cambian: c.cambian, sin_cruce: c.sin_cruce }
}

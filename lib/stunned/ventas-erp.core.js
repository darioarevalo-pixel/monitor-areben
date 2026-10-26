/**
 * **Las ventas de Stunned que nacen en el ERP, con la forma de GN** (hito «lecturas de GN → ERP»).
 *
 * Stunned es una línea `STU…` adentro del GN de Zattia. El día del corte GN deja de recibir sus ventas y
 * nacen en el motor (`venta.marca = 'stunned'`, `gn_sale_id` nulo). Memo, Norte y el parte leen `ventas` /
 * `venta_detalles` de GN con supabase-js ⇒ sin esto Stunned se queda en cero. Acá se piden al motor y se SUMAN
 * a lo de GN, con las mismas columnas, para que los núcleos (`ventaPorLinea`, `pylPorLinea`, `ventaDeAyer`)
 * ⛔ cambien.
 *
 * 🔑 Sólo `gn_sale_id is null`: una venta que ya vive en GN ⛔ se cuenta dos veces. `id_espejo` arranca en
 * 1.000.000.000 (sql/045) ⇒ no choca con un id de GN. Sólo `confirmada` y ⛔ `prueba` (el ensayo no es venta).
 * 🔑 Llave `LECTURAS_STUNNED_ERP=1`: APAGADA hasta el corte (antes, las ventas reales de Stunned siguen en GN).
 */

/** ¿Se suman las ventas del ERP? Sólo con la llave en `1` (el día del corte). */
/** @param {Record<string, string | undefined>} [env] */
export function lecturasStunnedErp(env = process.env) {
  return String((env && env.LECTURAS_STUNNED_ERP) || '') === '1'
}

const CANAL = `case v.canal when 'local' then 'Mi Local' when 'online' then 'Tienda Nube' when 'mayorista' then 'Mayorista'
              when 'ml' then 'Mercadolibre' when 'gn_whatsapp' then 'Whatsapp' when 'gn_ninguno' then 'Ninguno'
              when 'gn_influencer' then 'Influencer' else v.canal end`

const FILTRO = `v.marca = 'stunned' and v.gn_sale_id is null and v.estado = 'confirmada' and not v.prueba
       and (v.ocurrida_en at time zone 'America/Argentina/Buenos_Aires')::date between $1::date and $2::date`

/** Las ventas, con las columnas de `ventas` de GN que leen memo, Norte y parte. Mismo medio y cuenta que `espejo_motor.ventas`. */
export const SQL_VENTAS = `select v.id_espejo::integer as id,
       (v.ocurrida_en at time zone 'America/Argentina/Buenos_Aires')::date::text as date_sale,
       ${CANAL} as channel,
       coalesce((v.detalle->>'descuento')::numeric, t.descuento, 0)::numeric as discount,
       coalesce((v.detalle->>'envio')::numeric, 0)::numeric as shipping_cost,
       pg.medio_gn as payment_method,
       pg.cuenta as account_display,
       t.costo::numeric as total_cost,
       v.total::numeric as total_price
  from venta v
  left join lateral (
    select sum(l.cantidad * l.costo_unitario) as costo, sum(l.descuento + l.rebaja) as descuento
      from venta_linea l where l.venta_id = v.id
  ) t on true
  left join lateral (
    select cc.nombre as cuenta,
           case when cc.nombre ilike '%mercado%pago%' then 'MercadoPago' when cc.nombre ilike '%pago%nube%' then 'PagoNube'
                when coalesce(p.medio, cc.medio) = 'efectivo' then 'Contado/Efectivo'
                when coalesce(p.medio, cc.medio) = 'transferencia' then 'Transferencia Bancaria'
                when coalesce(p.medio, cc.medio) = 'debito' then 'Tarjeta de Débito'
                when coalesce(p.medio, cc.medio) = 'credito' then 'Tarjeta de Crédito'
                when coalesce(p.medio, cc.medio) = 'cuenta' then 'Cuenta Corriente'
                else 'Otro' end as medio_gn
      from venta_pago_vigente p join cuenta_cobro cc on cc.id = p.cuenta_cobro_id
     where p.venta_id = v.id order by p.monto desc, p.id limit 1
  ) pg on true
 where ${FILTRO}
 order by v.id_espejo`

/** Los renglones de esas mismas ventas. */
export const SQL_DETALLES = `select v.id_espejo::integer as sale_id, l.product_id::integer as product_id,
       l.size_id::integer as size_id, va.talle as size,
       l.cantidad::integer as quantity, l.precio::numeric as unit_price, l.importe::numeric as total
  from venta_linea l join venta v on v.id = l.venta_id
  left join variante va on va.empresa_id = v.empresa_id and va.product_id = l.product_id and va.size_id = l.size_id
 where ${FILTRO}
 order by v.id_espejo, l.n`

/** El SKU de cada producto de Stunned (la línea se decide por el prefijo `STU`). */
export const SQL_SKUS = `select distinct on (va.product_id) va.product_id::integer as product_id, va.sku
  from variante va join marca m on m.empresa_id = va.empresa_id
 where m.id = 'stunned' and va.sku is not null and va.sku <> ''
 order by va.product_id, va.sku`

const num = (x) => (x === null || x === undefined ? x : Number(x))

/** Las filas del motor, con los números como número (pg devuelve `numeric` como texto). */
export function normalizarVentas(rows) {
  return (rows || []).map((r) => ({
    ...r,
    id: Number(r.id),
    discount: num(r.discount),
    shipping_cost: num(r.shipping_cost),
    total_cost: num(r.total_cost),
    total_price: num(r.total_price),
  }))
}
export function normalizarDetalles(rows) {
  return (rows || []).map((r) => ({ ...r, sale_id: Number(r.sale_id), product_id: Number(r.product_id), quantity: Number(r.quantity), total: Number(r.total), unit_price: num(r.unit_price) }))
}

/**
 * Suma lo del ERP a lo de GN. Ventas y detalles quedan ordenados por id (los lectores toman min/max del rango).
 * @param {{ ventas?: any[], detalles?: any[], skuPor?: Map<string,string>|null }} gn
 * @param {{ ventas?: any[], detalles?: any[], skuPor?: Map<string,string> }} erp
 */
export function sumarVentasDelErp(gn, erp) {
  const ventas = [...(gn.ventas || []), ...(erp.ventas || [])].sort((a, b) => Number(a.id) - Number(b.id))
  const detalles = [...(gn.detalles || []), ...(erp.detalles || [])].sort((a, b) => Number(a.sale_id) - Number(b.sale_id))
  // El SKU del ERP completa, ⛔ pisa: un producto que GN ya conoce conserva su SKU.
  const skuPor = gn.skuPor ? new Map(gn.skuPor) : null
  if (skuPor) for (const [k, v] of erp.skuPor || []) if (!skuPor.has(k)) skuPor.set(k, v)
  return { ...gn, ventas, detalles, skuPor }
}

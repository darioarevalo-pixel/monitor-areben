/**
 * **Las ventas que nacen en el ERP, con la forma de GN** (hito «lecturas de GN → ERP»).
 *
 * Desde el corte de una línea (`erp_corte`: Stunned 28-oct, BDI 15/16-nov, Zattia 23-nov) GN deja de recibir sus ventas y nacen en
 * el motor (`gn_sale_id` nulo). Memo, Norte y el parte leen `ventas` / `venta_detalles` del espejo con supabase-js. La copia nocturna
 * (`scripts/erp-ventas-espejo.mjs`) las lleva al espejo, pero corre una vez por día ⇒ lo de después de la copia se pide al motor y se
 * SUMA, con las mismas columnas, para que los núcleos (`ventaPorLinea`, `pylPorLinea`, `ventaDeAyer`) ⛔ cambien. Las que ya estén en
 * el espejo ⛔ se suman otra vez (`sumarVentasDelErp`, por id).
 *
 * 🔑 Se prende SOLO con el corte (Bruno 1-nov: «todo con interruptor»): la misma regla que la copia al espejo, en el SQL, ⛔ una
 * variable: sólo lo nacido en el ERP DESPUÉS del corte de su línea (`gn_sale_id is null`, `confirmada`, ⛔ `prueba`). Sin fila en
 * `erp_corte`, 0 filas. `id_espejo` arranca en 1.000.000.000 (sql/045) ⇒ no choca con un id de GN.
 */

const CANAL = `case v.canal when 'local' then 'Mi Local' when 'online' then 'Tienda Nube' when 'mayorista' then 'Mayorista'
              when 'ml' then 'Mercadolibre' when 'gn_whatsapp' then 'Whatsapp' when 'gn_ninguno' then 'Ninguno'
              when 'gn_influencer' then 'Influencer' else v.canal end`

const lista = (lineas) => lineas.map((l) => `'${String(l).replace(/[^a-z]/g, '')}'`).join(', ')

const filtro = (lineas) => `v.marca in (${lista(lineas)}) and v.gn_sale_id is null and v.estado = 'confirmada' and not v.prueba
       and exists (select 1 from erp_corte c where c.linea = v.marca and v.ocurrida_en >= c.instante)
       and (v.ocurrida_en at time zone 'America/Argentina/Buenos_Aires')::date between $1::date and $2::date`

/**
 * Las ventas de esas líneas, con las columnas de `ventas` de GN que leen memo, Norte y parte. Mismo medio y cuenta que
 * `espejo_motor.ventas`. @param {string[]} lineas
 */
export const sqlVentas = (lineas) => `select v.id_espejo::integer as id,
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
 where ${filtro(lineas)}
 order by v.id_espejo`

/** Los renglones de esas mismas ventas. @param {string[]} lineas */
export const sqlDetalles = (lineas) => `select v.id_espejo::integer as sale_id, l.product_id::integer as product_id,
       l.size_id::integer as size_id, va.talle as size,
       l.cantidad::integer as quantity, l.precio::numeric as unit_price, l.importe::numeric as total
  from venta_linea l join venta v on v.id = l.venta_id
  left join variante va on va.empresa_id = v.empresa_id and va.product_id = l.product_id and va.size_id = l.size_id
 where ${filtro(lineas)}
 order by v.id_espejo, l.n`

/** El SKU de cada producto de esas líneas (Stunned se decide por el prefijo `STU`). @param {string[]} lineas */
export const sqlSkus = (lineas) => `select distinct on (va.product_id) va.product_id::integer as product_id, va.sku
  from variante va join marca m on m.empresa_id = va.empresa_id
 where m.id in (${lista(lineas)}) and va.sku is not null and va.sku <> ''
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
  // 🔑 Las que YA están en el espejo (las copia `scripts/erp-ventas-espejo.mjs` cuando la línea cortó) ⛔ se suman otra vez:
  // gana la del espejo, con sus renglones.
  const yaEstan = new Set((gn.ventas || []).map((v) => Number(v.id)))
  const nuevas = (erp.ventas || []).filter((v) => !yaEstan.has(Number(v.id)))
  const detallesNuevos = (erp.detalles || []).filter((d) => !yaEstan.has(Number(d.sale_id)))
  const ventas = [...(gn.ventas || []), ...nuevas].sort((a, b) => Number(a.id) - Number(b.id))
  const detalles = [...(gn.detalles || []), ...detallesNuevos].sort((a, b) => Number(a.sale_id) - Number(b.sale_id))
  // El SKU del ERP completa, ⛔ pisa: un producto que GN ya conoce conserva su SKU.
  const skuPor = gn.skuPor ? new Map(gn.skuPor) : null
  if (skuPor) for (const [k, v] of erp.skuPor || []) if (!skuPor.has(k)) skuPor.set(k, v)
  return { ...gn, ventas, detalles, skuPor }
}

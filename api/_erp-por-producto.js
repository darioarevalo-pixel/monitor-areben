/**
 * ERP › Ventas › Por producto: los RENGLONES vendidos del período, del espejo de GN (`ventas` + `venta_detalles`; GN es el
 * que vende hoy, como Inicio). Sólo LEE. Agrupar, filtrar y ordenar lo hace la pantalla con `lib/erp/ventas-producto.core.js`.
 *
 *   GET ?recurso=erp&vista=ventas-producto&marca=bdi|zattia&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
 *
 * 🔑 Por pg (supabase-js corta a las 1000 filas; BDI hace ~4.000 renglones al mes). El SKU sale de `inventario` (para la
 *    línea: Stunned es un prefijo de SKU dentro de Zattia). El costo VIGENTE del motor (`costo_vigente`) viaja SÓLO si el
 *    perfil ve costos (`costos`): lo corta el servidor, ⛔ la pantalla.
 */
import { lineaDe } from '../lib/lineas.core.js'
import { armarRenglon } from '../lib/erp/ventas-producto.core.js'

const MARCAS = ['bdi', 'zattia']
const DIA = /^\d{4}-\d{2}-\d{2}$/
/** Más de un año de renglones ⛔ (BDI: ~50.000): se pide un período más corto. */
const DIAS_MAXIMO = 93

/**
 * @param {{ marca: string, desde: string, hasta: string, costos: boolean }} p
 * @param {{ conMotor: Function }} deps
 */
export async function ventasPorProducto({ marca, desde, hasta, costos }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!DIA.test(String(desde || '')) || !DIA.test(String(hasta || '')) || desde > hasta) return { status: 400, error: 'Período inválido' }
  if ((Date.parse(hasta) - Date.parse(desde)) / 86_400_000 > DIAS_MAXIMO) return { status: 400, error: `Elegí un período de hasta ${DIAS_MAXIMO} días.` }
  return deps.conMotor(marca, 'Las ventas por producto', async (pg) => {
    const { rows } = await pg.query(`with s as (
        select distinct on (product_id, size_id) product_id, size_id, sku from inventario where sku is not null and sku <> '' order by product_id, size_id, sku
      )
      select d.id, d.sale_id, v.number, v.date_sale, v.channel, v.client_name, d.product_id, d.product_name, d.size, d.quantity, d.unit_price, d.total, s.sku
      from venta_detalles d join ventas v on v.id = d.sale_id
      left join s on s.product_id = d.product_id and s.size_id = d.size_id
      where v.date_sale::date between $1::date and $2::date
      order by v.date_sale desc, d.id`, [desde, hasta])
    const mapa = costos ? new Map((await pg.query('select product_id, costo from costo_vigente')).rows.map((c) => [String(c.product_id), Number(c.costo)])) : null
    const [{ hasta: gnHasta } = {}] = (await pg.query('select max(date_sale) as hasta from ventas')).rows
    return {
      renglones: rows.map((r) => armarRenglon(r, { linea: (sku) => lineaDe(marca, sku), costos: mapa })),
      desde, hasta, costos: !!mapa, gnHasta: gnHasta ? new Date(gnHasta).toISOString() : null,
    }
  })
}

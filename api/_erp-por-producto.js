/**
 * ERP › Ventas › Por producto: los RENGLONES vendidos del período, de las ventas del ERP (`venta_ficha`: las mismas que lee
 * «Por venta», con sus correcciones). Sólo LEE. Agrupar, filtrar y ordenar lo hace la pantalla con `lib/erp/ventas-producto.core.js`.
 *
 *   GET ?recurso=erp&vista=ventas-producto&marca=bdi|zattia&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
 *
 * 🔑 27-nov: antes leía el espejo de GN, que desde el corte se llena del ERP una vez por noche ⇒ lo de hoy ⛔ estaba y el total
 *    ⛔ daba el de «Por venta». Ahora: confirmadas, sin las de prueba, por `ocurrida_en` en días argentinos (como «Por venta»).
 * 🔑 Por pg (supabase-js corta a las 1000 filas; BDI hace ~1.100 ventas al mes). El nombre sale de `producto` y el talle de
 *    `variante` del motor. El costo VIGENTE (`costo_vigente`) viaja SÓLO si el perfil ve costos (`costos`): lo corta el servidor.
 */
import { lineaDe } from '../lib/lineas.core.js'
import { renglonesDeVenta } from '../lib/erp/ventas-producto.core.js'

const MARCAS = ['bdi', 'zattia']
const DIA = /^\d{4}-\d{2}-\d{2}$/
/** Más de 3 meses ⛔ (BDI 93 días: 3.370 ventas, ~7 s medido 27-nov): se pide un período más corto. */
const DIAS_MAXIMO = 93

export const SQL_VENTAS = `select v.id, v.numero, v.tipo, v.origen, v.total, v.ocurrida_en, v.detalle,
    coalesce(v.cliente->>'nombre', v.detalle->>'cliente_gn') as cliente, v.lineas
  from venta_ficha v
  where v.estado = 'confirmada' and not v.prueba
    and v.ocurrida_en >= ($1::date::timestamp at time zone 'America/Argentina/Buenos_Aires')
    and v.ocurrida_en < (($2::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
  order by v.ocurrida_en desc, v.id`

/**
 * @param {{ marca: string, desde: string, hasta: string, costos: boolean }} p
 * @param {{ conMotor: Function }} deps
 */
export async function ventasPorProducto({ marca, desde, hasta, costos }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!DIA.test(String(desde || '')) || !DIA.test(String(hasta || '')) || desde > hasta) return { status: 400, error: 'Período inválido' }
  if ((Date.parse(hasta) - Date.parse(desde)) / 86_400_000 > DIAS_MAXIMO) return { status: 400, error: `Elegí un período de hasta ${DIAS_MAXIMO} días.` }
  return deps.conMotor(marca, 'Las ventas por producto', async (pg) => {
    const { rows } = await pg.query(SQL_VENTAS, [desde, hasta])
    const ids = [...new Set(rows.flatMap((v) => (v.lineas || []).map((l) => String(l.product_id))))]
    // Una tras otra: un cliente de pg ⛔ corre dos consultas a la vez.
    const prods = await pg.query('select id::text as id, nombre from producto where id::text = any($1)', [ids])
    const vars = await pg.query('select product_id::text as p, size_id::text as s, talle from variante where product_id::text = any($1)', [ids])
    const cst = costos ? await pg.query('select product_id, costo from costo_vigente') : null
    const nombres = new Map(prods.rows.map((r) => [r.id, r.nombre]))
    const talles = new Map(vars.rows.map((r) => [`${r.p}:${r.s}`, r.talle]))
    const mapa = cst ? new Map(cst.rows.map((c) => [String(c.product_id), Number(c.costo)])) : null
    const linea = (sku) => lineaDe(marca, sku)
    return { renglones: rows.flatMap((v) => renglonesDeVenta(v, { linea, costos: mapa, nombres, talles })), desde, hasta, costos: !!mapa }
  })
}

/**
 * ERP › Inicio: el RESULTADO COMERCIAL del mes (diseño §7: número grande, sólo Admin — el ERP entero es sólo admin).
 * Sólo LEE. Lo llama `api/_erp.js`.
 *
 *   GET ?recurso=erp&vista=inicio-resultado&marca=bdi|zattia   vendido, costo y margen del mes a hoy y de los mismos días del anterior,
 *     y para los gráficos (tanda 2, 30-oct): día por día de los dos meses, los últimos 12 meses y el mes por canal
 *
 * 🔑 Sale del espejo de GN (`ventas`: GN es el que vende hoy; el motor corre en paralelo). Suma en la base por pg.
 * 🔴 El estado de la venta ⛔ se filtra (`lib/crm/metricas.ts` §2): «Compra Pendiente» es un estado normal desde abril-2026
 *    y una anulada GN la ELIMINA. El costo es el de GN (`total_cost`); una venta sin costo se cuenta y se dice.
 * 🔑 Los gráficos son la MISMA cuenta que el «Vendido» (`ventas`, `date_sale::date`, sin filtrar estado ni canal), sólo
 *    agrupada: la suma de los días del mes, la del mes en los 12 meses y la de los canales dan el `mes.vendido` (el oráculo).
 */
import { diaArgentino } from '../lib/envios/portal.core.js'

const MARCAS = ['bdi', 'zattia']

/** El mismo tramo del mes anterior: del 1 al mismo día (o al último, si el anterior es más corto). @param {string} hoy AAAA-MM-DD */
export function tramosDelMes(hoy) {
  const [a, m, d] = hoy.split('-').map(Number)
  const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1
  const ultimo = new Date(Date.UTC(pa, pm, 0)).getUTCDate()
  const z = (n) => String(n).padStart(2, '0')
  return {
    mes: { desde: `${a}-${z(m)}-01`, hasta: hoy },
    anterior: { desde: `${pa}-${z(pm)}-01`, hasta: `${pa}-${z(pm)}-${z(Math.min(d, ultimo))}` },
  }
}

/** El 1 del mes, 11 meses antes del de `hoy` (los 12 meses del gráfico, con el de hoy). @param {string} hoy AAAA-MM-DD */
export function desdeDoceMeses(hoy) {
  const [a, m] = hoy.split('-').map(Number)
  const n = a * 12 + (m - 1) - 11
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}-01`
}

/**
 * @param {{ marca: string, hoy?: string }} p
 * @param {{ conMotor: Function }} deps
 */
export async function resultadoDelMes({ marca, hoy = null }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const t = tramosDelMes(hoy ?? diaArgentino(Date.now()))
  return deps.conMotor(marca, 'El resultado del mes', async (pg) => {
    const suma = async ({ desde, hasta }) => {
      const [r] = (await pg.query(`select count(*)::int as ventas, coalesce(sum(total_price), 0)::float as vendido,
          coalesce(sum(total_cost), 0)::float as costo, count(*) filter (where coalesce(total_cost, 0) = 0)::int as sin_costo
        from ventas where date_sale::date between $1::date and $2::date`, [desde, hasta])).rows
      return { desde, hasta, ventas: r.ventas, vendido: r.vendido, costo: r.costo, sinCosto: r.sin_costo, margen: r.vendido - r.costo }
    }
    const [mes, anterior] = [await suma(t.mes), await suma(t.anterior)]
    const [{ hasta } = {}] = (await pg.query('select max(date_sale)::date::text as hasta from ventas')).rows
    const num = (r) => ({ ventas: Number(r.ventas), vendido: Number(r.vendido), costo: Number(r.costo) })
    const agrupado = async (clave, desde, hasta) => (await pg.query(`select ${clave} as k, count(*)::int as ventas,
        coalesce(sum(total_price), 0)::float as vendido, coalesce(sum(total_cost), 0)::float as costo
      from ventas where date_sale::date between $1::date and $2::date group by 1 order by 1`, [desde, hasta])).rows
    const dias = (await agrupado('date_sale::date::text', t.anterior.desde, t.mes.hasta)).map((r) => ({ dia: r.k, ...num(r) }))
    const meses = (await agrupado(`to_char(date_sale::date, 'YYYY-MM')`, desdeDoceMeses(t.mes.hasta), t.mes.hasta)).map((r) => ({ mes: r.k, ...num(r) }))
    const canales = (await agrupado(`coalesce(nullif(channel, ''), 'Ninguno')`, t.mes.desde, t.mes.hasta)).map((r) => ({ canal: r.k, ...num(r) }))
    return { mes, anterior, gnHasta: hasta ?? null, dias, meses, canales }
  })
}

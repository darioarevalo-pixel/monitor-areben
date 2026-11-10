/**
 * ERP › Inicio: el RESULTADO COMERCIAL del mes (diseño §7: número grande, sólo Admin — el ERP entero es sólo admin).
 * Sólo LEE. Lo llama `api/_erp.js`.
 *
 *   GET ?recurso=erp&vista=inicio-resultado&marca=bdi|zattia&linea=…   vendido (de UNA línea), costo y margen del mes a hoy y de los mismos días del anterior,
 *     y para los gráficos (tanda 2, 30-oct): día por día de los dos meses, los últimos 12 meses y el mes por canal
 *
 * 🔑 Sale del espejo de GN (`ventas`: GN es el que vende hoy; el motor corre en paralelo). Suma en la base por pg.
 * 🔴 El estado de la venta ⛔ se filtra (`lib/crm/metricas.ts` §2): «Compra Pendiente» es un estado normal desde abril-2026
 *    y una anulada GN la ELIMINA. El costo es el de GN (`total_cost`); una venta sin costo se cuenta y se dice.
 * 🔑 Los gráficos son la MISMA cuenta que el «Vendido» (`ventas`, `date_sale::date`, sin filtrar estado ni canal), sólo
 *    agrupada: la suma de los días del mes, la del mes en los 12 meses y la de los canales dan el `mes.vendido` (el oráculo).
 */
import { diaArgentino } from '../lib/envios/portal.core.js'
import { ultimoDiaDelMes } from '../lib/erp/meses.core.js'
import { SQL_RENGLON_STU } from '../lib/erp/linea-gn.core.js'
import { sqlVentas } from '../lib/stunned/ventas-erp.core.js'

const MARCAS = ['bdi', 'zattia']

/**
 * 🔑 De UNA línea (Bruno, 30-oct): en Zattia, cada venta de GN pesa en cada línea según la plata de sus renglones (como
 * `pylPorLinea` del P&L de Norte): una mixta reparte vendido y costo, y cuenta como venta en las dos. 🔴 El peso PUEDE
 * salir de [0, 1] —un renglón negativo, el cambio que devuelve Zattia y se lleva Stunned (Nº 30631: STU $19.290 de $4.800 de
 * renglones)— y la otra línea queda NEGATIVA: se la cuenta igual (`<> 0`, como Norte). Con `> 0` se tiraba y la venta salía
 * inflada: oct-2026, Zattia + Stunned daban $12.980,63 más que GN (`oraculos/sumas-por-linea-lectura.mjs`). La que ⛔ tiene
 * renglones es de Zattia. Cada línea suma además sus ventas del ERP (desde su corte, `erp_corte`), igual que memo y Norte. Devuelve la tabla `vl(date_sale, channel, total_price, total_cost)` del
 * período `$1..$2`, para el `from` de cada suma.
 * @param {string} linea  bdi · zattia · stunned
 */
export function ventasDeLinea(linea) {
  const periodo = 'v.date_sale::date between $1::date and $2::date'
  // Lo que nació en el ERP (línea cortada, `erp_corte`: sin corte, 0 filas) y la copia nocturna todavía ⛔ llevó al espejo.
  const erp = `\n    union all\n    select e.date_sale::date, e.channel, e.total_price, e.total_cost from (${sqlVentas([linea])}) e where not exists (select 1 from ventas g where g.id = e.id)`
  if (linea === 'bdi') return `(select v.date_sale::date as date_sale, v.channel, v.total_price, v.total_cost from ventas v where ${periodo}${erp}) vl`
  const peso = `(case when lp.todo > 0 then coalesce(lp.stu, 0) / lp.todo else 0 end)`
  const w = linea === 'stunned' ? peso : `(1 - ${peso})`
  const gn = `select v.date_sale::date as date_sale, v.channel, v.total_price * ${w} as total_price, v.total_cost * ${w} as total_cost
      from ventas v left join (
        select vd.sale_id, sum(vd.total) filter (where ${SQL_RENGLON_STU}) as stu, sum(vd.total) as todo
          from venta_detalles vd join ventas x on x.id = vd.sale_id and x.date_sale::date between $1::date and $2::date
          left join productos p on p.id = vd.product_id group by vd.sale_id
      ) lp on lp.sale_id = v.id
     where ${periodo} and ${w} <> 0`
  return `(${gn}${erp}) vl`
}

/**
 * El mismo tramo del mes anterior: del 1 al mismo día (o al último, si el anterior es más corto). @param {string} hoy AAAA-MM-DD
 * `completo` (un mes de ANTES elegido en Inicio, `hoy` = su último día): el anterior va ENTERO (30-sep ⇒ 1 al 31-ago).
 * @param {{ completo?: boolean }} [o]
 */
export function tramosDelMes(hoy, { completo = false } = {}) {
  const [a, m, d] = hoy.split('-').map(Number)
  const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1
  const ultimo = new Date(Date.UTC(pa, pm, 0)).getUTCDate()
  const z = (n) => String(n).padStart(2, '0')
  return {
    mes: { desde: `${a}-${z(m)}-01`, hasta: hoy },
    anterior: { desde: `${pa}-${z(pm)}-01`, hasta: `${pa}-${z(pm)}-${z(completo ? ultimo : Math.min(d, ultimo))}` },
  }
}

/** El 1 del mes, 11 meses antes del de `hoy` (los 12 meses del gráfico, con el de hoy). @param {string} hoy AAAA-MM-DD */
export function desdeDoceMeses(hoy) {
  const [a, m] = hoy.split('-').map(Number)
  const n = a * 12 + (m - 1) - 11
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}-01`
}

/**
 * El `hoy` del resultado: el de hoy, o el ÚLTIMO día de un mes de antes (`mes` = AAAA-MM, Bruno 10-nov: «ir para atrás en los meses»).
 * Un mes inválido, el actual o uno futuro ⇒ hoy. @param {string | null | undefined} mes @param {string} hoy AAAA-MM-DD
 * @returns {{ hoy: string, completo: boolean }}
 */
export function hoyDelResultado(mes, hoy) {
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes ?? '')) ? String(mes) : null
  return ym && ym < hoy.slice(0, 7) ? { hoy: ultimoDiaDelMes(ym), completo: true } : { hoy, completo: false }
}

/**
 * @param {{ marca: string, linea?: string, hoy?: string, mes?: string | null }} p  `mes`: AAAA-MM de antes (Inicio, ‹ ›)
 * @param {{ conMotor: Function }} deps
 */
export async function resultadoDelMes({ marca, linea = marca === 'bdi' ? 'bdi' : '', hoy = null, mes = null }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (marca === 'bdi' ? linea !== 'bdi' : !['zattia', 'stunned'].includes(linea)) return { status: 400, error: 'Falta la línea (Zattia o Stunned).' }
  const vl = ventasDeLinea(linea)
  const dh = hoyDelResultado(mes, hoy ?? diaArgentino(Date.now()))
  const t = tramosDelMes(dh.hoy, { completo: dh.completo })
  return deps.conMotor(marca, 'El resultado del mes', async (pg) => {
    const suma = async ({ desde, hasta }) => {
      const [r] = (await pg.query(`select count(*)::int as ventas, coalesce(sum(total_price), 0)::float as vendido,
          coalesce(sum(total_cost), 0)::float as costo, count(*) filter (where coalesce(total_cost, 0) = 0)::int as sin_costo
        from ${vl}`, [desde, hasta])).rows
      return { desde, hasta, ventas: r.ventas, vendido: r.vendido, costo: r.costo, sinCosto: r.sin_costo, margen: r.vendido - r.costo }
    }
    const [mes, anterior] = [await suma(t.mes), await suma(t.anterior)]
    const [{ hasta } = {}] = (await pg.query('select max(date_sale)::date::text as hasta from ventas')).rows
    // Una línea que ya pasó al ERP ⛔ espera a GN: sin esto Inicio avisaba «lo de después todavía no está», y sí está.
    const cortada = (await pg.query('select 1 from erp_corte where linea = $1 and instante <= now()', [linea])).rows.length > 0
    const num = (r) => ({ ventas: Number(r.ventas), vendido: Number(r.vendido), costo: Number(r.costo) })
    const agrupado = async (clave, desde, hasta) => (await pg.query(`select ${clave} as k, count(*)::int as ventas,
        coalesce(sum(total_price), 0)::float as vendido, coalesce(sum(total_cost), 0)::float as costo
      from ${vl} group by 1 order by 1`, [desde, hasta])).rows
    const dias = (await agrupado('date_sale::date::text', t.anterior.desde, t.mes.hasta)).map((r) => ({ dia: r.k, ...num(r) }))
    const meses = (await agrupado(`to_char(date_sale::date, 'YYYY-MM')`, desdeDoceMeses(t.mes.hasta), t.mes.hasta)).map((r) => ({ mes: r.k, ...num(r) }))
    const canales = (await agrupado(`coalesce(nullif(channel, ''), 'Ninguno')`, t.mes.desde, t.mes.hasta)).map((r) => ({ canal: r.k, ...num(r) }))
    return { mes, anterior, gnHasta: cortada ? null : hasta ?? null, dias, meses, canales }
  })
}

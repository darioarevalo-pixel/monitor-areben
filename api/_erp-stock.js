/**
 * ERP › Stock › Stock (el molde del diseño, `~/Documents/erp-monitor/diseno.md` §3 y §7): la LISTA con cada prenda y lo
 * que hay de ella por depósito. Sólo LEE; la ficha de una prenda sigue por `vista=stock&producto=…` de `api/_erp.js`.
 * Lo arma `lib/erp/stock-lista.core.js`; lo llama `api/_erp.js` (`vista=stock-lista`).
 *
 *   GET ?recurso=erp&vista=stock-lista&marca=bdi|zattia     una fila por variante (Zattia trae también Stunned)
 *   GET ?recurso=erp&vista=movimientos&…                  cada fila del libro de un período (abajo, `listaDeMovimientos`)
 *
 * 🔑 El libro se SUMA en la base, por pg con la conexión del motor (`conMotor`): supabase-js ⛔ agrupa y el libro tiene
 * una fila por movimiento. Sin la conexión contesta 409 y la pantalla lo dice (⛔ una lista vacía que parece «sin stock»).
 * Los nombres y el SKU salen del espejo de GN (`inventario`, paginado: una fila por talle y depósito pasa las 1000).
 */
import { createClient } from '@supabase/supabase-js'
import { cfgDeMarca } from './_recepciones-base.js'
import { leerTodo } from '../lib/supabase/paginar.core.js'
import { armarFilasStock, reservadoPorVariante } from '../lib/erp/stock-lista.core.js'
import { armarMovimiento } from '../lib/erp/movimientos.core.js'
import { rangoDeDias } from '../lib/erp/venta.core.js'

const MARCAS = ['bdi', 'zattia']

/** Lo que dice el libro hoy: el nivel por variante y depósito, el último movimiento de cada variante y hasta cuándo llega. */
async function libroSumado(pg) {
  const niveles = (await pg.query(`select linea, product_id, size_id, deposito, sum(cantidad)::int as nivel
    from stock_movimiento group by 1, 2, 3, 4`)).rows
  const ultimos = (await pg.query(`select distinct on (product_id, size_id) product_id, size_id, tipo, origen, origen_ref, ocurrido_en
    from stock_movimiento order by product_id, size_id, ocurrido_en desc, id desc`)).rows
  const [{ hasta } = {}] = (await pg.query('select max(ocurrido_en) as hasta from stock_movimiento')).rows
  return { niveles, ultimos, hasta: hasta ? new Date(hasta).toISOString() : null }
}

/** El espejo de GN de la marca: nombre, SKU, código y lo que dice GN por depósito. */
function leerInventario(marca) {
  const { url, key } = cfgDeMarca(marca)
  return leerTodo(createClient(url, key), 'inventario', (x) => x.select('product_id, size_id, product_name, size_name, sku, barcode, store_name, available_quantity')
    .order('product_id').order('size_id').order('store_name'))
}

/**
 * @param {{ marca: string }} p
 * @param {{ conMotor: Function, pedidosSinPagar: Function, leerInventario?: Function }} deps
 */
export async function listaDeStock({ marca }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const [libro, inventario, pedidos] = await Promise.all([
    deps.conMotor(marca, 'El stock del ERP', (pg) => libroSumado(pg)),
    (deps.leerInventario ?? leerInventario)(marca),
    deps.pedidosSinPagar({ marca }),
  ])
  if (libro.status) return libro
  const { reservado, sinVariante } = reservadoPorVariante(pedidos.pedidos || [], inventario)
  return {
    filas: armarFilasStock({ marca, niveles: libro.niveles, ultimos: libro.ultimos, inventario, reservado }),
    libroHasta: libro.hasta,
    pedidosLeidosEn: pedidos.leidaEn ?? null,
    pedidos: (pedidos.pedidos || []).length,
    sinVariante,
  }
}

/**
 * ERP › Stock › Movimientos: cada fila del libro del período (días argentinos, `desde`..`hasta` inclusive), con lo que
 * quedó de la prenda en ese depósito después de ella (`queda`, la suma corrida: mismo orden que la ficha) y el número y
 * quién de la venta del ERP o del ajuste que la escribió. 🔴 Más de `TOPE_MOVS` ⇒ se cortan los más viejos y se dice.
 *
 *   GET ?recurso=erp&vista=movimientos&marca=bdi|zattia&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 */
export const TOPE_MOVS = 20000
const DIA = /^\d{4}-\d{2}-\d{2}$/

async function movimientosDelLibro(pg, r) {
  const filas = (await pg.query(`with q as (
      select m.id, m.linea, m.product_id, m.size_id, m.sku, m.barcode, m.deposito, m.cantidad, m.tipo, m.origen, m.origen_ref,
             m.ocurrido_en, m.hora_exacta, m.detalle,
             sum(m.cantidad) over (partition by m.product_id, m.size_id, m.deposito order by m.ocurrido_en, m.id)::int as queda
        from stock_movimiento m)
    select q.*, v.numero as venta_numero, v.usuario as venta_usuario, a.numero as ajuste_numero, a.creado_por as ajuste_usuario
      from q
      left join venta v on q.origen = 'caja' and v.id::text = q.detalle->>'caja'
      left join stock_ajuste a on q.origen = 'ajuste' and a.id::text = split_part(q.origen_ref, ':', 1)
     where q.ocurrido_en >= $1 and q.ocurrido_en < $2
     order by q.ocurrido_en desc, q.id desc
     limit ${TOPE_MOVS + 1}`, [r.desde, r.hasta])).rows
  const [{ hasta } = {}] = (await pg.query('select max(ocurrido_en) as hasta from stock_movimiento')).rows
  return { filas, hasta: hasta ? new Date(hasta).toISOString() : null }
}

/**
 * @param {{ marca: string, desde: string, hasta: string }} p
 * @param {{ conMotor: Function, leerInventario?: Function }} deps
 */
export async function listaDeMovimientos({ marca, desde, hasta }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!DIA.test(String(desde || '')) || !DIA.test(String(hasta || '')) || desde > hasta) return { status: 400, error: 'Período inválido' }
  const r = rangoDeDias(desde, hasta)
  const [libro, inventario] = await Promise.all([
    deps.conMotor(marca, 'Los movimientos del ERP', (pg) => movimientosDelLibro(pg, r)),
    (deps.leerInventario ?? leerInventario)(marca),
  ])
  if (libro.status) return libro
  const nombres = new Map()
  for (const i of inventario) {
    const k = `${i.product_id}/${i.size_id}`
    if (!nombres.has(k)) nombres.set(k, { nombre: i.product_name, talleNombre: i.size_name, sku: i.sku, barcode: i.barcode })
  }
  const cortado = libro.filas.length > TOPE_MOVS
  return { filas: libro.filas.slice(0, TOPE_MOVS).map((m) => armarMovimiento(m, nombres)), desde, hasta, cortado, libroHasta: libro.hasta }
}

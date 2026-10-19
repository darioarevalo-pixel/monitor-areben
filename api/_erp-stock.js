/**
 * ERP › Stock › Stock (el molde del diseño, `~/Documents/erp-monitor/diseno.md` §3 y §7): la LISTA con cada prenda y lo
 * que hay de ella por depósito. Sólo LEE; la ficha de una prenda sigue por `vista=stock&producto=…` de `api/_erp.js`.
 * Lo arma `lib/erp/stock-lista.core.js`; lo llama `api/_erp.js` (`vista=stock-lista`).
 *
 *   GET ?recurso=erp&vista=stock-lista&marca=bdi|zattia     una fila por variante (Zattia trae también Stunned)
 *
 * 🔑 El libro se SUMA en la base, por pg con la conexión del motor (`conMotor`): supabase-js ⛔ agrupa y el libro tiene
 * una fila por movimiento. Sin la conexión contesta 409 y la pantalla lo dice (⛔ una lista vacía que parece «sin stock»).
 * Los nombres y el SKU salen del espejo de GN (`inventario`, paginado: una fila por talle y depósito pasa las 1000).
 */
import { createClient } from '@supabase/supabase-js'
import { cfgDeMarca } from './_recepciones-base.js'
import { leerTodo } from '../lib/supabase/paginar.core.js'
import { armarFilasStock, reservadoPorVariante } from '../lib/erp/stock-lista.core.js'

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

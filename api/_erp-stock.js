/**
 * ERP › Stock › Stock (el molde del diseño, `~/Documents/erp-monitor/diseno.md` §3 y §7): la LISTA con cada prenda y lo
 * que hay de ella por depósito. Sólo LEE; la ficha de una prenda sigue por `vista=stock&producto=…` de `api/_erp.js`.
 * Lo arma `lib/erp/stock-lista.core.js`; lo llama `api/_erp.js` (`vista=stock-lista`).
 *
 *   GET ?recurso=erp&vista=stock-lista&marca=bdi|zattia     una fila por variante (Zattia trae también Stunned)
 *   GET ?recurso=erp&vista=movimientos&…                  cada fila del libro de un período (abajo, `listaDeMovimientos`)
 *   GET ?recurso=erp&vista=transferencias&marca=…           cada transferencia con su paso (abajo, `listaDeTransferencias`)
 *   GET ?recurso=erp&vista=comparacion&marca=…              el ERP contra lo publicado en Tienda Nube (abajo, `comparacionConTiendas`)
 *
 * 🔑 El libro se SUMA en la base, por pg con la conexión del motor (`conMotor`): supabase-js ⛔ agrupa y el libro tiene
 * una fila por movimiento. Sin la conexión contesta 409 y la pantalla lo dice (⛔ una lista vacía que parece «sin stock»).
 * Los nombres y el SKU salen del espejo de GN (`inventario`, paginado: una fila por talle y depósito pasa las 1000).
 */
import { createClient } from '@supabase/supabase-js'
import { cfgDeMarca } from './_recepciones-base.js'
import { leerTodo } from '../lib/supabase/paginar.core.js'
import { armarFilasStock, reservadoPorVariante } from '../lib/erp/stock-lista.core.js'
import { armarComparacion } from '../lib/erp/comparacion.core.js'
import { armarMovimiento } from '../lib/erp/movimientos.core.js'
import { deArmado, deLibro } from '../lib/erp/transferencias.core.js'
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
    // El aviso es de la tienda que se mira (30-oct): cada pedido sabe de qué tienda es.
    sinVariantePorTienda: Object.fromEntries([...new Set((pedidos.pedidos || []).map((p) => p.tienda).filter(Boolean))]
      .map((t) => [t, reservadoPorVariante((pedidos.pedidos || []).filter((p) => p.tienda === t), inventario).sinVariante])),
  }
}

/**
 * ERP › Stock › Movimientos: cada fila del libro del período (días argentinos, `desde`..`hasta` inclusive), con lo que
 * quedó de la prenda en ese depósito después de ella (`queda`, la suma corrida: mismo orden que la ficha) y el número y
 * quién de la venta del ERP o del ajuste que la escribió. 🔴 `detalle.caja` es el id de la CAJA, ⛔ el de la venta: se
 * cruza con `venta.origen_ref` (medido en prod 19-oct: por `venta.id` no pegaba ninguna). 🔴 Más de `TOPE_MOVS` ⇒ se cortan los más viejos y se dice.
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
      left join venta v on q.origen = 'caja' and v.origen = 'caja' and v.origen_ref = q.detalle->>'caja'
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

/**
 * ERP › Stock › Transferencias (`lib/erp/transferencias.core.js`): los armados de Reposición del monitor (`repo_armado`,
 * con su estado; por supabase-js con la clave de la marca, como `api/_repo-armado.js`) + las hechas a mano en GN que trajo
 * el libro (`origen = 'gn_foto'`). De cada armado, cuánto anotó el libro del ERP (la pata que entra), para ver si lo tiene.
 *
 *   GET ?recurso=erp&vista=transferencias&marca=bdi|zattia
 */
export const TOPE_TRANSFERENCIAS = 500

async function transferenciasDelLibro(pg) {
  const enLibro = (await pg.query(`select detalle->>'armado' as armado, sum(cantidad)::int as u from stock_movimiento
     where tipo = 'transferencia' and origen = 'repo' and cantidad > 0 group by 1`)).rows
  const aMano = (await pg.query(`select id, grupo, linea, product_id, size_id, sku, deposito, cantidad, ocurrido_en, detalle from stock_movimiento
     where tipo = 'transferencia' and origen = 'gn_foto' order by ocurrido_en desc, id desc limit 5000`)).rows
  const [{ desde } = {}] = (await pg.query('select min(ocurrido_en) as desde from stock_movimiento')).rows
  return { enLibro, aMano, desde: desde ? new Date(desde).toISOString() : null }
}

export function leerArmados(marca) {
  const { url, key } = cfgDeMarca(marca)
  return createClient(url, key).from('repo_armado')
    .select('id, store, linea, sentido, fecha, persona, estado, pedido, escaneos, faltantes, transfer, error, creado_en, cerrado_en')
    .eq('store', marca).order('creado_en', { ascending: false }).limit(TOPE_TRANSFERENCIAS)
    .then(({ data, error }) => { if (error) throw new Error(error.message); return data || [] })
}

/**
 * @param {{ marca: string }} p
 * @param {{ conMotor: Function, leerArmados?: Function }} deps
 */
export async function listaDeTransferencias({ marca }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const [libro, armados] = await Promise.all([
    deps.conMotor(marca, 'Las transferencias del ERP', (pg) => transferenciasDelLibro(pg)),
    (deps.leerArmados ?? leerArmados)(marca),
  ])
  if (libro.status) return libro
  const enLibro = new Map(libro.enLibro.map((r) => [r.armado, r.u]))
  const grupos = new Map()
  for (const m of libro.aMano) grupos.set(m.grupo, [...(grupos.get(m.grupo) || []), m])
  const filas = [
    ...armados.map((a) => deArmado(a, marca, enLibro.get(a.id) ?? 0)),
    ...[...grupos].map(([g, movs]) => deLibro(g, movs, marca)),
  ]
  // `libroDesde`: lo transferido antes de que arrancara el libro ⛔ está en el ERP, y está bien (medido 20-oct: T-7745 del 12).
  return { filas, cortado: armados.length >= TOPE_TRANSFERENCIAS, libroDesde: libro.desde }
}

/**
 * ERP › Stock › Comparación con TN y ML (`lib/erp/comparacion.core.js`): cada variante con lo que la tienda tendría que
 * mostrar según el ERP contra `tn_variante` del motor (lo leyó `bin/tn.mjs traer`, cada ~2 h) y GN. Mercado Libre ⛔ (ver el
 * núcleo): de ML sólo se cuenta cuántas ⛔ cerraron en la última conciliación, para mandar a Conciliación.
 *
 *   GET ?recurso=erp&vista=comparacion&marca=bdi|zattia
 */
async function tiendaNube(pg) {
  const tn = (await pg.query(`select v.tienda, v.variant_id, v.sku, v.barcode, v.stock, v.valores, p.nombre, p.publicado
    from tn_variante v left join tn_producto p on p.tienda = v.tienda and p.tn_id = v.tn_product_id
    order by v.tienda, v.tn_product_id, v.variant_id`)).rows
  const lecturas = (await pg.query('select tienda, leida_en from tn_catalogo_lectura')).rows
  const [ml = {}] = (await pg.query(`select max(fecha) as fecha, count(*) filter (where fecha = (select max(fecha) from conciliacion_fila where tipo = 'stock_ml'))::int as n
    from conciliacion_fila where tipo = 'stock_ml'`)).rows
  const nombreTN = (n) => (n && typeof n === 'object' ? n.es ?? Object.values(n)[0] : n) ?? null
  return {
    tn: tn.map((v) => ({ ...v, nombre: nombreTN(v.nombre) })),
    leidas: Object.fromEntries(lecturas.map((l) => [l.tienda, new Date(l.leida_en).toISOString()])),
    ml: ml.fecha ? { fecha: new Date(ml.fecha).toISOString().slice(0, 10), noCierran: ml.n } : null,
  }
}

/**
 * @param {{ marca: string }} p
 * @param {{ conMotor: Function, pedidosSinPagar: Function, leerInventario?: Function }} deps
 */
export async function comparacionConTiendas({ marca }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const [libro, tienda, inventario, pedidos] = await Promise.all([
    deps.conMotor(marca, 'El stock del ERP', (pg) => libroSumado(pg)),
    deps.conMotor(marca, 'Lo publicado en Tienda Nube', (pg) => tiendaNube(pg)),
    (deps.leerInventario ?? leerInventario)(marca),
    deps.pedidosSinPagar({ marca }),
  ])
  if (libro.status) return libro
  if (tienda.status) return tienda
  const { reservado } = reservadoPorVariante(pedidos.pedidos || [], inventario)
  const filas = armarFilasStock({ marca, niveles: libro.niveles, ultimos: libro.ultimos, inventario, reservado })
  const r = armarComparacion({ marca, filas, inventario, tn: tienda.tn })
  return { filas: r.filas, sinLimite: r.sinLimite, tnLeidas: tienda.leidas, ml: tienda.ml, libroHasta: libro.hasta, pedidosLeidosEn: pedidos.leidaEn ?? null }
}

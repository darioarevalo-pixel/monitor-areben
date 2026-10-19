/**
 * ERP › Productos y precios › Productos (el molde del diseño, `~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 5 del v8):
 * la LISTA con un producto por fila. Sólo LEE; la ficha sigue por `vista=precio&producto=…` de `api/_erp.js` (precio por
 * lista, costo, historial y «Cargar en el ERP»). Lo arma `lib/erp/productos-lista.core.js`; lo llama `api/_erp.js`.
 *
 *   GET ?recurso=erp&vista=productos-lista&marca=bdi|zattia     un producto por fila (Zattia trae también Stunned)
 *
 * 🔑 Las variantes y su stock son los de la lista de Stock (`listaDeStock`: la misma cuenta del disponible), agrupadas por
 * producto. Lo del producto (activo, categoría, proveedor), los precios por lista y el costo salen del motor POR PG, en la
 * misma conexión: supabase-js corta a las 1000 filas y `precio_lista` de Zattia tiene ~5.000.
 * 🔑 «En Tienda Nube» = algún SKU del producto está en `tn_variante` (el catálogo de TN que lee el motor cada 2 h): publicado
 * u oculto según `tn_producto.publicado`; ninguno ⇒ ⛔ está en TN.
 */
import { listaDeStock } from './_erp-stock.js'
import { armarFilasProductos } from '../lib/erp/productos-lista.core.js'

const MARCAS = ['bdi', 'zattia']

/** Lo del motor para la lista: los activos con su proveedor, los precios y el costo vigentes, y si está en TN. */
async function delMotor(pg) {
  const productos = (await pg.query(`select p.id, p.nombre, p.marca, p.categoria, pr.nombre as proveedor
    from producto p left join proveedor pr on pr.id = p.proveedor_id where p.activo`)).rows
  const precios = (await pg.query('select product_id, marca, lista, precio from precio_lista')).rows
  const costos = (await pg.query('select product_id, marca, costo from costo_vigente')).rows
  // El SKU como lo guardó TN y en mayúsculas sin espacios: como cruza la copia del motor.
  const tn = (await pg.query(`select i.product_id, bool_or(t.publicado) as publicado
    from inventario i
    join tn_variante v on upper(trim(v.sku)) = upper(trim(i.sku))
    join tn_producto t on t.tienda = v.tienda and t.tn_id = v.tn_product_id
    where i.sku is not null and i.sku <> ''
    group by i.product_id`)).rows
  const [{ leida } = {}] = (await pg.query('select max(leida_en) as leida from tn_catalogo_lectura')).rows
  return { productos, precios, costos, tn, tnLeidaEn: leida ? new Date(leida).toISOString() : null }
}

/**
 * @param {{ marca: string }} p
 * @param {{ conMotor: Function, pedidosSinPagar: Function, leerInventario?: Function }} deps
 */
export async function listaDeProductos({ marca }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const [stock, motor] = await Promise.all([
    listaDeStock({ marca }, deps),
    deps.conMotor(marca, 'Los productos del ERP', (pg) => delMotor(pg)),
  ])
  if (stock.status) return stock
  if (motor.status) return motor
  return {
    filas: armarFilasProductos({ productos: motor.productos, stock: stock.filas, precios: motor.precios, costos: motor.costos, tn: motor.tn }),
    libroHasta: stock.libroHasta,
    pedidosLeidosEn: stock.pedidosLeidosEn,
    tnLeidaEn: motor.tnLeidaEn,
  }
}

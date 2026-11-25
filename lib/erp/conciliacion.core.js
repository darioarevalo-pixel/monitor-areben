/**
 * La CONCILIACIÓN del día (pestaña `erp › Conciliación`, paso 7): el ERP contra Tienda Nube, GN y Mercado Libre, con lo
 * que ⛔ cierra a la vista para resolverlo. Puro: el handler (`api/_erp.js`) lee `conciliacion_dia` y `conciliacion_fila`
 * (motor sql/024, las escribe `bin/tn.mjs conciliar` una vez por día) y el resumen del diff de GN (`stock_libro_dia`), y
 * esto los arma.
 *
 * 🔑 Hasta el corte GN sirve y el ERP es la PRUEBA (Bruno, 18-oct): esta pantalla ⛔ arregla nada, dice qué ⛔ cierra y
 * qué mirar. Lo «en vuelo» (pagado hace menos de 3 h) se cuenta y se esconde, como las explicadas de Diferencias.
 * 🔑 Las clases las escribe el motor (`lib/conciliacion.mjs`, `CLASES`); una que esta pantalla ⛔ conoce se avisa.
 */
import { ADMIN } from './pedidos-tn.core.js'

export const TIENDAS = ['bdi', 'zattia', 'stunned']

/** Qué quiere decir cada clase y qué mirar, en palabras del equipo. En el orden en que se miran. */
export const CLASE = {
  stock_tn: {
    tn_distinto: { nombre: 'Tienda Nube muestra otro número', mirar: 'Enviar el stock a Tienda Nube.' },
    libro_aparte: { nombre: 'Areben Gestión dice otro stock', mirar: 'Mirá los movimientos del producto.' },
    los_tres: { nombre: 'Los tres dicen distinto', mirar: 'Mirá los movimientos del producto.' },
    tn_atrasado: { nombre: 'Tienda Nube atrasada', mirar: 'El sistema anterior no la actualizó.' },
    gn_aparte: { nombre: 'El sistema anterior dice otro stock', mirar: 'El sistema anterior se movió después.' },
    sin_variante: { nombre: 'SKU que no existe', mirar: 'Corregí el SKU en Tienda Nube.' },
  },
  pedido_erp: {
    falta_venta: { nombre: 'Pagado sin venta', mirar: 'Entra solo en 2 horas. Si sigue mañana, avisá.' },
    no_entra: { nombre: 'Pagado sin poder registrarse', mirar: 'Corregí lo que dice el motivo: después entra solo.' },
    venta_anulada: { nombre: 'Pagado con la venta anulada', mirar: 'Tienda Nube lo cobró y la venta está anulada.' },
    venta_de_cancelada: { nombre: 'Cancelado con la venta activa', mirar: 'Se anula sola en 2 horas. Si sigue mañana, avisá.' },
    total_distinto: { nombre: 'Total distinto', mirar: 'El total de la venta no coincide con el pedido.' },
  },
  pedido_gn: {
    sin_venta: { nombre: 'Pagado sin venta en el sistema anterior', mirar: 'El pedido no llegó al sistema anterior: cargarlo en el sistema anterior.' },
    cancelada_con_venta: { nombre: 'Cancelado con la venta activa en el sistema anterior', mirar: 'Tienda Nube lo canceló o lo devolvió y en el sistema anterior la venta sigue: anularla en el sistema anterior.' },
    prendas_distintas: { nombre: 'El sistema anterior tiene otros productos', mirar: 'La venta del sistema anterior no tiene los mismos productos o cantidades que el pedido.' },
    varias_ventas: { nombre: 'Más de una venta en el sistema anterior', mirar: 'El sistema anterior tiene el mismo pedido cargado dos veces.' },
    venta_sin_orden: { nombre: 'Venta del sistema anterior con un pedido que no existe', mirar: 'El sistema anterior tiene una venta con un número de pedido que Tienda Nube no tiene.' },
  },
  stock_ml: {
    ml_distinto: { nombre: 'Mercado Libre muestra otro número', mirar: 'Enviar el stock a Mercado Libre.' },
    libro_aparte: { nombre: 'Mercado Libre: Areben Gestión dice otro stock', mirar: 'Mirá los movimientos del producto.' },
    los_tres: { nombre: 'Mercado Libre: los tres dicen distinto', mirar: 'Mirá los movimientos del producto.' },
    ml_atrasado: { nombre: 'Mercado Libre atrasado', mirar: 'El sistema anterior no la actualizó.' },
    gn_aparte: { nombre: 'Mercado Libre: el sistema anterior dice otro stock', mirar: 'El sistema anterior se movió después.' },
    sin_variante: { nombre: 'Mercado Libre: SKU que no existe', mirar: 'Corregí el SKU en Mercado Libre.' },
    sin_sku: { nombre: 'Publicación de Mercado Libre sin SKU', mirar: 'Cargale el SKU en Mercado Libre.' },
  },
  pedido_ml: {
    sin_venta: { nombre: 'Venta de Mercado Libre sin venta en el sistema anterior', mirar: 'La venta no llegó al sistema anterior: cargarla en el sistema anterior.' },
    cancelada_con_venta: { nombre: 'Cancelada en Mercado Libre con la venta activa en el sistema anterior', mirar: 'Mercado Libre la canceló y en el sistema anterior la venta sigue: anularla en el sistema anterior.' },
    prendas_distintas: { nombre: 'Mercado Libre: el sistema anterior tiene otros productos', mirar: 'La venta del sistema anterior no tiene los mismos productos o cantidades que la de Mercado Libre.' },
    varias_ventas: { nombre: 'Mercado Libre: más de una venta en el sistema anterior', mirar: 'El sistema anterior tiene la misma venta de Mercado Libre cargada dos veces.' },
    venta_sin_orden: { nombre: 'Venta del sistema anterior con una venta de Mercado Libre que no existe', mirar: 'El sistema anterior tiene una venta con un número de Mercado Libre que no está.' },
  },
}

export const TIPO = {
  stock_tn: { nombre: 'Stock en Tienda Nube', unidad: 'variantes' },
  pedido_erp: { nombre: 'Pedidos de Tienda Nube', unidad: 'pedidos' },
  pedido_gn: { nombre: 'Pedidos de Tienda Nube: venta en el sistema anterior', unidad: 'pedidos' },
  stock_ml: { nombre: 'Stock en Mercado Libre', unidad: 'variantes' },
  pedido_ml: { nombre: 'Ventas de Mercado Libre: venta en el sistema anterior', unidad: 'ventas' },
}

/** Por qué el ERP ⛔ puede registrar un pedido (`saltadas` de `planVentasTN` del motor). */
export const MOTIVO = {
  cuenta_desconocida: 'la forma de pago no tiene cuenta de cobro',
  sin_variante: 'un producto sin variante en Areben Gestión',
  sin_lineas: 'el pedido no tiene productos',
  subtotal_distinto: 'la suma de los productos no da el subtotal',
}

const n = (x) => (x == null ? null : Number(x))

/**
 * @param {object} x
 * @param {'bdi'|'zattia'|'stunned'} x.tienda
 * @param {any[]} x.filas      `conciliacion_fila` del día y la tienda
 * @param {any} x.resumen      `conciliacion_dia.resumen` (null si ese día ⛔ se calculó)
 * @param {Map<string, {nombre, talle}>} x.nombres  del espejo, por 'product_id/size_id'
 * @param {any} [x.diaGN]      `stock_libro_dia` del mismo día (el diff de GN contra el libro), o null
 */
export function armarConciliacion({ tienda, filas, resumen, nombres, diaGN = null }) {
  const aFila = (r) => {
    const nm = r.product_id != null ? nombres.get(`${r.product_id}/${r.size_id}`) : null
    const d = r.detalle || {}
    return {
      tipo: r.tipo, clase: r.clase, clave: r.clave, dias: Number(r.dias || 1),
      producto: r.product_id != null ? String(r.product_id) : null, talle: r.size_id != null ? String(r.size_id) : null,
      nombre: nm?.nombre ?? d.nombre ?? null, talleNombre: nm?.talle ?? null, sku: r.sku ?? null,
      tn: n(r.tn), erp: n(r.libro), gn: n(r.gn), reservado: n(r.reservado) || 0,
      numero: r.numero ?? null, estado: d.status ? (d.payment_status ? `${d.status}/${d.payment_status}` : d.status) : null, medio: d.gateway ?? null,
      total: d.total ?? null, totalErp: d.total_erp ?? null, motivo: d.motivo ? MOTIVO[d.motivo] ?? d.motivo : null,
      link: ADMIN[tienda] && d.tn_id ? `${ADMIN[tienda]}/orders/${d.tn_id}` : null,
    }
  }
  const todas = filas.map(aFila)
  const grupos = []
  for (const tipo of Object.keys(CLASE)) {
    for (const [clase, t] of Object.entries(CLASE[tipo])) {
      const del = todas.filter((f) => f.tipo === tipo && f.clase === clase)
        .sort((a, b) => b.dias - a.dias || Math.abs((b.tn ?? 0) - (b.erp ?? 0)) - Math.abs((a.tn ?? 0) - (a.erp ?? 0)) || String(a.nombre ?? a.numero ?? '').localeCompare(String(b.nombre ?? b.numero ?? '')))
      if (del.length) grupos.push({ tipo, clase, ...t, filas: del, deAntes: del.filter((f) => f.dias > 1).length })
    }
  }
  const enVuelo = todas.filter((f) => f.clase === 'en_vuelo').length
  const desconocidas = todas.filter((f) => f.clase !== 'en_vuelo' && !CLASE[f.tipo]?.[f.clase]).length
  const noCierran = (tipo) => todas.filter((f) => f.tipo === tipo && f.clase !== 'en_vuelo').length

  const s = resumen?.stock_tn
  const p = resumen?.pedidos
  // 🔴 La tienda ya cortó ese día (lo dice el motor en el resumen): Gestión Nube ⛔ es testigo ⇒ ⛔ se muestra.
  const sinGn = !!s?.sin_gn
  const tarjetas = [
    { tipo: 'stock_tn', ...TIPO.stock_tn, ...(sinGn ? { nombre: 'Stock en Tienda Nube' } : {}), calculado: !!s, cierran: s ? Number(s.cierran) : null, total: s ? Number(s.comparadas ?? s.cierran + noCierran('stock_tn')) : null,
      aparte: s ? Number(s.clases?.stock_tn?.sin_variante || 0) : 0 },
    { tipo: 'pedido_erp', ...TIPO.pedido_erp, calculado: !!p, total: p ? Number(p.pedidos) : null, noCierran: noCierran('pedido_erp') },
    ...(sinGn ? [] : [{ tipo: 'pedido_gn', ...TIPO.pedido_gn, calculado: !!p, total: p ? Number(p.pedidos) : null, noCierran: noCierran('pedido_gn') }]),
  ]
  // Mercado Libre es sólo de BDI (`bin/ml.mjs conciliar`): en Zattia y Stunned ⛔ hay tarjeta.
  if (tienda === 'bdi') {
    const sm = resumen?.stock_ml
    const pm = resumen?.pedidos_ml
    tarjetas.push(
      { tipo: 'stock_ml', ...TIPO.stock_ml, ...(sm?.sin_gn ? { nombre: 'Stock en Mercado Libre' } : {}), calculado: !!sm, cierran: sm ? Number(sm.cierran) : null, total: sm ? Number(sm.comparadas) : null,
        aparte: sm ? Number(sm.clases?.stock_ml?.sin_variante || 0) + Number(sm.clases?.stock_ml?.sin_sku || 0) : 0 },
      ...(sm?.sin_gn ? [] : [{ tipo: 'pedido_ml', ...TIPO.pedido_ml, calculado: !!pm, total: pm ? Number(pm.packs) : null, noCierran: noCierran('pedido_ml') }]),
    )
  }
  // El diff de GN contra el libro, por depósito (vive en Diferencias; acá sólo su cuenta, de ESTA línea: en la base de
  // Zattia el diff es de Zattia y Stunned juntas, y `porLinea` las separa).
  const linea = diaGN?.resumen?.porLinea ? diaGN.resumen.porLinea[tienda] ?? { inexplicadas: 0 } : null
  const gn = sinGn ? { calculado: false, sinExplicar: null, sinGn: true }
    : linea ? { calculado: true, sinExplicar: Number(linea.inexplicadas || 0) } : { calculado: false, sinExplicar: null }
  return { grupos, tarjetas, gn, enVuelo, desconocidas, noCierran: todas.filter((f) => f.clase !== 'en_vuelo').length }
}

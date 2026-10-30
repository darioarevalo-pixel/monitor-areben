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
    libro_aparte: { nombre: 'El ERP dice otro stock', mirar: 'Tienda Nube y Gestión Nube coinciden y el ERP no: mirá el historial del producto (le falta o le sobra un movimiento).' },
    los_tres: { nombre: 'Los tres dicen distinto', mirar: 'Tienda Nube, Gestión Nube y el ERP muestran tres números distintos: mirá el historial del producto.' },
    tn_atrasado: { nombre: 'Tienda Nube atrasada', mirar: 'El ERP y Gestión Nube coinciden y la tienda todavía muestra otro número: Gestión Nube no se lo llevó (hoy lo actualiza Gestión Nube).' },
    gn_aparte: { nombre: 'Gestión Nube dice otro stock', mirar: 'El ERP y Tienda Nube coinciden y Gestión Nube no: Gestión Nube se movió después, o su copia está vieja.' },
    sin_variante: { nombre: 'En Tienda Nube sin producto en el ERP', mirar: 'El código o el código de la tienda no existe en el ERP: su stock no se puede actualizar. Corregir el código en Tienda Nube.' },
  },
  pedido_erp: {
    falta_venta: { nombre: 'Pagado sin venta en el ERP', mirar: 'El ERP lo toma solo en la próxima vuelta (cada 2 horas). Si sigue al día siguiente, algo lo frena.' },
    no_entra: { nombre: 'Pagado que el ERP no puede registrar', mirar: 'Hay que corregir lo que dice el motivo; después entra solo.' },
    venta_anulada: { nombre: 'Pagado con la venta anulada en el ERP', mirar: 'Tienda Nube lo cobró y en el ERP la venta está anulada.' },
    venta_de_cancelada: { nombre: 'Cancelado con la venta activa en el ERP', mirar: 'El ERP la anula solo en la próxima vuelta. Si sigue al día siguiente, algo lo frena.' },
    total_distinto: { nombre: 'El ERP no suma lo que cobró Tienda Nube', mirar: 'El total de la venta del ERP es distinto del pedido.' },
  },
  pedido_gn: {
    sin_venta: { nombre: 'Pagado sin venta en Gestión Nube', mirar: 'El pedido no llegó a Gestión Nube: cargarlo en Gestión Nube.' },
    cancelada_con_venta: { nombre: 'Cancelado con la venta activa en Gestión Nube', mirar: 'Tienda Nube lo canceló o lo devolvió y en Gestión Nube la venta sigue: anularla en Gestión Nube.' },
    prendas_distintas: { nombre: 'Gestión Nube tiene otros productos', mirar: 'La venta de Gestión Nube no tiene las mismas productos o cantidades que el pedido.' },
    varias_ventas: { nombre: 'Más de una venta en Gestión Nube', mirar: 'Gestión Nube tiene el mismo pedido cargado dos veces.' },
    venta_sin_orden: { nombre: 'Venta de Gestión Nube con un pedido que no existe', mirar: 'Gestión Nube tiene una venta con un número de pedido que Tienda Nube no tiene.' },
  },
  stock_ml: {
    libro_aparte: { nombre: 'Mercado Libre: el ERP dice otro stock', mirar: 'Mercado Libre y Gestión Nube coinciden y el ERP no: mirá el historial del producto.' },
    los_tres: { nombre: 'Mercado Libre: los tres dicen distinto', mirar: 'Mercado Libre, Gestión Nube y el ERP muestran tres números distintos: mirá el historial del producto.' },
    ml_atrasado: { nombre: 'Mercado Libre atrasado', mirar: 'El ERP y Gestión Nube coinciden y la publicación todavía muestra otro número: Gestión Nube no se lo llevó.' },
    gn_aparte: { nombre: 'Mercado Libre: Gestión Nube dice otro stock', mirar: 'El ERP y Mercado Libre coinciden y Gestión Nube no: Gestión Nube se movió después, o su copia está vieja.' },
    sin_variante: { nombre: 'En Mercado Libre sin producto en el ERP', mirar: 'El código de la publicación no existe en el ERP: su stock no se puede actualizar. Corregir el código en Mercado Libre.' },
    sin_sku: { nombre: 'Publicación de Mercado Libre sin código', mirar: 'La publicación no tiene código: no se sabe qué producto es. Cargarle el código en Mercado Libre.' },
  },
  pedido_ml: {
    sin_venta: { nombre: 'Venta de Mercado Libre sin venta en Gestión Nube', mirar: 'La venta no llegó a Gestión Nube: cargarla en Gestión Nube.' },
    cancelada_con_venta: { nombre: 'Cancelada en Mercado Libre con la venta activa en Gestión Nube', mirar: 'Mercado Libre la canceló y en Gestión Nube la venta sigue: anularla en Gestión Nube.' },
    prendas_distintas: { nombre: 'Mercado Libre: Gestión Nube tiene otros productos', mirar: 'La venta de Gestión Nube no tiene las mismas productos o cantidades que la de Mercado Libre.' },
    varias_ventas: { nombre: 'Mercado Libre: más de una venta en Gestión Nube', mirar: 'Gestión Nube tiene la misma venta de Mercado Libre cargada dos veces.' },
    venta_sin_orden: { nombre: 'Venta de Gestión Nube con una venta de Mercado Libre que no existe', mirar: 'Gestión Nube tiene una venta con un número de Mercado Libre que no está.' },
  },
}

export const TIPO = {
  stock_tn: { nombre: 'Stock: Tienda Nube, Gestión Nube y el ERP', unidad: 'variantes' },
  pedido_erp: { nombre: 'Pedidos de Tienda Nube: venta en el ERP', unidad: 'pedidos' },
  pedido_gn: { nombre: 'Pedidos de Tienda Nube: venta en Gestión Nube', unidad: 'pedidos' },
  stock_ml: { nombre: 'Stock: Mercado Libre, Gestión Nube y el ERP', unidad: 'variantes' },
  pedido_ml: { nombre: 'Ventas de Mercado Libre: venta en Gestión Nube', unidad: 'ventas' },
}

/** Por qué el ERP ⛔ puede registrar un pedido (`saltadas` de `planVentasTN` del motor). */
export const MOTIVO = {
  cuenta_desconocida: 'la forma de pago no tiene cuenta de cobro',
  sin_variante: 'un producto sin producto en el ERP',
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
  const tarjetas = [
    { tipo: 'stock_tn', ...TIPO.stock_tn, calculado: !!s, cierran: s ? Number(s.cierran) : null, total: s ? Number(s.comparadas ?? s.cierran + noCierran('stock_tn')) : null,
      aparte: s ? Number(s.clases?.stock_tn?.sin_variante || 0) : 0 },
    { tipo: 'pedido_erp', ...TIPO.pedido_erp, calculado: !!p, total: p ? Number(p.pedidos) : null, noCierran: noCierran('pedido_erp') },
    { tipo: 'pedido_gn', ...TIPO.pedido_gn, calculado: !!p, total: p ? Number(p.pedidos) : null, noCierran: noCierran('pedido_gn') },
  ]
  // Mercado Libre es sólo de BDI (`bin/ml.mjs conciliar`): en Zattia y Stunned ⛔ hay tarjeta.
  if (tienda === 'bdi') {
    const sm = resumen?.stock_ml
    const pm = resumen?.pedidos_ml
    tarjetas.push(
      { tipo: 'stock_ml', ...TIPO.stock_ml, calculado: !!sm, cierran: sm ? Number(sm.cierran) : null, total: sm ? Number(sm.comparadas) : null,
        aparte: sm ? Number(sm.clases?.stock_ml?.sin_variante || 0) + Number(sm.clases?.stock_ml?.sin_sku || 0) : 0 },
      { tipo: 'pedido_ml', ...TIPO.pedido_ml, calculado: !!pm, total: pm ? Number(pm.packs) : null, noCierran: noCierran('pedido_ml') },
    )
  }
  // El diff de GN contra el libro, por depósito (vive en Diferencias; acá sólo su cuenta, de ESTA línea: en la base de
  // Zattia el diff es de Zattia y Stunned juntas, y `porLinea` las separa).
  const linea = diaGN?.resumen?.porLinea ? diaGN.resumen.porLinea[tienda] ?? { inexplicadas: 0 } : null
  const gn = linea ? { calculado: true, sinExplicar: Number(linea.inexplicadas || 0) } : { calculado: false, sinExplicar: null }
  return { grupos, tarjetas, gn, enVuelo, desconocidas, noCierran: todas.filter((f) => f.clase !== 'en_vuelo').length }
}

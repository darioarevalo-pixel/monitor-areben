/**
 * ERP › Ventas, el PILOTO del diseño aprobado (`~/Documents/erp-monitor/diseno.md`, 18-oct): UNA lista con todas las
 * ventas del motor (Caja, Tienda Nube, mayoristas, cambios) y los pedidos de TN SIN PAGAR, con vistas, resumen arriba,
 * columnas a elección y la ficha al costado. Puro: el handler (`api/_erp-ventas.js`) lee las filas y esto las arma.
 *
 * 🔑 Lo que la base del motor ⛔ tiene todavía, se dice de dónde sale:
 *  - el CLIENTE: ninguna venta del motor trae `cliente_id` (medido 18-oct: 0 de ~950) ⇒ el nombre sale del espejo de GN
 *    (por la venta de GN, o por el número de pedido de TN) y la pantalla dice «de GN». Lo del ERP, si está, manda.
 *  - el ESTADO del pedido de TN: `tn_orden.estado` (la regla `estadoPedido` del motor, contrato §14.1).
 *  - la FACTURA: la del ERP (`venta_factura`) o la de GN (`ventas_factura_gn`, por la venta de GN).
 *  - el SALDO: la parte pagada «a cuenta» (`venta_pago.medio = 'cuenta'`, contrato §15). Cuando A entregue
 *    `pendienteDeVentas` (§16), el servidor lo pasa en `pendiente` y manda sobre esta cuenta.
 */

import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'
import { NOMBRE_MEDIO_TN } from './pedidos-tn.core.js'

/**
 * Cómo se nombra cada origen: sigla de la fila y nombre largo.
 * @type {Record<string, { sigla: string, nombre: string }>}
 */
export const ORIGEN = {
  caja: { sigla: 'CJ', nombre: 'Caja' },
  tn: { sigla: 'Tienda Nube', nombre: 'Tienda Nube' },
  ml: { sigla: 'Mercado Libre', nombre: 'Mercado Libre' },
  mayorista: { sigla: 'MY', nombre: 'Mayorista' },
  manual: { sigla: 'MA', nombre: 'Manual' },
}

const NOMBRE_LINEA = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }

/**
 * El chip de estado: [tono, texto]. Ámbar (warning) = alguien tiene que hacer algo · azul/índigo (action/brand) = en
 * curso · verde = cumplido · rojo = anulado · gris = neutro (diseño §1).
 * @type {Record<string, [import('../../components/ui/tokens').Tone, string]>}
 */
export const ESTADO = {
  pedido: ['warning', 'Pedido'],
  a_preparar: ['warning', 'A preparar'],
  en_preparacion: ['action', 'En preparación'],
  listo_retira: ['brand', 'Listo para retirar'],
  listo_envio: ['brand', 'Listo para despachar'],
  retirado: ['success', 'Retirada'],
  despachado: ['success', 'Despachada'],
  entregado: ['success', 'Entregada'],
  pendiente_gn: ['warning', 'Compra pendiente en Gestión Nube'],
  cerrada_gn: ['success', 'Cerrada en Gestión Nube'],
  cancelado: ['danger', 'Cancelado en Tienda Nube'],
  anulada: ['danger', 'Anulada'],
  // §17 (37a): anulada con el paquete armado o ya salido ⇒ la prenda vuelve recién al escanear el desarme.
  a_desarmar: ['warning', 'A desarmar'],
  a_recibir: ['warning', 'A recibir'],
  sin_estado: ['neutral', 'Sin estado de Tienda Nube'],
}

/** El chip del cobro: [tono, texto]. @type {Record<string, [import('../../components/ui/tokens').Tone, string]>} */
export const COBRO = {
  cobrada: ['success', 'Cobrada'],
  saldo: ['warning', 'Con saldo'],
  sinpagar: ['warning', 'Sin pagar'],
  devuelta: ['neutral', 'Devuelta'],
}

const pesos = (x) => Math.round(Number(x || 0) * 100) / 100
/** «$ 18.990» como lo escribe la pantalla (sin centavos, como `formatMoney`). */
export const plata = (x) => `$ ${Math.round(Number(x || 0)).toLocaleString('es-AR')}`

/** Desde cuántos días un pedido sin pagar se marca como viejo (a cobrar o cancelar ya). */
export const PEDIDO_VIEJO_DIAS = 3

/** El estado de una venta (⛔ de un pedido sin pagar: ése es siempre `pedido`). */
export function estadoDeVenta(r) {
  if (r.estado === 'anulada') return r.vueltaPendiente === 'a_desarmar' || r.vueltaPendiente === 'a_recibir' ? r.vueltaPendiente : 'anulada'
  if (r.origen === 'caja') return 'retirado'
  if (r.origen === 'mayorista') return /cerrad/i.test(String(r.gnEstado || '')) ? 'cerrada_gn' : 'pendiente_gn'
  if (r.origen === 'tn' || r.origen === 'ml') {
    const e = r.tnEstado
    if (e === 'listo') return r.envioTipo === 'pickup' ? 'listo_retira' : 'listo_envio'
    if (e && ESTADO[e]) return e
    return 'sin_estado'
  }
  return r.tipo === 'cambio' ? 'retirado' : 'sin_estado'
}

/**
 * Lo que la venta todavía debe: `pendiente` del motor si vino (§16, `pendienteDeVentas`); si no, lo pagado «a cuenta».
 * Una anulada ⛔ debe nada (`anularVenta` da vuelta lo que dejó a cuenta).
 */
export function saldoDeVenta(r) {
  if (r.estado === 'anulada') return 0
  if (r.pendiente != null) return pesos(r.pendiente)
  return pesos((r.pagos || []).filter((p) => p.medio === 'cuenta').reduce((a, p) => a + Number(p.monto || 0), 0))
}

/** Quién vendió, como lo lee el equipo (los usuarios técnicos del motor ⛔ se muestran). */
export function vendioDe(usuario) {
  if (!usuario) return '—'
  if (usuario === 'tienda-nube') return 'Tienda Nube'
  if (usuario === 'gn-mayorista') return 'Desde Gestión Nube'
  return usuario
}

/**
 * Nombre del cliente y de dónde salió (`de`: 'erp' · 'gn' · 'tn' · 'falta' · null): el del ERP manda; si no, el del espejo de GN;
 * si no, el de TN leído EN VIVO (`clienteTn`, pedidos sin pagar: Bruno, 19-oct; ⛔ se guarda); Caja o mayorista sin nadie = consumidor final.
 */
export function clienteDe(r) {
  const erp = r.cliente && (r.cliente.nombre || r.cliente.doc)
  if (erp) return { nombre: erp, de: 'erp' }
  const gn = String(r.clienteGn || '').trim()
  if (gn && !/^consumidor final$/i.test(gn)) return { nombre: gn, de: 'gn' }
  const tn = String(r.clienteTn || '').trim()
  if (tn) return { nombre: tn, de: 'tn' }
  // Un pedido online SIEMPRE tiene comprador: si el espejo de GN todavía ⛔ lo trajo (llega al otro día), ⛔ es «consumidor final».
  if (r.kind === 'pedido' || r.origen === 'tn' || r.origen === 'ml') return { nombre: 'Sin nombre todavía', de: 'falta' }
  return { nombre: 'Consumidor final', de: null }
}

/**
 * Las ventas de TN que ⛔ tienen nombre de ningún lado (ni el ERP ni el espejo de GN): las de una marca SIN GN detrás (Stunned
 * desde el corte) y las que el espejo todavía ⛔ trajo. Hay que pedirlas a TN EN VIVO, como los pedidos sin pagar (⛔ se guarda).
 * Tope: una lista de un mes entera ⛔ puede esperar cientos de lecturas; van las primeras (las más recientes).
 * @param {Array<{ origen: string, origen_ref?: string | null, cliente?: any, clienteGn?: string | null }>} filas
 * @returns {Array<{ i: number, tienda: string, tnId: string }>}
 */
export function ventasDeTnSinNombre(filas, max = 120) {
  const out = []
  filas.forEach((f, i) => {
    if (f.origen !== 'tn' || out.length >= max) return
    if (f.cliente && (f.cliente.nombre || f.cliente.doc)) return
    const gn = String(f.clienteGn || '').trim()
    if (gn && !/^consumidor final$/i.test(gn)) return
    const [tienda, tnId] = String(f.origen_ref || '').split(':')
    if (tienda && /^\d+$/.test(tnId ?? '')) out.push({ i, tienda, tnId })
  })
  return out
}

/** «Tienda Nube · 21938 · retira», «Caja · Zattia», «Mayorista · BDI». */
export function origenTexto(r) {
  const o = ORIGEN[r.origen]?.nombre ?? r.origen
  const linea = NOMBRE_LINEA[r.linea] ?? r.linea
  if (r.tipo === 'cambio') return `Cambio · ${r.originalNumero != null ? `de la #${r.originalNumero}` : linea}`
  if (r.origen === 'tn') return [o, r.tnNumero, r.envioTipo === 'pickup' ? 'retira' : r.envioTipo === 'ship' ? 'envío' : null].filter(Boolean).join(' · ')
  return `${o} · ${linea}`
}

/**
 * 🔑 La FECHA de la fila es la del PEDIDO, siempre (Bruno, 19-oct): en una venta de TN, cuando entró el pedido (`tn_orden.creada_en`),
 * ⛔ cuando se pagó (`ocurrida_en`: con esa, tres pedidos de días distintos pagados juntos parecían entrar juntos). Sin pedido
 * (Caja, mayorista), la de la venta. El PERÍODO sigue contando por la venta (`ocurrida_en`, lo que lee el servidor).
 */
export function pedidoEn(r) {
  return r.tnCreadaEn && Date.parse(r.tnCreadaEn) < Date.parse(r.ocurridaEn) ? r.tnCreadaEn : r.ocurridaEn
}

/**
 * Una fila de la lista a partir de lo que leyó el servidor. `r.kind`: 'venta' (del motor) o 'pedido' (TN sin pagar).
 * @returns {any} la fila lista para pintar y filtrar (su forma: `FilaVentaLista` de `lib/erp/cliente.ts`).
 */
export function armarFila(r) {
  if (r.kind === 'pedido') {
    const cliente = clienteDe(r)
    const medio = (r.medio && NOMBRE_MEDIO_TN[r.medio]) || r.gateway || null
    return {
      kind: 'pedido', id: `tn:${r.tienda}:${r.tnId}`, numero: null, ref: `Tienda Nube ${r.tnNumero}`, linea: r.tienda, origen: 'tn',
      tipo: 'venta', ocurridaEn: r.creadaEn, pedidoEn: r.creadaEn, cliente: cliente.nombre, clienteDe: cliente.de, total: pesos(r.total), saldo: pesos(r.total),
      // «A preparar» sólo si el motor lo dejó así (interruptor `sin_pagar_a_preparar`, sql/040); el resto sigue siendo `pedido`, como antes.
      estadoKey: r.estado === 'a_preparar' ? 'a_preparar' : 'pedido', cobroKey: 'sinpagar', origenTexto: `Tienda Nube · ${r.tnNumero} · sin pagar${medio ? ` · ${medio}` : ''}`, vendio: 'Tienda Nube',
      factura: null, facturada: false, nota: null, prueba: false, anulada: false, link: r.link ?? null, unidades: r.unidades ?? null,
      // Lo que tenía la pestaña «Pedidos sin pagar» (Bruno, 17-oct: se va adentro de Ventas): hace cuánto, cómo eligió pagar y qué retiene.
      dias: r.dias ?? null, medio, prendas: r.prendas ?? [],
      // Cerrado en TN sin pago (Bruno, 19-oct): sigue en la lista hasta cobrarlo o cancelarlo, pero ⛔ retiene stock.
      entregadoSinCobrar: !!r.entregadoSinCobrar,
      busca: normal([r.tnNumero, cliente.nombre, ...(r.prendas ?? []).map((x) => x.nombre ?? x.sku ?? '')].join(' ')),
    }
  }
  const cliente = clienteDe(r)
  const estadoKey = estadoDeVenta(r)
  const saldo = saldoDeVenta(r)
  const anulada = r.estado === 'anulada'
  const factura = r.facturaErp || r.facturaGn || null
  return {
    kind: 'venta', id: r.id, numero: Number(r.numero), ref: `#${r.numero}`, linea: r.linea, origen: r.origen, canal: r.canal ?? null, tipo: r.tipo,
    ocurridaEn: r.ocurridaEn, pedidoEn: pedidoEn(r), cliente: cliente.nombre, clienteDe: cliente.de, total: pesos(r.total), saldo,
    estadoKey, cobroKey: anulada ? 'devuelta' : saldo > 0 ? 'saldo' : 'cobrada', origenTexto: origenTexto(r), vendio: vendioDe(r.usuario),
    factura: factura ? { numero: factura, de: r.facturaErp ? 'erp' : 'gn' } : null, facturada: !!factura,
    nota: r.nota ?? null, clienteId: r.clienteId ?? null, entrega: r.entrega ?? null, prueba: !!r.prueba, anulada, tieneCambio: !!r.tieneCambio, link: r.link ?? null, unidades: r.unidades ?? null,
    busca: normal([r.numero, r.tnNumero, r.gnNumero, cliente.nombre, r.nota?.texto].filter(Boolean).join(' ')),
  }
}

/** Minúsculas y sin tildes: el buscador lee «Lucia» y «Lucía» igual. */
export function normal(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Las vistas: [clave, nombre, predicado]. Se entra filtrado; el número de cada una sale del período elegido.
 * @type {Array<[string, string, (f: any) => boolean]>}
 */
export const VISTAS = [
  ['todas', 'Todas', () => true],
  ['preparar', 'A preparar', (f) => f.estadoKey === 'a_preparar' || f.estadoKey === 'en_preparacion' || f.estadoKey === 'pendiente_gn'],
  ['listas', 'Listas', (f) => f.estadoKey === 'listo_retira' || f.estadoKey === 'listo_envio'],
  ['desarmar', 'A desarmar', (f) => f.estadoKey === 'a_desarmar' || f.estadoKey === 'a_recibir'],
  ['sinpagar', 'Sin pagar', (f) => f.cobroKey === 'sinpagar'],
  ['saldo', 'Con saldo', (f) => f.cobroKey === 'saldo'],
  // Un cambio ⛔: se factura con la original (NC por lo devuelto + factura por lo nuevo, `facturarCambio`).
  ['sinfactura', 'Sin factura', (f) => f.kind === 'venta' && f.tipo === 'venta' && !f.anulada && !f.facturada],
  ['anuladas', 'Anuladas', (f) => f.anulada],
]

/** Cuántas filas tiene cada vista. */
export function contarVistas(filas) {
  return Object.fromEntries(VISTAS.map(([k, , p]) => [k, filas.filter(p).length]))
}

/**
 * Las filas de la vista, del origen elegido y que lean el texto buscado (número, pedido de TN, cliente, nota).
 * @param {any[]} filas
 * @param {{ vista?: string, q?: string, origenes?: string[] }} f
 */
export function filtrar(filas, { vista = 'todas', q = '', origenes = [] } = {}) {
  const p = (VISTAS.find((v) => v[0] === vista) || VISTAS[0])[2]
  const t = normal(q).trim().replace(/^#/, '')
  return filas.filter((f) => p(f) && (!origenes.length || origenes.includes(f.origen)) && (!t || f.busca.includes(t)))
}

/**
 * El resumen del filtro, ARRIBA (diseño §3): vendido (lo confirmado; un cambio suma su diferencia), cantidad de ventas
 * (sin cambios ni pedidos sin pagar), ticket promedio y por cobrar (saldo de las ventas + pedidos sin pagar aparte).
 */
export function resumen(filas) {
  const vivas = filas.filter((f) => f.kind === 'venta' && !f.anulada)
  const vendido = pesos(vivas.reduce((a, f) => a + f.total, 0))
  const ventas = vivas.filter((f) => f.tipo === 'venta').length
  return {
    vendido, ventas, ticket: ventas ? Math.round(vendido / ventas) : 0,
    porCobrar: pesos(vivas.reduce((a, f) => a + f.saldo, 0)),
    sinPagar: pesos(filas.filter((f) => f.kind === 'pedido').reduce((a, f) => a + f.total, 0)),
  }
}

/** Ordena por una columna que ordena. Sin orden: la más nueva arriba. */
export function ordenar(filas, orden) {
  const k = orden?.col
  const dir = orden?.dir === 'asc' ? 1 : -1
  const val = (f) => (k === 'total' ? f.total : k === 'n' ? (f.numero ?? -1) : k === 'c' ? normal(f.cliente) : Date.parse(f.pedidoEn))
  return filas.slice().sort((a, b) => {
    const x = val(a), y = val(b)
    if (!k) return Date.parse(b.pedidoEn) - Date.parse(a.pedidoEn)
    return (x > y ? 1 : x < y ? -1 : 0) * dir
  })
}

/**
 * Las columnas de la lista: clave → [título, ancho de la grilla, ordena, fija]. Las fijas (Nº, Cliente, Total) van
 * siempre; el resto se muestra, se oculta y se reordena desde «Columnas», y queda guardado por usuario.
 * 🔴 Cada ancho lleva su MÍNIMO en px (`ListaTrabajo` › `anchoMinimo`): todas las filas miden igual y las `fr` reparten
 *    lo que sobra igual en todas (con `max-content` la #348 de Zattia, nombre largo, corría la fila: 19-oct). Las de siempre
 *    suman ~1.030 px con el tilde y los íconos: entran en el monitor de Bruno (1333 px) al lado del menú del ERP (216 px);
 *    con 1.200 px el Total quedaba cortado a la derecha (19-oct). Lo que no entra, «…» y el texto entero al pasar el mouse.
 * @type {Record<string, [string, string, boolean, boolean]>}
 */
export const COLUMNAS = {
  n: ['Nº', '56px', true, true],
  h: ['Fecha', '84px', true, false],
  c: ['Cliente', 'minmax(130px, 1.2fr)', true, true],
  o: ['Origen', 'minmax(150px, 1.3fr)', false, false],
  e: ['Estado', '150px', false, false],
  p: ['Cobro', '100px', false, false],
  total: ['Total', '104px', true, true],
  fac: ['Factura', '150px', false, false],
  ven: ['Vendió', '120px', false, false],
  nota: ['Nota', 'minmax(200px, 1.3fr)', false, false],
  linea: ['Línea', '84px', false, false],
}

/** Las de siempre: el orden y cuáles se ven al entrar (o con «Volver a las de siempre»). */
export const COLUMNAS_DE_SIEMPRE = { orden: ['n', 'h', 'c', 'o', 'e', 'p', 'total', 'fac', 'ven', 'nota', 'linea'], visibles: ['n', 'h', 'c', 'o', 'e', 'p', 'total'] }

/**
 * Lo guardado (puede venir viejo, roto o de otra versión) → preferencias válidas: ⛔ columnas que ya no existen, las
 * nuevas al final y ocultas, las fijas siempre visibles.
 * La cuenta es la de todas las listas del ERP (`lista-columnas.core.js`), con las columnas de Ventas.
 * @param {any} raw
 * @returns {import('./lista-columnas.core.js').Prefs}
 */
export const normalizarPrefs = (raw) => normalizarPrefsDe(COLUMNAS, COLUMNAS_DE_SIEMPRE, raw)

/** Muestra u oculta una columna (las fijas ⛔ se ocultan). */
export const alternarColumna = (prefs, col) => alternarColumnaDe(COLUMNAS, prefs, col)

export { moverColumna }

/**
 * Los íconos de la fila (lista de TRABAJO, a la izquierda; diseño §4): $ cobro, lápiz editar, factura.
 * `puede` = lo que el motor ya sabe hacer desde acá (`{ cobrar, editar }`): sin la función, el ícono avisa por qué.
 */
export function accionesDeFila(f, puede = {}) {
  if (f.kind === 'pedido') {
    return {
      cobro: { activo: true, verde: true, label: 'Pedido sin pagar: se cobra en Cobranzas ↗' },
      editar: { activo: false, label: 'Es un pedido de Tienda Nube: todavía no es una venta' },
      factura: { activo: false, verde: false, label: 'Sin factura: todavía no es una venta' },
    }
  }
  const debe = f.saldo > 0
  return {
    cobro: debe
      ? { activo: true, verde: true, label: puede.cobrar ? `Registrar cobro · saldo ${plata(f.saldo)}` : 'Registrar cobro (todavía no disponible)' }
      : { activo: true, verde: false, label: f.anulada ? 'Anulada · ver los pagos' : 'Cobrada · ver cobros' },
    editar: f.anulada ? { activo: false, label: 'Anulada: no se edita' } : { activo: true, label: 'Editar' },
    factura: f.facturada
      ? { activo: true, verde: true, label: `Factura ${f.factura.numero}${f.factura.de === 'gn' ? ' (de Gestión Nube)' : ''}` }
      : { activo: !f.anulada && f.tipo === 'venta', verde: false, label: f.anulada ? 'Anulada: sin factura' : 'Sin factura · facturar en Caja › Factura' },
  }
}

/**
 * El HISTORIAL de una venta: todo lo que le pasó, con quién y cuándo, del más viejo al más nuevo. Sale de lo que la
 * base ya tiene (la venta, sus pagos, su factura, el pedido de TN, sus cambios, la anulación) + las ediciones y notas
 * del motor cuando existan (§16: `historialDe`, `notasDe`). Una edición muestra antes → después.
 * @returns {Array<{ cuando: string, titulo: string, detalle: string, icono: string, tono: string, antes?: string, despues?: string }>}
 */
export function historialDeVenta(ficha, extra = {}) {
  const v = ficha.venta
  const h = []
  const o = ORIGEN[v.origen]?.nombre ?? v.origen
  h.push({ cuando: v.ocurridaEn, titulo: v.tipo === 'cambio' ? 'Se hizo el cambio' : 'Se vendió', detalle: [o, vendioDe(v.usuario)].join(' · '), icono: 'ventas', tono: 'neutral' })
  if (extra.tn?.creadaEn && extra.tn.creadaEn < v.ocurridaEn) {
    h.push({ cuando: extra.tn.creadaEn, titulo: 'Entró el pedido', detalle: `Tienda Nube · pedido ${extra.tn.numero}`, icono: 'tienda-nube', tono: 'neutral' })
  }
  for (const p of ficha.pagos || []) {
    h.push({ cuando: v.ocurridaEn, titulo: p.medio === 'cuenta' ? `Quedó a cuenta · ${plata(p.monto)}` : `Cobro · ${plata(p.monto)}`, detalle: [p.cuenta, p.medio].filter(Boolean).join(' · '), icono: 'efectivo', tono: p.medio === 'cuenta' ? 'warning' : 'success' })
  }
  for (const f of extra.facturas || []) {
    h.push({ cuando: f.cuando || v.ocurridaEn, titulo: f.tipo === 'nc' ? `Nota de crédito ${f.numero}` : `Factura ${f.numero}`, detalle: f.de === 'gn' ? 'la hizo Gestión Nube' : 'la hizo el ERP', icono: 'factura', tono: 'neutral' })
  }
  if (extra.tn?.estado && ESTADO[extra.tn.estado] && extra.tn.actualizadaEn) {
    const k = extra.tn.estado === 'listo' ? (extra.tn.envioTipo === 'pickup' ? 'listo_retira' : 'listo_envio') : extra.tn.estado
    h.push({ cuando: extra.tn.actualizadaEn, titulo: (ESTADO[k] || ESTADO.sin_estado)[1], detalle: 'así está en Tienda Nube', icono: 'envios', tono: (ESTADO[k] || ESTADO.sin_estado)[0] })
  }
  if (ficha.original) h.push({ cuando: v.ocurridaEn, titulo: `Es un cambio de la venta #${ficha.original.numero}`, detalle: '', icono: 'cambios', tono: 'brand' })
  for (const c of ficha.cambios || []) {
    h.push({ cuando: c.ocurridaEn, titulo: `Hizo un cambio · #${c.numero}`, detalle: `diferencia ${plata(c.total)}${c.estado === 'anulada' ? ' · anulado' : ''}`, icono: 'cambios', tono: 'brand' })
  }
  for (const e of extra.ediciones || []) {
    h.push({ cuando: e.cuando, titulo: `Editó ${e.campo}`, detalle: e.usuario || '', icono: 'lapiz', tono: 'brand', antes: e.antes ?? '—', despues: e.despues ?? '—' })
  }
  for (const n of extra.notas || []) {
    h.push({ cuando: n.cuando, titulo: n.reemplaza ? 'Cambió la nota' : 'Agregó una nota', detalle: n.de || '', icono: 'nota', tono: 'warning', ...(n.reemplaza ? { antes: n.reemplaza, despues: n.texto } : {}) })
  }
  if (ficha.anulacion) h.push({ cuando: ficha.anulacion.anuladaEn, titulo: 'Anulada', detalle: `${ficha.anulacion.usuario} · «${ficha.anulacion.motivo}»`, icono: 'anular', tono: 'danger' })
  // §17: la plata que se devolvió (o el saldo que quedó) y el desarme, cada uno en su fecha.
  for (const d of ficha.devolucion?.devoluciones || []) {
    h.push({ cuando: d.en, titulo: d.forma === 'saldo' ? `Quedó ${plata(d.monto)} de saldo a favor` : `Se devolvieron ${plata(d.monto)}`, detalle: [d.forma === 'saldo' ? '' : d.cuenta ?? d.medio, d.usuario].filter(Boolean).join(' · '), icono: 'anular', tono: 'danger' })
  }
  if (ficha.devolucion?.volvio) {
    h.push({ cuando: ficha.devolucion.volvio.en, titulo: ficha.anulacion?.vuelta === 'a_recibir' ? 'Se recibieron los productos' : 'Se desarmó el paquete', detalle: `${ficha.devolucion.volvio.usuario} · volvieron al stock`, icono: 'envios', tono: 'success' })
  }
  return h.map((x, i) => [x, i]).sort((a, b) => Date.parse(a[0].cuando) - Date.parse(b[0].cuando) || a[1] - b[1]).map(([x]) => x)
}

/** El rango del período: 'mes' (este mes), 'anterior', '7d', '30d'. Días argentinos (YYYY-MM-DD). */
export function rangoDePeriodo(periodo, hoy) {
  const [a, m] = hoy.split('-').map(Number)
  const dia = (d) => d.toISOString().slice(0, 10)
  const atras = (n) => dia(new Date(Date.parse(`${hoy}T12:00:00Z`) - n * 86_400_000))
  if (periodo === 'anterior') {
    const ini = new Date(Date.UTC(a, m - 2, 1)), fin = new Date(Date.UTC(a, m - 1, 0))
    return { desde: dia(ini), hasta: dia(fin) }
  }
  if (periodo === '7d') return { desde: atras(6), hasta: hoy }
  if (periodo === '30d') return { desde: atras(29), hasta: hoy }
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }
}

/** @type {Array<[string, string]>} */
export const PERIODOS = [['mes', 'Este mes'], ['anterior', 'El mes pasado'], ['7d', 'Últimos 7 días'], ['30d', 'Últimos 30 días']]

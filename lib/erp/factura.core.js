/**
 * La factura A PEDIDO de una venta propia (`erp › Caja`): la clienta pide factura en el mostrador y sale una
 * sola, con su CAE, por el MISMO `facturarLote` que la facturación masiva. Acá, lo puro: qué se le pide a
 * la cajera, de qué venta sale el comprobante y con qué clave queda en `facturas`.
 *
 * 🔑 **La clave en `facturas.venta_id` es la venta de GN si la hay** (`detalle.gn_sale_id`, la que anota la
 * Caja→motor), si no el uuid del motor. Mientras conviven, la MISMA venta está en GN (la ve la masiva por
 * `ventas_cobros`) y en el motor: con la misma clave, `ventasFacturadas` del lote frena la segunda factura
 * venga por donde venga, y la masiva la da por facturada (`yaFacturadas`).
 * 🔴 **Una venta de PRUEBA ⛔ se factura en producción** (`contrato-venta.md`: «prueba ⛔ mueve el libro ni se
 * factura»): hasta el corte, la factura real del local sale de GN. En homologación sí: no tiene valor fiscal.
 */
import { CBTE, COND_IVA, DOC, cuitValido } from '../../motor/arca/arca.core.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const centavos = (x) => Math.round(Number(x) * 100)
/** Un texto de la cajera: sin espacios de más y con tope. '' si viene vacío. */
const textoCorto = (v, tope) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, tope) : '')

/** La condición de IVA de la ficha (código de ARCA) ⇒ la opción de la pantalla; null si ⛔ es de factura A. */
export const opcionDeCondicion = (cond) => Object.keys(CONDICION_A).find((k) => CONDICION_A[k] === Number(cond)) ?? null

/** Las condiciones de IVA que la cajera puede elegir para una factura A. */
export const CONDICION_A = { ri: COND_IVA.RESPONSABLE_INSCRIPTO, monotributo: COND_IVA.MONOTRIBUTO }

/**
 * El cuerpo del POST, validado: `{ ventaId, clase: 'B'|'A', doc?, condicion?, razonSocial?, domicilio? }`.
 * B: sin documento = consumidor final sin identificar; 7-8 cifras = DNI; 11 = CUIT (consumidor final).
 * A: CUIT válido, responsable inscripto o monotributista, la RAZÓN SOCIAL (va impresa y es el nombre de la ficha
 * de la clienta, contrato §11) y el DOMICILIO (Bruno, 15-oct: «creo que sí es obligatorio» ⇒ se pide). Vuelven en
 * `cliente` para guardar la ficha.
 */
export function leerFacturar(body) {
  const ventaId = String(body?.ventaId ?? '')
  if (!UUID.test(ventaId)) return { error: 'Venta inválida' }
  const clase = String(body?.clase ?? 'B').toUpperCase()
  const doc = String(body?.doc ?? '').replace(/\D/g, '')
  if (clase === 'A') {
    if (!cuitValido(doc)) return { error: 'La factura A necesita el CUIT de la clienta (11 números, válido).' }
    const condicionIva = CONDICION_A[String(body?.condicion ?? '')]
    if (!condicionIva) return { error: 'Elegí si es responsable inscripta o monotributista.' }
    const razonSocial = textoCorto(body?.razonSocial, 120)
    if (!razonSocial || razonSocial.length < 2) return { error: 'La factura A lleva la razón social de la clienta.' }
    const domicilio = textoCorto(body?.domicilio, 200)
    if (!domicilio || domicilio.length < 3) return { error: 'La factura A lleva el domicilio de la clienta.' }
    return { ventaId, tipo: CBTE.FACTURA_A, receptor: { docTipo: DOC.CUIT, docNro: Number(doc), condicionIva }, cliente: { razonSocial, domicilio } }
  }
  if (clase !== 'B') return { error: 'La factura es A o B.' }
  const cf = COND_IVA.CONSUMIDOR_FINAL
  if (!doc) return { ventaId, tipo: CBTE.FACTURA_B, receptor: { docTipo: DOC.SIN_IDENTIFICAR, docNro: 0, condicionIva: cf } }
  if (/^\d{7,8}$/.test(doc)) return { ventaId, tipo: CBTE.FACTURA_B, receptor: { docTipo: DOC.DNI, docNro: Number(doc), condicionIva: cf } }
  if (doc.length === 11) {
    if (!cuitValido(doc)) return { error: 'Ese CUIT no es válido.' }
    return { ventaId, tipo: CBTE.FACTURA_B, receptor: { docTipo: DOC.CUIT, docNro: Number(doc), condicionIva: cf } }
  }
  return { error: 'El documento es un DNI (7 u 8 números) o un CUIT (11).' }
}

/** La clave de la venta en `facturas.venta_id`: la de GN si la refleja una, si no la del motor. */
export function claveDeFactura(f) {
  const gn = f?.detalle?.gn_sale_id ?? f?.gn_sale_id
  return gn != null && String(gn).trim() !== '' ? String(gn) : String(f.id)
}

/**
 * Todas las claves con que esa venta pudo quedar en `facturas` (la de GN del detalle, la de la columna —se llena
 * después—, y el uuid). La factura de la venta se busca por TODAS: si la clave cambió, ⛔ sale una segunda.
 */
export function clavesDeFactura(f) {
  return [...new Set([f?.detalle?.gn_sale_id, f?.gn_sale_id, f?.id].filter((x) => x != null && String(x).trim() !== '').map(String))]
}

/**
 * ¿La factura que ya tiene la venta es la que se pide? null = sí (se devuelve la misma). Si no, por qué no:
 * otra clase u otro receptor se hace con nota de crédito y factura nueva, ⛔ se devuelve la vieja callado.
 * @param {{ tipo: any, doc_tipo: any, doc_nro: any }} ya @param {{ tipo: number, receptor: { docTipo: number, docNro: number } }} pedida
 */
export function distintaDeLaPedida(ya, pedida) {
  if (Number(ya.tipo) === pedida.tipo && Number(ya.doc_tipo) === pedida.receptor.docTipo && Number(ya.doc_nro) === Number(pedida.receptor.docNro)) return null
  const letra = Number(ya.tipo) === CBTE.FACTURA_A ? 'A' : 'B'
  const para = Number(ya.doc_tipo) === DOC.SIN_IDENTIFICAR ? 'sin identificar' : `doc. ${ya.doc_nro}`
  return `La venta ya tiene factura ${letra} ${ya.pto_vta}-${ya.numero} (${para}). Para hacer otra, primero se anula con nota de crédito.`
}

/** El mes argentino (YYYY-MM) en que ocurrió la venta: el del techo por el que se factura. */
export function mesDeVenta(iso) {
  return new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 7)
}

/**
 * Lo que frena facturar esa venta ANTES de pedir el CAE (el lote vuelve a validar el comprobante). null = sale.
 * @param {any} f la fila de `venta_ficha` @param {{ ambiente: string, facturada: boolean }} ctx
 */
export function puedeFacturar(f, { ambiente, facturada }) {
  if (!f) return 'La venta no existe.'
  if (f.estado !== 'confirmada') return 'La venta está anulada: no se factura.'
  if (f.tipo !== 'venta') return 'Un cambio se factura con «Facturar el cambio»: nota de crédito por lo devuelto y factura por lo nuevo.'
  if (!(Number(f.total) > 0)) return 'La venta no tiene importe para facturar.'
  if (facturada) return 'La venta ya tiene factura.'
  if (f.prueba && ambiente === 'produccion') return 'Es una venta de PRUEBA: hasta el corte de GN la factura real sale de GN.'
  return null
}

/**
 * Los renglones del PDF: las prendas de la venta, y lo que va de su suma al total (el descuento de la forma de
 * pago, o un recargo) en un renglón aparte, como GN imprime el descuento. Así suman lo facturado.
 * @param {any} f la fila de `venta_ficha` @param {Map<string, { nombre?: string, talle?: string }>} nombres
 */
export function renglonesDeVenta(f, nombres = new Map()) {
  const r = (f.lineas || []).map((l) => {
    const n = nombres.get(`${l.product_id}/${l.size_id}`) || {}
    const cantidad = Number(l.cantidad), importe = Number(l.importe)
    return { descripcion: [n.nombre || l.sku || `Prenda ${l.product_id}`, n.talle].filter(Boolean).join(' - '), cantidad, unitario: cantidad ? importe / cantidad : importe, importe }
  })
  const resto = centavos(f.total) - r.reduce((a, x) => a + centavos(x.importe), 0)
  if (resto) r.push({ descripcion: resto < 0 ? 'Descuento' : 'Recargo', cantidad: 1, unitario: resto / 100, importe: resto / 100 })
  return r
}

/**
 * Lo que frena la NC de una venta propia desde su ficha. null = sale.
 * @param {{ estado: string, facturas?: Array<{ tipo: string }> }} f la fila de `venta_ficha`
 */
export function puedeHacerNC(f) {
  const tipos = (f.facturas || []).map((x) => x.tipo)
  if (!tipos.includes('factura')) return 'La venta no tiene factura.'
  // Una 'nc' atada puede ser la PARCIAL de un cambio: si ya está la de la anulación (o la factura quedó acreditada
  // entera) lo dice `notaDeCredito`, que sabe los montos.
  if (f.estado !== 'anulada') return 'La nota de crédito sale al anular la venta: primero se anula.'
  return null
}

const pesos2 = (c) => Math.round(c) / 100

/**
 * ¿Se puede facturar este CAMBIO? null = sí. Con factura en la original, lo devuelto se acredita contra ELLA. 🔑 Sin
 * factura en la original (Bruno, 15-oct: «se factura lo que paga ese día»), se factura sólo lo COBRADO hoy: si ⛔ se
 * cobró nada, ⛔ hay qué facturar.
 * @param {any} cambio la ficha del cambio (`venta_ficha`) @param {any} original la de la venta original
 */
export function puedeFacturarCambio(cambio, original, { ambiente, facturaOriginal }) {
  if (!cambio) return 'El cambio no existe.'
  if (cambio.tipo !== 'cambio') return 'Eso no es un cambio.'
  if (cambio.estado !== 'confirmada') return 'El cambio está anulado: no se factura.'
  if (!original) return 'No está la venta original del cambio.'
  if (cambio.prueba && ambiente === 'produccion') return 'Es un cambio de PRUEBA: hasta el corte de GN la factura real sale de GN.'
  if (!facturaOriginal) return centavos(cambio.total) > 0 ? null : 'La venta original no tiene factura y en el cambio no se cobró nada: no hay qué facturar.'
  if (facturaOriginal.estado !== 'autorizada' || facturaOriginal.ambiente !== ambiente) return 'La factura de la venta original no está autorizada en este ambiente.'
  return null
}

/**
 * El CAMBIO facturado (Bruno, 14-oct): **NC por lo devuelto + factura por lo nuevo**, con la clase y el receptor de
 * la factura de la venta ORIGINAL (la clienta es la misma).
 * - Lo devuelto se acredita al valor que se FACTURÓ: sus importes por `k = total ÷ subtotal` de la original (el
 *   descuento de la forma de pago de ese día). 🔴 Nunca más de lo que a esa factura le queda sin acreditar.
 * - Lo nuevo se factura por lo que se PAGÓ con eso: el crédito que se usó (lo nuevo hasta lo devuelto, también por `k`)
 *   + lo que se cobró hoy (`cambio.total`, ya con el descuento de la forma de pago de hoy). Si lo devuelto vale más,
 *   lo que sobra queda como saldo a favor y ⛔ entra en la factura nueva.
 * Los renglones son las prendas, y lo que va de su suma al total en un renglón aparte (como la factura de una venta).
 * @param {{ cambio: any, original: any, facturaOriginal: { total: any } | null, acreditado?: number, nombres?: Map<string, any> }} x
 * @returns {{ error: string } | { nc: { total: number, renglones: any[] } | null, factura: { total: number, renglones: any[] } | null, k: number }}
 */
export function armarFacturaDelCambio({ cambio, original, facturaOriginal, acreditado = 0, nombres = new Map() }) {
  // Original SIN factura: ⛔ NC (no hay contra qué acreditar); la factura es lo cobrado hoy, con las prendas que se
  // llevó y las que devolvió (en negativo) y lo que va al total en un renglón aparte, para que sumen.
  if (!facturaOriginal) {
    const hoy = centavos(cambio.total)
    return { k: 1, nc: null, factura: hoy > 0 ? { total: pesos2(hoy), renglones: renglonesDeVenta({ lineas: cambio.lineas || [], total: pesos2(hoy) }, nombres) } : null }
  }
  const sub = centavos(original.subtotal), tot = centavos(original.total)
  const k = sub > 0 ? tot / sub : 1
  const lineas = cambio.lineas || []
  const devueltas = lineas.filter((l) => Number(l.cantidad) < 0).map((l) => ({ ...l, cantidad: -Number(l.cantidad), importe: -Number(l.importe) }))
  const nuevas = lineas.filter((l) => Number(l.cantidad) > 0)
  const D = devueltas.reduce((a, l) => a + centavos(l.importe), 0)
  const N = nuevas.reduce((a, l) => a + centavos(l.importe), 0)
  const nc = Math.round(D * k)
  const queda = centavos(facturaOriginal.total) - centavos(acreditado)
  if (nc > queda) return { error: `Lo devuelto ($${pesos2(nc)}) es más de lo que a la factura original le queda sin acreditar ($${pesos2(queda)}).` }
  const factura = Math.round(Math.min(N, D) * k) + centavos(cambio.total)
  return {
    k,
    nc: nc > 0 ? { total: pesos2(nc), renglones: renglonesDeVenta({ lineas: devueltas, total: pesos2(nc) }, nombres) } : null,
    factura: factura > 0 ? { total: pesos2(factura), renglones: renglonesDeVenta({ lineas: nuevas, total: pesos2(factura) }, nombres) } : null,
  }
}

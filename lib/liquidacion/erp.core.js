/**
 * Liquidación → ERP → Tienda Nube (Stunned; Bruno 30-oct, `erp-stunned.md` §6.1). Puro.
 *
 * 🔑 Para Stunned «Aplicar» ⛔ le escribe a Gestión Nube (ya ⛔ pasa por GN desde el corte del 28-oct): CARGA en el ERP la
 * lista `oferta` del producto y avisa el trabajo `precio-tn:stunned` del motor, que la empuja a TN con su registro
 * (`precio_tn_registro`) y RELEE TN después de escribir. La campaña se da por aplicada recién cuando esa relectura dice que
 * TODAS las variantes quedaron como la campaña quiere (`resultado.campanias` del evento): un pedido aceptado ⛔ alcanza.
 * 🔴 «Sacar» CARGA la oferta = el precio de lista (⛔ «soltar»: el empuje sólo mira lo CARGADO ⇒ soltar ⛔ sacaría nada).
 * ⚠️ Esa carga queda: si después se carga una lista MÁS ALTA que ella, el producto vuelve a quedar en oferta.
 */

/** El prefijo del motivo de la carga: el motor lo lee (`MOTIVO_CAMPANIA` de `lib/tn/precio.mjs` del motor) ⇒ ⛔ cambiarlo solo acá. */
export const MOTIVO_CAMPANIA = 'campaña:'

/** El motivo de la carga: el id de la campaña primero (es lo que el motor lee) y el nombre para quien mire el historial. */
export const motivoDeCampania = (id, nombre) => `${MOTIVO_CAMPANIA}${id}${nombre ? ` ${nombre}` : ''}`.slice(0, 200)

/** El trabajo de la cola del motor que empuja el precio a TN, y su tienda. */
export const TRABAJO_PRECIO = 'precio-tn'
export const TIENDA_ERP = 'stunned'

/** ¿Este producto va por el ERP? Su línea (`lineaDelProducto`) es Stunned. */
export const vaPorErp = (linea) => linea === TIENDA_ERP

const pesos = (x) => (x == null || x === '' || !(Number(x) > 0) ? null : Math.round(Number(x) * 100) / 100)

/**
 * Qué se carga en la lista `oferta` y qué promocional tiene que mostrar TN después.
 * @param {{ modo: 'poner'|'sacar', destino?: 'lista'|'previa', precioSale?: number|null, promoPrevia?: number|null, listaErp?: number|null }} p
 *   `listaErp` = el precio `online` vigente del ERP (lo que el empuje compara)
 * @returns {{ valor: number, quiere: number|null } | { error: string }}
 */
export function cargaDeCampania({ modo, destino = 'lista', precioSale, promoPrevia, listaErp }) {
  const lista = pesos(listaErp)
  if (lista == null) return { error: 'no tiene precio de lista en el ERP' }
  let valor
  if (modo === 'poner') valor = pesos(precioSale)
  else valor = destino === 'previa' && pesos(promoPrevia) != null ? pesos(promoPrevia) : lista
  if (valor == null) return { error: 'no tiene precio de sale' }
  // Igual que `promoDeseada` del motor: una oferta igual o mayor que la lista = SIN promocional.
  return { valor, quiere: valor < lista ? valor : null }
}

/**
 * Lo que dice la cola del motor de cada producto pedido. Un evento cuenta sólo si se TOMÓ después del pedido (antes, leyó
 * las cargas viejas).
 * @param {Array<{ pid: string, pedidoEn: string, quiere: number|null }>} pedidos
 * @param {Array<{ id: number, estado: string, tomado_en: string|null, error: string|null, resultado: object|null }>} eventos
 * @returns {Array<{ pid: string, estado: 'quedo'|'esperando'|'fallo', tn?: Array<number|null>, error?: string }>}
 */
export function estadoDePedidos(pedidos, eventos) {
  const orden = [...(eventos || [])].sort((a, b) => b.id - a.id)
  return pedidos.map((p) => {
    const desde = Date.parse(p.pedidoEn)
    const despues = orden.filter((e) => e.tomado_en && Date.parse(e.tomado_en) >= desde)
    for (const e of despues) {
      if (e.estado !== 'hecho') continue
      const c = e.resultado?.campanias?.[p.pid]
      if (!c) continue
      const tn = Array.isArray(c.tn) ? c.tn : []
      if (c.ok && c.quiere === p.quiere && tn.length === 1 && tn[0] === p.quiere) return { pid: p.pid, estado: 'quedo', tn }
      // El último que lo miró dice otra cosa: puede ser una vuelta a medias (`quedan`), se sigue esperando.
      return { pid: p.pid, estado: 'esperando', tn }
    }
    // Sin uno hecho que lo mire: si el último después del pedido FALLÓ (el freno, TN caído), se dice.
    const fallado = despues.find((e) => e.estado === 'fallado')
    // Uno pendiente todavía ⛔ tiene `tomado_en`: se mira en toda la cola (un fallo con reintento sigue `pendiente`).
    if (fallado && !orden.some((e) => e.estado === 'pendiente' || e.estado === 'corriendo')) {
      return { pid: p.pid, estado: 'fallo', error: String(fallado.error || 'el envío a Tienda Nube falló') }
    }
    return { pid: p.pid, estado: 'esperando' }
  })
}

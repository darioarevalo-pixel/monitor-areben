/**
 * Motor del sync de ventas Tienda Nube → Gestión Nube. Puro: no hace fetch, no toca React y no
 * mira el reloj. El caller le pasa las órdenes de TN, las ventas de GN del mismo rango, el mapeo
 * validado y el ledger; devuelve QUÉ ventas crearía y QUÉ queda afuera y por qué.
 *
 * La regla que ordena todo: **GN no permite anular una venta por API**. Una venta que falta se
 * carga a mano en 30 segundos; una duplicada no se borra. Por eso cada chequeo, ante la duda,
 * manda la orden a la cola y no a `crear`.
 */

import type {
  Advertencia,
  ConfigSync,
  ItemCola,
  LedgerRow,
  LineaPlan,
  MotivoCola,
  OrdenTN,
  PlanSync,
  PlanVenta,
  VentaGN,
} from './tipos'
import type { SkuMapRow } from '../sku-map/tipos'

const norm = (s?: string | null) => String(s ?? '').toLowerCase().trim()

/** Buenos Aires es UTC-3 fijo (Argentina no tiene horario de verano desde 2009). */
const AR_OFFSET_MS = 3 * 3_600_000

/**
 * El día **en hora de Buenos Aires**.
 *
 * 🔴 No se puede recortar el ISO y listo: **Tienda Nube manda las fechas en UTC**
 * (`2026-08-11T23:50:14+0000`, verificado contra órdenes reales de Stunned), así que todo lo que
 * pasa después de las 21:00 de Argentina cae al día siguiente si se lo lee de los primeros 10
 * caracteres. Eso corría el corte un día y desalineaba el cruce contra las ventas de GN.
 *
 * Gestión Nube, en cambio, manda `date_sale` como fecha pelada (`2026-07-31`) y **ya está en hora
 * local**: a esa NO hay que restarle nada, o se va un día para atrás. Por eso el caso sin hora se
 * devuelve tal cual.
 */
export function diaDe(iso?: string | null): string {
  const s = String(iso ?? '').trim()
  if (!s) return ''
  if (!s.includes('T') && !s.includes(' ')) return s.slice(0, 10) // fecha pelada de GN: ya es local
  const ms = Date.parse(s)
  if (Number.isNaN(ms)) return s.slice(0, 10)
  return new Date(ms - AR_OFFSET_MS).toISOString().slice(0, 10)
}

/** Distancia en días entre dos YYYY-MM-DD. Devuelve Infinity si alguno no es una fecha. */
export function distanciaDias(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(ms)) return Infinity
  return Math.abs(ms) / 86_400_000
}

/**
 * La firma de lo que se compró: `producto:variante×cantidad`, ordenada. Es la clave con la que se
 * cruza una orden de TN contra una venta de GN, y por eso tiene que ser estable ante el orden de
 * los renglones. Los ids se comparan como texto porque GN los devuelve a veces number y a veces
 * string.
 */
export function firmaItems(
  items: Array<{ producto: string | number | null; variante: string | number | null; cantidad: number }>,
): string {
  return items
    .filter((i) => Number(i.cantidad) !== 0)
    .map((i) => `${String(i.producto ?? '')}:${String(i.variante ?? '')}×${Number(i.cantidad)}`)
    .sort()
    .join('|')
}

/** Índice del mapeo por SKU (sólo las filas VALIDADAS y con los dos ids de GN). */
export function indexarMapeo(mapa: SkuMapRow[]): Map<string, SkuMapRow> {
  const m = new Map<string, SkuMapRow>()
  for (const r of mapa) {
    if (!r.validado) continue
    if (!r.gn_product_id || !r.gn_variant_id) continue
    m.set(norm(r.sku), r)
  }
  return m
}

/**
 * Traduce los renglones de una orden de TN a renglones de GN. Devuelve también los SKU que no
 * están en el mapeo validado: si falta **uno solo**, la orden entera queda afuera — importar
 * media orden descuadra el stock de las dos puntas y es peor que no importarla.
 */
export function mapearLineas(
  orden: OrdenTN,
  indice: Map<string, SkuMapRow>,
): { lineas: LineaPlan[]; faltantes: string[]; cantidadInvalida: boolean } {
  const lineas: LineaPlan[] = []
  const faltantes: string[] = []
  let cantidadInvalida = false

  for (const p of orden.products || []) {
    const cant = Number(p.quantity)
    if (!Number.isInteger(cant) || cant <= 0) cantidadInvalida = true
    const sku = String(p.sku ?? '').trim()
    const hit = sku ? indice.get(norm(sku)) : undefined
    if (!hit) {
      faltantes.push(sku || `(sin SKU) ${p.name ?? p.variant_id ?? '?'}`)
      continue
    }
    lineas.push({
      sku: hit.sku,
      nombre: p.name ?? null,
      gn_product_id: String(hit.gn_product_id),
      gn_variant_id: String(hit.gn_variant_id),
      quantity: cant,
      unit_price: Number(p.price) || 0,
    })
  }

  return { lineas, faltantes, cantidadInvalida }
}

/**
 * ¿Esta orden ya está cargada A MANO en GN? Es una heurística: misma firma de ítems y misma fecha
 * (± tolerancia). Sólo mira ventas vivas y **sin** `tn_order` — las que lo traen las agarra antes
 * el chequeo duro `ya_en_gn`.
 */
export function duplicadoManual(plan: PlanVenta, ventasGn: VentaGN[], toleranciaDias: number): VentaGN | null {
  const firma = firmaItems(plan.lineas.map((l) => ({ producto: l.gn_product_id, variante: l.gn_variant_id, cantidad: l.quantity })))
  if (!firma) return null
  for (const v of ventasGn) {
    if (v.tn_order) continue
    if (v.active === false || v.archived === true) continue
    const dia = diaDe(v.date_sale)
    if (!dia || distanciaDias(dia, plan.dia) > toleranciaDias) continue
    const f = firmaItems((v.detalles || []).map((d) => ({ producto: d.product_id, variante: d.size_id, cantidad: d.quantity })))
    if (f && f === firma) return v
  }
  return null
}

/**
 * El descuento de la venta, deducido: precios de lista menos lo que la persona pagó por los
 * productos. Se deduce en vez de copiar `discount` de TN porque en una orden conviven cupón,
 * promoción y el % por medio de pago, y cuál de esos campos ya está adentro del `total` no está
 * verificado. Si TN no manda total, devuelve 0 (no inventa un descuento).
 */
export function descuentoDe(orden: OrdenTN, lineas: LineaPlan[]): number {
  if (orden.total == null) return 0
  const lista = lineas.reduce((s, l) => s + l.unit_price * l.quantity, 0)
  const pagado = Number(orden.total) - (Number(orden.envio_costo_cliente) || 0)
  if (!Number.isFinite(pagado)) return 0
  return Math.max(0, Math.round(lista - pagado))
}

function estadoLedger(l?: LedgerRow) {
  return (l && l.detalle && l.detalle.estado) || (l ? 'ok' : null)
}

/**
 * El plan de importación. Los motivos son EXCLUYENTES y se evalúan en este orden — el orden
 * importa y está testeado: lo más barato y lo más definitivo primero, para que una orden
 * cancelada nunca se reporte como "le falta el mapeo".
 */
export function planificar(e: {
  ordenes: OrdenTN[]
  ventasGn: VentaGN[]
  mapa: SkuMapRow[]
  procesados: LedgerRow[]
  cfg: ConfigSync
}): PlanSync {
  const indice = indexarMapeo(e.mapa)
  const ledger = new Map<string, LedgerRow>()
  for (const l of e.procesados) {
    if (l.tipo && l.tipo !== 'venta') continue
    ledger.set(String(l.ref_id), l)
  }
  // Qué números de orden de TN ya están en GN. Dos fuentes:
  //   - `integration_id` de una venta que creó ESTE sync: es exacta, es nuestra.
  //   - `tn_order`, que llena la integración NATIVA de TN en GN. ⚠️ Hoy esa integración está atada
  //     a la tienda de ZATTIA, no a la de Stunned, así que sus números son de otra numeración
  //     (Zattia va por 6.700, Stunned por 112). Se deja igual porque es el cinturón para el día en
  //     que GN se conecte de verdad a la tienda de Stunned —ahí sería el dato bueno— y porque
  //     equivocarse acá deja una venta sin importar, no una duplicada. La colisión pide que las dos
  //     numeraciones se crucen el mismo día: lejos, pero no imposible para siempre.
  const enGn = new Set(
    e.ventasGn
      .filter((v) => v.active !== false && v.archived !== true)
      .flatMap((v) => [
        v.integration_source === 'monitor-sync-tn' ? String(v.integration_id ?? '') : '',
        String(v.tn_order ?? ''),
      ])
      .filter(Boolean),
  )

  const crear: PlanVenta[] = []
  const cola: ItemCola[] = []
  const porMotivo: Partial<Record<MotivoCola, number>> = {}

  const aCola = (o: OrdenTN, motivo: MotivoCola, detalle: string | null) => {
    porMotivo[motivo] = (porMotivo[motivo] || 0) + 1
    cola.push({ numero: String(o.number), dia: diaDe(o.fecha), fecha: o.fecha ?? null, cliente: o.cliente ?? null, motivo, detalle })
  }

  for (const o of e.ordenes) {
    const numero = String(o.number)
    const dia = diaDe(o.fecha)

    // Sin fecha de corte no se propone nada: es la posición segura mientras no esté acordado
    // desde cuándo el sync se hace cargo y quien carga a mano deja de hacerlo.
    if (!e.cfg.corte) {
      aCola(o, 'anterior_al_corte', 'Falta definir la fecha de corte del sync.')
      continue
    }
    if (dia < e.cfg.corte) {
      aCola(o, 'anterior_al_corte', `Anterior al ${e.cfg.corte}: ya se cargó a mano.`)
      continue
    }

    const l = ledger.get(numero)
    const est = estadoLedger(l)
    if (est === 'ok') {
      aCola(o, 'ya_importada', `Importada el ${diaDe(l?.procesado_at) || '—'}.`)
      continue
    }
    if (est === 'dudoso' || est === 'enviando') {
      aCola(o, 'en_revision', 'Quedó a medio camino: hay que mirar en GN si la venta existe antes de reintentar.')
      continue
    }

    if (enGn.has(numero)) {
      aCola(o, 'ya_en_gn', 'Gestión Nube ya tiene una venta con este número de orden.')
      continue
    }
    if (o.cancelada || o.estado_orden === 'cancelled') {
      aCola(o, 'cancelada', 'Cancelada en Tienda Nube. GN no anula por API: si ya está cargada, se anula a mano.')
      continue
    }
    if (e.cfg.soloPagas && o.estado_pago !== 'paid') {
      aCola(o, 'no_paga', `Estado de pago: ${o.estado_pago ?? '—'}.`)
      continue
    }

    const { lineas, faltantes, cantidadInvalida } = mapearLineas(o, indice)
    if (faltantes.length) {
      aCola(o, 'sku_sin_mapeo', `Sin mapeo validado: ${faltantes.join(', ')}`)
      continue
    }
    if (cantidadInvalida || !lineas.length) {
      aCola(o, 'cantidad_invalida', 'Hay un renglón con cantidad 0 o negativa: Gestión Nube lo rechaza.')
      continue
    }

    const plan: PlanVenta = {
      orden_id: String(o.id),
      numero,
      dia,
      fecha: o.fecha ?? null,
      cliente: o.cliente ?? null,
      total_tn: o.total == null ? null : Number(o.total),
      estado_pago: o.estado_pago ?? null,
      pago: o.pago_metodo || o.pago_gateway || null,
      lineas,
      unidades: lineas.reduce((s, x) => s + x.quantity, 0),
      descuento: descuentoDe(o, lineas),
      advertencias: [],
    }

    // El duplicado manual NO bloquea: es una heurística, y una heurística que frena termina
    // escondiendo ventas buenas. Avisa, y la pantalla pide una confirmación extra.
    const dup = duplicadoManual(plan, e.ventasGn, e.cfg.toleranciaDias)
    if (dup) {
      const adv: Advertencia = {
        tipo: 'duplicado_manual',
        gn_venta_id: String(dup.id),
        gn_number: dup.number ?? null,
        date_sale: dup.date_sale ?? null,
        canal: dup.channel ?? null,
      }
      plan.advertencias.push(adv)
    }

    crear.push(plan)
  }

  return {
    crear,
    cola,
    resumen: {
      ordenes: e.ordenes.length,
      a_crear: crear.length,
      unidades: crear.reduce((s, p) => s + p.unidades, 0),
      con_advertencia: crear.filter((p) => p.advertencias.length).length,
      por_motivo: porMotivo,
    },
  }
}

/** Texto corto para la pantalla. Un motivo sin texto es un motivo que nadie entiende. */
export const TEXTO_MOTIVO: Record<MotivoCola, string> = {
  anterior_al_corte: 'Anterior al corte',
  ya_importada: 'Ya importada',
  en_revision: 'A revisar en GN',
  ya_en_gn: 'Ya está en GN',
  cancelada: 'Cancelada en TN',
  no_paga: 'Sin pagar',
  sku_sin_mapeo: 'Falta mapeo de SKU',
  cantidad_invalida: 'Cantidad inválida',
}

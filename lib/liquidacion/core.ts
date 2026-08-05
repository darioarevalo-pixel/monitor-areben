/**
 * Liquidación — la lógica pura: armar un ítem, decidirle el precio, resumir la campaña y avisar.
 *
 * ⛔ **Acá no se reimplementa una sola fórmula de plata.** El markup, el margen y el redondeo a 90
 * salen de `lib/comisiones/core.ts`, que tiene paridad byte-fiel con el legacy
 * (`tests/comisiones-core.test.ts`). Copiar la matemática en dos lugares es exactamente cómo se
 * termina con dos márgenes distintos para el mismo producto y una discusión sobre cuál está bien.
 */

import { armarItemSale, redondear90 } from '@/lib/comisiones/core'
import { LIFESPAN_SIN_DATO, type Producto } from '@/lib/etl/tipos'
import type { Aviso, ConteoCampania, DecisionItem, LiquidacionItem } from './tipos'

/** Id de campaña. Se genera en el cliente, como en `disenos` y el calendario. */
export function nuevoIdLiquidacion(): string {
  return `l${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const DECISION_VACIA = (): DecisionItem => ({
  precioSale: null,
  pctDesc: null,
  markup: null,
  margen: null,
  nota: null,
  porQuien: null,
  cuando: null,
})

const APLICACION_VACIA = () => ({ aplicadoEn: null, variantesEscritas: null, categoriaSaleAgregada: false })

/**
 * La foto del producto en este momento. Se congela al mandarlo desde Análisis y no se vuelve a
 * tocar: ver el docblock de `FotoDelMomento`.
 *
 * `tn` es lo que sepamos de Tienda Nube — la primera imagen y el precio promocional que ya esté
 * cargado. Las dos cosas son opcionales porque el índice de TN puede no haber bajado todavía, y una
 * campaña no se puede frenar porque falte una foto.
 */
export function armarItemDesdeProducto(
  prod: Producto,
  tn?: { imagen?: string | null; promo?: number | null },
): LiquidacionItem {
  return {
    pid: prod.id,
    estado: 'pendiente',
    foto: {
      nombre: prod.name,
      sku: prod.sku || null,
      costo: prod.unit_cost || 0,
      sinCosto: !!prod.sinCosto,
      precioNormal: prod.retailer_price || 0,
      // Un promo de 0 en TN es "no hay promo", no "sale gratis": el campo viene en 0 cuando está
      // vacío, y guardarlo tal cual haría que el aviso de "ya está más barato" saltara siempre.
      promoPrevia: tn?.promo && tn.promo > 0 ? tn.promo : null,
      stock: prod.stock || 0,
      ventas7: prod.sales7 || 0,
      ventas30: prod.sales30 || 0,
      ventas90: prod.sales90 || 0,
      vidaUtil: prod.lifespan === LIFESPAN_SIN_DATO ? null : prod.lifespan,
      ultimaVenta: prod.lastSale || null,
      diasSinVender: prod.daysSinceLast ?? 0,
      imagen: tn?.imagen || null,
    },
    decision: DECISION_VACIA(),
    aplicacion: APLICACION_VACIA(),
  }
}

/**
 * Ponerle precio de sale a un ítem. Devuelve uno nuevo: no muta.
 *
 * Se puede entrar por el precio o por el porcentaje, porque las dos son formas reales de pensarlo
 * ("30% off en toda la línea" y "este lo quiero a 34.900"), y la diferencia entre las dos importa:
 *
 *  - **Por porcentaje**, el resultado se redondea a terminar en 90. Es un precio que salió de una
 *    cuenta y nadie eligió, así que sale con la forma que tienen todos los precios de la casa.
 *  - **Por precio**, se respeta tal cual. Alguien lo tipeó mirando el margen; redondearlo por
 *    nuestra cuenta le movería el número que acaba de decidir.
 *
 * `pctDesc` se guarda siempre **derivado del precio final** (lo calcula `armarItemSale`), no del
 * que se tipeó: con el redondeo a 90, un 30% pedido puede terminar siendo 30,2% real, y la grilla
 * tiene que mostrar el descuento que va a ver el cliente.
 */
export function decidirItem(
  item: LiquidacionItem,
  entrada: { precioSale: number } | { pctDesc: number },
  quien?: string | null,
): LiquidacionItem {
  const { costo, precioNormal, nombre, sku } = item.foto
  const precio = precioDeSale(precioNormal, entrada)

  const calc = armarItemSale({ id: item.pid, name: nombre, sku }, precio, costo, precioNormal)

  return {
    ...item,
    estado: 'definido',
    decision: {
      ...item.decision,
      precioSale: calc.sale,
      pctDesc: calc.desc,
      markup: calc.markup,
      margen: calc.margin,
      porQuien: quien ?? item.decision.porQuien,
      cuando: Date.now(),
    },
  }
}

/**
 * El precio que sale de lo que se tipeó. **Una sola regla, un solo lugar**: la usa `decidirItem`
 * para guardar y el modal para mostrar el precio mientras se escribe. Si el modal la calculara por
 * su cuenta, lo que se ve antes de guardar y lo que queda guardado podrían no ser el mismo número.
 */
export function precioDeSale(precioNormal: number, entrada: { precioSale: number } | { pctDesc: number }): number {
  return 'precioSale' in entrada
    ? Math.round(entrada.precioSale)
    : redondear90(precioNormal * (1 - entrada.pctDesc / 100))
}

/**
 * La nota de quien miró el producto. Va aparte de `decidirItem` porque **no es parte de la
 * decisión de precio**: se escribe también en uno que se descarta ("no va, está fuera de
 * temporada") y sobrevive a despejarle el precio.
 */
export function anotarItem(item: LiquidacionItem, nota: string | null): LiquidacionItem {
  const t = (nota || '').trim()
  return { ...item, decision: { ...item.decision, nota: t || null } }
}

/** Sacarle la decisión a un ítem y devolverlo a la pila. La nota **se conserva**: es de la persona. */
export function despejarItem(item: LiquidacionItem): LiquidacionItem {
  return {
    ...item,
    estado: 'pendiente',
    decision: { ...DECISION_VACIA(), nota: item.decision.nota },
  }
}

export function contar(items: LiquidacionItem[]): ConteoCampania {
  return {
    total: items.length,
    pendientes: items.filter((i) => i.estado === 'pendiente').length,
    definidos: items.filter((i) => i.estado === 'definido').length,
    descartados: items.filter((i) => i.estado === 'descartado').length,
    aplicados: items.filter((i) => i.estado === 'aplicado').length,
  }
}

export interface ResumenCampania extends ConteoCampania {
  /** Costo del stock que la campaña se propone mover. Los descartados no cuentan. */
  plataInmovilizada: number
  /** Lo que se deja de facturar contra el precio de lista, si se vendiera todo el stock definido. */
  resigna: number
  /** Descuento promedio de lo definido, **ponderado por stock**. `null` si no hay nada definido. */
  descPromedio: number | null
  /** Cuántos ítems tienen algún aviso de nivel alto sin resolver. */
  conProblema: number
}

/**
 * El estado de la campaña en números.
 *
 * El descuento promedio va **ponderado por stock** y no por producto: 40% en un producto con tres
 * unidades y 10% en uno con doscientas no es "25% de descuento", y esa lectura decide si la campaña
 * mueve la aguja o no.
 */
export function resumenCampania(items: LiquidacionItem[]): ResumenCampania {
  const vivos = items.filter((i) => i.estado !== 'descartado')
  const definidos = items.filter((i) => (i.estado === 'definido' || i.estado === 'aplicado') && i.decision.precioSale)

  let unidades = 0
  let sumaDesc = 0
  let resigna = 0
  for (const i of definidos) {
    const st = i.foto.stock || 0
    unidades += st
    sumaDesc += (i.decision.pctDesc || 0) * st
    resigna += Math.max(0, i.foto.precioNormal - (i.decision.precioSale || 0)) * st
  }

  return {
    ...contar(items),
    plataInmovilizada: vivos.reduce((a, i) => a + i.foto.costo * i.foto.stock, 0),
    resigna,
    descPromedio: unidades > 0 ? sumaDesc / unidades : null,
    conProblema: items.filter((i) => i.estado !== 'descartado' && avisos(i).some((a) => a.nivel === 'alto')).length,
  }
}

/** Los que están listos para escribirle el precio a Gestión Nube (tanda 3). */
export function itemsAplicables(items: LiquidacionItem[]): LiquidacionItem[] {
  return items.filter((i) => i.estado === 'definido' && (i.decision.precioSale || 0) > 0)
}

/**
 * Lo que hay que mirar antes de definirle un precio a este producto.
 *
 * El primero es el que motivó la lista: **un costo que no vino de Gestión Nube no es un costo
 * cero**. El simulador de Comisiones hoy no lo chequea, y en julio de 2026, 428 productos de BDI
 * quedaron costando cero en silencio — con ese costo, cualquier precio parece tener 100% de margen
 * y la liquidación regala mercadería sin que nada avise.
 */
export function avisos(item: LiquidacionItem): Aviso[] {
  const out: Aviso[] = []
  const { costo, sinCosto, stock, precioNormal, promoPrevia } = item.foto
  const sale = item.decision.precioSale

  if (sinCosto) {
    out.push({ nivel: 'alto', texto: 'El costo no vino de Gestión Nube: no es que cueste $0, es que no lo sabemos. Cualquier margen que muestre esta pantalla es falso.' })
  } else if (!(costo > 0)) {
    out.push({ nivel: 'alto', texto: 'Este producto tiene costo $0 cargado en Gestión Nube.' })
  }

  if (!(precioNormal > 0)) {
    out.push({ nivel: 'alto', texto: 'No tiene precio de lista: no hay contra qué calcular el descuento.' })
  }

  if (sale != null && sale > 0) {
    if (!sinCosto && costo > 0 && sale <= costo) {
      out.push({ nivel: 'alto', texto: 'El precio de sale está por debajo del costo: cada unidad que se venda pierde plata.' })
    }
    if (precioNormal > 0 && sale >= precioNormal) {
      out.push({ nivel: 'alto', texto: 'El precio de sale no es menor que el de lista.' })
    }
    if (promoPrevia != null && sale >= promoPrevia) {
      out.push({ nivel: 'medio', texto: `Hoy ya está en oferta a $${Math.round(promoPrevia).toLocaleString('es-AR')}: este precio no lo baja.` })
    }
  }

  if (!(stock > 0)) {
    out.push({ nivel: 'medio', texto: 'No queda stock: liquidarlo no mueve nada.' })
  }

  return out
}

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
import { TIPO_CAMPANIA, type Aviso, type ConteoCampania, type DecisionItem, type EstadoItem, type LiquidacionItem, type RevisionItem, type TipoCampania } from './tipos'

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

const REVISION_VACIA = (): RevisionItem => ({ porQuien: null, cuando: null, objecion: null, precioAnterior: null })

/** La revisión de un ítem, tolerando los que se guardaron antes de que existiera. */
export const revisionDe = (item: LiquidacionItem): RevisionItem => item.revision ?? REVISION_VACIA()

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
    revision: REVISION_VACIA(),
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
    // 🔑 **Un precio nuevo borra la revisión, en los dos sentidos.** Si estaba objetado, la
    // objeción era contra el número viejo y dejarla pegada al nuevo acusa de algo que ya no está;
    // si estaba confirmado, alguien confirmó otro precio y seguir mostrándolo como revisado sería
    // exactamente la mentira que la pestaña Revisión existe para evitar. Vuelve a la cola.
    revision: REVISION_VACIA(),
  }
}

/**
 * La segunda mirada, con o sin cambio de precio.
 *
 * El revisor puede tocar el número y confirmar en un solo paso (decisión de Bruno: el ida y vuelta
 * por un precio que está diez pesos corrido no paga). Cuando lo toca, se guarda **contra qué lo
 * cambió**: `decidirItem` ya reescribió `decision.porQuien` con el nombre del revisor, así que sin
 * `precioAnterior` el que lo había puesto no tiene forma de ver qué le movieron.
 */
export function confirmarItem(
  item: LiquidacionItem,
  quien: string | null,
  precio?: { precioSale: number } | { pctDesc: number },
): LiquidacionItem {
  const antes = item.decision.precioSale
  const base = precio ? decidirItem(item, precio, quien) : item
  const cambio = precio != null && base.decision.precioSale !== antes
  return {
    ...base,
    estado: 'confirmado',
    revision: { porQuien: quien, cuando: Date.now(), objecion: null, precioAnterior: cambio ? antes : null },
  }
}

/**
 * Objetar: el ítem **vuelve a `definido`** con el motivo escrito, no a `pendiente`.
 *
 * El precio se conserva a propósito. Objetar no es borrar: quien lo puso tiene que poder ver qué
 * número se cuestionó, y volverlo a `pendiente` le haría empezar de cero sobre un producto que ya
 * había mirado.
 */
export function objetarItem(item: LiquidacionItem, quien: string | null, motivo: string): LiquidacionItem {
  const m = (motivo || '').trim()
  if (!m) throw new Error('Objetar pide un motivo.')
  return {
    ...item,
    estado: 'definido',
    revision: { porQuien: quien, cuando: Date.now(), objecion: m, precioAnterior: null },
  }
}

/** Los que tienen precio y todavía nadie miró (incluye los objetados: siguen sin resolverse). */
export function faltanRevisar(items: LiquidacionItem[]): LiquidacionItem[] {
  return items.filter((i) => i.estado === 'definido')
}

/** Los que un revisor devolvió con motivo. Son los que le vuelven a la pila al que puso el precio. */
export function objetados(items: LiquidacionItem[]): LiquidacionItem[] {
  return items.filter((i) => i.estado === 'definido' && !!revisionDe(i).objecion)
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
    // Sin precio no hay nada que revisar: la revisión se va con él, igual que en `decidirItem`.
    revision: REVISION_VACIA(),
  }
}

export function contar(items: LiquidacionItem[]): ConteoCampania {
  return {
    total: items.length,
    pendientes: items.filter((i) => i.estado === 'pendiente').length,
    definidos: items.filter((i) => i.estado === 'definido').length,
    confirmados: items.filter((i) => i.estado === 'confirmado').length,
    descartados: items.filter((i) => i.estado === 'descartado').length,
    aplicados: items.filter((i) => i.estado === 'aplicado').length,
  }
}

export interface ResumenCampania extends ConteoCampania {
  /** Costo del stock que la campaña se propone mover. Los descartados no cuentan. */
  plataInmovilizada: number
  /**
   * Lo que se deja de facturar contra el precio de lista, si se vendiera todo el stock definido.
   *
   * 🔑 **Una suba RESTA acá, no cuenta cero.** El `Math.max(0, …)` que había escondía los productos
   * que quedaron arriba del precio de lista: en una liquidación eso es un error que el resumen
   * tapaba, y en un ajuste de precio —que puede subir a propósito— el número directamente no
   * cerraba. Medido antes de sacarlo: **cero ítems en las dos marcas** quedan hoy arriba de lista,
   * o sea que ninguna campaña existente cambia de número.
   */
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
export function resumenCampania(items: LiquidacionItem[], tipo: TipoCampania = 'liquidacion'): ResumenCampania {
  const vivos = items.filter((i) => i.estado !== 'descartado')
  // `confirmado` cuenta como definido para las plata: es el mismo precio, mirado por otra persona.
  const definidos = items.filter(
    (i) => (i.estado === 'definido' || i.estado === 'confirmado' || i.estado === 'aplicado') && i.decision.precioSale,
  )

  let unidades = 0
  let sumaDesc = 0
  let resigna = 0
  for (const i of definidos) {
    const st = i.foto.stock || 0
    unidades += st
    sumaDesc += (i.decision.pctDesc || 0) * st
    resigna += (i.foto.precioNormal - (i.decision.precioSale || 0)) * st
  }

  return {
    ...contar(items),
    plataInmovilizada: vivos.reduce((a, i) => a + i.foto.costo * i.foto.stock, 0),
    resigna,
    descPromedio: unidades > 0 ? sumaDesc / unidades : null,
    conProblema: items.filter((i) => i.estado !== 'descartado' && avisos(i, tipo).some((a) => a.nivel === 'alto')).length,
  }
}

/**
 * Los que están listos para escribirle el precio a Gestión Nube (tanda 3).
 *
 * 🔑 **Pide `confirmado`, no `definido`.** Desde que existe la revisión, un precio sin segunda
 * mirada no está listo para cargarse: si acá entrara un `definido`, la pestaña Revisión sería un
 * cartel y no una puerta.
 */
export function itemsAplicables(items: LiquidacionItem[]): LiquidacionItem[] {
  return items.filter((i) => i.estado === 'confirmado' && (i.decision.precioSale || 0) > 0)
}

/**
 * Cuántos productos escribe Gestión Nube por request, espejo del que hace cumplir el handler.
 *
 * 🔑 **El número lo fija el tope de GN, no el gusto.** Son 2 consultas por segundo y 60 por minuto
 * (compartidas con los otros sistemas de la casa), así que el handler espera 1200 ms entre producto
 * y producto: cinco son ~7 segundos, que es lo que entra cómodo en el tiempo de una función. Una
 * campaña de 260 son ~52 viajes y unos 6 minutos — por eso el bucle vive en el cliente, con
 * progreso, y no en el handler.
 */
export const TOPE_APLICAR = 5

/** Cuántos ítems entran en un guardado masivo. Espejo del handler; no toca Gestión Nube. */
export const TOPE_MASIVO = 50

/**
 * Rebajar (o subir) de una vez el precio de varios productos, con un % sobre el precio de lista.
 *
 * 🔑 **Sobre el precio de LISTA, no sobre el sale vigente.** Encadenar descuentos sobre lo ya
 * descontado da números que nadie puede reconstruir: "20% al cerrar" tiene que significar lo mismo
 * mire quien mire, y un producto que hoy está al 50% no debería terminar más barato que uno que
 * está al 30% sólo porque se descontó dos veces.
 *
 * 🔑 **Usa `decidirItem`, no una cuenta nueva**: así el redondeo a 90, el markup y el margen salen
 * de donde siempre. Los ítems vuelven a `definido` —los deja `decidirItem`— porque un precio nuevo
 * es un precio que nadie miró todavía.
 */
export function reprecificar(
  items: LiquidacionItem[],
  pctDesc: number,
  quien: string | null,
): LiquidacionItem[] {
  return items
    .filter((i) => i.estado !== 'descartado' && i.foto.precioNormal > 0)
    .map((i) => decidirItem(i, { pctDesc }, quien))
}

/**
 * Qué pids faltan escribir (o borrar) en Gestión Nube.
 *
 * 🔑 **`aplicado` significa "su precio está puesto en GN ahora"**, no "alguna vez se aplicó". Por eso
 * poner y sacar son la misma lista leída al revés, y por eso sacar la oferta devuelve el ítem a
 * `confirmado`: si quedara en `aplicado`, la pantalla diría que hay un precio puesto que ya no está.
 *
 * 🔑 **Es lo que hace la reanudación gratis.** Cortar a la mitad y volver a apretar no reescribe lo
 * hecho: los que ya se aplicaron salieron de la lista solos.
 */
export function pidsPorAplicar(items: LiquidacionItem[], modo: 'poner' | 'sacar'): string[] {
  const listos = modo === 'poner' ? itemsAplicables(items) : items.filter((i) => i.estado === 'aplicado')
  return listos.map((i) => i.pid)
}

/**
 * El tope de un "Mandar a liquidación", espejo del que hace cumplir `api/_liquidacion.js`.
 *
 * Vive acá además de allá para poder avisar **antes** de mandar: sin esto, marcar de una tanda
 * trescientos productos filtrados termina en un 400 después de armar las trescientas fotos, y lo
 * que se ve es un error rojo en vez de un número.
 */
export const TOPE_SUMAR = 200

/**
 * De estos productos, los que **todavía no están** en la campaña.
 *
 * 🔑 Un producto descartado cuenta como presente. Ya se lo miró y se dijo que no: volver a
 * ofrecerlo es pedir la misma decisión de nuevo, y es exactamente lo que el estado `descartado`
 * existe para evitar (ver el docblock de `EstadoItem`).
 */
export function faltantes<T extends { id: string }>(productos: T[], yaEstan: Record<string, EstadoItem>): T[] {
  return productos.filter((p) => !yaEstan[p.id])
}

/**
 * Lo que hay que mirar antes de definirle un precio a este producto.
 *
 * El primero es el que motivó la lista: **un costo que no vino de Gestión Nube no es un costo
 * cero**. El simulador de Comisiones hoy no lo chequea, y en julio de 2026, 428 productos de BDI
 * quedaron costando cero en silencio — con ese costo, cualquier precio parece tener 100% de margen
 * y la liquidación regala mercadería sin que nada avise.
 *
 * 🔑 **El tipo de campaña apaga los avisos que no aplican, por CLAVE** (`TIPO_CAMPANIA[t].apaga`).
 * En un ajuste de precio, «no es un descuento» y «ya está en oferta» no advierten nada: describen
 * lo que se vino a hacer, y un aviso que siempre suena deja de leerse.
 *
 * ⚠️ **El default es `liquidacion` a propósito**: es el tipo que no apaga ninguno, así que un
 * llamador que se olvide de pasar el tipo avisa de más, nunca de menos.
 */
export function avisos(item: LiquidacionItem, tipo: TipoCampania = 'liquidacion'): Aviso[] {
  const out: Aviso[] = []
  const { costo, sinCosto, stock, precioNormal, promoPrevia } = item.foto
  const sale = item.decision.precioSale

  if (sinCosto) {
    out.push({ clave: 'sin-costo', nivel: 'alto', texto: 'El costo no vino de Gestión Nube: no es que cueste $0, es que no lo sabemos. Cualquier margen que muestre esta pantalla es falso.' })
  } else if (!(costo > 0)) {
    out.push({ clave: 'costo-cero', nivel: 'alto', texto: 'Este producto tiene costo $0 cargado en Gestión Nube.' })
  }

  if (!(precioNormal > 0)) {
    out.push({ clave: 'sin-lista', nivel: 'alto', texto: 'No tiene precio de lista: no hay contra qué calcular el descuento.' })
  }

  if (sale != null && sale > 0) {
    if (!sinCosto && costo > 0 && sale <= costo) {
      out.push({ clave: 'bajo-costo', nivel: 'alto', texto: 'El precio de sale está por debajo del costo: cada unidad que se venda pierde plata.' })
    }
    if (precioNormal > 0 && sale >= precioNormal) {
      out.push({ clave: 'no-es-descuento', nivel: 'alto', texto: 'El precio de sale no es menor que el de lista.' })
    }
    if (promoPrevia != null && sale >= promoPrevia) {
      out.push({ clave: 'ya-en-oferta', nivel: 'medio', texto: `Hoy ya está en oferta a $${Math.round(promoPrevia).toLocaleString('es-AR')}: este precio no lo baja.` })
    }
  }

  if (!(stock > 0)) {
    out.push({ clave: 'sin-stock', nivel: 'medio', texto: 'No queda stock: liquidarlo no mueve nada.' })
  }

  const apaga = TIPO_CAMPANIA[tipo].apaga
  return apaga.length ? out.filter((a) => !apaga.includes(a.clave)) : out
}

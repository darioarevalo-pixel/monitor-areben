/**
 * El piso de rentabilidad de la pauta: **hasta cuánto se puede pagar por una compra**.
 *
 * # Por qué esto existe y por qué el semáforo NO es el ROAS
 *
 * Sin un umbral, cada «rinde / no rinde» era una opinión. El umbral sale de la economía unitaria:
 * de lo que el cliente paga se van el IVA, el producto, Ingresos Brutos, el impuesto al cheque y
 * las comisiones; lo que queda —la **contribución**— es lo único con lo que se puede pagar pauta y
 * ganar plata. Repartirla decide el techo.
 *
 * 🔑 **El techo por compra casi no depende del mix de medios de pago (±0,7%), pero el ROAS sí
 * (±12%)**, porque el ROAS que reporta Meta usa lo que el cliente efectivamente pagó y la
 * transferencia paga menos. Como el mix es un dato que no tenemos, el semáforo es el **costo por
 * compra**: es el único de los dos que no depende de un dato que falta. Corolario que ya confundió
 * una vez: **si crece la transferencia el ROAS de Ads Manager baja ~10% sin que la pauta empeore.**
 *
 * 🔴 **El break-even y el objetivo no son lo mismo.** Entre los dos se gana plata, sólo que menos
 * de lo decidido. Confundirlos hace apagar campañas que están dando ganancia.
 *
 * # De dónde salen los números
 *
 * Portado de `~/Projects/analista-meta/herramientas/roas-minimo-bdi.html` (13-ago-2026), la
 * calculadora con la que se definió el umbral de BDI. **Las fórmulas se movieron tal cual.** Este
 * archivo sólo calcula: quien dibuja es `components/meta-ads/rentabilidad/`.
 *
 * ⚠️ `DEFAULTS` es la economía real de las fundas de BDI y **la pantalla lo lee de acá**: no se
 * repiten los valores en el JSX. Un default que la pantalla no lee es un default que miente.
 */

/** Los supuestos que se pueden mover. Los porcentajes van **en porcentaje** (12,5 = 12,5%). */
export type Supuestos = {
  /** PVP de lista por unidad, antes de todo descuento. */
  precio: number
  /** Descuento del raspa, en %. */
  raspa: number
  /** Qué proporción de los compradores lo usa, en %. Pondera al raspa. */
  usaRaspa: number
  /** Descuento adicional por pagar con transferencia, en %. */
  transf: number
  /** 🔑 Si el raspa y la transferencia se aplican uno sobre el otro o el mayor manda. */
  acumulan: boolean
  /** Proporción de las ventas que se cobran por transferencia, en %. El dato que falta. */
  mix: number
  /** Costo del producto, **sin IVA**. */
  costo: number
  iva: number
  /** Ingresos Brutos. */
  iibb: number
  /** Impuesto al cheque. */
  cheque: number
  /** Comisión de Tienda Nube cobrando con tarjeta, en %. */
  tnTarjeta: number
  /** Comisión de la pasarela con cuotas, en %. */
  pasTarjeta: number
  /** Comisión de Tienda Nube cobrando por transferencia, en %. Está bonificada. */
  tnTransf: number
  /** Comisión de la pasarela por transferencia, en %. */
  pasTransf: number
  /** Unidades por pedido. Del por-unidad al por-compra, que es lo que Meta cobra. */
  unidades: number
  /** Qué parte de la contribución se le entrega a la pauta, en %. El resto es ganancia. */
  reparto: number
  /** El objetivo de ventas por día, para traducir el techo a presupuesto diario. */
  ventasDia: number
  /** Unidades a vender, para la proyección. */
  stock: number
  /** Lo que se está pagando hoy por compra. Es la referencia contra la que se mide el techo. */
  costoHoy: number
}

/**
 * La economía de las fundas de BDI al 13-ago-2026, medida con Bruno.
 *
 * ⚠️ **`pasTransf` es 1%, no 0.** La calculadora original quedó guardada con 0 en ese campo, pero
 * la economía anotada —y el techo de $9.100 que salió de ella— corresponden al 1%. Con 0 el techo
 * da $9.175. La diferencia es chica (0,8%) y no cambia ninguna decisión, pero el valor bueno es el
 * de la economía, no el que quedó tipeado.
 */
export const DEFAULTS: Supuestos = {
  precio: 14490, // promedio de $13.990 y $14.990
  raspa: 12.5,
  usaRaspa: 100,
  transf: 10,
  acumulan: true,
  mix: 50,
  costo: 1700,
  iva: 21,
  iibb: 4, // Santa Fe
  cheque: 1.2,
  tnTarjeta: 1,
  pasTarjeta: 8,
  tnTransf: 0, // bonificada
  pasTransf: 1,
  unidades: 2.6, // derivado del ticket real medido ($31.552)
  reparto: 50,
  ventasDia: 100,
  stock: 11000,
  costoHoy: 2472,
}

/** Lo que deja **una unidad** por un camino de cobro, con su desglose. */
export type Canal = {
  /** Lo que efectivamente paga el cliente. */
  bruto: number
  /** El bruto sin IVA. */
  neto: number
  iva: number
  producto: number
  iibb: number
  cheque: number
  /** Tienda Nube + pasarela. */
  comision: number
  /** Lo que queda para pauta y ganancia. */
  contrib: number
}

/** El techo y el ROAS en un extremo del mix. Sirve para mostrar cuánto lo mueve el dato que falta. */
export type Extremo = { costoMax: number; roas: number }

export type Rentabilidad = {
  /** Una unidad cobrada con tarjeta. */
  tarjeta: Canal
  /** Una unidad cobrada por transferencia. */
  transferencia: Canal
  /** Una unidad, ponderada por el mix. Es la cascada que se dibuja. */
  unidad: Canal
  /** Lo que factura una compra. Es el ticket contra el que Meta calcula el ROAS. */
  ticket: number
  /** Lo que deja una compra para pauta y ganancia. */
  contribPedido: number
  /** La proporción del ticket que sobrevive, en %. */
  margenPct: number
  /** El ROAS donde la pauta se come toda la ganancia. Debajo de acá se pierde plata. */
  roasBE: number
  /** 🔑 El semáforo: lo máximo que se puede pagar por una compra. */
  costoMax: number
  /** El ROAS que corresponde a ese techo. Es objetivo, no piso. */
  roasObj: number
  /** Cuántas veces entra el costo de hoy en el techo. Es el aire que hay para escalar. */
  aire: number
  /** El presupuesto diario que sostiene el objetivo de ventas al precio del techo. */
  diario: number
  compras: number
  dias: number
  factu: number
  extremos: {
    /** Todo tarjeta. */
    tarjeta: Extremo
    /** Todo transferencia. */
    transferencia: Extremo
    /** Cuánto separa a los dos extremos, en % del techo. Debajo de 5% el mix deja de importar. */
    spreadPct: number
  }
}

/** Un canal: precio bruto por unidad + sus comisiones → lo que queda. */
function canal(s: Supuestos, bruto: number, tn: number, pas: number): Canal {
  const neto = bruto / (1 + s.iva / 100)
  const comision = bruto * ((tn + pas) / 100)
  const iibb = bruto * (s.iibb / 100)
  const cheque = bruto * (s.cheque / 100)
  return {
    bruto,
    neto,
    iva: bruto - neto,
    producto: s.costo,
    iibb,
    cheque,
    comision,
    contrib: neto - s.costo - iibb - cheque - comision,
  }
}

export function calcularRentabilidad(s: Supuestos): Rentabilidad {
  // El raspa se pondera por cuánta gente lo usa: un 12,5% que usa la mitad pesa 6,25%.
  const desc = (s.raspa / 100) * (s.usaRaspa / 100)
  const conRaspa = s.precio * (1 - desc)
  const tarjeta = canal(s, conRaspa, s.tnTarjeta, s.pasTarjeta)
  const transferencia = canal(
    s,
    s.acumulan ? conRaspa * (1 - s.transf / 100) : s.precio * (1 - s.transf / 100),
    s.tnTransf,
    s.pasTransf,
  )

  const m = s.mix / 100
  const w = (a: number, b: number) => a * (1 - m) + b * m
  const unidad: Canal = {
    bruto: w(tarjeta.bruto, transferencia.bruto),
    neto: w(tarjeta.neto, transferencia.neto),
    iva: w(tarjeta.iva, transferencia.iva),
    producto: w(tarjeta.producto, transferencia.producto),
    iibb: w(tarjeta.iibb, transferencia.iibb),
    cheque: w(tarjeta.cheque, transferencia.cheque),
    comision: w(tarjeta.comision, transferencia.comision),
    contrib: w(tarjeta.contrib, transferencia.contrib),
  }

  // Del por-unidad al por-compra: Meta cobra por compra, no por unidad.
  const ticket = unidad.bruto * s.unidades
  const contribPedido = unidad.contrib * s.unidades
  const roasBE = contribPedido > 0 ? ticket / contribPedido : Infinity
  const costoMax = contribPedido * (s.reparto / 100)
  const roasObj = costoMax > 0 ? ticket / costoMax : Infinity

  const compras = s.unidades > 0 ? s.stock / s.unidades : 0
  const dias = s.ventasDia > 0 ? compras / s.ventasDia : 0

  // El techo en los dos extremos del mix. Si apenas se mueve, el mix deja de ser un dato que haga
  // falta averiguar para poder decidir — que es justamente lo que pasa.
  const extremo = (prop: number): Extremo => {
    const bruto = tarjeta.bruto * (1 - prop) + transferencia.bruto * prop
    const contrib = tarjeta.contrib * (1 - prop) + transferencia.contrib * prop
    const cm = contrib * s.unidades * (s.reparto / 100)
    return { costoMax: cm, roas: cm > 0 ? (bruto * s.unidades) / cm : Infinity }
  }
  const eT = extremo(0)
  const eX = extremo(1)

  return {
    tarjeta,
    transferencia,
    unidad,
    ticket,
    contribPedido,
    margenPct: ticket > 0 ? (contribPedido / ticket) * 100 : 0,
    roasBE,
    costoMax,
    roasObj,
    aire: s.costoHoy > 0 ? costoMax / s.costoHoy : Infinity,
    diario: costoMax * s.ventasDia,
    compras,
    dias,
    factu: compras * ticket,
    extremos: {
      tarjeta: eT,
      transferencia: eX,
      spreadPct: eT.costoMax > 0 ? (Math.abs(eX.costoMax - eT.costoMax) / eT.costoMax) * 100 : 0,
    },
  }
}

/** Un reparto posible de la contribución, con lo que implica. */
export type Escenario = {
  /** Qué parte de la contribución se le da a la pauta, en %. */
  reparto: number
  etiqueta: string
  /** Verde = queda ganancia de sobra; ámbar = al hueso; rojo = no queda nada. */
  tono: 'success' | 'warning' | 'danger' | 'neutral'
  costoMax: number
  roas: number
  diario: number
  /** El que está elegido con los supuestos de ahora. */
  elegido: boolean
}

/**
 * Los cuatro repartos que vale la pena comparar, incluyendo el elegido.
 *
 * El 100% es el break-even y se dibuja en rojo a propósito: **es el punto donde la pauta se lleva
 * toda la ganancia**, no un objetivo. Si el reparto elegido coincide con uno de los fijos, se
 * muestra una sola fila y no dos iguales.
 */
export function escenariosDeFreno(s: Supuestos, r: Rentabilidad): Escenario[] {
  const base: Array<[number, string, Escenario['tono']]> = [
    [100, 'todo — punto de equilibrio', 'danger'],
    [75, 'tres cuartos — al hueso', 'warning'],
    [s.reparto, `${Math.round(s.reparto)}% — el elegido`, 'neutral'],
    [33, 'un tercio — conservador', 'success'],
  ]
  return base
    .filter(([q], i, a) => a.findIndex(([y]) => Math.abs(y - q) < 0.001) === i)
    .sort((a, b) => b[0] - a[0])
    .map(([q, etiqueta, tono]) => {
      const costoMax = r.contribPedido * (q / 100)
      return {
        reparto: q,
        etiqueta,
        tono,
        costoMax,
        roas: costoMax > 0 ? r.ticket / costoMax : Infinity,
        diario: costoMax * s.ventasDia,
        elegido: Math.abs(q - s.reparto) < 0.001,
      }
    })
}

/** Qué deja vender todo el stock, pagando tanto por compra. */
export type Proyeccion = {
  etiqueta: string
  costoPorCompra: number
  pauta: number
  ganancia: number
  roas: number
}

/** El stock a tres precios de compra: el de hoy, la mitad del techo y el techo. */
export function proyeccionStock(s: Supuestos, r: Rentabilidad): Proyeccion[] {
  return [
    { etiqueta: 'el de hoy', costoPorCompra: s.costoHoy },
    { etiqueta: 'la mitad del techo', costoPorCompra: r.costoMax * 0.5 },
    { etiqueta: 'el techo', costoPorCompra: r.costoMax },
  ]
    .filter((p) => p.costoPorCompra > 0)
    .map((p) => {
      const pauta = r.compras * p.costoPorCompra
      return {
        ...p,
        pauta,
        ganancia: r.compras * r.contribPedido - pauta,
        roas: p.costoPorCompra > 0 ? r.ticket / p.costoPorCompra : Infinity,
      }
    })
}

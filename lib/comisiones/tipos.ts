/**
 * Tipos de Comisiones: margen neto real por forma de pago × canal, contemplando
 * comisiones, costo financiero, IIBB, DREI, Ganancias e IVA. La config es COMPARTIDA
 * (los admins la editan en el KV, todos la ven). Port del bloque index.html:5990-6568.
 */

/** Una celda de la matriz: los costos de una forma de pago en un canal. */
export type Celda = {
  comision: number
  finan: number
  dias: number
  descuento: number
  /** Si está apagado, esta forma no aplica IVA/IIBB/DREI. */
  aplicaImp: boolean
}

/** Costo de canal por venta ($ fijo o % del PVP). */
export type CostoCanal = { valor: number; tipo: '$' | '%' }

export type Impuestos = { iva: number; iibb: number; drei: number; ganancias: number }

export type ComCfg = {
  formas: string[]
  /** canal → forma → celda. */
  matriz: Record<string, Record<string, Celda>>
  /** canal → costo de canal. */
  costoCanal: Record<string, CostoCanal>
  imp: Impuestos
  /** ¿Hay saldo de IVA a favor? Si sí, el IVA no se cuenta como costo (se recupera). */
  saldoIva: boolean
}

/** El resultado del cálculo de margen de una celda (forma × canal). Port de comCalcular. */
export type ResultadoMargen = {
  margen: number
  margenPct: number
  dias: number
  ivaRecuperado: number
  pvp: number
  pvpEf: number
  desc: number
  aplicaImp: boolean
  costoNeto: number
  precioNeto: number
  comisionM: number
  finanM: number
  iibbM: number
  dreiM: number
  canalM: number
  ivaPagar: number
  contrib: number
  ganancias: number
  com: number
  fin: number
}

/** Un ítem de la lista de precios de sale (por cuenta, localStorage). */
export type ItemSale = {
  pid: string
  name: string
  sku: string
  actual: number
  sale: number
  desc: number
  markup: number | null
  margin: number | null
}

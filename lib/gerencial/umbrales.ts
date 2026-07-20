/**
 * Umbrales que deciden la severidad de cada señal del panel Gerencial. En fase 1/2 son
 * constantes; la idea es hacerlos configurables desde la sección más adelante (KV
 * compartido, como Reposición/Comisiones), sin tocar los detectores.
 */

export type Umbrales = {
  /** Días sin vender (teniendo stock) para considerar capital parado. */
  sinVentaDias: number
  /** Cantidad de productos con capital parado que eleva la señal a "crítico". */
  sinVentaCritico: number
  /** Cantidad de productos en declive que eleva la señal a "crítico". */
  decliveCritico: number
  /** Solicitudes de fotos pendientes a partir de las cuales pasa de "oportunidad" a "atención". */
  fotosAtencion: number
  /** Ventana (días) para avisar de una importación que está por arribar. */
  etaProximaDias: number
  /** Días sin venta + sin stock para considerar un producto candidato a depurar (caducado). */
  caducadosDias: number
  /** Puntos por DEBAJO del objetivo de markup para marcar "subprecio" (margen que se deja). */
  precioAbajoPts: number
  /** Puntos por ENCIMA del objetivo de markup para marcar "sobreprecio" (puede frenar ventas). */
  precioArribaPts: number
  /**
   * ⚠️ ROAS objetivo (ingresos ÷ gasto) de Meta Ads. NO existe en el código: es un
   * placeholder para que Bruno lo fije. Debajo de este valor, una campaña con gasto
   * relevante se marca. Ajustar a la realidad del negocio.
   */
  roasObjetivo: number
  /** Gasto mínimo (en la moneda de la cuenta) para que una campaña sin compras sea señal. */
  gastoMinSinCompras: number
}

export const UMBRALES: Umbrales = {
  sinVentaDias: 45,
  sinVentaCritico: 20,
  decliveCritico: 10,
  fotosAtencion: 5,
  etaProximaDias: 14,
  caducadosDias: 30,
  precioAbajoPts: 15,
  precioArribaPts: 50,
  roasObjetivo: 2,
  gastoMinSinCompras: 20000,
}

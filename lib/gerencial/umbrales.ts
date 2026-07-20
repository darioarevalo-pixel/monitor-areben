/**
 * Umbrales que deciden la severidad de cada señal del panel Gerencial. En fase 1 son
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
}

export const UMBRALES: Umbrales = {
  sinVentaDias: 45,
  sinVentaCritico: 20,
  decliveCritico: 10,
  fotosAtencion: 5,
  etaProximaDias: 14,
}

/**
 * Los tres números del sync de ventas de Stunned, aparte del motor: cambiar el corte tiene que
 * costar una línea y no obligar a releer `core.ts`.
 */

import type { ConfigSync } from './tipos'

/**
 * 🔴 A DEFINIR CON BRUNO. Desde este día (inclusive) el sync se hace cargo de las ventas online
 * de Stunned, y desde este día quien hoy las carga a mano en GN **deja de cargarlas**. Todo lo
 * anterior queda en la cola como `anterior_al_corte`: ya está en GN, cargado como "Mi Local".
 *
 * Mientras esté vacío, el dry-run no propone crear NADA — es la posición segura.
 */
export const CORTE_STUNNED = ''

/** Días de gracia al cruzar una orden de TN contra una venta ya cargada a mano en GN. */
export const TOLERANCIA_DIAS = 1

/** Sólo se importan las órdenes pagas. Las `pending`/`authorized` quedan en la cola. */
export const SOLO_PAGAS = true

export const CFG_STUNNED: ConfigSync = {
  corte: CORTE_STUNNED,
  soloPagas: SOLO_PAGAS,
  toleranciaDias: TOLERANCIA_DIAS,
}

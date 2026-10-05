/**
 * Las marcas de la Caja (rediseño, fase 5 = V4 del plan v3). 🔑 **El POS es UNO solo y la marca es
 * CONFIGURACIÓN** (Bruno, 5-oct, diseñando en Figma): el nombre, el local y el depósito de GN, el modo
 * «Local» con que se escribe la venta. La pantalla es la misma.
 *
 * Es JS plano porque lo importa `api/_caja.js`, que corre en Node sin el compilador de Next.
 *
 * 🔴 **Habilitada hoy: sólo Zattia.** BDI necesita sus ids de Gestión Nube (local, depósito, el modo
 * Local de `GET /ventas/referencias`, sus cuentas de cobro) y su base con las tablas de la Caja: eso lo
 * carga Bruno. Hasta entonces `marcaDeCaja('bdi')` es `null` y el handler contesta 400, como siempre.
 */

import { MODO_LOCAL_ZATTIA } from './core.core.js';

/**
 * @typedef {{ store: string, nombre: string, local: number, deposito: number,
 *   modoLocal: import('./core.core.js').ModoLocal }} MarcaCaja
 */

/** @type {Readonly<Record<string, MarcaCaja>>} */
export const MARCAS_CAJA = Object.freeze({
  zattia: Object.freeze({
    store: 'zattia',
    nombre: 'Zattia',
    // Los depósitos de GN: el Local (percha + el depósito de atrás) y el Depósito (⛔ vende desde la caja).
    local: 11780,
    deposito: 18210,
    modoLocal: MODO_LOCAL_ZATTIA,
  }),
});

/** La marca habilitada por defecto (la del POS cuando nadie la nombra). */
export const MARCA_POR_DEFECTO = 'zattia';

/**
 * La marca de la Caja para un `store`, o `null` si la Caja ⛔ está habilitada ahí.
 * @param {string | null | undefined} store
 * @returns {MarcaCaja | null}
 */
export function marcaDeCaja(store) {
  const k = String(store || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(MARCAS_CAJA, k) ? MARCAS_CAJA[k] : null;
}

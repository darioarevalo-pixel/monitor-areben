/**
 * De qué MARCA es un ticket de la Caja (Bruno, 26-oct: «un ticket es de UNA sola marca»). La Caja es una sola
 * en el local, pero Stunned pasa al ERP y Zattia sigue en GN ⇒ un ticket con prendas de las dos no tiene a
 * dónde ir (el cliente pagaría dos veces): se frena con «cobralo aparte». Sólo existe en la Caja de Zattia;
 * en BDI el prefijo `STU` no significa nada (`lineaDe`).
 *
 * La pantalla manda `linea` por renglón (su `esDeStunned` mira el SKU del producto Y el de la variante: hay
 * productos de GN sin SKU propio); el servidor acepta eso o, si no viene, el SKU del renglón.
 *
 * JS plano, sin red: lo importan `api/_caja.js` y los tests.
 */
import { esStunned } from '../lineas.core.js';

/** @param {{ linea?: string | null, sku?: string | null }} r */
export const renglonEsStunned = (r) => !!r && (r.linea === 'stunned' || (r.linea == null && esStunned(r.sku)));

/**
 * @param {string} store @param {Array<{ linea?: string | null, sku?: string | null }>} renglones
 * @returns {{ marca: 'zattia' | 'stunned' | 'bdi' | 'mixto', stunned: number, otras: number }}
 */
export function marcaDelTicket(store, renglones) {
  const lista = Array.isArray(renglones) ? renglones : [];
  if (store !== 'zattia') return { marca: store === 'bdi' ? 'bdi' : 'zattia', stunned: 0, otras: lista.length };
  const stunned = lista.filter(renglonEsStunned).length;
  const otras = lista.length - stunned;
  const marca = stunned && otras ? 'mixto' : stunned ? 'stunned' : 'zattia';
  return { marca, stunned, otras };
}

/**
 * A dónde va el ticket. `llaveErp`: Stunned ya vive en el ERP (env `CAJA_STUNNED_ERP`, ⛔ prendida hasta el corte).
 * Con la llave apagada TODO va a GN como hoy, mixto incluido.
 * @returns {{ destino: 'gn' | 'erp', marca: string, error?: string }}
 */
export function destinoDelTicket(store, renglones, llaveErp) {
  const m = marcaDelTicket(store, renglones);
  if (!llaveErp || m.marca === 'zattia' || m.marca === 'bdi') return { destino: 'gn', marca: m.marca === 'mixto' ? 'zattia' : m.marca };
  if (m.marca === 'mixto') {
    return { destino: 'gn', marca: 'mixto', error: 'Este ticket mezcla prendas de Stunned y de Zattia: cobralas por separado (un ticket por marca).' };
  }
  return { destino: 'erp', marca: 'stunned' };
}

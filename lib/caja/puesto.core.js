/**
 * EL PUESTO DE LA CAJA: el local o el EVENTO (Bruno, 29-oct: «armemos algo en el ERP» para vender en una feria o un evento).
 * Cada puesto tiene su TURNO (la plata del evento ⛔ se mezcla con el cierre del local) y la venta de un turno del evento
 * descuenta del depósito `evento` del ERP (motor sql/058), ⛔ del local. Sólo Stunned (vive en el ERP; Zattia sigue en GN).
 *
 * JS plano, sin red: lo usan `api/_caja.js` y `api/_caja-motor.js`.
 */
export const PUESTOS = ['local', 'evento'];

/** El puesto pedido (`?deposito=`), o null si es inválido. Sin nada = el local. El evento sólo en la Caja de Zattia (Stunned). */
export function puestoDe(crudo, store) {
  const p = crudo == null || crudo === '' ? 'local' : String(crudo);
  if (!PUESTOS.includes(p)) return null;
  if (p === 'evento' && store !== 'zattia') return null;
  return p;
}

/** ¿El error de Supabase es porque la columna `deposito` todavía ⛔ existe (sin `sql/migrate-caja-turno-deposito.sql`)? */
export function faltaColumnaDeposito(error) {
  return !!error && /deposito/.test(String(error.message || '')) && /column|columna/i.test(String(error.message || ''));
}

/**
 * ¿Se puede cobrar este ticket en este turno? En el turno del evento sólo va Stunned al ERP: una prenda de Zattia (GN)
 * ⛔ tiene depósito Evento. @returns {string | null} el error, o null.
 */
export function errorDelPuesto(turno, destino) {
  if ((turno && turno.deposito) !== 'evento') return null;
  return destino === 'erp' ? null : 'En la caja del evento sólo se cobra Stunned.';
}

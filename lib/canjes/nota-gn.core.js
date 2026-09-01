/**
 * La NOTA de la venta que un canje escribe en Gestión Nube.
 *
 * ⚠️ **Está en JS plano, y no por gusto**: la MUESTRA la pantalla antes de apretar el botón
 * (`BloqueEnvio`, `CanjesLocal`) y la MANDA `lib/canjes/cliente.ts`. Si fueran dos
 * implementaciones, la pantalla prometería una nota y GN guardaría otra — y la nota es justamente
 * lo que uno mira antes de apretar. Mismo motivo que `lib/sync-tn/nota.core.js`, de donde sale este
 * archivo, y que `lib/canjes/reglas.core.js`.
 *
 * # Por qué existe
 *
 * **Todas** las ventas de canje se atribuyen al MISMO cliente de Gestión Nube (`Canjes BDI`),
 * porque el Monitor no da de alta un cliente por creadora: llenaría el padrón de GN con gente que
 * no compra. Entonces `client_name` dice siempre lo mismo, y **esta nota es el único lugar donde
 * sobrevive de quién era el canje**. Es literalmente lo que pidió Bruno: *«en la nota que diga el
 * nombre de la persona»*.
 *
 * 🔑 **El número del canje va PRIMERO y con su propio tope**, así es lo último que se pierde si
 * alguien tiene un nombre absurdo: con el número se llega a la ficha, y de la ficha sale todo lo
 * demás. El nombre sin el número no lleva a ningún lado.
 */

/** Aplasta espacios y saltos de línea, y recorta. Un nombre con un enter no puede partir la nota. */
export const recorte = (v, max) => {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/**
 * Cómo salió del stock. Son las dos formas que existen y se leen distinto en GN:
 * el mostrador entrega en la mano, el envío sale a la calle.
 */
const COMO = {
  envio: 'envío',
  local: 'retiro en el local',
};

/**
 * @param {{ numero?: unknown, quien?: unknown, modo?: 'envio'|'local' }} d
 * @returns {string} p.ej. `Canje C-0029 — Sofía Pérez — envío (Monitor)`
 *
 * 🔑 **`sin nombre` es explícito y no un hueco.** Una persona sin nombre cargado existe (se dan de
 * alta desde Instagram, a veces con el @ y nada más), y una nota que dijera `Canje C-0029 —  —
 * envío` se lee como un error del sistema en vez de como un dato que falta.
 *
 * ⚠️ El `(Monitor)` del final es el que distingue estas ventas de las que alguien carga a mano en
 * GN. `integration_source: 'monitor-canje'` dice lo mismo, pero no se ve en la pantalla de GN.
 */
export function notaVentaCanje(d) {
  const b = d || {};
  const quien = recorte(b.quien, 80) || 'sin nombre';
  const como = COMO[b.modo] || COMO.envio;
  return `Canje ${recorte(b.numero, 20)} — ${quien} — ${como} (Monitor)`;
}

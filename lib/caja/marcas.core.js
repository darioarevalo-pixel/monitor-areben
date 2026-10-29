/**
 * Las marcas de la Caja (rediseño, fase 5 = V4 del plan v3). 🔑 **El POS es UNO solo y la marca es
 * CONFIGURACIÓN** (Bruno, 5-oct, diseñando en Figma): el nombre, el local y el depósito de GN, el modo
 * «Local» con que se escribe la venta, sus tokens de GN y la siembra de sus formas de pago. La pantalla
 * es la misma.
 *
 * Es JS plano porque lo importa `api/_caja.js`, que corre en Node sin el compilador de Next.
 *
 * 🔑 **V4 (Bruno, 12-oct): BDI habilitada.** Es OTRA empresa en Gestión Nube (otro token, otros ids):
 * los de acá se leyeron de su `GET /ventas/referencias` el 12-oct (`scripts/caja-referencias.mjs bdi`)
 * —modo «Local» id 614: depósito 18393, canal 3, tipo 1, estado 6— y el consumidor final de sus ventas
 * del local (158744, 78 de 81 ventas del 1 al 11-oct). Sus formas de pago son las MISMAS de Zattia con
 * SUS cuentas (`reglasIniciales`), y después las cambia un admin en «Formas de pago» (`caja_config`).
 */

import { MODO_LOCAL_ZATTIA, REGLAS_INICIALES } from './core.core.js';

/**
 * @typedef {{ store: string, nombre: string, local: number, deposito: number,
 *   modoLocal: import('./core.core.js').ModoLocal,
 *   tokenVentas: string[], tokenLectura: string[],
 *   espejo: { local: string[], deposito: string[] },
 *   tienda: string | null,
 *   reglasIniciales: import('./core.core.js').Reglas }} MarcaCaja
 *
 * - `tokenVentas` / `tokenLectura`: las variables de entorno, en orden, del token que ESCRIBE ventas y del
 *   que LEE el inventario (el de ventas de Zattia ⛔ lee `inventario`: caía al espejo, callado).
 * - `espejo`: los `store_name` de la tabla `inventario` (en minúscula y sin espacios en las puntas) que son
 *   el Local y el Depósito. 🔴 Exactos: BDI tiene «Deposito Mayorista», que ⛔ se vende desde la caja.
 * - `tienda`: el dominio de la Tienda Nube pública, de donde sale el logo (null = sin tienda propia).
 */

/** Los ids de GN del modo «Local» de BDI (`GET /ventas/referencias` → `modos_venta` id 614, 12-oct). */
export const MODO_LOCAL_BDI = Object.freeze({
  client_id: 158744, // Consumidor Final (el de las ventas del local, medido el 12-oct)
  channel_id: 3,
  sale_type_id: 1,
  sale_state_id: 6,
  currency_id: 1,
  store_id: 18393,
});

/**
 * Las formas de pago con que NACE la Caja de BDI (Bruno, 12-oct: «idénticas a Zattia»), con las cuentas
 * de SU Gestión Nube. ⛔ Tiene cuentas de feria, «Feria TC» ni 6 cuotas: la oferta se cobra con el % de la
 * forma de pago (Bruno: «los productos en oferta llevan el %»).
 * - Transferencia: 14701 «Transferencia AREBEN» y 20597 «Transferencia CG» (53 de 53 del local, sep-oct).
 *   🔑 CON la espera (Bruno, 12-oct: «que no se pierda la costumbre de ver ese estado»), pero BDI todavía ⛔
 *   tiene cuenta de MP ⇒ la cajera la confirma a mano («Transferencia confirmada») y va a la CG
 *   (`transferenciaFija`). Cuando se conecte la cuenta en Pagos recibidos, el cruce es automático.
 * - Débito al 10 % como Zattia (Bruno, 12-oct, confirmado: en el POS de GN de BDI salía sin descuento).
 */
export const REGLAS_INICIALES_BDI = Object.freeze({
  redondeo: 100,
  cuentas: Object.freeze({
    14685: Object.freeze({ nombre: 'Efectivo', descuento: 15, efectivo: true }),
    14701: Object.freeze({ nombre: 'Transferencia AREBEN', descuento: 10 }),
    20597: Object.freeze({ nombre: 'Transferencia CG', descuento: 10 }),
    21667: Object.freeze({ nombre: 'Debito', descuento: 10 }),
    25176: Object.freeze({ nombre: 'Credito 10% OFF', descuento: 10 }),
    25189: Object.freeze({ nombre: 'Credito - Nro 1 o 13', descuento: 0 }),
  }),
  medios: Object.freeze({
    efectivo: Object.freeze({ normal: 14685, feria: null }),
    transferencia: Object.freeze({ opciones: Object.freeze([14701, 20597]), feria: null }),
    debito: Object.freeze({ normal: 21667 }),
    credito: Object.freeze({ normal: 25189, promo: 25176, seisCuotas: null, minSeisCuotas: 0 }),
    tarjetaOferta: null,
  }),
  oferta: Object.freeze({ efectivo: 'descuento', transferencia: 'descuento', debito: 'descuento', credito: 'descuento', recargo: 10 }),
  verificarTransferencia: true,
  transferenciaFija: 20597,
  titulares: Object.freeze({ areben: 14701, dario: 20597, bruno: 20597 }),
});

/** @type {Readonly<Record<string, MarcaCaja>>} */
export const MARCAS_CAJA = Object.freeze({
  zattia: Object.freeze({
    store: 'zattia',
    nombre: 'Zattia',
    // Los depósitos de GN: el Local (percha + el depósito de atrás) y el Depósito (⛔ vende desde la caja).
    local: 11780,
    deposito: 18210,
    modoLocal: MODO_LOCAL_ZATTIA,
    tokenVentas: Object.freeze(['GN_TOKEN_VENTAS', 'GN_TOKEN_ZATTIA']),
    tokenLectura: Object.freeze(['GN_TOKEN_ZATTIA', 'GN_TOKEN_VENTAS']),
    // GN lo escribe «Deposito » con un espacio: se compara sin las puntas.
    espejo: Object.freeze({ local: Object.freeze(['local']), deposito: Object.freeze(['deposito', 'depósito']) }),
    tienda: 'zattia.com.ar',
    // Stunned es una línea de Zattia con SU Tienda Nube: de ahí sale el logo de su ticket (Bruno, 29-oct). Medido: publica
    // `"logo": "https://dcdn-us.mitiendanube.com/stores/007/516/263/…png"` como la de Zattia.
    tiendaStunned: 'stunned.com.ar',
    reglasIniciales: REGLAS_INICIALES,
  }),
  bdi: Object.freeze({
    store: 'bdi',
    nombre: 'BDI',
    // «Local» 18393 y «Deposito Minorista» 13307 (`api/_inventario-vivo.js`). El Mayorista (19320) ⛔.
    local: 18393,
    deposito: 13307,
    modoLocal: MODO_LOCAL_BDI,
    tokenVentas: Object.freeze(['GN_TOKEN_VENTAS_BDI', 'GN_TOKEN']),
    tokenLectura: Object.freeze(['GN_TOKEN', 'GN_TOKEN_VENTAS_BDI']),
    espejo: Object.freeze({ local: Object.freeze(['local']), deposito: Object.freeze(['deposito minorista']) }),
    tienda: 'bdiaccesorios.com.ar',
    reglasIniciales: REGLAS_INICIALES_BDI,
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

/**
 * El primer token cargado de la lista (`tokenVentas` o `tokenLectura`), o undefined.
 * @param {readonly string[]} nombres @param {Record<string, string | undefined>} env
 */
export function tokenDe(nombres, env) {
  for (const n of nombres) if (env[n]) return env[n];
  return undefined;
}

/**
 * ¿Ese `store_name` del espejo es el Local, el Depósito o ninguno, para esta marca?
 * @param {MarcaCaja} marca @param {unknown} storeName @returns {'local' | 'deposito' | null}
 */
export function ladoDelEspejo(marca, storeName) {
  const n = String(storeName || '').trim().toLowerCase();
  if (marca.espejo.local.includes(n)) return 'local';
  if (marca.espejo.deposito.includes(n)) return 'deposito';
  return null;
}

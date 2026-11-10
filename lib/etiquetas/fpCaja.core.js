/**
 * LA ETIQUETA DE FORMAS DE PAGO DE «PARA REETIQUETAR», SACADA DE LA CAJA (Bruno, 10-nov-2026).
 *
 * `.js` plano porque la arma `api/_liquidacion.js` (los handlers ⛔ importan TypeScript); la pantalla
 * usa `fpCaja.ts`. Misma forma que `cola.core.js` / `cola.ts`.
 *
 * 🔑 **Por qué:** la etiqueta de formas de pago era texto escrito a mano y guardado EN CADA COMPU
 * (`claveFormasDePago`), y la Caja cobra con su propia configuración. Hoy coincidían; el día que se
 * cambia un % en la Caja, la etiqueta ⛔ se enteraba y el cartón decía una cosa y el mostrador cobraba
 * otra. Bruno: *«tiene que ser la misma configuración que armamos con la de precios de campaña, que
 * viene con el dto en efectivo y en transferencia, después las otras se marcan en caja»*.
 *
 * ⇒ **Los % los decide la Caja, con sus MISMAS funciones** (`lib/caja/core.core.js`), ⛔ una copia:
 * - la prenda de una campaña con % propio (`pctDePrendas`, p. ej. OFERTAS 10/10) ⇒ el de la campaña;
 * - la prenda de feria (`idsDeFeria`) ⇒ 0: su precio YA es el final de efectivo/transferencia;
 * - el resto ⇒ el de la cuenta normal de cada forma de pago (`pctDeMedio`, lo que la Caja DICE).
 * Débito y crédito ⛔ van en la etiqueta: se resuelven en la Caja. Las **3 cuotas sin interés** SÍ van: son
 * condición del precio de lista (Bruno, 10-nov: *«el precio de lista es con 3 cuotas»*) y en la Caja son
 * la cuenta de crédito normal («Credito - Nro 1 o 13», 0 %), que ⛔ dice «3» como dato ⇒ `CUOTAS_SIN_INTERES`.
 *
 * ⚠️ Con reglas comerciales prendidas el % de una prenda sale del motor (`pctDePago`, con la venta
 * entera) y ⛔ se puede anticipar acá: se usa el de toda la tienda y `conReglasComerciales` lo avisa.
 */

import { idsDeFeria, pctDeMedio } from '../caja/core.core.js'

/**
 * @typedef {{ efectivo: number | null, transferencia: number | null }} PctEtiqueta
 * @typedef {{ tienda: PctEtiqueta, porPrenda: Record<string, PctEtiqueta>, conReglasComerciales: boolean }} FpCaja
 */

/**
 * Las cuotas sin interés del precio de lista (Bruno, 10-nov-2026). Las mismas que la etiqueta de la campaña
 * (`etiqueta.cuotas` de CYBER MONDAY ONLINE = 3). Si cambia la condición, cambia acá y en la campaña.
 */
export const CUOTAS_SIN_INTERES = 3

/** @param {unknown} n @returns {number | null} */
const pct = (n) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null)

/**
 * Lo que viaja al navegador: el % de toda la tienda y el de las prendas que pagan otro. Chico a
 * propósito (sólo las excepciones), y sin plata: son porcentajes que ya están impresos en el local.
 * @param {any} reglas Las reglas con las que la Caja cobra HOY (`reglasDeHoy`).
 * @returns {FpCaja}
 */
export function fpDeCaja(reglas) {
  if (!reglas || !reglas.medios || !reglas.cuentas) throw new Error('La Caja no tiene formas de pago cargadas.')
  const m = reglas.medios
  const opciones = (m.transferencia && m.transferencia.opciones) || []
  // La cuenta a la que va HOY la transferencia; sin cuenta de Mercado Pago conectada, la primera.
  const cuentaT = opciones.includes(Number(reglas.transferenciaA)) ? Number(reglas.transferenciaA) : opciones[0]
  const tienda = {
    efectivo: pct(pctDeMedio('efectivo', reglas, m.efectivo && m.efectivo.normal)),
    transferencia: cuentaT == null ? null : pct(pctDeMedio('transferencia', reglas, cuentaT)),
  }
  /** @type {Record<string, PctEtiqueta>} */
  const porPrenda = {}
  if (!reglas.comerciales) {
    for (const [pid, t] of Object.entries(reglas.pctDePrendas || {})) {
      porPrenda[String(pid)] = { efectivo: pct(t && t.efectivo), transferencia: pct(t && t.transferencia) }
    }
  }
  // La feria va a su cuenta SIN % (`pagosDeMedio`): manda sobre el % de campaña, como en la Caja.
  for (const id of idsDeFeria(reglas)) porPrenda[String(id)] = { efectivo: 0, transferencia: 0 }
  return { tienda, porPrenda, conReglasComerciales: !!reglas.comerciales }
}

/** El % de ESTA prenda. @param {FpCaja} fp @param {string | number} pid @returns {PctEtiqueta} */
export function pctDeEtiqueta(fp, pid) {
  return fp.porPrenda[String(pid)] || fp.tienda
}

/**
 * Los renglones, con el MISMO dibujo y orden que la de la campaña (`fpDescuentos`): título, las cuotas
 * del precio de lista y un renglón por forma de pago con descuento. Un 0 ⛔ se escribe: «0% OFF» ⛔ le
 * dice nada al cliente.
 * @param {PctEtiqueta} p
 * @returns {{ texto: string, tam: 'titulo' | 'normal', bold: boolean }[]}
 */
export function lineasFpDeCaja(p) {
  /** @type {{ texto: string, tam: 'titulo' | 'normal', bold: boolean }[]} */
  const out = [
    { texto: 'FORMAS DE PAGO', tam: 'titulo', bold: true },
    { texto: `${CUOTAS_SIN_INTERES} cuotas sin interés`, tam: 'normal', bold: false },
  ]
  if (p.transferencia) out.push({ texto: `${p.transferencia}% OFF Transferencia`, tam: 'normal', bold: false })
  if (p.efectivo) out.push({ texto: `${p.efectivo}% OFF Efectivo`, tam: 'normal', bold: false })
  return out
}

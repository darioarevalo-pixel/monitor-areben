/**
 * `erp › Cuentas de cobro` del lado del monitor (puro): las RUTAS que pone gerencia —qué cuenta REAL recibe cada medio,
 * por marca × canal, desde un momento— y el AVISO al cambiarlas. La ruta y su guardado son del motor
 * (`motor/cuentas/rutas.mjs`, sql/019-020); la regla de facturar también (`esFacturable`). Lo usan `api/_erp-rutas.js` y la
 * pantalla (`components/erp/RutasCobro.tsx`). Diseño: `~/Documents/erp-monitor/cuentas-cobro.md`.
 *
 * 🔑 Bruno, 18-oct: la cajera ve sólo el MEDIO; el descuento va en el medio (las reglas comerciales) y la ruta, detrás,
 * dice adónde va la plata. La regla NACE del análisis de la cuenta (si la cuenta ⛔ factura, eso invita a poner el
 * descuento) pero al ERP entra limpia ⇒ cambiar una ruta a una cuenta que FACTURA con un medio que tiene descuento AVISA
 * («¿revisás la regla?»): ⛔ cambia la regla sola.
 */
import { esFacturable } from '../../motor/cuentas/cuentas.mjs'
import { deLaLinea, NOMBRE_MEDIO as MEDIO_DE_REGLA } from '../../motor/venta/reglas.mjs'
import { NOMBRE_CANAL, NOMBRE_MARCA } from './venta.core.js'

/**
 * Los medios que llevan ruta, en el orden de la pantalla. El saldo a favor ⛔: ⛔ entra plata (se paga con lo que ya se
 * cobró), ⇒ ⛔ tiene adónde ir.
 */
export const MEDIOS_DE_RUTA = ['efectivo', 'transferencia', 'debito', 'credito', 'mp', 'pagonube']
export const CANALES_DE_RUTA = ['local', 'online', 'mayorista', 'ml']
export const NOMBRE_MEDIO = { ...MEDIO_DE_REGLA, mp: 'Mercado Pago', pagonube: 'Pago Nube' }
export const NOMBRE_TITULAR = { areben: 'Areben', bruno: 'Bruno', dario: 'Darío', tercero: 'Tercero' }

/**
 * El nombre de una cuenta real para la pantalla: «Galicia · Cuenta Corriente (Areben)».
 * @param {{ titular?: string | null, nombre?: string | null, banco?: string | null } | null | undefined} c
 */
export function nombreDeCuenta(c) {
  if (!c) return 'Se elige en cada cobro'
  const titular = (c.titular && NOMBRE_TITULAR[c.titular]) || c.titular
  return `${c.banco ? `${c.banco} · ` : ''}${c.nombre} (${titular})`
}

/**
 * Lo que manda la pantalla para poner una ruta. La marca (la BASE) la pone el servidor; el cuerpo elige una LÍNEA de ella
 * (Stunned en Zattia). Sin `desde` = ahora. Devuelve `{ ruta }` o `{ error, campo }`; el resto lo valida el motor.
 * @param {any} b @param {{ marca: string, lineas: string[] }} o
 * @returns {{ ruta: { marca: string, canal: string, medio: string, cuenta_real_id: string | null, tasa: number | null,
 *   dias_acreditacion: number | null, desde?: string }, error?: undefined, campo?: undefined } | { error: string, campo?: string, ruta?: undefined }}
 */
export function leerRutaDePantalla(b, { marca, lineas }) {
  if (!b || typeof b !== 'object') return { error: 'Falta la ruta' }
  const linea = b.linea == null || b.linea === '' ? marca : String(b.linea)
  if (!lineas.includes(linea)) return { error: 'Línea inválida', campo: 'linea' }
  if (!CANALES_DE_RUTA.includes(b.canal)) return { error: 'Canal inválido', campo: 'canal' }
  if (!MEDIOS_DE_RUTA.includes(b.medio)) return { error: 'Medio inválido', campo: 'medio' }
  const cuenta = b.cuenta_real_id == null || b.cuenta_real_id === '' ? null : String(b.cuenta_real_id)
  if (cuenta != null && !/^[0-9a-f-]{36}$/i.test(cuenta)) return { error: 'Cuenta inválida', campo: 'cuenta_real_id' }
  const numero = (x) => (x == null || x === '' ? null : Number(String(x).replace(',', '.')))
  /** @type {{ marca: string, canal: string, medio: string, cuenta_real_id: string | null, tasa: number | null, dias_acreditacion: number | null, desde?: string }} */
  const ruta = { marca: linea, canal: b.canal, medio: b.medio, cuenta_real_id: cuenta, tasa: numero(b.tasa), dias_acreditacion: numero(b.dias_acreditacion) }
  if (b.desde != null && b.desde !== '') ruta.desde = String(b.desde)
  return { ruta }
}

/**
 * Los descuentos ACTIVOS de un medio en esa línea y canal, como los cobraría la Caja: Stunned con las suyas si tiene
 * alguna, si ⛔ con las de Zattia (`deLaLinea`, el mismo núcleo que cobra). Las reglas sólo existen para local y online.
 * @param {any[]} reglas @param {{ linea: string, canal: string, medio: string }} o @returns {any[]}
 */
export function descuentosDelMedio(reglas, { linea, canal, medio }) {
  const delCanal = (reglas || []).filter((r) => r.activa && r.canal === canal)
  return deLaLinea(delCanal, { linea }).filter((r) => r.efecto === 'descuento' && Number(r.pct) > 0 && (r.medios || []).includes(medio))
}

/**
 * EL AVISO (Bruno, 18-oct): la ruta nueva manda el medio a una cuenta que FACTURA y ese medio tiene descuento ⇒ se paga el
 * IVA y además se hace el descuento. null = nada que avisar. ⛔ frena: la decisión es de gerencia.
 * @param {{ linea: string, canal: string, medio: string, cuenta: { titular: string, nombre?: string | null, banco?: string | null } | null, reglas: any[] }} e
 * @returns {string | null}
 */
export function avisoDeRuta({ linea, canal, medio, cuenta, reglas }) {
  if (!cuenta || !esFacturable({ titular: cuenta.titular, medio })) return null
  const d = descuentosDelMedio(reglas, { linea, canal, medio })
  if (!d.length) return null
  const pcts = d.map((r) => `−${Number(r.pct)} % («${r.nombre}»)`).join(', ')
  return `${NOMBRE_MEDIO[/** @type {keyof typeof NOMBRE_MEDIO} */ (medio)]} de ${NOMBRE_MARCA[/** @type {keyof typeof NOMBRE_MARCA} */ (linea)] || linea} en ${(NOMBRE_CANAL[canal] || canal).toLowerCase()} tiene ${pcts} y ahora va a ${nombreDeCuenta(cuenta)}, que factura. ¿Revisás la regla?`
}

/**
 * La grilla de una línea: una fila por canal × medio (todas, tengan ruta o ⛔), con la vigente, la próxima, si factura y
 * el aviso de la vigente.
 * @param {Array<{ canal: string, medio: string, vigente: any, proxima: any }>} vigentes  `rutasVigentes` del motor (para esa línea)
 * @param {{ linea: string, reglas: any[] }} o
 */
export function filasDeRutas(vigentes, { linea, reglas }) {
  const por = new Map((vigentes || []).map((v) => [`${v.canal}|${v.medio}`, v]))
  const cuentaDe = (/** @type {any} */ r) => (r && r.cuenta_real_id ? { id: r.cuenta_real_id, titular: r.cuenta_titular, nombre: r.cuenta_nombre, banco: r.cuenta_banco, activa: r.cuenta_activa } : null)
  return CANALES_DE_RUTA.flatMap((canal) => MEDIOS_DE_RUTA.map((medio) => {
    const v = por.get(`${canal}|${medio}`)
    const vigente = v?.vigente ?? null
    const cuenta = cuentaDe(vigente)
    return {
      canal, medio, vigente, proxima: v?.proxima ?? null, cuenta,
      factura: vigente ? (cuenta ? esFacturable({ titular: cuenta.titular, medio }) : null) : null,
      aviso: vigente ? avisoDeRuta({ linea, canal, medio, cuenta, reglas }) : null,
    }
  }))
}

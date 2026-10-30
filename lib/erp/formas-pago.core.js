/**
 * Las FORMAS DE PAGO de «Cargar venta», IDÉNTICAS a las del POS (Bruno, 27-oct: «tienen que correr con la ruta, idéntico al POS»).
 * Las cuatro de la Caja —Efectivo, Transferencia, Débito, Crédito— salen de las MISMAS reglas (`caja_config.reglas`, `cuentaDeMedio`
 * de `lib/caja/core.core.js`) y cada una resuelve a su cuenta de cobro del motor (por `gn_cuenta_id`); de ahí la ruta de gerencia
 * (marca × canal × medio ⇒ cuenta REAL y tasa) sale sola en el motor. Sumadas, las dos que sólo tiene el ERP: «Queda debiendo»
 * (cuenta corriente) y «Contraentrega» (el cadete cobra); y «Otra cuenta» para lo que ⛔ es del POS (Mercado Pago, Pago Nube…).
 *
 * Puro (⛔ red ni base): lo arma `api/_erp-cargar.js`. ⛔ Se toca `lib/caja/` desde acá: sólo se IMPORTA `cuentaDeMedio`.
 * Descuentos y recargos por forma de pago (el `cobro()` del POS) NO van todavía: esta primera parte es QUÉ cuenta y QUÉ ruta.
 */
import { cuentaDeMedio, NOMBRE_MEDIO } from '../caja/core.core.js'

export const MEDIOS_POS = ['efectivo', 'transferencia', 'debito', 'credito']

/** La cuenta de GN de una forma de pago, o null si la configuración de la Caja no la dice (⛔ se inventa). */
function gnDe(medio, reglas, respuestas = {}) {
  try {
    const total = respuestas.seisCuotas ? Number(reglas.medios.credito.minSeisCuotas) + 1 : 0
    return cuentaDeMedio(medio, { reglas, total, promoCreditoHoy: !!respuestas.promo, esDelBanco: !!respuestas.promo, seisCuotas: !!respuestas.seisCuotas })
  } catch {
    return null
  }
}

/** El texto de la ruta de un canal × medio: a qué cuenta real va la plata. */
function rutaDe(rutas, canal, medio) {
  const r = rutas.find((x) => x.canal === canal && x.medio === medio)?.vigente
  if (!r) return null
  return {
    cuenta: r.cuenta_real_id == null ? 'Se elige en cada cobro' : [r.cuenta_titular, r.cuenta_nombre].filter(Boolean).join(' · ') || null,
    tasa: r.tasa == null ? null : Number(r.tasa),
    dias: r.dias_acreditacion ?? null,
  }
}

/**
 * @param {{ reglas: any, cuentas: Array<{ id: string, nombre: string, medio: string, gn_cuenta_id: number|null }>, rutas: any[], canales: string[] }} d
 * @returns {Array<{ clave: string, nombre: string, cuenta: string|null, opciones?: Array<{ clave: string, nombre: string, cuenta: string }>, rutas: Record<string, ReturnType<typeof rutaDe>> }>}
 */
export function formasDePago({ reglas, cuentas, rutas, canales }) {
  const porGn = new Map(cuentas.filter((c) => c.gn_cuenta_id != null).map((c) => [Number(c.gn_cuenta_id), c]))
  const rutasDe = (medio) => Object.fromEntries(canales.map((c) => [c, rutaDe(rutas, c, medio)]))
  const out = []
  for (const medio of MEDIOS_POS) {
    const normal = reglas?.medios ? porGn.get(gnDe(medio, reglas)) : null
    const forma = { clave: medio, nombre: NOMBRE_MEDIO[medio], cuenta: normal?.id ?? null, rutas: rutasDe(medio) }
    if (medio === 'credito' && reglas?.medios) {
      // Las variantes del crédito que el POS pregunta: normal, 6 cuotas, promo del banco (cada una con su cuenta).
      const opciones = [{ clave: 'normal', nombre: 'Sin promo', cuenta: normal?.id ?? null }]
      const seis = porGn.get(gnDe(medio, reglas, { seisCuotas: true }))
      const promo = porGn.get(gnDe(medio, reglas, { promo: true }))
      if (seis && seis.id !== normal?.id) opciones.push({ clave: 'seis', nombre: '6 cuotas', cuenta: seis.id })
      if (promo && promo.id !== normal?.id) opciones.push({ clave: 'promo', nombre: 'Promo del banco', cuenta: promo.id })
      if (opciones.length > 1) forma.opciones = opciones.filter((o) => o.cuenta)
    }
    out.push(forma)
  }
  // Las que sólo tiene el ERP.
  const unica = (m) => cuentas.find((c) => c.medio === m)
  const cc = unica('cuenta')
  if (cc) out.push({ clave: 'cuenta', nombre: 'Queda debiendo', cuenta: cc.id, rutas: {} })
  const en = unica('entrega')
  if (en) out.push({ clave: 'entrega', nombre: 'Contraentrega', cuenta: en.id, rutas: rutasDe('entrega') })
  return out
}

/** Las cuentas que ⛔ son de ninguna forma de arriba: lo que va en «Otra cuenta». */
export function cuentasSueltas({ formas, cuentas }) {
  const usadas = new Set(formas.flatMap((f) => [f.cuenta, ...(f.opciones ?? []).map((o) => o.cuenta)]).filter(Boolean))
  return cuentas.filter((c) => !usadas.has(c.id) && c.medio !== 'saldo')
}

/**
 * Las FORMAS DE PAGO de «Cargar venta», IDÉNTICAS a las del POS (Bruno, 27-oct: «tienen que correr con la ruta, idéntico al POS»).
 * Las cuatro de la Caja —Efectivo, Transferencia, Débito, Crédito— salen de las MISMAS reglas (`caja_config.reglas`, `cuentaDeMedio`
 * de `lib/caja/core.core.js`) y cada una resuelve a su cuenta de cobro del motor (por `gn_cuenta_id`); de ahí la ruta de gerencia
 * (marca × canal × medio ⇒ cuenta REAL y tasa) sale sola en el motor. Sumadas, las dos que sólo tiene el ERP: «Queda debiendo»
 * (cuenta corriente) y «Contraentrega» (el cadete cobra); y «Otra cuenta» para lo que ⛔ es del POS (Mercado Pago, Pago Nube…).
 *
 * Puro (⛔ red ni base): lo arma `api/_erp-cargar.js`. ⛔ Se toca `lib/caja/` desde acá: sólo se IMPORTAN `cuentaDeMedio` y `reglaDeCuenta`.
 * 🔑 «Nueva venta» (Bruno 10-nov): cada forma lleva el % de descuento de su cuenta en el POS (`pct`, `reglas.cuentas[gn].descuento`),
 * que la pantalla deja EDITAR, y la cuenta real de la ruta (`cuentaId`), que también se puede cambiar.
 * 🔑 **ERP sin CG (Bruno 10-nov: «ERP sin CG; GN igual»)**: la transferencia del ERP es SIEMPRE la de Areben (`titulares.areben`, si
 * ⛔ la primera de `medios.transferencia.opciones`), ⛔ la que el POS elige por el MP en uso (`transferenciaA` ⇒ «Transferencia CG»):
 * adónde fue la plata lo dice la cuenta REAL. Las cuentas de GN de transferencia a un particular (CG) ⛔ se ofrecen ni en «Más».
 */
import { cuentaDeMedio, NOMBRE_MEDIO, reglaDeCuenta } from '../caja/core.core.js'

export const MEDIOS_POS = ['efectivo', 'transferencia', 'debito', 'credito']

/** La cuenta de GN de una forma de pago, o null si la configuración de la Caja no la dice (⛔ se inventa). */
function gnDe(medio, reglas, respuestas = {}) {
  if (medio === 'transferencia') return transferenciaDeAreben(reglas)
  try {
    const total = respuestas.seisCuotas ? Number(reglas.medios.credito.minSeisCuotas) + 1 : 0
    return cuentaDeMedio(medio, { reglas, total, promoCreditoHoy: !!respuestas.promo, esDelBanco: !!respuestas.promo, seisCuotas: !!respuestas.seisCuotas })
  } catch {
    return null
  }
}

/** La transferencia del ERP: la de Areben (⛔ CG). Null sin reglas. */
export function transferenciaDeAreben(reglas) {
  const t = reglas?.medios?.transferencia
  if (!t) return null
  const areben = Number(reglas?.titulares?.areben)
  if (Number.isInteger(areben) && areben > 0) return areben
  const primera = Number((t.opciones || [])[0])
  return Number.isInteger(primera) && primera > 0 ? primera : null
}

/** Las cuentas de GN de transferencia que ⛔ son la de Areben (CG: a un particular): el ERP ⛔ las ofrece. */
export function transferenciasDeGerencia(reglas) {
  const t = reglas?.medios?.transferencia
  if (!t) return []
  const areben = transferenciaDeAreben(reglas)
  const todas = [...(t.opciones || []), ...Object.values(reglas?.titulares || {}), reglas?.transferenciaFija, reglas?.transferenciaA]
  return [...new Set(todas.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n !== areben))]
}

/** El % de descuento de una cuenta de GN en el POS (0 si la regla ⛔ está o es un recargo: la pantalla lo deja editar). */
function pctDe(gn, reglas) {
  if (gn == null || !reglas?.cuentas) return 0
  try { return Number(reglaDeCuenta(gn, reglas).descuento) || 0 } catch { return 0 }
}

/** El texto de la ruta de un canal × medio: a qué cuenta real va la plata. */
function rutaDe(rutas, canal, medio) {
  const r = rutas.find((x) => x.canal === canal && x.medio === medio)?.vigente
  if (!r) return null
  return {
    cuenta: r.cuenta_real_id == null ? 'Se elige en cada cobro' : [r.cuenta_titular, r.cuenta_nombre].filter(Boolean).join(' · ') || null,
    cuentaId: r.cuenta_real_id ?? null,
    tasa: r.tasa == null ? null : Number(r.tasa),
    dias: r.dias_acreditacion ?? null,
  }
}

/**
 * @param {{ reglas: any, cuentas: Array<{ id: string, nombre: string, medio: string, gn_cuenta_id: number|null }>, rutas: any[], canales: string[] }} d
 * @returns {Array<{ clave: string, nombre: string, cuenta: string|null, pct: number, opciones?: Array<{ clave: string, nombre: string, cuenta: string, pct: number }>, rutas: Record<string, ReturnType<typeof rutaDe>> }>}
 */
export function formasDePago({ reglas, cuentas, rutas, canales }) {
  const porGn = new Map(cuentas.filter((c) => c.gn_cuenta_id != null).map((c) => [Number(c.gn_cuenta_id), c]))
  const rutasDe = (medio) => Object.fromEntries(canales.map((c) => [c, rutaDe(rutas, c, medio)]))
  const out = []
  for (const medio of MEDIOS_POS) {
    const gn = reglas?.medios ? gnDe(medio, reglas) : null
    const normal = gn != null ? porGn.get(gn) : null
    const forma = { clave: medio, nombre: NOMBRE_MEDIO[medio], cuenta: normal?.id ?? null, pct: pctDe(gn, reglas), rutas: rutasDe(medio) }
    if (medio === 'credito' && reglas?.medios) {
      // Las variantes del crédito que el POS pregunta: normal, 6 cuotas, promo del banco (cada una con su cuenta y su %).
      const opciones = [{ clave: 'normal', nombre: 'Sin promo', cuenta: normal?.id ?? null, pct: pctDe(gn, reglas) }]
      const gnSeis = gnDe(medio, reglas, { seisCuotas: true }), gnPromo = gnDe(medio, reglas, { promo: true })
      const seis = porGn.get(gnSeis)
      const promo = porGn.get(gnPromo)
      if (seis && seis.id !== normal?.id) opciones.push({ clave: 'seis', nombre: '6 cuotas', cuenta: seis.id, pct: pctDe(gnSeis, reglas) })
      if (promo && promo.id !== normal?.id) opciones.push({ clave: 'promo', nombre: 'Promo del banco', cuenta: promo.id, pct: pctDe(gnPromo, reglas) })
      if (opciones.length > 1) forma.opciones = opciones.filter((o) => o.cuenta)
    }
    out.push(forma)
  }
  // Las que sólo tiene el ERP.
  const unica = (m) => cuentas.find((c) => c.medio === m)
  const cc = unica('cuenta')
  if (cc) out.push({ clave: 'cuenta', nombre: 'Queda debiendo', cuenta: cc.id, pct: 0, rutas: {} })
  const en = unica('entrega')
  if (en) out.push({ clave: 'entrega', nombre: 'Contraentrega', cuenta: en.id, pct: 0, rutas: rutasDe('entrega') })
  return out
}

/**
 * Las cuentas que ⛔ son de ninguna forma de arriba: lo que va en «Más».
 * @param {{ formas: any[], cuentas: any[], reglas?: any }} d
 */
export function cuentasSueltas({ formas, cuentas, reglas = null }) {
  const usadas = new Set(formas.flatMap((f) => [f.cuenta, ...(f.opciones ?? []).map((o) => o.cuenta)]).filter(Boolean))
  // ERP sin CG: la transferencia a un particular ⛔ se ofrece (la cuenta real dice adónde fue).
  const gerencia = new Set(transferenciasDeGerencia(reglas))
  // El cheque ⛔ paga una venta: entra por «Cobrar» (motor sql/079).
  return cuentas.filter((c) => !usadas.has(c.id) && c.medio !== 'saldo' && c.medio !== 'cheque' && !(c.gn_cuenta_id != null && gerencia.has(Number(c.gn_cuenta_id))))
}

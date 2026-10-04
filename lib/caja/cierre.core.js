// Caja — el cierre de turno (plan v2, W3, 4-oct-2026): lo que cobró la Caja en un turno, por cuenta
// de GN, para cruzarlo con el arqueo del turno de Gestión Nube.
//
// 🔑 EL TURNO SE SIGUE ABRIENDO Y CERRANDO EN GN (Bruno, 4-oct). La API de GN ⛔ tiene turnos (medido:
// ninguna de sus 27 rutas), así que la Caja ⛔ los puede abrir ni cerrar. El arqueo de GN junta
// `fondo + cobros − pagos` POR CUENTA, y un cobro de otro usuario (la Caja manda como «Areben
// Comercial SRL», la cajera abre como «Atencion al Cliente Zattia») entró al turno igual (#29981 en el
// #8286, 3-oct) ⇒ junta por CUENTA y HORARIO, ⛔ por usuario. 🟡 Falta verlo con una venta de la Caja.
//
// 🔑 LA HORA QUE CUENTA ES LA DE GN (`en_gn_en`), ⛔ la del cobro en la Caja: el cobro nace en GN cuando
// llega el POST. Una transferencia que espera el pago, o una venta que GN rebotó, cae en el turno que
// esté abierto CUANDO llega ⇒ las que todavía ⛔ están en GN se listan aparte: el arqueo ⛔ las tiene.

const exigir = (cond, msg) => { if (!cond) throw new Error(msg) }
const centavos = (n) => Math.round(n * 100) / 100
const enRango = (iso, desde, hasta) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= desde && t < hasta
}

/** Los estados de una venta cobrada que todavía ⛔ está en GN (los de `api/_caja.js`, + la que espera). */
const SIN_GN = ['borrador', 'enviando', 'error', 'esperando_pago']

/**
 * @param {{ ventas: any[], desde: string, hasta: string, nombres: Record<string, string> }} args
 *   `ventas`: filas de `caja_venta` (estado, pagos, total, creada_en, en_gn_en, gn_number, id).
 *   `nombres`: id de cuenta ⇒ el nombre en GN (el del arqueo). Obligatorio, puede venir vacío.
 * @returns {{ porCuenta: { cuenta: number, nombre: string, monto: number, ventas: number }[], total: number, ventas: number, sinGN: { id: string, estado: string, total: number, creada_en: string }[] }}
 */
export function cierreDeTurno({ ventas, desde, hasta, nombres }) {
  exigir(Array.isArray(ventas), 'Faltan las ventas')
  exigir(nombres && typeof nombres === 'object', 'Faltan los nombres de las cuentas')
  const d = Date.parse(desde), h = Date.parse(hasta)
  exigir(Number.isFinite(d) && Number.isFinite(h), 'Desde y hasta tienen que ser fechas')
  exigir(h > d, 'El turno termina antes de empezar')

  const por = new Map()
  let total = 0, n = 0
  const sinGN = []
  for (const v of ventas) {
    if (v.estado === 'en_gn') {
      if (!enRango(v.en_gn_en, d, h)) continue
      n++
      for (const p of v.pagos || []) {
        const cuenta = Number(p.cuenta)
        const monto = Number(p.monto)
        if (!(cuenta > 0) || !Number.isFinite(monto)) continue
        const fila = por.get(cuenta) || { cuenta, nombre: nombres[cuenta] || `Cuenta ${cuenta}`, monto: 0, ventas: 0 }
        fila.monto = centavos(fila.monto + monto)
        fila.ventas++
        por.set(cuenta, fila)
        total = centavos(total + monto)
      }
    } else if (SIN_GN.includes(v.estado) && enRango(v.creada_en, d, h)) {
      sinGN.push({ id: v.id, estado: v.estado, total: Number(v.total), creada_en: v.creada_en })
    }
    // `cancelada`: esperaba la transferencia y ⛔ llegó ⇒ ⛔ se cobró.
  }
  const porCuenta = [...por.values()].sort((a, b) => b.monto - a.monto || a.cuenta - b.cuenta)
  sinGN.sort((a, b) => Date.parse(a.creada_en) - Date.parse(b.creada_en))
  return { porCuenta, total, ventas: n, sinGN }
}

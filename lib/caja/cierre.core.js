// Caja — el TURNO PROPIO (plan v2, W3, 4-oct-2026): qué cobró la Caja en el turno, por cuenta, y
// cuánto efectivo tiene que haber en el cajón al cerrarlo.
//
// 🔑 EL TURNO VIVE EN LA CAJA (Bruno, 4-oct): la API de GN ⛔ tiene turnos, y si todos los cobros pasan
// por la Caja, la Caja ordena los pagos del turno. El turno de GN se deja de usar. Un día puede tener
// dos turnos. Una venta es del turno donde se COBRÓ (`caja_venta.turno_id`), ⛔ de cuando llegó a GN.
//
// 🔑 SE CUENTA SÓLO EL EFECTIVO (Bruno, 4-oct): `esperado = fondo + cobrado en efectivo + aportes − salidas`.
// Tarjeta y transferencia se muestran como total. Una cuenta es de efectivo si su regla dice
// `efectivo: true` (Efectivo 12921 y Feria - Efectivo 25867, `caja_config`).
//
// - `esperando_pago` (la transferencia todavía ⛔ llegó a MP) ⛔ suma: se lista aparte. Si llega,
//   suma al turno donde se cobró. 🔴 SALVO su parte en EFECTIVO (auditoría A2, 11-oct): ese billete
//   ya está en el cajón ⇒ suma al esperado (`efectivo.deEspera`). Si la venta se cancela, deja de sumar
//   y la cajera lo devuelve.
// - `cancelada` ⛔ se cobró nunca.
// - Las cobradas que todavía ⛔ están en GN (`borrador`, `enviando`, `error`) SÍ suman: la clienta
//   pagó. Se listan aparte porque GN las tiene que recibir igual.
//
// 🔑 LOS COBROS DE GN (v2, W3b, Bruno 4-oct): el pedido web que se paga al retirar se cobra EN GN, a
// mano (la API ⛔ deja agregarle un pago a una venta que ya existe: medido en la doc el 4-oct). La plata
// queda en el cajón ⇒ el turno lee de GN el efectivo que ENTRÓ COMO COBRO, ⛔ como venta en el local, y
// lo suma al esperado. Va al turno por la HORA en que se cargó el cobro (`payments[].created_at`).

const exigir = (cond, msg) => { if (!cond) throw new Error(msg) }
const centavos = (n) => Math.round(n * 100) / 100

/** Canal «Mi Local» de GN: la venta presencial (el POS de GN). ⛔ es un cobro de pedido. */
const CANAL_PRESENCIAL = 3
/** El `integration_source` de las ventas de la Caja: ya suman por `caja_venta`. */
const FUENTE_CAJA = 'monitor-caja'

const ESPERA = 'esperando_pago'
const SIN_GN = ['borrador', 'enviando', 'error']

/**
 * @param {{ turno: { fondo: number }, ventas: any[], movs: { tipo?: string, monto: number, anulado_en?: string | null }[], reglas: { cuentas: Record<string, { nombre: string, efectivo?: boolean }> }, nombres: Record<string, string>, cobrosGN: { monto: number, en: string }[] | null, anuladasGN: string[] | null }} args
 *   `ventas`: las filas de `caja_venta` DEL turno (estado, pagos, total, creada_en, id, a_mano).
 *   `movs`: los movimientos del turno (`caja_turno_mov`): `salida` resta, `aporte` suma (B4), el anulado ⛔ cuenta.
 *   `nombres`: id de cuenta ⇒ el nombre a mostrar. Obligatorio, puede venir vacío (cae al de la regla).
 *   `cobrosGN`: lo de `cobrosDeGN`, o `null` si GN ⛔ contestó (⛔ suman, y el resumen lo dice).
 *   `anuladasGN`: los ids de las ventas que GN ya ⛔ tiene (`anuladasEnGN`, A12), o `null` si ⛔ se pudo mirar.
 */
export function resumenTurno({ turno, ventas, movs, reglas, nombres, cobrosGN, anuladasGN }) {
  exigir(turno && Number.isFinite(Number(turno.fondo)), 'Falta el turno con su fondo')
  exigir(Array.isArray(ventas), 'Faltan las ventas del turno')
  exigir(Array.isArray(movs), 'Faltan los movimientos del turno')
  exigir(reglas && reglas.cuentas, 'Faltan las reglas de la caja')
  exigir(nombres && typeof nombres === 'object', 'Faltan los nombres de las cuentas')
  exigir(cobrosGN === null || Array.isArray(cobrosGN), 'Faltan los cobros de GN (null si ⛔ se pudieron leer)')
  exigir(anuladasGN === null || Array.isArray(anuladasGN), 'Faltan las anuladas en GN (null si ⛔ se pudo mirar)')

  const anuladas = new Set((anuladasGN || []).map(String))
  const por = new Map()
  let total = 0, n = 0, cobradoEfectivo = 0, deEspera = 0
  const esperando = [], sinGN = [], enGNAnuladas = []
  const aMano = { ventas: 0, venta: 0, prendas: 0, precios: 0 }
  for (const v of ventas) {
    // `descartada` (B2): GN la rechazó y se resolvió que ⛔ se cobró. Como la cancelada, ⛔ suma.
    if (v.estado === 'cancelada' || v.estado === 'descartada') continue
    const corto = { id: v.id, estado: v.estado, total: Number(v.total), creada_en: v.creada_en, gn_number: v.gn_number ?? null }
    if (v.estado === ESPERA) {
      esperando.push(corto)
      for (const p of v.pagos || []) {
        const regla = reglas.cuentas[Number(p.cuenta)]
        if (regla && regla.efectivo && Number.isFinite(Number(p.monto))) deEspera = centavos(deEspera + Number(p.monto))
      }
      continue
    }
    // 🔴 A12 (11-oct): la venta anulada A MANO en GN —GN la ELIMINA, ⛔ tiene estado— deja de sumar: la
    // plata se devolvió. Se lista aparte para que se vea.
    if (v.estado === 'en_gn' && anuladas.has(String(v.id))) {
      enGNAnuladas.push(corto)
      continue
    }
    if (SIN_GN.includes(v.estado)) sinGN.push(corto)
    n++
    // B5 (Bruno, 11-oct): el descuento a mano y el cambio de precio son libres, pero quedan A LA VISTA.
    const am = v.a_mano
    if (am && (Number(am.venta) > 0 || Number(am.prendas) > 0 || Number(am.precios) > 0)) {
      aMano.ventas++
      aMano.venta = centavos(aMano.venta + (Number(am.venta) || 0))
      aMano.prendas = centavos(aMano.prendas + (Number(am.prendas) || 0))
      aMano.precios = centavos(aMano.precios + (Number(am.precios) || 0))
    }
    for (const p of v.pagos || []) {
      const cuenta = Number(p.cuenta)
      const monto = Number(p.monto)
      if (!(cuenta > 0) || !Number.isFinite(monto)) continue
      const regla = reglas.cuentas[cuenta]
      const efectivo = !!(regla && regla.efectivo)
      const fila = por.get(cuenta) || { cuenta, nombre: nombres[cuenta] || (regla && regla.nombre) || `Cuenta ${cuenta}`, efectivo, monto: 0, cobros: 0 }
      fila.monto = centavos(fila.monto + monto)
      fila.cobros++
      por.set(cuenta, fila)
      total = centavos(total + monto)
      if (efectivo) cobradoEfectivo = centavos(cobradoEfectivo + monto)
    }
  }
  const fondo = centavos(Number(turno.fondo))
  const vivos = movs.filter((m) => !m.anulado_en)
  const suma = (tipo) => centavos(vivos.filter((m) => (m.tipo || 'salida') === tipo).reduce((s, m) => s + Number(m.monto), 0))
  const sal = suma('salida')
  const apo = suma('aporte')
  const deGN = centavos((cobrosGN || []).reduce((s, c) => s + Number(c.monto), 0))
  const porCuenta = [...por.values()].sort((a, b) => Number(b.efectivo) - Number(a.efectivo) || b.monto - a.monto || a.cuenta - b.cuenta)
  const porHora = (a, b) => Date.parse(a.creada_en) - Date.parse(b.creada_en)
  return {
    porCuenta, total, ventas: n,
    efectivo: { fondo, cobrado: cobradoEfectivo, deEspera, cobradoGN: deGN, aportes: apo, salidas: sal, esperado: centavos(fondo + cobradoEfectivo + deEspera + deGN + apo - sal) },
    cobrosGN: cobrosGN ? [...cobrosGN].sort((a, b) => Date.parse(a.en) - Date.parse(b.en)) : null,
    anuladasGN: anuladasGN === null ? null : enGNAnuladas.sort(porHora),
    aMano,
    esperando: esperando.sort(porHora),
    sinGN: sinGN.sort(porHora),
  }
}

/**
 * Las ventas de la Caja que GN ya ⛔ tiene (A12, 11-oct): GN ⛔ anula por API y una venta anulada a mano
 * desaparece de `ventas/obtener` —⛔ viene con un estado—. Se comparan las `en_gn` del turno contra las
 * de GN de SUS días. 🔴 Sólo con los días leídos ENTEROS: leído a medias, una venta que ⛔ vino ⛔ es una
 * anulada (quien llama devuelve `null` y el cierre frena, como con los cobros).
 * @param {{ ventas: Array<{ id: string, estado: string, gn_sale_id?: number | null }>, idsGN: Iterable<number> }} args
 * @returns {string[]}
 */
export function anuladasEnGN({ ventas, idsGN }) {
  exigir(Array.isArray(ventas), 'Faltan las ventas del turno')
  const hay = new Set([...(idsGN || [])].map(Number))
  return ventas.filter((v) => v.estado === 'en_gn' && Number(v.gn_sale_id) > 0 && !hay.has(Number(v.gn_sale_id))).map((v) => String(v.id))
}

/**
 * La hora de un cobro de GN. GN la da SIN zona (`2026-10-03 13:52:40`) y es la de Argentina (UTC−3,
 * sin horario de verano): el cobro de la #29981 se cargó a las 13:52 en el local (Bruno, 4-oct).
 */
export function horaDeGN(s) {
  const t = String(s || '').trim()
  if (!t) return NaN
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(t)) return Date.parse(t)
  return Date.parse(t.replace(' ', 'T') + '-03:00')
}

/**
 * Los cobros en efectivo cargados en GN dentro del turno que ⛔ son de una venta presencial.
 * @param {{ ventas: any[], desde: string, hasta: string, cuentas: number[] }} args
 *   `ventas`: filas de `GET /ventas?include_payments=1`. `desde`/`hasta`: el turno (ISO).
 *   `cuentas`: las de efectivo (`efectivo: true` en las reglas).
 */
export function cobrosDeGN({ ventas, desde, hasta, cuentas }) {
  exigir(Array.isArray(ventas), 'Faltan las ventas de GN')
  const d = Date.parse(desde), h = Date.parse(hasta)
  exigir(Number.isFinite(d) && Number.isFinite(h), 'Falta el horario del turno')
  exigir(Array.isArray(cuentas), 'Faltan las cuentas de efectivo')
  const deEfectivo = new Set(cuentas.map(Number))
  const vistos = new Set(), out = []
  for (const v of ventas) {
    if (!v || v.integration_source === FUENTE_CAJA || Number(v.channel_id) === CANAL_PRESENCIAL) continue
    for (const p of v.payments || []) {
      if (!deEfectivo.has(Number(p.account_id)) || vistos.has(p.id)) continue
      const en = horaDeGN(p.created_at)
      if (!(en >= d && en < h)) continue
      const monto = Number(p.amount)
      if (!Number.isFinite(monto)) continue
      vistos.add(p.id)
      out.push({
        id: p.id, venta: v.number ?? null, tn: v.tn_order || null, cliente: v.client_name || null,
        cuenta: Number(p.account_id), monto: centavos(monto), en: new Date(en).toISOString(),
      })
    }
  }
  return out
}

/** La diferencia del cierre: positiva = sobra, negativa = falta. */
export function diferencia(contado, esperado) {
  exigir(Number.isFinite(contado) && contado >= 0, 'El efectivo contado tiene que ser un número (0 o más)')
  exigir(Number.isFinite(esperado), 'Falta el efectivo esperado')
  return centavos(contado - esperado)
}

/** Quién es una cuenta para el turno: el mail del padrón (⛔ cambia), si ⛔ tiene, el nombre. El perfil ⛔ trae el usuario de login. */
export function usuarioDe(perfil) {
  const u = perfil && (perfil.email || perfil.name)
  return u ? String(u).trim().toLowerCase() : null
}

/**
 * ¿Esta cuenta puede usar el POS del turno? 🔑 Sólo la que abrió la caja (Bruno, 5-oct), ⛔ ni un admin.
 * Lo preguntan la pantalla (`/pos`) y el servidor (`confirmar`, `contar`): sin el servidor, la regla
 * se salta con `curl`. Un turno abierto antes de la fase C (sin `abierto_por_usuario`) se compara por el nombre.
 * @param {{ abierto_por?: string | null, abierto_por_usuario?: string | null } | null} turno
 * @param {{ name?: string, email?: string | null } | null} perfil
 */
export function puedeUsarPOS(turno, perfil) {
  if (!turno || !perfil) return false
  if (turno.abierto_por_usuario) return usuarioDe(perfil) === String(turno.abierto_por_usuario).trim().toLowerCase()
  return !!perfil.name && turno.abierto_por === perfil.name
}

/**
 * 🔑 A8 (Bruno, 11-oct): ¿quién carga una salida o un aporte de efectivo? **La cuenta que abrió el turno y
 * los admins** — antes, cualquiera con permiso de Caja: otra cuenta podía tapar un faltante. Lo preguntan
 * la pantalla y el servidor.
 * @param {any} turno @param {any} perfil @param {boolean} admin
 */
export function puedeMoverEfectivo(turno, perfil, admin) {
  return !!turno && (admin === true || puedeUsarPOS(turno, perfil))
}

/**
 * ¿Quién anula un movimiento (B4)? Un admin, o la MISMA cuenta que lo cargó si es la dueña del turno.
 * Anular un aporte baja lo esperado: si cualquiera pudiera, tapaba un faltante igual que una salida.
 * @param {{ usuario_cuenta?: string | null, usuario?: string | null }} mov @param {any} turno @param {any} perfil @param {boolean} admin
 */
export function puedeAnularMov(mov, turno, perfil, admin) {
  if (admin === true) return true
  if (!mov || !puedeUsarPOS(turno, perfil)) return false
  if (mov.usuario_cuenta) return usuarioDe(perfil) === String(mov.usuario_cuenta).trim().toLowerCase()
  return !!perfil.name && mov.usuario === perfil.name
}

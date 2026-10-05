// Caja — el TURNO PROPIO (plan v2, W3, 4-oct-2026): qué cobró la Caja en el turno, por cuenta, y
// cuánto efectivo tiene que haber en el cajón al cerrarlo.
//
// 🔑 EL TURNO VIVE EN LA CAJA (Bruno, 4-oct): la API de GN ⛔ tiene turnos, y si todos los cobros pasan
// por la Caja, la Caja ordena los pagos del turno. El turno de GN se deja de usar. Un día puede tener
// dos turnos. Una venta es del turno donde se COBRÓ (`caja_venta.turno_id`), ⛔ de cuando llegó a GN.
//
// 🔑 SE CUENTA SÓLO EL EFECTIVO (Bruno, 4-oct): `esperado = fondo + cobrado en efectivo − salidas`.
// Tarjeta y transferencia se muestran como total. Una cuenta es de efectivo si su regla dice
// `efectivo: true` (Efectivo 12921 y Feria - Efectivo 25867, `caja_config`).
//
// - `esperando_pago` (la transferencia todavía ⛔ llegó a MP) ⛔ suma: se lista aparte. Si llega,
//   suma al turno donde se cobró.
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
 * @param {{ turno: { fondo: number }, ventas: any[], salidas: { monto: number }[], reglas: { cuentas: Record<string, { nombre: string, efectivo?: boolean }> }, nombres: Record<string, string>, cobrosGN: { monto: number, en: string }[] | null }} args
 *   `ventas`: las filas de `caja_venta` DEL turno (estado, pagos, total, creada_en, id).
 *   `nombres`: id de cuenta ⇒ el nombre a mostrar. Obligatorio, puede venir vacío (cae al de la regla).
 *   `cobrosGN`: lo de `cobrosDeGN`, o `null` si GN ⛔ contestó (⛔ suman, y el resumen lo dice).
 */
export function resumenTurno({ turno, ventas, salidas, reglas, nombres, cobrosGN }) {
  exigir(turno && Number.isFinite(Number(turno.fondo)), 'Falta el turno con su fondo')
  exigir(Array.isArray(ventas), 'Faltan las ventas del turno')
  exigir(Array.isArray(salidas), 'Faltan las salidas del turno')
  exigir(reglas && reglas.cuentas, 'Faltan las reglas de la caja')
  exigir(nombres && typeof nombres === 'object', 'Faltan los nombres de las cuentas')
  exigir(cobrosGN === null || Array.isArray(cobrosGN), 'Faltan los cobros de GN (null si ⛔ se pudieron leer)')

  const por = new Map()
  let total = 0, n = 0, cobradoEfectivo = 0
  const esperando = [], sinGN = []
  for (const v of ventas) {
    if (v.estado === 'cancelada') continue
    const corto = { id: v.id, estado: v.estado, total: Number(v.total), creada_en: v.creada_en }
    if (v.estado === ESPERA) { esperando.push(corto); continue }
    if (SIN_GN.includes(v.estado)) sinGN.push(corto)
    n++
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
  const sal = centavos(salidas.reduce((s, m) => s + Number(m.monto), 0))
  const deGN = centavos((cobrosGN || []).reduce((s, c) => s + Number(c.monto), 0))
  const porCuenta = [...por.values()].sort((a, b) => Number(b.efectivo) - Number(a.efectivo) || b.monto - a.monto || a.cuenta - b.cuenta)
  const porHora = (a, b) => Date.parse(a.creada_en) - Date.parse(b.creada_en)
  return {
    porCuenta, total, ventas: n,
    efectivo: { fondo, cobrado: cobradoEfectivo, cobradoGN: deGN, salidas: sal, esperado: centavos(fondo + cobradoEfectivo + deGN - sal) },
    cobrosGN: cobrosGN ? [...cobrosGN].sort((a, b) => Date.parse(a.en) - Date.parse(b.en)) : null,
    esperando: esperando.sort(porHora),
    sinGN: sinGN.sort(porHora),
  }
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

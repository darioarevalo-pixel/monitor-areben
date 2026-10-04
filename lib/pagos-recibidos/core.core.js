/**
 * Pagos recibidos: lo que entró a la cuenta de Mercado Pago del local, leído de la API de MP.
 *
 * Es JS plano porque lo importa `api/_pagos-recibidos.js`, que corre en Node sin pasar por el
 * compilador de Next (mismo motivo que `lib/permisos.core.js`).
 *
 * ## Para qué existe
 *
 * Contra la estafa de la app falsa: la clienta muestra en su teléfono un comprobante que no es
 * real. La empleada ⛔ mira el teléfono de la clienta: mira esta lista, que sale de Mercado Pago.
 * La empleada ⛔ tiene acceso a la app de MP ni ve el saldo.
 *
 * ## Lo que se midió en la cuenta de Zattia (2-oct-2026, 300 pagos del 18-sep al 2-oct)
 *
 * - 235 `money_transfer` + `account_money`: transferencia desde otra cuenta de MP.
 * - 58 `account_fund` + `cvu`: transferencia desde otro banco al alias/CVU. ⚠️ En éstas el
 *   `payer` es el DUEÑO de la cuenta, no quien pagó.
 * - Unos pocos `money_transfer` con tarjeta (visa, master, cabal, consumer_credits, debin).
 * - 🔑 **MP no da el nombre de quien transfiere.** En `money_transfer` vienen id, mail y CUIT del que
 *   paga; ⛔ se mandan al navegador (no hacen falta para verificar un cobro y son datos personales).
 * - Las horas vienen en UTC-4 (`-04:00`), no en hora argentina: se convierten con `Date.parse`.
 */

/** Argentina no cambia la hora desde 2009 (mismo criterio que `diaArgentino`). */
const OFFSET_AR = '-03:00'

/**
 * El rango de un día argentino, como lo pide `/v1/payments/search` (`begin_date`/`end_date`).
 * `dia` es `YYYY-MM-DD`.
 */
export function rangoDelDia(dia) {
  return {
    begin_date: `${dia}T00:00:00.000${OFFSET_AR}`,
    end_date: `${dia}T23:59:59.999${OFFSET_AR}`,
  }
}

export function esDiaValido(dia) {
  return typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(Date.parse(`${dia}T00:00:00Z`))
}

/** De dónde vino la plata, en palabras del local. */
export function origenDe(p) {
  if (p.operation_type === 'account_fund' || p.payment_method_id === 'cvu') return 'banco'
  if (p.payment_type_id === 'credit_card' || p.payment_type_id === 'debit_card' || p.payment_type_id === 'prepaid_card') return 'tarjeta'
  if (p.payment_method_id === 'account_money') return 'mp'
  return 'otro'
}

/**
 * Los pagos que se muestran, ya limpios.
 *
 * 🔴 **Sólo lo que entró y está aprobado.** Lo que sale de la cuenta (`collector_id` ≠ la cuenta) no
 * es un cobro, y uno `pending`/`rejected` ⛔ es plata en la cuenta: mostrarlo como cobro es
 * justamente el error que esta sección existe para evitar. Un `refunded` (devuelto) tampoco suma:
 * se informa aparte para que el total cierre contra la caja.
 *
 * ⛔ No viaja ningún dato de quien pagó: monto, hora, origen y el número de operación.
 */
export function limpiarPagos(resultados, cuenta) {
  const pagos = []
  const devueltos = []
  for (const p of resultados || []) {
    if (!p || p.id == null) continue
    // En una transferencia que SALE, MP no manda `collector_id` sino `collector.id` (el de la otra
    // cuenta): se miran los dos. Medido el 2-oct-2026 con un envío de $437.016.
    const cobrador = p.collector_id ?? (p.collector && p.collector.id)
    if (cuenta != null && Number(cobrador) !== cuenta) continue
    const fila = {
      id: String(p.id),
      monto: Number(p.transaction_amount) || 0,
      cuando: p.date_approved || p.date_created,
      origen: origenDe(p),
    }
    if (p.status === 'approved') pagos.push(fila)
    else if (p.status === 'refunded' || p.status === 'charged_back') devueltos.push(fila)
  }
  const porFecha = (a, b) => Date.parse(b.cuando) - Date.parse(a.cuando)
  pagos.sort(porFecha)
  devueltos.sort(porFecha)
  return { pagos, devueltos }
}

export function totalDe(pagos) {
  return Math.round(pagos.reduce((s, p) => s + p.monto, 0) * 100) / 100
}

/**
 * En qué cuentas buscar los pagos de un día, según cuándo se puso cada una (`mp_cuenta_uso`).
 *
 * Cada local cobra en UNA cuenta a la vez, pero cuál lo deciden Darío y Bruno y cambia. Un día
 * se busca en toda cuenta que estuvo en uso en algún momento de ese día: el día del cambio son
 * las dos, la vieja hasta la hora del cambio y la nueva desde ahí.
 *
 * 🔑 **Antes del primer uso registrado se busca en la primera cuenta.** La sección nació con la
 * cuenta que el local ya venía usando: sin esta regla, los días anteriores a cargarla saldrían
 * vacíos, y ésos son justamente los que Darío quiere comparar con el cierre de caja.
 *
 * `usos`: `[{ cuenta_id, desde }]` en cualquier orden. Devuelve los `cuenta_id`, sin repetir.
 */
export function cuentasDelDia(usos, dia) {
  const orden = [...(usos || [])].sort((a, b) => Date.parse(a.desde) - Date.parse(b.desde))
  if (!orden.length) return []
  const { begin_date, end_date } = rangoDelDia(dia)
  const ini = Date.parse(begin_date)
  const fin = Date.parse(end_date)
  const ids = []
  orden.forEach((u, i) => {
    const desde = i === 0 ? -Infinity : Date.parse(u.desde)
    const hasta = i + 1 < orden.length ? Date.parse(orden[i + 1].desde) : Infinity
    if (desde <= fin && hasta > ini && !ids.includes(Number(u.cuenta_id))) ids.push(Number(u.cuenta_id))
  })
  return ids
}

/** Cómo se llama una cuenta, con lo que devuelve `GET /users/me` de MP. */
export function nombreDeCuenta(yo) {
  const titular = [yo.first_name, yo.last_name].filter(Boolean).join(' ').trim()
  const apodo = String(yo.nickname || '').trim()
  return [apodo, titular && `(${titular})`].filter(Boolean).join(' ') || `Cuenta ${yo.id}`
}

/**
 * Cuánto antes de confirmar la venta se acepta una transferencia: la clienta a veces transfiere
 * apenas oye el total, antes de que la cajera apriete Confirmar. Ésas ⛔ se confirman solas: se
 * ofrecen para que elija la cajera.
 */
export const VENTANA_ANTES_MS = 10 * 60 * 1000;

/**
 * El cruce de la Caja (F5): ¿llegó la transferencia de esta venta?
 *
 * 🔑 **Por el monto EXACTO** (a centavos) y sólo pagos que ya están limpios (`limpiarPagos`:
 * aprobados y que entraron a la cuenta). Un pago que ya confirmó otra venta (`reclamados`) ⛔ cuenta.
 *
 * Se confirma SOLA sólo si no hay duda: UN pago posterior a la venta (`desde`) y ninguna otra venta
 * esperando el mismo monto (`competidoras`). Con cualquier duda —dos pagos, dos ventas, o uno que
 * llegó en los 10 minutos antes— elige la cajera entre los `candidatos`; ⛔ se adivina.
 *
 * `elegido` es el id del pago que tocó la cajera: tiene que ser uno de los candidatos.
 *
 * @param {{ monto: number, desde: string, pagos: Array<{ id: string, monto: number, cuando: string, origen: string }>, reclamados: Iterable<string>, competidoras: number, elegido?: string | null }} args
 * @returns {{ estado: 'llego', pago: any, por: 'solo' | 'cajera' } | { estado: 'elegir', candidatos: any[], motivo: string } | { estado: 'esperando' } | { estado: 'invalido', motivo: string }}
 */
export function cruzarTransferencia({ monto, desde, pagos, reclamados, competidoras, elegido }) {
  const enCentavos = (n) => Math.round(Number(n) * 100);
  const objetivo = enCentavos(monto);
  const t0 = Date.parse(desde);
  if (!(objetivo > 0) || !Number.isFinite(t0)) throw new Error('Cruce: faltan el monto o la hora de la venta');
  const usados = new Set([...(reclamados || [])].map(String));
  const candidatos = (pagos || [])
    .filter((p) => enCentavos(p.monto) === objetivo && !usados.has(String(p.id)) && Date.parse(p.cuando) >= t0 - VENTANA_ANTES_MS)
    .sort((a, b) => Date.parse(a.cuando) - Date.parse(b.cuando));

  if (elegido != null && elegido !== '') {
    const pago = candidatos.find((p) => p.id === String(elegido));
    return pago
      ? { estado: 'llego', pago, por: 'cajera' }
      : { estado: 'invalido', motivo: 'Ese pago ya no está disponible: lo tomó otra venta o no es de este monto.' };
  }
  if (!candidatos.length) return { estado: 'esperando' };
  const posteriores = candidatos.filter((p) => Date.parse(p.cuando) >= t0);
  if (posteriores.length === 1 && !(competidoras > 0)) return { estado: 'llego', pago: posteriores[0], por: 'solo' };
  const motivo = competidoras > 0
    ? 'Hay otra venta esperando el mismo monto: elegí cuál es el pago de ésta.'
    : posteriores.length > 1
      ? 'Llegó más de una transferencia de este monto: elegí la de esta clienta.'
      : 'Hay una transferencia de este monto de unos minutos ANTES de la venta: confirmala sólo si es de esta clienta.';
  return { estado: 'elegir', candidatos, motivo };
}

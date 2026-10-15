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
 * 🔴 **Sólo transferencias** (15-oct-2026, Darío): *«en los locales solo reciben transferencias»*.
 * La cuenta de Areben (BDI) recibe además las ventas de la tienda online y de Mercado Libre
 * (`regular_payment`), los cobros de envíos y hasta pagos a Facebook: medido ese día, 148
 * movimientos en 7 días y ninguna transferencia. Mostrarlos tapaba los cobros del local y, peor, la
 * Caja podía tomar una venta online como la transferencia de una venta del mostrador.
 * `money_transfer` = desde otra cuenta de MP (aunque la paguen con tarjeta); `account_fund` = desde otro banco.
 */
const TRANSFERENCIAS = new Set(['money_transfer', 'account_fund'])

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
    if (!TRANSFERENCIAS.has(p.operation_type)) continue
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
 * Hasta cuánto DESPUÉS de confirmar la venta un pago todavía se toma SOLO (auditoría A5, 11-oct). Los
 * totales van redondeados a $100 y MP ⛔ dice quién transfiere: una transferencia AJENA del mismo monto
 * que entra horas después confirmaba sola. La clienta transfiere con la cajera delante; pasado esto, el
 * pago se ofrece para que la cajera lo compare con el comprobante (hora y número de operación).
 */
export const VENTANA_SOLA_MS = 15 * 60 * 1000;

/**
 * Cuánto de más o de menos puede llegar una transferencia y confirmar igual la venta (Bruno, 12-oct):
 * el redondeo de la clienta. GN recibe el TOTAL de la venta; la diferencia queda en `mp_diferencia`.
 */
export const TOLERANCIA_TRANSFERENCIA = 100;

/** ¿El pago cae dentro de la tolerancia del monto esperado? En centavos, para ⛔ errar por el float. */
export function dentroDeTolerancia(monto, objetivo) {
  return Math.abs(Math.round(Number(monto) * 100) - Math.round(Number(objetivo) * 100)) <= TOLERANCIA_TRANSFERENCIA * 100;
}

/** Lo que llegó menos lo que se esperaba, en pesos con centavos (negativo = transfirió de menos). */
export const diferenciaDe = (monto, objetivo) => (Math.round(Number(monto) * 100) - Math.round(Number(objetivo) * 100)) / 100;

/**
 * El cruce de la Caja (F5): ¿llegó la transferencia de esta venta?
 *
 * 🔑 **Por el monto, con `TOLERANCIA_TRANSFERENCIA` de redondeo** (Bruno, 12-oct; antes era a centavos) y
 * sólo pagos que ya están limpios (`limpiarPagos`: aprobados y que entraron a la cuenta). Un pago que ya
 * confirmó otra venta (`reclamados`) ⛔ cuenta. Cada candidato lleva su `diferencia`.
 *
 * Se confirma SOLA sólo si no hay duda: UN pago posterior a la venta (`desde`), llegado dentro de los
 * `VENTANA_SOLA_MS` (A5), y ninguna otra venta esperando un monto parecido (`competidoras`). Si llegó uno
 * EXACTO, los que sólo caen en la tolerancia ⛔ cuentan como duda: el exacto gana. Con cualquier duda
 * —dos pagos, dos ventas, uno que llegó en los 10 minutos antes o uno que llegó TARDE— elige la cajera
 * entre los `candidatos`; ⛔ se adivina.
 *
 * `elegido` es el id del pago que tocó la cajera: tiene que ser uno de los candidatos.
 *
 * `antesManual` (ms, obligatorio): hasta cuánto ANTES de la venta un pago todavía se OFRECE para
 * elegir (auditoría A4, 11-oct): la venta que se canceló porque la transferencia tardaba y se volvió a
 * escanear nace DESPUÉS del pago, y con sólo los 10 min ⛔ cruzaba nunca. Ésos ⛔ se confirman solos.
 *
 * @param {{ monto: number, desde: string, pagos: Array<{ id: string, monto: number, cuando: string, origen: string }>, reclamados: Iterable<string>, competidoras: number, elegido?: string | null, antesManual: number }} args
 * @returns {{ estado: 'llego', pago: any, por: 'solo' | 'cajera' } | { estado: 'elegir', candidatos: any[], motivo: string } | { estado: 'esperando' } | { estado: 'invalido', motivo: string }}
 */
export function cruzarTransferencia({ monto, desde, pagos, reclamados, competidoras, elegido, antesManual }) {
  const objetivo = Number(monto);
  const t0 = Date.parse(desde);
  if (!(Math.round(objetivo * 100) > 0) || !Number.isFinite(t0)) throw new Error('Cruce: faltan el monto o la hora de la venta');
  if (!(Number.isFinite(antesManual) && antesManual >= 0)) throw new Error('Cruce: falta hasta cuánto antes de la venta se ofrece un pago (antesManual)');
  const usados = new Set([...(reclamados || [])].map(String));
  const candidatos = (pagos || [])
    .filter((p) => dentroDeTolerancia(p.monto, objetivo) && !usados.has(String(p.id)) && Date.parse(p.cuando) >= t0 - Math.max(VENTANA_ANTES_MS, antesManual))
    .map((p) => ({ ...p, diferencia: diferenciaDe(p.monto, objetivo) }))
    .sort((a, b) => Date.parse(a.cuando) - Date.parse(b.cuando));

  if (elegido != null && elegido !== '') {
    const pago = candidatos.find((p) => p.id === String(elegido));
    return pago
      ? { estado: 'llego', pago, por: 'cajera' }
      : { estado: 'invalido', motivo: 'Ese pago ya no está disponible: lo tomó otra venta o no es de este monto.' };
  }
  if (!candidatos.length) return { estado: 'esperando' };
  const despues = candidatos.filter((p) => Date.parse(p.cuando) >= t0);
  const exactos = despues.filter((p) => p.diferencia === 0);
  const posteriores = exactos.length ? exactos : despues;
  const tarde = posteriores.length === 1 && Date.parse(posteriores[0].cuando) > t0 + VENTANA_SOLA_MS;
  if (posteriores.length === 1 && !(competidoras > 0) && !tarde) return { estado: 'llego', pago: posteriores[0], por: 'solo' };
  const motivo = competidoras > 0
    ? 'Hay otra venta esperando un monto parecido: elegí cuál es el pago de ésta.'
    : posteriores.length > 1
      ? 'Llegó más de una transferencia de este monto: elegí la de esta clienta.'
      : tarde
        ? 'Llegó una transferencia de este monto, pero bastante después de la venta: confirmala sólo si la hora y el número de operación coinciden con el comprobante de la clienta.'
        : candidatos.some((p) => Date.parse(p.cuando) < t0 - VENTANA_ANTES_MS)
          ? 'Hay una transferencia de este monto de ANTES de la venta (mirá la hora): elegila sólo si es de esta clienta.'
          : 'Hay una transferencia de este monto de unos minutos ANTES de la venta: confirmala sólo si es de esta clienta.';
  return { estado: 'elegir', candidatos, motivo };
}

/**
 * Completar la venta con VARIOS pagos de MP (Bruno, 12-oct: «13.300 + 100»): la clienta transfirió de
 * menos y después mandó lo que faltaba. La cajera elige los pagos; la SUMA tiene que caer dentro de
 * `TOLERANCIA_TRANSFERENCIA` del monto esperado. Cada pago, como en el cruce: limpio, ⛔ reclamado por
 * otra venta, y ⛔ de antes de `antesManual`. ⛔ Se adivina: sólo los que eligió.
 * @param {{ monto: number, desde: string, pagos: Array<{ id: string, monto: number, cuando: string, origen: string }>, reclamados: Iterable<string>, elegidos: string[], antesManual: number }} args
 * @returns {{ estado: 'llego', pagos: any[], suma: number, diferencia: number } | { estado: 'invalido', motivo: string }}
 */
export function sumarCobros({ monto, desde, pagos, reclamados, elegidos, antesManual }) {
  const t0 = Date.parse(desde);
  if (!(Number(monto) > 0) || !Number.isFinite(t0)) throw new Error('Cobros: faltan el monto o la hora de la venta');
  if (!(Number.isFinite(antesManual) && antesManual >= 0)) throw new Error('Cobros: falta hasta cuánto antes de la venta se ofrece un pago (antesManual)');
  const ids = [...new Set((elegidos || []).map(String).filter(Boolean))];
  if (!ids.length) return { estado: 'invalido', motivo: 'Elegí los pagos que completan la venta.' };
  const usados = new Set([...(reclamados || [])].map(String));
  const elegibles = new Map((pagos || [])
    .filter((p) => !usados.has(String(p.id)) && Date.parse(p.cuando) >= t0 - Math.max(VENTANA_ANTES_MS, antesManual))
    .map((p) => [String(p.id), p]));
  const elegidosOk = ids.map((id) => elegibles.get(id));
  if (elegidosOk.some((p) => !p)) return { estado: 'invalido', motivo: 'Uno de los pagos ya no está disponible: lo tomó otra venta o es muy anterior a ésta.' };
  const suma = elegidosOk.reduce((s, p) => s + Math.round(Number(p.monto) * 100), 0) / 100;
  const diferencia = diferenciaDe(suma, monto);
  if (!dentroDeTolerancia(suma, monto)) {
    return { estado: 'invalido', motivo: diferencia < 0 ? `Faltan $${(-diferencia).toLocaleString('es-AR')} para completar la venta.` : `Los pagos pasan el total por $${diferencia.toLocaleString('es-AR')}.` };
  }
  return { estado: 'llego', pagos: elegidosOk.sort((a, b) => Date.parse(a.cuando) - Date.parse(b.cuando)), suma, diferencia };
}

/** Desde cuánto ANTES de la venta se muestran los últimos pagos mientras se valida (Bruno, 12-oct). */
export const VENTANA_RECIENTES_MS = 30 * 60 * 1000;

/**
 * Los últimos pagos que vio la cuenta de MP, para el paso «Confirmar transferencia» (Bruno, 12-oct): la
 * cajera ve qué entró y cuál es el de esta venta, y de ahí SUMA cobros cuando transfirió de menos
 * (`sumarCobros`). Lo que confirma un pago solo sigue siendo `cruzarTransferencia`. Desde
 * `VENTANA_RECIENTES_MS` antes de la venta, sin los pagos que ya tomó otra venta, el más nuevo primero, a
 * lo sumo `cuantos`; los que caen en la tolerancia del monto (`coincide`) entran SIEMPRE, aunque pasen
 * el tope. `diferencia` = el pago menos lo esperado.
 * @param {{ monto: number, desde: string, pagos: Array<{ id: string, monto: number, cuando: string, origen: string }>, reclamados: Iterable<string>, cuantos: number }} args
 * @returns {Array<{ id: string, monto: number, cuando: string, origen: string, coincide: boolean, diferencia: number }>}
 */
export function pagosRecientes({ monto, desde, pagos, reclamados, cuantos }) {
  const t0 = Date.parse(desde);
  if (!Number.isFinite(t0) || !(Number(monto) > 0)) throw new Error('Pagos recientes: faltan el monto o la hora de la venta');
  if (!(Number.isInteger(cuantos) && cuantos > 0)) throw new Error('Pagos recientes: falta cuántos mostrar');
  const usados = new Set([...(reclamados || [])].map(String));
  const todos = (pagos || [])
    .filter((p) => !usados.has(String(p.id)) && Date.parse(p.cuando) >= t0 - VENTANA_RECIENTES_MS)
    .map((p) => ({ id: String(p.id), monto: Number(p.monto), cuando: p.cuando, origen: p.origen, coincide: dentroDeTolerancia(p.monto, monto), diferencia: diferenciaDe(p.monto, monto) }))
    .sort((a, b) => Date.parse(b.cuando) - Date.parse(a.cuando));
  const otros = todos.filter((p) => !p.coincide).slice(0, Math.max(0, cuantos - todos.filter((p) => p.coincide).length));
  const quedan = new Set([...todos.filter((p) => p.coincide), ...otros].map((p) => p.id));
  return todos.filter((p) => quedan.has(p.id));
}

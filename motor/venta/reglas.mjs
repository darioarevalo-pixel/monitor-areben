/**
 * Las REGLAS COMERCIALES por forma de pago (❓ 15, `~/Documents/erp-monitor/reglas-comerciales.md`). Núcleo PURO: sin
 * base ni red. Lo usan el motor (`reglas-db.mjs`), la pantalla `erp › Reglas` y su simulador, y —parte 3— la Caja: todos
 * tienen que dar el MISMO número.
 *
 * 🔑 Bruno, 15/16-oct: la regla de la forma de pago «tiene que ser DINÁMICA según el fin comercial» ⇒ cada fin comercial
 * es una FILA (`regla_comercial`, sql/016), ⛔ una cuenta de GN. Lo que decidió (§5 del archivo):
 * - **Dos juegos**: «temporada» (las reglas sin campaña: valen siempre) y los de CADA CAMPAÑA. Mientras la campaña está
 *   prendida, sus reglas REEMPLAZAN a las de temporada en SUS prendas. Una campaña sin reglas ⇒ sus prendas siguen con
 *   las de temporada (BDI hoy: la oferta suma el % de la forma de pago).
 * - **Gana la MEJOR para la clienta**, ⛔ se suman: dos reglas que aplican a la misma prenda con la misma forma de pago
 *   (efectivo −15 % siempre + jeans efectivo −20 % ⇒ jeans −20 %, el resto −15 %).
 * - **Orden fijo**: el precio de campaña se arma ANTES (llega en el renglón) ⇒ promos y rebaja a mano ⇒ forma de pago
 *   sobre ese precio ⇒ redondeo. El canal es obligatorio: online ⛔ hereda las del local (TN tiene las suyas).
 * - «No se acepta» (`efecto: 'no'`) gana a cualquier descuento: es una traba, ⛔ un %.
 *
 * El cobro es el de la Caja (`lib/caja/core.core.js` del monitor, `cobro()`), con el % saliendo de las reglas en vez de
 * la cuenta de GN: prenda ⇒ VENTA (la rebaja a toda la venta se reparte entre los pagos por su base) ⇒ forma de pago ⇒
 * redondeo de CADA pago. Un pago cobra un GRUPO de renglones con UN solo %: si la forma de pago tiene % distintos en la
 * venta (oferta + resto), son pagos distintos (`pagosDeMedio` los arma), como las dos cuentas de GN de hoy.
 */

export const MEDIOS = Object.freeze(['efectivo', 'transferencia', 'debito', 'credito'])
export const CANALES = Object.freeze(['local', 'online'])
export const EFECTOS = Object.freeze(['descuento', 'recargo', 'final', 'no'])
export const ALCANCES = Object.freeze(['todo', 'categorias', 'productos', 'variantes'])
export const NOMBRE_MEDIO = Object.freeze({ efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito', credito: 'Crédito' })
export const MAX_PCT = 90
/** Los días se cuentan en hora argentina (UTC−3, sin horario de verano). */
const AR = -3 * 3600_000

const centavos = (n) => Math.round(n * 100) / 100
function exigir(cond, msg) {
  if (!cond) throw new Error(msg)
}
/** El día argentino de una fecha, 'aaaa-mm-dd'. */
export const diaAR = (f) => new Date(new Date(f).getTime() + AR).toISOString().slice(0, 10)
/** El día de la semana argentino: 0 domingo … 6 sábado. */
export const diaSemanaAR = (f) => new Date(new Date(f).getTime() + AR).getUTCDay()

const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const ids = (xs) => (Array.isArray(xs) ? [...new Set(xs.map((x) => String(x).trim()).filter(Boolean))] : [])

/**
 * Valida una regla (la pantalla y el servidor, con el mismo texto). Devuelve `{ ok: true, regla }` limpia, o
 * `{ ok: false, error: { campo, mensaje } }`. ⛔ completa con defaults lo que importa: canal, medios y efecto llegan.
 * @param {any} x
 */
export function validarRegla(x) {
  const mal = (campo, mensaje) => ({ ok: false, error: { campo, mensaje } })
  if (!x || typeof x !== 'object') return mal(null, 'Falta la regla')
  const nombre = texto(x.nombre)
  if (!nombre) return mal('nombre', 'Falta el nombre')
  if (nombre.length > 80) return mal('nombre', 'El nombre es muy largo')
  const marca = texto(x.marca)
  if (!marca) return mal('marca', 'Falta la marca')
  if (!CANALES.includes(x.canal)) return mal('canal', 'Elegí si es para el local o para online')
  const medios = ids(x.medios)
  if (!medios.length) return mal('medios', 'Elegí al menos una forma de pago')
  const raro = medios.find((m) => !MEDIOS.includes(m))
  if (raro) return mal('medios', `Forma de pago desconocida: ${raro}`)
  if (!EFECTOS.includes(x.efecto)) return mal('efecto', 'Elegí qué hace la regla')
  let pct = null
  if (x.efecto === 'descuento' || x.efecto === 'recargo') {
    pct = x.pct === '' || x.pct == null ? NaN : Number(x.pct)
    if (!Number.isFinite(pct) || pct <= 0 || pct > MAX_PCT) return mal('pct', `El porcentaje va de 0 a ${MAX_PCT}`)
    pct = centavos(pct)
  }
  const alcance = x.alcance == null ? 'todo' : x.alcance
  if (!ALCANCES.includes(alcance)) return mal('alcance', 'Alcance desconocido')
  const alcanceIds = alcance === 'todo' ? [] : ids(x.alcance_ids)
  if (alcance !== 'todo' && !alcanceIds.length) return mal('alcance_ids', 'Elegí a qué prendas aplica')
  const campania = texto(x.campania)
  const banco = texto(x.banco)
  const cuotas = x.cuotas == null || x.cuotas === '' ? null : Number(x.cuotas)
  if (cuotas != null && !(Number.isInteger(cuotas) && cuotas > 1 && cuotas <= 24)) return mal('cuotas', 'Cuotas inválidas')
  if ((banco || cuotas != null) && medios.some((m) => m !== 'credito' && m !== 'debito')) {
    return mal('medios', 'El banco y las cuotas son sólo para tarjeta')
  }
  const montoMinimo = x.monto_minimo == null || x.monto_minimo === '' ? null : Number(x.monto_minimo)
  if (montoMinimo != null && !(Number.isFinite(montoMinimo) && montoMinimo >= 0)) return mal('monto_minimo', 'Monto mínimo inválido')
  const fecha = (v, campo) => {
    if (v == null || v === '') return { v: null }
    if (Number.isNaN(Date.parse(v))) return { e: mal(campo, 'Fecha inválida') }
    return { v: new Date(v).toISOString() }
  }
  const d = fecha(x.desde, 'desde'), h = fecha(x.hasta, 'hasta')
  if (d.e) return d.e
  if (h.e) return h.e
  if (d.v && h.v && diaAR(h.v) < diaAR(d.v)) return mal('hasta', 'El «hasta» es antes del «desde»')
  const dias = x.dias == null ? null : [...new Set(x.dias.map(Number))].sort()
  if (dias && (!dias.length || dias.some((n) => !(Number.isInteger(n) && n >= 0 && n <= 6)))) return mal('dias', 'Días de la semana inválidos')
  return {
    ok: true,
    regla: {
      ...(x.id != null ? { id: String(x.id) } : {}),
      nombre, fin: texto(x.fin), marca, canal: x.canal, campania, alcance, alcance_ids: alcanceIds, medios,
      banco, cuotas, monto_minimo: montoMinimo, efecto: x.efecto, pct, desde: d.v, hasta: h.v, dias,
      activa: x.activa !== false, origen: texto(x.origen) || 'carga',
    },
  }
}

/** El % que aplica la regla: + descuento, − recargo, 0 precio final. `null` si la regla ⛔ acepta la forma de pago. */
export const pctDe = (r) => (r.efecto === 'no' ? null : r.efecto === 'final' ? 0 : r.efecto === 'recargo' ? -r.pct : r.pct)

/** Cómo se dice lo que hace una regla: «−15 %», «+10 %», «precio final», «no se acepta». */
export function efectoEnTexto(r) {
  if (r.efecto === 'no') return 'no se acepta'
  if (r.efecto === 'final') return 'precio final'
  return `${r.efecto === 'recargo' ? '+' : '−'}${String(r.pct).replace('.', ',')} %`
}

/** ¿La regla vale ese día (vigencia por DÍA argentino, «hasta» incluido, y días de la semana)? */
export function vigente(r, fecha) {
  if (!r.activa) return false
  const dia = diaAR(fecha)
  if (r.desde && dia < diaAR(r.desde)) return false
  if (r.hasta && dia > diaAR(r.hasta)) return false
  if (r.dias && !r.dias.includes(diaSemanaAR(fecha))) return false
  return true
}

/** ¿La regla alcanza esa prenda? (`categorias`, `campanias` del renglón: ids como texto o número). */
function alcanza(r, renglon) {
  if (r.campania && !(renglon.campanias || []).map(String).includes(r.campania)) return false
  if (r.alcance === 'todo') return true
  const en = (v) => r.alcance_ids.includes(String(v))
  if (r.alcance === 'productos') return en(renglon.product_id)
  if (r.alcance === 'variantes') return renglon.variant_id != null && en(renglon.variant_id)
  if (r.alcance === 'categorias') return (renglon.categorias || []).some(en)
  return false
}

/** ¿La condición de pago se cumple? `pago`: `{ medio, banco?, cuotas? }`; `aPagar`: lo que se paga en la venta. */
function condicion(r, pago, aPagar) {
  if (!r.medios.includes(pago.medio)) return false
  if (r.banco && (!pago.banco || pago.banco.toLowerCase() !== r.banco.toLowerCase())) return false
  if (r.cuotas != null && Number(pago.cuotas) !== r.cuotas) return false
  if (r.monto_minimo != null && !(aPagar > r.monto_minimo)) return false
  return true
}

/**
 * Qué le pasa a UNA prenda con UNA forma de pago. `reglas` ya filtradas por marca y canal (`delCanal`).
 * Devuelve `{ pct, acepta, regla, juego, perdieron }`: `regla` la que ganó (null = sin regla: va sin descuento), `juego`
 * 'temporada' o el id de la campaña, `perdieron` las que aplicaban y no ganaron (para el «por qué» del simulador).
 */
export function efectoEnPrenda(reglas, renglon, pago, { fecha, aPagar }) {
  const hoy = reglas.filter((r) => vigente(r, fecha))
  // 🔑 Dos juegos: las campañas del renglón que TIENEN reglas hoy reemplazan a las de temporada en esta prenda.
  const campanias = (renglon.campanias || []).map(String)
  const deCampania = hoy.filter((r) => r.campania && campanias.includes(r.campania))
  const juego = deCampania.length ? deCampania : hoy.filter((r) => !r.campania)
  const nombreJuego = deCampania.length ? [...new Set(deCampania.map((r) => r.campania))].join(' + ') : 'temporada'
  const aplican = juego.filter((r) => alcanza(r, renglon) && condicion(r, pago, aPagar))
  const traba = aplican.find((r) => r.efecto === 'no')
  if (traba) return { pct: null, acepta: false, regla: traba, juego: nombreJuego, perdieron: aplican.filter((r) => r !== traba) }
  if (!aplican.length) return { pct: 0, acepta: true, regla: null, juego: nombreJuego, perdieron: [] }
  // Gana la MEJOR para la clienta (el % más alto; un recargo es negativo). Empate: la de id menor, para que sea estable.
  const orden = [...aplican].sort((a, b) => pctDe(b) - pctDe(a) || String(a.id).localeCompare(String(b.id), 'es', { numeric: true }))
  return { pct: pctDe(orden[0]), acepta: true, regla: orden[0], juego: nombreJuego, perdieron: orden.slice(1) }
}

/** Las reglas de esa marca y ese canal. 🔑 El canal es obligatorio: online ⛔ hereda las del local. */
export function delCanal(reglas, { marca, canal }) {
  exigir(CANALES.includes(canal), 'Falta el canal')
  exigir(marca, 'Falta la marca')
  return reglas.filter((r) => r.marca === marca && r.canal === canal)
}

/**
 * Los renglones con su importe: cantidad × precio × (1 − descuento/100) − rebaja (lo de `renglones()` de la Caja).
 * `precio` es el de la prenda YA con su campaña (el orden de Bruno: la campaña primero).
 */
export function importes(renglones) {
  exigir(Array.isArray(renglones) && renglones.length > 0, 'La venta no tiene renglones')
  return renglones.map((r, i) => {
    const cantidad = Number(r.cantidad), precio = Number(r.precio)
    const descuento = Number(r.descuento || 0), rebaja = centavos(Number(r.rebaja || 0))
    exigir(Number.isInteger(cantidad) && cantidad > 0, `Renglón ${i + 1}: cantidad inválida`)
    exigir(Number.isFinite(precio) && precio > 0, `Renglón ${i + 1}: precio inválido`)
    exigir(descuento >= 0 && descuento <= 100 && rebaja >= 0, `Renglón ${i + 1}: descuento inválido`)
    const bruto = centavos(cantidad * precio * (1 - descuento / 100))
    exigir(rebaja <= bruto, `Renglón ${i + 1}: el descuento pasa el precio`)
    return { ...r, importe: centavos(bruto - rebaja) }
  })
}

const suma = (xs) => centavos(xs.reduce((s, x) => s + x, 0))

/** La rebaja a toda la venta, en pesos: `{ tipo: 'pct' | 'pesos', valor }` sobre `monto`. ⛔ Más que el monto. */
function pesosDeRebaja(rebaja, monto) {
  if (rebaja == null) return 0
  exigir((rebaja.tipo === 'pct' || rebaja.tipo === 'pesos') && Number(rebaja.valor) >= 0, 'Descuento a la venta inválido')
  const p = rebaja.tipo === 'pct' ? centavos(monto * Number(rebaja.valor) / 100) : centavos(Number(rebaja.valor))
  exigir(p <= monto, 'El descuento a la venta pasa el total')
  return p
}

/**
 * EL COBRO. Igual al `cobro()` de la Caja, con el % de cada pago saliendo de las reglas.
 *
 * @param {{
 *   renglones: Array<{ product_id: number, variant_id?: number, categorias?: Array<number|string>, campanias?: string[], cantidad: number, precio: number, descuento?: number, rebaja?: number }>,
 *   pagos: Array<{ medio: string, banco?: string, cuotas?: number, base?: number, renglones?: number[] }>,
 *   reglas: any[], marca: string, canal: string, fecha: string | Date, redondeo: number,
 *   rebajaVenta: { tipo: 'pct' | 'pesos', valor: number, sinCampania?: boolean } | null,
 * }} q
 * - `pagos[].renglones`: los índices que paga (el GRUPO). Sin ellos, el pago paga los renglones que ningún otro grupo
 *   nombró. En cada grupo todos los pagos llevan `base` (lo que pagan, a precio de lista) menos UNO, que se lleva el
 *   resto del grupo; las bases de un grupo suman su subtotal (lo de `exigirFeria` de la Caja, para cualquier grupo).
 * - `rebajaVenta.sinCampania`: la promo de compra ⛔ toca las prendas de campaña (A9 de la Caja).
 * Devuelve `{ subtotal, aVenta, pagos, total, descuentoVenta }`; cada pago con su `regla` (la que ganó), `pct`,
 * `descuento`, `redondeo` y `monto`. Lanza con un texto para la gente si ⛔ se puede cobrar así.
 */
export function cobrar(q) {
  exigir(Number.isFinite(q.redondeo) && q.redondeo > 0, 'Falta el paso de redondeo')
  exigir(q.rebajaVenta !== undefined, 'Falta el descuento a la venta (null si no hay)')
  exigir(Array.isArray(q.pagos) && q.pagos.length > 0, 'La venta no tiene pagos')
  const filas = importes(q.renglones)
  const reglas = delCanal(q.reglas, q)
  const sub = suma(filas.map((f) => f.importe))

  // Los grupos: los que nombran sus renglones, y «el resto».
  const nombrados = new Set()
  for (const p of q.pagos) for (const i of p.renglones || []) {
    exigir(Number.isInteger(i) && i >= 0 && i < filas.length, 'Un pago nombra un renglón que no está')
    nombrados.add(i)
  }
  const resto = filas.map((_, i) => i).filter((i) => !nombrados.has(i))
  const claveDe = (p) => (p.renglones ? [...new Set(p.renglones)].sort((a, b) => a - b).join(',') : resto.join(','))
  const grupos = new Map()
  for (const [k, p] of q.pagos.entries()) {
    const idx = p.renglones ? [...new Set(p.renglones)] : resto
    exigir(idx.length > 0, 'Un pago no tiene qué pagar')
    const c = claveDe(p)
    if (!grupos.has(c)) grupos.set(c, { idx, pagos: [] })
    grupos.get(c).pagos.push(k)
  }
  const enDos = filas.map((_, i) => [...grupos.values()].filter((g) => g.idx.includes(i)).length)
  exigir(enDos.every((n) => n === 1), 'Cada prenda se paga en un solo grupo de pagos')

  // La base de cada pago: el que va sin base se lleva el resto de SU grupo.
  const bases = new Array(q.pagos.length)
  for (const g of grupos.values()) {
    const subG = suma(g.idx.map((i) => filas[i].importe))
    const sinBase = g.pagos.filter((k) => q.pagos[k].base == null)
    exigir(sinBase.length <= 1, 'En cada grupo de pagos, uno solo va sin monto: se lleva el resto')
    let usado = 0
    for (const k of g.pagos) if (q.pagos[k].base != null) {
      const b = centavos(Number(q.pagos[k].base))
      exigir(Number.isFinite(b) && b > 0, `Pago ${k + 1}: falta cuánto paga`)
      bases[k] = b
      usado = centavos(usado + b)
    }
    if (sinBase.length) {
      bases[sinBase[0]] = centavos(subG - usado)
      exigir(bases[sinBase[0]] > 0, 'Los pagos cubren más que lo que se compra')
    } else exigir(Math.abs(usado - subG) < 0.005, 'Los pagos no suman lo que se compra')
  }

  // 🔑 Cascada (Bruno, 4-oct): prenda ⇒ VENTA ⇒ forma de pago. La rebaja a la venta se calcula ANTES de las reglas de
  // pago (también decide el monto mínimo de una regla).
  const esDeCampania = (i) => (filas[i].campanias || []).length > 0
  const sinCamp = !!(q.rebajaVenta && q.rebajaVenta.sinCampania)
  const deCampania = sinCamp ? suma(filas.map((f, i) => (esDeCampania(i) ? f.importe : 0))) : 0
  const aVenta = pesosDeRebaja(q.rebajaVenta, centavos(sub - deCampania))
  const aPagar = centavos(sub - aVenta)

  // El % de cada pago: el de sus prendas con su forma de pago. Un grupo con % distintos es un error (`pagosDeMedio`).
  const efectos = q.pagos.map((p, k) => {
    exigir(MEDIOS.includes(p.medio), `Pago ${k + 1}: forma de pago desconocida`)
    const g = grupos.get(claveDe(p))
    const es = g.idx.map((i) => efectoEnPrenda(reglas, filas[i], p, { fecha: q.fecha, aPagar }))
    const no = es.findIndex((e) => !e.acepta)
    if (no >= 0) throw new Error(`${filas[g.idx[no]].nombre || 'Una prenda'}: ${es[no].regla.nombre} — ${NOMBRE_MEDIO[p.medio].toLowerCase()} no se acepta`)
    exigir(es.every((e) => e.pct === es[0].pct), `Con ${NOMBRE_MEDIO[p.medio].toLowerCase()} las prendas tienen descuentos distintos: va en pagos separados`)
    return { ...es[0], soloCampania: g.idx.every(esDeCampania) }
  })

  // La rebaja a la venta se reparte entre los pagos por su base (Σ exacta); con `sinCampania` el pago que es SÓLO de
  // prendas de campaña ⛔ lleva parte.
  const pesos = q.pagos.map((_, k) => (sinCamp && efectos[k].soloCampania ? 0 : bases[k]))
  const sumaPesos = pesos.reduce((s, x) => s + x, 0)
  exigir(aVenta === 0 || sumaPesos > 0, 'El descuento a la venta no tiene sobre qué aplicarse')
  const ultimo = pesos.map((x, i) => (x > 0 ? i : -1)).reduce((a, b) => Math.max(a, b), -1)
  let restoRebaja = aVenta
  const pagos = q.pagos.map((p, k) => {
    const rebaja = !pesos[k] ? 0 : k === ultimo ? restoRebaja : centavos(aVenta * pesos[k] / sumaPesos)
    restoRebaja = centavos(restoRebaja - rebaja)
    exigir(rebaja <= bases[k], 'El descuento a la venta pasa lo que se paga con una forma de pago')
    const neto = centavos(bases[k] - rebaja)
    const pct = efectos[k].pct
    const descuento = centavos(neto * pct / 100)
    const crudo = centavos(neto - descuento)
    const monto = Math.round(crudo / q.redondeo) * q.redondeo
    exigir(monto > 0, `Pago ${k + 1}: queda en $0`)
    const e = efectos[k]
    return {
      medio: p.medio, ...(p.banco ? { banco: p.banco } : {}), ...(p.cuotas ? { cuotas: p.cuotas } : {}),
      renglones: grupos.get(claveDe(p)).idx, base: bases[k], rebaja, pct, descuento, redondeo: centavos(monto - crudo), monto,
      regla: e.regla ? { id: e.regla.id ?? null, nombre: e.regla.nombre } : null, juego: e.juego,
      perdieron: e.perdieron.map((r) => ({ id: r.id ?? null, nombre: r.nombre, efecto: efectoEnTexto(r) })),
    }
  })
  const total = centavos(pagos.reduce((s, p) => s + p.monto, 0))
  return { subtotal: sub, aVenta, pagos, total, descuentoVenta: centavos(sub - total) }
}

/**
 * Los pagos de UNA forma de pago para toda la venta: un pago por cada % distinto (la oferta a precio final y el resto
 * con −15 %), como `pagosDeMedio` de la Caja. Si alguna prenda ⛔ acepta esa forma de pago, lanza con el porqué.
 * @param {string} medio @param {{ renglones: any[], reglas: any[], marca: string, canal: string, fecha: any, aPagar?: number, banco?: string, cuotas?: number }} q
 */
export function pagosDeMedio(medio, q) {
  const filas = importes(q.renglones)
  const reglas = delCanal(q.reglas, q)
  const aPagar = q.aPagar ?? suma(filas.map((f) => f.importe))
  const pago = { medio, ...(q.banco ? { banco: q.banco } : {}), ...(q.cuotas ? { cuotas: q.cuotas } : {}) }
  const porPct = new Map()
  filas.forEach((f, i) => {
    const e = efectoEnPrenda(reglas, f, pago, { fecha: q.fecha, aPagar })
    if (!e.acepta) throw new Error(`${f.nombre || 'Una prenda'}: ${e.regla.nombre} — ${NOMBRE_MEDIO[medio].toLowerCase()} no se acepta`)
    if (!porPct.has(e.pct)) porPct.set(e.pct, [])
    porPct.get(e.pct).push(i)
  })
  const grupos = [...porPct.values()]
  if (grupos.length === 1) return [pago]
  return grupos.map((idx) => ({ ...pago, renglones: idx }))
}

/**
 * EL SIMULADOR (`erp › Reglas`): la venta cobrada con CADA forma de pago, o el porqué de que ⛔ se pueda. Para crédito
 * con banco o cuotas, `credito` lleva `{ banco?, cuotas? }`. `extra`: reglas en borrador para probar antes de guardarlas.
 */
export function simular({ renglones, reglas, extra = [], marca, canal, fecha, redondeo, rebajaVenta = null, credito = {} }) {
  const todas = [...reglas, ...extra.map((r, i) => ({ ...r, id: r.id ?? `borrador-${i + 1}` }))]
  return MEDIOS.map((medio) => {
    try {
      const cond = medio === 'credito' || medio === 'debito' ? credito : {}
      const sub = suma(importes(renglones).map((f) => f.importe))
      const aPagar = centavos(sub - pesosDeRebaja(rebajaVenta, sub))
      const pagos = pagosDeMedio(medio, { renglones, reglas: todas, marca, canal, fecha, aPagar, ...cond })
      return { medio, ok: true, ...cobrar({ renglones, pagos, reglas: todas, marca, canal, fecha, redondeo, rebajaVenta }) }
    } catch (e) {
      return { medio, ok: false, error: e.message }
    }
  })
}

/**
 * 🔑 LOS 5 LUGARES DE HOY, COMO REGLAS (§2 de `reglas-comerciales.md`; la parte 1 ⛔ cambia un peso). Traduce la
 * configuración de la Caja (`caja_config.reglas` de la marca) a filas: el % de las cuentas de GN detrás de cada forma de
 * pago (temporada), cómo se cobra la oferta (las reglas de cada campaña de Liquidación) y las 6 cuotas. La promo
 * bancaria ⛔ se traduce acá: la LEE `reglasDeAgenda` (la Agenda sigue siendo donde se carga, ⛔ una copia).
 * Devuelve `{ reglas, avisos }`: lo que ⛔ se puede traducir se dice, ⛔ se calla.
 * @param {any} config `caja_config.reglas` @param {{ marca: string }} o
 */
export function reglasDeCaja(config, { marca }) {
  exigir(config && config.cuentas && config.medios, 'Faltan las reglas de la Caja')
  const m = config.medios
  const avisos = []
  const pctCuenta = (c) => {
    const r = c == null ? null : config.cuentas[c]
    return r && Number.isFinite(Number(r.descuento)) ? Number(r.descuento) : null
  }
  const reglas = []
  const fila = (x) => reglas.push({ marca, canal: 'local', campania: null, alcance: 'todo', alcance_ids: [], banco: null, cuotas: null, monto_minimo: null, desde: null, hasta: null, dias: null, activa: true, origen: 'caja', fin: 'temporada', ...x })
  const deTemporada = {}
  for (const [medio, cuenta] of [['efectivo', m.efectivo.normal], ['debito', m.debito.normal], ['credito', m.credito.normal]]) {
    deTemporada[medio] = pctCuenta(cuenta)
  }
  // Transferencia: las dos cuentas de MP llevan el MISMO % (si ⛔, se avisa y va la mayor).
  const pctsT = [...new Set((m.transferencia.opciones || []).map(pctCuenta).filter((p) => p != null))]
  if (pctsT.length > 1) avisos.push(`Las cuentas de transferencia tienen % distintos (${pctsT.join(' y ')}): va el mayor`)
  deTemporada.transferencia = pctsT.length ? Math.max(...pctsT) : null
  for (const medio of MEDIOS) {
    const p = deTemporada[medio]
    if (p == null) avisos.push(`${NOMBRE_MEDIO[medio]}: la cuenta de GN no tiene regla`)
    else if (p > 0) fila({ nombre: `${NOMBRE_MEDIO[medio]} siempre`, medios: [medio], efecto: 'descuento', pct: p })
  }
  if (m.credito.seisCuotas != null) {
    const p = pctCuenta(m.credito.seisCuotas) || 0
    fila({ nombre: '6 cuotas sin interés', medios: ['credito'], cuotas: 6, monto_minimo: Number(m.credito.minSeisCuotas), efecto: p > 0 ? 'descuento' : 'final', pct: p > 0 ? p : null })
  }
  // La oferta: cada campaña de Liquidación que es feria lleva las reglas de `oferta` (sin guardar = la de antes del 12-oct).
  const OFERTA_INICIAL = { efectivo: 'final', transferencia: 'final', debito: 'no', credito: 'no', recargo: 10 }
  const o = { ...OFERTA_INICIAL, ...(config.oferta || {}) }
  const conCuenta = { efectivo: m.efectivo.feria != null, transferencia: m.transferencia.feria != null, debito: m.tarjetaOferta != null, credito: m.tarjetaOferta != null }
  for (const campania of config.feriaCampanias || []) {
    // Toda en «descuento» ⇒ la campaña ⛔ tiene reglas: sus prendas siguen con las de temporada (BDI).
    if (MEDIOS.every((md) => o[md] === 'descuento')) continue
    const porEfecto = {}
    for (const md of MEDIOS) {
      let ef = o[md], pct = null
      if ((ef === 'final' || ef === 'recargo') && !conCuenta[md]) { avisos.push(`Oferta con ${NOMBRE_MEDIO[md].toLowerCase()}: la tienda no tiene la cuenta de oferta en GN`); ef = 'no' }
      if (ef === 'recargo') pct = Number(o.recargo)
      if (ef === 'descuento') { pct = deTemporada[md]; ef = pct > 0 ? 'descuento' : 'final' }
      const k = `${ef}|${pct}`
      ;(porEfecto[k] ||= { efecto: ef, pct, medios: [] }).medios.push(md)
    }
    for (const g of Object.values(porEfecto)) {
      fila({ nombre: `Oferta: ${g.medios.map((md) => NOMBRE_MEDIO[md].toLowerCase()).join(', ')}`, fin: 'liquidación', campania, medios: g.medios, efecto: g.efecto, pct: g.pct })
    }
  }
  if ((config.feriaProductos || []).length) avisos.push(`${config.feriaProductos.length} producto(s) en oferta agregados a mano en la Caja: no se traducen`)
  return { reglas, avisos }
}

/**
 * La promo bancaria de la AGENDA (`agenda_promos`, base de BDI) como regla, LEÍDA (⛔ una copia): se edita en la Agenda.
 * Sólo las del mostrador, con descuento, de esa marca. @param {any[]} filas @param {{ marca: string }} o
 */
export function reglasDeAgenda(filas, { marca }) {
  return (filas || [])
    .filter((a) => a.activa && (a.canales || []).includes('mostrador') && (a.marcas || []).includes(marca))
    .filter((a) => a.beneficio && a.beneficio.tipo === 'descuento' && Number(a.beneficio.pct) > 0 && MEDIOS.includes(a.medio))
    .map((a) => ({
      id: `agenda:${a.id}`, nombre: `${a.banco ? `${a.banco} ` : ''}${NOMBRE_MEDIO[a.medio].toLowerCase()} −${a.beneficio.pct} %`,
      fin: 'promo bancaria', marca, canal: 'local', campania: null, alcance: 'todo', alcance_ids: [], medios: [a.medio],
      banco: a.banco || null, cuotas: null, monto_minimo: null, efecto: 'descuento', pct: Number(a.beneficio.pct),
      desde: a.desde ? new Date(a.desde).toISOString() : null, hasta: a.hasta ? new Date(a.hasta).toISOString() : null,
      dias: a.regla && a.regla.tipo === 'semanal' && Array.isArray(a.regla.dias) ? a.regla.dias.map(Number) : null,
      activa: true, origen: 'agenda',
    }))
}

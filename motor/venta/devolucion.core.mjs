/**
 * La DEVOLUCIÓN (contrato-venta.md §17, sql/028): la regla, sin base. La usan `anularVenta` (todo) y `registrarCambio`
 * (lo que queda a favor de las prendas devueltas). Las dos devuelven `{ ok: false, error }` o lo armado.
 *
 * 🔑 Bruno (18-oct 23 h): el local ELIGE en el momento —
 *   - `plata`: lo que se PAGÓ, por el medio con que pagó (cada pago vuelve a su cuenta y su cuenta real) o por los
 *     que diga la pantalla (`pagos: [{ cuenta, monto }]`, que tienen que sumar lo mismo);
 *   - `saldo`: saldo a favor de la clienta, a precio de LISTA («siempre entre precios de lista», como el cambio).
 * Lo pagado con «Saldo a favor» o dejado «a cuenta» ⛔ entra: eso lo dan vuelta sus libros (007 y 025) solos.
 * 🔑 El PIN de la encargada se pide sólo si la llave de la marca está prendida (`DEVOLUCION_CON_PIN`, apagada).
 */
import { cuentaDe } from './armar.mjs'

const fallo = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const pesos = (x) => Math.round(Number(x) * 100) / 100
const FORMAS = ['plata', 'saldo']
/** Los medios que ⛔ son plata que entró: los da vuelta su propio libro. */
const NO_ES_PLATA = ['saldo', 'cuenta']
export const MARCAS_PIN = ['bdi', 'zattia', 'stunned']

/**
 * 🔑 37a (Bruno, 16-oct): el estado del pedido decide adónde va la prenda al anular. Sin armar (o sin pedido: la Caja,
 * el mayorista) vuelve al instante; empaquetado queda «a desarmar»; si ya salió, «a recibir». Los dos últimos esperan
 * a `confirmarVuelta` para mover el libro.
 * @param {string | null | undefined} estado `tn_orden.estado` (sql/015)
 */
export function vueltaDe(estado) {
  if (estado === 'listo') return 'a_desarmar'
  if (estado === 'despachado' || estado === 'retirado' || estado === 'entregado') return 'a_recibir'
  return 'ya'
}

/** ¿La marca pide el PIN para devolver? `DEVOLUCION_CON_PIN=zattia,stunned` (apagada: «tenemos poca gente»). */
export function pinEn(marca, env = process.env) {
  const lista = String(env.DEVOLUCION_CON_PIN ?? '').split(',').map((m) => m.trim().toLowerCase()).filter(Boolean)
  for (const m of lista) if (!MARCAS_PIN.includes(m)) throw new Error(`DEVOLUCION_CON_PIN: marca desconocida «${m}»`)
  return lista.includes(marca)
}

/**
 * El PIN, si la llave está prendida: `autoriza: { motivo: 'pin_encargada', usuario }` (lo valida el monitor, como en
 * «sin negativos»). Devuelve `{ autoriza }` (null con la llave apagada) o la falla `FALTA_PIN`.
 */
export function autorizacion(marca, autoriza, env = process.env) {
  if (!pinEn(marca, env)) return { autoriza: null }
  if (autoriza?.motivo === 'pin_encargada' && typeof autoriza.usuario === 'string' && autoriza.usuario.trim()) {
    return { autoriza: { motivo: 'pin_encargada', usuario: autoriza.usuario.trim() } }
  }
  return fallo('FALTA_PIN', 'Devolver plata o saldo necesita el PIN de la encargada', 'autoriza')
}

/**
 * La entrada `devolucion` de la pantalla, ya leída: `{ forma, pagos? }`. Un array (la forma vieja del contrato §1,
 * `[{ cuenta, monto }]`) es plata por esas cuentas. `null` = no vino (anula como antes: la copia de TN o de GN, que
 * devolvieron afuera).
 */
export function leerDevolucion(d) {
  if (d == null) return { devolucion: null }
  if (Array.isArray(d)) return { devolucion: { forma: 'plata', pagos: d } }
  if (typeof d !== 'object' || !FORMAS.includes(d.forma)) return fallo('ENTRADA_INVALIDA', `La devolución es ${FORMAS.join(' o ')}`, 'devolucion.forma')
  if (d.pagos != null && (d.forma !== 'plata' || !Array.isArray(d.pagos) || !d.pagos.length)) {
    return fallo('ENTRADA_INVALIDA', 'Las cuentas se eligen sólo para devolver plata', 'devolucion.pagos')
  }
  return { devolucion: { forma: d.forma, pagos: d.pagos ?? null } }
}

/** Lo que entró en PLATA de los pagos de una venta (`venta_pago` con el `medio` de su cuenta de cobro en `cuenta_medio`). */
export const pagosDePlata = (pagos) => pagos.filter((p) => !NO_ES_PLATA.includes(p.cuenta_medio) && Number(p.monto) > 0)

/** Repartir `monto` entre los pagos, en proporción a lo que pagó cada uno; el último se lleva el redondeo. */
function prorratear(pagos, monto) {
  const total = pagos.reduce((s, p) => s + Number(p.monto), 0)
  let resto = pesos(monto)
  return pagos.map((p, i) => {
    const m = i === pagos.length - 1 ? resto : pesos((monto * Number(p.monto)) / total)
    resto = pesos(resto - m)
    return { ...p, monto: m }
  }).filter((p) => p.monto > 0)
}

/**
 * Las filas de `venta_devolucion` (sin `id`, `venta_id` ni quién: las pone el que escribe).
 * @param {object} p
 * @param {{ forma: 'plata'|'saldo', pagos: any[]|null }} p.devolucion   lo que eligió el local (`leerDevolucion`)
 * @param {number} p.plata    cuánto se devuelve en plata (lo pagado por lo devuelto)
 * @param {number} p.lista    cuánto queda a favor (lo mismo, a precio de lista)
 * @param {any[]} p.pagos     los pagos de la venta original (`venta_pago` + `cuenta_medio`)
 * @param {import('./armar.mjs').Conf} p.conf  @param {string} p.marca  @param {string | null} p.cliente_id
 * @returns {{ ok: true, filas: any[], forma: string, monto: number } | { ok: false, error: any }}
 */
export function armarDevolucion({ devolucion, plata, lista, pagos, conf, marca, cliente_id }) {
  if (devolucion.forma === 'saldo') {
    if (!cliente_id) return fallo('FALTA_CLIENTE', 'Para dejar saldo a favor hace falta la clienta', 'cliente')
    const cuenta = conf.cuentas.find((c) => c.marca === marca && c.medio === 'saldo')
    if (!cuenta) return fallo('CUENTA_DESCONOCIDA', `${marca} no tiene la cuenta «Saldo a favor» (sql/007)`, 'devolucion')
    const monto = pesos(lista)
    return { ok: true, forma: 'saldo', monto, filas: monto > 0 ? [{ forma: 'saldo', cuenta_cobro_id: cuenta.id, medio: 'saldo', cuenta_real_id: null, cliente_id, monto }] : [] }
  }
  const monto = pesos(plata)
  const dePlata = pagosDePlata(pagos)
  if (!devolucion.pagos) {
    if (monto > 0 && !dePlata.length) return fallo('SIN_MEDIO', 'La venta no se pagó con plata: elegí por dónde se devuelve', 'devolucion.pagos')
    const filas = monto > 0 ? prorratear(dePlata, monto).map((p) => ({ forma: 'plata', cuenta_cobro_id: p.cuenta_cobro_id, medio: p.medio ?? p.cuenta_medio ?? null, cuenta_real_id: p.cuenta_real_id ?? null, cliente_id: null, monto: p.monto })) : []
    return { ok: true, forma: 'plata', monto, filas }
  }
  const filas = []
  for (const [i, p] of devolucion.pagos.entries()) {
    const cuenta = p && cuentaDe(conf, marca, p.cuenta)
    const campo = `devolucion.pagos[${i}]`
    if (!cuenta) return fallo('CUENTA_DESCONOCIDA', `La cuenta ${p && p.cuenta} no es de ${marca}`, `${campo}.cuenta`)
    if (NO_ES_PLATA.includes(cuenta.medio)) return fallo('ENTRADA_INVALIDA', `«${cuenta.nombre}» no es plata: para dejar saldo, la forma es saldo`, `${campo}.cuenta`)
    if (!(Number(p.monto) > 0)) return fallo('ENTRADA_INVALIDA', 'El monto a devolver es mayor que 0', `${campo}.monto`)
    // Si vuelve a una cuenta con la que pagó, sale por el mismo medio y la misma cuenta real.
    const igual = dePlata.find((x) => x.cuenta_cobro_id === cuenta.id)
    filas.push({ forma: 'plata', cuenta_cobro_id: cuenta.id, medio: igual?.medio ?? cuenta.medio ?? null, cuenta_real_id: igual?.cuenta_real_id ?? null, cliente_id: null, monto: pesos(p.monto) })
  }
  const suma = pesos(filas.reduce((s, f) => s + f.monto, 0))
  if (Math.abs(suma - monto) > 0.01) return fallo('PAGOS_NO_CIERRAN', `Se devuelven ${suma} y lo pagado es ${monto}`, 'devolucion.pagos')
  return { ok: true, forma: 'plata', monto, filas }
}

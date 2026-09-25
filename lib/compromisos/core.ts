// Las reglas de los compromisos de pago. Puro: no toca la base ni React.
//
// Un compromiso es "este cliente le va a transferir a este acreedor". Vive en el Monitor porque es
// donde se habla con el cliente; el dashboard sólo se entera cuando la plata ya se movió.

import {
  mostrar as mostrarJS,
  paraEditar as paraEditarJS,
  parsearMonto as parsearMontoJS,
  redondear as redondearJS,
  restante as restanteJS,
  sePuedeComprometer as sePuedeComprometerJS,
} from './plata.core.js'

/**
 * La plata, re-exportada con tipos desde `plata.core.js` (mismo patrón que `lib/canjes/tipos.ts`).
 *
 * Vive en un `.js` porque `api/_compromisos.js` corre en Node sin pasar por el compilador de Next
 * y no puede importar TypeScript: es la única forma de que el servidor y los formularios hagan la
 * MISMA cuenta en vez de dos copias parecidas.
 *
 * ⛔ **La regla de uso**: hacia un `<input>` de plata va `paraEditar(n)`, nunca `String(n)`.
 * `String()` escribe el punto como decimal y `parsearMonto` lo lee como separador de miles — es
 * exactamente el desencuentro que multiplicaba los montos por cien.
 */
export const parsearMonto: (entrada: unknown) => number = parsearMontoJS
export const paraEditar: (n: unknown) => string = paraEditarJS
export const mostrar: (n: unknown) => string = mostrarJS
export const redondear: (n: unknown) => number = redondearJS

export type EstadoCompromiso = 'prometido' | 'transferido' | 'confirmado' | 'cancelado'

export const ESTADOS: EstadoCompromiso[] = ['prometido', 'transferido', 'confirmado', 'cancelado']

export type Compromiso = {
  id: string
  /**
   * De qué clase es el destino, y con eso qué pasa al confirmar.
   *
   * - `dashboard` se le paga a un acreedor de verdad: confirmar escribe el pago en su ledger.
   * - `manual`    es una cuenta hecha a mano acá (la cuota del crédito, las bolsas): confirmar
   *   no sale del Monitor, y cuando se junta todo la cuenta se apaga sola.
   *
   * 🔑 `acreedor_id` es "a quién se le paga" en los dos casos — un proveedor del dashboard o una
   * cuenta manual—, así que toda la cuenta del circuito cuelga de la misma columna. Esto dice de
   * quién es ese id.
   */
  origen: 'dashboard' | 'manual'
  /** Para qué vuelta de una cuenta manual se junta esta plata. `null` en los del dashboard. */
  objetivo_id: string | null
  acreedor_id: string
  acreedor_nombre: string
  cuenta_alias: string | null
  cuenta_cbu: string | null
  cuenta_banco: string | null
  cuenta_titular: string | null
  cliente_id: string | null
  cliente_store: string
  cliente_nombre: string
  /**
   * El teléfono del chat, normalizado. Lo tienen los compromisos que se anotaron **antes** de que el
   * cliente existiera en Gestión Nube: es con lo que se reenganchan después.
   */
  cliente_telefono: string | null
  /*
    ⛔ **`titular_real` NO está, y la columna sí existe.** Se pedía al confirmar —a nombre de quién
    vino la transferencia— y se sacó el 21-sep-2026: 0 de 9 confirmaciones lo llenaron en 18 días,
    y el que confirma mira el comprobante en el chat del cliente. Que el tipo no lo tenga es lo que
    impide que una pantalla lo vuelva a dibujar sin que nadie lo vuelva a cargar.
  */
  monto: number
  monto_confirmado: number | null
  estado: EstadoCompromiso
  fecha_prometida: string | null
  notas: string | null
  operacion_id: string
  pagos_dashboard: unknown
  viene_de: string | null
  creado_en: string
  creado_por: string | null
  confirmado_en: string | null
  confirmado_por: string | null
}

/**
 * Qué compromisos siguen ocupando plata. Un confirmado ya bajó la deuda de verdad (está en el
 * ledger del dashboard) y un cancelado se cayó: ninguno de los dos se cuenta dos veces.
 */
export function estaAbierto(c: { estado: EstadoCompromiso }): boolean {
  return c.estado === 'prometido' || c.estado === 'transferido'
}

/**
 * De qué estado se puede pasar a cuál.
 *
 * 🔑 **`confirmado` no sale más.** Confirmar escribe pagos reales en el ledger del dashboard; un
 * botón que lo "des-confirme" tendría que borrar plata de otro sistema, y eso se hace a mano y
 * mirando. Lo que sí se puede es anotar un compromiso nuevo.
 *
 * `cancelado` sí se reabre: cancelar no movió nada, y equivocarse de fila no tiene por qué costar
 * volver a escribir todo.
 */
const TRANSICIONES: Record<EstadoCompromiso, EstadoCompromiso[]> = {
  // Se puede confirmar derecho desde `comprometido`: muchas veces el cliente transfiere mientras se
  // está hablando, y obligar a pasar por `transferido` sería un clic que no dice nada nuevo.
  prometido: ['transferido', 'confirmado', 'cancelado'],
  // Vuelve a `comprometido` si dijo que había transferido y no era.
  transferido: ['confirmado', 'prometido', 'cancelado'],
  confirmado: [],
  cancelado: ['prometido'],
}

export function puedeIr(desde: EstadoCompromiso, hasta: EstadoCompromiso): boolean {
  return (TRANSICIONES[desde] ?? []).includes(hasta)
}

/** El motivo, escrito para leer. `null` si el paso es válido. */
export function porQueNo(desde: EstadoCompromiso, hasta: EstadoCompromiso): string | null {
  if (puedeIr(desde, hasta)) return null
  if (desde === 'confirmado') {
    return 'Este compromiso ya impactó en el dashboard y no se puede volver atrás desde acá. Si hay que corregirlo, se borra el pago en el dashboard.'
  }
  if (desde === hasta) return 'Ya está en ese estado.'
  return `No se puede pasar de "${desde}" a "${hasta}".`
}

const centavos = redondear

/**
 * Cuánta plata hay comprometida y todavía sin confirmar, por acreedor.
 *
 * 🔑 Es la mitad que le falta al saldo del dashboard. El dashboard no sabe que esa plata está
 * comprometida, así que su saldo dice "se le debe X" cuando en realidad ya hay X−Y camino a él.
 * Sin esta resta se compromete dos veces sobre la misma deuda.
 */
export function comprometidoPorAcreedor(compromisos: { acreedor_id: string; monto: number; estado: EstadoCompromiso }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const c of compromisos) {
    if (!estaAbierto(c)) continue
    m.set(c.acreedor_id, centavos((m.get(c.acreedor_id) ?? 0) + Number(c.monto)))
  }
  return m
}

/** Lo mismo del lado del cliente: cuánto ya se le pidió y todavía no pagó. */
export function comprometidoPorCliente(compromisos: { cliente_id: string | null; monto: number; estado: EstadoCompromiso }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const c of compromisos) {
    if (!estaAbierto(c) || !c.cliente_id) continue
    m.set(c.cliente_id, centavos((m.get(c.cliente_id) ?? 0) + Number(c.monto)))
  }
  return m
}

/**
 * Y lo mismo por teléfono, para el que TODAVÍA no existe en Gestión Nube.
 *
 * 🔑 **Sin esto, al mayorista nuevo se le puede pedir dos veces la misma plata.** La cuenta de
 * "cuánto ya le pedimos" cuelga del `cliente_id`, que esos compromisos no tienen; el número del chat
 * es lo único que las junta. Es la misma resta, con la otra llave.
 */
export function comprometidoPorTelefono(compromisos: { cliente_telefono: string | null; monto: number; estado: EstadoCompromiso }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const c of compromisos) {
    if (!estaAbierto(c) || !c.cliente_telefono) continue
    m.set(c.cliente_telefono, centavos((m.get(c.cliente_telefono) ?? 0) + Number(c.monto)))
  }
  return m
}

/**
 * Los compromisos de este número que están esperando que el cliente aparezca en Gestión Nube.
 *
 * Es lo que dispara el ofrecimiento de vincular: se anotó la cobranza de alguien que todavía no
 * estaba cargado, y ahora el panel abrió su ficha de verdad. El momento en que se sabe a quién
 * corresponde es ése, y si no se aprovecha, el compromiso queda para siempre con un nombre escrito a
 * mano que no cruza con ninguna deuda.
 *
 * ⛔ Los confirmados quedan afuera: su pago ya se escribió en el dashboard a nombre de quien
 * figuraba, y vincularlas acá dejaría los dos sistemas diciendo cosas distintas.
 */
export function sinVincular(compromisos: Compromiso[], telefono: string | null): Compromiso[] {
  if (!telefono) return []
  return compromisos.filter((c) => c.cliente_telefono === telefono && !c.cliente_id && estaAbierto(c))
}

/**
 * Cuánto se le puede comprometer todavía a un acreedor.
 *
 * 🔑 Vive en `plata.core.js` porque **el servidor también la usa**: desde el 7-sep-2026 el handler
 * la vuelve a aplicar antes de guardar, con los números frescos. Mientras estaba sólo acá, la regla
 * central del circuito la hacía cumplir el navegador contra su copia de los datos — y dos personas
 * en dos chats la salteaban sin querer.
 */
export const sePuedeComprometer: (disponibleDashboard: number, yaComprometido: number) => number =
  sePuedeComprometerJS

/**
 * Qué pasa cuando el cliente transfiere MENOS de lo comprometido (decidido con Darío, 2-sep-2026):
 * este compromiso se cierra por lo que entró de verdad, y lo que falta se anota como uno NUEVO.
 *
 * ⛔ No se deja el compromiso abierto con un remanente. Un compromiso es *una transferencia*: si
 * entraron dos, son dos filas. Así la lista se lee como el extracto —una línea, una plata— y no
 * hace falta mirar adentro de una fila para saber cuánto entró.
 *
 * Devuelve cuánto quedaría pendiente, o 0 si entró todo (o de más).
 *
 * 🔑 Es `restante` de `plata.core.js` con otro nombre, y no una segunda implementación: la resta la
 * hacen el servidor (para abrir el compromiso del resto) y los dos formularios de confirmar (para
 * dibujar el aviso de "entró de menos"). Estaban escritas por separado, así que el aviso podía
 * decir una cosa y el servidor anotar otra.
 */
export const restanteTrasConfirmar: (comprometido: number, entro: number) => number = restanteJS

/**
 * Cuántos días faltan para una fecha comprometida. Negativo = ya venció; `null` = no tiene fecha.
 *
 * Las dos fechas son `YYYY-MM-DD` y se comparan como días, no como instantes: si se restaran
 * `Date` armados con hora local, un compromiso para hoy podría decir "vence mañana" según la hora
 * a la que se mire.
 */
export function diasPara(fechaISO: string | null, hoyISO: string): number | null {
  if (!fechaISO) return null
  const a = Date.parse(`${fechaISO.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${hoyISO.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((a - b) / 86_400_000)
}

/**
 * El orden de una cola de cobranza: primero lo que tiene fecha, de la más vieja a la más nueva
 * (o sea lo más vencido arriba), y al final lo que nunca se agendó, de lo más viejo a lo más
 * reciente.
 *
 * 🔑 **Lo que no tiene fecha va último, no primero.** Es tentador ponerlo arriba porque "no se
 * sabe"; pero la cola se lee de arriba para abajo y lo que ya venció es lo que hay que reclamar
 * hoy. Lo sin fecha se ordena por antigüedad, que es lo único que dice algo: cuánto hace que está
 * ahí sin moverse.
 */
function porUrgencia(a: Compromiso, b: Compromiso): number {
  const fa = a.fecha_prometida
  const fb = b.fecha_prometida
  if (fa && fb && fa !== fb) return fa < fb ? -1 : 1
  if (fa && !fb) return -1
  if (!fa && fb) return 1
  const ca = a.creado_en || ''
  const cb = b.creado_en || ''
  if (ca === cb) return 0
  return ca < cb ? -1 : 1
}

/** Lo cerrado se lee al revés: lo último que pasó primero. */
function porReciente(a: Compromiso, b: Compromiso): number {
  const ca = a.confirmado_en || a.creado_en || ''
  const cb = b.confirmado_en || b.creado_en || ''
  if (ca === cb) return 0
  return ca < cb ? 1 : -1
}

export type ColaDeCobranza = {
  /** Se le pidió al cliente y todavía no se acreditó. */
  pedidos: Compromiso[]
  /** Las que ya no ocupan plata: se acreditaron o se cancelaron. */
  cerradas: Compromiso[]
  /** Cuánta plata hay pedida y sin acreditar, en total. */
  totalAbierto: number
}

/**
 * La lista de trabajo de cobranza: lo pedido arriba, lo cerrado aparte.
 *
 * 🔄 **Hasta el 25-sep-2026 eran DOS listas abiertas**: "Falta confirmar" (`transferido`, el
 * cliente avisó que ya mandó) y "Esperando que transfieran" (`prometido`). Darío lo simplificó a
 * tres estados —Pedido, Acreditado, Cancelado—: el riesgo de que un aviso de transferencia sea
 * falso es bajísimo y no justifica un paso. El botón que llevaba a `transferido` ya había salido
 * del panel el 4-sep, así que esa lista estaba siempre vacía.
 * ⚠️ **El estado `transferido` sigue en la base y en el grafo** (no se migró nada): un compromiso
 * viejo en ese estado se trata como Pedido y se confirma igual.
 */
export function colaDeCobranza(compromisos: Compromiso[]): ColaDeCobranza {
  const pedidos: Compromiso[] = []
  const cerradas: Compromiso[] = []
  let total = 0
  for (const c of compromisos) {
    if (estaAbierto(c)) {
      pedidos.push(c)
      total = centavos(total + Number(c.monto))
    } else {
      cerradas.push(c)
    }
  }
  return {
    pedidos: pedidos.sort(porUrgencia),
    cerradas: cerradas.sort(porReciente),
    totalAbierto: total,
  }
}

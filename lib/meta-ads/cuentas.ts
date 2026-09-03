/**
 * El eje de Meta Ads: **cuenta publicitaria × línea de pauta**, y cómo se angostan entre sí.
 *
 * # Por qué son DOS ejes y no uno
 *
 * BDI y Zattia comparten la cuenta `1145878766790149`; Stunned tiene la suya. O sea que ni el
 * selector de cuenta ni el de línea alcanzan solos:
 *
 * - Filtrar por cuenta no dice de qué marca es la plata (una cuenta trae dos líneas).
 * - Filtrar por línea no dice dónde se pautea (una línea puede estar en dos cuentas durante una
 *   mudanza, que es exactamente lo que va a pasar cuando Zattia se mude a la suya).
 *
 * 🔑 **Qué línea vive en qué cuenta se MIDE, nunca se hardcodea**: sale de agrupar
 * `meta_ads_campania_linea.cuenta_id`, que es lo que una persona asignó campaña por campaña. Es el
 * mismo criterio con el que `lineas.core.js` mató al mapa `MARCA_POR_CUENTA`: un mapa fijo
 * cuenta→marca no tiene ningún valor correcto para una cuenta compartida.
 *
 * # La trampa que estas funciones existen para evitar
 *
 * Angostar las cuentas por línea, a secas, **esconde justo la cuenta donde hay que trabajar**: una
 * cuenta cuyas campañas todavía no tiene asignadas nadie no pertenece a ninguna línea, así que
 * desaparecería del selector al elegir cualquiera — y las campañas sin asignar son las únicas que
 * no las cuenta ningún diagnóstico. Por eso `cuentasDeLinea` deja pasar también a las que tienen
 * campañas sin línea, y el selector las marca.
 */

import type { CuentaMeta, LineaPauta } from './tipos'

/** Lo que el selector puede tener elegido. `'todas'` no es una cuenta: es no filtrar. */
export type ElegidaCuenta = 'todas' | string
export type ElegidaLinea = 'todas' | LineaPauta

/** Campañas de la cuenta que no tiene asignada ninguna línea. Nunca negativo. */
export function sinAsignarDe(c: CuentaMeta): number {
  return Math.max(0, (c.campanias || 0) - (c.asignadas || 0))
}

/**
 * El orden del selector: **primero donde hay trabajo**.
 *
 * Las cuentas con campañas van arriba, de más a menos, y las vacías se hunden al fondo. Una cuenta
 * en cero no es un error —«Areben Comercial SRL» existe y no pautea— pero ponerla en el medio de la
 * lista invita a elegirla y a concluir que Meta no devolvió nada.
 */
export function ordenarCuentas(cuentas: readonly CuentaMeta[]): CuentaMeta[] {
  return [...cuentas].sort((a, b) => (b.campanias || 0) - (a.campanias || 0) || a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * Las cuentas que quedan al elegir una línea.
 *
 * Pasa una cuenta si tiene campañas de esa línea **o** si tiene campañas sin asignar (ver la nota
 * de arriba: si no, la pantalla esconde el único lugar donde se puede arreglar el estado que la
 * propia pantalla reclama).
 */
export function cuentasDeLinea(cuentas: readonly CuentaMeta[], linea: ElegidaLinea): CuentaMeta[] {
  if (linea === 'todas') return [...cuentas]
  return cuentas.filter((c) => c.lineas.includes(linea) || sinAsignarDe(c) > 0)
}

/** Las líneas que aparecen en una cuenta. Con `'todas'`, la unión de las de todas. */
export function lineasDeCuenta(cuentas: readonly CuentaMeta[], cuenta: ElegidaCuenta): LineaPauta[] {
  const suyas = cuenta === 'todas' ? cuentas : cuentas.filter((c) => c.id === cuenta)
  return [...new Set(suyas.flatMap((c) => c.lineas))]
}

/**
 * La cuenta vigente, después de resolver el cruce.
 *
 * 🔑 **Un cruce vacío vuelve a `'todas'`, no se queda mostrando cero.** La combinación
 * cuenta+línea de un link viejo (o de una campaña que se reasignó) puede no existir más; dejarla
 * puesta pinta una pantalla vacía que parece un problema de Meta y es un filtro.
 */
export function resolverCuenta(
  cuentas: readonly CuentaMeta[],
  linea: ElegidaLinea,
  pedida: ElegidaCuenta,
): ElegidaCuenta {
  if (pedida === 'todas') return 'todas'
  return cuentasDeLinea(cuentas, linea).some((c) => c.id === pedida) ? pedida : 'todas'
}

/**
 * **De qué cuenta se pide el parte del día en curso.**
 *
 * 🔴 **Existe porque «Hoy» y «Hoy y ayer» no andaban, y la causa era ésta.** El parte —lo único que
 * tiene el día en curso, porque la foto diaria sólo guarda días cerrados— **es de UNA cuenta
 * publicitaria**. El eje arranca en `'todas'` y `resolverCuenta` nunca autoselecciona, así que
 * entrando a la sección por el menú (sin `?cuenta=` en la URL) no había cuenta ⇒ no se pedía el
 * parte ⇒ las dos ventanas vivas caían a la foto de 7 días. Y como a la foto le piden lo mismo que
 * «7 días», la pantalla quedaba **idéntica** en las tres y sin salir ni un pedido: eso es *«cambio
 * la fecha y no cambia nada, tampoco actualiza»*.
 *
 * 🔑 **El criterio es el mismo que la zona ya usa para la línea**: «con una sola se elige sola; con
 * varias, se pide». Elegir por la persona cuando hay dos sería mostrarle medio gasto sin decírselo.
 *
 * ⚠️ Las candidatas son las cuentas donde esa línea **efectivamente pautea** (`c.lineas`), ⛔ no las
 * que ofrece el selector: aquél deja pasar también a las que tienen campañas sin asignar —para que
 * no desaparezca el único lugar donde se arregla eso— y esa cuenta no tiene por qué tener gasto de
 * esta línea hoy.
 *
 * Devuelve las candidatas además de la elegida para que la pantalla pueda **nombrarlas** cuando hay
 * más de una: «elegí una arriba» sin decir cuáles es la mitad de una instrucción.
 */
export function cuentaDelParte(
  cuentas: readonly CuentaMeta[],
  linea: LineaPauta | null,
  elegida: ElegidaCuenta,
): { cuenta: CuentaMeta | null; candidatas: CuentaMeta[] } {
  // Lo elegido a mano gana siempre: es la respuesta a una pregunta que ya se hizo.
  if (elegida !== 'todas') {
    return { cuenta: cuentas.find((c) => c.id === elegida) ?? null, candidatas: [] }
  }
  // Sin línea no hay parte que pedir: el gasto de dos líneas en una cuenta no es de ninguna.
  if (!linea) return { cuenta: null, candidatas: [] }
  const candidatas = cuentas.filter((c) => c.lineas.includes(linea))
  return { cuenta: candidatas.length === 1 ? candidatas[0] : null, candidatas }
}

/** Por qué la pantalla ⛔ no está mostrando el día en curso. `null` = lo está mostrando. */
export type SinVivo =
  | { tipo: 'pidiendo' }
  /** Meta contestó mal (token, 502, cupo). Es el único caso que de verdad es «Meta no contestó». */
  | { tipo: 'error'; motivo: string }
  /** La línea pautea en varias cuentas y el parte es de una sola: hay que elegir. */
  | { tipo: 'elegir'; cuentas: string[] }
  /** La línea no pautea en ninguna cuenta: no hay día en curso que pedir. */
  | { tipo: 'sin-cuenta' }

/**
 * **Por qué no hay día en curso**, para que el cartel diga la causa REAL.
 *
 * 🔴 El cartel decía siempre *«Meta todavía no contestó el día en curso»*, y en el caso que más
 * pasaba —entrar por el menú, sin cuenta elegida— **a Meta ni se le había preguntado**. Un cartel
 * que nombra mal la causa manda a revisar el token durante media hora.
 */
export function motivoSinVivo(
  fase: 'sin-cuenta' | 'cargando' | 'error' | 'ok',
  candidatas: readonly CuentaMeta[],
  motivo?: string | null,
): SinVivo | null {
  if (fase === 'ok') return null
  if (fase === 'cargando') return { tipo: 'pidiendo' }
  if (fase === 'error') return { tipo: 'error', motivo: motivo || 'no se pudo leer el parte' }
  return candidatas.length > 1
    ? { tipo: 'elegir', cuentas: candidatas.map((c) => c.nombre) }
    : { tipo: 'sin-cuenta' }
}

/**
 * La línea vigente. Mismo criterio que `resolverCuenta`, más el corte de permisos: una línea que
 * este perfil no puede ver no se queda elegida ni viniendo de la URL.
 *
 * ⚠️ El permiso lo sigue cortando el servidor. Esto es para que la pantalla no prometa una vista
 * que después vuelve 403.
 */
export function resolverLinea(
  visibles: readonly LineaPauta[],
  cuentas: readonly CuentaMeta[],
  cuenta: ElegidaCuenta,
  pedida: ElegidaLinea,
): ElegidaLinea {
  if (pedida === 'todas' || !visibles.includes(pedida)) return 'todas'
  if (cuenta === 'todas') return pedida
  const suyas = lineasDeCuenta(cuentas, cuenta)
  const laCuenta = cuentas.find((c) => c.id === cuenta)
  // La misma excepción que `cuentasDeLinea`: con campañas sin asignar, la línea se banca.
  if (suyas.includes(pedida) || (laCuenta && sinAsignarDe(laCuenta) > 0)) return pedida
  return 'todas'
}

/** Cuántas campañas cubre lo elegido hoy. Es lo que el selector muestra al lado, para que se vea. */
export function campaniasDe(cuentas: readonly CuentaMeta[], cuenta: ElegidaCuenta): number {
  const suyas = cuenta === 'todas' ? cuentas : cuentas.filter((c) => c.id === cuenta)
  return suyas.reduce((n, c) => n + (c.campanias || 0), 0)
}

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

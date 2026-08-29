/**
 * El DISPARADOR de una solicitud: qué proceso la hizo nacer.
 *
 * Es el tercer eje del modelo, y el que faltaba para que una sesión de fotos deje de ser un
 * evento suelto. Los otros dos ya estaban (`components/solicitudes/preset.ts`):
 *
 *   MOTIVO      = para qué sale (sesión de fotos, video, muestra…) — y elige el CAJÓN
 *   DESTINO     = si vuelve o no (retornable / consumo)            — y decide la APROBACIÓN
 *   DISPARADOR  = de dónde viene (ingreso · campaña · faltante)    — y NO cambia nada de eso
 *
 * 🔴 Que no cambie nada de eso es el punto: `presetPorMotivo` rutea comparando contra el
 * string exacto `'Sesión de fotos'`, y de ese ruteo depende a nombre de qué cliente de
 * Gestión Nube sale la venta. Meter faltante/campaña/ingreso adentro de `MOTIVOS` habría
 * mandado toda sesión nueva al cajón de Solicitudes internas. Son ejes distintos y viven
 * en campos distintos.
 *
 * De dónde sale el valor: de la PUERTA, no de una adivinanza. Hoy la app ya sabe por dónde
 * entró cada borrador y lo tiraba —Marketing deja pids en `ponerPuenteFotos`, el aviso de
 * ingreso siembra los pasos en la Agenda, la cola de faltantes todavía no existe— así que
 * lo único nuevo acá es ANOTARLO.
 */

import {
  DISPARADORES as DISPARADORES_JS,
  DISPARADOR_LABEL as DISPARADOR_LABEL_JS,
  esDisparador as esDisparadorJs,
  rotuloDisparador as rotuloDisparadorJs,
} from './disparador.core.js'

/**
 * 🔑 **La lista vive en `disparador.core.js`, no acá.** Bajó el 29-ago-2026 porque
 * `api/_agenda.js` la necesita para filtrar los moldes de la sesión de fotos, y un handler de
 * `api/` no puede importar TypeScript. Este archivo es el re-export tipado, el mismo molde que
 * `lib/permisos.ts` sobre `lib/permisos.core.js`.
 *
 * ⚠️ El tipo se escribe a mano porque un `.js` no lleva tipos literales. Lo que impide que las dos
 * puntas se separen ⛔ no es el compilador: es que `DISPARADOR_AYUDA` está tipado `Record<Disparador,
 * string>` y el test los recorre — un cuarto disparador agregado sólo en el `.js` se queda sin ayuda
 * y el test se pone rojo.
 */
export type Disparador = 'ingreso' | 'campania' | 'faltante'

export const DISPARADORES: readonly Disparador[] = DISPARADORES_JS as readonly Disparador[]

/**
 * El rótulo en la palabra del negocio. `campania` se escribe sin ñ en el código (es una
 * clave que viaja al KV y vuelve) y con ñ en la pantalla.
 */
export const DISPARADOR_LABEL: Record<Disparador, string> = DISPARADOR_LABEL_JS as Record<Disparador, string>

/** El rótulo, o la clave cruda si alguien guardó algo que ya no existe. */
export const rotuloDisparador: (key: string) => string = rotuloDisparadorJs

/**
 * Qué significa cada uno, y —sobre todo— de qué proceso viene. No es un rótulo largo: es
 * lo que distingue una sesión que alguien pidió de una que el proceso pidió solo.
 */
export const DISPARADOR_AYUDA: Record<Disparador, string> = {
  ingreso:
    'Llegó mercadería y hay que fotografiarla para poder publicarla. El proceso arranca en Ingresos: el aviso de ingreso siembra los pasos en la Agenda, y la foto es uno de ellos.',
  campania:
    'Marketing arma una producción con una idea propia (una campaña, un lanzamiento, una fecha). No la dispara ni un ingreso ni un hueco del catálogo: la decide Marketing.',
  faltante:
    'Un producto que ya está a la venta no tiene foto. A veces junta para una sesión entera y a veces se suma a una que ya estaba armada por otro motivo — por eso el faltante también puede vivir en un ítem suelto.',
}

/** ¿Es una de las tres? Se usa al leer del KV, donde puede haber cualquier cosa. */
export function esDisparador(v: unknown): v is Disparador {
  return esDisparadorJs(v)
}

/**
 * Por dónde entró el borrador. Es lo que traduce una PUERTA en un disparador, y el valor
 * de tenerlo acá es que la puerta que no sabe devuelve `null` en vez de inventar.
 *
 * 🔴 `marketing` devuelve `null` A PROPÓSITO: el botón «mandar a Sesión de fotos» de
 * Marketing sirve igual para una campaña que para tapar un faltante, así que la pantalla
 * tiene que PREGUNTAR. Poner `campania` por defecto sería afirmar algo que nadie dijo.
 */
export type Puerta = 'ingreso' | 'faltantes' | 'marketing' | 'manual'

export function disparadorPorPuerta(puerta: Puerta): Disparador | null {
  if (puerta === 'ingreso') return 'ingreso'
  if (puerta === 'faltantes') return 'faltante'
  return null
}

/**
 * El disparador de un ÍTEM. Ausente = el de la solicitud, que es el caso normal: una
 * sesión de ingreso donde los diez ítems vienen del ingreso no repite el dato diez veces.
 *
 * El ítem lo lleva propio solo cuando difiere — el faltante que se sumó a una sesión que
 * ya existía. Sin este campo ese caso no se puede escribir, y era el que Bruno marcó como
 * el más común de los tres.
 */
export function disparadorDeItem(
  sol: { disparador?: string | null },
  item: { disparador?: string | null },
): Disparador | null {
  if (esDisparador(item.disparador)) return item.disparador
  return esDisparador(sol.disparador) ? sol.disparador : null
}

/**
 * Todos los disparadores presentes en una solicitud, en el orden de `DISPARADORES` (no en
 * el orden en que aparecen los ítems, que depende de cómo se armó el borrador). El de la
 * solicitud entra siempre que exista, aunque ningún ítem lo repita.
 *
 * Es lo que deja que la fila del historial diga «Ingreso · Faltante» en vez de esconder
 * que esa sesión trajo dos procesos adentro.
 */
export function disparadoresDe(sol: {
  disparador?: string | null
  items?: { disparador?: string | null }[]
}): Disparador[] {
  const hay = new Set<Disparador>()
  if (esDisparador(sol.disparador)) hay.add(sol.disparador)
  for (const it of sol.items || []) if (esDisparador(it.disparador)) hay.add(it.disparador)
  return DISPARADORES.filter((d) => hay.has(d))
}

/**
 * ¿Esta solicitud cuenta para el filtro `d`? Cuenta si el disparador es el de la solicitud
 * o el de cualquiera de sus ítems: buscar «faltante» tiene que encontrar también los
 * faltantes que se colaron en una sesión de ingreso — si no, el filtro miente por omisión
 * justo en el caso que motivó el campo.
 */
export function tieneDisparador(
  sol: { disparador?: string | null; items?: { disparador?: string | null }[] },
  d: Disparador,
): boolean {
  return disparadoresDe(sol).includes(d)
}

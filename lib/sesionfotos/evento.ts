/**
 * La sesión de fotos como EVENTO — la Fase 2 del octavo (4-sep-2026).
 *
 * 🔑 **El pedido de Bruno da vuelta el objeto.** Hasta hoy **la solicitud ES la sesión** (1 a 1);
 * él lo pidió al revés: *«sesión de fotos es un evento […] con modelo, fecha, hora, tiempo
 * aproximado. Dentro de la misma además tiene que poder solicitarse varias solicitudes de
 * productos»*. Acá la sesión pasa a ser el **padre** y las solicitudes son **hijas**.
 *
 * Y ya había un caso real esperándolo desde otro lado: una sesión que fotografía **Zattia y
 * Stunned son dos solicitudes**, porque el catálogo se corta por línea a propósito.
 *
 * ## ⛔ Sin una sola migración
 *
 * El evento es un **`kind` nuevo (`sesion-evento`) en la MISMA tabla `solicitudes`**, ⛔ no una
 * tabla aparte. Verificado el 3-sep: `sql/migrate-solicitudes.sql` ⛔ **no tiene CHECK** sobre
 * `kind` ni sobre `estado` —la única lista blanca vive en `KINDS` de `api/_solicitudes.js`— ⇒
 * sumar un valor es **una línea**. `filaDe` sirve tal cual porque el evento también tiene `id`,
 * `fecha`, `estado`, `creado` y `creadoPor`, y reusa `leerCajon`/`diffSolicitudes`/`aplicarDiff`
 * y el permiso `sesion-fotos`, sin gastar una de las 12 funciones de Vercel.
 *
 * `Solicitud` suma **un solo campo**: `eventoId?`. Ausente = solicitud suelta, que es como quedan
 * todas las existentes: se siguen abriendo igual, **sin backfill**.
 *
 * ## 🔴 Lo que este archivo NO hace
 *
 * - ⛔ **No siembra en la Agenda desde acá.** 🆕 Desde la **Fase 5** (4-sep-2026) el que siembra
 *   **es el evento**, pero la decisión vive en `evento.core.js` (`siembraDeSesion`) y la ejecuta el
 *   handler: es el único lugar que sabe que la fila es **nueva**, y sembrar en cada guardado le
 *   tiraría los nueve pasos encima a tres personas cada vez que alguien corrige la hora. 🔴 Y por
 *   eso mismo la **hija ⛔ no siembra**: un evento con tres solicitudes sembraría **cuatro veces**
 *   los mismos nueve pasos.
 * - ⛔ **No toca el motor compartido con Administración.** El motor carga **por `kind`** y este es
 *   uno nuevo que Solicitudes internas ⛔ no pide nunca.
 * - ⚠️ **Editar la fecha del evento ⛔ no reescribe las hijas ya creadas.** Se corrige a mano, y la
 *   pantalla lo dice: reescribirlas pisaría una fecha que alguien pudo haber corregido a propósito.
 */

import { horaNormalizada } from './evento.core.js'
import type { Disparador } from '../solicitudes/disparador'
import type { ItemBanco } from './banco'
import type { ModeloSesion, Solicitud } from './tipos'

/**
 * El ciclo del evento, y son sólo dos.
 *
 * 🔑 **⛔ No copia el ciclo de la solicitud** (pendiente/preparada/cargada/devuelta/cerrada): el
 * evento ⛔ no retira ni devuelve nada — eso lo hacen las hijas. Lo único que se sabe de él es si
 * todavía está por hacerse o si ya pasó.
 */
export type EstadoEvento = 'planificado' | 'cerrado'

export type SesionEvento = {
  id: string
  /** YYYY-MM-DD. El día de la sesión. */
  fecha: string
  /**
   * `HH:MM` en 24 h. **Ausente = todavía no se sabe**, ⛔ no «a las 00:00»: la hora se define
   * cuando la modelo confirma, y hasta entonces el evento existe igual con su fecha.
   */
  hora?: string
  /** El «tiempo aproximado» que pidió Bruno, en minutos. Ausente = no se estimó. */
  duracionMin?: number
  /** La misma ficha que ya viaja en la solicitud (`ModeloSesion`), ⛔ no un tipo paralelo. */
  modelo?: ModeloSesion
  /** De qué proceso viene: faltante · campaña · ingreso. Los tres motivos que nombró Bruno. */
  disparador?: Disparador
  descripcion: string
  estado: EstadoEvento
  /**
   * Los candidatos de la sesión: lo que se puso sobre la mesa para armar los looks, **antes de
   * pedir nada** (Fase 3). Ausente = todavía nadie lo llenó, que es como nacen todos los eventos
   * y ⛔ no un dato faltante. Ver `lib/sesionfotos/banco.ts`.
   */
  banco?: ItemBanco[]
  creado: number
  creadoPor: string
}

/** Lo mínimo para dar de alta un evento. Lo demás se completa después, y eso es a propósito. */
export type AltaEvento = {
  id: string
  fecha: string
  creado: number
  creadoPor: string
  descripcion?: string
  hora?: string | null
  duracionMin?: number | null
  disparador?: Disparador | null
}

/**
 * Normaliza una hora a `HH:MM` en 24 h, o `null` si ⛔ no se puede leer como hora.
 *
 * 🔑 **Se MUDÓ a `evento.core.js`** el 4-sep-2026 y acá se re-exporta: desde la Fase 5 la hora
 * entra al **título de un pendiente de la Agenda**, que lo arma `api/_solicitudes.js` — y un
 * handler ⛔ no puede importar TypeScript. Escribirla dos veces es la forma exacta en que la hora
 * que dibuja la pantalla y la que sale al pendiente terminan diciendo cosas distintas.
 */
export { horaNormalizada }

/**
 * Los minutos de duración, o `null` si ⛔ no es un número de minutos que signifique algo.
 *
 * 🔑 **El cero ⛔ no es una duración: es «no lo sé»** y se guarda como ausente. Una sesión que
 * «dura 0 minutos» ⛔ no existe, y dejarlo entrar haría que `finEstimado` dijera que termina a la
 * misma hora que empieza.
 */
export function duracionNormalizada(v: unknown): number | null {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n) || n <= 0) return null
  // Un día entero de sesión ya es raro; más que eso es un dedo de más al tipear.
  return n > 24 * 60 ? null : n
}

/** Crea el evento. Nace `planificado`, y lo que no se sabe todavía queda AUSENTE, ⛔ no vacío. */
export function crearEvento(a: AltaEvento): SesionEvento {
  const hora = horaNormalizada(a.hora)
  const dur = duracionNormalizada(a.duracionMin)
  const disp = a.disparador ? { disparador: a.disparador } : {}
  return {
    id: a.id,
    fecha: a.fecha,
    ...(hora ? { hora } : {}),
    ...(dur ? { duracionMin: dur } : {}),
    ...disp,
    descripcion: String(a.descripcion || '').trim(),
    estado: 'planificado',
    creado: a.creado,
    creadoPor: a.creadoPor,
  }
}

/**
 * Pone (o suelta, con `null`) la hora.
 *
 * 🔑 **Soltar BORRA la clave**, igual que la corrección de zona de los outfits: con la clave en
 * `null`/`''` el evento queda «con una hora que no es ninguna», y lo que se quiere decir es que
 * **todavía no se sabe**.
 */
export function conHora(e: SesionEvento, v: unknown): SesionEvento {
  const hora = horaNormalizada(v)
  if (!hora) {
    if (e.hora == null) return e
    const { hora: _fuera, ...resto } = e
    return resto
  }
  return { ...e, hora }
}

/** Pone (o suelta) la duración estimada, en minutos. */
export function conDuracion(e: SesionEvento, v: unknown): SesionEvento {
  const dur = duracionNormalizada(v)
  if (!dur) {
    if (e.duracionMin == null) return e
    const { duracionMin: _fuera, ...resto } = e
    return resto
  }
  return { ...e, duracionMin: dur }
}

/** Cambia la fecha. ⚠️ ⛔ NO toca las hijas ya creadas: ver la cabecera del archivo. */
export function conFechaEvento(e: SesionEvento, fecha: string): SesionEvento {
  const f = String(fecha || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(f) && f !== e.fecha ? { ...e, fecha: f } : e
}

/** Cambia la descripción, que es con lo que una persona reconoce la sesión en la lista. */
export function conDescripcionEvento(e: SesionEvento, d: string): SesionEvento {
  const t = String(d || '').trim()
  return t === e.descripcion ? e : { ...e, descripcion: t }
}

/** Pone el disparador, o lo suelta con `null` (y ahí la clave se borra, no queda en null). */
export function conDisparadorEvento(e: SesionEvento, d: Disparador | null): SesionEvento {
  if (!d) {
    if (e.disparador == null) return e
    const { disparador: _fuera, ...resto } = e
    return resto
  }
  return { ...e, disparador: d }
}

/** Cierra el evento, o lo vuelve a abrir. */
export function conEstadoEvento(e: SesionEvento, estado: EstadoEvento): SesionEvento {
  return e.estado === estado ? e : { ...e, estado }
}

/**
 * Cambia el banco del evento. **Un banco vacío BORRA la clave**, ⛔ no la deja en `[]`: el evento
 * vuelve a decir «todavía nadie lo llenó», que es lo que quiere decir, y el diff del cajón queda
 * igual que el de un evento que nunca tuvo banco.
 */
export function conBanco(e: SesionEvento, banco: ItemBanco[]): SesionEvento {
  if (!banco || !banco.length) {
    if (e.banco == null) return e
    const { banco: _fuera, ...resto } = e
    return resto
  }
  return { ...e, banco }
}

/** Las solicitudes hijas de un evento, en el orden en que se crearon. */
export function hijasDe(sols: Solicitud[], eventoId: string): Solicitud[] {
  return (sols || []).filter((s) => s.eventoId === eventoId).sort((a, b) => (a.creado || 0) - (b.creado || 0))
}

/**
 * Las solicitudes SUELTAS: las que ⛔ no cuelgan de ningún evento.
 *
 * 🔴 **Una hija cuyo evento ⛔ no está en la lista sigue siendo suelta acá**, y es a propósito: si
 * alguien elimina el evento, sus solicitudes ⛔ no pueden desaparecer de la pantalla — son retiros
 * reales, con venta en Gestión Nube. Desaparecer es peor que quedar sueltas.
 */
export function sueltas(sols: Solicitud[], eventos: SesionEvento[]): Solicitud[] {
  const vivos = new Set((eventos || []).map((e) => e.id))
  return (sols || []).filter((s) => !s.eventoId || !vivos.has(s.eventoId))
}

/**
 * La hora a la que termina, según lo estimado. `null` si falta la hora **o** la duración.
 *
 * 🔴 **Con una sola de las dos ⛔ no se contesta.** Suponer «arranca a las 0» o «dura una hora»
 * sería el sistema inventando el dato que la pantalla iba a mostrar como si alguien lo hubiera
 * cargado.
 */
export function finEstimado(e: SesionEvento): string | null {
  if (!e.hora || !e.duracionMin) return null
  const [h, m] = e.hora.split(':').map(Number)
  const total = h * 60 + m + e.duracionMin
  // Pasada la medianoche se sigue contando: una sesión que arranca 23:00 y dura 2 h termina 01:00.
  const fin = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  return `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`
}

/**
 * La duración en la palabra de una persona: `90` → `1 h 30`. `null` cuando ⛔ no se estimó.
 * Vive acá y ⛔ no en la pantalla para que las dos que la muestren digan lo mismo.
 */
export function duracionEnPalabras(min: number | undefined | null): string | null {
  const n = duracionNormalizada(min)
  if (!n) return null
  const h = Math.floor(n / 60)
  const m = n % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/**
 * El renglón con el que se reconoce un evento: cuándo es y cuánto dura.
 *
 * ⛔ **Lo que falta ⛔ no se rellena**: sin hora dice sólo la fecha, en vez de una hora inventada.
 */
export function cuandoDe(e: SesionEvento): string {
  const dur = duracionEnPalabras(e.duracionMin)
  const fin = finEstimado(e)
  if (!e.hora) return dur ? `${e.fecha} · ${dur}` : e.fecha
  const tramo = fin ? `${e.hora} a ${fin}` : e.hora
  return dur ? `${e.fecha} · ${tramo} (${dur})` : `${e.fecha} · ${tramo}`
}

/**
 * ¿Se puede eliminar el evento? Devuelve el motivo por el que ⛔ no, o `null` si sí.
 *
 * 🔴 **Un evento con hijas ⛔ no se elimina de un click.** Las hijas son retiros con venta en
 * Gestión Nube: el que borra el evento creyendo que «cancela la sesión» dejaría la mercadería
 * separada y sin nadie que la devuelva. Primero se resuelven las hijas.
 */
export function bloqueoEliminarEvento(e: SesionEvento, sols: Solicitud[]): string | null {
  const n = hijasDe(sols, e.id).length
  if (!n) return null
  return n === 1
    ? 'Esta sesión tiene una solicitud de productos colgada. Resolvela o sacala de la sesión antes de eliminarla.'
    : `Esta sesión tiene ${n} solicitudes de productos colgadas. Resolvelas o sacalas de la sesión antes de eliminarla.`
}

/** Saca el evento de la lista. El guard de arriba se pregunta ANTES, en la pantalla. */
export function sinEvento(eventos: SesionEvento[], id: string): SesionEvento[] {
  return (eventos || []).filter((e) => e.id !== id)
}

/** Mete o reemplaza un evento en la lista, ordenada por fecha descendente (lo próximo arriba). */
export function conEvento(eventos: SesionEvento[], e: SesionEvento): SesionEvento[] {
  const otros = (eventos || []).filter((x) => x.id !== e.id)
  return [...otros, e].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (b.creado || 0) - (a.creado || 0)))
}

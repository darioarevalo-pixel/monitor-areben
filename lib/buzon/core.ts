/**
 * El buzón, del lado de la pantalla. Puro y con tests.
 *
 * # La regla que importa está acá y no en Envíos
 *
 * 🔴 **El freno es una regla, no un `filter` adentro del JSX.** Lo que decide si un paquete se puede
 * despachar —«esta clienta escribió y nadie contestó»— tiene que poder mutarse en un test y tiene
 * que valer igual en la bandeja y en la hoja del día. Escrito adentro del render, la segunda
 * pantalla que lo necesite lo copia con una condición de menos y el freno desaparece en la mitad de
 * los casos, sin que falle nada.
 */

import { llaveDeOrden } from './reglas.core.js'
import type { EnvioConOrden, IndiceAbiertos, MensajeBuzon } from './tipos'

export { llaveDeOrden, normalizarOrden } from './reglas.core.js'

/**
 * Los estados a los que **no se puede llegar** con un mensaje abierto sin que alguien lo mire.
 *
 * Los tres son el paquete avanzando: se arma, sale, llega. `no_entregado` y el «Corregir» de los
 * cerrados NO están y es a propósito: son correcciones de algo que ya pasó, y preguntar ahí sería
 * un cartel que no cambia ninguna decisión — el ruido que hace que se aprieten sin leer.
 */
export const ESTADOS_QUE_DESPACHAN = ['preparado', 'en_transito', 'entregado'] as const

/** ¿Este cambio de estado hace avanzar el paquete? */
export function frenaElDespacho(estadoDestino: string): boolean {
  return (ESTADOS_QUE_DESPACHAN as readonly string[]).includes(estadoDestino)
}

/**
 * El índice de lo que está SIN resolver, por orden.
 *
 * Se arma una vez y se consulta por fila: la hoja del día son decenas de filas y recorrer la lista
 * entera en cada una es el `O(n²)` que nadie ve hasta que la bandeja crece.
 */
export function indiceDeAbiertos(mensajes: MensajeBuzon[]): IndiceAbiertos {
  const ix: IndiceAbiertos = new Map()
  for (const m of mensajes || []) {
    if (m.resuelto) continue
    const k = llaveDeOrden(m.store, m.orden_numero)
    // Sin orden no se ata a ningún envío. Sigue visible en el Buzón: ver `tipos.ts`.
    if (!k) continue
    const ya = ix.get(k)
    if (ya) ya.push(m)
    else ix.set(k, [m])
  }
  return ix
}

/**
 * Los mensajes abiertos de un envío.
 *
 * 🔴 **`indice` es un parámetro obligatorio, no un opcional con default `new Map()`.** Con default,
 * una pantalla nueva que se olvide de pasarlo compila, corre, y contesta «no hay mensajes» para
 * todo: el freno se apaga entero y en silencio. Obligatorio, esa pantalla no compila.
 */
export function abiertosDe(envio: EnvioConOrden, indice: IndiceAbiertos): MensajeBuzon[] {
  const k = llaveDeOrden(envio.store, envio.orden_numero)
  return k ? indice.get(k) || [] : []
}

/** Atajo para la pastilla: ¿esta fila tiene algo sin resolver? */
export function tieneAbierto(envio: EnvioConOrden, indice: IndiceAbiertos): boolean {
  return abiertosDe(envio, indice).length > 0
}

/**
 * El cartel que se le muestra a quien está por despachar.
 *
 * ⚠️ **Avisa y deja pasar.** Mismo criterio que la advertencia de duplicado de Integraciones: un
 * freno duro deja al mostrador sin salida un sábado a la tarde, y lo que se necesita es que la
 * persona LEA, no que no pueda trabajar. El texto lleva el asunto —o el arranque del cuerpo— porque
 * un cartel que dice «hay un mensaje» sin decir cuál se aprende a apretar sin mirar.
 */
export function avisoDeDespacho(mensajes: MensajeBuzon[]): { titulo: string; mensaje: string } {
  const n = mensajes.length
  const titulo = n === 1 ? 'Esta clienta escribió y nadie lo resolvió' : `Esta clienta escribió ${n} veces y nadie lo resolvió`
  const cuerpo = mensajes.slice(0, 3).map((m) => `· ${resumenDe(m)}`).join('\n')
  const mas = n > 3 ? `\n· y ${n - 3} más` : ''
  return { titulo, mensaje: `${cuerpo}${mas}\n\nSi el paquete sale así, sale sin lo que pidió.` }
}

/** Una línea que identifica al mensaje: el asunto, o el arranque del cuerpo si no tiene. */
export function resumenDe(m: MensajeBuzon): string {
  const texto = (m.asunto || '').trim() || (m.cuerpo || '').trim().replace(/\s+/g, ' ')
  return texto.length > 120 ? `${texto.slice(0, 117)}…` : texto || '(sin texto)'
}

/**
 * Ordena la bandeja: primero lo sin resolver, y adentro lo más viejo arriba.
 *
 * 🔑 **Lo más viejo arriba, al revés que casi toda lista del monitor.** Acá el que espera hace más
 * es el que más urge: un mail del domingo que sigue abierto el martes es exactamente el caso que
 * esta sección viene a que no pase.
 */
export function ordenarBandeja(mensajes: MensajeBuzon[]): MensajeBuzon[] {
  return [...(mensajes || [])].sort((a, b) => {
    if (a.resuelto !== b.resuelto) return a.resuelto ? 1 : -1
    const ta = Date.parse(a.recibido_en) || 0
    const tb = Date.parse(b.recibido_en) || 0
    // Los resueltos se leen como historial: ahí sí lo último primero.
    return a.resuelto ? tb - ta : ta - tb
  })
}

/** Hace cuánto que espera, en palabras. `null` cuando la fecha no se entiende. */
export function haceCuanto(iso: string, ahora: number): string | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const min = Math.floor((ahora - t) / 60000)
  if (min < 0) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}

/**
 * Lo que espera un `<input type="datetime-local">`, desde una fecha.
 *
 * Se construye con los getters LOCALES a propósito: el input muestra y devuelve hora local, y
 * `toISOString().slice(0, 16)` —el atajo que sale solo— muestra UTC. En Argentina eso es la hora
 * corrida tres horas, así que un mail de las 21:00 del domingo se cargaría como las 00:00 del lunes:
 * el día equivocado, justo en el dato del que depende todo esto.
 */
export function aInputLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** El camino de vuelta: lo que tipeó la persona (hora local) al ISO que guarda la base. */
export function desdeInputLocal(v: string): string | null {
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

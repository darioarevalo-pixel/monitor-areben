/**
 * El mazo de la «Asignación rápida» de ⭐: pasar los productos de a uno, con la foto grande, y
 * marcar los productos estrella sin entrar a cada uno.
 *
 * De dónde sale, dicho por Bruno (25-sep-2026): *«sino tengo que entrar a las fotos una por una de
 * cada producto, para ver cómo es, y si es un ganador. pq el ganador puede ser por ventas, es decir
 * desde afuera, o se puede identificar favorito desde el inicio apostando por un producto»*. Y
 * pidió que Análisis → Por producto ⛔ **no cambie de estructura**: esto es un modo que se abre
 * encima de la tabla y pasa **lo que la tabla tiene filtrado**, en su orden.
 *
 * Es lógica pura para poder testearla sin pantalla. La pantalla vive en
 * `components/destacados/AsignacionRapida.tsx`.
 *
 * # Las decisiones
 *
 *  1. 🔴 **MOVERSE ⛔ ESCRIBE.** ← y → son anterior y siguiente, nada más; la ⭐ es un gesto aparte
 *     (↑ / Enter / el botón) que prende o apaga la del producto que se está mirando.
 *     La 1ª versión (25-sep) era de Tinder —← pasar, → ⭐ y seguir— y **las dos flechas avanzaban**:
 *     Bruno usó → para moverse, como en cualquier galería, y **marcó 7 productos sin querer** en 7
 *     segundos (26-sep). *«me gusta usar la flecha para poder ir moviendo fácilmente»*.
 *  2. **Sin foto se saltea.** El modo existe para mirar; un producto sin foto se decide en la tabla.
 *  3. **«¿Tiene ⭐?» lo contesta primero lo que ESTA pasada escribió**, y después la lista del
 *     servidor, que tarda ~1 s en volver: sin esto, apretar ↑ dos veces seguidas mandaba dos
 *     «marcar» (caminado en prod el 26-sep con la versión anterior).
 */

/** Lo que la pantalla tiene que escribir en la base. */
export type Escritura = 'marcar' | 'sacar'

export interface Carta<T> {
  p: T
  imagenes: string[]
}

/** Las cartas, en el orden en que vienen, salteando las que ⛔ tienen foto (decisión 2). */
export function armarMazo<T>(productos: T[], fotosDe: (p: T) => string[]): Carta<T>[] {
  const out: Carta<T>[] = []
  for (const p of productos) {
    const imagenes = fotosDe(p).filter(Boolean)
    if (imagenes.length) out.push({ p, imagenes })
  }
  return out
}

/**
 * Anterior (−1) o siguiente (+1). `i === total` es la pantalla de «terminaste», a la que se llega
 * con → desde la última carta; de ahí ← vuelve a la última. ⛔ Da la vuelta: llegar al final tiene
 * que notarse.
 */
export function mover(i: number, total: number, delta: -1 | 1): number {
  return Math.min(total, Math.max(0, i + delta))
}

/** ¿Tiene ⭐ este producto? Lo escrito en esta pasada gana sobre la lista (decisión 3). */
export function tieneEstrella(pid: string, propias: ReadonlyMap<string, boolean>, lista: { has(pid: string): boolean }): boolean {
  return propias.get(pid) ?? lista.has(pid)
}

/** El interruptor: qué hay que escribir para dar vuelta la ⭐ de un producto. */
export function alternarEstrella(tiene: boolean): Escritura {
  return tiene ? 'sacar' : 'marcar'
}

/** Cuántos productos quedaron con ⭐ por esta pasada y ⛔ la tenían al abrir. */
export function marcadas(propias: ReadonlyMap<string, boolean>, teniaAlAbrir: ReadonlySet<string>): number {
  let n = 0
  for (const [pid, con] of propias) if (con && !teniaAlAbrir.has(pid)) n++
  return n
}

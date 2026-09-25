/**
 * El mazo de la «Asignación rápida» de ⭐: pasar los productos de a uno, con la foto grande, y
 * deslizar a la derecha para marcarlo como producto estrella o a la izquierda para pasarlo.
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
 *  1. 🔴 **Pasar ⛔ es desmarcar.** Uno que ya tenía ⭐ y se desliza a la izquierda la conserva: el
 *     mazo es para APOSTAR rápido, y una estrella que puso otra persona (o uno mismo la semana
 *     pasada) no se borra por pasar de largo. Sacarla es un gesto explícito, con la ★ de la fila.
 *  2. **Marcar uno que ya estaba ⛔ escribe nada.** Avanza igual, pero ⛔ cuenta como marcado por
 *     esta pasada y deshacerlo ⛔ se la saca.
 *  3. **Deshacer sólo revierte lo que ESTA pasada escribió** — y por eso la acción viaja explícita
 *     (`marcar`/`sacar`), ⛔ derivada del estado de la lista: el guardado corre detrás mientras la
 *     persona sigue deslizando, y la lista puede no haber vuelto todavía.
 *  4. **Sin foto se saltea.** El modo existe para mirar; un producto sin foto se decide en la tabla.
 */

export type Gesto = 'estrella' | 'pasar'

/** Lo que la pantalla tiene que escribir en la base después de un gesto. */
export type Escritura = 'marcar' | 'sacar' | null

export interface Carta<T> {
  p: T
  imagenes: string[]
}

export interface Paso {
  /** Índice de la carta sobre la que se hizo el gesto. */
  i: number
  gesto: Gesto
  /** `true` si este gesto escribió una ⭐ nueva (y deshacerlo tiene que sacarla). */
  escribio: boolean
}

export interface EstadoMazo {
  /** La carta que se está mirando. `i === total` es «terminaste». */
  i: number
  historia: Paso[]
}

export const MAZO_INICIAL: EstadoMazo = { i: 0, historia: [] }

/** Las cartas, en el orden en que vienen, salteando las que ⛔ tienen foto (decisión 4). */
export function armarMazo<T>(productos: T[], fotosDe: (p: T) => string[]): Carta<T>[] {
  const out: Carta<T>[] = []
  for (const p of productos) {
    const imagenes = fotosDe(p).filter(Boolean)
    if (imagenes.length) out.push({ p, imagenes })
  }
  return out
}

/**
 * Un gesto sobre la carta actual. `yaTenia` es si ese producto ya tenía ⭐ antes del gesto.
 * Sin cartas por delante ⛔ hace nada.
 */
export function decidir(
  e: EstadoMazo,
  total: number,
  gesto: Gesto,
  yaTenia: boolean,
): { estado: EstadoMazo; escritura: Escritura } {
  if (e.i >= total) return { estado: e, escritura: null }
  const escribio = gesto === 'estrella' && !yaTenia
  return {
    estado: { i: e.i + 1, historia: [...e.historia, { i: e.i, gesto, escribio }] },
    escritura: escribio ? 'marcar' : null,
  }
}

/** Vuelve a la carta anterior. Si ese gesto había escrito una ⭐, hay que sacarla (decisión 3). */
export function deshacer(e: EstadoMazo): { estado: EstadoMazo; escritura: Escritura; i: number | null } {
  const ultimo = e.historia[e.historia.length - 1]
  if (!ultimo) return { estado: e, escritura: null, i: null }
  return {
    estado: { i: ultimo.i, historia: e.historia.slice(0, -1) },
    escritura: ultimo.escribio ? 'sacar' : null,
    i: ultimo.i,
  }
}

/** Cuántas ⭐ nuevas puso esta pasada. */
export function marcadas(e: EstadoMazo): number {
  return e.historia.filter((h) => h.escribio).length
}

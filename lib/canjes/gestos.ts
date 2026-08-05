/**
 * La matemática del deslizar, aparte del componente.
 *
 * Es lo único del visor de fotos que puede estar mal de una forma que no se ve mirando la pantalla:
 * un umbral mal puesto hace que un toque cuente como gesto, y no exigir que el movimiento sea
 * horizontal hace que **scrollear cambie de foto**. Las dos cosas se prueban sin abrir un navegador.
 */

export type Punto = { x: number; y: number }

/**
 * Hacia dónde pasó el dedo: `1` a la siguiente, `-1` a la anterior, `0` si no fue un gesto.
 *
 * Dos condiciones, y las dos importan: que haya recorrido lo suficiente (un toque tiembla unos
 * pocos píxeles y no es un gesto) y que **lo horizontal le gane a lo vertical**. Sin lo segundo,
 * arrastrar la pantalla para leer más abajo pasaría de foto.
 */
export function direccionDelSwipe(inicio: Punto, fin: Punto, umbral = 40): -1 | 0 | 1 {
  const dx = fin.x - inicio.x
  const dy = fin.y - inicio.y
  if (Math.abs(dx) < umbral) return 0
  if (Math.abs(dx) <= Math.abs(dy)) return 0
  return dx < 0 ? 1 : -1
}

/**
 * En qué foto queda al moverse `paso` lugares. **No da la vuelta**: llegar al final y que vuelva a
 * la primera se lee como que se perdió el lugar, y con cuatro fotos nadie está buscando un carrusel
 * infinito.
 */
export function moverIndice(actual: number, paso: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(total - 1, Math.max(0, actual + paso))
}

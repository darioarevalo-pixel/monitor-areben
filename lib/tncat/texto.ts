/**
 * Cómo se cuenta en palabras lo que le pasa a un producto, en el renglón de la lista.
 *
 * Estaba escrito adentro del JSX y decía mal tres cosas a la vez. El caso que lo destapó fue
 * `SWEATER MONTEREY` (Zattia): dos variantes —BEIGE y NEGRO— y ninguna foto cargada. El renglón
 * imprimía, literal y sin espacio en el medio:
 *
 *     2 sin foto propiaEl producto no tiene ninguna foto cargada — subilas en Carga de imágenes…
 *
 * 1. **"2 sin foto propia" no dice de qué son los 2.** Y acá importa: en Zattia 258 de los 292
 *    productos con color tienen una sola variante por color —no hay talle ni modelo—, así que ahí
 *    variante = color; en BDI es mitad y mitad. La frase tiene que traer su unidad y adaptarse
 *    sola, en vez de dejar que cada uno adivine con qué se está midiendo.
 * 2. **Las dos frases salían pegadas**, porque en el JSX eran dos expresiones consecutivas sin
 *    separador entre ellas.
 * 3. **Decían lo mismo dos veces.** Un producto sin ninguna foto tiene, por definición, todas sus
 *    variantes sin foto: contarlas aparte no agrega nada y el badge rojo ya lo anuncia.
 *
 * Está acá y no en el componente para poder probarlo sin montar React, como el resto de
 * `lib/tncat/`.
 */

import type { EstadoFotos } from './auditoria'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * Una frase del renglón. `grave` marca el error que **engaña al cliente** —compra un color y
 * recibe otro— y por eso se destaca en rojo. Es una diferencia de gravedad real, no de estilo:
 * un color sin foto se nota al mirar la tienda, una foto cruzada no se nota hasta el reclamo.
 */
export type FraseProblema = { texto: string; grave?: boolean }

/**
 * Las frases del renglón, en orden de gravedad. La pantalla las une con ` · `.
 *
 * Vacío = no se detectó nada; eso lo cuenta el renglón aparte, porque ahí lo que hay que decir no
 * es qué está roto sino cuánto habría en juego si lo estuviera.
 */
export function frasesDeProblema(e: EstadoFotos): FraseProblema[] {
  // Un producto sin ninguna foto se explica solo. Sumarle el detalle por color sería contar dos
  // veces el mismo hecho, y el renglón terminaba diciéndolo dos veces seguidas.
  if (e.sinNingunaFoto) return [{ texto: 'No tiene ninguna foto cargada: en la tienda se ve en blanco.', grave: true }]

  const out: FraseProblema[] = []
  if (e.variantesCruzadas > 0) {
    out.push({
      texto: plural(e.variantesCruzadas, 'publicación con la foto de otro color', 'publicaciones con la foto de otro color'),
      grave: true,
    })
  }
  if (e.sinFoto.length > 0) {
    out.push({ texto: plural(e.sinFoto.length, 'color sin foto propia', 'colores sin foto propia') })
  }
  // El color sí está fotografiado: lo que falta es pegarle esa foto a algún talle o modelo.
  if (e.variantesParciales > 0) {
    out.push({ texto: plural(e.variantesParciales, 'variante sin la foto de su color', 'variantes sin la foto de su color') })
  }
  return out
}

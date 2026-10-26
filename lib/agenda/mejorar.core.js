// «Ordenar con IA» de la descripción de una tarea (Darío, 25-oct-2026): le da el texto escrito
// apurado y lo devuelve claro y ordenado. ⛔ No agrega datos: sólo ordena lo que ya está dicho.

export const MAX_DESCRIPCION = 1500

export const SISTEMA = `Sos quien redacta las tareas internas de una empresa argentina (accesorios de celular y ropa) para su equipo operativo.
Te llega la descripción de una tarea escrita apurada. Devolvé la misma descripción clara, precisa y ordenada.
Reglas:
- Usá SÓLO lo que dice el texto. No inventes pasos, cantidades, lugares, horarios ni nombres.
- Español rioplatense, voseo, frases cortas, tono directo y amable.
- Si hay varios pasos, ponelos en líneas que empiecen con "- ", en el orden en que conviene hacerlos.
- Si hay algo urgente o una condición importante, ponelo primero.
- Sin saludos, sin títulos, sin explicaciones tuyas, sin comillas. Devolvé sólo el texto final.`

/** Lo que llega del navegador, limpio: texto, sin espacios de más, con tope. */
export function descripcionLimpia(x) {
  return String(x == null ? '' : x).replace(/\r/g, '').trim().slice(0, MAX_DESCRIPCION)
}

/** El texto del modelo, sin comillas ni vallas de código que a veces agrega. */
export function respuestaLimpia(t) {
  return String(t == null ? '' : t)
    .trim()
    .replace(/^```[a-z]*\n?|```$/g, '')
    .trim()
    .replace(/^["“](.*)["”]$/s, '$1')
    .trim()
    .slice(0, MAX_DESCRIPCION * 2)
}

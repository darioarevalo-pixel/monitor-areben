/**
 * Lo único de las líneas que es de **Meta Ads**: adivinar la línea mirando el NOMBRE de una campaña.
 *
 * # Qué se fue de acá, y por qué
 *
 * `LINEAS`, `ETIQUETA_LINEA`, `esLinea`, `baseDeLinea` y `lineasDeMarca` nacieron en este archivo y
 * **no eran de Meta Ads**: la misma pregunta se la hacen el memo, Norte, los conteos, el mapa de
 * SKU, Canjes, el sync de Tienda Nube y el ETL del navegador. Se mudaron a **`lib/lineas.core.js`**
 * el 22-ago-2026 y acá quedan re-exportadas, para no tocar a los ~15 archivos que ya importan de
 * este camino. La única regla que se queda es `sugerirLinea`, que sí es local: habla de cómo se
 * escriben los nombres de campaña, no de qué es una línea.
 *
 * # Por qué el eje de esta sección es la línea y no la marca
 *
 * BDI, Zattia y Stunned se pautean **todas desde la misma cuenta publicitaria**. La versión anterior
 * atribuía la plata con un mapa `cuenta → marca` (`MARCA_POR_CUENTA`), y para una cuenta compartida
 * ese mapa no tiene ningún valor correcto: cualquiera que se cargue le regala a una marca la pauta
 * de las tres. La unidad de atribución real es la **campaña**, y no se puede deducir de nada que hoy
 * traiga la Graph API: la pone una persona.
 */

export { LINEAS, ETIQUETA_LINEA, esLinea, baseDeLinea, lineasDeMarca } from '../lineas.core.js'

/**
 * Qué línea PARECE ser una campaña, mirando su nombre.
 *
 * ⚠️ **Sugiere, no decide.** El valor que devuelve prellena el botón de la pantalla y ahí termina:
 * lo que queda guardado es lo que una persona confirmó. Ante un nombre ambiguo (nombra a dos líneas)
 * o que no matchea nada, devuelve `null` y la campaña se queda «sin asignar», que es un estado real
 * y no una falla.
 *
 * La versión anterior de esto era una regex que **caía a `bdi` en silencio** cuando no matcheaba
 * (`lib/gerencial/detectores/ads.ts`), y un número mal atribuido se ve razonable justo cuando está
 * mal. Por eso el empate y el vacío devuelven lo mismo: nada.
 *
 * `stunned` se chequea antes que `zattia` a propósito — no por prioridad, sino porque van a un
 * `Set` y el empate se resuelve abajo: "Zattia x Stunned" nombra a dos y no se asigna sola.
 */
const PISTAS = [
  ['stunned', /stunned|(^|[^a-z])stu([^a-z]|$)/i],
  ['zattia', /zattia/i],
  ['bdi', /(^|[^a-z])bdi([^a-z]|$)|buenos\s*dias\s*intimidad/i],
]

export function sugerirLinea(nombre) {
  const n = String(nombre || '')
  if (!n.trim()) return null
  const halladas = PISTAS.filter(([, re]) => re.test(n)).map(([linea]) => linea)
  return halladas.length === 1 ? halladas[0] : null
}

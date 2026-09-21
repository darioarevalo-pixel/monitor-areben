/**
 * Copiar al portapapeles, con la única forma que se puede dar por buena.
 *
 * # Por qué esto no es `navigator.clipboard.writeText` a secas
 *
 * 🔴 **El portapapeles falla seguido y falla CALLADO.** `navigator.clipboard` no existe fuera de un
 * contexto seguro, y aun existiendo el navegador rechaza la escritura cuando el click no le parece
 * un gesto del usuario (un `await` en el medio ya alcanza para perder ese permiso en Safari). Las
 * dos cosas se ven igual desde el código: una promesa que no cumple, o un `undefined` que con
 * `?.` ni siquiera lo intenta.
 *
 * Lo caro no es que no copie: es **lo que la persona hace después**. Cree que el link está en el
 * portapapeles, pega en WhatsApp, y sale **lo que hubiera antes** —el link de OTRO cliente, o
 * cualquier cosa—. Ya pasó: hasta el 27-ago-2026 crear un reclamo hacía
 * `navigator.clipboard?.writeText(link).catch(() => {})` y el cartel decía «el link quedó copiado»
 * pase lo que pase. Es el mismo defecto que [una pantalla que no pregunta e igual afirma].
 *
 * # 🔴 Adentro del panel de WhatsApp el permiso NO está
 *
 * El panel corre en un `<iframe>` de otro origen adentro del side panel de la extensión, y ahí
 * `navigator.clipboard.writeText` lo rechaza el navegador salvo que el iframe venga con
 * `allow="clipboard-write"` (se lo agregamos, pero eso pide recargar la extensión, y una versión
 * vieja instalada en otra máquina no se entera).
 *
 * Por eso hay un segundo intento, el viejo `execCommand('copy')` sobre un `<textarea>`: es un
 * comando del documento, no un permiso, así que funciona donde el otro no. Lo levantó Bruno
 * copiando el alias de una cuenta para pasárselo a una clienta (21-sep-2026): el cuadro de "copiá
 * esto a mano" apareció **y encima le mostró una sola línea**, porque `window.prompt` corta el
 * texto en el primer salto de renglón. O sea que el plan B rompía justo lo que este botón había
 * venido a resolver.
 *
 * # El contrato
 *
 * **Nunca deja a la persona sin el texto.** Si el portapapeles no acepta, se lo muestra en un
 * cuadro para que lo copie a mano —`window.prompt` es feo y es lo único que funciona en todos
 * lados—. Lo que devuelve es **si lo hizo solo**, para que el que llama pueda decir la verdad en
 * vez de afirmar de arriba.
 *
 * ⚠️ **`true` significa «el navegador aceptó», no «la persona lo pegó»**: más que eso no se puede
 * saber desde acá. Lo que sí se puede es no mentir cuando el navegador dijo que no.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    // El optional chaining va sobre `navigator.clipboard`, que puede no existir; `writeText` se
    // llama derecho para que un rechazo caiga en el catch y no se pierda.
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // Cae al segundo intento. No se loguea: no es un error de programa, es un permiso que no está.
  }

  if (conTextarea(texto)) return true

  if (typeof window !== 'undefined') {
    // ⚠️ El cuadro es de UN renglón: un texto de varias líneas se ve cortado en el primero. Se
    // muestran separadas por " · " para que al menos esté TODO, aunque haya que reacomodarlo.
    const enUnaLinea = texto.includes('\n') ? texto.split('\n').join(' · ') : texto
    window.prompt('No se pudo copiar solo. Copiá esto a mano:', enUnaLinea)
  }
  return false
}

/**
 * El intento viejo: seleccionar el texto en un `<textarea>` de mentira y copiarlo con
 * `document.execCommand`. Está deprecado y sigue andando en todos los navegadores que usamos.
 *
 * 🔑 **No pide permiso de Permissions Policy**, que es exactamente lo que falta adentro del panel
 * de WhatsApp. ⚠️ Tiene que correr **sincrónico y adentro del click**: si se le mete un `await`
 * antes, el navegador ya no lo considera un gesto del usuario y falla.
 */
function conTextarea(texto: string): boolean {
  if (typeof document === 'undefined' || !texto) return false
  let caja: HTMLTextAreaElement | null = null
  try {
    caja = document.createElement('textarea')
    caja.value = texto
    caja.setAttribute('readonly', '')
    // Fuera de la vista pero enfocable: `display:none` no se puede seleccionar, y una caja visible
    // haría saltar la pantalla en el medio de la conversación.
    caja.style.position = 'fixed'
    caja.style.top = '0'
    caja.style.left = '0'
    caja.style.width = '1px'
    caja.style.height = '1px'
    caja.style.opacity = '0'
    document.body.appendChild(caja)
    caja.select()
    caja.setSelectionRange(0, texto.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    if (caja && caja.parentNode) caja.parentNode.removeChild(caja)
  }
}

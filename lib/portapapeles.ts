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
    // Cae al cuadro de abajo. No se loguea: no es un error de programa, es un permiso que no está.
  }
  if (typeof window !== 'undefined') window.prompt('No se pudo copiar solo. Copiá esto a mano:', texto)
  return false
}

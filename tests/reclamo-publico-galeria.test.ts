import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 **El portal del cliente tiene que dejar ELEGIR una foto, no sólo sacarla.**
 *
 * El 27-ago-2026 la primera persona que lo usó de verdad avisó que *«no se podía adjuntar fotos
 * desde otro celular, solo abre la cámara»*. La causa era un atributo: `capture="environment"` en
 * el `<input type="file">`. `capture` no es una preferencia que el navegador pueda ignorar — es una
 * orden de abrir la cámara y saltear el selector, así que la galería directamente no aparece. Y la
 * foto de una falla casi nunca se saca en el momento en que se abre el link: ya estaba sacada, o la
 * mandó otra persona desde otro teléfono.
 *
 * **Por qué es texto contra texto y no un render.** `ReclamoPublico` arranca en `Cargando…` y el
 * `<input>` recién existe después del `useEffect` que trae el reclamo; `renderToStaticMarkup` —el
 * oráculo que usa el resto de la suite para pantallas— no corre efectos, así que el elemento que
 * hay que mirar no llega a pintarse. Montarlo de verdad pediría simular la API entera para fijar
 * un atributo. Mismo criterio que `blob-upload-sesion.test.ts`: se prueba el contrato, a propósito.
 *
 * ⚠️ **No se limpian comentarios antes de buscar**: se recorta el elemento (de `<input` al primer
 * `/>`) y se mira sólo adentro. Un stripper ingenuo acá haría daño — `accept="image/*"` tiene un
 * `/*` que abre un comentario que nunca se abrió.
 */

const raiz = join(__dirname, '..')
const portal = readFileSync(join(raiz, 'components/reclamos/ReclamoPublico.tsx'), 'utf8')
const imagenes = readFileSync(join(raiz, 'lib/imagenes.ts'), 'utf8')

/** El `<input>` de la foto, del `<input` al primer `/>`. Los comentarios JSX quedan afuera. */
const entradaDeFoto = (/<input\b[\s\S]*?\/>/.exec(portal) || [''])[0]

/**
 * El cuerpo de `imgAThumb`, del `export function` a la llave que la cierra.
 *
 * 🔴 **Acotarlo no es prolijidad: es lo que hace que el test pueda fallar.** `achicarAArchivo`, tres
 * funciones más abajo en el mismo archivo, también le pone un `reader.onerror` al suyo — buscar en
 * el archivo entero daría verde aunque `imgAThumb` volviera a quedarse sin ninguno.
 */
const imgAThumbFn = (/export function imgAThumb\b[\s\S]*?\n}/.exec(imagenes) || [''])[0]

describe('portal del cliente — la foto se puede ELEGIR, no sólo sacar', () => {
  it('el portal tiene un input de archivo para imágenes (si esto se cae, lo de abajo no significa nada)', () => {
    // Sin esta aserción, borrar el input dejaría el test de `capture` en verde sobre una pantalla
    // que ya no puede subir nada: una prueba que no puede fallar es peor que ninguna.
    expect(entradaDeFoto).toContain('type="file"')
    expect(entradaDeFoto).toContain('accept="image/*"')
  })

  it('NO fuerza la cámara: sin `capture`, el sistema ofrece galería y cámara', () => {
    expect(entradaDeFoto).not.toMatch(/\bcapture\b/)
  })
})

/**
 * 🔴 **La otra mitad del mismo arreglo.** Abrir la galería es abrirle la puerta a archivos que el
 * navegador no puede leer (un HEIC, uno que vive en la nube y no bajó, uno sin permiso). El que
 * llama prende un contador antes de leer y lo apaga en el callback o en el `onError`; si el
 * `FileReader` muere sin avisar, no pasa ninguna de las dos cosas y el botón queda en «Subiendo 1…»
 * para siempre, sin cartel y sin forma de reintentar. Del lado del cliente eso se ve igual que
 * «el link no anda».
 */
describe('imgAThumb — un archivo ilegible avisa, no cuelga', () => {
  it('sigue habiendo un FileReader al que ponerle el onerror (si esto se cae, lo de abajo no significa nada)', () => {
    expect(imgAThumbFn).toContain('new FileReader()')
  })

  it('el lector reporta el error en vez de morir en silencio', () => {
    expect(imgAThumbFn).toContain('reader.onerror')
  })
})

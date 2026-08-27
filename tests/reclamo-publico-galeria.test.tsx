// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ReclamoPublico } from '@/components/reclamos/ReclamoPublico'

/**
 * El portal del cliente: lo único del módulo abierto a internet, y lo único que se usa **desde un
 * teléfono ajeno**. Acá se fijan las dos cosas que lo rompieron en la vida real.
 *
 * 🔴 **1. Forzaba la CÁMARA y escondía la galería** (27-ago-2026). El `<input type="file">` llevaba
 * `capture="environment"`, que no es una preferencia que el navegador pueda ignorar: es una orden
 * de abrir la cámara y saltear el selector. En Android no había forma de adjuntar una foto que ya
 * estuviera sacada — y la foto de una falla casi nunca se saca en el momento en que se abre el
 * link: ya la tenía sacada, o se la mandó otra persona desde otro teléfono. Reportado por la
 * primera persona del equipo que lo usó de verdad. Sacar el atributo **no quita la cámara: agrega
 * la galería**.
 *
 * 🔴 **2. Las fotos ya subidas no se podían mirar** (27-ago-2026). Eran recortes de 84 px, que
 * alcanzan para contarlas y no para confirmar que se ve lo que la persona quiso mostrar — lo único
 * que puede revisar antes de mandar, porque después el link no vuelve a abrir.
 *
 * 🔑 **Se MONTA el componente, no se lee el fuente.** La primera versión de este archivo miraba el
 * texto de `ReclamoPublico.tsx` porque el `<input>` recién existe después del `useEffect` y
 * `renderToStaticMarkup` —el oráculo del resto de las pantallas— no corre efectos. Montar con
 * `createRoot` + `act` sí los corre, así que lo que se afirma es lo que el navegador arma de
 * verdad, atributo por atributo. Mismo patrón que `tests/reclamos-foto-ampliada.test.tsx`.
 */

const RECLAMO = {
  numero: 'R-0042', orden: '20700', estado: 'en_revision',
  productos: [{ producto: 'FUNDA X', variante: null, cantidad: 1 }],
  fotos: ['https://blob/primera.jpg', 'https://blob/segunda.jpg'],
  relato: '', puedeSubir: true,
}

/** Monta el portal con el reclamo ya cargado (el efecto pide la API; se la damos hecha). */
async function abrirPortal(reclamo: object = RECLAMO) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, json: async () => ({ ok: true, reclamo }),
  })))
  document.body.innerHTML = ''
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(<ReclamoPublico token={'a'.repeat(64)} />)
  })
}

const entradaDeFoto = () => document.querySelector('input[type="file"]')
const lightbox = () => document.querySelector('.mo-lightbox img')
const botonesDeFoto = () => [...document.querySelectorAll('button')]
  .filter((b) => /Ver la foto/.test(b.getAttribute('aria-label') || ''))

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => { vi.unstubAllGlobals() })

describe('portal del cliente — la foto se puede ELEGIR, no sólo sacar', () => {
  it('hay un input de archivo que acepta imágenes (si esto se cae, lo de abajo no significa nada)', async () => {
    // Sin esta aserción, que el input desapareciera dejaría el test de `capture` en verde sobre una
    // pantalla que ya no puede subir nada: una prueba que no puede fallar es peor que ninguna.
    await abrirPortal()
    expect(entradaDeFoto()).not.toBeNull()
    expect(entradaDeFoto()?.getAttribute('accept')).toBe('image/*')
  })

  it('NO fuerza la cámara: sin `capture`, el sistema ofrece galería y cámara', async () => {
    await abrirPortal()
    expect(entradaDeFoto()?.hasAttribute('capture')).toBe(false)
  })

  it('deja elegir varias de una', async () => {
    await abrirPortal()
    expect(entradaDeFoto()?.hasAttribute('multiple')).toBe(true)
  })
})

describe('portal del cliente — las fotos ya subidas se pueden mirar enteras', () => {
  it('cada foto subida es algo que se puede tocar', async () => {
    await abrirPortal()
    expect(botonesDeFoto()).toHaveLength(2)
  })

  it('antes de tocar nada NO hay ninguna foto abierta', async () => {
    await abrirPortal()
    // Sin esto, un lightbox siempre abierto pasaría el test de abajo.
    expect(lightbox()).toBeNull()
  })

  it('tocar la segunda abre ESA foto, no la primera', async () => {
    await abrirPortal()
    await act(async () => { botonesDeFoto()[1].click() })
    expect(lightbox()?.getAttribute('src')).toBe('https://blob/segunda.jpg')
  })

  it('sin fotos todavía no hay nada que ampliar', async () => {
    await abrirPortal({ ...RECLAMO, fotos: [] })
    expect(botonesDeFoto()).toHaveLength(0)
  })
})

/**
 * 🔴 **La otra mitad del arreglo del `capture`.** Abrir la galería es abrirle la puerta a archivos
 * que el navegador no puede leer (un HEIC, uno que vive en la nube y no bajó, uno sin permiso). El
 * que llama prende un contador antes de leer y lo apaga en el callback o en el `onError`; si el
 * `FileReader` muere sin avisar, no pasa ninguna de las dos cosas y el botón queda en «Subiendo 1…»
 * para siempre, sin cartel y sin forma de reintentar. Del lado del cliente eso se ve igual que
 * «el link no anda».
 *
 * ⚠️ Éste sí es texto contra texto: para ejercerlo haría falta un `FileReader` falso que falle, y
 * jsdom no deja pisarlo sin reescribir medio entorno. Lo que se fija es que el manejador exista.
 */
const imagenes = readFileSync(join(__dirname, '..', 'lib/imagenes.ts'), 'utf8')
/**
 * Acotado a `imgAThumb`. 🔴 **No es prolijidad: es lo que hace que el test pueda fallar.**
 * `achicarAArchivo`, tres funciones más abajo en el mismo archivo, también le pone un
 * `reader.onerror` al suyo — buscar en el archivo entero daría verde aunque `imgAThumb` volviera a
 * quedarse sin ninguno.
 */
const imgAThumbFn = (/export function imgAThumb\b[\s\S]*?\n}/.exec(imagenes) || [''])[0]

describe('imgAThumb — un archivo ilegible avisa, no cuelga', () => {
  it('sigue habiendo un FileReader al que ponerle el onerror (si esto se cae, lo de abajo no significa nada)', () => {
    expect(imgAThumbFn).toContain('new FileReader()')
  })

  it('el lector reporta el error en vez de morir en silencio', () => {
    expect(imgAThumbFn).toContain('reader.onerror')
  })
})

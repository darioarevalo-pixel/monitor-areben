import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 **La sesión del Monitor no viaja sola cuando la llamada no es nuestra.**
 *
 * Todo el resto de la app pega por `apiFetch`, que pone el header `x-monitor-auth` sin que nadie se
 * acuerde. `upload()` de `@vercel/blob/client` **no pasa por ahí**: hace su propio `fetch` a
 * `/api/blob-upload` para pedir el permiso de subida. Del otro lado está `exigirUsuario`, así que
 * mientras el hook no le pasara el header por la opción `headers`, **la subida de piezas contestaba
 * 403 a un usuario perfectamente logueado** y el SDK lo traducía a «Failed to retrieve the client
 * token», un cartel que no menciona la sesión por ningún lado.
 *
 * Llegó a producción con los 34 tests de la tanda D en verde, porque todos prueban el núcleo puro
 * —qué copy se hereda, qué modelos se rechazan— y ninguno la conversación con el SDK. **Lo cazó
 * arrastrar un archivo**, igual que la poda la cazó abrir la pantalla.
 *
 * Este archivo no prueba comportamiento —el handler corre en Node sin pasar por el compilador y el
 * SDK no se puede simular desde acá—: prueba que **las dos puntas sigan de acuerdo**, igual que
 * `meta-ads-despacho.test.ts` y `permisos-espejo.test.ts`. Es texto contra texto a propósito.
 */

const raiz = join(__dirname, '..')
const puerta = readFileSync(join(raiz, 'api/blob-upload.js'), 'utf8')
const hook = readFileSync(join(raiz, 'components/meta-ads/piezas/useSubirPiezas.ts'), 'utf8')
/** El segundo que sube por el mismo camino: la galería de Ingresos proyectados. */
const hookIngresos = readFileSync(join(raiz, 'components/ingresos/useSubirGaleria.ts'), 'utf8')
const apiFetch = readFileSync(join(raiz, 'lib/api-fetch.ts'), 'utf8')

/** El nombre del header es el contrato entre las dos puntas: si cambia de un lado, tiene que cambiar del otro. */
const HEADER = 'x-monitor-auth'

describe('blob-upload — el permiso de subida se pide CON la sesión', () => {
  it('la puerta exige usuario (si esto desaparece, el resto del archivo no significa nada)', () => {
    // Sin esta aserción, sacarle el guard al endpoint dejaría los tests de abajo pasando en verde
    // sobre un endpoint abierto: una prueba que no puede fallar es peor que ninguna.
    expect(puerta).toContain('exigirUsuario(req, res)')
  })

  it('🔴 el hook le pasa el header a `upload()`, que no usa apiFetch', () => {
    expect(hook, 'sin `headers`, el fetch interno del SDK sale sin sesión y come 403').toContain('headers:')
    expect(hook).toContain(HEADER)
  })

  it('el sobre sale de la MISMA función que usa apiFetch, no de una copia', () => {
    // Dos formas de armar el sobre terminan discrepando, y la que se rompe es la que casi nadie
    // ejercita. Misma regla que `permisos.core.js`.
    expect(hook).toContain('sobreDeAuth')
    expect(apiFetch).toContain('export async function sobreDeAuth')
  })

  it('🔑 el header que manda el hook es el que lee `credenciales()`', () => {
    const auth = readFileSync(join(raiz, 'api/_auth.js'), 'utf8')
    expect(auth, `el servidor no lee «${HEADER}»: el contrato se partió`).toContain(HEADER)
  })

  it('🔴 el hook de la galería de Ingresos hace lo MISMO (subió por el mismo camino después)', () => {
    // Cuando la galería aprendió a subir videos, la trampa ya estaba documentada y arriba en este
    // mismo archivo — y aun así es una línea que se puede olvidar, porque la pantalla anda hasta que
    // alguien arrastra el primer archivo. Que el segundo hook esté acá es lo que la fija para los dos.
    expect(hookIngresos).toContain('headers:')
    expect(hookIngresos).toContain(HEADER)
    expect(hookIngresos).toContain('sobreDeAuth')
    expect(hookIngresos).toContain('No encuentro tu sesión del Monitor')
  })

  it('sin sesión el hook ni intenta subir, y lo dice', () => {
    // Dejar que el SDK falle solo devuelve «Failed to retrieve the client token», que no le sirve
    // a nadie. El motivo escrito es la diferencia entre «volvé a entrar» y media hora de misterio.
    expect(hook).toContain('No encuentro tu sesión del Monitor')
  })
})

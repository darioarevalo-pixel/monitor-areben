import { describe, it, expect } from 'vitest'
import { SECCIONES, SOMBRAS, componenteDe, componenteSombraDe } from '@/components/secciones/registro'
import { todasLasKeys } from '@/lib/nav'

/**
 * El registro es el interruptor del strangler, así que sus invariantes se
 * prueban en vez de confiar en ellas.
 *
 * La que más importa: **mientras una sección esté solo en SOMBRAS, `/<key>` tiene
 * que seguir dando el legacy**. Si se filtrara a SECCIONES por accidente, el
 * equipo entero se comería una versión a medias sin que nadie lo pidiera.
 */
describe('registro de secciones', () => {
  it('una sección en sombra NO se sirve en su ruta normal', () => {
    for (const key of Object.keys(SOMBRAS)) {
      expect(componenteDe(key)).toBeNull() // /<key> → iframe legacy
      expect(componenteSombraDe(key)).not.toBeNull() // /<key>/next → Next
    }
  })

  it('las secciones flipeadas: en vivo en su ruta normal, no en sombra', () => {
    for (const key of ['clientes', 'fundas-modelo', 'resumen', 'ventas-mensuales', 'productos']) {
      expect(componenteDe(key)).not.toBeNull() // /<key> → Next
      expect(componenteSombraDe(key)).toBeNull() // ya no hay ruta sombra
    }
  })

  it('una key que no está en ningún registro va al legacy', () => {
    // `talles` todavía no se migró (Tanda A #9): ni componente vivo ni sombra.
    expect(componenteDe('talles')).toBeNull()
    expect(componenteSombraDe('talles')).toBeNull()
  })

  it('las keys de los dos registros existen en el nav (si no, son ruta muerta)', () => {
    const validas = new Set(todasLasKeys())
    for (const key of [...Object.keys(SECCIONES), ...Object.keys(SOMBRAS)]) {
      expect(validas.has(key), `la key '${key}' no existe en el nav`).toBe(true)
    }
  })

  it('ninguna key está en los dos registros a la vez', () => {
    const vivas = new Set(Object.keys(SECCIONES))
    for (const key of Object.keys(SOMBRAS)) expect(vivas.has(key)).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { SECCIONES, componenteDe } from '@/components/secciones/registro'
import { todasLasKeys } from '@/lib/nav'

/**
 * El registro dice qué componente sirve cada sección. Cerrado el strangler
 * (jul-2026: se fue el iframe legacy y con él `SOMBRAS`/`componenteSombraDe`), su
 * invariante ya no es "esta no se filtró antes de tiempo" sino la inversa y más
 * fuerte: **toda sección del menú tiene pantalla**. Antes un olvido caía al legacy y
 * el equipo veía la versión vieja; ahora caería en un cartel de error, así que el
 * test tiene que atajarlo acá.
 */
describe('registro de secciones', () => {
  it('toda key del nav tiene componente registrado', () => {
    for (const key of todasLasKeys()) {
      expect(componenteDe(key), `la key '${key}' está en el nav pero no en SECCIONES`).not.toBeNull()
    }
  })

  it('las keys del registro existen en el nav (si no, son ruta muerta)', () => {
    const validas = new Set(todasLasKeys())
    for (const key of Object.keys(SECCIONES)) {
      expect(validas.has(key), `la key '${key}' no existe en el nav`).toBe(true)
    }
  })

  it('una key desconocida no tiene componente', () => {
    expect(componenteDe('seccion-que-no-existe')).toBeNull()
  })
})

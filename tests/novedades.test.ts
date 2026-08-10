/**
 * Novedades — la parte que se puede probar sin red: qué cuenta como "sin leer".
 *
 * Es lo que decide el número del badge y, en la tanda que viene, cuáles frenan al entrar. La regla
 * que importa no es "leída o no", es **leída EN ESTA VERSIÓN**: es lo que permite volver a mostrar
 * una novedad corregida sin borrar el registro de que se había leído la anterior.
 */

import { describe, expect, it } from 'vitest'
import { esEstado, ESTADOS, sinLeer, type Lectura, type Novedad } from '@/lib/novedades/tipos'

const nov = (id: string, extra: Partial<Novedad> = {}): Novedad => ({
  id,
  estado: 'publicada',
  importante: false,
  titulo: id,
  cuerpo: '',
  version: 1,
  ...extra,
})

describe('estados', () => {
  it('son exactamente tres', () => {
    expect([...ESTADOS]).toEqual(['borrador', 'publicada', 'archivada'])
  })

  it('esEstado rechaza cualquier otra cosa', () => {
    expect(esEstado('publicada')).toBe(true)
    expect(esEstado('publicado')).toBe(false)
    expect(esEstado('')).toBe(false)
    expect(esEstado(undefined)).toBe(false)
  })
})

describe('sinLeer', () => {
  it('cuenta las publicadas que no tienen lectura', () => {
    const r = sinLeer([nov('a'), nov('b')], [{ novedad_id: 'a', version: 1 }])
    expect(r.map((n) => n.id)).toEqual(['b'])
  })

  it('los borradores y las archivadas NO cuentan', () => {
    // Un borrador es un texto a medio escribir y una archivada ya pasó: ninguno de los dos puede
    // encender el badge de alguien.
    const r = sinLeer([nov('a', { estado: 'borrador' }), nov('b', { estado: 'archivada' })], [])
    expect(r).toEqual([])
  })

  it('leída en la v1 pero la novedad va por la v2: vuelve a contar', () => {
    const r = sinLeer([nov('a', { version: 2 })], [{ novedad_id: 'a', version: 1 }])
    expect(r.map((n) => n.id)).toEqual(['a'])
  })

  it('y la lectura vieja sigue estando: no se pisa, se suma', () => {
    const leidas: Lectura[] = [
      { novedad_id: 'a', version: 1 },
      { novedad_id: 'a', version: 2 },
    ]
    expect(sinLeer([nov('a', { version: 2 })], leidas)).toEqual([])
    // La v1 sigue en la lista — es el dato que se quería conservar.
    expect(leidas).toHaveLength(2)
  })

  it('sin nada no explota', () => {
    expect(sinLeer([], [])).toEqual([])
  })
})

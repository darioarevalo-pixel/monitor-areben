import { describe, it, expect } from 'vitest'
import { localesParaImportar } from '@/lib/disenos/persistencia'
import type { Diseno } from '@/lib/disenos/tipos'

const d = (id: string, over: Partial<Diseno> = {}): Diseno => ({ id, nombre: 'D' + id, estado: 'nuevo', ...over } as Diseno)

/**
 * La mudanza del tablero de diseños del navegador a la base tiene un solo momento delicado:
 * subir lo que cada uno tenía guardado local sin pisar lo que ya está arriba.
 */
describe('diseños — importar lo que quedó en el navegador', () => {
  it('sube solo lo que no está arriba', () => {
    expect(localesParaImportar([d('1'), d('2')], [d('1')]).map((x) => x.id)).toEqual(['2'])
  })

  it('no pisa lo remoto aunque la copia local sea distinta', () => {
    // Si alguien ya lo subió y lo editó desde otra compu, la copia vieja NO debe ganarle.
    const remoto = d('1', { estado: 'confirmado' })
    expect(localesParaImportar([d('1', { estado: 'rechazado' })], [remoto])).toEqual([])
  })

  it('con la base vacía sube todo, y sin nada local no sube nada', () => {
    expect(localesParaImportar([d('1'), d('2')], []).length).toBe(2)
    expect(localesParaImportar([], [d('1')])).toEqual([])
  })
})

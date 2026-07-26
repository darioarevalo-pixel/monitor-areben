import { afterEach, describe, expect, it } from 'vitest'
import { almacenActivo, almacenMemoria, almacenNulo, usarAlmacen } from '@/lib/almacen'

/**
 * El backend del caché (lib/almacen.ts). `almacenIDB` NO se cubre acá: el env de vitest es
 * `node` y no tiene IndexedDB — simularlo pediría una dependencia nueva. Ese hueco es
 * justamente lo que justifica el seam `usarAlmacen`, y se tapa con la verificación a mano
 * en el browser (DevTools › Application › IndexedDB).
 */

afterEach(() => usarAlmacen(null))

describe('almacenMemoria', () => {
  it('hace round-trip de un objeto y devuelve null si la clave no está', async () => {
    const a = almacenMemoria()
    await a.guardar('k', { n: 1, filas: [{ id: 7 }] })
    expect(await a.leer('k')).toEqual({ n: 1, filas: [{ id: 7 }] })
    expect(await a.leer('no-existe')).toBeNull()
  })

  it('clona al guardar: mutar el original después no toca lo guardado', async () => {
    const a = almacenMemoria()
    const original = { filas: [1, 2] }
    await a.guardar('k', original)
    original.filas.push(3)
    expect(await a.leer<typeof original>('k')).toEqual({ filas: [1, 2] })
  })

  it('clona al leer: mutar lo devuelto no toca lo guardado', async () => {
    const a = almacenMemoria()
    await a.guardar('k', { filas: [1, 2] })
    const leido = await a.leer<{ filas: number[] }>('k')
    leido!.filas.push(3)
    expect((await a.leer<{ filas: number[] }>('k'))!.filas).toEqual([1, 2])
  })

  it('borrar deja la clave en null', async () => {
    const a = almacenMemoria()
    await a.guardar('k', 1)
    await a.borrar('k')
    expect(await a.leer('k')).toBeNull()
  })
})

describe('almacenNulo', () => {
  it('no guarda nada y no tira', async () => {
    const a = almacenNulo()
    await a.guardar('k', { pesado: true })
    await a.borrar('k')
    expect(await a.leer('k')).toBeNull()
  })
})

describe('detección', () => {
  it('sin window el default es el nulo, no un Map compartido entre requests', async () => {
    // En el server un Map de módulo le serviría los datos de una sesión a otra.
    expect(typeof window).toBe('undefined')
    await almacenActivo().guardar('k', 1)
    expect(await almacenActivo().leer('k')).toBeNull()
  })

  it('usarAlmacen(null) vuelve a detectar: un test no hereda el almacén de otro', async () => {
    const inyectado = almacenMemoria()
    usarAlmacen(inyectado)
    await almacenActivo().guardar('k', 1)
    expect(await almacenActivo().leer('k')).toBe(1)
    usarAlmacen(null)
    expect(await almacenActivo().leer('k')).toBeNull()
  })
})

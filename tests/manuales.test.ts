/**
 * Manuales — lo que se puede probar sin red.
 *
 * El test que más importa es el de `seccion`: **el servidor no puede validar que sea una key real**
 * (es JS plano y `lib/nav.ts` es TypeScript), así que la única red que queda es el desplegable del
 * editor... y esto. Si alguien carga un manual con una sección inventada, el botón "Cómo se usa" no
 * aparecería en ningún lado y nadie se enteraría de por qué.
 */

import { describe, expect, it } from 'vitest'
import { manualDe, type ManualIndice } from '@/lib/manuales/tipos'
import { esKeyValida, todasLasKeys } from '@/lib/nav'
import { coincide, normalizar } from '@/lib/texto'

const m = (id: string, extra: Partial<ManualIndice> = {}): ManualIndice => ({
  id,
  seccion: null,
  titulo: id,
  publicado: true,
  ...extra,
})

describe('manualDe', () => {
  const indice = [
    m('a', { seccion: 'atencion' }),
    m('b', { seccion: 'cupones', publicado: false }),
    m('c'),
  ]

  it('encuentra el de una pantalla', () => {
    expect(manualDe(indice, 'atencion')?.id).toBe('a')
  })

  it('uno sin publicar NO cuenta: el botón no puede abrir un cartel vacío', () => {
    expect(manualDe(indice, 'cupones')).toBeUndefined()
  })

  it('una pantalla sin manual da undefined, y ahí el botón no se dibuja', () => {
    expect(manualDe(indice, 'gerencial')).toBeUndefined()
  })

  it('los sueltos (sin sección) nunca matchean con una pantalla', () => {
    expect(manualDe(indice, '')).toBeUndefined()
  })
})

describe('la sección de un manual tiene que ser una key real', () => {
  // Lo que esto amarra no es el código de hoy: es que si mañana se carga un manual apuntando a una
  // sección que no existe, `manualDe` no lo va a encontrar nunca y el botón no va a aparecer.
  it('todas las keys que ofrece el editor son válidas', () => {
    const keys = todasLasKeys()
    expect(keys.length).toBeGreaterThan(30)
    for (const k of keys) expect(esKeyValida(k)).toBe(true)
  })

  it('novedades y manuales son keys válidas', () => {
    expect(esKeyValida('novedades')).toBe(true)
    expect(esKeyValida('manuales')).toBe(true)
  })
})

describe('buscar (lib/texto)', () => {
  it('cada palabra tiene que aparecer, en cualquier orden y sin tildes', () => {
    expect(coincide('Cómo se cierra la caja', 'caja cierra')).toBe(true)
    expect(coincide('Cómo se cierra la caja', 'como')).toBe(true)
    expect(coincide('Cómo se cierra la caja', 'caja banco')).toBe(false)
  })

  it('una búsqueda vacía matchea con todo', () => {
    expect(coincide('lo que sea', '')).toBe(true)
    expect(coincide('lo que sea', '   ')).toBe(true)
  })

  it('normalizar saca tildes y mayúsculas', () => {
    expect(normalizar('  ATENCIÓN  ')).toBe('atencion')
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as persistencia from '@/lib/disenos/persistencia'
import { KEY_LOCAL, KEY_LOCAL_OCULTO, avisoLocalOculto, contarLocales, ocultarAvisoLocal, olvidarLocales } from '@/lib/disenos/persistencia'

/**
 * El tablero de diseños vive en la base desde ago-2026. Lo que queda de la época del navegador ya
 * no es un respaldo pendiente: es basura que asusta con un aviso que volvía en cada recarga.
 *
 * Lo que estos tests defienden es sobre todo **lo que el módulo ya no puede hacer**.
 */

// `environment: 'node'`: no hay DOM, así que el localStorage se arma a mano.
let almacen: Record<string, string>
beforeEach(() => {
  almacen = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (k in almacen ? almacen[k] : null),
      setItem: (k: string, v: string) => { almacen[k] = String(v) },
      removeItem: (k: string) => { delete almacen[k] },
    },
  })
})
afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'localStorage')
})

describe('lo que quedó en ESTE navegador', () => {
  it('cuenta lo que hay, sin traerlo', () => {
    almacen[KEY_LOCAL] = JSON.stringify([{ id: 'a' }, { id: 'b' }, { sin: 'id' }])
    expect(contarLocales()).toBe(2)
  })

  it('sin clave y con JSON roto devuelve 0 y NO tira', () => {
    // Una excepción acá dejaría la sección entera sin montar por un resto de otra época.
    expect(contarLocales()).toBe(0)
    almacen[KEY_LOCAL] = '{no soy json'
    expect(contarLocales()).toBe(0)
    almacen[KEY_LOCAL] = '"tampoco soy un array"'
    expect(contarLocales()).toBe(0)
  })

  it('olvidarLocales devuelve cuántos se perdieron y deja la clave sin nada', () => {
    almacen[KEY_LOCAL] = JSON.stringify([{ id: 'a' }, { id: 'b' }])
    expect(olvidarLocales()).toBe(2)
    expect(almacen[KEY_LOCAL]).toBeUndefined()
    // La segunda vez ya no hay nada que perder: el aviso no puede volver.
    expect(olvidarLocales()).toBe(0)
    expect(contarLocales()).toBe(0)
  })

  it('ocultar el aviso sobrevive a la recarga', () => {
    // El bug original era justo éste: "Ahora no" era un useState y el aviso volvía con cada F5.
    expect(avisoLocalOculto()).toBe(false)
    ocultarAvisoLocal()
    expect(almacen[KEY_LOCAL_OCULTO]).toBe('1')
    expect(avisoLocalOculto()).toBe(true)
  })

  /**
   * 🔴 Esto fija una decisión de arquitectura, no un comportamiento.
   *
   * El tablero viejo del navegador era **uno solo, sin marca**, y la comparación con lo remoto sí
   * tenía marca. Parado en Zattia —que no tiene ni un diseño— el aviso decía "quedaron todos sin
   * subir" para siempre, y "Subirlos" habría duplicado el tablero de BDI adentro de Zattia.
   *
   * El arreglo no es enseñarle marcas a la lectura: es que **el array local nunca salga del
   * módulo**. Sin un array que subir, el bug no está arreglado — no se puede escribir. Si alguien
   * vuelve a exportar cualquiera de estas dos, este test se pone rojo.
   */
  it('el módulo NO expone el array local ni ninguna forma de subirlo', () => {
    const exportado = Object.keys(persistencia)
    expect(exportado).not.toContain('leerLocales')
    expect(exportado).not.toContain('localesParaImportar')
    expect(exportado).not.toContain('importarLocales')
  })
})

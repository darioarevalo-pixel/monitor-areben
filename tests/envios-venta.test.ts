import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comoDeCobro, puedeAnularVenta, ventaIdDe, verboDeVenta } from '@/lib/envios/venta.core.js'

/**
 * 🔴 **El envío y su venta del ERP (contrato §20, «Contraentrega»).** El cadete toca «Entregado», «Cobrado», «No
 * cobré» y «No entregado» SUELTOS y en cualquier orden, y la pantalla corrige días después: lo que hace el motor
 * sale del ANTES y el DESPUÉS de la fila (`verboDeVenta`), ⛔ del botón. El mutante que importa es atarlo al botón:
 * «entregado» y después «no cobré» dejaba la venta cobrada por el cadete cuando le habían transferido al local.
 *
 * La segunda mitad es texto contra texto, como `envios-cobrado-handler.test.ts`: la función pura puede estar
 * perfecta y una de las dos puntas que escriben (`_envios.js` y `_cadete.js`) no llamarla.
 */

const V = '11111111-2222-4333-8444-555555555555'
const fila = (estado: string, cobrado: boolean | null = null, venta_id: string | null = V) => ({ estado, cobrado, venta_id })

describe('verboDeVenta', () => {
  it('sin venta del ERP ⇒ nada (todos los envíos de hoy)', () => {
    expect(verboDeVenta(fila('en_transito', null, null), fila('entregado', null, null))).toBeNull()
  })

  it('entregado ⇒ el cobro por el lado que dice `cobrado` (null es el cadete, ⛔ el local)', () => {
    expect(verboDeVenta(fila('en_transito'), fila('entregado', null))).toEqual({ verbo: 'corregir', como: 'cadete', venta_id: V })
    expect(verboDeVenta(fila('en_transito'), fila('entregado', true))).toEqual({ verbo: 'corregir', como: 'cadete', venta_id: V })
    expect(verboDeVenta(fila('en_transito'), fila('entregado', false))).toEqual({ verbo: 'corregir', como: 'local', venta_id: V })
  })

  it('🔴 «no cobré» DESPUÉS de «entregado» corrige al local (⛔ queda el cadete)', () => {
    expect(verboDeVenta(fila('entregado', null), fila('entregado', false))).toEqual({ verbo: 'corregir', como: 'local', venta_id: V })
    // Y «no cobré» ANTES de entregar ⇒ nada todavía: no hubo puerta.
    expect(verboDeVenta(fila('en_transito', null), fila('en_transito', false))).toBeNull()
  })

  it('entregado y nada cambió (otro guardado de la ficha) ⇒ ⛔ se le pega al motor', () => {
    expect(verboDeVenta(fila('entregado', true), fila('entregado', null))).toBeNull()
    expect(verboDeVenta(fila('entregado', false), fila('entregado', false))).toBeNull()
  })

  it('deja de estar entregado (no entregado, sacado del día, eliminado) ⇒ la venta vuelve a la calle', () => {
    expect(verboDeVenta(fila('entregado'), fila('no_entregado'))).toEqual({ verbo: 'reabrir', venta_id: V })
    expect(verboDeVenta(fila('entregado'), fila('pendiente'))).toEqual({ verbo: 'reabrir', venta_id: V })
    expect(verboDeVenta(fila('entregado'), null)).toEqual({ verbo: 'reabrir', venta_id: V })
    // Un no_entregado que nunca se entregó ⇒ nada que reabrir.
    expect(verboDeVenta(fila('en_transito'), fila('no_entregado'))).toBeNull()
  })

  it('un entregado al que le cambian la venta ⇒ la nueva se cobra', () => {
    const otra = '99999999-2222-4333-8444-555555555555'
    expect(verboDeVenta(fila('entregado', null, V), fila('entregado', null, otra))).toEqual({ verbo: 'corregir', como: 'cadete', venta_id: otra })
  })

  it('comoDeCobro: sólo `false` es el local', () => {
    expect([comoDeCobro(true), comoDeCobro(null), comoDeCobro(false)]).toEqual(['cadete', 'cadete', 'local'])
  })
})

describe('ventaIdDe y puedeAnularVenta', () => {
  it('ausente ⇒ ⛔ se toca; vacío ⇒ soltarla; basura ⇒ rechazo', () => {
    expect(ventaIdDe(undefined)).toBeUndefined()
    expect(ventaIdDe('')).toBeNull()
    expect(ventaIdDe(null)).toBeNull()
    expect(ventaIdDe(V.toUpperCase())).toBe(V)
    expect(ventaIdDe('123')).toBe(false)
  })

  it('anular sólo en un no_entregado con venta', () => {
    expect(puedeAnularVenta(fila('no_entregado'))).toBe(true)
    expect(puedeAnularVenta(fila('no_entregado', null, null))).toBe(false)
    expect(puedeAnularVenta(fila('pendiente'))).toBe(false)
    expect(puedeAnularVenta(fila('entregado'))).toBe(false)
  })
})

const raiz = join(__dirname, '..')
const envios = readFileSync(join(raiz, 'api/_envios.js'), 'utf8')
const cadete = readFileSync(join(raiz, 'api/_cadete.js'), 'utf8')
const bloque = (desde: string, hasta: string) => envios.slice(envios.indexOf(desde), envios.indexOf(hasta))

describe('🔴 las dos puntas que escriben le avisan al motor', () => {
  it('la pantalla: estado, cobrado, sacar del día, guardar y eliminar', () => {
    for (const [desde, hasta] of [
      ["b.action === 'estado'", "b.action === 'agendar' || b.action === 'desagendar'"],
      ["b.action === 'agendar' || b.action === 'desagendar'", "b.action === 'pagado'"],
      ["b.action === 'cobrado'", "b.action === 'rotar-token'"],
      ["b.action === 'guardar'", "b.action === 'estado'"],
      ["b.action === 'borrar'", "b.action === 'anular-venta'"],
    ]) {
      const b = bloque(desde, hasta)
      expect(b, desde).not.toBe('')
      expect(b, desde).toContain('seguirVenta({ antes')
      // El antes se lee ANTES de escribir (o sale del delete): sin él, `verboDeVenta` ve todo como nuevo.
      expect(b.indexOf('seguirVenta'), desde).toBeGreaterThan(b.indexOf('DE_LA_VENTA'))
    }
  })

  it('el portal del cadete: lee la fila antes, atada al mismo día, y avisa después de escribir', () => {
    const post = cadete.slice(cadete.indexOf('parcheDeAccion(String'))
    expect(post).toContain("select('id, store, estado, cobrado, venta_id')")
    expect(post.indexOf('data: antes')).toBeLessThan(post.indexOf('.update('))
    expect(post).toContain("seguirVenta({ antes, despues: data[0], usuario: 'cadete (portal)' })")
  })

  it('🔴 anular la venta pide el permiso de ANULAR del ERP, ⛔ el de Envíos', () => {
    const b = bloque("b.action === 'anular-venta'", '── Un movimiento de plata')
    expect(b).toContain("permisoErpDe({ method: 'POST', accion: 'anular' })")
    expect(b.indexOf('puedeErp(')).toBeLessThan(b.indexOf('anularVentaDeEnvio('))
  })

  it('🔑 el aviso del motor ⛔ es un error: el envío ya quedó (respuesta `ok` con `aviso`)', () => {
    expect(envios).toContain('...(aviso ? { aviso } : {})')
    const conector = readFileSync(join(raiz, 'api/_envios-venta.js'), 'utf8')
    expect(conector).toContain('catch (e)')
  })
})

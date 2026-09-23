import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Cobranzas: que las puntas sigan de acuerdo. Texto contra texto, como `envios-cobrado-handler`:
 * mutar el núcleo y ver verde ⛔ prueba nada si el handler decide por su cuenta.
 *
 * Los mutantes que tienen que caer:
 *  1. El handler calculando el estado a mano en vez de `filasDeCobranzas`.
 *  2. Cobrar sin `validarCobro` antes del insert.
 *  3. Cobrar/anular sin el sub `cobranzas.cobrar` (el ver alcanza para ver, ⛔ para escribir).
 *  4. `quien` saliendo del body.
 *  5. Anular con un `delete` en vez de sellar `anulado_en`.
 *  6. `traer-tn` de Envíos sin mirar `tn_cobros` ⇒ el cadete cobra dos veces.
 *  7. El catálogo sin `nota-cobro` en la lista blanca ⇒ 400 y la nota ⛔ se escribe nunca.
 */

const raiz = join(__dirname, '..')
const handler = readFileSync(join(raiz, 'api/_cobranzas.js'), 'utf8')
const cliente = readFileSync(join(raiz, 'lib/cobranzas/cliente.ts'), 'utf8')
const envios = readFileSync(join(raiz, 'api/_envios.js'), 'utf8')
const datos = readFileSync(join(raiz, 'api/datos.js'), 'utf8')

const bloque = (desde: string, hasta: string) => handler.slice(handler.indexOf(desde), handler.indexOf(hasta))
const cobrar = bloque("b.action === 'cobrar'", "b.action === 'anular'")
const anular = bloque("b.action === 'anular'", "b.action === 'nota'")

describe('api/_cobranzas.js', () => {
  it('entra por el router con ?recurso=cobranzas', () => {
    expect(datos).toContain("import cobranzas from './_cobranzas.js'")
    expect(datos).toMatch(/\n\s+cobranzas,\n/)
  })

  it('🔴 el estado lo decide el núcleo (mutante 1)', () => {
    expect(handler).toContain('filasDeCobranzas(d.ordenes')
    expect(handler).not.toMatch(/'falta-tn'|'revisar'/)
  })

  it('🔴 valida antes de insertar (mutante 2)', () => {
    expect(cobrar.indexOf('validarCobro(b)')).toBeGreaterThan(-1)
    expect(cobrar.indexOf('validarCobro(b)')).toBeLessThan(cobrar.indexOf('.insert('))
  })

  it('🔴 escribir pide el sub `cobrar`, antes de cualquier acción (mutante 3)', () => {
    expect(handler).toContain("puedeSub(perfil, store, 'cobranzas', 'cobrar')")
    const gate = handler.indexOf('if (!puedeCobrar) return res.status(403)')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(handler.indexOf("b.action === 'cobrar'"))
  })

  it('🔴 quien sale del perfil (mutante 4)', () => {
    expect(handler).toContain('const yo = perfil.name')
    expect(handler).not.toMatch(/b\.quien|b\.anulado_por/)
  })

  it('🔴 anular sella, ⛔ elimina (mutante 5)', () => {
    expect(anular).toContain('anulado_en')
    expect(anular).not.toContain('.delete(')
  })

  it('los verbos que manda el cliente son los que conoce el handler', () => {
    for (const v of ['cobrar', 'anular', 'nota']) {
      expect(cliente).toContain(`action: '${v}'`)
      expect(handler).toContain(`b.action === '${v}'`)
    }
  })
})

describe('🔴 Envíos mira los cobros al traer de TN (mutante 6)', () => {
  const traer = envios.slice(envios.indexOf("b.action === 'traer-tn'"), envios.indexOf("b.action === 'guardar'"))
  it('lee tn_cobros vigentes y pone el saldo en cero ANTES de insertar', () => {
    expect(traer).toMatch(/from\('tn_cobros'\)\s*\.select\(/)
    expect(traer).toContain(".is('anulado_en', null)")
    expect(traer.indexOf('f.monto_pedido_a_cobrar = 0')).toBeLessThan(traer.indexOf(".from('envios_reparto').insert("))
  })
})

describe('🔴 el catálogo conoce `nota-cobro` (mutante 7)', () => {
  // El otro repo vive al lado en esta Mac; en CI ⛔ está, y ahí el test se saltea con su nombre.
  let catalogo: string | null = null
  try {
    catalogo = readFileSync(join(raiz, '..', 'bdi-catalogo', 'api', 'tn-categorias.js'), 'utf8')
  } catch {
    catalogo = null
  }
  it.skipIf(!catalogo)('está en ACCIONES_POST', () => {
    expect(catalogo!).toMatch(/ACCIONES_POST = new Set\(\[[^\]]*'nota-cobro'/)
  })
})

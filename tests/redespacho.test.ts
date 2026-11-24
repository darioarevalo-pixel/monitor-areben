/**
 * 🚚 Redespacho por falla (Bruno 24-nov): un toque crea el reclamo resuelto y descuenta del depósito.
 *
 * 🔑 Lo que de verdad importa ⛔ se ve en ninguna pantalla: que el ajuste del ERP salga con el `ref` que el motor
 * reconoce como REEMPLAZO (`lib/ext/rutas.mjs` del motor: `a.motivo = 'fallado' and a.ref like 'devolucion-%-reemplazo:%'`).
 * Con otro ref el stock baja igual, pero Logística ⛔ recibe la orden y nadie despacha: la falla callada.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fallaErpDe } from '../lib/erp/salida-solicitud.core.js'

const fuente = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
// Copia literal del motor (`areben-libro-stock`, `lib/ext/rutas.mjs`): ES_INCIDENCIA e ID_RECLAMO.
const ES_REEMPLAZO_EN_EL_MOTOR = /^devolucion-([0-9]+)-reemplazo:/

describe('redespacho → orden de reemplazo en Logística', () => {
  const accion = fuente('../api/_reclamos.js').split("if (action === 'redespacho') {")[1].split("\n    const id = parseInt(b.id, 10);")[0]

  it('el ajuste sale del DEPÓSITO, como falla, con el ref que el motor publica como reemplazo', () => {
    expect(accion).toContain("solicitudId: `devolucion-${id}-reemplazo`")
    expect(accion).toContain("origen: 'deposito'")
    expect(accion).toContain("proposito: 'falla'")
    const p = fallaErpDe(
      { proposito: 'falla', origen: 'deposito', solicitudId: 'devolucion-42-reemplazo', items: [{ product_id: 7, size_id: 9, quantity: 2, sku: 'F-13' }] },
      'bdi', new Map([[7, 'bdi']]), ['bdi'],
    ) as { motivo: string; deposito: string; ref: string; renglones: { cantidad: number }[] }
    expect(p.motivo).toBe('fallado')
    expect(p.deposito).toBe('deposito_minorista')
    expect(p.ref.match(ES_REEMPLAZO_EN_EL_MOTOR)?.[1]).toBe('42')
    expect(p.renglones).toEqual([{ product_id: 7, size_id: 9, sku: 'F-13', cantidad: -2 }])
  })

  it('el reclamo nace resuelto como «otra unidad» y, si el ERP ⛔ descuenta, se elimina', () => {
    expect(accion).toContain("compensacion: 'otra_unidad'")
    expect(accion).toContain("estado: 'resuelto'")
    expect(accion).toMatch(/if \(!r \|\| r\.error\) \{\s*await supabase\.from\('devoluciones'\)\.delete\(\)/)
  })

  it('Depósito lo puede apretar: la acción está en la bandeja', () => {
    const lista = fuente('../api/_reclamos.js').split('const ACCIONES_DE_LA_BANDEJA = [')[1].split(']')[0]
    expect(lista).toContain("'redespacho'")
  })
})

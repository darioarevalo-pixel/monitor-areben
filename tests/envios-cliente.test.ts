import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { leerOrdenesTN } from '@/lib/envios/cliente'

/**
 * Con qué le pide la pantalla de Envíos las órdenes a Tienda Nube.
 *
 * 🔑 **Lo que se protege acá es el MODO, y no se puede probar contra TN.** Los dos modos del
 * endpoint devuelven la misma forma —el que perdía la mitad de las órdenes contestaba `ok: true`
 * igual—, así que ningún ensayo local puede notar la diferencia mirando la respuesta: se mide
 * contra TN de verdad (14 días: `lista` 100 de 100, `detalle` 48 de 100) y se **fija acá**, que es
 * lo único que impide que alguien lo vuelva a `detalle` de paso y nadie se entere hasta que falte
 * media hoja del cadete. Por eso el ensayo mira la URL: es la decisión, no el resultado.
 *
 * Sin red: el fetch se mockea. En entorno node `apiFetch` sale sin credencial (no hay localStorage
 * del que leer la sesión), que para mirar la URL da igual.
 */

let pedidas: string[] = []

function mockAudit(cuerpo: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    pedidas.push(String(url))
    return new Response(JSON.stringify({ ok: true, ...cuerpo }), { status: 200 })
  })
}

beforeEach(() => { pedidas = [] })
afterEach(() => { vi.unstubAllGlobals() })

describe('leerOrdenesTN', () => {
  it('pide en modo `lista`: el `detalle` corta por rate limit y pierde la mitad', async () => {
    vi.stubGlobal('fetch', mockAudit({ ordenes: [], total_en_rango: 0 }))
    await leerOrdenesTN('bdi', '2026-08-01', '2026-08-14')

    expect(pedidas).toHaveLength(1)
    expect(pedidas[0]).toContain('modo=lista')
  })

  it('la marca y el rango viajan tal cual, y el límite es el máximo del endpoint', async () => {
    vi.stubGlobal('fetch', mockAudit({ ordenes: [], total_en_rango: 0 }))
    await leerOrdenesTN('zattia', '2026-08-01', '2026-08-14')

    const u = new URL(pedidas[0])
    expect(u.searchParams.get('store')).toBe('zattia')
    expect(u.searchParams.get('from')).toBe('2026-08-01')
    expect(u.searchParams.get('to')).toBe('2026-08-14')
    expect(u.searchParams.get('limite')).toBe('200')
  })

  it('sigue restando lo que no llegó, aunque con `lista` dé cero', async () => {
    // El día que TN corte de otra forma, el faltante tiene que seguir teniendo dónde aparecer.
    vi.stubGlobal('fetch', mockAudit({ ordenes: [{ number: 1 }, { number: 2 }], total_en_rango: 9 }))
    const r = await leerOrdenesTN('bdi', '2026-08-01', '2026-08-14')

    expect(r.ordenes).toHaveLength(2)
    expect(r.noLeidas).toBe(7)
  })
})

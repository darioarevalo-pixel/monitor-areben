import { describe, expect, it } from 'vitest'
import { logoDeTienda } from '../api/_caja.js'
import { MARCAS_CAJA } from '@/lib/caja/marcas.core.js'

/** El logo de Stunned sale de SU Tienda Nube (Bruno, 29-oct), como el de Zattia sale de la suya. */
describe('logo del ticket desde Tienda Nube', () => {
  it('la Caja de Zattia sabe cuál es la tienda de Stunned', () => {
    expect((MARCAS_CAJA as Record<string, { tiendaStunned?: string }>).zattia.tiendaStunned).toBe('stunned.com.ar')
  })
  it('lee el logo como lo publica stunned.com.ar (CDN dcdn-us, medido el 29-oct)', () => {
    const html = '<script>var x = {"logo": "https:\\/\\/dcdn-us.mitiendanube.com\\/stores\\/007\\/516\\/263\\/themes\\/common\\/logo-316.png?0"}</script>'
    expect(logoDeTienda(html)).toBe('https://dcdn-us.mitiendanube.com/stores/007/516/263/themes/common/logo-316.png?0')
  })
})

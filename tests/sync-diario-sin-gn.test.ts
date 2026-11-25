import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Bruno 23-nov: «hay que desconectar todo de gn». Los dos diarios miran el corte ANTES de armar el cliente de GN y, pasado el
// corte de toda la base, sólo refrescan las vistas (el catálogo, el stock y las ventas los copian del motor los pasos siguientes).
// Hasta el 23-nov el de BDI ⛔ lo hacía: bajaba GN todos los días y reescribía `productos` de BDI.
describe('los syncs diarios ⛔ leen GN pasado el corte de su base', () => {
  for (const [archivo, base] of [['scripts/sync-diario.js', 'bdi'], ['scripts/sync-diario-zattia.js', 'zattia']]) {
    it(archivo, () => {
      const s = readFileSync(archivo, 'utf8')
      const corte = s.indexOf(`gnApagadoPara('${base}')`)
      expect(corte).toBeGreaterThan(-1)
      expect(s.indexOf('crearClienteGN({')).toBeGreaterThan(corte)
      expect(s).toMatch(/if \(gnApagado\) return soloVistas\(\)/)
    })
  }
})

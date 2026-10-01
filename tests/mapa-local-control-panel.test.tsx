// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ControlRecorridoPanel } from '@/components/exhib/ControlModulo'
import type { ControlRecorrido } from '@/lib/mapa-local/control'

/**
 * El panel del Mapa del local al cerrar el recorrido: el total sale de lo CAMINADO, cada módulo
 * caminado trae su control, y los que nadie caminó se nombran sin afirmar nada sobre ellos.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const r: ControlRecorrido = {
  modulos: [
    { codigo: 'D01', esperadas: 20, bien: 18, faltan: [], sobran: [], sinJuzgar: 0 },
    { codigo: 'D03', esperadas: 15, bien: 15, faltan: [], sobran: [], sinJuzgar: 0 },
  ],
  noCaminados: ['D02', 'I1'],
  esperadas: 35,
  bien: 33,
  faltan: 2,
  sobran: 4,
}

describe('ControlRecorridoPanel', () => {
  it('dice cuántos módulos se caminaron, los totales, cada módulo y los que quedaron sin caminar', () => {
    const div = document.createElement('div')
    act(() => createRoot(div).render(<ControlRecorridoPanel r={r} />))
    const t = div.textContent || ''
    expect(t).toContain('Caminaste 2 de 4 módulos: 33 de 35 en su lugar · faltan 2 · sobran 4')
    expect(t).toContain('Mapa · D01: 18 de 20 en su lugar')
    expect(t).toContain('Mapa · D03: 15 de 15 en su lugar')
    expect(t).toContain('Sin caminar (de esos no se sabe nada): D02, I1')
  })
})

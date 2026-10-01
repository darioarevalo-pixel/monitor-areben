import { describe, expect, it } from 'vitest'
import { mensajeTotal } from '@/components/panel/CalculadoraEnvio'

describe('calculadora del panel: el mensaje del total', () => {
  it('va con punto de miles y el ".-" del final', () => {
    expect(mensajeTotal(45300)).toBe('El total con el envío incluido es de $45.300.-')
    expect(mensajeTotal(1250000)).toBe('El total con el envío incluido es de $1.250.000.-')
  })
  it('los centavos sólo si los hay', () => {
    expect(mensajeTotal(45300.5)).toBe('El total con el envío incluido es de $45.300,50.-')
  })
})

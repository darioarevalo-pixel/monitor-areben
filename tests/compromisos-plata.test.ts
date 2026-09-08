import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { mostrar, paraEditar, parsearMonto, redondear, restante } from '@/lib/compromisos/plata.core.js'

/**
 * La plata de los compromisos.
 *
 * 🔴 **El test que importa es el de ida y vuelta.** El bug que este módulo cierra no estaba en
 * leer ni en escribir por separado —las dos mitades eran razonables— sino en que cada una usaba un
 * convenio distinto para el punto: `String(66666.67)` lo escribía como decimal y el lector lo
 * tomaba como separador de miles. Cien veces el monto, camino al ledger del dashboard.
 *
 * Por eso lo que se fija acá no es un valor esperado sino una PROPIEDAD: lo que sale para un
 * casillero tiene que volver a entrar igual, sea cual sea el número.
 */

describe('🔑 lo que sale a un casillero vuelve a entrar igual', () => {
  const montos = [
    500_000,        // el caso normal
    1234.56,        // el que rompía: String() lo escribía "1234.56" y se leía 123456
    66_666.67,      // el resto de un cobro parcial de $100.000 en tres partes
    0.5,            // se leía 5
    200_000.25,     // se leía 20.000.025
    1_500,          // el que NO hay que romper arreglando los otros
    0,
  ]

  for (const n of montos) {
    it(`${n} sobrevive a la ida y a la vuelta`, () => {
      expect(parsearMonto(paraEditar(n))).toBe(n)
    })
  }

  it('⛔ y el atajo que causó el bug ya no da lo mismo que el correcto', () => {
    // Esto es lo que hacía el formulario de confirmar antes: String() en vez de paraEditar().
    expect(parsearMonto(String(66_666.67))).not.toBe(6_666_667)
    expect(parsearMonto(paraEditar(66_666.67))).toBe(66_666.67)
  })
})

describe('lo que una persona teclea de verdad', () => {
  it('el formato de acá: coma decimal y punto de miles', () => {
    expect(parsearMonto('1.234,56')).toBe(1234.56)
    expect(parsearMonto('1234,56')).toBe(1234.56)
    expect(parsearMonto('492.838')).toBe(492_838)
  })

  it('🔑 un punto con tres dígitos atrás son miles; con uno o dos, decimales', () => {
    // Nadie escribe mil quinientos como "1.50", y nadie escribe un peso cincuenta como "1.500".
    expect(parsearMonto('1.500')).toBe(1500)
    expect(parsearMonto('1.50')).toBe(1.5)
    expect(parsearMonto('1234.56')).toBe(1234.56)   // pegado de una planilla
    expect(parsearMonto('1.234.567')).toBe(1_234_567)
  })

  it('los adornos no molestan', () => {
    expect(parsearMonto('$ 1.234,56')).toBe(1234.56)
    expect(parsearMonto('  500000  ')).toBe(500_000)
  })

  it('lo que no se entiende es NaN, no un número inventado', () => {
    expect(parsearMonto('')).toBeNaN()
    expect(parsearMonto('   ')).toBeNaN()
    expect(parsearMonto('abc')).toBeNaN()
    // Dos comas es un error de tipeo: adivinar cuál vale sería peor que rebotar.
    expect(parsearMonto('1,2,3')).toBeNaN()
  })

  it('un número ya hecho pasa derecho, redondeado a centavos', () => {
    expect(parsearMonto(1234.567)).toBe(1234.57)
    expect(parsearMonto(500_000)).toBe(500_000)
  })
})

describe('cómo se muestra', () => {
  it('los centavos se ven sólo cuando los hay', () => {
    expect(mostrar(500_000)).not.toMatch(/,/)
    expect(mostrar(66_666.67)).toMatch(/66\.666,67/)
  })

  it('sin número no inventa un cero', () => {
    expect(mostrar(null)).toBe('—')
    expect(mostrar(NaN)).toBe('—')
  })

  it('para editar va sin el signo: es lo que entra en el casillero', () => {
    expect(paraEditar(500_000)).toBe('500.000')
    expect(paraEditar(66_666.67)).toBe('66.666,67')
    expect(paraEditar(NaN)).toBe('')
  })
})

describe('lo que falta cuando entró de menos', () => {
  it('la resta que decide por cuánto nace el compromiso del resto', () => {
    expect(restante(500_000, 300_000)).toBe(200_000)
    expect(restante(100_000, 33_333.33)).toBe(66_666.67)
  })

  it('si entró todo, o de más, no queda nada que reclamar', () => {
    expect(restante(500_000, 500_000)).toBe(0)
    expect(restante(500_000, 600_000)).toBe(0)
  })

  it('con un monto que no se entiende no dice que falta todo', () => {
    // El aviso de "entró de menos" se dibuja con esto mientras la persona todavía está tecleando.
    expect(restante(500_000, NaN)).toBeNaN()
  })

  it('los centavos no se van sumando solos', () => {
    expect(redondear(0.1 + 0.2)).toBe(0.3)
  })
})

/**
 * 🔴 **El test que impide que esto se reabra.**
 *
 * El bug no nació de una decisión mala: nació de que la cuenta estaba escrita cuatro veces y una
 * de las cuatro quedó desparejada con su inversa. Arreglar las cuatro no sirve de nada si la
 * próxima pantalla del circuito vuelve a escribir la línea a mano — y es una línea que se copia
 * fácil, porque parece inofensiva.
 *
 * Así que en vez de confiar en que nadie la vuelva a escribir, se mira. Mismo criterio que los
 * tests de paridad del repo: lo que se quiere garantizar es una propiedad del código, no de una
 * ejecución.
 */
describe('⛔ la cuenta de los montos no se vuelve a escribir a mano', () => {
  const DEL_CIRCUITO = [
    'components/panel/Pagos.tsx',
    'components/panel/NuevoCompromiso.tsx',
    'components/acreedores/Compromisos.tsx',
    'api/_compromisos.js',
    'lib/compromisos/core.ts',
  ]

  it('ningún archivo del circuito parsea plata por su cuenta', () => {
    // La línea que estaba cuatro veces: Number(String(x).replace(/\./g, '').replace(',', '.')).
    const aMano = /replace\(\s*\/\\\.\/g\s*,\s*''\s*\)/
    for (const f of DEL_CIRCUITO) {
      expect(aMano.test(readFileSync(f, 'utf8')), `${f} parsea plata a mano: usá parsearMonto()`).toBe(false)
    }
  })

  it('🔑 ningún casillero de plata se llena con String(): va paraEditar()', () => {
    // Es el desencuentro exacto que multiplicaba por cien. `useState(String(algo.monto))`.
    const conString = /useState\(\s*String\(/
    for (const f of DEL_CIRCUITO) {
      expect(conString.test(readFileSync(f, 'utf8')), `${f}: usá paraEditar() para un input de plata`).toBe(false)
    }
  })
})

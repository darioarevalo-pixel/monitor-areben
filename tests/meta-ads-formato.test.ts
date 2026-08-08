import { describe, expect, it } from 'vitest'
import {
  diaCorto, entero, genero, money, pctCien, pctFirmado, pctUno, plata, plataforma,
  roas, rotuloEstado, rotuloRanking,
} from '@/lib/meta-ads/formato'

/**
 * Los formateadores de Meta Ads estaban escritos seis veces con tres semánticas distintas. Lo que
 * este test amarra no es el aspecto —el punto de miles no le importa a nadie— sino **las tres
 * diferencias que sí significan algo** y que una séptima copia volvería a mezclar:
 *
 *  1. `money(v, null)` sale CRUDO y sin símbolo (auditoría: no sabemos la moneda, no la inventamos).
 *  2. `pctUno` recibe proporción y `pctCien` recibe porcentaje: confundirlos es errar por 100×.
 *  3. `rotuloEstado` concuerda en género, porque «Esta conjunto» ya salió a producción una vez.
 */
describe('formato de Meta Ads', () => {
  it('redondea y separa los miles', () => {
    expect(entero(12345.6)).toBe('12.346')
    expect(entero(undefined)).toBe('0')
    expect(entero(null)).toBe('0')
  })

  it('la plata sin moneda lleva el símbolo pelado', () => {
    expect(plata(12345.6)).toBe('$ 12.346')
    expect(plata(0)).toBe('$ 0')
  })

  describe('money', () => {
    // ⚠️ `Intl` con `es-AR` separa el símbolo con un espacio DURO (U+00A0), no con uno común. Va
    // escrito con el escape a propósito: comparado contra un espacio normal, este test falla con
    // dos cadenas que en pantalla se ven idénticas.
    const NBSP = ' '

    it('usa la moneda de la cuenta', () => {
      expect(money(12345.6, 'ARS')).toBe(`$${NBSP}12.346`)
      expect(money(12345.6, 'USD')).toBe(`US$${NBSP}12.346`)
    })

    // 🔑 El caso de la auditoría: sin moneda, el monto va crudo. Poner `$` sería afirmar un `/100`
    // que nadie hizo, y en una pantalla que audita plata eso es errar por dos órdenes de magnitud.
    it('sin moneda devuelve el número pelado, sin símbolo', () => {
      expect(money(12345.6, null)).toBe('12.346')
      expect(money(190000, null)).toBe('190.000')
    })

    it('un código que no es de tres letras cae a ARS en vez de romper', () => {
      expect(money(1000, '')).toBe(`$${NBSP}1.000`)
      expect(money(1000, 'peso')).toBe(`$${NBSP}1.000`)
    })
  })

  it('sin retorno, el ROAS es un guion y no un cero', () => {
    expect(roas(4.23)).toBe('4,2×')
    expect(roas(0)).toBe('—')
    expect(roas(undefined)).toBe('—')
  })

  // Los dos porcentajes existen porque llegan en escalas distintas: la parte del gasto viene como
  // proporción (0,23) y el CTR de Meta viene ya en porcentaje (2,34).
  it('distingue la proporción del porcentaje', () => {
    expect(pctUno(0.234)).toBe('23%')
    expect(pctUno(undefined)).toBe('0%')
    expect(pctCien(2.34)).toBe('2,3%')
    expect(pctCien(undefined)).toBe('0%')
  })

  it('la variación lleva el signo cuando sube', () => {
    expect(pctFirmado(0.053)).toBe('+5,3%')
    expect(pctFirmado(-0.053)).toBe('-5,3%')
    expect(pctFirmado(0)).toBe('0%')
  })

  it('el día corto invierte a dd/mm y aguanta el vacío', () => {
    expect(diaCorto('2026-08-08')).toBe('08/08')
    expect(diaCorto('2026-12-31')).toBe('31/12')
    expect(diaCorto('')).toBe('')
  })

  it('traduce lo que Meta manda en inglés', () => {
    expect(genero('male')).toBe('Hombres')
    expect(genero('unknown')).toBe('Sin dato')
    expect(genero('')).toBe('—')
    expect(plataforma('audience_network')).toBe('Audience Network')
    expect(plataforma('lo_que_venga')).toBe('lo_que_venga')
  })

  describe('rotuloEstado', () => {
    it('concuerda en género: la campaña está pausada y el aviso pausado', () => {
      expect(rotuloEstado('ACTIVE', 'f')).toEqual({ txt: 'Activa', tone: 'success' })
      expect(rotuloEstado('ACTIVE', 'm')).toEqual({ txt: 'Activo', tone: 'success' })
      expect(rotuloEstado('PAUSED', 'f')).toEqual({ txt: 'Pausada', tone: 'neutral' })
      expect(rotuloEstado('PAUSED', 'm')).toEqual({ txt: 'Pausado', tone: 'neutral' })
    })

    // 🔑 Los tres sabores de pausado según de quién sea el interruptor. Una lista cerrada de tres
    // deja al que Meta agregue mañana cayendo al `else`, en inglés y en gris.
    it('reconoce las tres formas de estar pausado', () => {
      for (const s of ['PAUSED', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED']) {
        expect(rotuloEstado(s, 'f')).toEqual({ txt: 'Pausada', tone: 'neutral' })
      }
    })

    it('lo que Meta está procesando no es un problema', () => {
      // Una copia recién nacida viene `IN_PROCESS` con `status: PAUSED`: pintarla de rojo hizo dar
      // una alarma falsa el 8-ago-2026.
      expect(rotuloEstado('IN_PROCESS')).toEqual({ txt: 'En revisión', tone: 'warning' })
      expect(rotuloEstado('DISAPPROVED')).toEqual({ txt: 'Con problemas', tone: 'danger' })
    })

    it('sin estado no hay rótulo: lo dibuja quien llama', () => {
      expect(rotuloEstado(null)).toBeNull()
      expect(rotuloEstado(undefined)).toBeNull()
      expect(rotuloEstado('')).toBeNull()
    })

    it('un estado desconocido se muestra tal cual, en minúscula', () => {
      expect(rotuloEstado('ALGO_NUEVO')).toEqual({ txt: 'algo nuevo', tone: 'neutral' })
    })
  })

  describe('rotuloRanking', () => {
    it('mapea los tres tramos', () => {
      expect(rotuloRanking('ABOVE_AVERAGE')?.tone).toBe('success')
      expect(rotuloRanking('AVERAGE')?.tone).toBe('neutral')
      expect(rotuloRanking('BELOW_AVERAGE_35')?.tone).toBe('danger')
    })

    // `UNKNOWN` es lo que Meta manda cuando el aviso no juntó impresiones, o sea casi siempre en una
    // cuenta chica: dibujarlo llenaría cada fila de una etiqueta gris que no dice nada.
    it('UNKNOWN no se dibuja', () => {
      expect(rotuloRanking('UNKNOWN')).toBeNull()
      expect(rotuloRanking(null)).toBeNull()
    })
  })
})

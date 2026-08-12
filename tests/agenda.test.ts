import { describe, it, expect } from 'vitest'
import {
  aplicaEn,
  corre,
  esFechaIso,
  motivoReglaInvalida,
  ocurrencias,
  promosDe,
  reglaValida,
  rotuloBeneficio,
  rotuloRegla,
  MAX_VENTANA_DIAS,
} from '@/lib/agenda'
import type { Promo, Regla } from '@/lib/agenda'

/**
 * La Agenda operativa.
 *
 * Lo que protegen estos tests es **que la cosa aparezca el día que tiene que aparecer**, ni antes ni
 * después. Una promo que se muestra un día de más se cobra mal en el mostrador con el cliente
 * delante; una rutina que no aparece nunca es peor que no haberla cargado, porque nadie se entera de
 * que falta. Por eso se fijan contra días del almanaque verificados a mano y no contra lo que
 * devuelva la función.
 *
 * Referencias de calendario usadas acá: agosto de 2026 arranca **sábado** y tiene 31 días; el
 * 11-ago-2026 es **martes**; febrero de 2026 tiene **28** días y febrero de 2028, **29**.
 */

const promo = (p: Partial<Promo> = {}): Promo => ({
  id: 'p1',
  banco: 'Banco Nación',
  medio: 'credito',
  beneficio: { tipo: 'descuento', pct: 30 },
  regla: { tipo: 'semanal', dias: [2] },
  desde: '2026-08-01',
  hasta: '2026-08-31',
  condiciones: [],
  pasos: null,
  canales: ['mostrador'],
  marcas: [],
  activa: true,
  autor: null,
  creado: null,
  ...p,
})

describe('esFechaIso: el formato no alcanza', () => {
  it('acepta un día real', () => {
    expect(esFechaIso('2026-08-11')).toBe(true)
    expect(esFechaIso('2028-02-29')).toBe(true) // bisiesto
  })

  it('rechaza un día que pasa el regex pero no existe', () => {
    // El caso que motiva la función: el formato está bien y el día no.
    expect(esFechaIso('2026-02-31')).toBe(false)
    expect(esFechaIso('2026-02-29')).toBe(false) // 2026 no es bisiesto
    expect(esFechaIso('2026-13-01')).toBe(false)
    expect(esFechaIso('2026-00-10')).toBe(false)
  })

  it('rechaza lo que no es un string con ese formato', () => {
    expect(esFechaIso('11/08/2026')).toBe(false)
    expect(esFechaIso('2026-8-1')).toBe(false)
    expect(esFechaIso(null)).toBe(false)
    expect(esFechaIso(20260811)).toBe(false)
  })
})

describe('motivoReglaInvalida: el 400 tiene que decir qué arreglar', () => {
  it('acepta las cinco formas bien armadas', () => {
    expect(motivoReglaInvalida({ tipo: 'diaria' })).toBe(null)
    expect(motivoReglaInvalida({ tipo: 'unica', fecha: '2026-08-20' })).toBe(null)
    expect(motivoReglaInvalida({ tipo: 'rango', desde: '2026-08-01', hasta: '2026-08-31' })).toBe(null)
    expect(motivoReglaInvalida({ tipo: 'semanal', dias: [0, 6] })).toBe(null)
    expect(motivoReglaInvalida({ tipo: 'mensual', dia: 1 })).toBe(null)
    expect(motivoReglaInvalida({ tipo: 'mensual', dia: 'ultimo' })).toBe(null)
  })

  it('un rango de un solo día es válido: es lo mismo que una única y no molesta', () => {
    expect(motivoReglaInvalida({ tipo: 'rango', desde: '2026-08-11', hasta: '2026-08-11' })).toBe(null)
  })

  it('un rango al revés es un error de carga, no un rango vacío', () => {
    // Dejarlo pasar guardaría algo que no aparece nunca y que nadie puede diagnosticar.
    expect(motivoReglaInvalida({ tipo: 'rango', desde: '2026-08-31', hasta: '2026-08-01' }))
      .toMatch(/no puede ser anterior/)
  })

  it('el día del mes corta en 28 y manda a «el último día»', () => {
    expect(motivoReglaInvalida({ tipo: 'mensual', dia: 28 })).toBe(null)
    expect(motivoReglaInvalida({ tipo: 'mensual', dia: 29 })).toMatch(/último día del mes/)
    expect(motivoReglaInvalida({ tipo: 'mensual', dia: 31 })).toMatch(/último día del mes/)
    expect(motivoReglaInvalida({ tipo: 'mensual', dia: 0 })).toMatch(/último día del mes/)
  })

  it('la semanal pide al menos un día, sin repetidos y dentro de 0..6', () => {
    expect(motivoReglaInvalida({ tipo: 'semanal', dias: [] })).toMatch(/por lo menos un día/)
    expect(motivoReglaInvalida({ tipo: 'semanal', dias: [7] })).toMatch(/de 0 \(domingo\) a 6/)
    expect(motivoReglaInvalida({ tipo: 'semanal', dias: [-1] })).toMatch(/de 0 \(domingo\) a 6/)
    expect(motivoReglaInvalida({ tipo: 'semanal', dias: [1.5] })).toMatch(/de 0 \(domingo\) a 6/)
    expect(motivoReglaInvalida({ tipo: 'semanal', dias: [2, 2] })).toMatch(/repetido/)
  })

  it('rechaza lo que no es una regla', () => {
    expect(motivoReglaInvalida(null)).toMatch(/Falta la regla/)
    expect(motivoReglaInvalida([])).toMatch(/Falta la regla/)
    expect(motivoReglaInvalida({ tipo: 'anual', mes: 8 })).toMatch(/desconocido/)
    expect(motivoReglaInvalida({ tipo: 'unica', fecha: '2026-02-31' })).toMatch(/día real/)
  })

  it('reglaValida es el booleano del mismo chequeo', () => {
    expect(reglaValida({ tipo: 'diaria' })).toBe(true)
    expect(reglaValida({ tipo: 'semanal', dias: [] })).toBe(false)
  })
})

describe('aplicaEn: 0 es domingo, como getDay()', () => {
  it('la semanal cae los días que dice y ningún otro', () => {
    // 11-ago-2026 es martes (2). El 12 es miércoles, el 14 viernes.
    const martesYViernes: Regla = { tipo: 'semanal', dias: [2, 5] }
    expect(aplicaEn(martesYViernes, '2026-08-11')).toBe(true)
    expect(aplicaEn(martesYViernes, '2026-08-14')).toBe(true)
    expect(aplicaEn(martesYViernes, '2026-08-12')).toBe(false)
  })

  it('el domingo es 0 y el sábado es 6 — el error que corría todo un día', () => {
    // 1-ago-2026 cae sábado y el 2, domingo. Si el array estuviera dado vuelta para que arranque
    // en lunes, estos dos se irían al día de al lado sin que nada fallara.
    expect(aplicaEn({ tipo: 'semanal', dias: [6] }, '2026-08-01')).toBe(true)
    expect(aplicaEn({ tipo: 'semanal', dias: [0] }, '2026-08-02')).toBe(true)
    expect(aplicaEn({ tipo: 'semanal', dias: [0] }, '2026-08-01')).toBe(false)
  })

  it('la mensual «ultimo» cae en el último día real de cada mes, febrero incluido', () => {
    const ultimo: Regla = { tipo: 'mensual', dia: 'ultimo' }
    expect(aplicaEn(ultimo, '2026-08-31')).toBe(true)
    expect(aplicaEn(ultimo, '2026-08-30')).toBe(false)
    expect(aplicaEn(ultimo, '2026-09-30')).toBe(true)  // septiembre tiene 30
    expect(aplicaEn(ultimo, '2026-02-28')).toBe(true)  // 2026 no es bisiesto
    expect(aplicaEn(ultimo, '2028-02-29')).toBe(true)  // 2028 sí
    expect(aplicaEn(ultimo, '2028-02-28')).toBe(false)
  })

  it('la única cae un solo día', () => {
    const r: Regla = { tipo: 'unica', fecha: '2026-08-20' }
    expect(aplicaEn(r, '2026-08-20')).toBe(true)
    expect(aplicaEn(r, '2026-08-19')).toBe(false)
    expect(aplicaEn(r, '2026-08-21')).toBe(false)
  })

  it('el rango incluye los dos extremos', () => {
    const r: Regla = { tipo: 'rango', desde: '2026-08-10', hasta: '2026-08-12' }
    expect(aplicaEn(r, '2026-08-09')).toBe(false)
    expect(aplicaEn(r, '2026-08-10')).toBe(true)
    expect(aplicaEn(r, '2026-08-12')).toBe(true)
    expect(aplicaEn(r, '2026-08-13')).toBe(false)
  })

  it('una regla rota devuelve false en vez de explotar', () => {
    // La validación es del handler al guardar. Una fila vieja o rota tiene que hacer desaparecer la
    // cosa, no tumbarle la pantalla a quien está atendiendo.
    expect(aplicaEn({ tipo: 'semanal', dias: [] } as unknown as Regla, '2026-08-11')).toBe(false)
    expect(aplicaEn({ tipo: 'diaria' }, '2026-02-31')).toBe(false)
  })
})

describe('ocurrencias: la lista y el día de hoy no pueden discrepar', () => {
  it('la semanal cruzando el fin de mes', () => {
    // Del 28-ago al 4-sep-2026. Martes: 1-sep. Viernes: 28-ago y 4-sep.
    expect(ocurrencias({ tipo: 'semanal', dias: [2, 5] }, '2026-08-28', '2026-09-04'))
      .toEqual(['2026-08-28', '2026-09-01', '2026-09-04'])
  })

  it('la mensual «ultimo» en una ventana que cruza febrero', () => {
    expect(ocurrencias({ tipo: 'mensual', dia: 'ultimo' }, '2026-01-15', '2026-04-01'))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('la mensual por número saltea nada y aparece una vez por mes', () => {
    expect(ocurrencias({ tipo: 'mensual', dia: 1 }, '2026-08-01', '2026-10-31'))
      .toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
  })

  it('una única fuera de la ventana no aparece', () => {
    expect(ocurrencias({ tipo: 'unica', fecha: '2026-07-20' }, '2026-08-01', '2026-08-31')).toEqual([])
    expect(ocurrencias({ tipo: 'unica', fecha: '2026-08-20' }, '2026-08-01', '2026-08-31'))
      .toEqual(['2026-08-20'])
  })

  it('la diaria devuelve la ventana entera, con los dos extremos', () => {
    expect(ocurrencias({ tipo: 'diaria' }, '2026-08-10', '2026-08-13'))
      .toEqual(['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'])
  })

  it('una ventana al revés, o más larga que el techo, devuelve vacío en vez de colgar', () => {
    expect(ocurrencias({ tipo: 'diaria' }, '2026-08-31', '2026-08-01')).toEqual([])
    expect(ocurrencias({ tipo: 'diaria' }, '2026-01-01', '2030-01-01')).toEqual([])
    // Justo en el techo sí contesta.
    expect(ocurrencias({ tipo: 'mensual', dia: 1 }, '2026-01-01', '2026-01-01').length).toBe(1)
    expect(MAX_VENTANA_DIAS).toBeGreaterThan(365)
  })
})

describe('corre(): los dos ejes de vigencia se cruzan', () => {
  it('la regla puede dar sí y la ventana decir que todavía no', () => {
    // El 11-ago-2026 es martes, así que la regla da sí; la promo arranca el 20.
    const p = promo({ desde: '2026-08-20', hasta: '2026-08-31' })
    expect(aplicaEn(p.regla, '2026-08-11')).toBe(true)
    expect(corre(p, '2026-08-11')).toBe(false)
    expect(corre(p, '2026-08-25')).toBe(true) // martes, y ya dentro de la ventana
  })

  it('una promo vencida no corre aunque la regla dé sí', () => {
    expect(corre(promo({ hasta: '2026-08-10' }), '2026-08-11')).toBe(false)
  })

  it('sin «hasta» la promo sigue viva: es sin fin anunciado, no vencida', () => {
    expect(corre(promo({ hasta: null }), '2027-03-02')).toBe(true) // martes
  })

  it('apagada no corre, aunque todo lo demás dé', () => {
    expect(corre(promo({ activa: false }), '2026-08-11')).toBe(false)
  })
})

describe('promosDe(): lo que ve el mostrador ese día', () => {
  const nacion = promo({ id: 'p1', banco: 'Banco Nación' })
  const galicia = promo({ id: 'p2', banco: 'Galicia', canales: ['web'] })
  const zattiaSola = promo({ id: 'p3', banco: 'Andes', marcas: ['zattia'] })
  const todas = [galicia, nacion, zattiaSola]

  it('filtra por canal', () => {
    expect(promosDe(todas, '2026-08-11', { canal: 'mostrador' }).map((p) => p.id)).toEqual(['p3', 'p1'])
    expect(promosDe(todas, '2026-08-11', { canal: 'web' }).map((p) => p.id)).toEqual(['p2'])
  })

  it('marcas vacío quiere decir LAS DOS, no ninguna', () => {
    // Si el vacío se leyera como "ninguna marca", se escondería la mayoría de las promos.
    expect(promosDe(todas, '2026-08-11', { marca: 'bdi' }).map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(promosDe(todas, '2026-08-11', { marca: 'zattia' }).map((p) => p.id)).toEqual(['p3', 'p1', 'p2'])
  })

  it('ordena por banco, en castellano', () => {
    expect(promosDe(todas, '2026-08-11').map((p) => p.banco)).toEqual(['Andes', 'Banco Nación', 'Galicia'])
  })

  it('un día sin promo devuelve vacío', () => {
    expect(promosDe(todas, '2026-08-12')).toEqual([]) // miércoles
  })
})

describe('los rótulos: una pantalla de administración que no se puede leer no se revisa', () => {
  it('la regla en castellano', () => {
    expect(rotuloRegla({ tipo: 'diaria' })).toBe('todos los días')
    expect(rotuloRegla({ tipo: 'semanal', dias: [2] })).toBe('los martes')
    expect(rotuloRegla({ tipo: 'semanal', dias: [5, 1, 3] })).toBe('los lunes, miércoles y viernes')
    expect(rotuloRegla({ tipo: 'mensual', dia: 'ultimo' })).toBe('el último día de cada mes')
    expect(rotuloRegla({ tipo: 'mensual', dia: 1 })).toBe('el 1 de cada mes')
    expect(rotuloRegla({ tipo: 'rango', desde: '2026-08-01', hasta: '2026-08-31' }))
      .toBe('del 2026-08-01 al 2026-08-31')
  })

  it('el beneficio distingue las tres formas de dar algo', () => {
    expect(rotuloBeneficio({ tipo: 'descuento', pct: 30 })).toBe('30% de descuento')
    expect(rotuloBeneficio({ tipo: 'reintegro', pct: 20, tope: 15000 })).toBe('20% de reintegro')
    expect(rotuloBeneficio({ tipo: 'cuotas', n: 3, sinInteres: true })).toBe('3 cuotas sin interés')
    expect(rotuloBeneficio({ tipo: 'cuotas', n: 6, sinInteres: false })).toBe('6 cuotas con interés')
  })
})

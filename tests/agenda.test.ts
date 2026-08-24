import { describe, it, expect } from 'vitest'
import {
  aplicaEn,
  avisosDe,
  contarSinTildar,
  corre,
  cumplimiento,
  entradasDelMes,
  esFechaIso,
  feriadoDe,
  hechoDe,
  motivoReglaInvalida,
  ocurrencias,
  pendientesDe,
  promosDe,
  reglaValida,
  rotuloBeneficio,
  rotuloRegla,
  vaEl,
  MAX_VENTANA_DIAS,
} from '@/lib/agenda'
import type { Hecho, ItemAgenda, Promo, Regla } from '@/lib/agenda'

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

const item = (i: Partial<ItemAgenda> = {}): ItemAgenda => ({
  id: 'i1',
  clase: 'pendiente',
  titulo: 'Reponer la vidriera',
  cuerpo: null,
  regla: { tipo: 'semanal', dias: [2] },
  destino: { tipo: 'todos' },
  marcas: [],
  manualId: null,
  activo: true,
  arrastra: false,
  autor: null,
  creado: '2026-07-01T10:00:00.000Z',
  paraMi: true,
  ...i,
})

const hecho = (h: Partial<Hecho> = {}): Hecho => ({
  itemId: 'i1',
  fecha: '2026-08-11',
  usuario: 'Local',
  nota: null,
  hechoAt: '2026-08-11T13:00:00.000Z',
  ...h,
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

describe('vaEl(): un pendiente no vence, se apaga', () => {
  it('corre el día que dice la regla', () => {
    expect(vaEl(item(), '2026-08-11')).toBe(true) // martes
    expect(vaEl(item(), '2026-08-12')).toBe(false) // miércoles
  })

  it('apagado no corre ningún día, aunque la regla diga que sí', () => {
    expect(vaEl(item({ activo: false }), '2026-08-11')).toBe(false)
  })
})

describe('pendientesDe(): la lista de Hoy, la de Inicio y el badge salen de acá', () => {
  const vidriera = item({ id: 'i1', titulo: 'Reponer la vidriera' })
  const caja = item({ id: 'i2', titulo: 'Cerrar la caja', regla: { tipo: 'diaria' } })
  const ajeno = item({ id: 'i3', titulo: 'Lo de otro', regla: { tipo: 'diaria' }, paraMi: false })
  const todos = [caja, vidriera, ajeno]

  it('trae lo del día, ordenado por título y con su tilde al lado', () => {
    const r = pendientesDe(todos, [hecho({ itemId: 'i2' })], '2026-08-11')
    expect(r.map((p) => p.item.id)).toEqual(['i2', 'i1'])
    expect(r[0].hecho?.usuario).toBe('Local')
    // La ausencia de fila ES "no está hecho": no hay estado guardado que decir.
    expect(r[1].hecho).toBe(null)
  })

  it('lo que no es para mí no entra, aunque lo esté viendo quien lo administra', () => {
    expect(pendientesDe(todos, [], '2026-08-11').map((p) => p.item.id)).not.toContain('i3')
  })

  it('marcas vacío quiere decir LAS DOS, igual que en las promos', () => {
    const soloZattia = item({ id: 'i4', regla: { tipo: 'diaria' }, marcas: ['zattia'] })
    const lista = [caja, soloZattia]
    expect(pendientesDe(lista, [], '2026-08-11', { marca: 'bdi' }).map((p) => p.item.id)).toEqual(['i2'])
    expect(pendientesDe(lista, [], '2026-08-11', { marca: 'zattia' }).map((p) => p.item.id)).toEqual(['i2', 'i4'])
  })

  it('el badge cuenta lo mismo que muestra la lista, y se apaga tildando', () => {
    expect(contarSinTildar(todos, [], '2026-08-11')).toBe(2)
    expect(contarSinTildar(todos, [hecho({ itemId: 'i1' }), hecho({ itemId: 'i2' })], '2026-08-11')).toBe(0)
  })

  it('un aviso no pide tilde y por eso no entra en la lista de pendientes', () => {
    const aviso = item({ id: 'i9', clase: 'aviso', regla: { tipo: 'diaria' } })
    expect(pendientesDe([aviso], [], '2026-08-11')).toEqual([])
  })
})

describe('hechoDe(): el tilde es de un ítem Y de un día', () => {
  const hechos = [hecho({ itemId: 'i1', fecha: '2026-08-11' }), hecho({ itemId: 'i1', fecha: '2026-08-04' })]

  it('no confunde el tilde de otro día', () => {
    expect(hechoDe(hechos, 'i1', '2026-08-11')?.fecha).toBe('2026-08-11')
    expect(hechoDe(hechos, 'i1', '2026-08-18')).toBe(null)
    expect(hechoDe(hechos, 'i2', '2026-08-11')).toBe(null)
  })
})

describe('cumplimiento(): lo que mira gerencia, sin acusar de más', () => {
  it('una ocurrencia por día en que la regla cae, de la más nueva a la más vieja', () => {
    // Del 11-ago (martes) para atrás, tres semanas: 11, 4 y 28-jul.
    const filas = cumplimiento([item()], [hecho({ fecha: '2026-08-04' })], '2026-08-11', 21)
    expect(filas.map((f) => f.fecha)).toEqual(['2026-08-11', '2026-08-04', '2026-07-28'])
    expect(filas.map((f) => !!f.hecho)).toEqual([false, true, false])
  })

  it('🔴 una rutina cargada hoy NO incumplió los días anteriores a su carga', () => {
    // El caso que hace inservible la pantalla: cargar una rutina y verla en rojo un mes para atrás.
    const nuevo = item({ creado: '2026-08-11T12:00:00.000Z' })
    expect(cumplimiento([nuevo], [], '2026-08-11', 30).map((f) => f.fecha)).toEqual(['2026-08-11'])
  })

  it('lo apagado deja de sumar ocurrencias, pero sus tildes viejos se siguen viendo', () => {
    // Apagar dice "ya no va", no "nunca pasó".
    const apagado = item({ activo: false })
    const filas = cumplimiento([apagado], [hecho({ fecha: '2026-08-04' })], '2026-08-11', 21)
    expect(filas.map((f) => f.fecha)).toEqual(['2026-08-04'])
  })

  it('un aviso no se tilda, así que no entra en cumplimiento', () => {
    expect(cumplimiento([item({ clase: 'aviso', regla: { tipo: 'diaria' } })], [], '2026-08-11', 5)).toEqual([])
  })
})

describe('feriadoDe(): se avisa, no se saltea', () => {
  it('reconoce un feriado del catálogo', () => {
    // 17-ago-2026 cae lunes: Paso a la Inmortalidad de San Martín, sin traslado.
    expect(feriadoDe('2026-08-17')).toContain('San Martín')
  })

  it('un día común no es feriado', () => {
    expect(feriadoDe('2026-08-11')).toBe(null)
  })

  it('una fecha que no existe no rompe la pantalla', () => {
    expect(feriadoDe('2026-02-31')).toBe(null)
  })
})

describe('avisosDe(): lo que hay que saber, no lo que hay que hacer', () => {
  const flete = item({ id: 'a1', clase: 'aviso', titulo: 'Viene el flete', regla: { tipo: 'unica', fecha: '2026-08-11' } })
  const cierre = item({ id: 'a2', clase: 'aviso', titulo: 'Cerramos 19 h', regla: { tipo: 'diaria' } })
  const vidriera = item({ id: 'i1' })

  it('trae sólo los avisos del día, ordenados por título, y nunca un pendiente', () => {
    const r = avisosDe([vidriera, flete, cierre], '2026-08-11')
    expect(r.map((a) => a.id)).toEqual(['a2', 'a1'])
  })

  it('el aviso de otro día no aparece', () => {
    expect(avisosDe([flete], '2026-08-12').map((a) => a.id)).toEqual([])
  })

  it('respeta el destino y la marca, igual que los pendientes', () => {
    const ajeno = item({ id: 'a3', clase: 'aviso', regla: { tipo: 'diaria' }, paraMi: false })
    const soloZattia = item({ id: 'a4', clase: 'aviso', regla: { tipo: 'diaria' }, marcas: ['zattia'] })
    const r = avisosDe([cierre, ajeno, soloZattia], '2026-08-11', { marca: 'bdi' })
    expect(r.map((a) => a.id)).toEqual(['a2'])
  })

  it('🔑 un aviso NO cuenta para el badge: ese número sólo baja tildando', () => {
    // Si contara, quedaría prendido para siempre — y el badge que no se puede apagar se deja de
    // mirar en una semana, arrastrando con él a los pendientes, que sí se apagan.
    expect(contarSinTildar([cierre, flete], [], '2026-08-11')).toBe(0)
  })
})

describe('entradasDelMes(): la grilla no puede discrepar con lo que se ve ese día', () => {
  const promoMartes = promo({ id: 'p1', regla: { tipo: 'semanal', dias: [2] } })
  const vidriera = item({ id: 'i1', regla: { tipo: 'semanal', dias: [2] } })
  const flete = item({ id: 'a1', clase: 'aviso', regla: { tipo: 'unica', fecha: '2026-08-11' } })
  const datos = { promos: [promoMartes], items: [vidriera, flete], hechos: [hecho({ fecha: '2026-08-04' })] }

  it('los martes de agosto de 2026 son 4, 11, 18 y 25', () => {
    const m = entradasDelMes(datos, 2026, 8)
    expect([...m.keys()]).toEqual(['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25'])
  })

  it('un día trae la promo primero, después el aviso y al final el pendiente', () => {
    // El mismo orden que la pestaña Hoy: la promo se contesta con el cliente delante.
    expect(entradasDelMes(datos, 2026, 8).get('2026-08-11')?.map((e) => e.tipo))
      .toEqual(['promo', 'aviso', 'pendiente'])
  })

  it('el tilde viaja con el pendiente, y el día sin tilde queda en null', () => {
    const m = entradasDelMes(datos, 2026, 8)
    const del4 = m.get('2026-08-04')?.find((e) => e.tipo === 'pendiente')
    const del11 = m.get('2026-08-11')?.find((e) => e.tipo === 'pendiente')
    expect(del4?.tipo === 'pendiente' && del4.hecho?.usuario).toBe('Local')
    expect(del11?.tipo === 'pendiente' && del11.hecho).toBe(null)
  })

  it('la ventana de la promo corta el mes aunque la regla siga cayendo', () => {
    // `hasta` el 31-ago: en septiembre los martes existen y la promo no.
    expect([...entradasDelMes({ ...datos, items: [] }, 2026, 9).keys()]).toEqual([])
  })

  it('un mes sin nada devuelve un mapa vacío, no un día por celda', () => {
    expect(entradasDelMes({ promos: [], items: [], hechos: [] }, 2026, 8).size).toBe(0)
  })
})

/**
 * El arrastre — lo que destraba las cuatro reuniones semanales.
 *
 * Lo que se prueba acá no es "aparece": es **que aparezca UNA vez** y que **un solo tilde la cierre**.
 * Las dos fallas de este cambio son silenciosas y opuestas: cuatro renglones donde va uno (y la
 * pantalla se vuelve ilegible justo la semana en que algo se atrasó), o un tilde que apaga la
 * ocurrencia de un día y deja las otras tres prendidas para siempre — un rojo que no se puede apagar.
 *
 * Los martes de agosto de 2026 son 4, 11, 18 y 25; el 13 y el 20 son jueves.
 */
describe('pendientesDe(): lo que arrastra queda hasta que se tilda', () => {
  const reunion = item({ id: 'r1', titulo: 'Semanal de comunidad', arrastra: true, regla: { tipo: 'semanal', dias: [2] } })

  // La del 4 se hizo: es lo que fija dónde arranca lo que se debe. Sin ningún tilde, un pendiente
  // que arrastra viene debiéndose desde su primera ocurrencia, que también es correcto pero no es
  // lo que se está probando acá.
  const laDel4 = [hecho({ itemId: 'r1', fecha: '2026-08-04' })]

  it('sigue estando un día en que la regla no corre, y dice de cuándo viene', () => {
    const r = pendientesDe([reunion], laDel4, '2026-08-13')
    expect(r).toHaveLength(1)
    expect(r[0].desde).toBe('2026-08-11')
    expect(r[0].hecho).toBe(null)
  })

  it('sin la bandera, lo de siempre: el jueves ya no está', () => {
    expect(pendientesDe([item({ id: 'r1', regla: { tipo: 'semanal', dias: [2] } })], [], '2026-08-13')).toEqual([])
  })

  it('dos ocurrencias abiertas son UNA fila: es la misma reunión, no dos', () => {
    const r = pendientesDe([reunion], laDel4, '2026-08-20')
    expect(r).toHaveLength(1)
    // Viene del primer martes que quedó sin hacer...
    expect(r[0].desde).toBe('2026-08-11')
    // ...pero el tilde va a la última vez que cayó, que es la única fecha que el servidor acepta.
    expect(r[0].fecha).toBe('2026-08-18')
  })

  it('un solo tilde cierra el arrastre entero', () => {
    const hechos = [hecho({ itemId: 'r1', fecha: '2026-08-18' })]
    expect(pendientesDe([reunion], hechos, '2026-08-20')).toEqual([])
    // Y la semana siguiente vuelve a pedirse, como cualquier semanal.
    const r = pendientesDe([reunion], hechos, '2026-08-25')
    expect(r).toHaveLength(1)
    expect(r[0].desde).toBe(null)
    expect(r[0].fecha).toBe('2026-08-25')
  })

  it('el día en que sí corre y ya se tildó se ve tildado, no arrastrando', () => {
    const r = pendientesDe([reunion], [hecho({ itemId: 'r1', fecha: '2026-08-11' })], '2026-08-11')
    expect(r[0].hecho?.fecha).toBe('2026-08-11')
    expect(r[0].desde).toBe(null)
  })

  it('el badge cuenta la misma fila que muestra la lista', () => {
    expect(contarSinTildar([reunion], [], '2026-08-20')).toBe(1)
    expect(contarSinTildar([reunion], [hecho({ itemId: 'r1', fecha: '2026-08-18' })], '2026-08-20')).toBe(0)
  })

  it('no arrastra desde antes de haberse cargado: una rutina nueva no viene debiendo', () => {
    const nueva = item({ ...reunion, creado: '2026-08-17T10:00:00.000Z' })
    const r = pendientesDe([nueva], [], '2026-08-20')
    expect(r[0].desde).toBe('2026-08-18')
  })

  it('apagado no arrastra: apagarlo dice "ya no va", y lo que ya no va no se debe', () => {
    expect(pendientesDe([item({ ...reunion, activo: false })], [], '2026-08-20')).toEqual([])
  })

  it('no mira más atrás que la ventana de acuse: sin tildes no se puede afirmar nada', () => {
    // El GET manda 30 días de tildes. El 30-sep está a más de 30 días del 11-ago, así que el
    // arrastre arranca en el martes más viejo que sí entra en la ventana.
    const r = pendientesDe([reunion], [], '2026-09-30')
    expect(r[0].desde! >= '2026-08-31').toBe(true)
  })
})

describe('cumplimiento(): lo que arrastra cuenta una vez por racha', () => {
  const reunion = item({ id: 'r1', titulo: 'Semanal de pauta', arrastra: true, regla: { tipo: 'semanal', dias: [2] } })

  it('cuatro semanas debiéndose son UN incumplimiento, no cuatro', () => {
    const filas = cumplimiento([reunion], [], '2026-08-25', 30)
    expect(filas).toHaveLength(1)
    expect(filas[0].fecha).toBe('2026-07-28')
    expect(filas[0].hecho).toBe(null)
  })

  it('el tilde cierra la racha y deja abierta la siguiente, sin dejar rojos colgados', () => {
    const filas = cumplimiento([reunion], [hecho({ itemId: 'r1', fecha: '2026-08-11' })], '2026-08-25', 30)
    expect(filas.map((f) => f.fecha)).toEqual(['2026-08-18', '2026-08-11'])
    expect(filas.find((f) => f.fecha === '2026-08-11')?.hecho).not.toBe(null)
    expect(filas.find((f) => f.fecha === '2026-08-18')?.hecho).toBe(null)
  })

  it('sin la bandera cuenta una fila por ocurrencia, como siempre', () => {
    const suelto = item({ id: 'r1', regla: { tipo: 'semanal', dias: [2] } })
    expect(cumplimiento([suelto], [], '2026-08-25', 30).length).toBeGreaterThan(1)
  })
})

describe('entradasDelMes(): la grilla del mes muestra lo programado, no la deuda', () => {
  const reunion = item({ id: 'r1', arrastra: true, regla: { tipo: 'semanal', dias: [2] } })

  it('el pendiente que arrastra no se pinta todos los días desde su origen', () => {
    const mapa = entradasDelMes({ promos: [], items: [reunion], hechos: [] }, 2026, 8)
    expect([...mapa.keys()]).toEqual(['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25'])
  })
})

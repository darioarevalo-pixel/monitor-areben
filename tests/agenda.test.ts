import { describe, it, expect } from 'vitest'
import {
  aplicaEn,
  avisosDe,
  contarSinTildar,
  corre,
  cumplimiento,
  entradasDelMes,
  entradasDeRango,
  esRepetitiva,
  resumirDia,
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
  filtrarItems,
  rutinasYAvisos,
  actividadesDe,
  actividadDe,
  filasDeHoy,
  porHecho,
  plantillaDe,
  rotuloOffset,
  opcionesDeQuien,
  porResponsable,
  MAX_VENTANA_DIAS,
  DIAS_ARRASTRE,
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
    // El GET manda `DIAS_ARRASTRE` días de tildes de los ítems que arrastran. Más atrás no se puede
    // afirmar que no se hizo, así que el arrastre arranca en el martes más viejo de la ventana.
    // La rutina se carga en enero para que el techo sea la ventana y no el día en que se cargó.
    const vieja = item({ ...reunion, creado: '2026-01-05T10:00:00.000Z' })
    const r = pendientesDe([vieja], [], '2026-09-30')
    expect(r[0].desde! >= '2026-06-02').toBe(true)
    // Y el 30-sep menos 120 días es junio: la ventana de verdad se agrandó, no quedó en los 30.
    expect(r[0].desde! < '2026-08-31').toBe(true)
    expect(DIAS_ARRASTRE).toBeGreaterThan(30)
  })
})

/**
 * El tope por ítem: `arrastraDias`.
 *
 * Lo pidió Bruno el 24-ago cargando las rutinas de Administración: *«Tienda Nube sí tiene arrastre,
 * pero hasta 2 días; ya el tercero no arrastra.»* Sin tope, el renglón de una pasada que nadie
 * tildó se queda para siempre, y un contador que no baja se deja de mirar en una semana.
 *
 * Agosto de 2026 arranca sábado ⇒ los lunes son 3, 10, 17, 24 y los jueves 6, 13, 20, 27.
 */
describe('arrastraDias: no todo lo que arrastra arrastra igual', () => {
  const base = { id: 'p1', titulo: 'La pasada por Tienda Nube', arrastra: true, regla: { tipo: 'semanal' as const, dias: [1, 4] } }
  const conTope = item({ ...base, arrastraDias: 2 })
  const sinTope = item({ ...base, arrastraDias: null })

  it('dentro del tope sigue debiéndose, y dice de cuándo viene', () => {
    // Viernes 14: el jueves 13 quedó sin hacer y está a un día.
    const r = pendientesDe([conTope], [], '2026-08-14')
    expect(r).toHaveLength(1)
    expect(r[0].desde).toBe('2026-08-13')
  })

  it('pasado el tope el renglón se baja solo — y sin tope seguiría ahí', () => {
    // Domingo 16: el jueves 13 quedó a tres días, y el tope dice dos.
    expect(pendientesDe([conTope], [], '2026-08-16')).toEqual([])
    expect(pendientesDe([sinTope], [], '2026-08-16')).toHaveLength(1)
  })

  it('el badge baja con el renglón: es la misma lista', () => {
    expect(contarSinTildar([conTope], [], '2026-08-14')).toBe(1)
    expect(contarSinTildar([conTope], [], '2026-08-16')).toBe(0)
  })

  it('tope 0 es "se vence con el día", no "sin tope"', () => {
    // 🔴 El caso que rompe si en el servidor `Number(null)` se cuela como 0.
    const cero = item({ ...base, arrastraDias: 0 })
    expect(pendientesDe([cero], [], '2026-08-13')).toHaveLength(1)
    expect(pendientesDe([cero], [], '2026-08-14')).toEqual([])
  })

  it('un tope más largo que la ventana no agranda nada: el techo sigue siendo el dato', () => {
    const enorme = item({ ...base, arrastraDias: 4000, creado: '2026-01-05T10:00:00.000Z' })
    const r = pendientesDe([enorme], [], '2026-09-30')
    expect(r[0].desde! >= '2026-06-02').toBe(true)
  })

  it('el tope no toca a los que no arrastran', () => {
    const suelto = item({ ...base, arrastra: false, arrastraDias: 2 })
    expect(pendientesDe([suelto], [], '2026-08-14')).toEqual([])
  })
})

describe('cumplimiento(): con tope, cada ocurrencia vencida cuenta sola', () => {
  const base = { id: 'p1', titulo: 'La pasada por Tienda Nube', arrastra: true, regla: { tipo: 'semanal' as const, dias: [1, 4] } }

  it('cuatro pasadas sin hacer con tope de 2 son CUATRO incumplimientos, no una racha', () => {
    // Del 31-jul al 13-ago caen el 3, el 6, el 10 y el 13, y entre una y otra pasan más de 2 días:
    // ninguna puede cerrar a la anterior, así que ninguna se traga a las demás.
    const filas = cumplimiento([item({ ...base, arrastraDias: 2 })], [], '2026-08-13', 14)
    expect(filas.map((f) => f.fecha).sort()).toEqual(['2026-08-03', '2026-08-06', '2026-08-10', '2026-08-13'])
  })

  it('sin tope son las mismas cuatro pasadas y UNA sola racha', () => {
    const filas = cumplimiento([item({ ...base, arrastraDias: null })], [], '2026-08-13', 14)
    expect(filas.map((f) => f.fecha)).toEqual(['2026-08-03'])
  })

  it('el borde: a los EXACTOS días del tope todavía se debe, y por eso la racha no se corta ahí', () => {
    // Lunes y miércoles, tope 2 ⇒ del lunes al miércoles hay exactamente 2 días. «Hasta 2 días
    // después» incluye el segundo, así que el miércoles todavía cierra al lunes: una racha, no dos.
    const lunMie = item({ ...base, arrastraDias: 2, regla: { tipo: 'semanal', dias: [1, 3] } })
    expect(pendientesDe([lunMie], [], '2026-08-05')[0].desde).toBe('2026-08-03')
    const filas = cumplimiento([lunMie], [], '2026-08-12', 12)
    expect(filas.map((f) => f.fecha).sort()).toEqual(['2026-08-03', '2026-08-10'])
  })

  it('un tilde cierra lo suyo y no lo de la racha anterior, que ya había vencido', () => {
    const filas = cumplimiento([item({ ...base, arrastraDias: 2 })], [hecho({ itemId: 'p1', fecha: '2026-08-06' })], '2026-08-13', 14)
    expect(filas.map((f) => f.fecha).sort()).toEqual(['2026-08-03', '2026-08-06', '2026-08-10', '2026-08-13'])
    // El 6 se ve tildado; el 3, que venció antes de que lo tildaran, se ve sin hacer.
    expect(filas.find((f) => f.fecha === '2026-08-06')?.hecho).not.toBe(null)
    expect(filas.find((f) => f.fecha === '2026-08-03')?.hecho).toBe(null)
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

/**
 * **Los moldes del ingreso.** Un ítem marcado como plantilla no es una rutina: es el renglón que el
 * disparador clona cuando entra mercadería. Lo que se fija acá es que **no corra**: un molde que
 * aparece en Hoy es un pendiente que nadie va a poder tildar nunca —no es de ningún día— y que
 * encima enciende el badge todos los días.
 */
describe('los moldes no corren: existen para clonarse', () => {
  const molde = item({ id: 'm1', titulo: 'Cargar el nombre', plantilla: 'ingreso', offsetDias: 0, regla: { tipo: 'diaria' } })

  it('no sale en Hoy ni enciende el badge, aunque su regla sea diaria', () => {
    expect(pendientesDe([molde], [], '2026-08-11')).toEqual([])
    expect(contarSinTildar([molde], [], '2026-08-11')).toBe(0)
    expect(vaEl(molde, '2026-08-11')).toBe(false)
  })

  it('tampoco entra en el Mes ni en Cumplimiento', () => {
    expect(entradasDelMes({ promos: [], items: [molde], hechos: [] }, 2026, 8).size).toBe(0)
    expect(cumplimiento([molde], [], '2026-08-25', 30)).toEqual([])
  })

  it('un molde que además arrastra sigue sin arrastrar nada', () => {
    const conArrastre = item({ ...molde, arrastra: true })
    expect(pendientesDe([conArrastre], [], '2026-08-20')).toEqual([])
  })

  it('y un aviso marcado como molde tampoco avisa', () => {
    expect(avisosDe([item({ ...molde, clase: 'aviso' })], '2026-08-11')).toEqual([])
  })
})

// ── Administrar la lista: buscar y filtrar ───────────────────────────────────────

describe('opcionesDeQuien — las opciones salen de los ÍTEMS, no del padrón', () => {
  const items = [
    item({ id: 'a', destino: { tipo: 'personas', personas: ['sofi'] } }),
    item({ id: 'b', destino: { tipo: 'personas', personas: ['sofi', 'cande'] } }),
    item({ id: 'c', destino: { tipo: 'roles', roles: ['local'] } }),
    item({ id: 'd', destino: { tipo: 'todos' } }),
  ]

  it('🔴 no pierde los roles ni el «todos»: son responsables igual que una persona', () => {
    const claves = opcionesDeQuien(items).map((o) => o.clave)
    expect(claves).toContain('r:local')
    expect(claves).toContain('todos')
    expect(claves).toContain('p:sofi')
    expect(claves).toContain('p:cande')
  })

  it('cuenta cada ítem en cada responsable que tiene', () => {
    const por = new Map(opcionesDeQuien(items).map((o) => [o.clave, o.n]))
    expect(por.get('p:sofi')).toBe(2)
    expect(por.get('p:cande')).toBe(1)
  })

  it('primero el que más tiene', () => {
    expect(opcionesDeQuien(items)[0].clave).toBe('p:sofi')
  })

  it('sin ítems no inventa opciones', () => {
    expect(opcionesDeQuien([])).toEqual([])
  })
})

describe('filtrarItems', () => {
  const sofi = item({ id: 'a', titulo: 'Subir la diaria', destino: { tipo: 'personas', personas: ['sofi'] } })
  const compartido = item({ id: 'b', titulo: 'Reunión de comunidad', destino: { tipo: 'personas', personas: ['sofi', 'cande'] } })
  const avisoLocal = item({ id: 'c', clase: 'aviso', titulo: 'Cambió el horario', destino: { tipo: 'roles', roles: ['local'] } })
  const apagado = item({ id: 'd', titulo: 'Vieja rutina', activo: false })
  const molde = item({ id: 'e', titulo: 'IMP2 · Poner el precio', plantilla: 'ingreso', offsetDias: 2 })
  const todos = [sofi, compartido, avisoLocal, apagado, molde]

  const ids = (f: Parameters<typeof filtrarItems>[1]) => filtrarItems(todos, f).map((i) => i.id)

  it('sin filtros no recorta nada', () => {
    expect(filtrarItems(todos)).toHaveLength(5)
    expect(ids({ q: '', quien: 'todos', clase: 'todos', estado: 'todos' })).toHaveLength(5)
  })

  it('🔴 lo compartido sale por LAS DOS personas', () => {
    expect(ids({ quien: 'p:sofi' })).toEqual(['a', 'b'])
    expect(ids({ quien: 'p:cande' })).toEqual(['b'])
  })

  it('🔴 una clave que no existe devuelve CERO, ⛔ no todo', () => {
    expect(ids({ quien: 'p:nadie' })).toEqual([])
  })

  it('🔑 la clase separa rutinas de avisos, y la actividad de un evento no es ninguna de las dos', () => {
    // ⚠️ La actividad ('e') ⛔ ya no llega a esta lista: la filtra `rutinasYAvisos` antes, porque se
    // administra en la tarjeta de su evento. Acá se fija que **no se cuele como rutina** si llegara.
    expect(ids({ clase: 'pendiente' })).toEqual(['a', 'b', 'd', 'e'])
    expect(ids({ clase: 'aviso' })).toEqual(['c'])
    expect(rutinasYAvisos(todos).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('el estado separa lo prendido de lo apagado', () => {
    expect(ids({ estado: 'apagados' })).toEqual(['d'])
    expect(ids({ estado: 'activos' })).not.toContain('d')
  })

  it('el buscador no pide tildes ni mayúsculas, y las palabras van en cualquier orden', () => {
    expect(ids({ q: 'reunion' })).toEqual(['b'])
    expect(ids({ q: 'COMUNIDAD reunión' })).toEqual(['b'])
  })

  it('también busca en el cuerpo', () => {
    const conCuerpo = [item({ id: 'x', titulo: 'Algo', cuerpo: 'hay que mirar el depósito' })]
    expect(filtrarItems(conCuerpo, { q: 'deposito' })).toHaveLength(1)
  })

  it('los filtros se combinan, no se pisan', () => {
    expect(ids({ quien: 'p:sofi', clase: 'pendiente', q: 'diaria' })).toEqual(['a'])
    expect(ids({ quien: 'p:sofi', clase: 'aviso' })).toEqual([])
  })
})

describe('porResponsable — quién debe cuántas', () => {
  const filas = [
    { fecha: '2026-08-11', item: item({ id: 'a', destino: { tipo: 'personas', personas: ['sofi'] } }), hecho: null },
    { fecha: '2026-08-12', item: item({ id: 'a', destino: { tipo: 'personas', personas: ['sofi'] } }), hecho: hecho() },
    { fecha: '2026-08-11', item: item({ id: 'b', destino: { tipo: 'personas', personas: ['sofi', 'cande'] } }), hecho: null },
  ]

  it('cuenta lo que falta y el total por responsable', () => {
    const por = new Map(porResponsable(filas).map((r) => [r.clave, r]))
    expect(por.get('p:sofi')).toMatchObject({ sin: 2, total: 3 })
    expect(por.get('p:cande')).toMatchObject({ sin: 1, total: 1 })
  })

  it('⚠️ una fila con dos responsables suma en los DOS: el resumen puede dar más que el total', () => {
    const suma = porResponsable(filas).reduce((a, r) => a + r.total, 0)
    expect(suma).toBeGreaterThan(filas.length)
  })

  it('primero el que más debe', () => {
    expect(porResponsable(filas)[0].clave).toBe('p:sofi')
  })

  it('sin filas no inventa responsables', () => {
    expect(porResponsable([])).toEqual([])
  })
})

// ── La grilla: el rango, y qué se nombra vs qué se cuenta ────────────────────────

describe('entradasDeRango — el mes es un caso suyo, no al revés', () => {
  const datos = {
    promos: [promo({ id: 'p1', regla: { tipo: 'semanal', dias: [2] } })],
    items: [item({ id: 'i1', regla: { tipo: 'semanal', dias: [2] } })],
    hechos: [],
  }

  it('🔴 `hasta` es INCLUSIVE: un rango de un solo día devuelve ese día', () => {
    // 11-ago-2026 es martes.
    const r = entradasDeRango(datos, '2026-08-11', '2026-08-11')
    expect([...r.keys()]).toEqual(['2026-08-11'])
  })

  it('una semana trae sólo los días con algo', () => {
    const r = entradasDeRango(datos, '2026-08-10', '2026-08-16')
    expect([...r.keys()]).toEqual(['2026-08-11'])
  })

  it('da lo mismo que entradasDelMes sobre los bordes del mes', () => {
    const rango = entradasDeRango(datos, '2026-08-01', '2026-08-31')
    const mes = entradasDelMes(datos, 2026, 8)
    expect([...rango.keys()]).toEqual([...mes.keys()])
  })

  it('un rango dado vuelta devuelve vacío y no cuelga', () => {
    expect(entradasDeRango(datos, '2026-08-31', '2026-08-01').size).toBe(0)
  })

  it('🔴 respeta el tope de la ventana: no se recorre un rango de años', () => {
    expect(entradasDeRango(datos, '2026-01-01', '2028-01-01').size).toBe(0)
  })

  it('una fecha mal formada no rompe: devuelve vacío', () => {
    expect(entradasDeRango(datos, 'ayer', '2026-08-31').size).toBe(0)
  })

  it('⛔ la grilla no arrastra: una rutina sin tildar no se pinta los días que no cae', () => {
    const r = entradasDeRango(
      { ...datos, items: [item({ id: 'i1', regla: { tipo: 'semanal', dias: [2] }, arrastra: true })] },
      '2026-08-10', '2026-08-16',
    )
    expect([...r.keys()]).toEqual(['2026-08-11'])
  })
})

describe('esRepetitiva — cuántas veces HABLA en la grilla, no si se repite', () => {
  it('las que caen muchas veces en un mes', () => {
    expect(esRepetitiva({ tipo: 'diaria' })).toBe(true)
    expect(esRepetitiva({ tipo: 'semanal', dias: [2] })).toBe(true)
    expect(esRepetitiva({ tipo: 'rango', desde: '2026-08-01', hasta: '2026-08-10' })).toBe(true)
  })

  it('🔴 `mensual` NO: cae UNA vez en el mes y esconderla detrás de un contador la borra', () => {
    expect(esRepetitiva({ tipo: 'mensual', dia: 15 })).toBe(false)
    expect(esRepetitiva({ tipo: 'mensual', dia: 'ultimo' })).toBe(false)
  })

  it('`unica` tampoco', () => {
    expect(esRepetitiva({ tipo: 'unica', fecha: '2026-08-11' })).toBe(false)
  })
})

describe('resumirDia — lo excepcional se nombra, lo de siempre se cuenta', () => {
  const rutina = (id: string, hecho: Hecho | null = null) =>
    ({ key: id, tipo: 'pendiente', item: item({ id, regla: { tipo: 'semanal', dias: [2] } }), hecho }) as const
  const mensual = (id: string) =>
    ({ key: id, tipo: 'pendiente', item: item({ id, regla: { tipo: 'mensual', dia: 15 } }), hecho: null }) as const
  const unaPromo = { key: 'p1', tipo: 'promo', promo: promo() } as const
  const unAviso = { key: 'a1', tipo: 'aviso', item: item({ id: 'a1', clase: 'aviso' }) } as const

  it('🔴 las promos NO colapsan, aunque sean lo más repetitivo que hay', () => {
    // La pestaña existe para contestar "¿cuándo cae la próxima del Nación?".
    const r = resumirDia([unaPromo, rutina('r1'), rutina('r2'), rutina('r3')])
    expect(r.chips.map((e) => e.key)).toEqual(['p1'])
    expect(r.rutinas).toHaveLength(3)
  })

  it('los avisos tampoco', () => {
    const r = resumirDia([unAviso, rutina('r1'), rutina('r2')])
    expect(r.chips.map((e) => e.key)).toEqual(['a1'])
  })

  it('🔴 un pendiente MENSUAL se nombra: es el único día en que existe', () => {
    const r = resumirDia([mensual('m1'), rutina('r1'), rutina('r2')])
    expect(r.chips.map((e) => e.key)).toContain('m1')
    expect(r.rutinas.map((e) => e.key)).toEqual(['r1', 'r2'])
  })

  it('⚠️ con UNA sola rutina no se cuenta: se nombra', () => {
    const r = resumirDia([rutina('r1')])
    expect(r.rutinas).toEqual([])
    expect(r.chips.map((e) => e.key)).toEqual(['r1'])
  })

  it('cuenta cuántas de las agrupadas ya se tildaron', () => {
    const r = resumirDia([rutina('r1', hecho()), rutina('r2'), rutina('r3', hecho())])
    expect(r.rutinas).toHaveLength(3)
    expect(r.hechas).toBe(2)
  })

  it('🔑 no pierde ni inventa entradas', () => {
    const entradas = [unaPromo, unAviso, mensual('m1'), rutina('r1'), rutina('r2')]
    const r = resumirDia(entradas)
    expect(r.chips.length + r.rutinas.length).toBe(entradas.length)
  })

  it('un día vacío no rompe', () => {
    expect(resumirDia([])).toEqual({ chips: [], rutinas: [], hechas: 0 })
  })
})

/**
 * **Las tres poblaciones de `agenda_items`**, que hasta el 29-ago-2026 vivían mezcladas en una sola
 * lista plana: las rutinas que corren solas, las actividades que un evento copia, y lo copiado.
 *
 * 🔴 Lo que se fija acá es **el corte**: una pantalla que se olvida de uno de los dos filtros ⛔ no
 * falla, se llena — y para cuando se nota, ya nadie la mira. Es exactamente lo que le pasó a
 * «Cargar»: 44 actividades y 33 rutinas en la misma lista, ordenadas alfabéticamente entre sí.
 */
describe('las tres poblaciones: rutinas, actividades de un evento, y lo copiado', () => {
  const rutina = item({ id: 'r', titulo: 'Reponer la vidriera' })
  const aviso = item({ id: 'v', clase: 'aviso', titulo: 'Viene el flete' })
  const actNombre = item({ id: 'a1', titulo: 'Cargar el nombre', plantilla: 'ingreso', offsetDias: 0 })
  const actPublicar = item({ id: 'a2', titulo: 'Publicar en la tienda', plantilla: 'ingreso', offsetDias: 2 })
  const actModelo = item({ id: 'a3', titulo: 'Buscar la modelo', plantilla: 'sesion-fotos', offsetDias: -2 })
  const clon = (id: string, fecha: string, s: Partial<NonNullable<ItemAgenda['sembrado']>> = {}) =>
    item({
      id,
      titulo: `IMP2 · ${id}`,
      regla: { tipo: 'unica', fecha },
      arrastra: true,
      sembrado: { evento: 'ingreso', clave: '2026-08-26·imp2', nombre: 'IMP2', fecha: '2026-08-26', ...s },
    })

  const todos = [rutina, aviso, actNombre, actPublicar, actModelo, clon('c1', '2026-08-26'), clon('c2', '2026-08-28')]

  it('🔴 en Rutinas ⛔ no entra ni una actividad ni un renglón copiado', () => {
    expect(rutinasYAvisos(todos).map((i) => i.id)).toEqual(['r', 'v'])
  })

  it('las actividades salen por evento y **en el orden en que se van a copiar**', () => {
    // Por `offsetDias`: es el mismo orden con el que las siembra `api/_agenda.js`. Que la tarjeta
    // las muestre en otro orden que el que después sale sembrado sería contar otra historia.
    expect(actividadesDe(todos, 'ingreso').map((i) => i.id)).toEqual(['a1', 'a2'])
    expect(actividadesDe(todos, 'sesion-fotos').map((i) => i.id)).toEqual(['a3'])
    expect(actividadesDe(todos, 'lanzamiento')).toEqual([])
  })

  it('un evento sin actividades ⛔ no se cae a las de otro', () => {
    expect(actividadesDe([actModelo], 'ingreso')).toEqual([])
  })

  describe('porHecho: lo copiado, agrupado por el hecho que lo copió', () => {
    it('agrupa por la clave y ⛔ no por el título, que se puede editar', () => {
      const g = porHecho(todos, [], '2026-08-28')
      expect(g).toHaveLength(1)
      expect(g[0].nombre).toBe('IMP2')
      expect(g[0].fecha).toBe('2026-08-26')
      expect(g[0].items.map((i) => i.id)).toEqual(['c1', 'c2'])
    })

    it('filtra por evento cuando se le pide, para la tarjeta de cada uno', () => {
      const otro = clon('x1', '2026-08-20', { evento: 'lanzamiento', clave: '2026-08-20·remera', nombre: 'Remera', fecha: '2026-08-20' })
      expect(porHecho([...todos, otro], [], '2026-08-28', 'ingreso').map((g) => g.nombre)).toEqual(['IMP2'])
      expect(porHecho([...todos, otro], [], '2026-08-28', 'lanzamiento').map((g) => g.nombre)).toEqual(['Remera'])
    })

    it('lo más nuevo primero: es lo que se está mirando', () => {
      const viejo = clon('v1', '2026-08-02', { clave: '2026-08-01·imp1', nombre: 'IMP1', fecha: '2026-08-01' })
      expect(porHecho([...todos, viejo], [], '2026-08-28').map((g) => g.nombre)).toEqual(['IMP2', 'IMP1'])
    })

    it('cuenta lo que falta contra los tildes que llegaron', () => {
      const g = porHecho(todos, [hecho({ itemId: 'c1', fecha: '2026-08-26' })], '2026-08-28')
      expect(g[0].sinTildar).toBe(1)
    })

    it('🔴 más viejo que la ventana de tildes contesta `null`, ⛔ NO cero', () => {
      // Un cero ahí diría «está todo hecho» sin tener con qué: los tildes de esa fecha ya no viajan.
      // Más de 120 días atrás: `DIAS_ARRASTRE`, que es hasta dónde el servidor baja los tildes de
      // lo que arrastra — y todo lo copiado arrastra. A los 88 días **sí** se puede contar.
      const viejo = clon('v1', '2026-01-12', { clave: '2026-01-10·imp1', nombre: 'IMP1', fecha: '2026-01-10' })
      const g = porHecho([viejo], [], '2026-08-28')
      expect(g[0].sinTildar).toBeNull()
    })

    it('lo que se cargó a mano ⛔ no entra en ningún grupo', () => {
      expect(porHecho([rutina, actNombre], [], '2026-08-28')).toEqual([])
    })
  })
})

/**
 * **`filasDeHoy`: la misma actividad de varias órdenes, en una fila** (1-sep-2026, pedido de Bruno:
 * *«cuando hay varias OC, las actividades de cada evento, unificarlas en factor común»*).
 *
 * El caso real que lo abrió: ese día el webhook de Ingresos empezó a mandar en vivo, entraron **diez
 * órdenes** y cada una sembró diez pasos ⇒ **100 renglones** en «Hoy», cuatro de ellos repetidos diez
 * veces para la misma persona.
 *
 * 🔴 Lo que estos tests protegen no es el agrupado: es que **ningún renglón desaparezca**. Un grupo
 * mal armado se ve y se arregla; un pendiente que se cayó adentro de un grupo ajeno —o que no entró
 * en ninguna fila— no lo reclama nadie.
 */
describe('filasDeHoy: unificar las actividades repetidas de varias órdenes', () => {
  const clonDe = (id: string, oc: string, actividad: string, over: Partial<ItemAgenda> = {}) => item({
    id,
    titulo: `${oc} · ${actividad}`,
    regla: { tipo: 'unica', fecha: '2026-09-01' },
    sembrado: { evento: 'ingreso', clave: `2026-09-01·${oc.toLowerCase()}`, nombre: oc, fecha: '2026-09-01' },
    ...over,
  })
  const hoy = (items: ItemAgenda[], hechos: Hecho[] = []) => filasDeHoy(pendientesDe(items, hechos, '2026-09-01'))

  it('actividadDe resta el prefijo del hecho: el paso es lo que queda', () => {
    expect(actividadDe(clonDe('c1', 'OC-0466', '05) Decidir el PRECIO')))
      .toEqual({ evento: 'ingreso', actividad: '05) Decidir el PRECIO', hecho: 'OC-0466' })
  })

  it('🔴 un título editado a mano ⛔ NO se mete en un grupo ajeno: queda suelto', () => {
    // Los títulos se editan como los de cualquier ítem. Un renglón que no entra en ningún grupo
    // desaparece de la pantalla, y ése es el modo de falla que no se puede tener.
    const raro = clonDe('c9', 'OC-0470', 'x', { titulo: 'Le puse otro título' })
    expect(actividadDe(raro)).toBeNull()
    const filas = hoy([raro, clonDe('c1', 'OC-0466', 'Precio'), clonDe('c2', 'OC-0468', 'Precio')])
    expect(filas.filter((f) => f.tipo === 'suelto').map((f) => f.p.item.id)).toEqual(['c9'])
  })

  it('lo cargado a mano ⛔ no se agrupa nunca: no salió de ningún evento', () => {
    expect(actividadDe(item({ titulo: 'Reponer la vidriera' }))).toBeNull()
  })

  it('agrupa la misma actividad de diez órdenes en UNA fila, con las diez adentro', () => {
    const ocs = ['OC-0466', 'OC-0468', 'OC-0470', 'OC-0471', 'OC-0472', 'OC-0473', 'OC-0474', 'OC-0475', 'OC-0799', 'OC-0801']
    const filas = hoy(ocs.map((oc, n) => clonDe(`c${n}`, oc, '05) Decidir el PRECIO (y el costo)')))
    expect(filas).toHaveLength(1)
    expect(filas[0].tipo).toBe('grupo')
    if (filas[0].tipo !== 'grupo') return
    expect(filas[0].actividad).toBe('05) Decidir el PRECIO (y el costo)')
    expect(filas[0].filas.map((f) => f.hecho)).toEqual(ocs)
  })

  it('🔑 UNA sola orden ⛔ no es un grupo: vuelve a ser el renglón que era', () => {
    // Una tarjeta «grupo» con una sola orden adentro es la misma información con un envoltorio más,
    // y encima esconde el número de orden adentro de una ficha.
    const filas = hoy([clonDe('c1', 'OC-0466', 'Precio')])
    expect(filas.map((f) => f.tipo)).toEqual(['suelto'])
  })

  it('dos actividades distintas del mismo ingreso son dos filas, ⛔ no una', () => {
    const filas = hoy([
      clonDe('c1', 'OC-0466', 'Precio'), clonDe('c2', 'OC-0468', 'Precio'),
      clonDe('c3', 'OC-0466', 'Nombre'), clonDe('c4', 'OC-0468', 'Nombre'),
    ])
    expect(filas.map((f) => (f.tipo === 'grupo' ? f.actividad : f.p.item.titulo))).toEqual(['Nombre', 'Precio'])
  })

  it('⛔ NINGÚN pendiente se pierde: lo que entra es lo que sale', () => {
    const items = [
      clonDe('c1', 'OC-0466', 'Precio'), clonDe('c2', 'OC-0468', 'Precio'),
      clonDe('c3', 'OC-0466', 'Nombre'),
      item({ id: 'r1', titulo: 'Reponer la vidriera', regla: { tipo: 'unica', fecha: '2026-09-01' } }),
    ]
    const filas = hoy(items)
    const ids = filas.flatMap((f) => (f.tipo === 'grupo' ? f.filas.map((x) => x.p.item.id) : [f.p.item.id]))
    expect([...ids].sort()).toEqual(['c1', 'c2', 'c3', 'r1'])
  })

  it('cuenta cuántas están hechas: es el «3 de 10» del encabezado', () => {
    const items = [clonDe('c1', 'OC-0466', 'Precio'), clonDe('c2', 'OC-0468', 'Precio'), clonDe('c3', 'OC-0470', 'Precio')]
    const filas = hoy(items, [hecho({ itemId: 'c1', fecha: '2026-09-01' })])
    expect(filas[0].tipo === 'grupo' && filas[0].hechas).toBe(1)
    expect(filas[0].tipo === 'grupo' && filas[0].filas.length).toBe(3)
  })

  it('🔴 cada orden conserva SU ítem y SU fecha: el tilde no se comparte', () => {
    const filas = hoy([clonDe('c1', 'OC-0466', 'Precio'), clonDe('c2', 'OC-0468', 'Precio')])
    if (filas[0].tipo !== 'grupo') throw new Error('debería ser un grupo')
    expect(filas[0].filas.map((f) => [f.p.item.id, f.p.fecha])).toEqual([['c1', '2026-09-01'], ['c2', '2026-09-01']])
  })

  it('las preguntas de puerta se unifican aunque ⛔ NO sean clones', () => {
    // Son once tarjetas que dicen lo mismo y se contestan igual; el hecho, ahí, es la orden.
    const pregunta = (id: string, oc: string) => item({
      id,
      titulo: `¿Por qué puerta entró ${oc} (RHOVE)?`,
      regla: { tipo: 'unica', fecha: '2026-09-01' },
      preguntaIngreso: { oc: `zattia:${id}`, nombre: oc, fecha: '2026-09-01', marca: 'zattia', proveedor: 'RHOVE' },
    })
    const filas = hoy([pregunta('p1', 'OC-0466'), pregunta('p2', 'OC-0468')])
    expect(filas).toHaveLength(1)
    expect(filas[0].tipo === 'grupo' && filas[0].filas.map((f) => f.hecho)).toEqual(['OC-0466', 'OC-0468'])
  })

  it('⛔ una actividad de un evento NO se mezcla con la del otro aunque se llame igual', () => {
    const deOtro = clonDe('l1', 'Remera', 'Precio', {
      sembrado: { evento: 'lanzamiento', clave: '2026-09-01·remera', nombre: 'Remera', fecha: '2026-09-01' },
    })
    const filas = hoy([clonDe('c1', 'OC-0466', 'Precio'), clonDe('c2', 'OC-0468', 'Precio'), deOtro])
    expect(filas.filter((f) => f.tipo === 'suelto').map((f) => f.p.item.id)).toEqual(['l1'])
  })
})

/**
 * `rotuloOffset`: a los cuántos días del hecho cae una actividad, **en castellano**.
 *
 * ⚠️ El caso que lo justifica es el negativo: un `-2` se lee como un error de carga, y es el caso
 * normal de la sesión de fotos —la modelo, 48 h antes—.
 */
describe('rotuloOffset', () => {
  const ingreso = plantillaDe('ingreso')!
  const sesion = plantillaDe('sesion-fotos')!

  it('el día del hecho', () => {
    expect(rotuloOffset(ingreso, 0)).toBe('el día del ingreso')
    // Sin número cargado es el día del hecho, ⛔ no una fila muda.
    expect(rotuloOffset(ingreso, null)).toBe('el día del ingreso')
  })

  it('🔑 el 1 va escrito: «a los 1 día» se lee como un texto sin terminar', () => {
    expect(rotuloOffset(ingreso, 1)).toBe('al día siguiente del ingreso')
    expect(rotuloOffset(ingreso, 2)).toBe('a los 2 días del ingreso')
  })

  it('🔑 antes se dice en castellano y ⛔ no con un signo menos', () => {
    expect(rotuloOffset(sesion, -2)).toBe('2 días antes de la sesión')
    expect(rotuloOffset(sesion, -1)).toBe('el día antes de la sesión')
  })
})

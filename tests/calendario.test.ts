import { describe, it, expect } from 'vitest'
import {
  apagaLaFila,
  caeEnFinDeSemana,
  diasEntre,
  hoyIso,
  juegaLaFecha,
  laQueAprieta,
  nEsimoDiaDeSemana,
  proximas,
  prioridadSugerida,
  resolverComercial,
  sinDecidir,
  sumarDias,
  trasladarFeriado,
  unificar,
  FECHAS_COMERCIALES,
} from '@/lib/calendario'
import type { DecisionFecha, FechaFijada, Hito, IdeaParaContar, Prioridad } from '@/lib/calendario'

/**
 * El calendario editorial.
 *
 * Lo que estos tests protegen no es el render sino **la confianza en la fecha**: la mitad de las
 * comerciales no son fijas, y una fecha mal calculada —o una estimación mostrada como firme— hace
 * que el equipo planifique contra un dato falso y se entere tarde. Por eso se fijan contra años
 * conocidos de verdad y no contra lo que devuelva la función.
 */

const hito = (h: Partial<Hito>): Hito => ({
  id: 'h1', fecha: '2026-08-20', firme: true, titulo: 'Cápsula', tipo: 'lanzamiento',
  nota: null, creadoPor: 'Nico', creado: null, ...h,
})

describe('las reglas de fecha', () => {
  it('nEsimoDiaDeSemana encuentra el n-ésimo día, y devuelve null si no existe', () => {
    // 1-oct-2026 cae jueves; los domingos de ese mes son 4, 11, 18 y 25.
    expect(nEsimoDiaDeSemana(2026, 10, 0, 1)).toBe(4)
    expect(nEsimoDiaDeSemana(2026, 10, 0, 3)).toBe(18)
    expect(nEsimoDiaDeSemana(2026, 10, 0, 4)).toBe(25)
    expect(nEsimoDiaDeSemana(2026, 10, 0, 5)).toBe(null)
    // Contando desde el final.
    expect(nEsimoDiaDeSemana(2026, 10, 0, -1)).toBe(25)
    expect(nEsimoDiaDeSemana(2026, 10, 0, -2)).toBe(18)
    // Febrero bisiesto: 2028 tiene 29 días y el último martes es el 29.
    expect(nEsimoDiaDeSemana(2028, 2, 2, -1)).toBe(29)
  })

  it('el Día de la Madre es el tercer domingo de octubre, en los años que ya se conocen', () => {
    expect(resolverComercial('dia-madre', 2025)?.fecha).toBe('2025-10-19')
    expect(resolverComercial('dia-madre', 2026)?.fecha).toBe('2026-10-18')
    expect(resolverComercial('dia-madre', 2027)?.fecha).toBe('2027-10-17')
  })

  it('Black Friday es el viernes siguiente al cuarto jueves de noviembre', () => {
    expect(resolverComercial('black-friday', 2025)?.fecha).toBe('2025-11-28')
    expect(resolverComercial('black-friday', 2026)?.fecha).toBe('2026-11-27')
    expect(resolverComercial('black-friday', 2027)?.fecha).toBe('2027-11-26')
  })

  it('el Cyber Monday internacional cae tres días después y puede saltar a diciembre', () => {
    expect(resolverComercial('cyber-monday-us', 2026)?.fecha).toBe('2026-11-30')
    // 2024: el cuarto jueves fue el 28, Black Friday el 29 y el lunes ya cayó en diciembre.
    expect(resolverComercial('cyber-monday-us', 2024)?.fecha).toBe('2024-12-02')
  })

  it('el Día del Padre es el tercer domingo de junio (el argentino, no el de afuera)', () => {
    expect(resolverComercial('dia-padre', 2026)?.fecha).toBe('2026-06-21')
  })

  it('sumarDias y diasEntre cruzan meses y años sin correrse un día', () => {
    expect(sumarDias('2026-12-30', 5)).toBe('2027-01-04')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(diasEntre('2026-10-01', '2026-10-18')).toBe(17)
    expect(diasEntre('2026-12-20', '2027-01-06')).toBe(17)
    // Un tramo que atraviesa el cambio de horario del hemisferio norte: siguen siendo días enteros.
    expect(diasEntre('2026-03-01', '2026-04-01')).toBe(31)
  })
})

describe('estimada vs. firme', () => {
  it('sólo las anunciadas salen estimadas; una regla es exacta, no una estimación', () => {
    expect(resolverComercial('hot-sale', 2026)?.estimada).toBe(true)
    expect(resolverComercial('cybermonday-ar', 2026)?.estimada).toBe(true)
    expect(resolverComercial('dia-nino', 2026)?.estimada).toBe(true)
    expect(resolverComercial('dia-madre', 2026)?.estimada).toBe(false)
    expect(resolverComercial('black-friday', 2026)?.estimada).toBe(false)
    expect(resolverComercial('navidad', 2026)?.estimada).toBe(false)
  })

  it('toda anunciada explica cómo se confirma, o nadie sabría qué esperar', () => {
    for (const f of FECHAS_COMERCIALES) {
      if (f.clase === 'anunciada') expect(f.comoSeConfirma, `${f.clave} no dice cómo se confirma`).toBeTruthy()
    }
  })

  it('una fecha fijada le gana a la estimada y pasa a ser firme', () => {
    const fijadas: FechaFijada[] = [{ clave: 'hot-sale', anio: 2026, fecha: '2026-05-19', por: 'Bruno' }]
    const conf = proximas('2026-04-01', 90, { fijadas }).find((e) => e.id === 'comercial:hot-sale:2026')
    expect(conf?.fecha).toBe('2026-05-19')
    expect(conf?.certeza).toBe('firme')

    // Sin confirmar, la misma fecha sale estimada y en el día que estima el catálogo.
    const sin = proximas('2026-04-01', 90).find((e) => e.id === 'comercial:hot-sale:2026')
    expect(sin?.certeza).toBe('estimada')
    expect(sin?.fecha).toBe('2026-05-11')
  })

  it('una fijación es de UN año: no arrastra al siguiente', () => {
    const fijadas: FechaFijada[] = [{ clave: 'hot-sale', anio: 2026, fecha: '2026-05-19', por: 'Bruno' }]
    const del27 = proximas('2027-04-01', 90, { fijadas }).find((e) => e.id === 'comercial:hot-sale:2027')
    expect(del27?.certeza).toBe('estimada')
  })

  // Es lo que sostiene el botón de corregir: si `seConfirma` se apagara al confirmar, una fecha
  // confirmada con el día equivocado quedaría sin forma de arreglarse desde la pantalla.
  it('confirmar una fecha NO le saca el derecho a ser corregida', () => {
    const fijadas: FechaFijada[] = [{ clave: 'hot-sale', anio: 2026, fecha: '2026-05-19', por: 'Bruno' }]
    const conf = proximas('2026-04-01', 90, { fijadas }).find((e) => e.id === 'comercial:hot-sale:2026')
    expect(conf?.certeza).toBe('firme')
    expect(conf?.seConfirma).toBe(true)

    const sin = proximas('2026-04-01', 90).find((e) => e.id === 'comercial:hot-sale:2026')
    expect(sin?.seConfirma).toBe(true)
  })

  it('una fecha que sale del almanaque no se confirma: no la anuncia nadie', () => {
    // Navidad es fija y San Martín 2026 cae lunes, así que la regla resuelve sola. Ninguna de las
    // dos tiene nada que confirmar, y el botón no se les tiene que ofrecer.
    const lista = proximas('2026-08-01', 200)
    expect(lista.find((e) => e.id === 'comercial:navidad:2026')?.seConfirma).toBe(false)
    expect(lista.find((e) => e.id === 'comercial:san-martin:2026')?.seConfirma).toBe(false)

    const propio = proximas('2026-08-01', 30, {
      hitos: [hito({ id: 'h1', fecha: '2026-08-10', firme: true, titulo: 'Lanzamiento' })],
    }).find((e) => e.clase === 'hito')
    expect(propio?.seConfirma).toBe(false)
  })
})

describe('proximas()', () => {
  it('respeta la ventana y ordena por cercanía', () => {
    const r = proximas('2026-10-01', 60)
    expect(r.map((e) => e.fecha)).toEqual([...r.map((e) => e.fecha)].sort())
    expect(r.every((e) => e.fecha >= '2026-10-01' && e.fecha <= '2026-11-30')).toBe(true)
    expect(r.some((e) => e.id === 'comercial:dia-madre:2026')).toBe(true)
    // Navidad queda afuera de una ventana de 60 días arrancando el 1 de octubre.
    expect(r.some((e) => e.id === 'comercial:navidad:2026')).toBe(false)
  })

  it('cruza el año: parado en diciembre, lo que se viene es de enero', () => {
    const r = proximas('2026-12-20', 90)
    expect(r.some((e) => e.id === 'comercial:navidad:2026')).toBe(true)
    expect(r.some((e) => e.id === 'comercial:reyes:2027')).toBe(true)
    expect(r.some((e) => e.id === 'comercial:san-valentin:2027')).toBe(true)
  })

  it('calcula los días que faltan, y el arranque queda en SUGERENCIA hasta que alguien decida', () => {
    const madre = proximas('2026-09-14', 60).find((e) => e.id === 'comercial:dia-madre:2026')!
    expect(madre.faltan).toBe(34)
    expect(madre.anticipoDias).toBe(30)
    // El catálogo sugiere arrancar 30 días antes...
    expect(madre.arranqueSugerido).toBe('2026-09-18')
    // ...pero mientras nadie lo confirme NO hay cuenta regresiva de producción. Este null es el
    // punto de todo: si acá saliera un número, la pantalla anunciaría urgencia sobre una fecha que
    // el equipo ni miró, y un aviso que se ignora doce veces enseña a ignorar el número trece.
    expect(madre.arrancarEn).toBe(null)
    expect(madre.prioridad).toBe(null)
    expect(madre.arrancar).toBe(null)
  })

  it('los hitos entran en la misma lista, con su certeza', () => {
    const hitos = [hito({ id: 'a', fecha: '2026-10-05', firme: false, titulo: 'Cápsula tejidos' })]
    const r = proximas('2026-10-01', 30, { hitos })
    const h = r.find((e) => e.id === 'hito:a')!
    expect(h.clase).toBe('hito')
    expect(h.certeza).toBe('proyectada')
    expect(h.titulo).toBe('Cápsula tejidos')
    expect(h.creadoPor).toBe('Nico')
    // Un hito propio ya es nuestro: no se decide ni se anticipa. La producción la manda quien lo
    // cargó eligiendo la fecha, no el catálogo.
    expect(h.arrancarEn).toBe(null)
    expect(h.prioridad).toBe(null)
    expect(h.arranqueSugerido).toBe(null)
  })

  it('un hito fuera de la ventana no aparece', () => {
    const hitos = [hito({ id: 'lejos', fecha: '2027-06-01' })]
    expect(proximas('2026-10-01', 30, { hitos }).some((e) => e.id === 'hito:lejos')).toBe(false)
  })
})

describe('el enganche: cuántas ideas hay por etapa', () => {
  const ideas = (xs: Partial<IdeaParaContar>[]): IdeaParaContar[] =>
    xs.map((x) => ({ evento: 'comercial:dia-madre:2026', etapa: 'tofu', estado: 'propuesta', ...x }))

  const madre = (is: IdeaParaContar[]) =>
    proximas('2026-09-14', 60, { ideas: is }).find((e) => e.id === 'comercial:dia-madre:2026')!

  it('cuenta las ideas de cada etapa contra la fecha a la que apuntan', () => {
    const e = madre(ideas([{ etapa: 'tofu' }, { etapa: 'tofu' }, { etapa: 'bofu' }]))
    expect(e.cobertura).toEqual({ tofu: 2, mofu: 0, bofu: 1 })
  })

  it('una idea todavía en propuesta YA cuenta como cubierta', () => {
    // El renglón contesta "¿hay alguien pensando esto?", no "¿está lista la pieza?". Si sólo
    // contaran las listas, diría "no hay nada" con cuatro ideas anotadas y se le dejaría de creer.
    expect(madre(ideas([{ etapa: 'mofu', estado: 'propuesta' }])).cobertura.mofu).toBe(1)
    expect(madre(ideas([{ etapa: 'mofu', estado: 'en-produccion' }])).cobertura.mofu).toBe(1)
    expect(madre(ideas([{ etapa: 'mofu', estado: 'pauteada' }])).cobertura.mofu).toBe(1)
  })

  it('una descartada no cubre nada', () => {
    expect(madre(ideas([{ etapa: 'mofu', estado: 'descartada' }])).cobertura.mofu).toBe(0)
  })

  it('una idea sin fecha, o colgada de otra, no se le suma a ésta', () => {
    expect(madre(ideas([{ etapa: 'mofu', evento: null }])).cobertura.mofu).toBe(0)
    expect(madre(ideas([{ etapa: 'mofu', evento: 'comercial:navidad:2026' }])).cobertura.mofu).toBe(0)
  })

  it('sin ideas, la cobertura es todo ceros y no undefined', () => {
    expect(madre([]).cobertura).toEqual({ tofu: 0, mofu: 0, bofu: 0 })
  })
})

describe('la decisión: con cuánta fuerza jugamos cada fecha', () => {
  const decision = (entradaId: string, prioridad: Prioridad, arrancar: string | null = null): DecisionFecha =>
    ({ entradaId, prioridad, arrancar, por: 'Bruno' })

  const con = (desde: string, decisiones: DecisionFecha[]) => proximas(desde, 90, { decisiones })

  it('la prioridad y el arranque viajan hasta la entrada, y recién ahí hay cuenta regresiva', () => {
    const r = con('2026-09-14', [decision('comercial:dia-madre:2026', 'fuerte', '2026-09-18')])
    const madre = r.find((e) => e.id === 'comercial:dia-madre:2026')!
    expect(madre.prioridad).toBe('fuerte')
    expect(madre.arrancar).toBe('2026-09-18')
    expect(madre.arrancarEn).toBe(4)
  })

  it('decidir que nos sumamos SIN poner desde cuándo no inventa un arranque', () => {
    // El caso frecuente: "sí la jugamos, todavía no sabemos cuándo arrancamos". Si el motor cayera
    // acá al `anticipoDias` del catálogo, el equipo vería una fecha de arranque que nadie eligió.
    const madre = con('2026-09-14', [decision('comercial:dia-madre:2026', 'fuerte')])
      .find((e) => e.id === 'comercial:dia-madre:2026')!
    expect(madre.arrancar).toBe(null)
    expect(madre.arrancarEn).toBe(null)
    expect(madre.arranqueSugerido).toBe('2026-09-18')
  })

  it('una decisión es de UN año y de UNA marca: no arrastra al siguiente', () => {
    const d = [decision('comercial:dia-madre:2026', 'fuerte', '2026-09-18')]
    const del27 = proximas('2027-09-14', 60, { decisiones: d }).find((e) => e.id === 'comercial:dia-madre:2027')!
    expect(del27.prioridad).toBe(null)
  })
})

describe('laQueAprieta()', () => {
  const decision = (entradaId: string, prioridad: Prioridad, arrancar: string | null = null): DecisionFecha =>
    ({ entradaId, prioridad, arrancar, por: 'Bruno' })

  it('se calla mientras nadie haya decidido nada, por más cerca que esté la fecha', () => {
    // 🔴 El cambio de fondo. Parado el 1-nov-2026 el CyberMonday es mañana y Black Friday en 26
    // días: con el criterio viejo —"la que ya entró en su anticipo"— esto reclamaba creativos para
    // las dos. Pero nadie eligió trabajarlas todavía, así que no hay nada que reclamar.
    expect(laQueAprieta(proximas('2026-11-01', 60))).toBe(null)
  })

  it('devuelve la más cercana de las que decidimos jugar', () => {
    const decisiones = [
      decision('comercial:cybermonday-ar:2026', 'fuerte'),
      decision('comercial:black-friday:2026', 'fuerte'),
    ]
    expect(laQueAprieta(proximas('2026-11-01', 60, { decisiones }))?.id).toBe('comercial:cybermonday-ar:2026')
  })

  it('una fecha que dejamos pasar NO reclama creativos, aunque sea la más cercana', () => {
    // Sin esto, Etapas de la pauta mandaría a craneаr piezas para algo que ya dijimos que no.
    const decisiones = [
      decision('comercial:cybermonday-ar:2026', 'pasamos'),
      decision('comercial:black-friday:2026', 'suave'),
    ]
    expect(laQueAprieta(proximas('2026-11-01', 60, { decisiones }))?.id).toBe('comercial:black-friday:2026')
  })

  it('la que tiene el arranque vencido se adelanta a una jugada más cercana', () => {
    // Black Friday es más lejos que el CyberMonday, pero su arranque ya pasó y el otro no tiene.
    const decisiones = [
      decision('comercial:cybermonday-ar:2026', 'fuerte'),
      decision('comercial:black-friday:2026', 'fuerte', '2026-10-25'),
    ]
    expect(laQueAprieta(proximas('2026-11-01', 60, { decisiones }))?.id).toBe('comercial:black-friday:2026')
  })

  it('nunca devuelve un hito: lo propio ya está decidido y no se prioriza', () => {
    const hitos = [hito({ id: 'ya', fecha: '2026-04-02' })]
    expect(laQueAprieta(proximas('2026-04-01', 30, { hitos }))).toBe(null)
  })
})

describe('sinDecidir()', () => {
  it('son las comerciales que nadie miró: es lo que la banda de arriba pide', () => {
    const r = proximas('2026-11-01', 60)
    const pend = sinDecidir(r)
    expect(pend.length).toBe(r.filter((e) => e.clase === 'comercial').length)
    expect(pend.every((e) => e.clase === 'comercial')).toBe(true)
  })

  it('dejar pasar una fecha TAMBIÉN es decidirla: sale de la lista de pendientes', () => {
    const decisiones: DecisionFecha[] = [
      { entradaId: 'comercial:cybermonday-ar:2026', prioridad: 'pasamos', arrancar: null, por: 'Bruno' },
    ]
    const pend = sinDecidir(proximas('2026-11-01', 60, { decisiones }))
    expect(pend.some((e) => e.id === 'comercial:cybermonday-ar:2026')).toBe(false)
  })

  it('los hitos propios no se cuentan: ya son nuestros', () => {
    const hitos = [hito({ id: 'a', fecha: '2026-11-10' })]
    expect(sinDecidir(proximas('2026-11-01', 30, { hitos })).some((e) => e.clase === 'hito')).toBe(false)
  })
})

describe('hoyIso()', () => {
  it('devuelve el día LOCAL, que es el que la persona tiene en la cabeza', () => {
    // Misma jornada a dos horas distintas: la hora no puede cambiar el día.
    expect(hoyIso(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01')
    expect(hoyIso(new Date(2026, 0, 1, 23, 59, 0))).toBe('2026-01-01')

    // Y en una zona atrasada respecto de UTC (Argentina es -3) el resultado tiene que DIFERIR de
    // `toISOString()`, que es justo el atajo que a las 21 haría saltar el calendario al día
    // siguiente. En una máquina configurada en UTC no hay nada que comprobar acá.
    const tarde = new Date(2026, 0, 1, 23, 0, 0)
    if (tarde.getTimezoneOffset() > 0) {
      expect(hoyIso(tarde)).not.toBe(tarde.toISOString().slice(0, 10))
    }
  })
})


describe('feriados: el traslado es una REGLA, no una fecha del almanaque', () => {
  it('art. 6 de la Ley 27.399: martes y miércoles al lunes anterior, jueves y viernes al siguiente', () => {
    expect(trasladarFeriado('2027-06-17')).toBe('2027-06-21')  // jue → lun siguiente
    expect(trasladarFeriado('2026-11-20')).toBe('2026-11-23')  // vie → lun siguiente
    expect(trasladarFeriado('2027-08-17')).toBe('2027-08-16')  // mar → lun anterior
    expect(trasladarFeriado('2028-10-12')).toBe('2028-10-16')  // jue → lun siguiente
    expect(trasladarFeriado('2026-08-17')).toBe('2026-08-17')  // ya es lunes, no se mueve
  })

  it('🔴 la Soberanía de 2026 NO es el 20: cae viernes y el feriado real es el lunes 23', () => {
    // El error que este archivo existe para evitar: hardcodear "20 de noviembre" da bien un año y
    // mal los otros. En 2026 el que no se trabaja es el 23.
    expect(resolverComercial('soberania', 2026)?.fecha).toBe('2026-11-23')
    expect(resolverComercial('san-martin', 2026)?.fecha).toBe('2026-08-17')
    expect(resolverComercial('diversidad-cultural', 2026)?.fecha).toBe('2026-10-12')
    expect(resolverComercial('inmaculada', 2026)?.fecha).toBe('2026-12-08')
  })

  it('cuando el trasladable cae fin de semana la regla NO alcanza y la fecha sale estimada', () => {
    // El decreto 614/2025 dice que *podrán* moverse al lunes o viernes más cercano. "Podrán" no se
    // computa: lo decide el Ejecutivo. Mostrarlo como firme sería inventar el día.
    const finde = [2029, 2030, 2031, 2032, 2033, 2034].filter((a) => caeEnFinDeSemana(`${a}-11-20`))
    expect(finde.length).toBeGreaterThan(0)
    for (const a of finde) expect(resolverComercial('soberania', a)?.estimada, String(a)).toBe(true)
    // Y en un año en que sí se puede calcular, es firme.
    expect(resolverComercial('soberania', 2026)?.estimada).toBe(false)
  })

  it('el puente de diciembre sólo existe los años en que hay puente que estimar', () => {
    // 8-dic-2026 cae martes → el puente es el lunes 7, y va estimado porque lo decreta el Ejecutivo.
    expect(resolverComercial('puente-diciembre', 2026)?.fecha).toBe('2026-12-07')
    expect(resolverComercial('puente-diciembre', 2026)?.estimada).toBe(true)
    // 8-dic-2027 cae miércoles: no hay puente que inventar.
    expect(resolverComercial('puente-diciembre', 2027)).toBe(null)
  })
})

describe('el escalón institucional', () => {
  it('un feriado sugiere institucional y una comercial sugiere fuerte', () => {
    expect(prioridadSugerida('feriado')).toBe('institucional')
    expect(prioridadSugerida('efemeride')).toBe('institucional')
    expect(prioridadSugerida('comercial')).toBe('fuerte')
    const r = proximas('2026-08-04', 30)
    expect(r.find((e) => e.id === 'comercial:san-martin:2026')?.prioridadSugerida).toBe('institucional')
    expect(r.find((e) => e.id === 'comercial:dia-nino:2026')?.prioridadSugerida).toBe('fuerte')
  })

  it('institucional no pide producción, pero TAMPOCO apaga la fila', () => {
    // Es lo que no se podía expresar con un flag solo: decidida y visible, sin reclamar trabajo.
    expect(juegaLaFecha('institucional')).toBe(false)
    expect(apagaLaFila('institucional')).toBe(false)
    expect(apagaLaFila('pasamos')).toBe(true)
    expect(juegaLaFecha('fuerte')).toBe(true)
    expect(apagaLaFila('fuerte')).toBe(false)
  })

  it('un feriado en institucional NO reclama creativos', () => {
    const decisiones: DecisionFecha[] = [
      { entradaId: 'comercial:san-martin:2026', prioridad: 'institucional', arrancar: null, por: 'Bruno' },
    ]
    expect(laQueAprieta(proximas('2026-08-04', 30, { decisiones }))).toBe(null)
    // Pero está decidido: sale de la lista de pendientes.
    expect(sinDecidir(proximas('2026-08-04', 30, { decisiones })).some((e) => e.id === 'comercial:san-martin:2026')).toBe(false)
  })

  it('🔑 subirlo un escalón SÍ lo mete: es toda la promoción que hace falta', () => {
    // El caso del 9 de julio en año de Mundial, con San Martín de ejemplo.
    const decisiones: DecisionFecha[] = [
      { entradaId: 'comercial:san-martin:2026', prioridad: 'fuerte', arrancar: null, por: 'Bruno' },
    ]
    expect(laQueAprieta(proximas('2026-08-04', 30, { decisiones }))?.id).toBe('comercial:san-martin:2026')
  })

  it('y como la decisión es por año, al siguiente vuelve a nacer sin decidir', () => {
    const decisiones: DecisionFecha[] = [
      { entradaId: 'comercial:san-martin:2026', prioridad: 'fuerte', arrancar: null, por: 'Bruno' },
    ]
    const del27 = proximas('2027-08-01', 30, { decisiones }).find((e) => e.id === 'comercial:san-martin:2027')!
    expect(del27.prioridad).toBe(null)
    expect(del27.prioridadSugerida).toBe('institucional')
  })
})

describe('el catálogo completo', () => {
  it('toda fecha declara su tipo y su porQue', () => {
    for (const f of FECHAS_COMERCIALES) {
      expect(['comercial', 'feriado', 'efemeride'], f.clave).toContain(f.tipo)
      expect(f.porQue, `${f.clave} no dice por qué está en la lista`).toBeTruthy()
    }
  })

  it('no hay dos fechas con la misma clave', () => {
    const claves = FECHAS_COMERCIALES.map((f) => f.clave)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('de acá a fin de 2026 entran los feriados y las comerciales nuevas', () => {
    const ids = proximas('2026-08-04', 150).map((e) => e.id)
    for (const c of ['san-martin', 'empleado-comercio', 'diversidad-cultural', 'halloween']) {
      expect(ids, c).toContain(`comercial:${c}:2026`)
    }
  })
})

/**
 * La pantalla es una sola para las dos marcas porque Marketing es un equipo solo. Lo que estos
 * tests protegen es que unificar **no borre la diferencia**: las fechas se comparten, las decisiones
 * no. Una fila que mostrara la prioridad de una marca como si fuera de las dos sería peor que las
 * dos pantallas separadas de antes, porque nadie dudaría de ella.
 */
describe('unificar(): una fila con lo que decidió cada marca', () => {
  const decision = (entradaId: string, prioridad: Prioridad, arrancar: string | null = null): DecisionFecha =>
    ({ entradaId, prioridad, arrancar, por: 'Bruno' })

  const listas = (opts: { bdi?: Parameters<typeof proximas>[2]; zattia?: Parameters<typeof proximas>[2] } = {}) => ({
    bdi: proximas('2026-09-14', 60, opts.bdi || {}),
    zattia: proximas('2026-09-14', 60, opts.zattia || {}),
  })

  it('una comercial de las dos marcas es UNA fila con las dos decisiones', () => {
    const filas = unificar(listas({
      bdi: { decisiones: [decision('comercial:dia-madre:2026', 'fuerte', '2026-09-18')] },
      zattia: { decisiones: [decision('comercial:dia-madre:2026', 'pasamos')] },
    }), ['bdi', 'zattia'])

    const madre = filas.filter((f) => f.id === 'comercial:dia-madre:2026')
    expect(madre).toHaveLength(1)
    expect(madre[0].marcas).toEqual(['bdi', 'zattia'])
    expect(madre[0].porMarca.bdi?.prioridad).toBe('fuerte')
    expect(madre[0].porMarca.zattia?.prioridad).toBe('pasamos')
    expect(madre[0].base.titulo).toBe(madre[0].porMarca.bdi?.titulo)
    expect(madre[0].discrepa).toBe(false)
  })

  it('un hito propio existe en UNA base y queda con su marca', () => {
    const propio = hito({ id: 'zx', fecha: '2026-09-20', titulo: 'Cápsula tejidos' })
    const filas = unificar({
      bdi: proximas('2026-09-14', 60),
      zattia: proximas('2026-09-14', 60, { hitos: [propio] }),
    }, ['bdi', 'zattia'])

    const fila = filas.find((f) => f.id === 'hito:zx')!
    expect(fila.marcas).toEqual(['zattia'])
    expect(fila.porMarca.bdi).toBeUndefined()
    expect(fila.base.titulo).toBe('Cápsula tejidos')
  })

  it('con la misma fecha, gana la certeza MÁS FLOJA: si una marca no confirmó, la fila lo dice', () => {
    // Empleado de Comercio es anunciada. BDI la confirma en el mismo día que la estimación, Zattia
    // no la confirmó: si la fila saliera firme, escondería que en una de las dos bases nadie miró.
    const estimada = proximas('2026-09-14', 60).find((e) => e.id === 'comercial:empleado-comercio:2026')!
    const fijada: FechaFijada[] = [{ clave: 'empleado-comercio', anio: 2026, fecha: estimada.fecha, por: 'Bruno' }]

    const filas = unificar(listas({ bdi: { fijadas: fijada } }), ['bdi', 'zattia'])
    const fila = filas.find((f) => f.id === 'comercial:empleado-comercio:2026')!

    expect(estimada.certeza).toBe('estimada')
    expect(fila.porMarca.bdi?.certeza).toBe('firme')
    expect(fila.base.certeza).toBe('estimada')
  })

  it('si una marca confirmó OTRO día, son dos filas y quedan marcadas', () => {
    const estimada = proximas('2026-09-14', 60).find((e) => e.id === 'comercial:empleado-comercio:2026')!
    const otroDia = sumarDias(estimada.fecha, 3)
    const filas = unificar(listas({
      bdi: { fijadas: [{ clave: 'empleado-comercio', anio: 2026, fecha: otroDia, por: 'Bruno' }] },
    }), ['bdi', 'zattia'])

    const dos = filas.filter((f) => f.id === 'comercial:empleado-comercio:2026')
    expect(dos).toHaveLength(2)
    expect(dos.every((f) => f.discrepa)).toBe(true)
    expect(dos.map((f) => f.marcas)).toEqual(
      expect.arrayContaining([['bdi'], ['zattia']]),
    )
    // Cada fila dice los días que faltan hasta SU día, no hasta un promedio inventado.
    expect(dos.find((f) => f.fecha === otroDia)!.base.faltan).toBe(diasEntre('2026-09-14', otroDia))
  })

  it('las ideas anotadas son de cada marca y no se suman entre bases', () => {
    const idea = (evento: string, etapa: string): IdeaParaContar => ({ evento, etapa, estado: 'propuesta' })
    const filas = unificar(listas({
      bdi: { ideas: [idea('comercial:dia-madre:2026', 'tofu')] },
      zattia: { ideas: [idea('comercial:dia-madre:2026', 'bofu'), idea('comercial:dia-madre:2026', 'bofu')] },
    }), ['bdi', 'zattia'])

    const madre = filas.find((f) => f.id === 'comercial:dia-madre:2026')!
    expect(madre.porMarca.bdi?.cobertura).toEqual({ tofu: 1, mofu: 0, bofu: 0 })
    expect(madre.porMarca.zattia?.cobertura).toEqual({ tofu: 0, mofu: 0, bofu: 2 })
  })

  it('con una sola marca visible devuelve exactamente lo de esa marca, en el mismo orden', () => {
    const sola = proximas('2026-09-14', 60)
    const filas = unificar({ bdi: sola }, ['bdi'])
    expect(filas.map((f) => f.id)).toEqual(sola.map((e) => e.id))
    expect(filas.every((f) => f.marcas.length === 1 && !f.discrepa)).toBe(true)
  })

  it('una marca que falló (403) entra como lista vacía y no se lleva puesta a la otra', () => {
    const filas = unificar({ bdi: [], zattia: proximas('2026-09-14', 60) }, ['bdi', 'zattia'])
    expect(filas.length).toBeGreaterThan(0)
    expect(filas.every((f) => f.marcas).valueOf()).toBe(true)
    expect(filas.every((f) => f.marcas.includes('zattia') && !f.marcas.includes('bdi'))).toBe(true)
  })

  it('el orden lo manda el argumento, no el orden en que llegaron las respuestas', () => {
    const l = listas()
    expect(unificar(l, ['zattia', 'bdi'])[0].marcas).toEqual(['zattia', 'bdi'])
    expect(unificar(l, ['bdi', 'zattia'])[0].marcas).toEqual(['bdi', 'zattia'])
  })
})

import { describe, it, expect } from 'vitest'
import {
  TEMAS, SISTEMAS, cerrada, claveValida, diaSemana, etiquetaSemana, hoyAr, idSemana,
  lunesDe, semanaAnterior, semanaDe, semanaSiguiente, sumarDias,
} from '@/lib/memo/semana.core.js'
import {
  costoPorCompra, delta, esStunned, fusionarPorCanal, fusionarVenta, lineaDe, pautaPorLinea,
  resumirCanales, semaforoPauta, ticketPromedio, ventaPorCanal, ventaPorLinea,
} from '@/lib/memo/foto.core.js'
import { LINEAS, MARCAS } from '@/lib/lineas.core.js'

/**
 * El memo semanal. Lo que se prueba acá es lo que, si se rompe, rompe callado: la semana en el huso
 * equivocado, la venta contada por rango de ids en vez de por fecha, y Stunned mezclado con Zattia.
 * Los tres fallan devolviendo un número plausible.
 */

describe('la semana: lunes a domingo, en hora de Buenos Aires', () => {
  it('el lunes con el lunes en 0', () => {
    expect(diaSemana('2026-08-10')).toBe(0) // lunes
    expect(diaSemana('2026-08-16')).toBe(6) // domingo
  })

  it('un lunes es su propio lunes, y un domingo cae en la semana que ARRANCÓ el lunes anterior', () => {
    expect(lunesDe('2026-08-10')).toBe('2026-08-10')
    // 🔴 El caso que rompe con la convención de JS (domingo = 0): sin el `+6 % 7`, el domingo 16
    // caería en la semana del 17 y todo lo que se venda ese día se sumaría a la semana siguiente.
    expect(lunesDe('2026-08-16')).toBe('2026-08-10')
    expect(semanaDe('2026-08-16')).toEqual({ id: 'w2026-08-10', ini: '2026-08-10', fin: '2026-08-16' })
  })

  it('el id de la semana es su lunes', () => {
    expect(idSemana('2026-08-10')).toBe('w2026-08-10')
    expect(semanaDe('2026-08-13').id).toBe('w2026-08-10')
  })

  it('cruza el año sin inventar una semana', () => {
    // 1-ene-2027 es viernes: su semana arranca el lunes 28-dic-2026.
    expect(semanaDe('2027-01-01')).toEqual({ id: 'w2026-12-28', ini: '2026-12-28', fin: '2027-01-03' })
    expect(semanaSiguiente(semanaDe('2026-12-28')).ini).toBe('2027-01-04')
    expect(semanaAnterior(semanaDe('2027-01-04')).ini).toBe('2026-12-28')
  })

  it('cruza el fin de mes y el año bisiesto', () => {
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01')
    expect(sumarDias('2024-02-28', 1)).toBe('2024-02-29')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('hoyAr lee el día en Buenos Aires, no en UTC', () => {
    // 🔴 El caso que importa: 3 h UTC del 16 es todavía el 15 en Buenos Aires. Con `toISOString()`
    // esto daría el 16, y lo escrito a medianoche del sábado aparecería en el día equivocado.
    expect(hoyAr(new Date('2026-08-16T02:00:00Z'))).toBe('2026-08-15')
    expect(hoyAr(new Date('2026-08-16T04:00:00Z'))).toBe('2026-08-16')
  })

  it('la semana se cierra a partir del lunes siguiente, no el domingo', () => {
    const sem = semanaDe('2026-08-10')
    // 🔴 Estrictamente mayor: cerrarla el domingo se comería el domingo entero, que en un local es
    // un día de venta completo.
    expect(cerrada(sem, '2026-08-16')).toBe(false)
    expect(cerrada(sem, '2026-08-17')).toBe(true)
  })

  it('la etiqueta dice el rango, y repite el mes sólo cuando la semana lo cruza', () => {
    expect(etiquetaSemana(semanaDe('2026-08-12'))).toBe('10 al 16 de agosto de 2026')
    expect(etiquetaSemana(semanaDe('2026-09-02'))).toBe('31 de agosto al 6 de septiembre de 2026')
    expect(etiquetaSemana(semanaDe('2027-01-01'))).toBe('28 de diciembre de 2026 al 3 de enero de 2027')
  })
})

describe('las claves de los campos las valida el servidor', () => {
  it('acepta los siete temas y los ocho sistemas', () => {
    expect(TEMAS).toHaveLength(7)
    expect(SISTEMAS).toHaveLength(8)
    for (const t of TEMAS) expect(claveValida('acta', t.clave)).toBe(true)
    for (const s of SISTEMAS) expect(claveValida('avance', s.clave)).toBe(true)
  })

  it('rechaza una clave inventada, un bloque inventado y el cruce de los dos', () => {
    // Sin esto, un POST con una clave que ninguna pantalla muestra guarda una fila fantasma: el
    // texto se "guarda" y desaparece, que es peor que un error.
    expect(claveValida('acta', 'monitor')).toBe(false) // sistema en el bloque del acta
    expect(claveValida('avance', 'logros')).toBe(false) // tema en el bloque de avances
    expect(claveValida('acta', 'lo-que-sea')).toBe(false)
    expect(claveValida('otro', 'logros')).toBe(false)
  })

  it('HC Arévalo no está entre los sistemas', () => {
    // Es de Bruno, no de Areben (15-ago-2026). Si alguien lo agrega sin querer, esto lo caza.
    expect(SISTEMAS.map((s) => s.clave)).not.toContain('hc-arevalo')
  })
})

describe('Stunned es una línea de Zattia, no una marca', () => {
  it('se reconoce por el prefijo de SKU, sin importar mayúsculas', () => {
    expect(esStunned('STU-001')).toBe(true)
    expect(esStunned('stu123')).toBe(true)
    expect(esStunned('ZAT-STU')).toBe(false) // el prefijo es al principio, no en cualquier lado
    expect(esStunned(null)).toBe(false)
  })

  it('un producto de Zattia con SKU stu es Stunned; en BDI no existe', () => {
    expect(lineaDe('zattia', 'STU-9')).toBe('stunned')
    expect(lineaDe('zattia', 'ZAT-9')).toBe('zattia')
    expect(lineaDe('zattia', null)).toBe('zattia')
    expect(lineaDe('bdi', 'STU-9')).toBe('bdi')
  })
})

describe('la venta de la semana', () => {
  // Tres ventas: dos adentro de la semana y una AFUERA cuyo id cae en el medio del rango. Es el
  // caso real: `venta_detalles` no tiene fecha y se pide por rango de `sale_id`.
  const ventas = [
    { id: 100, date_sale: '2026-08-10' },
    { id: 105, date_sale: '2026-08-13' },
    { id: 110, date_sale: '2026-08-20' }, // fuera de la semana
  ]
  const detalles = [
    { sale_id: 100, product_id: 1, quantity: 2, total: 20000 },
    { sale_id: 105, product_id: 2, quantity: 1, total: 15000 },
    { sale_id: 105, product_id: 3, quantity: 1, total: 5000 }, // Stunned, misma venta
    { sale_id: 110, product_id: 1, quantity: 9, total: 90000 }, // fuera de la semana
  ]
  const skuPor = new Map([['1', 'ZAT-1'], ['2', 'ZAT-2'], ['3', 'STU-3']])
  const args = { store: 'zattia', ventas, detalles, skuPor, desde: '2026-08-10', hasta: '2026-08-16' }

  it('🔴 filtra por la FECHA de la venta, no por el rango de sale_id', () => {
    // Si se filtrara por el rango de ids, la venta 110 (del 20 de agosto) entraría y la semana
    // mostraría $90.000 de más. El número seguiría siendo plausible: por eso este test existe.
    const v = ventaPorLinea(args)
    expect(v.zattia.facturado).toBe(35000)
    expect(v.zattia.unidades).toBe(3)
  })

  it('reparte facturado y unidades por línea', () => {
    const v = ventaPorLinea(args)
    expect(v.stunned.facturado).toBe(5000)
    expect(v.stunned.unidades).toBe(1)
    // Sin el filtro de SKU, los $5.000 de Stunned se sumarían a Zattia y nadie lo notaría.
    expect(v.zattia.facturado).not.toBe(40000)
  })

  it('una venta mixta cuenta un ticket en cada línea (y está documentado)', () => {
    const v = ventaPorLinea(args)
    expect(v.zattia.tickets).toBe(2) // ventas 100 y 105
    expect(v.stunned.tickets).toBe(1) // la 105, que es mixta
  })

  it('en BDI no hace falta el SKU: todo es BDI', () => {
    const v = ventaPorLinea({ ...args, store: 'bdi', skuPor: null })
    expect(Object.keys(v)).toEqual(['bdi'])
    expect(v.bdi.facturado).toBe(40000)
  })

  it('sin ventas devuelve vacío, no ceros inventados', () => {
    expect(ventaPorLinea({ ...args, detalles: [] })).toEqual({})
  })

  it('fusiona las dos bases sumando por línea', () => {
    const a = { bdi: { facturado: 100, unidades: 1, tickets: 1 } }
    const b = { zattia: { facturado: 50, unidades: 2, tickets: 1 }, bdi: { facturado: 25, unidades: 1, tickets: 1 } }
    expect(fusionarVenta(a, b)).toEqual({
      bdi: { facturado: 125, unidades: 2, tickets: 2 },
      zattia: { facturado: 50, unidades: 2, tickets: 1 },
    })
  })

  it('el ticket promedio es null sin ventas: dividir por cero no es cero', () => {
    expect(ticketPromedio({ facturado: 30000, unidades: 3, tickets: 2 })).toBe(15000)
    expect(ticketPromedio({ facturado: 0, unidades: 0, tickets: 0 })).toBeNull()
    expect(ticketPromedio(undefined)).toBeNull()
  })
})

describe('la variación contra la semana anterior', () => {
  it('🔴 sin semana anterior el porcentaje es null, NO 100 ni Infinity', () => {
    // "+∞%" en el memo de una marca nueva es el número que después alguien cita en una reunión.
    expect(delta(1000, 0)).toEqual({ abs: 1000, pct: null })
    expect(delta(0, 0)).toEqual({ abs: 0, pct: null })
  })

  it('sube y baja con signo', () => {
    expect(delta(150, 100)).toEqual({ abs: 50, pct: 50 })
    expect(delta(50, 100)).toEqual({ abs: -50, pct: -50 })
  })
})

describe('la pauta', () => {
  const filas = [
    { fecha: '2026-08-10', linea: 'bdi', spend: 1000, compras: 2, revenue: 8000 },
    { fecha: '2026-08-11', linea: 'bdi', spend: 500, compras: 1, revenue: 4000 },
    { fecha: '2026-08-11', linea: 'stunned', spend: 300, compras: 0, revenue: 0 },
    { fecha: '2026-08-11', linea: null, spend: 999, compras: 9, revenue: 9 }, // sin línea asignada
  ]

  it('suma por línea y descarta lo que no tiene línea', () => {
    const p = pautaPorLinea(filas)
    expect(p.bdi).toEqual({ gasto: 1500, compras: 3, revenue: 12000 })
    expect(p.stunned.gasto).toBe(300)
    // Una campaña sin línea asignada no se puede atribuir: sumarla a alguien es inventar.
    expect(Object.keys(p).sort()).toEqual(['bdi', 'stunned'])
  })

  it('el costo por compra es null sin compras', () => {
    expect(costoPorCompra({ gasto: 1500, compras: 3, revenue: 0 })).toBe(500)
    expect(costoPorCompra({ gasto: 300, compras: 0, revenue: 0 })).toBeNull()
  })

  it('🔴 lo que hace mudo al renglón son las COMPRAS, no el nombre de la línea', () => {
    // Acá vivía la excepción `linea === 'stunned'`, con un test que la defendía. La premisa era que
    // su píxel nunca registraba una compra — y dejó de ser cierta: la semana del 10 al 16 Stunned
    // trajo 1 compra y $38.241. Una excepción por nombre no se entera de eso nunca: tapa el número
    // el día que aparece. Con la regla mirando el dato, el mismo renglón se lee solo.
    expect(semaforoPauta({ gasto: 300, compras: 5, revenue: 0 }, 1000)).toBe('verde')
    expect(semaforoPauta({ gasto: 9886, compras: 1, revenue: 38241 }, 1000)).toBe('rojo')
    // Sin compras sigue sin haber semáforo, y ahora vale para las tres líneas por igual.
    expect(semaforoPauta({ gasto: 9886, compras: 0, revenue: 0 }, 1000)).toBe('sin-dato')
  })

  it('el semáforo se lee contra el techo, y avisa antes de pasarlo', () => {
    const p = (gasto: number) => ({ gasto, compras: 1, revenue: 0 })
    expect(semaforoPauta(p(1100), 1000)).toBe('rojo')
    expect(semaforoPauta(p(900), 1000)).toBe('amarillo') // 90% del techo
    expect(semaforoPauta(p(500), 1000)).toBe('verde')
    // Sin techo cargado no hay semáforo: verde por defecto sería decir "rinde" sin saberlo.
    expect(semaforoPauta(p(500), 0)).toBe('sin-dato')
    expect(semaforoPauta(undefined, 1000)).toBe('sin-dato')
  })
})

describe('la venta por canal: mayorista contra el resto', () => {
  // El mismo enredo de fechas que por línea, más el que sólo aparece acá: una venta tiene UN canal.
  // El envío y el descuento viven en la VENTA, no en el renglón: la 102 lleva las dos cosas.
  const ventas = [
    { id: 100, date_sale: '2026-08-10', channel: 'Mi Local', discount: 0, shipping_cost: 0 },
    { id: 101, date_sale: '2026-08-11', channel: 'Mayorista', discount: 0, shipping_cost: 0 },
    { id: 102, date_sale: '2026-08-12', channel: 'Tienda Nube', discount: 3000, shipping_cost: 5000 },
    { id: 103, date_sale: '2026-08-13', channel: 'Mercadolibre', discount: 0, shipping_cost: 0 },
    { id: 104, date_sale: '2026-08-14', channel: 'Ninguno', discount: 0, shipping_cost: 0 },
    { id: 110, date_sale: '2026-08-20', channel: 'Mayorista', discount: 0, shipping_cost: 0 }, // fuera de la semana
  ]
  const detalles = [
    { sale_id: 100, quantity: 2, total: 20000 },
    { sale_id: 101, quantity: 10, total: 100000 },
    { sale_id: 102, quantity: 1, total: 15000 },
    { sale_id: 103, quantity: 1, total: 8000 },
    { sale_id: 104, quantity: 1, total: 3000 },
    { sale_id: 110, quantity: 50, total: 500000 }, // fuera de la semana
  ]
  const args = { ventas, detalles, desde: '2026-08-10', hasta: '2026-08-16' }

  it('🔴 filtra por la FECHA de la venta, no por el rango de sale_id', () => {
    // La 110 es mayorista y del 20 de agosto. Si entrara, mayorista mostraría $600.000 en vez de
    // $100.000 — un número perfectamente plausible.
    const { canales } = ventaPorCanal(args)
    expect(canales.mayorista.facturado).toBe(100000)
  })

  it('clasifica con canalDe: no hay un segundo criterio acá', () => {
    const { canales } = ventaPorCanal(args)
    expect(canales.local.facturado).toBe(20000)
    expect(canales.online.facturado).toBe(17000) // 15.000 − 3.000 de descuento + 5.000 de envío
    expect(canales.otro.facturado).toBe(8000)
    expect(canales.tecnica.facturado).toBe(3000)
  })

  it('🔴 los tickets por canal SÍ suman, al revés que por línea', () => {
    // Una venta mixta cuenta un ticket en cada línea; una venta tiene UN canal. Las dos tablas se
    // leen una al lado de la otra y por eso la diferencia está escrita.
    const { canales } = ventaPorCanal(args)
    const tickets = Object.values(canales).reduce((a, v) => a + v.tickets, 0)
    expect(tickets).toBe(5) // las cinco ventas de la semana, ni una repetida
  })

  it('🔴 el descuento y el envío se aplican UNA vez por venta, no por renglón', () => {
    // La forma de fallar es sumarlos adentro del bucle de detalles: con tres productos, el envío
    // entraría tres veces. El número sigue siendo plausible y nadie lo nota.
    const { canales } = ventaPorCanal({
      ventas: [{ id: 300, date_sale: '2026-08-11', channel: 'Tienda Nube', discount: 1000, shipping_cost: 2000 }],
      detalles: [
        { sale_id: 300, quantity: 1, total: 10000 },
        { sale_id: 300, quantity: 1, total: 10000 },
        { sale_id: 300, quantity: 1, total: 10000 },
      ],
      desde: '2026-08-10', hasta: '2026-08-16',
    })
    expect(canales.online.facturado).toBe(31000) // 30.000 − 1.000 + 2.000
    expect(canales.online.tickets).toBe(1)
  })

  it('🔑 el facturado del canal NO es el de la línea: acá lleva descuento y envío', () => {
    // Documentado porque las dos tablas se leen una al lado de la otra y la brecha medida en la
    // semana del 10 al 16 fue de $1.081.927 (6,9 %). Por eso las columnas se llaman distinto.
    const { canales } = ventaPorCanal(args)
    const soloMercaderia = 15000
    expect(canales.online.facturado).not.toBe(soloMercaderia)
  })

  it('guarda los nombres crudos que cayeron en cada canal', () => {
    // Sin esto, «Otros canales» es una bolsa que nadie puede auditar: hoy adentro hay Mercadolibre,
    // mañana puede haber cualquier cosa que Gestión Nube invente.
    const { nombres } = ventaPorCanal(args)
    expect(nombres.otro).toEqual(['Mercadolibre'])
    expect(nombres.local).toEqual(['Mi Local'])
  })

  it('un canal vacío cae en técnica CON nombre, no se evapora', () => {
    const { canales, nombres } = ventaPorCanal({
      ventas: [{ id: 200, date_sale: '2026-08-11', channel: null, discount: 0, shipping_cost: 0 }],
      detalles: [{ sale_id: 200, quantity: 1, total: 7000 }],
      desde: '2026-08-10', hasta: '2026-08-16',
    })
    expect(canales.tecnica.facturado).toBe(7000)
    expect(nombres.tecnica).toEqual(['Sin canal'])
  })

  it('fusiona las dos bases: los números se suman y los nombres se unen sin repetir', () => {
    const a = { canales: { mayorista: { facturado: 100, unidades: 1, tickets: 1 } }, nombres: { mayorista: ['Mayorista'] } }
    const b = { canales: { mayorista: { facturado: 50, unidades: 2, tickets: 1 } }, nombres: { mayorista: ['Mayorista'], otro: ['Mercadolibre'] } }
    expect(fusionarPorCanal(a, b)).toEqual({
      canales: { mayorista: { facturado: 150, unidades: 3, tickets: 2 } },
      nombres: { mayorista: ['Mayorista'], otro: ['Mercadolibre'] },
    })
  })

  it('el resumen: mayorista + minorista = total, y minorista es local + online + otros', () => {
    const { canales } = ventaPorCanal(args)
    const r = resumirCanales(canales)
    expect(r.mayorista.facturado).toBe(100000)
    expect(r.minorista.facturado).toBe(45000) // 20.000 + 17.000 + 8.000
    expect(r.total.facturado).toBe(r.mayorista.facturado + r.minorista.facturado)
    expect(r.desglose.map((d) => d.canal)).toEqual(['local', 'online', 'otro'])
  })

  it('🔴 técnica queda FUERA del total, pero con su número', () => {
    // Sumarla inflaría la venta con movimientos que nadie cobró (sesión de fotos, fallas, canjes).
    const { canales } = ventaPorCanal(args)
    const r = resumirCanales(canales)
    expect(r.tecnica.facturado).toBe(3000)
    expect(r.total.facturado).toBe(145000)
    expect(r.total.facturado).not.toBe(148000)
  })

  it('un canal sin ventas es cero explícito en el desglose, no un hueco', () => {
    const r = resumirCanales({ mayorista: { facturado: 5, unidades: 1, tickets: 1 } })
    expect(r.minorista).toEqual({ facturado: 0, unidades: 0, tickets: 0 })
    expect(r.desglose).toHaveLength(3)
  })

  it('sin foto de canal, resumir no explota (semanas cerradas antes de que existiera el corte)', () => {
    expect(resumirCanales(undefined).total.facturado).toBe(0)
  })
})

describe('🔴 el canal se guarda POR MARCA, y fusionarlo es una lectura y no la foto', () => {
  // El defecto que esto viene a matar: hasta el 24-ago-2026 el handler sumaba las dos bases y la
  // pantalla dibujaba un solo «Local». La tabla de arriba va por línea (BDI / Zattia / Stunned), así
  // que el lector arrastraba el rótulo: en la semana del 17 al 23, «Local $6.168.837» son $1.591.710
  // de BDI y $4.577.127 de Zattia. El número fusionado es cierto y la lectura es 3,9× de más.
  const bdi = {
    canales: {
      local: { facturado: 1591710, unidades: 170, tickets: 113 },
      online: { facturado: 2678283, unidades: 197, tickets: 99 },
    },
    nombres: { local: ['Mi Local'], online: ['Tienda Nube'] },
  }
  const zattia = {
    canales: {
      local: { facturado: 4577127, unidades: 230, tickets: 159 },
      online: { facturado: 1951984, unidades: 100, tickets: 58 },
    },
    nombres: { local: ['Mi Local'], online: ['Tienda Nube'] },
  }

  it('cada marca conserva SU número: el local de BDI no es el local de la empresa', () => {
    // La forma de fallar es que las dos marcas terminen apuntando al mismo objeto acumulado.
    expect(resumirCanales(bdi.canales).minorista.facturado).toBe(4269993)
    expect(resumirCanales(zattia.canales).minorista.facturado).toBe(6529111)
    expect(bdi.canales.local.facturado).not.toBe(zattia.canales.local.facturado)
  })

  it('🔑 las partes ATAN con el total de la empresa, al peso', () => {
    // El total no se guarda: lo arma la pantalla fusionando las marcas. Si algún día deja de atar,
    // hay dos respuestas para el mismo número y la que se cita es la que le tocó al lector.
    const juntas = fusionarPorCanal(bdi, zattia)
    expect(juntas.canales.local.facturado).toBe(1591710 + 4577127)
    expect(juntas.canales.online.facturado).toBe(2678283 + 1951984)
    expect(resumirCanales(juntas.canales).total.facturado).toBe(
      resumirCanales(bdi.canales).total.facturado + resumirCanales(zattia.canales).total.facturado,
    )
  })

  it('🔴 fusionar NO puede pisar la parte de cada marca', () => {
    // Si `fusionarVenta` acumulara sobre el objeto que recibe, leer el total de la empresa dejaría
    // el número de BDI ya sumado con el de Zattia — y la próxima lectura de la misma foto daría otra
    // cosa. Es el defecto que no falla: nadie vuelve a mirar el mismo número dos veces.
    const antes = bdi.canales.local.facturado
    fusionarPorCanal(bdi, zattia)
    fusionarPorCanal(bdi, zattia)
    expect(bdi.canales.local.facturado).toBe(antes)
  })

  it('una marca sin ventas no rompe la fusión ni desaparece del total', () => {
    const juntas = fusionarPorCanal(bdi, { canales: {}, nombres: {} })
    expect(juntas.canales.local.facturado).toBe(1591710)
  })

  it('🔑 las MARCAS salen de las líneas, no de una lista escrita a mano', () => {
    // Stunned es una línea de Zattia, no una tercera base: si apareciera acá, el memo pediría un
    // corte por canal de una base que no existe y la columna saldría en cero — un cero que afirma.
    expect(MARCAS).toEqual(['bdi', 'zattia'])
    expect(MARCAS).not.toContain('stunned')
    expect(MARCAS.every((m) => LINEAS.includes(m))).toBe(true)
  })
})

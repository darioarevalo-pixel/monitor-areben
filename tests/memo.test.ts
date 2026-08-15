import { describe, it, expect } from 'vitest'
import {
  TEMAS, SISTEMAS, cerrada, claveValida, diaSemana, etiquetaSemana, hoyAr, idSemana,
  lunesDe, semanaAnterior, semanaDe, semanaSiguiente, sumarDias,
} from '@/lib/memo/semana.core.js'
import {
  costoPorCompra, delta, esStunned, fusionarVenta, lineaDe, pautaPorLinea, semaforoPauta,
  ticketPromedio, ventaPorLinea,
} from '@/lib/memo/foto.core.js'

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

  it('🔴 Stunned nunca da semáforo, aunque tenga techo cargado', () => {
    // Su píxel nunca registró una compra: cualquier costo por compra suyo es un invento con cara
    // de medición. Si alguien saca esta excepción, este test se pone rojo.
    expect(semaforoPauta('stunned', { gasto: 300, compras: 5, revenue: 0 }, 1000)).toBe('sin-dato')
    expect(semaforoPauta('bdi', { gasto: 300, compras: 5, revenue: 0 }, 1000)).toBe('verde')
  })

  it('el semáforo se lee contra el techo, y avisa antes de pasarlo', () => {
    const p = (gasto: number) => ({ gasto, compras: 1, revenue: 0 })
    expect(semaforoPauta('bdi', p(1100), 1000)).toBe('rojo')
    expect(semaforoPauta('bdi', p(900), 1000)).toBe('amarillo') // 90% del techo
    expect(semaforoPauta('bdi', p(500), 1000)).toBe('verde')
    // Sin techo cargado no hay semáforo: verde por defecto sería decir "rinde" sin saberlo.
    expect(semaforoPauta('bdi', p(500), 0)).toBe('sin-dato')
    expect(semaforoPauta('bdi', undefined, 1000)).toBe('sin-dato')
  })
})

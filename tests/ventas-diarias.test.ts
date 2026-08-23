import { describe, it, expect } from 'vitest'
import { conSemanaAnterior, serieDiaria, totalDelTramo } from '@/lib/ventas-diarias'
import { facturadoDeVenta } from '@/lib/norte/contribucion.core.js'

/**
 * La serie diaria de ventas (pestaña «Día a día» de Ventas mensuales).
 *
 * 🔑 **Lo que se fija acá son las REGLAS, no los números de producción.** Los números se cotejan
 * contra `psql` al abrir la pantalla. Acá vive lo que tiene que seguir siendo cierto: qué cuenta
 * como plata, qué se excluye y **cuál de los tres ceros es cuál** — el día sin ventas, el día a
 * medio medir y el día que no se preguntó se dibujan idénticos en un gráfico y significan cosas
 * opuestas.
 */

const venta = (o: {
  id: number; fecha: string; canal: string
  descuento?: number; envio?: number; total?: number; channel_id?: number
}) => ({
  id: o.id,
  date_sale: o.fecha,
  channel: o.canal,
  discount: o.descuento ?? 0,
  shipping_cost: o.envio ?? 0,
  total_price: o.total ?? 0,
  ...(o.channel_id != null ? { channel_id: o.channel_id } : {}),
})

const renglon = (sale_id: number, quantity: number, total: number) => ({ sale_id, quantity, total })

const correr = (ventas: unknown[], detalles: unknown[], extra: Partial<{ desde: string; hasta: string; medidoHasta: string | null }> = {}) =>
  serieDiaria({ ventas, detalles, desde: '2026-08-17', hasta: '2026-08-19', medidoHasta: null, ...extra })

describe('la plata del día', () => {
  it('suma los renglones, resta el descuento y suma el envío — la misma cascada que Norte', () => {
    const s = correr(
      [venta({ id: 1, fecha: '2026-08-18', canal: 'Tienda Nube', descuento: 1000, envio: 500 })],
      [renglon(1, 2, 8000), renglon(1, 1, 2000)],
    )
    const dia = s.dias.find((d) => d.fecha === '2026-08-18')!
    expect(dia.total).toEqual({ compras: 1, unidades: 3, plata: 9500 })
  })

  /**
   * 🔴 **La cuenta no se escribe acá.** Si este test hiciera `8000 + 2000 - 1000 + 500` a mano
   * sería una segunda implementación de la cascada, y el día que Dirección cambie la definición de
   * «facturado» los dos números se separarían con el test en verde. Se ejerce contra la función
   * que la pantalla usa de verdad.
   */
  it('el facturado del día es exactamente `facturadoDeVenta`, no una cuenta paralela', () => {
    const v = venta({ id: 7, fecha: '2026-08-17', canal: 'Mi Local', descuento: 2500, envio: 900 })
    const s = correr([v], [renglon(7, 4, 40000)])
    expect(s.dias[0].total.plata).toBe(facturadoDeVenta(v, 40000))
  })

  /**
   * ⚠️ Una devolución entra como renglón negativo y **tiene que restar**. Filtrarla dejaría una
   * serie que sólo sube: el día que se devolvió una prenda se vendió una menos.
   */
  it('los renglones negativos restan: una devolución baja el día', () => {
    const s = correr(
      [venta({ id: 1, fecha: '2026-08-18', canal: 'Mi Local' }), venta({ id: 2, fecha: '2026-08-18', canal: 'Mi Local' })],
      [renglon(1, 3, 30000), renglon(2, -1, -10000)],
    )
    const dia = s.dias.find((d) => d.fecha === '2026-08-18')!
    expect(dia.total).toEqual({ compras: 2, unidades: 2, plata: 20000 })
  })

  it('una venta sin renglones es una compra de 0 unidades y 0 de mercadería, no una venta perdida', () => {
    const s = correr([venta({ id: 1, fecha: '2026-08-18', canal: 'Mi Local', envio: 1500 })], [])
    const dia = s.dias.find((d) => d.fecha === '2026-08-18')!
    expect(dia.total).toEqual({ compras: 1, unidades: 0, plata: 1500 })
  })
})

describe('los tres ceros, que no son el mismo cero', () => {
  it('un día sin ventas está en la serie con 0 — saltearlo movería las barras de a saltos', () => {
    const s = correr([venta({ id: 1, fecha: '2026-08-19', canal: 'Mi Local' })], [renglon(1, 1, 5000)])
    expect(s.dias.map((d) => d.fecha)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19'])
    expect(s.dias[0].total).toEqual({ compras: 0, unidades: 0, plata: 0 })
  })

  /**
   * 🔴 El sync llena el espejo a las 4 de la mañana: el día de la última lectura está a medias, y
   * en un gráfico esa barra corta se lee como una caída. `completo` es lo único que las separa.
   */
  it('el día de la última lectura queda incompleto, y los anteriores completos', () => {
    const s = correr([], [], { medidoHasta: '2026-08-19' })
    expect(s.dias.map((d) => d.completo)).toEqual([true, true, false])
  })

  it('sin saber cuándo se leyó el espejo, `completo` queda en null y no en true', () => {
    const s = correr([], [], { medidoHasta: null })
    expect(s.dias.every((d) => d.completo === null)).toBe(true)
  })

  /**
   * 🔴 La otra punta de lo mismo: `medidoHasta` posterior a todo el rango deja los tres completos.
   * Sin este espejo, `completo: f < medidoHasta` podría estar escrito al revés y el test de arriba
   * pasaría igual.
   */
  it('con el espejo leído después del rango, los tres días están completos', () => {
    const s = correr([], [], { medidoHasta: '2026-08-25' })
    expect(s.dias.map((d) => d.completo)).toEqual([true, true, true])
  })
})

describe('el corte por canal', () => {
  const ventas = [
    venta({ id: 1, fecha: '2026-08-18', canal: 'Tienda Nube' }),
    venta({ id: 2, fecha: '2026-08-18', canal: 'Mi Local' }),
    venta({ id: 3, fecha: '2026-08-18', canal: 'Mayorista' }),
    venta({ id: 4, fecha: '2026-08-18', canal: 'Mercadolibre' }),
  ]
  const detalles = [renglon(1, 1, 1000), renglon(2, 2, 2000), renglon(3, 50, 50000), renglon(4, 1, 900)]

  it('reparte cada venta en su canal y el total cierra con la suma de los canales', () => {
    const s = correr(ventas, detalles)
    const d = s.dias.find((x) => x.fecha === '2026-08-18')!
    expect(d.porCanal.online.plata).toBe(1000)
    expect(d.porCanal.local.plata).toBe(2000)
    expect(d.porCanal.mayorista.plata).toBe(50000)
    expect(d.porCanal.otro.plata).toBe(900)
    expect(d.total.plata).toBe(53900)
  })

  /**
   * 🔴 **Mercadolibre existe y no tiene canal propio.** En BDI son 13 ventas y $195.644 en 37 días
   * (medido el 23-ago-2026). Cae en `otro`, y si la pantalla dibujara sólo online/local/mayorista
   * esa plata **desaparecería sin decirlo** — no se vería un error, se vería menos venta. Por eso
   * `canales` sale de lo que tuvo movimiento y `nombresPorCanal` dice qué hay adentro de «Otros».
   */
  it('nombra qué canales crudos cayeron en «Otros», para que se pueda preguntar cuáles son', () => {
    const s = correr(ventas, detalles)
    expect(s.canales).toEqual(['local', 'online', 'mayorista', 'otro'])
    expect(s.nombresPorCanal.otro).toEqual(['Mercadolibre'])
  })

  it('un canal sin una sola venta en la ventana no se dibuja', () => {
    const s = correr([ventas[0]], [detalles[0]])
    expect(s.canales).toEqual(['online'])
  })
})

describe('las ventas técnicas', () => {
  /**
   * Sesión de fotos, Fallas y los canjes crean una venta en Gestión Nube para descontar stock. Todo
   * el monitor las excluye (`lib/etl/tecnica.core.js`) y acá también — pero **contadas**: un hueco
   * silencioso en la serie es indistinguible de un día flojo.
   */
  it('se excluyen por el texto del canal y se dicen cuántas fueron', () => {
    const s = correr(
      [venta({ id: 1, fecha: '2026-08-18', canal: 'Ninguno' }), venta({ id: 2, fecha: '2026-08-18', canal: 'Mi Local' })],
      [renglon(1, 5, 0), renglon(2, 1, 3000)],
    )
    const d = s.dias.find((x) => x.fecha === '2026-08-18')!
    expect(s.tecnicas).toBe(1)
    expect(d.total).toEqual({ compras: 1, unidades: 1, plata: 3000 })
  })

  it('y también por `channel_id` 12, que es la mitad que cubre a BDI', () => {
    const s = correr([venta({ id: 1, fecha: '2026-08-18', canal: 'Vaya a Saber', channel_id: 12 })], [renglon(1, 5, 9000)])
    expect(s.tecnicas).toBe(1)
    expect(s.dias.every((d) => d.total.compras === 0)).toBe(true)
  })
})

describe('la comparación contra la semana anterior', () => {
  const ventas = [
    venta({ id: 1, fecha: '2026-08-11', canal: 'Mi Local' }), // lunes anterior
    venta({ id: 2, fecha: '2026-08-18', canal: 'Mi Local' }), // lunes
  ]
  const detalles = [renglon(1, 2, 20000), renglon(2, 3, 33000)]
  const serie = () => serieDiaria({ ventas, detalles, desde: '2026-08-11', hasta: '2026-08-19', medidoHasta: null })

  it('cada día visible trae el MISMO día de la semana anterior', () => {
    const filas = conSemanaAnterior(serie(), '2026-08-18')
    expect(filas.map((f) => f.fecha)).toEqual(['2026-08-18', '2026-08-19'])
    expect(filas[0].total.plata).toBe(33000)
    expect(filas[0].previo).toEqual({ compras: 1, unidades: 2, plata: 20000 })
  })

  /**
   * 🔴 **`previo` es `null` cuando el día −7 no entró en la consulta, y no cero.** Un cero diría
   * «la semana pasada no se vendió nada»; lo que pasa es que no se preguntó. Es la razón por la que
   * el handler pide siete días de más hacia atrás.
   */
  it('sin el colchón de 7 días, el día visible no tiene contra qué compararse y lo dice', () => {
    const corta = serieDiaria({ ventas, detalles, desde: '2026-08-18', hasta: '2026-08-18', medidoHasta: null })
    expect(conSemanaAnterior(corta, '2026-08-18')[0].previo).toBeNull()
  })

  /**
   * La otra punta de la regla de arriba: `null` es «no se preguntó», **cero es una respuesta**. El
   * 12 de agosto está adentro de la consulta y no tuvo ventas, así que el 19 se compara contra un
   * cero de verdad. Sin este espejo, `previo` podría devolver `null` siempre y el test de arriba
   * pasaría igual.
   */
  it('un día que existe en la ventana y no tuvo ventas SÍ se compara: su previo es cero de verdad', () => {
    const filas = conSemanaAnterior(serie(), '2026-08-18')
    const jueves = filas.find((f) => f.fecha === '2026-08-19')!
    expect(jueves.previo).toEqual({ compras: 0, unidades: 0, plata: 0 })
  })
})

describe('el total del tramo', () => {
  /**
   * 🔴 **Tres días visibles y UNO solo incompleto, a propósito.** Con dos y dos, contar los
   * completos y contar los incompletos da el mismo número: la cuenta se puede escribir al revés y
   * el test pasa igual. Lo cazó un mutante que salió vivo (`f.completo === false` → `=== true`).
   */
  const armar = () => conSemanaAnterior(
    serieDiaria({
      ventas: [
        venta({ id: 1, fecha: '2026-08-11', canal: 'Mi Local' }),
        venta({ id: 2, fecha: '2026-08-18', canal: 'Mi Local' }),
        venta({ id: 3, fecha: '2026-08-19', canal: 'Mi Local' }),
      ],
      detalles: [renglon(1, 2, 20000), renglon(2, 3, 33000), renglon(3, 1, 11000)],
      desde: '2026-08-11',
      hasta: '2026-08-20',
      medidoHasta: '2026-08-20',
    }),
    '2026-08-18',
  )

  it('suma los días visibles y el mismo tramo de la semana anterior', () => {
    const t = totalDelTramo(armar())
    expect(t.total).toEqual({ compras: 2, unidades: 4, plata: 44000 })
    expect(t.previo).toEqual({ compras: 1, unidades: 2, plata: 20000 })
    expect(t.conPrevio).toBe(3)
  })

  it('cuenta los días a medio medir, que es lo que hace que la comparación se pueda leer', () => {
    const filas = armar()
    expect(filas.map((f) => f.completo)).toEqual([true, true, false])
    expect(totalDelTramo(filas).incompletos).toBe(1)
  })

  it('sin un solo día comparable, `previo` es null y no un cero que diría «no se vendió»', () => {
    const t = totalDelTramo(conSemanaAnterior(
      serieDiaria({ ventas: [], detalles: [], desde: '2026-08-18', hasta: '2026-08-19', medidoHasta: null }),
      '2026-08-18',
    ))
    expect(t.previo).toBeNull()
    expect(t.conPrevio).toBe(0)
  })
})

describe('el cotejo de la plata contra `total_price`', () => {
  /**
   * 🔑 **El oráculo viene por otro camino que el hecho.** `facturado` se arma de tres columnas (los
   * renglones, el descuento y el envío); `total_price` es el total que Gestión Nube ya calculó. El
   * día que el sync deje de traer una de las tres, la diferencia se abre y la pantalla lo dice.
   */
  it('las dos mitades salen de la MISMA población: la técnica no entra en ninguna', () => {
    const s = correr(
      [
        venta({ id: 1, fecha: '2026-08-18', canal: 'Mi Local', descuento: 500, total: 9500 }),
        venta({ id: 2, fecha: '2026-08-18', canal: 'Ninguno', total: 4000 }),
      ],
      [renglon(1, 1, 10000), renglon(2, 1, 4000)],
    )
    expect(s.control).toEqual({ facturado: 9500, totalPrice: 9500, ventas: 1 })
  })

  it('y una venta de fuera del rango no entra en ninguna de las dos', () => {
    const s = correr(
      [venta({ id: 9, fecha: '2026-08-01', canal: 'Mi Local', total: 99999 })],
      [renglon(9, 1, 99999)],
    )
    expect(s.control).toEqual({ facturado: 0, totalPrice: 0, ventas: 0 })
  })
})

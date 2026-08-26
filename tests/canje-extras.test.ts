/**
 * El EXTRA: lo que se le suma a un canje POR ENCIMA de lo acordado.
 *
 * Un regalo —o algo que ella pidió de afuera de la vitrina— no es pasarse del trato: es una
 * decisión aparte, tomada después. Antes de esto el tope, que es el único control DURO del módulo,
 * la trataba como un error y contestaba 409.
 *
 * 🔴 **Lo que hay que amarrar es que la excepción sea de UNA sola cuenta.** El extra sale del tope;
 * ⛔ NO sale del balance ni de quién firma. Si alguien "simplifica" filtrándolo en `itemsVivos`, el
 * canje esconde lo que regaló y ninguna pantalla se rompe: se ve en la plata, meses después. Los
 * dos lados están acá, uno al lado del otro, justamente para que ese cambio no pase.
 *
 * Y hay un tercer lado que es el que se olvida: **el portal**. El saldo que ve ella lo calcula
 * `api/_canje-portal.js` a mano —campo por campo, como todo lo que sale por ahí— así que la regla
 * está escrita DOS veces y este archivo es lo único que las mantiene juntas.
 */
import { describe, it, expect } from 'vitest'
import { controlDelTope, costoEstimado, itemsVivos, type CanjeItem, type CanjeRow } from '@/lib/canjes/tipos'
import { seVaDelTope } from '@/lib/canjes/reglas.core.js'
import { paraLaPersona } from '@/api/_canje-portal.js'

/** Lo mínimo de un item para estas cuentas. El resto no lo mira ninguna de las dos. */
function item(p: Partial<CanjeItem>): CanjeItem {
  return {
    id: 1, canje_id: 1, cantidad: 1, origen: 'equipo', estado: 'confirmado',
    created_at: '2026-08-26T00:00:00Z', ...p,
  } as CanjeItem
}

const POR_MONTO = { tope_tipo: 'monto', tope_pvp: 80000 } as Pick<CanjeRow, 'tope_tipo' | 'tope_pvp' | 'tope_unidades'>
const POR_UNIDADES = {
  tope_tipo: 'unidades',
  tope_unidades: [{ cantidad: 2, descripcion: 'fundas' }],
} as Pick<CanjeRow, 'tope_tipo' | 'tope_pvp' | 'tope_unidades'>

describe('el extra sale del TOPE', () => {
  it('modo monto: lo acordado entra en la cuenta y el extra no', () => {
    const items = [
      item({ id: 1, pvp_unit: 74000 }),
      item({ id: 2, pvp_unit: 12000, extra: true }),
    ]
    const r = controlDelTope(POR_MONTO, items)
    // Sin el filtro serían 86.000 contra 80.000 y esto sería `false`: el regalo frenaría el canje.
    expect(r.ok).toBe(true)
    expect(r.usado).toBe(74000)
    expect(r.extras).toBe(12000)
  })

  it('modo unidades: un regalo NO le come una de las unidades acordadas', () => {
    // Es donde más pesa: con 2 fundas acordadas, mandarle una de regalo le dejaba UNA para elegir.
    const items = [
      item({ id: 1, cantidad: 2 }),
      item({ id: 2, cantidad: 1, extra: true }),
    ]
    const r = controlDelTope(POR_UNIDADES, items)
    expect(r.ok).toBe(true)
    expect(r.usado).toBe(2)
    expect(r.extras).toBe(1)
  })

  it('el mensaje NOMBRA el extra: uno invisible es un agujero en la plata del canje', () => {
    const r = controlDelTope(POR_MONTO, [item({ id: 1, pvp_unit: 74000 }), item({ id: 2, pvp_unit: 12000, extra: true })])
    expect(r.mensaje).toContain('74.000')
    expect(r.mensaje).toContain('12.000')
    expect(r.mensaje).toMatch(/fuera del tope/)
  })

  it('sin extras, la cuenta y el mensaje son exactamente los de antes', () => {
    // El mutante que agrega la cola siempre: un canje normal no puede empezar a hablar de extras.
    const r = controlDelTope(POR_MONTO, [item({ id: 1, pvp_unit: 74000 })])
    expect(r.extras).toBe(0)
    expect(r.mensaje).toBe('$74.000 de $80.000')
  })

  it('lo QUITADO sigue sin contar, sea extra o no', () => {
    const r = controlDelTope(POR_MONTO, [
      item({ id: 1, pvp_unit: 74000 }),
      item({ id: 2, pvp_unit: 99000, estado: 'quitado' }),
      item({ id: 3, pvp_unit: 50000, estado: 'quitado', extra: true }),
    ])
    expect(r.usado).toBe(74000)
    expect(r.extras).toBe(0)
  })

  it('`seVaDelTope` no frena por un extra, y sigue frenando por lo acordado', () => {
    expect(seVaDelTope(POR_MONTO, [item({ id: 1, pvp_unit: 74000 }), item({ id: 2, pvp_unit: 12000, extra: true })])).toBe(null)
    expect(seVaDelTope(POR_MONTO, [item({ id: 1, pvp_unit: 74000 }), item({ id: 2, pvp_unit: 12000 })])).toMatch(/Se pasa del tope/)
  })
})

describe('⛔ pero NO sale del balance', () => {
  it('`itemsVivos` lo sigue devolviendo', () => {
    // Es la función de la que cuelga TODO el resto: balance, firma, la tabla de la ficha. Filtrar el
    // extra acá sería el atajo que rompe las tres a la vez.
    expect(itemsVivos([item({ id: 1 }), item({ id: 2, extra: true })])).toHaveLength(2)
  })

  it('el costo del canje cuenta el regalo: cuesta plata igual', () => {
    const canje = { ...POR_MONTO, tope_tipo: 'monto' } as CanjeRow
    const cfg = { factor_costo_estimado: 0.4 }
    const conRegalo = costoEstimado(canje, [item({ id: 1, costo_unit: 20000 }), item({ id: 2, costo_unit: 5000, extra: true })], cfg as never)
    const sinRegalo = costoEstimado(canje, [item({ id: 1, costo_unit: 20000 })], cfg as never)
    expect(conRegalo).toBe(25000)
    expect(sinRegalo).toBe(20000)
  })
})

describe('el portal: el saldo que ve ELLA', () => {
  const VITRINA = { id: 3, nombre: 'Girlhood', items: [] }
  const CANJE = { id: 42, store: 'bdi', estado: 'acuerdo', tope_tipo: 'monto', tope_pvp: 80000 }

  it('un regalo que le sumó el equipo NO le achica el tope que acordó', () => {
    // 🔴 El caso que se rompe solo: `laVitrina` calcula el saldo a mano, con su propia cuenta. Si
    // esa cuenta suma el extra, ella ve $68.000 disponibles donde el servidor le va a aceptar
    // $80.000 — un saldo que miente para abajo por una decisión nuestra.
    const salida = paraLaPersona(CANJE, null, null, VITRINA, [
      { nombre: 'Jean', cantidad: 1, pvp_unit: 30000, origen: 'persona', estado: 'confirmado' },
      { nombre: 'Funda de regalo', cantidad: 1, pvp_unit: 12000, origen: 'equipo', estado: 'confirmado', extra: true },
    ], [])
    expect(salida.vitrina?.usado).toBe(30000)
    expect(salida.vitrina?.tope).toBe(80000)
  })

  it('lo que el equipo le cargó SIN marcar extra sí le gasta el tope', () => {
    // La otra mitad, y es la regla vieja: si el equipo ya le cargó algo del acuerdo, esa plata está
    // gastada de verdad y decirle que le quedan $80.000 sería mandarla contra el 409.
    const salida = paraLaPersona(CANJE, null, null, VITRINA, [
      { nombre: 'Jean', cantidad: 1, pvp_unit: 30000, origen: 'persona', estado: 'confirmado' },
      { nombre: 'Remera', cantidad: 1, pvp_unit: 12000, origen: 'equipo', estado: 'confirmado' },
    ], [])
    expect(salida.vitrina?.usado).toBe(42000)
  })

  it('el regalo tampoco aparece en «lo que elegiste»: no es de ella', () => {
    const salida = paraLaPersona(CANJE, null, null, VITRINA, [
      { nombre: 'Jean', cantidad: 1, pvp_unit: 30000, origen: 'persona', estado: 'confirmado' },
      { nombre: 'Funda de regalo', cantidad: 1, pvp_unit: 12000, origen: 'equipo', estado: 'confirmado', extra: true },
    ], [])
    expect(salida.elegidos).toHaveLength(1)
    expect(JSON.stringify(salida)).not.toContain('Funda de regalo')
  })
})

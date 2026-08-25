/**
 * La bandeja de retornos — lo que estamos esperando que vuelva.
 *
 * Lo que se prueba acá no es una lista filtrada: es **la diferencia entre esperar y tener**. Si un
 * andén se lleva una fila del otro, alguien de Depósito da por recibido algo que todavía está en
 * la calle, o busca en la caja algo que ya guardó. Nada de eso rompe una pantalla: se ve en el
 * stock, semanas después.
 *
 * El caso que más importa está en "el reloj": hasta el 25-ago-2026 los días se contaban desde
 * `updated_at`, así que **ir a ver por qué un paquete no llega reiniciaba el contador de que no
 * llega**.
 */
import { describe, expect, it } from 'vitest'
import {
  bandejaDeRetornos, desdeQueEsta, detalleDeLoQueVuelve, diasDesde, estaEsperando, faltaGuardarlo,
  queHacerConEl, textoDeReclamoAlCorreo, trabaDeLaVuelta, trabaDeLoQueLlego,
  type RetornoRow,
} from '@/lib/reclamos/retornos'
import { alertasDe, type ReclamoRow } from '@/lib/reclamos/tipos'

const AHORA = new Date('2026-08-25T12:00:00Z').getTime()
const hace = (dias: number) => new Date(AHORA - dias * 86400000).toISOString()

const base: RetornoRow = {
  id: 42,
  orden_tn: '1234',
  cliente: 'Ana',
  motivo: 'falla',
  escenario: 'inutil',
  estado: 'en_transito',
  items: [{ producto: 'Buzo Girlhood', variante: 'M', cantidad: 1 }],
  destino_prenda: 'stock',
  compensacion: 'plata_total',
  via_retorno: 'andreani',
  seguimiento_vuelta: 'AR123',
  reingreso_estado: 'no_aplica',
  falla_ids: [],
  historial: [{ estado: 'en_transito', at: hace(4) }],
  created_at: hace(10),
  updated_at: hace(1),
}
const con = (extra: Partial<RetornoRow>): RetornoRow => ({ ...base, ...extra })

describe('los dos andenes', () => {
  it('esperamos SOLO lo que está en tránsito: es el único estado que significa "todavía no está acá"', () => {
    expect(estaEsperando(base)).toBe(true)
    for (const estado of ['borrador', 'esperando_cliente', 'en_revision', 'resuelto', 'recibido', 'cerrado', 'anulado'] as const) {
      expect(estaEsperando(con({ estado })), estado).toBe(false)
    }
  })

  it('⛔ un cambio recién facturado NO está en la mano: nace con el reingreso pendiente y en tránsito', () => {
    // `procesar` (la venta del cambio en GN) deja `estado: en_transito` + `reingreso_estado:
    // pendiente` a la vez. Si el segundo andén mirara sólo el pendiente, el cambio aparecería
    // como "llegó, guardalo" el mismo día en que el cliente todavía no despachó nada.
    const cambio = con({ estado: 'en_transito', reingreso_estado: 'pendiente', compensacion: 'otro_producto' })
    expect(faltaGuardarlo(cambio)).toBe(false)
    expect(estaEsperando(cambio)).toBe(true)
  })

  it('lo que llegó y falta guardar: el reingreso a mano en GN, o el alta en Fallas', () => {
    expect(faltaGuardarlo(con({ estado: 'recibido', reingreso_estado: 'pendiente' }))).toBe(true)
    expect(faltaGuardarlo(con({ estado: 'recibido', reingreso_estado: 'hecho' }))).toBe(false)
    // Destino Fallas: la unidad no vuelve a stock, y lo que falta es darla de alta allá.
    expect(faltaGuardarlo(con({ estado: 'recibido', destino_prenda: 'falla' }))).toBe(true)
    expect(faltaGuardarlo(con({ estado: 'recibido', destino_prenda: 'falla', falla_ids: [7] }))).toBe(false)
  })

  it('lo ya guardado no vuelve a la bandeja aunque el reclamo siga abierto', () => {
    const { esperando, guardar } = bandejaDeRetornos([
      con({ id: 1, estado: 'recibido', reingreso_estado: 'hecho' }),
      con({ id: 2, estado: 'cerrado', reingreso_estado: 'pendiente' }),
    ], AHORA)
    expect(esperando).toEqual([])
    expect(guardar).toEqual([])
  })
})

describe('el reloj: desde cuándo esperamos', () => {
  it('🔴 cuenta desde que salió, NO desde el último toque: mirar por qué no llega no reinicia la espera', () => {
    const viejo = con({ historial: [{ estado: 'en_transito', at: hace(20) }], updated_at: hace(0) })
    expect(diasDesde(desdeQueEsta(viejo, 'en_transito'), AHORA)).toBe(20)
  })

  it('y la alerta de "hace N días que no llega" cuenta lo mismo, no otro número', () => {
    const fila = { ...viejoEnTransito(), estado: 'en_transito' } as ReclamoRow
    const alerta = alertasDe(fila, AHORA).find((a) => a.texto.includes('no llega'))
    expect(alerta?.texto).toBe('Hace 20 días que no llega')
  })

  it('sin historial cae al último toque: peor dato, pero nunca cero', () => {
    expect(desdeQueEsta(con({ historial: [], updated_at: hace(3) }), 'en_transito')).toBe(hace(3))
  })

  it('se queda con el ÚLTIMO tránsito: un producto que volvió a salir se espera desde la segunda vez', () => {
    const dosVueltas = con({ historial: [
      { estado: 'en_transito', at: hace(30) },
      { estado: 'recibido', at: hace(25) },
      { estado: 'en_transito', at: hace(2) },
    ] })
    expect(diasDesde(desdeQueEsta(dosVueltas, 'en_transito'), AHORA)).toBe(2)
  })

  it('un reloj corrido no muestra días negativos', () => {
    expect(diasDesde(new Date(AHORA + 86400000).toISOString(), AHORA)).toBe(0)
  })
})

function viejoEnTransito(): Partial<ReclamoRow> {
  return {
    id: 42, store: 'bdi', motivo: 'falla', estado: 'en_transito',
    items: [], stock_estado: 'no_aplica', reintegro_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
    historial: [{ estado: 'en_transito', at: hace(20) }],
    updated_at: hace(0), created_at: hace(30),
  }
}

describe('el orden y lo que traba', () => {
  it('primero lo más viejo — al revés que la lista de reclamos, que muestra lo último abierto', () => {
    const { esperando } = bandejaDeRetornos([
      con({ id: 1, historial: [{ estado: 'en_transito', at: hace(2) }] }),
      con({ id: 2, historial: [{ estado: 'en_transito', at: hace(19) }] }),
      con({ id: 3, historial: [{ estado: 'en_transito', at: hace(9) }] }),
    ], AHORA)
    expect(esperando.map((f) => f.reclamo.id)).toEqual([2, 3, 1])
    expect(esperando.map((f) => f.dias)).toEqual([19, 9, 2])
  })

  it('a los 15 días deja de ser una espera normal', () => {
    const { esperando } = bandejaDeRetornos([
      con({ id: 1, historial: [{ estado: 'en_transito', at: hace(14) }] }),
      con({ id: 2, historial: [{ estado: 'en_transito', at: hace(15) }] }),
    ], AHORA)
    expect(esperando.find((f) => f.reclamo.id === 1)?.tarde).toBe(false)
    expect(esperando.find((f) => f.reclamo.id === 2)?.tarde).toBe(true)
  })

  it('🔑 un paquete "en camino" sin etiqueta no está en camino: está parado, y el que traba es nuestro', () => {
    expect(trabaDeLaVuelta(con({ seguimiento_vuelta: null }))).toContain('etiqueta')
    // Si lo trae al mostrador no hay etiqueta que mandar: pedirla sería inventar un pendiente.
    expect(trabaDeLaVuelta(con({ via_retorno: 'presencial', seguimiento_vuelta: null }))).toBe(null)
    expect(trabaDeLaVuelta(con({ via_retorno: 'cadete', seguimiento_vuelta: null }))).toBe(null)
    expect(trabaDeLaVuelta(con({ via_retorno: null }))).toContain('cómo vuelve')
    expect(trabaDeLaVuelta(con({ destino_prenda: null }))).toContain('qué se hace')
    expect(trabaDeLaVuelta(base)).toBe(null)
  })

  it('del lado de acá, lo que traba es el paso a mano que Gestión Nube no expone', () => {
    expect(trabaDeLoQueLlego(con({ reingreso_estado: 'pendiente' }))).toContain('Gestión Nube')
    expect(trabaDeLoQueLlego(con({ destino_prenda: 'falla', falla_ids: [] }))).toContain('Fallas')
    expect(trabaDeLoQueLlego(con({ reingreso_estado: 'hecho' }))).toBe(null)
  })

  it('qué hacer con la unidad sale del destino ya decidido, no del motivo', () => {
    expect(queHacerConEl('stock')).toBe('stock')
    expect(queHacerConEl('falla')).toBe('falla')
    expect(queHacerConEl(null)).toBe('nada')
    expect(queHacerConEl('no_salio')).toBe('nada')
  })
})

describe('lo que se lee y se copia', () => {
  it('el detalle dice qué buscar en la caja, con la cantidad cuando es más de una', () => {
    expect(detalleDeLoQueVuelve(base)).toBe('Buzo Girlhood · M')
    expect(detalleDeLoQueVuelve(con({ items: [{ producto: 'Funda', cantidad: 2 }] }))).toBe('2× Funda')
    expect(detalleDeLoQueVuelve(con({ items: [] }))).toBe('—')
  })

  it('el renglón para el correo lleva el número, el seguimiento y hace cuánto que no aparece', () => {
    const f = bandejaDeRetornos([con({ historial: [{ estado: 'en_transito', at: hace(21) }] })], AHORA).esperando[0]
    const t = textoDeReclamoAlCorreo(f)
    expect(t).toContain('R-0042')
    expect(t).toContain('AR123')
    expect(t).toContain('21 días')
    expect(t).toContain('Buzo Girlhood')
  })
})

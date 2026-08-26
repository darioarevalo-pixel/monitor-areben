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
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  bandejaDeRetornos, desdeQueEsta, desdeQueSeDecidio, detalleDeLoQueSale, detalleDeLoQueVuelve,
  diasDesde, estaEsperando, faltaDespachar, faltaGuardarlo, queHacerConEl, textoDeReclamoAlCorreo,
  trabaDeLaVuelta, trabaDeLoQueLlego,
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

describe('los tres andenes', () => {
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

  /**
   * 🔑 **`no_vuelve` ⛔ no es `nada`.** `nada` significa que nadie decidió todavía, y es lo que traba
   * la vuelta; `no_vuelve` es una decisión tomada. Mientras `regalada` no existió como destino, ese
   * caso caía en `nada` y la bandeja pedía **decidir algo que ya estaba decidido**.
   */
  it('la regalada y la perdida son una decisión, no un hueco', () => {
    expect(queHacerConEl('regalada')).toBe('no_vuelve')
    expect(queHacerConEl('perdida')).toBe('no_vuelve')
    expect(trabaDeLaVuelta(con({ destino_prenda: 'regalada' }))).not.toContain('Falta decidir qué se hace')
    // Y el que SÍ es un hueco sigue trabando.
    expect(trabaDeLaVuelta(con({ destino_prenda: null }))).toContain('Falta decidir qué se hace')
  })
})

describe('lo que se lee y se copia', () => {
  it('el detalle dice qué buscar en la caja, con la cantidad cuando es más de una', () => {
    expect(detalleDeLoQueVuelve(base)).toBe('Buzo Girlhood · M')
    expect(detalleDeLoQueVuelve(con({ items: [{ producto: 'Funda', cantidad: 2 }] }))).toBe('2× Funda')
    expect(detalleDeLoQueVuelve(con({ items: [] }))).toBe('—')
  })

  /**
   * 🔴 **El defecto que tenía la bandeja: en un pedido mal armado listaba lo que el cliente
   * COMPRÓ.** Lo que vuelve es lo que se le mandó por error (`items_correctos`); lo que compró es
   * justo el único producto que nunca salió del depósito. Depósito abría la caja esperando otra
   * cosa, y con el contenido equivocado a la vista "llegó lo que esperábamos" no lo contesta nadie.
   */
  it('en un pedido mal armado, lo que vuelve es lo que se mandó POR ERROR', () => {
    const malArmado = con({
      motivo: 'mal_armado',
      items: [{ producto: 'LO QUE COMPRÓ', cantidad: 1 }],
      items_correctos: [{ producto: 'LO QUE LE LLEGÓ', cantidad: 1 }],
    })
    expect(detalleDeLoQueVuelve(malArmado)).toBe('LO QUE LE LLEGÓ')
    expect(detalleDeLoQueVuelve(malArmado)).not.toContain('COMPRÓ')
  })

  it('sin saber qué le llegó por error, la vuelta está trabada y lo dice', () => {
    // ⛔ No es una alerta por tiempo: es que falta un dato para poder recibir, y sin él el reclamo
    // pasaría a "recibido" sin que nadie haya abierto una caja.
    const sinCargar = con({ motivo: 'mal_armado', items_correctos: [] })
    expect(trabaDeLaVuelta(sinCargar)).toContain('qué le llegó por error')
  })

  it('lo que ya se tildó se marca, para leer contra la caja qué falta', () => {
    const dos = con({
      items: [
        { producto: 'Buzo', cantidad: 1, recibida_at: hace(1) },
        { producto: 'Gorra', cantidad: 1 },
      ],
    })
    expect(detalleDeLoQueVuelve(dos)).toBe('Buzo ✓ · Gorra')
    expect(bandejaDeRetornos([dos], AHORA).esperando[0].faltan.map((u) => u.item.producto)).toEqual(['Gorra'])
  })

  it('la unidad que se queda el cliente ⛔ no se espera en la caja', () => {
    const mixto = con({
      items: [
        { producto: 'Buzo', cantidad: 1 },
        { producto: 'Gorra', cantidad: 1, destino: 'perdida' },
      ],
    })
    expect(detalleDeLoQueVuelve(mixto)).toBe('Buzo')
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


/**
 * **El paquete que SALE.** Es la otra mitad de la misma operación y no se veía en ninguna pantalla
 * que Depósito pudiera abrir: el pendiente se tildaba sólo desde Reclamos, que es de
 * Administración. O sea que quien pone el paquete en la calle no tenía dónde decir que salió.
 */
describe('el tercer andén: lo que hay que mandarle al cliente', () => {
  const cambio = con({
    estado: 'en_transito', compensacion: 'otro_producto', envio_nuevo_estado: 'pendiente',
    items_nuevos: [{ producto: 'Campera Stunned', variante: 'L', cantidad: 1 }],
    solicitud_envio: 'EM998877',
    historial: [{ estado: 'borrador', at: hace(9) }, { estado: 'en_transito', at: hace(6) }],
  })

  it('falta despachar lo que tiene el pendiente abierto, ⛔ mire lo que mire el estado', () => {
    expect(faltaDespachar(cambio)).toBe(true)
    // Un reenvío sin retorno queda en `resuelto`, no en tránsito: si el andén mirara el estado,
    // el caso más común de "hay que mandarle algo" no aparecería nunca.
    expect(faltaDespachar(con({ estado: 'resuelto', compensacion: 'reenvio', envio_nuevo_estado: 'pendiente' }))).toBe(true)
    expect(faltaDespachar(con({ envio_nuevo_estado: 'hecho' }))).toBe(false)
    expect(faltaDespachar(base)).toBe(false)
  })

  it('🔑 en un CAMBIO sale otro producto, y en una reposición sale el que compró', () => {
    expect(detalleDeLoQueSale(cambio)).toBe('Campera Stunned · L')
    expect(detalleDeLoQueSale(con({ compensacion: 'otra_unidad' }))).toBe('Buzo Girlhood · M')
    expect(detalleDeLoQueSale(con({ compensacion: 'reenvio' }))).toBe('Buzo Girlhood · M')
  })

  it('y en un mal armado sale lo que COMPRÓ, que es justo lo único que nunca salió del depósito', () => {
    const malArmado = con({
      motivo: 'mal_armado', compensacion: 'reenvio',
      items_correctos: [{ producto: 'Gorra', cantidad: 1 }],
    })
    expect(detalleDeLoQueSale(malArmado)).toBe('Buzo Girlhood · M')
    // Lo que vuelve es el otro: son dos listas y dos roles, no dos ítems de la misma.
    expect(detalleDeLoQueVuelve(malArmado)).toBe('Gorra')
  })

  it('⛔ una devolución de plata no manda nada: no inventa un paquete que no existe', () => {
    expect(detalleDeLoQueSale(base)).toBe(null)
    expect(detalleDeLoQueSale(con({ compensacion: 'cupon' }))).toBe(null)
    expect(detalleDeLoQueSale(con({ compensacion: 'plata_parcial' }))).toBe(null)
  })

  it('🔴 el reloj cuenta desde la DECISIÓN: ocuparse de otra cosa del caso no apaga la alarma', () => {
    // Tres eventos `resuelto` más —la plata, el cupón, la anulación— son lo normal en un caso
    // vivo. Contando desde el último, el que nunca despachó queda prolijo.
    const conRuido = con({
      ...cambio,
      estado: 'resuelto', compensacion: 'reenvio', envio_nuevo_estado: 'pendiente',
      historial: [
        { estado: 'resuelto', at: hace(8) },
        { estado: 'resuelto', at: hace(2) },
        { estado: 'resuelto', at: hace(1) },
      ],
    })
    expect(desdeQueSeDecidio(conRuido)).toBe(hace(8))
    expect(bandejaDeRetornos([conRuido], AHORA).despachar[0].dias).toBe(8)
  })

  it('el cambio se cuenta desde que existió la venta, no desde el borrador', () => {
    expect(desdeQueSeDecidio(cambio)).toBe(hace(6))
  })

  it('un cambio está en DOS andenes a la vez, y no es un error: son dos trabajos distintos', () => {
    const b = bandejaDeRetornos([con({ ...cambio, reingreso_estado: 'no_aplica' })], AHORA)
    expect(b.esperando).toHaveLength(1)
    expect(b.despachar).toHaveLength(1)
    // Y en el andén de esperar también se lee que hay algo saliendo: quien abre la caja se entera.
    expect(b.esperando[0].sale).toBe('Campera Stunned · L')
    expect(b.esperando[0].faltaDespacharlo).toBe(true)
  })

  it('despachar tiene su propio plazo: 2 días, ⛔ no los 15 de un tránsito del correo', () => {
    const b = bandejaDeRetornos([con({ ...cambio, historial: [{ estado: 'en_transito', at: hace(3) }] })], AHORA)
    expect(b.despachar[0].tarde).toBe(true)
    const reciente = bandejaDeRetornos([con({ ...cambio, historial: [{ estado: 'en_transito', at: hace(1) }] })], AHORA)
    expect(reciente.despachar[0].tarde).toBe(false)
    // El mismo día de espera de una vuelta del correo todavía no es tarde.
    expect(reciente.esperando[0].tarde).toBe(false)
  })
})

/**
 * **La puerta angosta y el tipo tienen que decir lo mismo.**
 *
 * `RetornoRow` es un `Pick` de TypeScript y `COLS_RETORNO` es un string que se le manda a
 * PostgREST: no hay nada que los ate. Si el tipo pide una columna que el `select` no trae, el
 * campo llega `undefined` y la pantalla dibuja un guión — ⛔ no falla, no avisa, y lo que se pierde
 * es justo el dato por el que alguien iba a mirar. Ya pasó con `items_correctos`: Depósito abría
 * la caja esperando el producto equivocado.
 */
describe('el tipo de la bandeja contra el SELECT del servidor', () => {
  const fuente = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

  it('toda columna que el tipo pide, el select la trae', () => {
    const tipo = fuente('../lib/reclamos/retornos.ts').split('export type RetornoRow')[1].split('>')[0]
    const pedidas = [...tipo.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    const select = fuente('../api/_reclamos.js').split('const COLS_RETORNO = `')[1].split('`')[0]
    const traidas = new Set(select.split(',').map((c) => c.trim()))
    expect(pedidas.length).toBeGreaterThan(15) // que la extracción no se haya quedado vacía
    expect(pedidas.filter((c) => !traidas.has(c))).toEqual([])
  })
})

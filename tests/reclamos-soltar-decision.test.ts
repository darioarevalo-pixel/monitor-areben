import { describe, expect, it } from 'vitest'
import { camposAlSoltarLaDecision } from '@/lib/reclamos/casos.core.js'
import { mensajesDeLaFila } from '@/lib/reclamos/botones'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * 🔴 **B3 (Bruno, 30-ago-2026): qué borra «Volver a decidir».**
 *
 * Hasta hoy soltaba `compensacion` y los pendientes, y dejaba en la fila **los montos, el costo del
 * caso, el destino y la vía** de la decisión que se acababa de retractar. La línea que se eligió es
 * **qué se DECIDIÓ contra qué se MIDIÓ**: la decisión se va entera, los datos del caso se quedan
 * —hacer tipear de nuevo el flete y el PVP de feria es la fricción que este módulo ya tuvo—.
 */

/** Una decisión tomada: plata resuelta, producto con destino y una oferta contestada. */
const DECIDIDO = {
  id: 7, store: 'bdi', motivo: 'falla', escenario: 'llego_fallado',
  compensacion: 'plata_total', estado: 'resuelto',
  monto_total: 13491, monto_producto: 12000, monto_acordado: 13491, monto_envio_devuelto: 1491,
  costo_caso: 20682, retorno_sugerido: true, retorno_decidido: true, devolver_envio: true,
  destino_prenda: 'falla', via_retorno: 'andreani', cupon_codigo: 'BDI-XYZ',
  envio_costo: 6000, envio_ida_costo: 0,
  items: [{ producto: 'FUNDA', cantidad: 2, precio: 12000, pvp_feria: 3500, destino: 'stock' }],
  items_correctos: [{ producto: 'OTRA', cantidad: 1, precio: 9000, destino: 'stock' }],
  retencion_monto: 5000, retencion_forma: 'plata', retencion_respuesta: 'rechazo',
} as unknown as ReclamoRow

describe('camposAlSoltarLaDecision: se va la decisión, se quedan los datos del caso', () => {
  const campos = camposAlSoltarLaDecision(DECIDIDO) as Record<string, unknown>

  it('borra la plata entera, ⛔ no sólo el total', () => {
    for (const c of ['monto_total', 'monto_producto', 'monto_acordado', 'monto_envio_devuelto', 'costo_caso']) {
      expect(campos[c], c).toBe(null)
    }
  })

  /**
   * 🔴 Una columna que dice «lo que costó el caso» sobre un reclamo **sin decisión** afirma. Hoy
   * nadie la lee con la decisión soltada —los caminos vivos están gateados por `compensacion`— pero
   * eso es lo que hace que borrarla ⛔ no rompa nada, ⛔ no un argumento para dejarla puesta.
   */
  it('la decisión de producto se va: destino, vía y los dos booleanos del retorno', () => {
    expect(campos.destino_prenda).toBe(null)
    expect(campos.via_retorno).toBe(null)
    expect(campos.cupon_codigo).toBe(null)
    // ⚠️ `null` ⛔ no es «no vuelve»: es **sin contestar**, que es lo que corresponde.
    expect(campos.retorno_decidido).toBe(null)
    expect(campos.retorno_sugerido).toBe(null)
  })

  /**
   * 🔴 🔑 **Media decisión borrada es peor que ninguna.** `destinoDeUnidad` es
   * `item.destino || fila.destino_prenda`, así que borrar sólo la columna dejaría a las unidades
   * que tienen el suyo contestando con el destino de una decisión que ya nadie sostiene.
   */
  it('borra también el destino POR UNIDAD del jsonb, en las dos listas', () => {
    const items = campos.items as Array<Record<string, unknown>>
    const correctos = campos.items_correctos as Array<Record<string, unknown>>
    expect(items[0]).not.toHaveProperty('destino')
    expect(correctos[0]).not.toHaveProperty('destino')
    // ⚠️ Y ⛔ no se lleva puesto el resto de la unidad: el PVP de feria es un dato del caso.
    expect(items[0].pvp_feria).toBe(3500)
    expect(items[0].cantidad).toBe(2)
  })

  /**
   * 🔑 **La oferta se queda, y ⛔ no es una excepción: es B1.** *«Armar una oferta exige la decisión,
   * contestarla siempre se puede»* — el rato entre soltar la decisión y que el cliente conteste es
   * justo el que `retencion_respuesta` vino a dejar de perder.
   */
  it('⛔ NO toca la oferta de retención', () => {
    for (const c of ['retencion_monto', 'retencion_forma', 'retencion_respuesta', 'retencion_at']) {
      expect(campos, c).not.toHaveProperty(c)
    }
  })

  /**
   * 📊 Lo que hizo barata la respuesta: `DecidirReclamo` prefila **estos** de la fila, y ⛔ ninguno
   * de los que se borran arriba. Si alguno cayera acá, reabrir «Decidir» pediría tipearlo de nuevo.
   */
  it('⛔ NO toca los datos del caso que la pantalla vuelve a mostrar', () => {
    for (const c of ['envio_costo', 'envio_ida_costo', 'escenario', 'expectativa', 'motivo']) {
      expect(campos, c).not.toHaveProperty(c)
    }
  })

  // ⚠️ `devolver_envio` es `not null default false` en la tabla: un `null` acá es un 500.
  it('devolver_envio va a false y ⛔ no a null', () => {
    expect(campos.devolver_envio).toBe(false)
  })

  it('deja el reclamo para revisar y apaga los pendientes', () => {
    expect(campos.compensacion).toBe(null)
    expect(campos.estado).toBe('en_revision')
    expect(campos.reintegro_estado).toBe('no_aplica')
  })

  // Sin destino por unidad, la lista se devuelve tal cual: ⛔ no hay que inventar una copia.
  it('una fila sin destinos por unidad pasa sin romperse', () => {
    const c = camposAlSoltarLaDecision({ ...DECIDIDO, items: [{ producto: 'X', cantidad: 1 }], items_correctos: null } as unknown as ReclamoRow) as Record<string, unknown>
    expect((c.items as Array<unknown>)[0]).toEqual({ producto: 'X', cantidad: 1 })
    expect(c.items_correctos).toBe(null)
  })
})

/**
 * 🔴 🔑 **La invariante de la que cuelga todo lo de arriba**, y por la que borrar los montos ⛔ no
 * rompe nada: **con la decisión soltada, lo que se le dice al cliente ⛔ no la menciona.** El
 * mensaje de resolución —el único que cita `monto_total`, `via_retorno` y el cupón— se gatea por
 * `compensacion`. Si alguien algún día lo gatea por «hay campos cargados», este caso se pone rojo.
 */
describe('una decisión soltada ⛔ no le habla al cliente de plata', () => {
  it('el mensaje de resolución desaparece al soltar la decisión', () => {
    const decidido = mensajesDeLaFila(DECIDIDO)
    expect(decidido).toContain('resolucion')
    const soltado = { ...DECIDIDO, ...camposAlSoltarLaDecision(DECIDIDO) } as unknown as ReclamoRow
    expect(mensajesDeLaFila(soltado)).not.toContain('resolucion')
  })
})

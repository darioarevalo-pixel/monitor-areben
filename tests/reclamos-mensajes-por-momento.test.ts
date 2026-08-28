import { describe, expect, it } from 'vitest'
import { mensajesDeLaFila } from '@/lib/reclamos/botones'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * **Los mensajes de la fila, por MOMENTO** (27-ago-2026).
 *
 * Bruno: *«tiene que haber un mensaje para cada estado, y tienen que dejar de estar botones que no
 * sirven en cada estado»*, *«para que pueda ejecutar la comunicación el local sin pensar o
 * preguntar»*.
 *
 * 🔑 **Cada caso afirma las dos mitades: qué mensajes hay y cuáles ⛔ NO.** Sin la segunda, agregar
 * mensajes sólo empeora el problema que se está arreglando — un botón que no aplica cuesta lo mismo
 * que uno que falta. Por eso se compara la **lista entera**, ⛔ no `toContain`: así un botón nuevo
 * que se cuele en un momento que no le toca pone algo en rojo.
 */

const base = {
  id: 1, store: 'bdi', estado: 'borrador', motivo: 'falla',
  items: [{ sku: 'X', producto: 'P', cantidad: 1, precio: '1000.00' }],
  reintegro_estado: 'no_aplica', stock_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  cupon_estado: 'no_aplica', envio_nuevo_estado: 'no_aplica', reingreso_estado: 'no_aplica',
  reclamo_correo_estado: 'no_aplica',
} as unknown as ReclamoRow

const fila = (campos: Partial<ReclamoRow>): ReclamoRow => ({ ...base, ...campos } as ReclamoRow)

describe('mensajesDeLaFila — qué se ofrece en cada momento', () => {
  it('recién abierto y sin fotos: sólo el de pedirlas', () => {
    expect(mensajesDeLaFila(fila({ estado: 'borrador' }))).toEqual(['pedir_fotos'])
    expect(mensajesDeLaFila(fila({ estado: 'esperando_cliente' }))).toEqual(['pedir_fotos'])
  })

  /**
   * 🔴 **El caso que abrió todo.** `en_revision` significa literalmente «el cliente ya cargó las
   * fotos», y era el único estado donde el local tenía un botón: pedirle las fotos que ya mandó.
   */
  it('con las fotos ya cargadas: ⛔ no se le vuelven a pedir en la columna', () => {
    const d = fila({ estado: 'en_revision', fotos: [{ url: 'https://blob/1.jpg' }] as never })
    expect(mensajesDeLaFila(d)).toEqual(['mas_fotos'])
    expect(mensajesDeLaFila(d)).not.toContain('pedir_fotos')
  })

  /**
   * ⚠️ **La fila REAL de producción**, leída de la base el 27-ago-2026 a la tarde: R-0022 de BDI
   * (Victoria Singh), con la foto que subió la clienta, `en_revision` y **sin decidir** —
   * `compensacion` en null después de soltar la decisión vieja. Es exactamente el momento en el que
   * el local tiene que hablar de la propuesta, y el único botón que le aparecía era el de pedirle
   * las fotos que ya había mandado.
   */
  it('R-0022, la fila real: tiene foto, así que el pedido ya se cumplió', () => {
    const r22 = fila({
      id: 22, orden_tn: '21033', cliente: 'Victoria Singh',
      motivo: 'no_esperaba', expectativa: 'plata', estado: 'en_revision',
      compensacion: null, destino_prenda: 'regalada', retorno_decidido: false,
      fotos: [{ url: 'https://blob/foto.jpg' }] as never,
      envio_nuevo_estado: 'pendiente', reingreso_estado: 'pendiente',
    })
    expect(mensajesDeLaFila(r22)).toEqual(['mas_fotos'])
  })

  /**
   * El link sirve para UNA cosa: que suba fotos. Si el caso no las necesita, el alta ya avisa
   * *«acá no hacen falta fotos»* — y la lista lo contradecía ofreciendo el mensaje igual.
   */
  it('un caso que no pide fotos: ni pedirlas ni pedir más', () => {
    expect(mensajesDeLaFila(fila({ motivo: 'no_llego' }))).toEqual([])
    expect(mensajesDeLaFila(fila({ motivo: 'demora' }))).toEqual([])
    expect(mensajesDeLaFila(fila({ motivo: 'sin_stock' }))).toEqual([])
    // Y si alguien del equipo igual subió una foto, tampoco se ofrece «pedir más».
    expect(mensajesDeLaFila(fila({ motivo: 'no_llego', fotos: [{ url: 'u' }] as never }))).toEqual([])
  })

  /**
   * 🔴 **Lo corrigió Bruno el 27-ago-2026**, y este test afirmaba la premisa vieja: *«la de que
   * quiere cambiar la prenda, si es con envío, sí necesitamos fotos para ver el estado de la
   * prenda»*. Por esta lista entran órdenes ONLINE ⇒ la prenda viaja igual, y el cambio de
   * mostrador se arma en la pestaña Cambios. Era el único caso en que volvía sin que nadie la
   * hubiera visto.
   */
  it('el que quiere cambiarla: también se le piden, porque la prenda viaja', () => {
    expect(mensajesDeLaFila(fila({ motivo: 'talle', expectativa: 'otro_producto' }))).toEqual(['pedir_fotos'])
    expect(mensajesDeLaFila(fila({ motivo: 'talle', expectativa: 'mismo_producto' }))).toEqual(['pedir_fotos'])
    expect(mensajesDeLaFila(fila({ motivo: 'talle', expectativa: 'plata' }))).toEqual(['pedir_fotos'])
    // ⛔ Y lo que NO cambia: donde no hay nada que fotografiar, se sigue sin pedir.
    expect(mensajesDeLaFila(fila({ motivo: 'no_llego', expectativa: 'otro_producto' }))).toEqual([])
  })

  /**
   * 🔑 Una vez decidido, el link muere a propósito (el portal contesta 404 fuera de los tres
   * estados abiertos) y lo que corresponde es contarle la resolución.
   */
  it('decidido: se ofrece la resolución y ⛔ ya no el link', () => {
    const d = fila({
      estado: 'en_revision', compensacion: 'plata_total',
      fotos: [{ url: 'https://blob/1.jpg' }] as never,
    })
    expect(mensajesDeLaFila(d)).toEqual(['resolucion'])
  })

  /**
   * 🔴 **Un cambio decidido vuelve a `borrador` a propósito** —lo termina el POS—, así que mirar
   * sólo el estado dejaba al caso ya resuelto ofreciendo otra vez el link del cliente. Sin fotos
   * cargadas, que es lo normal en un cambio, el botón viejo reaparecía después de decidir.
   */
  it('un cambio decidido vuelve a `borrador` y aun así ⛔ no vuelve a pedir fotos', () => {
    const d = fila({ estado: 'borrador', compensacion: 'otro_producto', motivo: 'falla' })
    expect(mensajesDeLaFila(d)).toEqual(['resolucion'])
  })

  it('fuera de los estados abiertos el link no se ofrece, esté como esté el caso', () => {
    expect(mensajesDeLaFila(fila({ estado: 'resuelto' }))).toEqual([])
    expect(mensajesDeLaFila(fila({ estado: 'en_transito' }))).toEqual([])
    expect(mensajesDeLaFila(fila({ estado: 'cerrado' }))).toEqual([])
  })

  it('la etiqueta y la plata se ofrecen cuando el hecho ya ocurrió', () => {
    const d = fila({
      estado: 'en_transito', compensacion: 'plata_total',
      seguimiento_vuelta: 'AR123', reintegro_estado: 'hecho',
    })
    expect(mensajesDeLaFila(d)).toEqual(['resolucion', 'etiqueta', 'plata_enviada'])
    // Sin la etiqueta cargada no hay seguimiento que mandar.
    expect(mensajesDeLaFila(fila({ estado: 'en_transito', compensacion: 'plata_total' })))
      .toEqual(['resolucion'])
    // Y con el reintegro pendiente ⛔ no se le avisa que la plata salió.
    expect(mensajesDeLaFila(fila({ estado: 'resuelto', compensacion: 'plata_total', reintegro_estado: 'pendiente' })))
      .toEqual(['resolucion'])
  })
})

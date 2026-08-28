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

  /**
   * 🔴 **El momento que no tenía mensaje, y es el que más dura.** Entre que Administración arma la
   * propuesta y que el cliente contesta pasan uno o tres días: es donde el reclamo pasa la mayor
   * parte de su vida. `ofertaEsperandoRespuesta` = hay monto y ⛔ todavía no hay respuesta.
   */
  it('con una oferta esperando respuesta: se ofrece la propuesta', () => {
    const d = fila({
      estado: 'en_revision', motivo: 'no_esperaba', expectativa: 'plata',
      retencion_monto: 13491, retencion_forma: 'plata', retencion_respuesta: null,
      fotos: [{ url: 'https://blob/1.jpg' }] as never,
    })
    expect(mensajesDeLaFila(d)).toEqual(['mas_fotos', 'propuesta'])
  })

  /**
   * 🔴 🔑 **La propuesta REEMPLAZA a la resolución, ⛔ no se le suma.** Mientras el cliente no
   * conteste, la resolución guardada es la salida *«por si dice que no»*: los dos botones juntos le
   * ofrecen a quien atiende prometer **dos cosas distintas sobre el mismo reclamo** —«te devolvemos
   * todo» y «quedátelo por una parte»—, y la que salga primero es la que el cliente va a reclamar
   * después. Es exactamente el defecto que este archivo existe para no repetir, por la otra punta.
   */
  it('decidido y con la oferta esperando: la propuesta, y ⛔ NO la resolución', () => {
    const d = fila({
      estado: 'resuelto', compensacion: 'plata_total',
      retencion_monto: 6000, retencion_forma: 'cupon', retencion_respuesta: null,
    })
    expect(mensajesDeLaFila(d)).toEqual(['propuesta'])
  })

  /**
   * 🔑 **Contestada, la propuesta se va.** Ya no hay nada que preguntar: lo que corresponde es
   * contarle en qué terminó. Vale para las dos respuestas — un `rechazo` deja la resolución
   * guardada tal cual, y un `acepto` la cambia, pero en los dos casos el mensaje es el de
   * resolución.
   */
  it('contestada —acepte o no— vuelve la resolución y ⛔ se va la propuesta', () => {
    const conRespuesta = { retencion_monto: 6000, retencion_forma: 'plata' as const, compensacion: 'plata_total' as const }
    expect(mensajesDeLaFila(fila({ ...conRespuesta, estado: 'resuelto', retencion_respuesta: 'rechazo' })))
      .toEqual(['resolucion'])
    expect(mensajesDeLaFila(fila({ ...conRespuesta, estado: 'resuelto', retencion_respuesta: 'acepto' })))
      .toEqual(['resolucion'])
  })

  /**
   * ⚠️ **Vacío ⛔ no es «se le ofreció por nada»**: sin monto no hay oferta registrada, y la
   * propuesta no tiene número que decir. Es el mismo cuidado que `registroDeRetencion`.
   */
  it('sin monto registrado ⛔ no hay propuesta que mandar', () => {
    const d = fila({ estado: 'resuelto', compensacion: 'plata_total', retencion_monto: null })
    expect(mensajesDeLaFila(d)).toEqual(['resolucion'])
  })

  /**
   * 🔑 **Con la propuesta armada, tampoco se le pide el link de fotos en la columna**: quien llegó
   * a ofrecer un monto ya tiene la evidencia que necesitaba. `mas_fotos` es otra cosa y sigue —vive
   * en el detalle de la fila, no en la columna de «qué toca ahora».
   */
  it('con una oferta esperando ⛔ no se le vuelve a pedir el link en la columna', () => {
    const d = fila({
      estado: 'en_revision', motivo: 'falla', retencion_monto: 5000, retencion_forma: 'plata',
    })
    expect(mensajesDeLaFila(d)).toEqual(['propuesta'])
  })

  /**
   * ⚠️ **Los HECHOS ⛔ no se callan.** La etiqueta y la plata que salió ya ocurrieron en el mundo:
   * una propuesta ⛔ no los contradice, y esconderlos dejaría al cliente sin el seguimiento.
   */
  it('la etiqueta y la plata ya ocurrieron: conviven con la propuesta', () => {
    const d = fila({
      estado: 'en_transito', compensacion: 'plata_total', seguimiento_vuelta: 'AR123',
      retencion_monto: 4000, retencion_forma: 'plata', retencion_respuesta: null,
    })
    expect(mensajesDeLaFila(d)).toEqual(['propuesta', 'etiqueta'])
  })

  /**
   * 🔴 **El rato en que el cliente cree que la pelota es suya y no lo es** (28-ago-2026). Decidido
   * con retorno, la fila pasa a `en_transito` — pero por correo o Andreani el cliente ⛔ todavía no
   * puede despachar nada: le falta la etiqueta. Es el momento en que cae el que **NO acepta** la
   * oferta y se sigue con la devolución, y hasta hoy el reclamo quedaba mudo justo ahí.
   */
  it('en tránsito y sin etiqueta todavía: se le avisa que va en camino', () => {
    const d = fila({ estado: 'en_transito', compensacion: 'plata_total', via_retorno: 'andreani' })
    expect(mensajesDeLaFila(d)).toEqual(['resolucion', 'etiqueta_en_camino'])
  })

  /**
   * 🔑 **Los dos de la etiqueta son EXCLUYENTES, y el que los separa es el DATO.** El mismo
   * `seguimiento_vuelta` que enciende el segundo apaga el primero: los dos juntos serían decirle
   * «te la mandamos apenas la tengamos» y «acá está», en la misma columna.
   */
  it('con el código cargado: se va el «va en camino» y entra el de la etiqueta', () => {
    const d = fila({ estado: 'en_transito', compensacion: 'plata_total', via_retorno: 'andreani', seguimiento_vuelta: 'AR123' })
    expect(mensajesDeLaFila(d)).toEqual(['resolucion', 'etiqueta'])
  })

  /**
   * 🔴 **`etiqueta_en_camino` es una PROMESA, ⛔ no un hecho** — corregido el 28-ago-2026, el día
   * después de escribirlo. Con una oferta esperando salían **los dos**: *«¿te lo querés quedar por
   * $13.491?»* y *«te mando la etiqueta para que lo devuelvas»*, en la misma columna. La regla de
   * este archivo ya lo decía y el código no la cumplía.
   */
  it('🔴 con la oferta esperando ⛔ no se le promete también la etiqueta', () => {
    const d = fila({
      estado: 'en_transito', compensacion: 'plata_total', via_retorno: 'andreani',
      retencion_monto: 13491, retencion_forma: 'plata', retencion_respuesta: null,
    })
    expect(mensajesDeLaFila(d)).toEqual(['propuesta'])
  })

  /** Y cuando contesta que no, el turno vuelve a ser nuestro y el mensaje aparece. */
  it('contestado el rechazo, sí se le avisa que la etiqueta va en camino', () => {
    const d = fila({
      estado: 'en_transito', compensacion: 'plata_total', via_retorno: 'andreani',
      retencion_monto: 13491, retencion_forma: 'plata', retencion_respuesta: 'rechazo',
    })
    expect(mensajesDeLaFila(d)).toEqual(['resolucion', 'etiqueta_en_camino'])
  })

  /**
   * ⚠️ **Sólo donde hay etiqueta que mandar.** Si lo trae al local o lo pasa a buscar un cadete no
   * hay nada que emitir, y ofrecer el mensaje sería prometerle algo que no existe.
   */
  it('sin etiqueta que mandar ⛔ no se ofrece el mensaje', () => {
    const base2 = { estado: 'en_transito' as const, compensacion: 'plata_total' as const }
    expect(mensajesDeLaFila(fila({ ...base2, via_retorno: 'presencial' }))).toEqual(['resolucion'])
    expect(mensajesDeLaFila(fila({ ...base2, via_retorno: 'cadete' }))).toEqual(['resolucion'])
    expect(mensajesDeLaFila(fila({ ...base2, via_retorno: null }))).toEqual(['resolucion'])
  })

  it('la etiqueta y la plata se ofrecen cuando el hecho ya ocurrió', () => {
    const d = fila({
      estado: 'en_transito', compensacion: 'plata_total',
      seguimiento_vuelta: 'AR123', reintegro_estado: 'hecho',
    })
    expect(mensajesDeLaFila(d)).toEqual(['resolucion', 'etiqueta', 'plata_enviada'])
    // 🔑 Los tres hechos, en el orden en que ocurren en el mundo: primero sale el paquete de
    // vuelta, después el nuestro, y al final la plata. La lista **es** ese orden.
    expect(mensajesDeLaFila(fila({ ...d, compensacion: 'otro_producto', envio_nuevo_estado: 'hecho' })))
      .toEqual(['resolucion', 'etiqueta', 'despacho_hecho', 'plata_enviada'])
    // Sin la etiqueta cargada no hay seguimiento que mandar.
    expect(mensajesDeLaFila(fila({ estado: 'en_transito', compensacion: 'plata_total' })))
      .toEqual(['resolucion'])
    // Y con el reintegro pendiente ⛔ no se le avisa que la plata salió.
    expect(mensajesDeLaFila(fila({ estado: 'resuelto', compensacion: 'plata_total', reintegro_estado: 'pendiente' })))
      .toEqual(['resolucion'])
  })

  /**
   * 🔴 **El hecho que ocurría y ⛔ no se contaba** (28-ago-2026, D5 de la auditoría): el texto
   * de *«ya lo despachamos»* existía y estaba probado desde el 27, y su **único llamador era el
   * test**. En las tres resoluciones que mandan algo —el cambio, la reposición y el reenvío— el
   * paquete salía y el cliente no se enteraba por el sistema.
   *
   * 🔑 Se lee del **pendiente que tilda Depósito**, ⛔ no de un campo de texto: el hecho lo cuenta
   * quien lo hizo, igual que `plata_enviada` sale de `reintegro_estado`.
   */
  it('🔴 despachado lo que se le manda: se le avisa', () => {
    const d = fila({ estado: 'resuelto', compensacion: 'otro_producto', envio_nuevo_estado: 'hecho' })
    expect(mensajesDeLaFila(d)).toEqual(['resolucion', 'despacho_hecho'])
  })

  it('mientras el paquete ⛔ no salió, no se le avisa nada', () => {
    expect(mensajesDeLaFila(fila({ estado: 'resuelto', compensacion: 'otro_producto', envio_nuevo_estado: 'pendiente' })))
      .toEqual(['resolucion'])
  })

  /**
   * 🔑 **Es un HECHO, así que convive con la propuesta.** La oferta esperando calla las promesas
   * —la resolución, la etiqueta que va en camino— porque son otra cosa que la que se está
   * negociando; un paquete que ya está en la calle ⛔ no se contradice con nada.
   */
  it('con la oferta esperando, el despacho ya hecho se sigue contando', () => {
    const d = fila({
      estado: 'resuelto', compensacion: 'otro_producto', envio_nuevo_estado: 'hecho',
      retencion_monto: 13491, retencion_forma: 'plata', retencion_respuesta: null,
    })
    expect(mensajesDeLaFila(d)).toEqual(['propuesta', 'despacho_hecho'])
  })
})

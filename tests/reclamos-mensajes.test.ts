import { describe, it, expect } from 'vitest'
import { mensajeApertura, mensajeEtiquetaEnCamino, mensajePropuesta, mensajeResolucion, mensajeSeguimiento, resumenCorto } from '@/lib/reclamos/mensajes'
import { MOTIVO_LABEL, type ReclamoRow, type ItemReclamo } from '@/lib/reclamos/tipos'

/**
 * Los mensajes que salen al cliente.
 *
 * Tienen tests porque **son texto que sale de la empresa**: si dice un monto que no es, o promete
 * algo que no se va a cumplir, el problema no es visual. Y porque el motivo de que los arme el
 * sistema es justamente que no dependan de cómo lo redacte cada persona.
 */

const items: ItemReclamo[] = [
  { producto: 'WEAVE CASE CHERRY', variante: 'iPhone 11', cantidad: 1, precio: 8990 },
  { producto: 'ICONIC GREEN', variante: 'iPhone 11', cantidad: 2, precio: 8990 },
]

const base = { cliente: 'carla florencia ietta', orden_tn: '20700', items } as Partial<ReclamoRow>

describe('mensaje de apertura', () => {
  const txt = mensajeApertura({ ...base, motivo: 'falla' } as ReclamoRow, 'R-0025', 'https://x/reclamo/tok')

  it('saluda por el nombre de pila, no por el nombre del comprobante', () => {
    expect(txt).toContain('¡Hola Carla!')
    expect(txt).not.toContain('ietta')
  })

  it('dice el reclamo, el pedido y qué productos son', () => {
    expect(txt).toContain('R-0025')
    expect(txt).toContain('#20700')
    expect(txt).toContain('1× WEAVE CASE CHERRY (iPhone 11)')
    expect(txt).toContain('2× ICONIC GREEN')
  })

  // El link es el punto del mensaje: si queda pegado a otro texto, WhatsApp se lo come.
  it('el link va solo en su renglón', () => {
    expect(txt.split('\n')).toContain('https://x/reclamo/tok')
  })

  it('sin nombre del cliente, saluda igual y no dice "Hola undefined"', () => {
    const t = mensajeApertura({ items, motivo: 'falla' } as ReclamoRow, 'D-1', 'https://x')
    expect(t).toContain('¡Hola!')
    expect(t.toLowerCase()).not.toContain('undefined')
  })
})

describe('mensaje de resolución', () => {
  it('devolución total: dice el monto exacto', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'plata_total', monto_total: 15283, destino_prenda: 'stock', via_retorno: 'andreani' } as ReclamoRow, 'R-0025')
    expect(t).toContain('$ 15.283')
    expect(t).toContain('Andreani')
    expect(t).toContain('lo pagamos nosotros')
  })

  // La duda número uno del cliente cuando le devuelven plata y no le piden el producto.
  it('si se lo queda, lo dice explícitamente', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'plata_parcial', monto_total: 5000, destino_prenda: 'falla', via_retorno: null } as ReclamoRow, 'R-0025')
    expect(t).toContain('No hace falta que nos devuelvas nada')
    expect(t).toContain('$ 5.000')
  })

  /**
   * 🔑 **`regalada` es el caso más literal de "quedátelo"**, y hasta el 26-ago-2026 llegaba acá
   * disfrazado de `falla`. Si el destino nuevo no entra en la cuenta, al cliente que se queda con un
   * producto sano **no se le dice nada**: se queda esperando una etiqueta de devolución que nunca
   * va a llegar, y el reclamo parece trabado del lado de él.
   */
  it('la unidad SANA que se queda también lo dice explícitamente', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'ninguna', monto_total: 0, destino_prenda: 'regalada', via_retorno: null } as ReclamoRow, 'R-0025')
    expect(t).toContain('No hace falta que nos devuelvas nada')
  })

  it('reenvío del faltante: no promete plata', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'reenvio', monto_total: 0, destino_prenda: 'no_salio' } as ReclamoRow, 'R-0025')
    expect(t).toContain('Te enviamos lo que falta')
    expect(t).not.toContain('devolvemos $')
  })

  it('cupón: incluye el código', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'cupon', cupon_codigo: 'ABC123', destino_prenda: 'falla' } as ReclamoRow, 'R-0025')
    expect(t).toContain('ABC123')
  })

  it('presencial: le dice que se acerque, no que espere una etiqueta', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'plata_total', monto_total: 1000, via_retorno: 'presencial', destino_prenda: 'stock' } as ReclamoRow, 'R-0025')
    expect(t).toContain('Acercate al local')
    expect(t).not.toContain('etiqueta')
  })

  // Prometer una fecha exacta de acreditación es la forma más fácil de generar un segundo reclamo.
  it('avisa que la acreditación tarda, sin prometer un plazo exacto', () => {
    const t = mensajeResolucion({ ...base, compensacion: 'plata_total', monto_total: 1000, destino_prenda: 'stock' } as ReclamoRow, 'R-0025')
    expect(t).toContain('puede tardar unos días')
    expect(t).not.toMatch(/\b(24|48|72)\s*(hs|horas)\b/i)
  })
})

describe('mensaje de seguimiento', () => {
  it('etiqueta: incluye el código y aclara quién paga', () => {
    const t = mensajeSeguimiento({ ...base, seguimiento_vuelta: 'AR123' } as ReclamoRow, 'R-0025', 'etiqueta')
    expect(t).toContain('AR123')
    expect(t).toContain('por nuestra cuenta')
  })

  it('reenvío: usa el seguimiento de IDA, no el de vuelta', () => {
    const t = mensajeSeguimiento({ ...base, seguimiento_ida: 'IDA9', seguimiento_vuelta: 'VUELTA1' } as ReclamoRow, 'R-0025', 'reenvio')
    expect(t).toContain('IDA9')
    expect(t).not.toContain('VUELTA1')
  })

  it('plata: dice el monto', () => {
    const t = mensajeSeguimiento({ ...base, monto_total: 15283 } as ReclamoRow, 'R-0025', 'plata')
    expect(t).toContain('$ 15.283')
  })
})

/**
 * **La propuesta de que se lo quede.**
 *
 * 🔴 Es el mensaje que más se va a usar —Administración arma la oferta, el local la manda, la
 * respuesta llega uno o tres días después— y era el único de los cuatro momentos **sin texto**: el
 * de la clienta de R-0022 se escribió a mano. Por eso las dos mitades que se fijan acá son **qué
 * promete** (la forma: plata o cupón, que después decide en qué termina el reclamo) y **qué pasa si
 * dice que no**, que es lo que hace que la oferta sea una oferta y no un aviso.
 */
describe('mensaje de la propuesta', () => {
  // ⚠️ La expectativa dice OTRA cosa que la resolución a propósito: es lo que hace que el test
  // distinga de cuál de las dos sale la alternativa. Con las dos iguales, invertir la precedencia
  // no rompería nada y la regla quedaría sin fijar.
  const oferta = {
    ...base, retencion_monto: 13491, retencion_forma: 'plata',
    compensacion: 'plata_total', expectativa: 'otro_producto',
  } as ReclamoRow

  it('saluda, dice el reclamo, el pedido y los productos', () => {
    const txt = mensajePropuesta(oferta, 'R-0022')
    expect(txt).toContain('¡Hola Carla!')
    expect(txt).toContain('R-0022')
    expect(txt).toContain('#20700')
    expect(txt).toContain('1× WEAVE CASE CHERRY (iPhone 11)')
  })

  it('en plata: dice cuánto se le devuelve y que se queda con los productos', () => {
    const txt = mensajePropuesta(oferta, 'R-0022')
    expect(txt).toContain('$ 13.491')
    expect(txt).toContain('te devolvemos')
    expect(txt).toContain('te quedás con los productos')
    expect(txt).not.toContain('cupón')
  })

  /**
   * 🔴 **La forma ⛔ no es cosmética.** Aceptar un cupón termina en `compensacion: 'cupon'` y deja
   * pendiente crearlo en la tienda; aceptar plata saca plata de la caja. Prometer una y ejecutar la
   * otra se descubre en la caja o en la próxima compra del cliente, ⛔ nunca en una pantalla.
   */
  it('en cupón: promete un cupón para la próxima compra, ⛔ no una devolución', () => {
    const txt = mensajePropuesta({ ...oferta, retencion_forma: 'cupon' } as ReclamoRow, 'R-0022')
    expect(txt).toContain('un cupón de $ 13.491 para tu próxima compra')
    expect(txt).not.toContain('te devolvemos')
  })

  /**
   * ⚠️ **La forma vacía cae en plata**, con la MISMA regla que `salidaAlAceptarRetencion`
   * (`cupon` o, cualquier otra cosa, plata). Las filas anteriores a la columna `retencion_forma`
   * no dicen nada, y el texto tiene que prometer lo mismo que después se va a ejecutar.
   */
  it('sin forma registrada promete plata, igual que lo que se va a ejecutar', () => {
    const txt = mensajePropuesta({ ...oferta, retencion_forma: null } as ReclamoRow, 'R-0022')
    expect(txt).toContain('te devolvemos $ 13.491')
    expect(txt).not.toContain('cupón')
  })

  /**
   * 🔑 **La alternativa sale de lo GUARDADO.** Con el reclamo ya decidido, la resolución de la fila
   * es la salida «por si dice que no» — nombrar otra cosa es prometerle algo distinto de lo que va
   * a pasar cuando conteste.
   */
  it('decidido: la alternativa es la resolución que ya está guardada', () => {
    expect(mensajePropuesta(oferta, 'R-0022')).toContain('seguimos con la devolución como estaba')
    expect(mensajePropuesta({ ...oferta, compensacion: 'otro_producto' } as ReclamoRow, 'R-0022'))
      .toContain('seguimos con el cambio como estaba')
  })

  it('sin decidir todavía: la alternativa es lo que el cliente PIDIÓ', () => {
    const sinDecidir = { ...oferta, compensacion: null, expectativa: 'otro_producto' } as ReclamoRow
    expect(mensajePropuesta(sinDecidir, 'R-0022')).toContain('seguimos con el cambio como estaba')
  })

  /**
   * ⚠️ **Sin ninguno de los dos ⛔ no se inventa una salida**: se nombran las dos. Un texto que
   * afirma «seguimos con la devolución» sobre un reclamo donde nadie decidió nada es una promesa
   * salida de la nada.
   */
  it('sin resolución ni expectativa: nombra las dos y ⛔ no elige una', () => {
    const pelado = { ...oferta, compensacion: null, expectativa: null } as ReclamoRow
    expect(mensajePropuesta(pelado, 'R-0022')).toContain('seguimos con el cambio o la devolución')
  })

  /**
   * 🔑 **Es el único de los cuatro que PREGUNTA.** Los otros tres avisan algo ya decidido; éste
   * espera una respuesta, y sin pedirla explícitamente el cliente contesta cualquier cosa y quien
   * atiende no sabe si eso fue un sí.
   */
  it('termina preguntando', () => {
    expect(mensajePropuesta(oferta, 'R-0022')).toContain('¿Cómo preferís que lo resolvamos?')
  })

  /** ⚠️ Se dice el número, ⛔ no de dónde sale: explicar la cuenta invita a discutirla. */
  it('⛔ no muestra la cuenta de la que salió el monto', () => {
    const txt = mensajePropuesta(oferta, 'R-0022')
    expect(txt).not.toContain('descuento')
    expect(txt).not.toContain('%')
  })
})

/**
 * **La etiqueta todavía no existe, y el cliente ⛔ no lo sabe.**
 *
 * Pedido de Bruno, 28-ago-2026: *«le mandamos que apenas tengamos la etiqueta se la estamos
 * enviando para que pueda despachar el paquete»*. Es el hueco del circuito cuando el cliente **no
 * acepta** la oferta: la resolución ya se le contó, la etiqueta tarda, y del otro lado hay alguien
 * esperando sin saber si tiene que hacer algo.
 */
describe('mensaje de que la etiqueta va en camino', () => {
  const d = { ...base, via_retorno: 'andreani' } as ReclamoRow

  it('nombra la vía y dice quién paga el envío', () => {
    const txt = mensajeEtiquetaEnCamino(d, 'R-0022')
    expect(txt).toContain('R-0022')
    expect(txt).toContain('Andreani')
    expect(txt).toContain('El envío lo pagamos nosotros')
  })

  /**
   * 🔑 **Lo que este mensaje existe para decir**: que ⛔ no tiene que hacer nada todavía. Sin eso
   * el cliente vuelve a escribir para preguntar, o peor: el paquete no sale y el reloj de «hace N
   * días que no llega» empieza a correr sobre una espera que nunca fue de él.
   */
  it('le dice explícitamente que por ahora ⛔ no tiene que hacer nada', () => {
    expect(mensajeEtiquetaEnCamino(d, 'R-0022')).toContain('no tenés que hacer nada')
  })

  /** ⚠️ La etiqueta la emite el transporte: prometer una fecha es lo que este archivo evita. */
  it('⛔ no promete un plazo', () => {
    const txt = mensajeEtiquetaEnCamino(d, 'R-0022')
    expect(txt).not.toMatch(/mañana|24 h|48 h|hoy mismo/i)
  })

  it('sin vía cargada no inventa un transporte', () => {
    const txt = mensajeEtiquetaEnCamino({ ...base, via_retorno: null } as ReclamoRow, 'R-0022')
    expect(txt).toContain('Estamos generando la etiqueta para que')
    expect(txt).not.toContain('undefined')
  })
})

describe('resumenCorto', () => {
  it('arma la etiqueta del listado', () => {
    // ⚠️ El motivo se DERIVA del mapa y ⛔ no se escribe: los rótulos cambiaron el 27-ago-2026 y
    // fijar la cadena acá es un candado —se rompe cuando alguien mejora la redacción— en vez de un
    // oráculo. Lo que se fija es la FORMA: número · motivo · primer nombre en capital.
    expect(resumenCorto({ motivo: 'mal_armado', cliente: 'carla ietta' } as ReclamoRow, 'R-0007'))
      .toBe(`R-0007 · ${MOTIVO_LABEL.mal_armado} · Carla`)
  })
})

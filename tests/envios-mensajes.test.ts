import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aCobrar, turnosDe } from '@/lib/envios/reglas.core.js'
import { linkWhatsapp, nombreDeMarca } from '@/lib/envios/core'
import { cuandoPasamos, diaEnCriollo, diasQueOfrecemos, mensajeParaLaClienta } from '@/lib/envios/mensajes'
import type { Envio } from '@/lib/envios/tipos'

/**
 * El primer mensaje a la clienta: cuánto sale el envío y cuándo pasa la moto.
 *
 * 🔴 **Lo que estos tests existen para cazar es que el mensaje prometa una cosa y el ticket cobre
 * otra.** Es texto que sale a alguien de afuera y habla de plata: una vez mandado no se corrige, y
 * la contradicción aparece con el cadete en la puerta. Por eso el número de «al recibir» se afirma
 * contra `aCobrar` —la misma función que imprime el ticket— y no contra un número escrito acá.
 */

const base: Envio = {
  id: 'en1',
  store: 'bdi',
  fecha: null,
  turno: null,
  origen: 'tn',
  orden_numero: '20913',
  cliente: 'ana lopez',
  telefono: '3415551234',
  direccion: 'Riobamba 1234',
  piso_depto: null,
  localidad: 'Rosario',
  cp: '2000',
  anotacion: null,
  monto_envio: 4300,
  envio_pagado: false,
  envio_bonificado: false,
  monto_pedido_a_cobrar: 0,
  estado: 'pendiente',
  cobrado: null,
  vendedor: null,
  cadete: null,
  datos: {},
  autor: null,
}

const con = (p: Partial<Envio>): Envio => ({ ...base, ...p })

/** Un lunes. La grilla: lun tarde · mar mañana y tarde · mié tarde · jue mañana y tarde · vie tarde. */
const LUNES = '2026-08-17'

/**
 * 🔴 **El mensaje dice SÓLO el envío** (decisión de Bruno, 18-ago-2026: *«dejalo que diga solo el
 * envío, sin el total»*), y **no nombra la forma de pago** (*«depende mucho de qué seleccionó en la
 * compra, entonces no nos metamos en eso»*).
 *
 * ⚠️ Estos tests fijan una **decisión**, no una verdad: la versión anterior nombraba el total que la
 * puerta iba a cobrar, y sacarlo significa que en una fila con saldo del pedido el mensaje dice
 * $ 4.200 y el cadete cobra $ 16.342. Está aceptado. Por eso los tests son explícitos: para que
 * volver a poner el total sea un cambio que alguien decide, y no uno que se cuela «arreglando».
 */
describe('🔴 la plata del mensaje: sólo el envío', () => {
  it('🔴 con saldo del pedido, el mensaje NO lo nombra ni suma el total', () => {
    // El mutante es volver a la versión anterior. Los dos números tienen que estar ausentes: el del
    // pedido ($ 17.500) y el de la suma ($ 21.800).
    const e = con({ monto_envio: 4300, monto_pedido_a_cobrar: 17500 })
    expect(aCobrar(e)).toBe(21800)
    const m = mensajeParaLaClienta(e, LUNES) || ''
    expect(m).toContain('El costo del envío a Riobamba 1234, Rosario es de $ 4.300.')
    expect(m).not.toContain('$ 17.500')
    expect(m).not.toContain('$ 21.800')
    expect(m).not.toContain('del pedido')
    expect(m).not.toContain('en total')
  })

  it('🔴 y NUNCA nombra la forma de pago: ese dato lo eligió la clienta en el checkout', () => {
    // El mutante es la línea que estuvo puesta unas horas. No la puede afirmar este archivo: acá no
    // hay un solo campo que diga qué medio de pago se eligió en la compra.
    for (const p of [{}, { monto_pedido_a_cobrar: 17500 }, { envio_bonificado: true }, { envio_pagado: true }]) {
      const m = mensajeParaLaClienta(con(p), LUNES) || ''
      expect(m).not.toContain('efectivo')
      expect(m).not.toContain('transferencia')
      expect(m).not.toContain('Podés abonar')
    }
  })

  it('🔴 un envío YA PAGO no dice cuánto sale', () => {
    // Es el mismo error que el KPI que mandaba a reclamarle plata a una clienta que ya había pagado,
    // pero por escrito y a la clienta.
    const m = mensajeParaLaClienta(con({ envio_pagado: true }), LUNES) || ''
    expect(m).toContain('El envío a Riobamba 1234, Rosario ya está pago.')
    expect(m).not.toContain('El costo del envío')
    expect(m).not.toContain('$ 4.300')
  })

  it('🔴 un envío BONIFICADO dice que va sin cargo, y no que está pago', () => {
    // No son lo mismo: uno es plata que entró por adelantado, el otro plata que no entró nunca.
    // Colapsarlos le dice a la clienta que pagó algo que le regalamos.
    const m = mensajeParaLaClienta(con({ envio_bonificado: true }), LUNES) || ''
    expect(m).toContain('va sin cargo')
    expect(m).not.toContain('ya está pago')
  })

  it('🔴 y saldado con saldo del pedido TAMPOCO nombra el pedido', () => {
    // El caso que más tentaba a dejar el saldo puesto: el envío no se cobra pero la puerta sí. La
    // decisión vale igual — el número entero vive en el ticket.
    const m = mensajeParaLaClienta(con({ envio_pagado: true, monto_pedido_a_cobrar: 17500 }), LUNES) || ''
    expect(m).toContain('ya está pago.')
    expect(m).not.toContain('$ 17.500')
  })
})

/**
 * 🔴 **La despedida pide que confirme UNO DE LOS DÍAS DE ARRIBA.**
 *
 * Suelta al final es un pedido sin objeto: si el mensaje no llegó a ofrecer días —`hoy` mal formada,
 * que es el mismo guardia por el que `diaEnCriollo` devuelve `''` en vez de tirar— «esperamos tu
 * confirmación» le pide a la clienta que confirme algo que el texto nunca dijo, y la respuesta es
 * una pregunta. Van juntas o no va ninguna.
 */
describe('🔴 «esperamos tu confirmación» viaja pegada a los días', () => {
  it('🔴 sin días ofrecidos, tampoco se pide confirmación', () => {
    const m = mensajeParaLaClienta(con({}), 'no-es-una-fecha') || ''
    expect(diasQueOfrecemos('no-es-una-fecha')).toEqual([])
    expect(m).not.toContain('Podríamos enviar')
    expect(m).not.toContain('Esperamos tu confirmación')
    // Y el mensaje se arma igual con la plata: es la línea del día la que falta, no el mensaje.
    expect(m).toContain('El costo del envío')
  })

  it('el mensaje entero, tal como sale al chat', () => {
    // 🔑 El oráculo que mira lo que ve la clienta y no un pedazo: los tres renglones, en orden.
    expect(mensajeParaLaClienta(con({}), LUNES)).toBe(
      'Hola Ana! Te escribimos de BDI Accesorios por tu pedido #20913.\n' +
        'El costo del envío a Riobamba 1234, Rosario es de $ 4.300.\n' +
        'Podríamos enviar el martes 18 (a la mañana o a la tarde) o el miércoles 19 a la tarde.\n' +
        '¡Esperamos tu confirmación!',
    )
  })
})

describe('🔴 sin precio no hay mensaje', () => {
  it('🔴 devuelve `null`, no un texto sin la plata', () => {
    // Mismo criterio que `puedeIrAUnDia`: un mensaje de coordinación que no dice cuánto sale obliga
    // a un segundo mensaje con la plata. Y callarse el precio adentro de un texto que habla de plata
    // es peor que no mandarlo. El mutante devuelve el texto igual y nadie ve nada raro.
    expect(mensajeParaLaClienta(con({ monto_envio: 0 }), LUNES)).toBeNull()
  })

  it('y entonces el botón abre el chat vacío, como antes', () => {
    expect(linkWhatsapp(con({}), null)).toBe('https://wa.me/5493415551234')
  })
})

describe('🔴 el día: SIEMPRE se propone, porque esto es el primer contacto', () => {
  it('🔴 SIN día propone los dos próximos y PREGUNTA', () => {
    // El día lo confirma la clienta: es la regla de la sección y la razón de que exista la bandeja.
    const m = mensajeParaLaClienta(con({ fecha: null, turno: null }), LUNES) || ''
    expect(m).toContain('Podríamos enviar')
    expect(m).toContain('¡Esperamos tu confirmación!')
  })

  it('🔴 un NO ENTREGADO propone de nuevo, y NO confirma el día en que no la encontraron', () => {
    // 🔴 El caso que hace que la regla sea «siempre propone» y no «propone si no tiene fecha». Un
    // `no_entregado` **vuelve a la bandeja con la fecha de su intento fallido puesta** (el filtro es
    // `fecha is null OR estado='no_entregado'`), así que un texto que confirmara «pasamos el lunes
    // 17» le estaría confirmando a la clienta el día que ya pasó y en el que no estaba.
    const m = mensajeParaLaClienta(con({ fecha: '2026-08-17', turno: 'tarde', estado: 'no_entregado' }), LUNES) || ''
    expect(m).toContain('Podríamos enviar el martes 18')
    expect(m).not.toContain('lunes 17')
  })

  it('🔴 los días propuestos arrancan MAÑANA, no hoy', () => {
    // El mutante: arrancar en `hoy`. Cuando alguien manda el primer mensaje la mochila de hoy ya
    // está armada y la moto puede estar en la calle: se le promete un turno que ya salió.
    const dias = diasQueOfrecemos(LUNES)
    expect(dias[0]).toBe('2026-08-18')
    expect(dias).not.toContain(LUNES)
  })

  it('🔴 y son días que EXISTEN en la grilla: el segundo SALTA el finde', () => {
    // 🔴 El mutante: sumar un día corrido para el segundo. Casi nunca se nota —martes y miércoles
    // son los dos de reparto— y el jueves promete un **sábado**, que es un día sin moto. Por eso el
    // caso está fijado en un jueves y no en un lunes: medir donde el defecto se ve.
    expect(diasQueOfrecemos('2026-08-20')).toEqual(['2026-08-21', '2026-08-24'])
    for (const dia of ['2026-08-17', '2026-08-20', '2026-08-21', '2026-08-22']) {
      for (const f of diasQueOfrecemos(dia)) expect(turnosDe(f).length).toBeGreaterThan(0)
    }
  })

  it('🔴 el turno ofrecido es el que ese día TIENE', () => {
    // El mutante: escribir «a la tarde» siempre. El martes sale también a la mañana y la clienta
    // pierde la mitad de las opciones; peor al revés, prometiendo una mañana que no existe.
    expect(cuandoPasamos('2026-08-18')).toBe('el martes 18 (a la mañana o a la tarde)')
    expect(cuandoPasamos('2026-08-19')).toBe('el miércoles 19 a la tarde')
  })

  it('el día se dice como se dice por WhatsApp, y `\'\'` no lo hace explotar', () => {
    // 🔴 `rotuloFecha('')` tira, y un throw en el render mata la pestaña. Ya pasó tres veces acá.
    expect(diaEnCriollo('2026-08-18')).toBe('martes 18')
    expect(diaEnCriollo('')).toBe('')
  })
})

describe('el resto del mensaje', () => {
  it('🔴 la marca es la LARGA, la misma que imprime el ticket', () => {
    // 🔴 El mutante es la tabla escrita a mano que había acá: `store === 'zattia' ? 'Zattia' : 'BDI'`.
    // No fallaba nada — y los dos papeles que recibe la misma clienta decían nombres distintos, el
    // ticket «BDI Accesorios» y el WhatsApp «BDI». Lo cazó Bruno leyendo el mensaje.
    expect(mensajeParaLaClienta(con({}), LUNES)).toContain('Hola Ana! Te escribimos de BDI Accesorios por tu pedido #20913.')
    expect(mensajeParaLaClienta(con({ store: 'zattia' }), LUNES)).toContain('Te escribimos de Zattia por tu pedido')
  })

  it('🔴 y sale del MISMO lugar que el ticket, no de una tabla propia', () => {
    // Texto contra texto: lo que este test defiende es que haya UNA tabla. Con dos, la que se
    // escriba más corta la próxima vez vuelve a contradecir al papel sin romper un solo test.
    expect(nombreDeMarca('bdi')).toBe('BDI Accesorios')
    expect(nombreDeMarca('zattia')).toBe('Zattia')
    expect(mensajeParaLaClienta(con({}), LUNES)).toContain(nombreDeMarca('bdi'))
  })

  it('🔴 los espacios de más de la dirección se juntan', () => {
    // Medido en prod: 3 de las 11 direcciones vienen así de Tienda Nube («Brown  1807»). En la tabla
    // no se ve; en un mensaje que sale a la clienta se lee como un descuido nuestro sobre su propia
    // dirección. Lo cazó MIRAR el mensaje armado con filas reales, no un test.
    expect(mensajeParaLaClienta(con({ direccion: 'Brown  1807' }), LUNES)).toContain('El costo del envío a Brown 1807, Rosario')
  })

  it('un alta a mano sin número de orden no dice «#null»', () => {
    expect(mensajeParaLaClienta(con({ orden_numero: null, origen: 'manual' }), LUNES)).toContain('por tu pedido.')
  })

  it('🔴 el link va con el texto ESCAPADO', () => {
    // El mutante: pegarlo crudo. El texto se corta en el primer `&` o `#` — y el mensaje lleva el
    // `#` del número de orden en la primera línea, así que llegaría siempre partido.
    const link = linkWhatsapp(con({}), 'Pedido #20913 & saldo') || ''
    expect(link).toContain('text=Pedido%20%2320913%20%26%20saldo')
  })
})

/**
 * 🔴 **La condición tiene que VERSE, y eso vive en el JSX.**
 *
 * Que `mensajeParaLaClienta` devuelva `null` sin precio está probado arriba. Lo que esos tests no
 * pueden ver es lo que le pasó a Bruno la primera vez que lo usó: **el botón se veía igual con
 * mensaje y sin mensaje**. Lo único que los separaba era el `title`, que hay que ir a buscar con el
 * mouse, así que la regla era invisible — se aprieta esperando el texto escrito y se abre un chat
 * vacío. Es el mismo modo de falla que un cartel que se calla: no está mal, no dice nada.
 *
 * Dos señales y no una, porque el color solo tampoco alcanza para saber POR QUÉ.
 */
describe('🔴 el botón dice si el mensaje está adentro', () => {
  const pantalla = readFileSync(join(__dirname, '..', 'components/envios/Envios.tsx'), 'utf8')
  const direccion = pantalla.slice(pantalla.indexOf('function Direccion('), pantalla.indexOf('function ResumenPedido('))

  it('el bloque existe (si esto falla, el test se quedó mirando un archivo que se movió)', () => {
    expect(direccion).not.toBe('')
  })

  it('🔴 el verde es «el mensaje está armado», no la decoración del botón', () => {
    // El mutante es `tone="success"` fijo: vuelve a verse igual en los dos casos.
    expect(direccion).toMatch(/tone=\{mensaje \?/)
  })

  it('🔴 y además lo dice con palabras: el color solo no explica POR QUÉ', () => {
    // El mutante es borrar la línea. El botón gris deja de mentir, pero tampoco enseña qué hacer —
    // y lo que hay que hacer (cotizar) está en otra columna.
    expect(direccion).toContain('el mensaje sale escrito al cotizar')
    expect(direccion).toMatch(/!mensaje \?/)
  })
})

/**
 * 🔴 **El mensaje armado vive SÓLO en la bandeja «Sin fecha»** (lo decidió Bruno el 17-ago-2026,
 * viéndolo andar). Es la primera comunicación: se manda una vez, antes de que el pedido tenga día.
 * En la hoja del día el envío ya está acordado y el que escribe desde ahí es el cadete, con su propio
 * mensaje —`mensajeParaLaPuerta`, el del portal—. Son dos textos para dos momentos, y meter el
 * primero en el segundo es reabrir una conversación que ya se cerró.
 */
describe('🔴 el mensaje armado va sólo en la bandeja', () => {
  const pantalla2 = readFileSync(join(__dirname, '..', 'components/envios/Envios.tsx'), 'utf8')

  it('🔴 la hoja del día monta `Direccion` SIN el mensaje, y la bandeja CON', () => {
    // El mutante es prender `conMensaje` en las dos, que es como estaba: el botón de la hoja del día
    // vuelve a llevar un texto que propone días sobre un envío que ya tiene el suyo.
    const hoja = pantalla2.slice(pantalla2.indexOf('const delTurno'), pantalla2.indexOf('function Pendientes('))
    const bandeja = pantalla2.slice(pantalla2.indexOf('function Pendientes('), pantalla2.indexOf('function SugerirPrecios('))
    expect(hoja).toContain('<Direccion envio={e} />')
    expect(bandeja).toContain('<Direccion envio={e} conMensaje />')
  })

  it('🔴 y sin el prop no se arma: el default es NO tener mensaje', () => {
    // Que el default sea el caso seguro es lo que hace que una pantalla nueva que monte `Direccion`
    // no le mande a una clienta un texto que nadie decidió mandar.
    const direccion = pantalla2.slice(pantalla2.indexOf('function Direccion('), pantalla2.indexOf('function ResumenPedido('))
    expect(direccion).toMatch(/conMensaje = false/)
    expect(direccion).toMatch(/conMensaje \? mensajeParaLaClienta/)
  })
})

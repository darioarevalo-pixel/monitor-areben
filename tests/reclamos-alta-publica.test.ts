import { describe, it, expect } from 'vitest'
import {
  OPCIONES_PUBLICAS, SIN_PUERTA_PUBLICA, altaBienFormada, fotosEnElAlta, itemsDelAlta,
  motivoDeAlta, opcionPublica, TOPE_ALTAS_POR_HORA,
} from '@/lib/reclamos/alta-publica.core.js'
import { MOTIVOS_VIGENTES } from '@/lib/reclamos/tipos'
import { PERFIL_MOTIVO as PERFILES } from '@/lib/reclamos/casos.core.js'

/** El perfil por clave. `casos.core.js` ⛔ no tiene tipos: la cara tipada vive en `tipos.ts`. */
const PERFIL_MOTIVO = PERFILES as Record<string, { fotos: string; decideCliente: boolean }>
import { readFileSync } from 'node:fs'

/**
 * **El alta pública: las cinco opciones, y con qué motivo entra cada una.**
 *
 * 🔑 Lo que se prueba acá ⛔ no son las cinco etiquetas —eso es un dato— sino **el cable**: que las
 * familias salgan de `MOTIVOS_VIGENTES` y ⛔ no de una lista escrita al lado, y que la entrada
 * respete las dos reglas duras. Un motivo nuevo sin puerta pública tiene que poner esto en rojo, ⛔
 * no quedarse afuera callado.
 */

const TODAS = OPCIONES_PUBLICAS.map((o) => o.clave)

describe('el cable: las familias salen del repertorio vigente', () => {
  it('cada motivo de cada familia es un motivo VIGENTE', () => {
    for (const o of OPCIONES_PUBLICAS) {
      for (const m of o.familia) expect(MOTIVOS_VIGENTES, `${o.clave} → ${m}`).toContain(m)
    }
  })

  it('la entrada está adentro de su propia familia', () => {
    // Una entrada que se escape de su familia es un motivo elegido a dedo, y la familia deja de
    // describir adónde puede terminar el caso.
    for (const o of OPCIONES_PUBLICAS) expect(o.familia, o.clave).toContain(o.entra)
  })

  it('todo motivo vigente tiene puerta pública, o está NOMBRADO como sin puerta', () => {
    // 🔴 Éste es el que se pone rojo el día que alguien agregue un motivo: o le da una puerta, o
    // dice por qué no la tiene. Lo que ⛔ no puede pasar es que se quede afuera sin que nadie lo
    // decida.
    const conPuerta = new Set(OPCIONES_PUBLICAS.flatMap((o) => o.familia))
    const nombrados = new Set(Object.keys(SIN_PUERTA_PUBLICA))
    for (const m of MOTIVOS_VIGENTES) {
      expect(conPuerta.has(m) || nombrados.has(m), `${m} no tiene puerta pública ni está nombrado en SIN_PUERTA_PUBLICA`).toBe(true)
    }
  })

  it('lo nombrado como SIN puerta efectivamente no tiene ninguna', () => {
    // Al revés que el anterior: si a `sin_stock` alguien le abre una puerta y se olvida de sacarlo
    // de la lista, la excusa escrita queda mintiendo.
    const conPuerta = new Set(OPCIONES_PUBLICAS.flatMap((o) => o.familia))
    for (const m of Object.keys(SIN_PUERTA_PUBLICA)) expect(conPuerta.has(m), m).toBe(false)
  })

  it('las claves y las etiquetas no se repiten', () => {
    expect(new Set(TODAS).size).toBe(TODAS.length)
    const labels = OPCIONES_PUBLICAS.map((o) => o.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('ninguna familia comparte motivo con otra', () => {
    // Dos opciones que lleven al mismo motivo hacen que la elección del cliente deje de medir nada.
    const vistos = new Set<string>()
    for (const o of OPCIONES_PUBLICAS) {
      for (const m of o.familia) {
        expect(vistos.has(m), `${m} está en dos familias`).toBe(false)
        vistos.add(m)
      }
    }
  })
})

describe('🔴 la regla dura: un toque ⛔ no enciende trabajo que nadie decidió', () => {
  /**
   * Los dos motivos que `crear` (`api/_reclamos.js`) hace nacer con un pendiente prendido. Se leen
   * **del archivo**, ⛔ no de una lista acá: si mañana otro motivo nace con un pendiente y esta
   * lista fuera a mano, el test seguiría verde mientras la puerta pública empieza a repartir
   * tareas.
   */
  const fuente = readFileSync(new URL('../api/_reclamos.js', import.meta.url), 'utf8')

  it('el archivo sigue teniendo las dos reglas que este test vigila', () => {
    // 🔑 El ancla: si `crear` cambia de forma, esto avisa en vez de quedarse mirando un texto que
    // ya no existe — que es como un guard se queda verde para siempre.
    expect(fuente).toContain("motivo === 'no_llego' ? 'pendiente' : 'no_aplica'")
    expect(fuente).toContain("const sinStock = motivo === 'sin_stock'")
  })

  it('ninguna opción entra por un motivo que nace con un pendiente', () => {
    for (const o of OPCIONES_PUBLICAS) {
      expect(o.entra, `${o.clave} entra por ${o.entra}`).not.toBe('no_llego')
      expect(o.entra, `${o.clave} entra por ${o.entra}`).not.toBe('sin_stock')
    }
  })

  it('«todavía no me llegó» entra por demora, y no_llego queda en su familia', () => {
    // El caso concreto: es el más fácil de escribir mal, porque la etiqueta y el motivo se llaman
    // casi igual.
    const o = opcionPublica('no_llego')!
    expect(o.entra).toBe('demora')
    expect(o.familia).toContain('no_llego')
  })

  it('el escenario ⛔ no se toca desde la puerta pública', () => {
    // Es lo que determina la plata en tres casos. Ninguna opción lo escribe, ni siquiera de paso.
    for (const o of OPCIONES_PUBLICAS) expect(Object.keys(o)).not.toContain('escenario')
  })
})

describe('con qué motivo entra cada una', () => {
  it('motivoDeAlta contesta el motivo de entrada', () => {
    expect(motivoDeAlta('fallado')).toBe('falla')
    expect(motivoDeAlta('no_esperaba')).toBe('no_esperaba')
    expect(motivoDeAlta('talle')).toBe('talle')
    expect(motivoDeAlta('falta_algo')).toBe('faltante')
    expect(motivoDeAlta('no_llego')).toBe('demora')
  })

  it('una clave inventada ⛔ no abre nada', () => {
    expect(motivoDeAlta('sin_stock')).toBe(null)
    expect(motivoDeAlta('')).toBe(null)
    expect(motivoDeAlta(null)).toBe(null)
    expect(opcionPublica('__x__')).toBe(null)
  })

  it('«no es lo que esperaba» ⛔ no entra afirmando culpa nuestra', () => {
    // `no_como_publicado` la decidimos NOSOTROS con la ficha delante (`decideCliente: false`), y su
    // escenario objetivo regala el envío. Que lo afirme un toque es plata.
    const o = opcionPublica('no_esperaba')!
    expect(o.entra).toBe('no_esperaba')
    expect(PERFIL_MOTIVO['no_como_publicado'].decideCliente).toBe(false)
    expect(o.familia).toContain('no_como_publicado')
  })
})

describe('las fotos, derivadas del perfil que ya existe', () => {
  it('a quien ⛔ no recibió el paquete ⛔ no se le piden', () => {
    expect(fotosEnElAlta('no_llego')).toBe('no')
    expect(PERFIL_MOTIVO['demora'].fotos).toBe('nunca')
  })

  it('donde la foto ES la prueba, se exige', () => {
    expect(fotosEnElAlta('fallado')).toBe('exige')
  })

  it('en el resto se ofrece y ⛔ no traba', () => {
    expect(fotosEnElAlta('talle')).toBe('ofrece')
    expect(fotosEnElAlta('no_esperaba')).toBe('ofrece')
    expect(fotosEnElAlta('falta_algo')).toBe('ofrece')
  })

  it('sale del perfil y ⛔ no de una lista al lado', () => {
    // El cable: cambiarle las fotos a un motivo tiene que moverse hasta acá solo.
    for (const o of OPCIONES_PUBLICAS) {
      const pide = PERFIL_MOTIVO[o.entra].fotos
      const esperado = pide === 'nunca' ? 'no' : pide === 'siempre' ? 'exige' : 'ofrece'
      expect(fotosEnElAlta(o.clave), o.clave).toBe(esperado)
    }
  })

  it('una clave inventada ⛔ no pide fotos de nada', () => {
    expect(fotosEnElAlta('__x__')).toBe('no')
  })
})

describe('la forma del pedido: falla cerrado', () => {
  const bueno = { orden: '21033', mail: 'Victoria@Gmail.com', opcion: 'talle', productos: [0] }

  it('el pedido completo pasa', () => {
    expect(altaBienFormada(bueno).ok).toBe(true)
  })

  it('cada cosa que falta lo cierra', () => {
    expect(altaBienFormada(null).ok).toBe(false)
    expect(altaBienFormada({ ...bueno, orden: '' }).ok).toBe(false)
    expect(altaBienFormada({ ...bueno, orden: 'abc' }).ok).toBe(false)
    expect(altaBienFormada({ ...bueno, mail: 'victoria' }).ok).toBe(false)
    expect(altaBienFormada({ ...bueno, mail: '' }).ok).toBe(false)
    expect(altaBienFormada({ ...bueno, opcion: 'sin_stock' }).ok).toBe(false)
    expect(altaBienFormada({ ...bueno, productos: [] }).ok).toBe(false)
    expect(altaBienFormada({ ...bueno, productos: 'todos' }).ok).toBe(false)
  })

  it('un índice que ⛔ no es un entero positivo no pasa', () => {
    // Sin esto, un `-1` o un `'0'` llegan hasta el `productos[i]` del armado.
    expect(altaBienFormada({ ...bueno, productos: [-1] }).ok).toBe(false)
    expect(altaBienFormada({ ...bueno, productos: [1.5] }).ok).toBe(false)
    expect(altaBienFormada({ ...bueno, productos: ['0'] }).ok).toBe(false)
    expect(altaBienFormada({ ...bueno, productos: [0, 0] }).ok).toBe(false)
  })

  it('el motivo del NO ⛔ no viaja: es para el log', () => {
    // Las razones de un «no» tienen que verse iguales desde afuera. Acá se fija que el motivo
    // exista para el servidor —y que el handler ⛔ no lo devuelva lo fija el test del handler.
    expect(altaBienFormada({ ...bueno, opcion: 'x' }).motivo).toBe('opcion-desconocida')
    expect(altaBienFormada({ ...bueno, mail: 'x' }).motivo).toBe('mail-mal-formado')
  })
})

describe('🔴 los ítems salen de la orden verificada, ⛔ nunca del body', () => {
  const orden = {
    number: 21033,
    cliente: 'Victoria',
    products: [
      { product_id: 111, variant_id: 222, name: 'Funda Girlhood', sku: 'GH-01', quantity: 1 },
      { product_id: 333, variant_id: 444, name: 'Funda Stellar', sku: 'ST-02', quantity: 2 },
    ],
  }

  it('el índice señala un producto de la orden', () => {
    const items = itemsDelAlta(orden, [1])!
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      sku: 'ST-02', tn_product_id: '333', variant_id: '444', producto: 'Funda Stellar', cantidad: 2,
    })
  })

  it('⛔ sin un solo monto', () => {
    // La orden verificada tampoco los trae, pero si mañana los trajera esto ⛔ no puede empezar a
    // guardarlos: por la puerta pública ⛔ no viaja plata.
    const items = itemsDelAlta({ ...orden, products: orden.products.map((p) => ({ ...p, price: '19999' })) }, [0])!
    expect(Object.keys(items[0]).sort()).toEqual(['cantidad', 'producto', 'sku', 'tn_product_id', 'variant_id'])
  })

  it('🔴 un índice que ⛔ no existe se cae, ⛔ no se saltea', () => {
    // Saltearlo callado crearía el reclamo con MENOS productos de los que la persona tocó.
    expect(itemsDelAlta(orden, [0, 9])).toBe(null)
    expect(itemsDelAlta(orden, [5])).toBe(null)
  })

  it('una orden sin productos ⛔ no arma nada', () => {
    expect(itemsDelAlta({ ...orden, products: [] }, [0])).toBe(null)
    expect(itemsDelAlta(null, [0])).toBe(null)
  })

  it('el orden de los ítems es el que tocó la persona', () => {
    expect(itemsDelAlta(orden, [1, 0])!.map((i) => i.sku)).toEqual(['ST-02', 'GH-01'])
  })
})

describe('el fusible', () => {
  it('es un número que ⛔ no se cruza reclamando de verdad', () => {
    // 📊 BDI hizo 283 ventas online en agosto de 2026: ~9 por día. Veinte reclamos en una hora ⛔ no
    // es demanda.
    expect(TOPE_ALTAS_POR_HORA).toBeGreaterThan(9)
    expect(TOPE_ALTAS_POR_HORA).toBeLessThan(100)
  })
})

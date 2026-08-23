import { describe, it, expect } from 'vitest'
import {
  claveDeTexto,
  comoSeConto,
  filaDe,
  porQueVacio,
  rankear,
  validarPedido,
  ventanaDeDias,
} from '@/lib/pedidos-clientes/core'
import type { PedidoCliente } from '@/lib/pedidos-clientes/tipos'

/**
 * El núcleo de Faltantes.
 *
 * Lo que se defiende acá no es «la función devuelve lo que dice»: es que **el número que decide una
 * compra signifique algo**. Los dos modos de falla son opuestos y sólo uno se ve:
 *
 *   - Agrupar de menos parte «funda iphone 15» en tres renglones de 1 y el ranking dice que nadie
 *     pide nada. Se nota: la lista se lee y los tres renglones están a la vista.
 *   - Agrupar de más suma dos productos distintos en un renglón. **No se nota nunca**, porque el
 *     número queda plausible y nadie tiene con qué contrastarlo.
 *
 * Por eso hay tests de las dos puntas de `claveDeTexto`, y no sólo de la que el pedido pedía.
 */

const ahora = Date.parse('2026-08-23T12:00:00.000Z')
const hace = (dias: number, horas = 0) => new Date(ahora - dias * 86400000 - horas * 3600000).toISOString()

let n = 0
function pedido(p: Partial<PedidoCliente>): PedidoCliente {
  n += 1
  return {
    id: `p${n}`,
    store: 'bdi',
    texto: 'funda iphone 15',
    tipo: 'no_trabajamos',
    canal: 'local',
    cliente: null,
    estado: 'pedido',
    nota: null,
    creado_en: hace(1),
    creado_por: 'Alguien',
    ...p,
  }
}

describe('claveDeTexto: qué cuenta como el mismo producto', () => {
  // El caso literal de la verificación del plan: las tres formas de escribir lo mismo.
  it('junta las tres formas en que se escribe un mismo pedido', () => {
    const claves = ['fundas iphone 15', 'Funda iPhone15', 'funda para iphone 15'].map(claveDeTexto)
    expect(new Set(claves).size).toBe(1)
  })

  it('no le importa el orden de las palabras', () => {
    expect(claveDeTexto('funda iphone 15')).toBe(claveDeTexto('iphone 15 funda'))
  })

  it('no le importan las tildes ni las mayúsculas', () => {
    expect(claveDeTexto('Camisón Rosa')).toBe(claveDeTexto('camison rosa'))
  })

  /**
   * 🔴 **La punta que importa: NO junta productos distintos.** Sin este test, «agrupar más» siempre
   * parece mejor y la regla se afloja de a poco hasta que el ranking suma dos modelos en uno.
   */
  it('NO junta dos modelos distintos', () => {
    expect(claveDeTexto('funda iphone 15')).not.toBe(claveDeTexto('funda iphone 14'))
    expect(claveDeTexto('corset negro')).not.toBe(claveDeTexto('corset blanco'))
  })

  /**
   * El modo de falla ELEGIDO, escrito como test para que no se «arregle» sin decidirlo.
   *
   * `colores` no cae en `color` porque el singular es a lo bruto (una `s` final) y no la regla del
   * español, que rompería `iphones` → `iphon`. Sub-agrupar se ve en la lista; sobre-agrupar, no.
   */
  it('deja «colores» y «color» en dos grupos, y ése es el precio pagado a propósito', () => {
    expect(claveDeTexto('colores')).not.toBe(claveDeTexto('color'))
    expect(claveDeTexto('iphones')).toBe(claveDeTexto('iphone'))
  })

  it('un texto sin ninguna palabra devuelve vacío, que el llamador cuenta aparte', () => {
    expect(claveDeTexto('???')).toBe('')
    expect(claveDeTexto('   ')).toBe('')
    expect(claveDeTexto(null as unknown as string)).toBe('')
  })
})

describe('ventanaDeDias', () => {
  it('mide para atrás desde el «ahora» que le pasan', () => {
    const v = ventanaDeDias(30, ahora)
    expect(v.hasta).toBe(ahora)
    expect(v.desde).toBe(ahora - 30 * 86400000)
    expect(v.dias).toBe(30)
  })

  it('nunca devuelve una ventana de cero días', () => {
    expect(ventanaDeDias(0, ahora).dias).toBe(1)
    expect(ventanaDeDias(-5, ahora).dias).toBe(1)
  })
})

describe('rankear: el agregado, que es para lo que existe la sección', () => {
  const v30 = ventanaDeDias(30, ahora)

  it('cuenta como uno lo que se escribió de tres formas', () => {
    const r = rankear(
      [
        pedido({ texto: 'fundas iphone 15' }),
        pedido({ texto: 'Funda iPhone15' }),
        pedido({ texto: 'funda para iphone 15' }),
      ],
      v30,
    )
    expect(r.grupos).toHaveLength(1)
    expect(r.grupos[0].total).toBe(3)
    expect(r.contadas).toBe(3)
  })

  it('ordena por cantidad y, empatados, arriba el más reciente', () => {
    const r = rankear(
      [
        pedido({ texto: 'corset', creado_en: hace(10) }),
        pedido({ texto: 'corset', creado_en: hace(9) }),
        pedido({ texto: 'body', creado_en: hace(1) }),
        pedido({ texto: 'tanga', creado_en: hace(5) }),
      ],
      v30,
    )
    expect(r.grupos.map((g) => g.etiqueta)).toEqual(['corset', 'body', 'tanga'])
  })

  /**
   * 🔑 El ranking mide **demanda**, no trabajo pendiente: que después lo hayamos conseguido no borra
   * que nos lo pidieron seis veces. Lo pendiente va al lado, en su contador.
   */
  it('cuenta también lo ya conseguido y lo descartado, y los separa al lado', () => {
    const r = rankear(
      [
        pedido({ texto: 'body', estado: 'conseguido' }),
        pedido({ texto: 'body', estado: 'descartado' }),
        pedido({ texto: 'body', estado: 'pedido' }),
      ],
      v30,
    )
    expect(r.grupos[0].total).toBe(3)
    expect(r.grupos[0].pendientes).toBe(1)
    expect(r.grupos[0].conseguidos).toBe(1)
    expect(r.grupos[0].descartados).toBe(1)
  })

  it('parte cada grupo en las dos razones por las que faltó', () => {
    const r = rankear(
      [
        pedido({ texto: 'body', tipo: 'sin_stock' }),
        pedido({ texto: 'body', tipo: 'sin_stock' }),
        pedido({ texto: 'body', tipo: 'no_trabajamos' }),
      ],
      v30,
    )
    expect(r.grupos[0].porTipo).toEqual({ sin_stock: 2, no_trabajamos: 1 })
  })

  it('la etiqueta es el texto más repetido, tal como lo escribieron', () => {
    const r = rankear(
      [
        pedido({ texto: 'Funda iPhone 15', creado_en: hace(3) }),
        pedido({ texto: 'funda iphone15', creado_en: hace(2) }),
        pedido({ texto: 'Funda iPhone 15', creado_en: hace(1) }),
      ],
      v30,
    )
    expect(r.grupos[0].etiqueta).toBe('Funda iPhone 15')
  })

  it('empatadas dos formas de escribirlo, gana la más reciente', () => {
    const r = rankear(
      [
        pedido({ texto: 'clear case', creado_en: hace(4) }),
        pedido({ texto: 'funda transparente', creado_en: hace(1) }),
      ],
      v30,
    )
    // Las dos aparecen una vez; la etiqueta es la última que se usó.
    expect(r.grupos.map((g) => g.etiqueta)).toContain('funda transparente')
  })

  it('junta los canales por los que llegó, sin repetir', () => {
    const r = rankear(
      [
        pedido({ texto: 'body', canal: 'instagram' }),
        pedido({ texto: 'body', canal: 'local' }),
        pedido({ texto: 'body', canal: 'instagram' }),
      ],
      v30,
    )
    expect(r.grupos[0].canales).toEqual(['local', 'instagram'])
  })
})

/**
 * 🔴 Lo que queda AFUERA del número. Sin estos contadores, un ranking vacío afirma «no piden nada»
 * cuando lo que pasó puede ser «lo cargado es más viejo que la ventana».
 */
describe('rankear: lo que no entra se cuenta y se dice', () => {
  const v30 = ventanaDeDias(30, ahora)

  it('deja afuera lo anterior a la ventana y lo cuenta', () => {
    const r = rankear([pedido({ creado_en: hace(45) }), pedido({ creado_en: hace(2) })], v30)
    expect(r.contadas).toBe(1)
    expect(r.fueraDeVentana).toBe(1)
  })

  // Las dos puntas del borde: el mismo dato entra o no entra según de qué lado caiga, y es
  // exactamente donde una ventana mal medida no falla, sólo cuenta distinto.
  it('el borde de la ventana es inclusivo, y un milisegundo antes ya está afuera', () => {
    const justo = new Date(v30.desde).toISOString()
    const unPocoAntes = new Date(v30.desde - 1).toISOString()
    expect(rankear([pedido({ creado_en: justo })], v30).contadas).toBe(1)
    expect(rankear([pedido({ creado_en: unPocoAntes })], v30).contadas).toBe(0)
    expect(rankear([pedido({ creado_en: unPocoAntes })], v30).fueraDeVentana).toBe(1)
  })

  it('lo que no tiene fecha legible no cae en ninguna ventana, y se dice', () => {
    const r = rankear([pedido({ creado_en: 'cualquier cosa' })], v30)
    expect(r.contadas).toBe(0)
    expect(r.sinFecha).toBe(1)
  })

  it('lo que no se puede agrupar no inventa un grupo vacío', () => {
    const r = rankear([pedido({ texto: '???' }), pedido({ texto: 'body' })], v30)
    expect(r.grupos).toHaveLength(1)
    expect(r.sinClave).toBe(1)
  })
})

describe('lo que la pantalla afirma', () => {
  const v30 = ventanaDeDias(30, ahora)

  it('«cómo se contó» dice la ventana, las observaciones y lo que quedó afuera', () => {
    const r = rankear([pedido({ creado_en: hace(2) }), pedido({ creado_en: hace(60) })], v30)
    const linea = comoSeConto(r)
    expect(linea).toContain('1 pedido en 30 días')
    expect(linea).toContain('agrupados en 1 producto')
    expect(linea).toContain('1 más viejos, afuera')
  })

  /**
   * 🔴 **El cero afirma.** Tres vacíos que se ven iguales y significan cosas distintas: la decisión
   * que sigue a cada uno es otra (ir a cargar / ampliar la ventana / mirar el filtro).
   */
  it('un vacío sin nada cargado dice que nadie está anotando, no que nadie pide', () => {
    const r = rankear([], v30)
    expect(porQueVacio(r, 0)).toContain('no se están anotando')
  })

  it('un vacío con cosas viejas manda a ampliar la ventana y dice cuántas hay', () => {
    const r = rankear([pedido({ creado_en: hace(90) })], v30)
    const texto = porQueVacio(r, 1)
    expect(texto).toContain('1 anotados de antes')
    expect(texto).toContain('30 días')
  })

  it('un vacío con datos en la ventana pero filtrados no culpa a nadie', () => {
    const r = rankear([], v30)
    expect(porQueVacio(r, 5)).toContain('filtro')
  })
})

describe('validarPedido y filaDe: lo que entra a la base', () => {
  it('sólo el texto es obligatorio', () => {
    expect(validarPedido({ store: 'bdi', texto: 'body de encaje' })).toBeNull()
  })

  it('rechaza lo que la base no acepta', () => {
    expect(validarPedido({ store: 'otra', texto: 'x y z' })).toContain('store')
    expect(validarPedido({ store: 'bdi', texto: '' })).toContain('qué te pidieron')
    expect(validarPedido({ store: 'bdi', texto: 'body', tipo: 'inventado' })).toContain('tipo')
    expect(validarPedido({ store: 'bdi', texto: 'body', canal: 'paloma' })).toContain('canal')
    expect(validarPedido({ store: 'bdi', texto: 'body', estado: 'ninguno' })).toContain('estado')
  })

  // La fila que se guarda bien, se ve bien en la lista, y no entra en ningún grupo del ranking.
  it('rechaza un texto que no deja ninguna palabra para agrupar', () => {
    expect(validarPedido({ store: 'bdi', texto: '???' })).toContain('ninguna palabra')
  })

  it('guarda el texto como lo escribieron y pone los defaults', () => {
    const f = filaDe({ store: 'BDI', texto: '  Funda iPhone 15  ' }, 'Sofi', '2026-08-23T12:00:00.000Z')
    expect(f.texto).toBe('Funda iPhone 15')
    expect(f.store).toBe('bdi')
    expect(f.tipo).toBe('no_trabajamos')
    expect(f.canal).toBe('local')
    expect(f.estado).toBe('pedido')
    expect(f.creado_por).toBe('Sofi')
  })

  /** La firma sale del perfil y nunca del body: es lo que permite volver a preguntarle a quien anotó. */
  it('ignora un creado_por mandado desde el cliente', () => {
    const f = filaDe({ store: 'bdi', texto: 'body', creado_por: 'Otro' }, 'Sofi', '2026-08-23T12:00:00.000Z')
    expect(f.creado_por).toBe('Sofi')
  })

  it('un tipo o un canal inventado cae al default en vez de viajar a la base', () => {
    const f = filaDe({ store: 'bdi', texto: 'body', tipo: 'x', canal: 'y', estado: 'z' }, null, '2026-08-23T12:00:00.000Z')
    expect(f.tipo).toBe('no_trabajamos')
    expect(f.canal).toBe('local')
    expect(f.estado).toBe('pedido')
  })
})

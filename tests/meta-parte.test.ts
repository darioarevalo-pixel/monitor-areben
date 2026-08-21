import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FUNNEL, TIPO_FUNNEL } from '@/lib/meta-ads/metricas'
import {
  cruzarConLaCaja, limpiar, marginalEntreVentanas, porConjunto, renderParte, veredicto,
  type FilaAviso,
} from '@/lib/meta-ads/parte'

/**
 * El PARTE DE PAUTA. Este archivo son sus PRIMEROS tests: el núcleo se escribió el 18-ago-2026 y
 * estuvo tres días sin commitear, sin endpoint y **sin una sola prueba**.
 *
 * 🔑 **Lo que se prueba acá no es el formato, es lo que el formato afirma.** Un parte es un texto
 * que alguien lee para mover plata: una columna corrida, un cero donde va un vacío o un marginal
 * negativo se leen todos como números y ninguno falla.
 */

/** Una fila de aviso con lo mínimo, para no repetir doce campos en cada caso. */
const aviso = (o: Partial<FilaAviso> = {}): FilaAviso => ({
  aviso: 'AD01', conjunto: 'CONJ A', campania: 'CAMP', linea: 'bdi', tipo: 'OUTCOME_SALES',
  estado: 'ACTIVE', gasto: 1000, compras: 1, revenue: 3000, impresiones: 1000, clics: 10,
  ctr: 1, cpm: 1000, carritos: 5, checkouts: 2, lpv: 8, ...o,
})

describe('limpiar — los caracteres que cortan el transporte', () => {
  it('el `&` se reemplaza por «y» y el nombre sigue siendo reconocible', () => {
    // Medido el 18-ago-2026: un `&` en el nombre de un aviso hace que el puente del navegador corte
    // la respuesta ENTERA con «BLOCKED: Cookie/query string data». Un análisis perdió seis filas.
    expect(limpiar('AD 1 - SWEATERS & FITS')).toBe('AD 1 - SWEATERS y FITS')
  })

  it('el `|` se va porque es el separador: si sobrevive, parte la fila en dos', () => {
    expect(limpiar('A|B')).toBe('A/B')
    expect(limpiar('A|B').includes('|')).toBe(false)
  })
})

describe('veredicto — «todavía no vendió» no es lo mismo que «no vende»', () => {
  it('sin compras y por debajo del techo: MIDIENDO', () => {
    expect(veredicto(800, 0, 9000)).toBe('MIDIENDO')
  })

  it('🔴 sin compras y PASADO el techo: ALTO, que es un hecho probado y no una espera', () => {
    // Un conjunto con $12.000 adentro y cero compras ya compró cero compras a un precio infinito.
    expect(veredicto(12000, 0, 9000)).toBe('ALTO')
  })

  it('⛔ sin techo NO inventa un default: contesta `?`', () => {
    // Un techo inventado se lee igual que uno medido y decide plata.
    expect(veredicto(12000, 0, 0)).toBe('?')
    expect(veredicto(12000, 3, undefined)).toBe('?')
  })
})

describe('porConjunto — el estado es el del aviso MÁS VIVO', () => {
  it('un conjunto con un aviso activo y dos pausados está ACTIVE, venga en el orden que venga', () => {
    // Leer el primero lo daría por muerto según en qué orden llegaran las filas, que es la clase de
    // dato que cambia solo entre dos lecturas de la misma cuenta.
    const g = porConjunto([
      aviso({ aviso: 'a', estado: 'PAUSED' }),
      aviso({ aviso: 'b', estado: 'ACTIVE' }),
      aviso({ aviso: 'c', estado: 'PAUSED' }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].estado).toBe('ACTIVE')
    expect(g[0].gasto).toBe(3000)
  })
})

describe('cruzarConLaCaja — las dos versiones del mismo hecho', () => {
  const serie = [
    { fecha: '2026-08-17', gasto: 34552, compras: 6 },
    { fecha: '2026-08-19', gasto: 60840, compras: 16 },
  ]

  it('la atribución sale de los pedidos REALES, no de las compras de Meta', () => {
    const c = cruzarConLaCaja(serie, { '2026-08-17': 15, '2026-08-19': 18 })
    expect(c[0].atrib).not.toBeNull()
    expect(Math.round(c[0].atrib!)).toBe(40)
    expect(Math.round(c[1].atrib!)).toBe(89)
  })

  it('🔴 el caso del 20-ago: Meta MEJORA y la caja EMPEORA, y las dos columnas lo muestran', () => {
    const c = cruzarConLaCaja(serie, { '2026-08-17': 15, '2026-08-19': 18 })
    expect(Math.round(c[1].costoCompraMeta)).toBeLessThan(Math.round(c[0].costoCompraMeta))
    expect(Math.round(c[1].costoPedidoReal)).toBeGreaterThan(Math.round(c[0].costoPedidoReal))
  })

  it('⛔ sin pedidos reales la atribución es `null`, NO 0', () => {
    // Un 0% se lee como «Meta no vio nada», que es una afirmación. `null` es «no se puede saber».
    const c = cruzarConLaCaja([{ fecha: '2026-08-20', gasto: 5000, compras: 2 }], {})
    expect(c[0].atrib).toBeNull()
  })

  it('🔴 corta en el último día CERRADO: el día en curso NO entra', () => {
    // Salió de correr el parte contra la pauta real el 21-ago-2026: el día en curso entraba con
    // medio día de gasto (4 pedidos, $4.983) y arrastraba para abajo el promedio de la ÚLTIMA
    // ventana, que es la que se resta contra la anterior para sacar el marginal.
    // ⛔ Cortar «donde la tienda tenga datos» no alcanza: a las 17 h la tienda ya tiene pedidos.
    const conHoy = [...serie, { fecha: '2026-08-21', gasto: 4983, compras: 3 }]
    expect(cruzarConLaCaja(conHoy, { '2026-08-21': 4 })).toHaveLength(3)
    expect(cruzarConLaCaja(conHoy, { '2026-08-21': 4 }, '2026-08-20')).toHaveLength(2)
  })

  it('🔴 un costo sin denominador va VACÍO, no en 0 — un 0 ahí se lee «gratis»', () => {
    const t = renderParte({
      caja: cruzarConLaCaja([{ fecha: '2026-08-05', gasto: 7061, compras: 0 }], { '2026-08-05': 4 }),
      techos: { bdi: 7093 },
    })
    const fila = t.split('\n').find((l) => l.startsWith('2026-08-05|'))!
    // pedidos 4 con $7.061 => $1.765 el pedido; compras 0 => la celda del costo por compra VACÍA.
    expect(fila.split('|')).toEqual(['2026-08-05', '4', '7061', '1765', '0', '', '0'])
  })

  it('una atribución de más del 100% NO se recorta', () => {
    // Meta atribuye a 7 días al clic: una compra de hoy puede venir de un clic de anteayer.
    const c = cruzarConLaCaja([{ fecha: '2026-08-20', gasto: 5000, compras: 12 }], { '2026-08-20': 10 })
    expect(Math.round(c[0].atrib!)).toBe(120)
  })
})

describe('marginalEntreVentanas — el número que decide si conviene seguir escalando', () => {
  /** 14 días: la primera semana barata, la segunda escalando. */
  const catorce = (gastos: number[], pedidos: number[]) =>
    gastos.map((g, i) => ({ fecha: `2026-08-${String(i + 6).padStart(2, '0')}`, gasto: g, pedidos: pedidos[i] }))

  it('mide el pedido que se SUMÓ, no el promedio — y el promedio se ve mejor', () => {
    const c = catorce(
      [10912, 10912, 10912, 10912, 10912, 10912, 10912, 43100, 43100, 43100, 43100, 43100, 43100, 43100],
      [9, 9, 9, 9, 9, 9, 9, 14, 14, 14, 14, 14, 14, 14],
    )
    const m = marginalEntreVentanas(c, 7)
    expect(m.marginal).not.toBeNull()
    expect(Math.round(m.marginal!)).toBe(Math.round((43100 - 10912) / (14 - 9)))
    // El promedio de la última ventana es MUCHO más barato que el marginal: ése es todo el punto.
    expect(m.b!.costoPedido).toBeLessThan(m.marginal!)
  })

  it('🔴 si los pedidos NO subieron devuelve null con motivo, y no un costo negativo', () => {
    // Con Δpedidos negativo la división da un número que se lee perfecto: un costo negativo en una
    // tabla de costos se lee como «cada pedido nuevo te devuelve plata».
    const c = catorce(
      [10000, 10000, 10000, 10000, 10000, 10000, 10000, 40000, 40000, 40000, 40000, 40000, 40000, 40000],
      [14, 14, 14, 14, 14, 14, 14, 9, 9, 9, 9, 9, 9, 9],
    )
    const m = marginalEntreVentanas(c, 7)
    expect(m.marginal).toBeNull()
    expect(m.motivo).toMatch(/no subieron/)
  })

  it('🔴 si el gasto no subió tampoco hay escalón que medir', () => {
    const c = catorce(
      [40000, 40000, 40000, 40000, 40000, 40000, 40000, 10000, 10000, 10000, 10000, 10000, 10000, 10000],
      [9, 9, 9, 9, 9, 9, 9, 14, 14, 14, 14, 14, 14, 14],
    )
    expect(marginalEntreVentanas(c, 7).marginal).toBeNull()
  })

  it('⛔ con menos de dos ventanas completas no inventa: dice cuántos días le faltan', () => {
    const m = marginalEntreVentanas(catorce([1, 2, 3], [1, 2, 3]).slice(0, 3), 7)
    expect(m.marginal).toBeNull()
    expect(m.motivo).toMatch(/hacen falta 14 dias y hay 3/)
  })
})

describe('renderParte — lo que el texto afirma', () => {
  const base = {
    hoy: [aviso(), aviso({ aviso: 'AD02', conjunto: 'CONJ B', gasto: 500, compras: 0, carritos: 4 })],
    ayer: [aviso({ gasto: 900 }), aviso({ conjunto: 'CONJ MUERTO', gasto: 2000, compras: 0 })],
    serie: [{ fecha: '2026-08-20', gasto: 1500, compras: 1, revenue: 3000 }],
    techos: { bdi: 7093 },
    techosDiarios: { 'CONJ A': 3500, 'CONJ B': 1500 },
    caja: cruzarConLaCaja([{ fecha: '2026-08-20', gasto: 1500, compras: 1 }], { '2026-08-20': 3 }),
    meta: { cuenta: '1145878766790149', hoy: '2026-08-21', ayer: '2026-08-20' },
  }

  /**
   * Cada bloque, con la cantidad de columnas de su ENCABEZADO y la de cada fila de datos.
   *
   * ⚠️ La primera versión de esto guardaba sólo las filas y las comparaba entre sí: pasaba siempre,
   * porque un encabezado con una columna de más y todas las filas cortas es consistente consigo
   * mismo. El encabezado tiene que salir del mapa como un valor aparte o el test no puede fallar.
   */
  function columnasPorBloque(texto: string): Record<string, { cab: number; filas: number[] }> {
    const out: Record<string, { cab: number; filas: number[] }> = {}
    let bloque = ''
    for (const l of texto.split('\n')) {
      if (l.startsWith('## ')) { bloque = l.slice(3); continue }
      if (!bloque || !l.includes('|') || l.startsWith('#') || l.startsWith('⚠')) continue
      const n = l.split('|').length
      if (!out[bloque]) out[bloque] = { cab: n, filas: [] }
      else out[bloque].filas.push(n)
    }
    return out
  }

  it('🔴 ninguna fila queda corrida respecto de su encabezado', () => {
    // Es la invariante que caza una columna agregada a la cabecera y olvidada en una de las filas —
    // que es exactamente lo que pasa al sumar `%techo` y no tocar la fila de los apagados. Una fila
    // corrida no falla: pone el gasto de ayer debajo del rótulo del ROAS.
    const cols = columnasPorBloque(renderParte(base))
    expect(Object.keys(cols).length).toBeGreaterThan(4)
    // Sin esto, un cambio de formato que dejara todos los bloques con una sola línea pasaría solo.
    expect(Object.values(cols).some((b) => b.filas.length > 0)).toBe(true)
    for (const [bloque, b] of Object.entries(cols)) {
      for (const n of b.filas) expect(n, `bloque «${bloque}»`).toBe(b.cab)
    }
  })

  it('el embudo por aviso llega con datos, no con ceros plausibles', () => {
    // El mutante: `adDe` proyectando 0 en carritos. El parte imprimiría una tabla entera de ceros
    // que se lee como «no hay carritos» en vez de como «el dato no se está pidiendo».
    const t = renderParte(base)
    const fila = t.split('\n').find((l) => l.startsWith('CONJ A|AD01|'))
    expect(fila).toBeTruthy()
    expect(fila!.split('|')).toContain('5') // carritos
    expect(t).toMatch(/costo_carrito/)
  })

  it('la cabecera dice que HOY es el día EN CURSO', () => {
    // Un conjunto creado hoy aparece con su primer día parcial; leerlo como «no usa el techo» da el
    // diagnóstico dado vuelta.
    expect(renderParte(base)).toMatch(/DIA EN CURSO, parcial/)
  })

  it('un conjunto que gastó ayer y hoy no, aparece — «no está» se leería como «no existe»', () => {
    expect(renderParte(base)).toMatch(/CONJ MUERTO\|.*SIN-ENTREGA-HOY/)
  })

  it('el %techo distingue «no le alcanza la caja» de «no la usa»', () => {
    const fila = renderParte(base).split('\n').find((l) => l.startsWith('bdi|OUTCOME_SALES|CONJ A|'))
    expect(fila!.split('|')).toContain('3500') // techo_dia
  })

  it('⛔ sin fila de techo guardada, la línea no se juzga contra un número inventado', () => {
    const t = renderParte({ ...base, techos: {}, lineaCaja: 'zattia' })
    expect(t).toMatch(/NO HAY FILA GUARDADA|marginal: NO SE PUEDE CALCULAR/)
  })

  it('el bloque de la caja avisa que el día en curso no está', () => {
    expect(renderParte(base)).toMatch(/el DIA EN CURSO no figura/)
  })
})


/**
 * 🔴 **Texto contra texto: el núcleo puede estar perfecto y el handler no llenar los campos.**
 *
 * `parte.core.js` es puro y sus tests lo prueban con filas que ya traen `carritos`. Quien las llena
 * es la proyección de `api/` —`adDe()` en la puerta y `filaDe()` en el handler del parte—, que corre
 * en Node sin pasar por el compilador y no se puede importar desde acá. El mutante que este bloque
 * existe para cazar es el más barato de todos: la proyección deja de nombrar un paso, el campo llega
 * `undefined`, `sumar()` lo cuenta como 0 y el parte imprime una tabla de ceros perfectamente
 * plausible que se lee como «no hubo carritos».
 */
describe('la proyección de api/ llena el embudo por aviso', () => {
  const raiz = join(__dirname, '..')
  const puerta = readFileSync(join(raiz, 'api/meta-ads.js'), 'utf8')
  const handler = readFileSync(join(raiz, 'api/_meta-parte.js'), 'utf8')

  const PASOS = ['landing_page_view', 'add_to_cart', 'initiate_checkout'] as const

  it('los tres pasos intermedios existen en FUNNEL (si no, el resto de este bloque no dice nada)', () => {
    for (const k of PASOS) expect(TIPO_FUNNEL[k], `FUNNEL no tiene ${k}`).toBeTruthy()
    expect(FUNNEL.length).toBe(5)
  })

  for (const [nombre, fuente] of [['api/meta-ads.js (adDe)', puerta], ['api/_meta-parte.js (filaDe)', handler]] as const) {
    it(`${nombre} proyecta los tres, y los pide por TIPO_FUNNEL`, () => {
      for (const k of PASOS) {
        expect(fuente, `${nombre} no proyecta ${k}`).toMatch(new RegExp(`TIPO_FUNNEL\\.${k}`))
      }
      // ⛔ Y no por su cadena a mano: dos listas de cadenas iguales en dos archivos son dos listas
      // que se van a desincronizar, y el día que pase el embudo de la cuenta y la suma de sus
      // avisos van a dar distinto sin que nada falle.
      expect(fuente).not.toMatch(/'omni_add_to_cart'/)
      expect(fuente).not.toMatch(/'omni_initiated_checkout'/)
    })
  }
})

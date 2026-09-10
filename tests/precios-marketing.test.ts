import { describe, it, expect } from 'vitest'
import {
  compartidaConMarketing, descuentoDe, desglosarInventario, esFirme, ESTADOS_VISIBLES,
  listaParaMarketing, paraMarketing, tieneVariantes,
} from '@/lib/precios/core.core.js'

/**
 * La lista blanca que separa a Marketing del costo.
 *
 * 🔴 **Lo que fija este archivo es lo único que no se ve en la pantalla**: que del ítem de una
 * campaña de liquidación ⛔ NO salga el costo. Marketing ⛔ no ve la sección `liquidacion`
 * justamente porque la foto congelada trae `costo`, `markup`, `margen` y las ventas — y la Feria de
 * Septiembre de Zattia se vende **al costo**, así que ese número es el margen entero de la casa.
 *
 * Los mutantes que tienen que caer:
 *
 *  1. `paraMarketing` devolviendo `{ ...item, ... }` en vez de campo por campo (una lista negra).
 *  2. `ESTADOS_VISIBLES` incluyendo `descartado` — 25 productos que se decidió NO vender.
 *  3. `esFirme` devolviendo `true` para `definido` — los 65 que nadie revisó pasarían por precio
 *     cerrado.
 *  4. `descuentoDe` devolviendo `0` en vez de `null` sin precio de lista.
 *  5. `compartidaConMarketing` ignorando `cerrada`.
 */

/**
 * Un ítem REAL de «Feria Septiembre 2026» (Zattia), leído de la base el 10-sep-2026.
 *
 * 🔑 Va tal cual y ⛔ no inventado: un fixture escrito a mano tiende a tener sólo los campos que uno
 * se acuerda, que son exactamente los que la lista blanca ya deja pasar. Éste trae el costo real
 * ($8.295,89) contra un precio de feria de $8.990 — o sea el caso que importa.
 */
const ITEM_REAL = {
  pid: '941566',
  estado: 'confirmado',
  foto: {
    sku: '7830',
    costo: 8295.89,
    stock: 1,
    imagen: 'https://acdn-us.mitiendanube.com/stores/004/445/369/products/body-oriana-1-2.jpg',
    nombre: 'BODY ORIANA',
    ventas7: 0,
    sinCosto: false,
    ventas30: 3,
    ventas90: 6,
    vidaUtil: null,
    promoPrevia: 13290,
    ultimaVenta: '2026-08-28',
    precioNormal: 18990,
    diasSinVender: 10,
  },
  decision: {
    nota: null,
    cuando: 1788963215682,
    margen: 7.720912124582877,
    markup: 8.366914218968668,
    pctDesc: 53,
    porQuien: 'Bruno Arevalo',
    precioSale: 8990,
  },
  revision: { cuando: 1788973395236, objecion: null, porQuien: 'Bruno Arevalo', precioAnterior: null },
  aplicacion: { aplicadoEn: null, precioEscrito: null, variantesEscritas: null, categoriaSaleAgregada: false },
}

/** Todo lo que ⛔ no puede salir de la sección, con el nombre exacto que tiene adentro del ítem. */
const PROHIBIDO = [
  'costo', 'sinCosto', 'markup', 'margen', 'promoPrevia',
  'ventas7', 'ventas30', 'ventas90', 'vidaUtil', 'ultimaVenta', 'diasSinVender',
  'decision', 'revision', 'aplicacion', 'foto', 'porQuien', 'nota', 'objecion', 'estado',
]

describe('la lista blanca: qué ve Marketing de un ítem de liquidación', () => {
  it('🔴 el costo NO sale, ni ninguno de los otros números internos', () => {
    const fila = paraMarketing(ITEM_REAL)
    for (const k of PROHIBIDO) {
      expect(Object.keys(fila), `«${k}» ⛔ no puede viajar a Marketing`).not.toContain(k)
    }
    // Y la prueba dura: el costo real ⛔ no aparece en NINGÚN valor, con cualquier nombre. Un
    // `costoUnitario` copiado a otra clave pasaría el chequeo de arriba y ⛔ no éste.
    expect(JSON.stringify(fila)).not.toContain('8295')
    expect(JSON.stringify(fila)).not.toContain('8.36')
  })

  it('y sí sale lo que hace falta para comunicarlo', () => {
    expect(paraMarketing(ITEM_REAL)).toEqual({
      pid: '941566',
      nombre: 'BODY ORIANA',
      sku: '7830',
      imagen: 'https://acdn-us.mitiendanube.com/stores/004/445/369/products/body-oriana-1-2.jpg',
      precioLista: 18990,
      precio: 8990,
      pctDesc: 53,
      firme: true,
    })
  })

  it('🔴 la lista blanca es POSITIVA: un campo nuevo en la foto ⛔ no se cuela solo', () => {
    // El día que alguien le agregue `costoReposicion` a `FotoDelMomento`, esto tiene que seguir
    // verde sin que nadie se acuerde de nada. Es la diferencia entre una lista blanca y una negra.
    const conCampoNuevo = { ...ITEM_REAL, foto: { ...ITEM_REAL.foto, costoReposicion: 9999 } }
    expect(JSON.stringify(paraMarketing(conCampoNuevo))).not.toContain('9999')
  })
})

describe('qué ítems entran a la lista', () => {
  const de = (estado: string) => ({ ...ITEM_REAL, estado })

  it('🔴 los descartados ⛔ NO se comunican: se los miró y se decidió que no van', () => {
    expect(ESTADOS_VISIBLES).not.toContain('descartado')
    expect(ESTADOS_VISIBLES).not.toContain('pendiente')
    expect([...ESTADOS_VISIBLES].sort()).toEqual(['aplicado', 'confirmado', 'definido'])
  })

  it('el reparto real de la feria: 351 entran y 25 quedan afuera', () => {
    // Los números medidos contra la base el 10-sep-2026: 286 confirmado · 65 definido · 25 descartado.
    const items = [
      ...Array.from({ length: 286 }, () => de('confirmado')),
      ...Array.from({ length: 65 }, () => de('definido')),
      ...Array.from({ length: 25 }, () => de('descartado')),
    ]
    const salida = listaParaMarketing(items) as { firme: boolean }[]
    expect(salida).toHaveLength(351)
    expect(salida.filter((i) => i.firme)).toHaveLength(286)
    expect(salida.filter((i) => !i.firme)).toHaveLength(65)
  })

  it('🔴 un `definido` ⛔ no es firme: es un precio que nadie revisó todavía', () => {
    expect(esFirme('definido')).toBe(false)
    expect(esFirme('confirmado')).toBe(true)
    // `aplicado` cuenta como firme porque para llegar ahí tuvo que estar confirmado antes.
    expect(esFirme('aplicado')).toBe(true)
  })
})

describe('el descuento', () => {
  it('usa el guardado, que es el que muestra Revisión', () => {
    expect(descuentoDe(ITEM_REAL)).toBe(53)
  })

  it('lo calcula si el ítem viejo no lo trae', () => {
    const sinPct = { ...ITEM_REAL, decision: { ...ITEM_REAL.decision, pctDesc: null } }
    // 18990 → 8990 es 52,7%.
    expect(descuentoDe(sinPct)).toBeCloseTo(52.7, 1)
  })

  it('🔴 sin precio de lista dice `null`, ⛔ NUNCA 0: un 0% afirma que el precio no bajó', () => {
    const sinLista = {
      ...ITEM_REAL,
      foto: { ...ITEM_REAL.foto, precioNormal: 0 },
      decision: { ...ITEM_REAL.decision, pctDesc: null },
    }
    expect(descuentoDe(sinLista)).toBeNull()
  })
})

describe('qué campaña ve Marketing', () => {
  const camp = (estado: string, datos: Record<string, unknown> | null) => ({ estado, datos })

  it('sólo las que alguien compartió a propósito', () => {
    expect(compartidaConMarketing(camp('en_curso', null))).toBe(false)
    expect(compartidaConMarketing(camp('en_curso', {}))).toBe(false)
    expect(compartidaConMarketing(camp('en_curso', { compartida: true }))).toBe(true)
  })

  it('una en BORRADOR con el flag también: es el caso que abrió esto', () => {
    // La feria arranca el lunes con los precios decididos y sin publicar en la tienda. Derivar el
    // permiso del estado dejaría afuera justo la campaña que hay que comunicar.
    expect(compartidaConMarketing(camp('borrador', { compartida: true }))).toBe(true)
  })

  it('🔴 pero una CERRADA no, aunque tenga el flag: sus precios ya no rigen', () => {
    expect(compartidaConMarketing(camp('cerrada', { compartida: true }))).toBe(false)
  })
})


/**
 * El desglose del stock por talle y color.
 *
 * Los mutantes que tienen que caer:
 *
 *  6. Agrupar por `store_name` **sin `trim`** — el depósito de Zattia se llama `Deposito ` con un
 *     espacio al final, así que saldría partido en dos columnas.
 *  7. Escribir `store_name === 'Local' ? 'local' : 'deposito'` — le mete el `Deposito Mayorista` de
 *     BDI adentro de «Depósito» sin que nada falle.
 *  8. Filtrar las variantes en cero adentro del núcleo — el desglose deja de sumar el total.
 *  9. `tieneVariantes` devolviendo `true` para un producto con una sola `Variante Única`.
 */
/** El núcleo es `.js` plano (lo importa el handler), así que acá se le pone la cara tipada UNA vez. */
type Desglosado = {
  porPid: Record<string, { total: number; variantes: { nombre: string; total: number; por: Record<string, number> }[] }>
  tiendas: string[]
}
const desglosar = desglosarInventario as (filas: unknown[]) => Desglosado
const hayVariantes = tieneVariantes as (d: unknown) => boolean

describe('el desglose por talle y color', () => {
  /** Filas reales de Zattia: el depósito viene con un espacio al final. */
  const ZATTIA = [
    { product_id: 1, size_name: 'Bordó - M', store_name: 'Deposito ', available_quantity: 12 },
    { product_id: 1, size_name: 'Bordó - M', store_name: 'Local', available_quantity: 2 },
    { product_id: 1, size_name: 'Verde - S', store_name: 'Deposito ', available_quantity: 48 },
    { product_id: 1, size_name: 'Verde - S', store_name: 'Local', available_quantity: 5 },
    { product_id: 1, size_name: 'Negro - XS', store_name: 'Local', available_quantity: 0 },
    { product_id: 2, size_name: 'Variante Única', store_name: 'Local', available_quantity: 3 },
  ]

  it('🔴 el depósito de Zattia viene con un ESPACIO al final y no puede salir partido en dos', () => {
    const { tiendas } = desglosar(ZATTIA)
    expect(tiendas).toEqual(['Local', 'Deposito'])
  })

  it('🔴 las tres tiendas de BDI salen las tres: el mayorista ⛔ no se mete adentro del depósito', () => {
    // Medido el 10-sep-2026: BDI tiene Local · Deposito Minorista · Deposito Mayorista, y el
    // mayorista suma −13 unidades. Aplanarlo a «depósito» pierde de qué depósito se trata.
    const { tiendas } = desglosar([
      { product_id: 9, size_name: 'M', store_name: 'Deposito Minorista', available_quantity: 4 },
      { product_id: 9, size_name: 'M', store_name: 'Deposito Mayorista', available_quantity: -2 },
      { product_id: 9, size_name: 'M', store_name: 'Local', available_quantity: 1 },
    ])
    expect(tiendas).toEqual(['Local', 'Deposito Mayorista', 'Deposito Minorista'])
  })

  it('🔴 los renglones SUMAN el total de la fila, ceros incluidos', () => {
    const { porPid } = desglosar(ZATTIA)
    const p = porPid['1']
    expect(p.total).toBe(67)
    expect(p.variantes.reduce((a, v) => a + v.total, 0)).toBe(p.total)
    // Y la que está en cero sigue estando: plegarla es de la pantalla, borrarla rompe la cuenta.
    expect(p.variantes.map((v) => v.nombre)).toContain('Negro - XS')
  })

  it('la de más unidades va primero: en una feria lo que se comunica es el talle que sobra', () => {
    const { porPid } = desglosar(ZATTIA)
    expect(porPid['1'].variantes.map((v) => v.nombre)).toEqual(['Verde - S', 'Bordó - M', 'Negro - XS'])
    expect(porPid['1'].variantes[0].por).toEqual({ Deposito: 48, Local: 5 })
  })

  it('🔴 un producto sin variantes ⛔ no se despliega: «Variante Única» no es un talle', () => {
    const { porPid } = desglosar(ZATTIA)
    expect(hayVariantes(porPid['2'])).toBe(false)
    expect(hayVariantes(porPid['1'])).toBe(true)
    // Pero su renglón sigue existiendo, porque el total tiene que cerrar igual.
    expect(porPid['2'].total).toBe(3)
  })

  it('un solo talle de verdad SÍ se despliega: saber que sólo queda la M es el dato', () => {
    const { porPid } = desglosar([
      { product_id: 3, size_name: 'M', store_name: 'Local', available_quantity: 2 },
    ])
    expect(hayVariantes(porPid['3'])).toBe(true)
  })

  it('sin filas devuelve vacío y ⛔ no explota', () => {
    expect(desglosar([])).toEqual({ porPid: {}, tiendas: [] })
    expect(hayVariantes(undefined)).toBe(false)
  })
})

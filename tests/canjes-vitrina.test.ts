import { describe, it, expect } from 'vitest'
import {
  buscarEnLaTienda, categoriasDeLaTienda, esModeloDeCelular, esTalle, facetaDeLaVitrina,
  hayParaOfrecer, itemPasa, opcionPasa, paraVitrina, precioDeVitrina,
  type ProductoTn,
} from '@/lib/canjes/vitrina'
import { controlDelTope, opcionEnCriollo, puedeElegir, type CanjeItem } from '@/lib/canjes/tipos'
// Handlers JS de api/: sólo las funciones puras, sin tocar Supabase.
import { eleccionesEnItems, paraLaPersona } from '@/api/_canje-portal.js'
import { seVaDelTope } from '@/api/_canjes-reglas.js'

/**
 * La vitrina: el espejo curado de Tienda Nube del que la creadora elige.
 *
 * Tres cosas se testean acá y las tres son barreras, no cálculos:
 *
 *  1. **Qué de la tienda entra.** Lo agotado y lo despublicado no se ofrecen, y los ejes de cada
 *     producto salen tal como los manda TN — que es lo que permite que la misma pantalla sirva para
 *     una funda de iPhone y para un jean.
 *  2. **Qué sale a internet.** El portal es lo único abierto: en modo unidades no puede viajar un
 *     solo número de plata, y de la vitrina no pueden salir SKUs ni ids de producto.
 *  3. **Que el tope lo haga cumplir el servidor.** La misma función corre en los dos handlers y
 *     tiene que dar lo mismo que el `controlDelTope` de TS, o el panel y el link discreparían.
 */

// ── Fixtures, tomados del catálogo real ─────────────────────────────────────────

/** Un eje solo (el modelo). Es el caso mayoritario: 181 de 235 productos en BDI. */
const CLEAR_CASE: ProductoTn = {
  id: 111,
  name: 'CLEAR CASE',
  sku: null,
  price: 7990,
  promo_price: 6390,
  images: ['https://acdn-us.mitiendanube.com/x/clear-1024-1024.jpg'],
  categories: ['FUNDAS', 'OFERTAS'],
  variantes: [
    { id: '352422105', sku: null, barcode: '1537035', valores: ['iPhone 11'], color: '', image_url: 'https://acdn-us.mitiendanube.com/x/v1.jpg', stock: 3 },
    { id: '352422112', sku: null, barcode: '0000875', valores: ['iPhone 12'], color: '', image_url: null, stock: 0 },
    { id: '352422114', sku: 'F-9-13', barcode: null, valores: ['iPhone 13'], color: '', image_url: null, stock: null },
  ],
}

/** Dos ejes. Es el caso de `PROTECTOR DE CÁMARA STRASS` en BDI y `CORSET FRANK` en Zattia. */
const CORSET: ProductoTn = {
  id: 222,
  name: 'CORSET FRANK',
  sku: 'CORSET FRANK',
  price: 39990,
  promo_price: null,
  images: [],
  categories: ['TOPS Y BODIES', 'NEW IN'],
  variantes: [
    { id: '900', sku: 'CORSET FRANK', valores: ['Negro', 'XS'], image_url: 'https://acdn-us.mitiendanube.com/x/negro.jpg', stock: 2 },
    { id: '901', sku: 'CORSET FRANK', valores: ['Blanco', 'M'], image_url: null, stock: 0 },
  ],
}

const AGOTADO: ProductoTn = {
  id: 333, name: 'JEAN STONE', categories: ['JEANS'], price: 50000,
  variantes: [{ id: '1', valores: ['34'], stock: 0 }, { id: '2', valores: ['36'], stock: 0 }],
}

const DESPUBLICADO: ProductoTn = {
  id: 444, name: 'REMERA VIEJA', published: false, categories: ['REMERAS'], price: 10000,
  variantes: [{ id: '3', valores: ['M'], stock: 9 }],
}

const TIENDA = [CLEAR_CASE, CORSET, AGOTADO, DESPUBLICADO]

// ── 1. Qué de la tienda entra ───────────────────────────────────────────────────

describe('qué de Tienda Nube entra a la vitrina', () => {
  it('el precio es el que la tienda cobra HOY: la promo le gana al tachado', () => {
    expect(precioDeVitrina(CLEAR_CASE)).toBe(6390)
    // Sin promo manda el de lista.
    expect(precioDeVitrina(CORSET)).toBe(39990)
    // Un cero no es un precio: sería regalarle el tope entero.
    expect(precioDeVitrina({ id: 1, name: 'x', price: 0, promo_price: 0 })).toBeNull()
    expect(precioDeVitrina({ id: 1, name: 'x' })).toBeNull()
  })

  it('lo agotado no entra, y "sin stock gestionado" no es lo mismo que cero', () => {
    expect(hayParaOfrecer({ stock: 0 })).toBe(false)
    // `null` = TN no lleva el stock de esto. Quien no lo lleva igual lo tiene.
    expect(hayParaOfrecer({ stock: null })).toBe(true)
    expect(hayParaOfrecer({})).toBe(true)

    const listo = paraVitrina(CLEAR_CASE)
    expect(listo?.opciones.map((o) => o.id)).toEqual(['352422105', '352422114'])
  })

  it('un producto sin ninguna variante disponible NO se ofrece, en vez de mostrarse "agotado"', () => {
    // Un stock congelado hace dos semanas miente. Lo honesto es no ofrecerlo.
    expect(paraVitrina(AGOTADO)).toBeNull()
  })

  it('lo despublicado tampoco', () => {
    expect(paraVitrina(DESPUBLICADO)).toBeNull()
  })

  it('los ejes salen tal como los manda la tienda, sin llamarlos "modelo" ni "color"', () => {
    // Un solo eje en la funda, dos en el corset. Es la razón por la que la pantalla no puede
    // titular las opciones: la mitad de las veces el segundo eje no existe.
    expect(paraVitrina(CLEAR_CASE)?.opciones[0].valores).toEqual(['iPhone 11'])
    expect(paraVitrina(CORSET)?.opciones[0].valores).toEqual(['Negro', 'XS'])
    expect(opcionEnCriollo({ valores: ['Negro', 'XS'] })).toBe('Negro · XS')
  })

  it('el color entra como un valor más si TN no lo puso en `valores`', () => {
    // Sin esto, dos variantes distintas se verían con el mismo nombre.
    const p = paraVitrina({
      id: 5, name: 'MONITO', price: 100,
      variantes: [{ id: '9', valores: [], color: 'Celeste', stock: 1 }],
    })
    expect(p?.opciones[0].valores).toEqual(['Celeste'])
  })

  it('la foto del producto sale de la tienda, y si no tiene, de alguna de sus variantes', () => {
    expect(paraVitrina(CLEAR_CASE)?.foto_url).toContain('clear-1024-1024.jpg')
    // CORSET no tiene `images`: cae a la foto de la primera variante que tenga.
    expect(paraVitrina(CORSET)?.foto_url).toContain('negro.jpg')
  })

  it('las categorías cuentan ofrecibles, no productos', () => {
    const cats = categoriasDeLaTienda(TIENDA)
    // JEANS existe en la tienda pero está todo agotado: no puede figurar, o se la trae vacía.
    expect(cats.find((c) => c.nombre === 'JEANS')).toBeUndefined()
    expect(cats.find((c) => c.nombre === 'REMERAS')).toBeUndefined()
    expect(cats.find((c) => c.nombre === 'FUNDAS')?.cuantos).toBe(1)
    expect(cats.find((c) => c.nombre === 'NEW IN')?.cuantos).toBe(1)
  })

  it('se trae por categoría o buscando; sin ninguna de las dos no se trae nada', () => {
    expect(buscarEnLaTienda(TIENDA, { categoria: 'FUNDAS' }).map((p) => p.nombre)).toEqual(['CLEAR CASE'])
    expect(buscarEnLaTienda(TIENDA, { texto: 'corset' }).map((p) => p.nombre)).toEqual(['CORSET FRANK'])
    // Las categorías de BDI mezclan cada modelo de iPhone con FUNDAS: ahí se llega por el nombre.
    expect(buscarEnLaTienda(TIENDA, { texto: 'jean' })).toEqual([])
  })
})

// ── 1 bis. El filtro de arriba del link ─────────────────────────────────────────

/** Como llegan al teléfono: sólo los valores de cada opción deciden la faceta. */
const conOpciones = (...opciones: string[][]) => ({ opciones: opciones.map((valores) => ({ valores })) })

describe('la faceta: por lo único que ella puede filtrar', () => {
  it('reconoce el eje por la FORMA del valor, no por su posición', () => {
    // Medido: en BDI hay 11 modelos que caen en la posición 1 y en Zattia los talles aparecen en
    // las dos. Mirar la posición daría "color" la mitad de las veces.
    expect(esModeloDeCelular('iPhone 15 Pro Max')).toBe(true)
    expect(esModeloDeCelular('Samsung Galaxy S23')).toBe(true)
    expect(esModeloDeCelular('Negro')).toBe(false)
    expect(esTalle('XL')).toBe(true)
    expect(esTalle('38')).toBe(true)
    expect(esTalle('Único')).toBe(true)
    expect(esTalle('Talle M')).toBe(true)
    expect(esTalle('Rosa')).toBe(false)
  })

  it('con datos tipo BDI la faceta es el modelo; con datos tipo Zattia, el talle', () => {
    const bdi = facetaDeLaVitrina([conOpciones(['iPhone 13'], ['iPhone 15']), conOpciones(['iPhone 15', 'Rosa'])])
    expect(bdi?.clase).toBe('modelo')
    const zattia = facetaDeLaVitrina([conOpciones(['Negro', 'XS'], ['Blanco', 'M'])])
    expect(zattia?.clase).toBe('talle')
  })

  it('sin un eje reconocible NO hay filtro, en vez de uno con un nombre inventado', () => {
    // Sólo colores: la pantalla no puede decir "elegí color" cuando no sabe qué es ese valor.
    expect(facetaDeLaVitrina([conOpciones(['Negro'], ['Rosa']), conOpciones(['Verde'])])).toBeNull()
    // Un solo valor tampoco es filtro: ocuparía media pantalla para no sacar nada.
    expect(facetaDeLaVitrina([conOpciones(['iPhone 15']), conOpciones(['iPhone 15', 'Negro'])])).toBeNull()
    expect(facetaDeLaVitrina([])).toBeNull()
  })

  it('los talles van en el orden en que se prueban y el único al final; los modelos, del más nuevo', () => {
    const talles = facetaDeLaVitrina([conOpciones(['M'], ['XS'], ['UNICO'], ['42'], ['L'], ['38'], ['XXL'])])
    expect(talles?.valores).toEqual(['XS', 'M', 'L', 'XXL', '38', '42', 'UNICO'])
    const modelos = facetaDeLaVitrina([conOpciones(['iPhone 12'], ['iPhone 15 Pro'], ['iPhone 6'], ['Samsung S23'])])
    // La marca agrupa primero, o los Samsung quedarían intercalados entre los iPhone por el número.
    expect(modelos?.valores).toEqual(['iPhone 15 Pro', 'iPhone 12', 'iPhone 6', 'Samsung S23'])
  })

  it('lo que no participa de la faceta se queda visible: no es de otro modelo, es de ninguno', () => {
    const faceta = facetaDeLaVitrina([conOpciones(['iPhone 15'], ['iPhone 13'])])
    const funda15 = conOpciones(['iPhone 15'])
    const funda13 = conOpciones(['iPhone 13'])
    // Los ~19 accesorios de BDI que sólo tienen color.
    const accesorio = conOpciones(['Negro'], ['Rosa'])

    expect(itemPasa(funda15, faceta, 'iPhone 15')).toBe(true)
    expect(itemPasa(funda13, faceta, 'iPhone 15')).toBe(false)
    expect(itemPasa(accesorio, faceta, 'iPhone 15')).toBe(true)
    // Sin filtro puesto no se esconde nada.
    expect(itemPasa(funda13, faceta, null)).toBe(true)
  })

  it('dentro de la hoja quedan sólo las opciones que matchean, y las neutras', () => {
    const faceta = facetaDeLaVitrina([conOpciones(['iPhone 15'], ['iPhone 13'])])
    expect(opcionPasa(['iPhone 15', 'Rosa'], faceta, 'iPhone 15')).toBe(true)
    expect(opcionPasa(['iPhone 13'], faceta, 'iPhone 15')).toBe(false)
    expect(opcionPasa(['Rosa'], faceta, 'iPhone 15')).toBe(true)
    // `Único` y `UNICO` son el mismo talle: los cargó gente distinta.
    const talles = facetaDeLaVitrina([conOpciones(['Único'], ['M'])])
    expect(opcionPasa(['Único'], talles, 'UNICO')).toBe(true)
  })
})

// ── 2. Qué sale a internet ──────────────────────────────────────────────────────

const VITRINA_BASE = {
  id: 3,
  nombre: 'Fundas verano',
  estado: 'activa',
  items: [
    {
      id: 10, activo: true, tn_product_id: '111', sku: 'SECRETO-1', nombre: 'CLEAR CASE',
      foto_url: 'https://acdn-us.mitiendanube.com/x/clear.jpg', pvp: 6390,
      opciones: [{ id: '352422105', valores: ['iPhone 11'], foto: null, sku: 'SECRETO-2', barcode: 'SECRETO-3' }],
    },
    // Apagado: no se ofrece.
    {
      id: 11, activo: false, tn_product_id: '999', sku: null, nombre: 'FUNDA APAGADA',
      foto_url: null, pvp: 5000, opciones: [{ id: '77', valores: ['iPhone 12'] }],
    },
  ],
}

const CANJE_UNIDADES = {
  id: 42, store: 'bdi', estado: 'acuerdo', persona_id: 7,
  vitrina_id: 3, seleccion_cerrada_at: null,
  tope_tipo: 'unidades', tope_unidades: [{ cantidad: 3, descripcion: 'fundas' }], tope_pvp: null,
  envio_estado: 'pendiente', entregado_at: null, datos_confirmados_at: null,
}

describe('la vitrina vista desde el link público', () => {
  it('en modo unidades NO viaja un solo número de plata', () => {
    const salida = paraLaPersona(CANJE_UNIDADES, { nombre: 'Lu' }, null, VITRINA_BASE, [])
    const json = JSON.stringify(salida)
    // Ni el precio del producto ni el tope en pesos: el precio de lo que se le regala no es
    // asunto de nadie más, y esto es lo único del módulo abierto a internet.
    expect(json).not.toContain('6390')
    expect(salida.vitrina!.items[0].pvp).toBeUndefined()
    expect(salida.vitrina!.modo).toBe('unidades')
    expect(salida.vitrina!.tope).toBe(3)
  })

  it('en modo monto sí viaja el precio y el saldo: sin eso no puede administrarse el tope', () => {
    const salida = paraLaPersona(
      { ...CANJE_UNIDADES, tope_tipo: 'monto', tope_pvp: 80000, tope_unidades: [] },
      { nombre: 'Lu' }, null, VITRINA_BASE, [],
    )
    expect(salida.vitrina!.items[0].pvp).toBe(6390)
    expect(salida.vitrina!.tope).toBe(80000)
  })

  it('de la vitrina no salen SKUs, códigos de barras ni ids de producto de la tienda', () => {
    const json = JSON.stringify(paraLaPersona(CANJE_UNIDADES, { nombre: 'Lu' }, null, VITRINA_BASE, []))
    expect(json).not.toContain('SECRETO')
    expect(json).not.toContain('tn_product_id')
  })

  it('lo apagado no se le ofrece', () => {
    const salida = paraLaPersona(CANJE_UNIDADES, { nombre: 'Lu' }, null, VITRINA_BASE, [])
    expect(salida.vitrina!.items.map((i: { id: number }) => i.id)).toEqual([10])
  })

  it('el saldo cuenta TODOS los items vivos, no sólo los suyos', () => {
    // Si el equipo ya le cargó una funda, esa unidad está gastada de verdad: decirle que le quedan
    // tres sería mandarla contra el error del servidor.
    const salida = paraLaPersona(CANJE_UNIDADES, { nombre: 'Lu' }, null, VITRINA_BASE, [
      { origen: 'equipo', estado: 'confirmado', cantidad: 1, nombre: 'X', variante: null, pvp_unit: 6390 },
      { origen: 'equipo', estado: 'quitado', cantidad: 5, nombre: 'Y', variante: null, pvp_unit: 6390 },
    ])
    expect(salida.vitrina!.usado).toBe(1)
  })

  it('lo que ya eligió se le muestra aunque la vitrina se haya archivado', () => {
    const salida = paraLaPersona(
      { ...CANJE_UNIDADES, seleccion_cerrada_at: '2026-08-02T10:00:00Z' }, { nombre: 'Lu' }, null, null,
      [{ origen: 'persona', estado: 'propuesto', cantidad: 2, nombre: 'CLEAR CASE', variante: 'iPhone 11', pvp_unit: 6390 }],
    )
    expect(salida.vitrina).toBeNull()
    expect(salida.elegidos).toEqual([{ nombre: 'CLEAR CASE', variante: 'iPhone 11', cantidad: 2 }])
  })

  it('sin vitrina el link se comporta como siempre', () => {
    const salida = paraLaPersona({ ...CANJE_UNIDADES, vitrina_id: null }, { nombre: 'Lu' }, null, null, [])
    expect(salida.vitrina).toBeNull()
    expect(salida.elegidos).toEqual([])
    expect(salida.datos.nombre).toBe('Lu')
  })

  it('la elección se cierra al mandar y el link vuelve en lectura', () => {
    const abierta = paraLaPersona(CANJE_UNIDADES, {}, null, VITRINA_BASE, [])
    expect(abierta.vitrina!.abierta).toBe(true)
    const cerrada = paraLaPersona({ ...CANJE_UNIDADES, seleccion_cerrada_at: '2026-08-02T10:00:00Z' }, {}, null, VITRINA_BASE, [])
    expect(cerrada.vitrina!.abierta).toBe(false)
    // Ya despachado tampoco: el pedido salió.
    const enCurso = paraLaPersona({ ...CANJE_UNIDADES, estado: 'en_curso' }, {}, null, VITRINA_BASE, [])
    expect(enCurso.vitrina!.abierta).toBe(false)
  })

  it('`puedeElegir` en TS dice lo mismo', () => {
    expect(puedeElegir({ estado: 'acuerdo', vitrina_id: 3, seleccion_cerrada_at: null })).toBe(true)
    expect(puedeElegir({ estado: 'acuerdo', vitrina_id: null, seleccion_cerrada_at: null })).toBe(false)
    expect(puedeElegir({ estado: 'acuerdo', vitrina_id: 3, seleccion_cerrada_at: 'x' })).toBe(false)
    expect(puedeElegir({ estado: 'en_curso', vitrina_id: 3, seleccion_cerrada_at: null })).toBe(false)
    expect(puedeElegir({ estado: 'enviada', vitrina_id: 3, seleccion_cerrada_at: null })).toBe(false)
  })
})

// ── 3. Lo que ella manda de vuelta ──────────────────────────────────────────────

describe('lo que elige se re-arma desde la base, no desde lo que mandó el browser', () => {
  it('el nombre, la variante y el precio salen de la vitrina', () => {
    const { filas } = eleccionesEnItems(
      // Todo esto se ignora salvo `item_id`, `opcion_id` y `cantidad`. Si se creyera, cualquiera
      // se mandaría un producto inventado a precio cero y se saltearía el tope.
      [{ item_id: 10, opcion_id: '352422105', cantidad: 2, nombre: 'IPHONE GRATIS', pvp_unit: 0, estado: 'confirmado' }],
      VITRINA_BASE, 42,
    )
    expect(filas).toHaveLength(1)
    expect(filas![0]).toMatchObject({
      canje_id: 42,
      nombre: 'CLEAR CASE',
      variante: 'iPhone 11',
      cantidad: 2,
      pvp_unit: 6390,
      product_id: '111',
      size_id: '352422105',
      origen: 'persona',
      // **Propuesto, no confirmado**: que lo haya elegido no quiere decir que haya stock.
      estado: 'propuesto',
      // El costo vive en Gestión Nube y no se cruza confiable: lo carga el equipo al confirmar.
      costo_unit: null,
    })
  })

  it('rechaza lo que no está en la vitrina, lo apagado y las cantidades imposibles', () => {
    expect(eleccionesEnItems([], VITRINA_BASE, 42).error).toBeTruthy()
    expect(eleccionesEnItems([{ item_id: 4242, opcion_id: 'x', cantidad: 1 }], VITRINA_BASE, 42).error).toBeTruthy()
    // El item 11 está apagado: no se puede elegir aunque siga en la tabla.
    expect(eleccionesEnItems([{ item_id: 11, opcion_id: '77', cantidad: 1 }], VITRINA_BASE, 42).error).toBeTruthy()
    expect(eleccionesEnItems([{ item_id: 10, opcion_id: 'inventada', cantidad: 1 }], VITRINA_BASE, 42).error).toBeTruthy()
    expect(eleccionesEnItems([{ item_id: 10, opcion_id: '352422105', cantidad: 0 }], VITRINA_BASE, 42).error).toBeTruthy()
    expect(eleccionesEnItems([{ item_id: 10, opcion_id: '352422105', cantidad: -3 }], VITRINA_BASE, 42).error).toBeTruthy()
  })
})

// ── 4. El tope, en los dos lados ────────────────────────────────────────────────

describe('el tope lo hace cumplir el servidor, y el link y el panel dicen lo mismo', () => {
  const item = (cantidad: number, pvp: number, estado = 'confirmado') =>
    ({ cantidad, pvp_unit: pvp, estado } as unknown as CanjeItem)

  it('por unidades: se puede llevar varias iguales, pero no pasarse del total', () => {
    const canje = { tope_tipo: 'unidades' as const, tope_unidades: [{ cantidad: 3, descripcion: 'fundas' }], tope_pvp: null }
    expect(seVaDelTope(canje, [item(3, 6390)])).toBeNull()
    expect(seVaDelTope(canje, [item(4, 6390)])).toMatch(/Se pasa del acuerdo/)
    // Lo quitado y lo sin stock no cuentan: no están en el pedido.
    expect(seVaDelTope(canje, [item(3, 6390), item(9, 6390, 'quitado')])).toBeNull()
  })

  it('por monto: se compara contra la suma de PVP', () => {
    const canje = { tope_tipo: 'monto' as const, tope_pvp: 20000, tope_unidades: [] }
    expect(seVaDelTope(canje, [item(3, 6390)])).toBeNull()
    expect(seVaDelTope(canje, [item(4, 6390)])).toMatch(/Se pasa del tope/)
  })

  it('el espejo JS del portal decide igual que el `controlDelTope` de TS', () => {
    // Si divergieran, el link la dejaría elegir algo que el panel después marca como pasado —o al
    // revés, que es peor: la frena sin que nadie entienda por qué.
    const casos = [
      { tope_tipo: 'unidades' as const, tope_unidades: [{ cantidad: 3, descripcion: 'fundas' }], tope_pvp: null },
      { tope_tipo: 'unidades' as const, tope_unidades: [], tope_pvp: null },
      { tope_tipo: 'monto' as const, tope_unidades: [], tope_pvp: 20000 },
      { tope_tipo: 'monto' as const, tope_unidades: [], tope_pvp: null },
    ]
    const listas = [[], [item(1, 6390)], [item(3, 6390)], [item(4, 6390)], [item(2, 15000)]]
    for (const canje of casos) {
      for (const items of listas) {
        expect(seVaDelTope(canje, items) == null).toBe(controlDelTope(canje, items).ok)
      }
    }
  })
})

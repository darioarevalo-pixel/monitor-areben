/**
 * **El balance del sector**: qué hay que ir a buscar al depósito del local, y con qué número se
 * decide si la lista se puede creer.
 */

import { describe, expect, it } from 'vitest'
import { buscarEnDeposito, buscarPorTipo, coberturaPorCat, coberturaPorTipo, filasBuscar, partirTachadas, resumenBuscar, sinCategoriaSinVer, tocadoSinDeclarar, vistasDelRecorrido, colgadasDeMas, partirRepetidas, filasSacar, HEADER_SACAR, MOTIVOS, COBERTURA_FIABLE, declaracionesFlojas, type Tachada, type Repetida } from '../lib/exhib/balance'
import { aEscaneo, type EscaneoLibre } from '../lib/exhib/libre'
import type { ExhibItem } from '../lib/exhib/tipos'

const v = (over: Partial<ExhibItem>): ExhibItem => ({
  barcode: '', sku: '', productId: 'p', name: 'X', size: 'U', qty: 1, img: null,
  cat: 'TOPS Y BODIES', cleanCats: ['TOPS Y BODIES'], tnId: null, precio: null, promo: null, ...over,
})

const TOP_A = v({ productId: '1', name: 'TOP ORSA', size: 'Beige', barcode: 'b1', qty: 2 })
const TOP_B = v({ productId: '1', name: 'TOP ORSA', size: 'Negro', barcode: 'b2', qty: 3 })
const TOP_C = v({ productId: '2', name: 'TOP NARA', size: 'Blanco', barcode: 'b3', qty: 1 })
// El bolsón de TN se come un corset: está en las DOS categorías.
const CORSET = v({ productId: '3', name: 'CORSET BERNA', size: 'M', barcode: 'b4', qty: 4, cat: 'TOPS Y BODIES', cleanCats: ['TOPS Y BODIES', 'CORSETS'] })
// De otro sector, no tiene por qué aparecer.
const JEAN = v({ productId: '4', name: 'JEAN MOM', size: '38', barcode: 'b5', qty: 5, cat: 'JEANS', cleanCats: ['JEANS'] })
// Sin categoría en TN: invisible para cualquier universo.
const MUSCULOSA = v({ productId: '5', name: 'MUSCULOSA GOA', size: 'Blanco', barcode: 'b6', qty: 6, cat: '(Sin categoría)', cleanCats: [] })

const LOCAL = [TOP_A, TOP_B, TOP_C, CORSET, JEAN, MUSCULOSA]
const TOPS = 'TOPS Y BODIES'

const escanear = (its: ExhibItem[], lugar = 'sector tops'): EscaneoLibre[] => its.map((it) => aEscaneo(it, it.barcode, lugar))

describe('vistasDelRecorrido', () => {
  it('cuenta lo que pasó por el lector en CUALQUIER lugar del recorrido', () => {
    const es = [...escanear([TOP_A], 'sector tops'), ...escanear([TOP_C], 'vidriera')]
    expect(vistasDelRecorrido(es).size).toBe(2)
  })

  /** Un triage ⛔ no vio nada: «no se encuentra» quiere decir que la buscaron y ⛔ no estaba. */
  it('un estado de triage ⛔ no cuenta como visto', () => {
    const [e] = escanear([TOP_A])
    expect(vistasDelRecorrido([{ ...e, estado: 'no-encuentra' }]).size).toBe(0)
  })
})

describe('coberturaPorCat — el número con el que se decide', () => {
  it('dice cuánto del universo tocó, ⛔ no cuántos escaneos hubo', () => {
    const [c] = coberturaPorCat(escanear([TOP_A]), LOCAL)
    expect(c.cat).toBe(TOPS)
    // El universo de TOPS son TOP_A, TOP_B, TOP_C y el CORSET que el bolsón se come: 4.
    expect(c).toMatchObject({ universo: 4, vistas: 1 })
    expect(c.cubierto).toBeCloseTo(0.25)
    expect(c.unidadesSinVer).toBe(3 + 1 + 4)
  })

  it('sólo propone las categorías que el recorrido TOCÓ', () => {
    const cats = coberturaPorCat(escanear([TOP_A]), LOCAL).map((c) => c.cat)
    expect(cats).toEqual([TOPS])
    expect(cats).not.toContain('JEANS')
  })

  it('una prenda en dos categorías propone las dos', () => {
    const cats = coberturaPorCat(escanear([CORSET]), LOCAL).map((c) => c.cat).sort()
    expect(cats).toEqual(['CORSETS', 'TOPS Y BODIES'])
  })

  it('«(Sin categoría)» ⛔ nunca se propone: ⛔ no es un sector del salón', () => {
    expect(coberturaPorCat(escanear([MUSCULOSA]), LOCAL).map((c) => c.cat)).toEqual([])
  })
})

describe('buscarEnDeposito — el mandado', () => {
  it('sin categorías declaradas ⛔ no afirma nada', () => {
    expect(buscarEnDeposito(escanear([TOP_A]), LOCAL, [])).toEqual([])
  })

  it('pide lo de la categoría que ⛔ no pasó por el lector, lo más gordo primero', () => {
    const lista = buscarEnDeposito(escanear([TOP_A]), LOCAL, [TOPS])
    expect(lista.map((b) => b.it.name + ' ' + b.it.size)).toEqual(['CORSET BERNA M', 'TOP ORSA Negro', 'TOP NARA Blanco'])
    expect(resumenBuscar(lista)).toEqual({ variantes: 3, unidades: 8, productos: 3 })
  })

  it('⛔ no pide lo de otras categorías', () => {
    expect(buscarEnDeposito(escanear([TOP_A]), LOCAL, [TOPS]).some((b) => b.it.name === 'JEAN MOM')).toBe(false)
  })

  /** 🔑 La misma prenda colgada en otro mueble del mismo recorrido ⛔ no se va a buscar al depósito. */
  it('lo escaneado en OTRO lugar del recorrido cuenta como colgado', () => {
    const es = [...escanear([TOP_A], 'sector tops'), ...escanear([TOP_C], 'vidriera')]
    expect(buscarEnDeposito(es, LOCAL, [TOPS]).map((b) => b.it.name)).toEqual(['CORSET BERNA', 'TOP ORSA'])
  })

  /** 🔴 El corset aparece porque el bolsón de TN se lo come, y la lista lo EXPLICA. */
  it('dice en qué otra categoría está el que parece ajeno', () => {
    const corset = buscarEnDeposito(escanear([TOP_A]), LOCAL, [TOPS]).find((b) => b.it.name === 'CORSET BERNA')
    expect(corset?.tambienEn).toEqual(['CORSETS'])
    // La declarada ⛔ no se repite: sería ruido en la columna que explica.
    expect(corset?.tambienEn).not.toContain(TOPS)
  })

  /** En el catálogo vive la misma categoría dos veces (mismo nombre, distinto ID en TN). */
  it('⛔ no repite la misma categoría escrita igual', () => {
    const dosVeces = { ...CORSET, cleanCats: ['TOPS Y BODIES', 'CORSETS', 'CORSETS'] }
    const lista = buscarEnDeposito(escanear([TOP_A]), [dosVeces], [TOPS])
    expect(lista[0].tambienEn).toEqual(['CORSETS'])
  })

  /**
   * ⚠️ **La columna de unidades se fue el 21-sep-2026**, también acá: la tarea es colgar una de cada
   * color/talle, y el número invitaba a traer las ocho del depósito.
   */
  it('el Excel lleva la explicación del bolsón y ⛔ ya no el stock', () => {
    const filas = filasBuscar(buscarEnDeposito(escanear([TOP_A]), LOCAL, [TOPS]))
    expect(filas[0]).toContain('También está en')
    expect(filas[0]).not.toContain('Unidades en el local')
    expect(filas[1]).toEqual(['CORSET BERNA', 'M', '', 'b4', 'CORSETS'])
  })
})

describe('lo que el balance ⛔ NO puede juzgar', () => {
  it('la prenda sin categoría se cuenta aparte y ⛔ no se calla', () => {
    expect(sinCategoriaSinVer(escanear([TOP_A]), LOCAL).map((i) => i.name)).toEqual(['MUSCULOSA GOA'])
  })

  it('la sin categoría que SÍ pasó por el lector ⛔ no es un pendiente: está colgada', () => {
    expect(sinCategoriaSinVer(escanear([TOP_A, MUSCULOSA]), LOCAL)).toEqual([])
  })

  it('⛔ no se cuela en el mandado por más que se declare la categoría', () => {
    expect(buscarEnDeposito(escanear([TOP_A]), LOCAL, [TOPS]).some((b) => b.it.name === 'MUSCULOSA GOA')).toBe(false)
  })
})

/**
 * **Declarar por TIPO DE PRENDA** (21-sep-2026), que es el criterio vigente: el nombre y el stock
 * salen los dos de Gestión Nube, así que la cuenta que importa ⛔ no depende de Tienda Nube.
 */
describe('coberturaPorTipo — el orden es lo que se caminó', () => {
  /**
   * 🔴 **El caso que lo trajo, tal como pasó en el salón.** Ordenando por porcentaje, un tipo
   * chiquito escaneado entero da 100 % y se planta arriba del sector caminado de verdad: ese día se
   * tildaron dos categorías de 15 y 9 prendas y el mandado salió vacío tras 415 unidades caminadas.
   */
  it('pone primero lo que más pasó por el lector, ⛔ no lo más cubierto', () => {
    const chico = v({ productId: '9', name: 'POLLERA SOL', size: 'U', barcode: 'b9', qty: 1 })
    const es = escanear([TOP_A, TOP_B, chico])
    const t = coberturaPorTipo(es, [...LOCAL, chico])
    // POLLERA está cubierta al 100 % y TOP al 66 %, pero TOP es lo que se caminó.
    expect(t[0].tipo).toBe('TOP')
    expect(t[0].vistas).toBe(2)
    expect(t.find((x) => x.tipo === 'POLLERA')?.cubierto).toBe(1)
  })

  /**
   * 🔴 **Se cuenta en PRENDAS y ⛔ no en unidades** (21-sep-2026, Bruno: *«no me interesa el stock
   * del local, me interesa que se exhiba»*). Falta colgar UNA de cada color/talle: que el sistema
   * tenga 3 en el depósito ⛔ no cambia la tarea.
   */
  it('el universo es del tipo entero, contado en prendas', () => {
    const t = coberturaPorTipo(escanear([TOP_A]), LOCAL)
    const top = t.find((x) => x.tipo === 'TOP')
    expect(top).toMatchObject({ universo: 3, vistas: 1 })
    // TOP_B y TOP_C quedaron sin ver: faltan 2 por exhibir, ⛔ no «4 unidades».
    expect((top?.universo ?? 0) - (top?.vistas ?? 0)).toBe(2)
  })

  /** ⛔ Un tipo que el recorrido ⛔ no tocó ⛔ no se propone: sobre un mueble que nadie caminó ⛔ no se afirma nada. */
  it('⛔ no propone tipos que el recorrido ⛔ no tocó', () => {
    const t = coberturaPorTipo(escanear([TOP_A]), LOCAL)
    expect(t.map((x) => x.tipo)).not.toContain('JEAN')
  })

  /** 🔑 Una prenda sin categoría en TN **sí** tiene tipo: por nombre ninguna es invisible. */
  it('la prenda sin categoría en TN entra igual, porque tiene nombre', () => {
    const t = coberturaPorTipo(escanear([MUSCULOSA]), LOCAL)
    expect(t.map((x) => x.tipo)).toContain('MUSCULOSA')
  })
})

describe('buscarPorTipo — el mandado del depósito', () => {
  /** ⚠️ Ordenado por NOMBRE y ⛔ no por unidades: los colores de la misma prenda caen juntos. */
  it('pide las del tipo declarado que ⛔ no pasaron por el lector, por nombre', () => {
    const lista = buscarPorTipo(escanear([TOP_A]), LOCAL, ['TOP'])
    expect(lista.map((b) => b.it.name + ' ' + b.it.size)).toEqual(['TOP NARA Blanco', 'TOP ORSA Negro'])
  })

  /** 🔑 Declarando por nombre ⛔ no hay bolsón: un corset ⛔ no se cuela en un mandado de tops. */
  it('⛔ no arrastra prendas de otro tipo (el bolsón de TN ya ⛔ no existe)', () => {
    const lista = buscarPorTipo(escanear([TOP_A]), LOCAL, ['TOP'])
    expect(lista.some((b) => b.it.name.startsWith('CORSET'))).toBe(false)
    expect(lista.every((b) => b.tambienEn.length === 0)).toBe(true)
  })

  it('sin nada declarado ⛔ no afirma nada', () => {
    expect(buscarPorTipo(escanear([TOP_A]), LOCAL, [])).toEqual([])
  })
})

/**
 * 🔴 **El seguro contra el mandado vacío mentiroso.** Un mandado en cero puede querer decir «no
 * falta nada» o «declaraste cualquier cosa», y hasta el 21-sep-2026 la pantalla ⛔ no las distinguía.
 */
describe('tocadoSinDeclarar', () => {
  it('cuenta lo caminado que queda afuera de lo declarado', () => {
    const es = escanear([TOP_A, CORSET, JEAN])
    expect(tocadoSinDeclarar(es, LOCAL, ['TOP'])).toBe(2)
    expect(tocadoSinDeclarar(es, LOCAL, ['TOP', 'CORSET', 'JEAN'])).toBe(0)
  })

  it('es CERO cuando ⛔ no se caminó nada de más', () => {
    expect(tocadoSinDeclarar(escanear([TOP_A]), LOCAL, ['TOP'])).toBe(0)
  })
})

describe('filasBuscar — la columna que se cae sola', () => {
  it('⛔ no lleva «También está en» cuando ninguna fila tiene qué decir', () => {
    const filas = filasBuscar(buscarPorTipo(escanear([TOP_A]), LOCAL, ['TOP']))
    expect(filas[0]).not.toContain('También está en')
    expect(filas[0]).toHaveLength(4)
    expect(filas[1]).toHaveLength(4)
  })

  /** 🔴 Y ⛔ NUNCA lleva unidades: la tarea es colgar una, ⛔ no traer ocho. */
  it('⛔ no lleva cuántas unidades hay', () => {
    const filas = filasBuscar(buscarPorTipo(escanear([TOP_A]), LOCAL, ['TOP']))
    expect(filas[0].join(' ')).not.toMatch(/unidad/i)
    expect(filas[1]).toEqual(['TOP NARA', 'Blanco', '', 'b3'])
  })

  it('la lleva cuando alguna fila la usa (el mandado por categoría)', () => {
    const filas = filasBuscar(buscarEnDeposito(escanear([TOP_A]), LOCAL, [TOPS]))
    expect(filas[0]).toContain('También está en')
  })
})

/**
 * **Tachar una prenda del mandado con su motivo** (21-sep-2026). Los dos motivos los dictó el salón:
 * una prenda colgada en OTRO sector que nadie caminó, y la mercadería nueva que se colgó DESPUÉS del
 * escaneo. Ver `MotivoTachada`.
 */
describe('partirTachadas — lo sacado del mandado ⛔ no desaparece', () => {
  const t = (varianteId: string, motivo: 'otro-lugar' | 'despues'): Tachada => ({
    variante_id: varianteId, motivo, por: 'Bruno Arevalo', cuando: '2026-09-21T18:00:00.000Z',
  })

  it('saca del mandado lo tachado y lo devuelve aparte, con su motivo', () => {
    const lista = buscarPorTipo(escanear([TOP_A]), LOCAL, ['TOP'])
    // TOP_B ('b2') está colgado en el perchero de al lado.
    const { mandado, sacadas } = partirTachadas(lista, [t('b2', 'otro-lugar')])
    expect(mandado.map((b) => b.it.size)).toEqual(['Blanco'])
    expect(sacadas).toHaveLength(1)
    expect(sacadas[0].it.size).toBe('Negro')
    expect(sacadas[0].tachada.motivo).toBe('otro-lugar')
    expect(sacadas[0].tachada.por).toBe('Bruno Arevalo')
  })

  /** ⚠️ Nada se pierde: las dos listas juntas son siempre el mandado entero. */
  it('mandado + sacadas es siempre la lista completa', () => {
    const lista = buscarPorTipo(escanear([TOP_A]), LOCAL, ['TOP'])
    const { mandado, sacadas } = partirTachadas(lista, [t('b2', 'despues')])
    expect(mandado.length + sacadas.length).toBe(lista.length)
  })

  it('sin tachaduras el mandado queda entero', () => {
    const lista = buscarPorTipo(escanear([TOP_A]), LOCAL, ['TOP'])
    expect(partirTachadas(lista, []).mandado).toHaveLength(lista.length)
    expect(partirTachadas(lista, []).sacadas).toEqual([])
  })

  /** ⚠️ Una tachadura de un recorrido viejo, de una prenda que ⛔ ya no falta, ⛔ no puede romper nada. */
  it('una tachadura que ⛔ no está en la lista se ignora', () => {
    const lista = buscarPorTipo(escanear([TOP_A]), LOCAL, ['TOP'])
    const { mandado, sacadas } = partirTachadas(lista, [t('no-existe', 'otro-lugar')])
    expect(mandado).toHaveLength(lista.length)
    expect(sacadas).toEqual([])
  })

  /** 🔑 Los dos motivos se leen en palabras del local, ⛔ no en códigos. */
  it('cada motivo tiene su texto para la pantalla', () => {
    expect(MOTIVOS['otro-lugar']).toBe('ya está colgada, en otro lugar')
    expect(MOTIVOS.despues).toBe('se colgó después del escaneo')
  })
})

/**
 * **La otra mitad del balance: lo que SOBRA en el salón** (21-sep-2026, Bruno: *«el espacio del
 * local es chico, por eso me interesa optimizar mucho eso»*). El mandado trae del depósito lo que
 * falta; esto manda al depósito lo que está colgado dos veces.
 */
describe('colgadasDeMas — las perchas que se pueden liberar', () => {
  /** El contador `veces` sube cuando se escanea la misma prenda dos veces en el mismo mueble. */
  const dosVeces = (it: ExhibItem, lugar = 'sector tops'): EscaneoLibre => ({ ...aEscaneo(it, it.barcode, lugar), veces: 2 })

  it('cuenta las unidades de una prenda y cuántas sobran', () => {
    const l = colgadasDeMas([dosVeces(TOP_A), ...escanear([TOP_C])])
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ nombre: 'TOP ORSA', size: 'Beige', unidades: 2, deMas: 1 })
  })

  /**
   * 🔴 **La misma prenda en DOS MUEBLES también ocupa dos perchas**, y es el caso que ⛔ no se ve
   * mirando un mueble solo. El 21-sep ⛔ no se pudo medir porque se caminó un único lugar.
   */
  it('la misma prenda en dos lugares cuenta como colgada de más', () => {
    const l = colgadasDeMas([...escanear([TOP_A], 'perchero tops'), ...escanear([TOP_A], 'vidriera')])
    expect(l).toHaveLength(1)
    expect(l[0].unidades).toBe(2)
    expect(l[0].lugares).toEqual(['perchero tops', 'vidriera'])
  })

  it('una prenda colgada UNA vez ⛔ no aparece', () => {
    expect(colgadasDeMas(escanear([TOP_A, TOP_C]))).toEqual([])
  })

  /** ⚠️ Un triage ⛔ no vio nada: no puede sumar una percha. */
  it('un triage ⛔ no cuenta como colgada', () => {
    const [e] = escanear([TOP_A])
    expect(colgadasDeMas([{ ...e, estado: 'no-encuentra' }, e])).toEqual([])
  })

  it('primero la que más perchas ocupa', () => {
    const tres: EscaneoLibre = { ...aEscaneo(TOP_C, TOP_C.barcode, 'sector tops'), veces: 3 }
    const l = colgadasDeMas([dosVeces(TOP_A), tres])
    expect(l.map((c) => c.deMas)).toEqual([2, 1])
  })
})

describe('partirRepetidas — la decisión la toma una persona', () => {
  const dosVeces = (it: ExhibItem): EscaneoLibre => ({ ...aEscaneo(it, it.barcode, 'sector tops'), veces: 2 })
  const d = (varianteId: string, decision: 'queda' | 'sacar'): Repetida => ({
    variante_id: varianteId, decision, por: 'Bruno Arevalo', cuando: '2026-09-21T19:00:00.000Z',
  })

  /**
   * 🔴 **Dos unidades colgadas pueden ser una decisión de exhibición o espacio desperdiciado, y eso
   * la app ⛔ no lo puede saber.** Misma regla que la cobertura del sector: la app pone el número.
   */
  it('lo no decidido queda aparte de lo decidido', () => {
    const l = colgadasDeMas([dosVeces(TOP_A), dosVeces(TOP_C)])
    const p = partirRepetidas(l, [d('b1', 'sacar')])
    expect(p.sacar.map((c) => c.size)).toEqual(['Beige'])
    expect(p.sinDecidir.map((c) => c.size)).toEqual(['Blanco'])
    expect(p.quedan).toEqual([])
  })

  it('«está bien que estén las dos» la saca de lo pendiente sin mandarla al depósito', () => {
    const l = colgadasDeMas([dosVeces(TOP_A)])
    const p = partirRepetidas(l, [d('b1', 'queda')])
    expect(p.quedan).toHaveLength(1)
    expect(p.sacar).toEqual([])
    expect(p.sinDecidir).toEqual([])
  })

  /**
   * ⚠️ **Acá el número SÍ va y ⛔ no contradice la regla del mandado**: en el mandado era el stock
   * del sistema —que ⛔ no cambia la tarea de colgar una—; acá es **cuántas sacar**, que es la tarea.
   */
  it('la planilla dice cuántas sacar y de qué mueble', () => {
    const l = colgadasDeMas([dosVeces(TOP_A)])
    const filas = filasSacar(l)
    expect(filas[0]).toEqual([...HEADER_SACAR])
    expect(filas[1]).toEqual(['TOP ORSA', 'Beige', 1, 'sector tops'])
  })
})

/**
 * **¿Dos prendas colgadas, o la misma pasada dos veces?** (21-sep-2026). Lo preguntó Bruno mirando
 * el primer recorrido de sector entero, y la respuesta honesta era «⛔ no se puede saber». Lo que
 * lo separa es **qué se escaneó en el medio**, ⛔ no el hueco de tiempo.
 */
describe('otrasEnMedio — lo que la app puede y ⛔ no puede afirmar', () => {
  const en = (it: ExhibItem, seg: number, lugar = 'sector tops'): EscaneoLibre =>
    aEscaneo(it, it.barcode, lugar, Date.parse('2026-09-21T13:00:00.000Z') + seg * 1000)
  /** Dos lecturas de la misma prenda, a los `a` y `b` segundos. */
  const dos = (it: ExhibItem, a: number, b: number): EscaneoLibre => ({
    ...en(it, a),
    veces: 2,
    ultimo_en: new Date(Date.parse('2026-09-21T13:00:00.000Z') + b * 1000).toISOString(),
    horas: [a, b].map((s) => new Date(Date.parse('2026-09-21T13:00:00.000Z') + s * 1000).toISOString()),
  })

  it('con prendas escaneadas en el medio, son dos distintas', () => {
    // TOP_A se lee a los 0s y a los 60s; en el medio pasaron TOP_C y CORSET.
    const l = colgadasDeMas([dos(TOP_A, 0, 60), en(TOP_C, 20), en(CORSET, 40)])
    expect(l[0]).toMatchObject({ otrasEnMedio: 2, segundos: 60 })
  })

  /** 🔴 El caso que ⛔ no se puede afirmar: entraron pegadas. */
  it('sin nada en el medio, otrasEnMedio es CERO', () => {
    const l = colgadasDeMas([dos(TOP_A, 0, 12), en(TOP_C, 40)])
    expect(l[0]).toMatchObject({ otrasEnMedio: 0, segundos: 12 })
  })

  /**
   * 🔴 **Una prenda leída 3 veces son TRES momentos en el salón, ⛔ no uno.** Contándola como una
   * sola lectura, la ventana de la prenda de al lado saldría vacía cuando ⛔ no lo estaba — y una
   * repetida real se marcaría como dudosa.
   */
  it('las lecturas del medio de OTRA prenda repetida también cuentan', () => {
    const tres: EscaneoLibre = {
      ...en(TOP_C, 10),
      veces: 3,
      horas: [10, 20, 30].map((s) => new Date(Date.parse('2026-09-21T13:00:00.000Z') + s * 1000).toISOString()),
    }
    const l = colgadasDeMas([dos(TOP_A, 0, 60), tres])
    expect(l.find((c) => c.size === 'Beige')?.otrasEnMedio).toBe(3)
  })

  /**
   * ⚠️ **Las filas viejas ⛔ no tienen `horas`** —la columna nació el 21-sep-2026— y la cuenta tiene
   * que salir igual: se arma con `escaneado_en` y `ultimo_en`, que alcanzan para `veces = 2`.
   */
  it('una fila vieja, sin `horas`, se calcula con la primera y la última', () => {
    const vieja: EscaneoLibre = { ...en(TOP_A, 0), veces: 2, horas: null, ultimo_en: new Date(Date.parse('2026-09-21T13:00:00.000Z') + 60000).toISOString() }
    const l = colgadasDeMas([vieja, en(TOP_C, 20)])
    expect(l[0]).toMatchObject({ otrasEnMedio: 1, segundos: 60 })
  })
})

/**
 * 🔴 **El aviso que faltaba el 21-sep-2026.** Se declaró TOP con 77 % caminado, el mandado salió con
 * 58 tops que nunca habían pasado por el lector, y la chica volvió del depósito diciendo que muchos
 * ⛔ no estaban: estaban colgados en otro mueble. Bruno: *«no es tan fiable el chequeo y necesito
 * que sea fiable, porque sino me hace trabajar de más»*.
 */
describe('declaracionesFlojas — declarar lo que el recorrido ⛔ no caminó', () => {
  it('avisa del tipo declarado que ⛔ no se caminó, con cuántas prendas quedaron sin ver', () => {
    // De 3 TOP con stock se escaneó 1 ⇒ 33 %.
    const f = declaracionesFlojas(escanear([TOP_A]), LOCAL, ['TOP'])
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ tipo: 'TOP', sinVer: 2 })
    expect(f[0].cubierto).toBeCloseTo(1 / 3)
  })

  it('⛔ no avisa del que se caminó entero', () => {
    expect(declaracionesFlojas(escanear([TOP_A, TOP_B, TOP_C]), LOCAL, ['TOP'])).toEqual([])
  })

  /** ⚠️ El corte es 90 %: abajo de eso «⛔ no pasó por el lector» ⛔ no quiere decir «⛔ no está». */
  it('el corte es COBERTURA_FIABLE', () => {
    expect(COBERTURA_FIABLE).toBe(0.9)
  })

  it('primero el más flojo, que es el que más ensucia el mandado', () => {
    const corsets = [CORSET, { ...CORSET, barcode: 'b7', size: 'L' }, { ...CORSET, barcode: 'b8', size: 'XL' }]
    const local = [...LOCAL, ...corsets.slice(1)]
    // TOP: 1 de 3 (33 %) · CORSET: 2 de 3 (66 %)
    const f = declaracionesFlojas(escanear([TOP_A, CORSET, corsets[1]]), local, ['CORSET', 'TOP'])
    expect(f.map((x) => x.tipo)).toEqual(['TOP', 'CORSET'])
  })

  it('sin nada declarado ⛔ no avisa nada', () => {
    expect(declaracionesFlojas(escanear([TOP_A]), LOCAL, [])).toEqual([])
  })
})

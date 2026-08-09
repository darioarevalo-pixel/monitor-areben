import { describe, expect, it } from 'vitest'
import {
  agrupar,
  calibrar,
  CLAVES_PRESET,
  compararCtr,
  contextoUmbrales,
  derivarUmbrales,
  diasSeguidosPorEncima,
  evaluarRegla,
  faltanUmbrales,
  frecuenciaPico,
  PRESETS,
  UMBRALES,
  umbralesEfectivos,
  ventanaDe,
  type ClavePreset,
  type FilaRegla,
  type Umbrales,
} from '@/lib/meta-ads/reglas'

/**
 * Las automatizaciones son la primera cosa del módulo que corre SOLA y todos los días. No ejecuta
 * nada —propone—, así que el riesgo no es perder plata: es **el ruido**. Una regla que grita todos
 * los días se deja de mirar, y ahí se pierde también la que tenía razón.
 *
 * Por eso lo que más se prueba acá no es que detecte, sino **cuándo NO detecta**: el objeto pausado,
 * el que gastó poco, el que tiene frecuencia alta pero el CTR firme, y sobre todo la regla a la que
 * le falta un umbral, que tiene que quedarse callada con el motivo escrito en vez de inventar un
 * número.
 */

const HOY = '2026-08-08'

/** Una fila de snapshot con lo mínimo, para no repetir quince campos en cada caso. */
function fila(over: Partial<FilaRegla> = {}): FilaRegla {
  return {
    fecha: HOY,
    nivel: 'aviso',
    objeto_id: 'a1',
    cuenta_id: '1145878766790149',
    nombre: 'Aviso 1',
    linea: 'bdi',
    estado: 'ACTIVE',
    estado_efectivo: 'ACTIVE',
    estado_real: null,
    diario_crudo: null,
    spend: 0,
    impresiones: 0,
    frecuencia: null,
    clicks: 0,
    compras: 0,
    revenue: 0,
    ...over,
  }
}

/** N días consecutivos terminando en HOY, del más viejo al más nuevo. */
function dias(n: number, over: (i: number, fecha: string) => Partial<FilaRegla>): FilaRegla[] {
  return ventanaDe(HOY, n).reverse().map((fecha, i) => fila({ fecha, ...over(i, fecha) }))
}

/** El total de la línea vive en el nivel `campania`: es de ahí que sale el CPA derivado. */
function totalLinea(spend: number, compras: number, revenue = 0): FilaRegla[] {
  return [fila({ nivel: 'campania', objeto_id: 'c1', spend, compras, revenue })]
}

const regla = (preset: ClavePreset, parametros: Record<string, number> = {}) =>
  ({ preset, linea: 'bdi' as const, cuentaId: null, parametros })

describe('reglas — la forma de los presets', () => {
  it('cada preset declara un nivel, una ventana y umbrales que existen', () => {
    for (const k of CLAVES_PRESET) {
      const p = PRESETS[k]
      expect(['campania', 'conjunto', 'aviso'], `${k} tiene un nivel raro`).toContain(p.nivel)
      expect(p.ventana, `${k} tiene una ventana inválida`).toBeGreaterThan(0)
      for (const u of p.requiere) {
        expect(UMBRALES[u], `${k} pide el umbral '${u}', que no existe`).toBeTruthy()
      }
    }
  })

  /**
   * 🔑 Es la promesa que se le hizo a Bruno cuando dijo que no tenía los umbrales definidos: **tres
   * de los seis se prenden el día uno.** Si alguien le suma a uno de esos tres un umbral que no se
   * puede deducir, la promesa se rompe en silencio y la sección arranca entera apagada.
   *
   * ⚠️ «Se prende el día uno» NO es «no pide umbrales»: el freno de emergencia pide `gasto_minimo`
   * y aun así corre solo, porque ese número **se deduce** del CPA medido de la línea. Lo que define
   * el grupo es que todo lo que piden sea derivable, no que no pidan nada.
   */
  it('tres presets se prenden el día uno: todo lo que piden es deducible', () => {
    const solos = CLAVES_PRESET.filter((k) => PRESETS[k].requiere.every((u) => UMBRALES[u].derivable))
    expect(solos.sort()).toEqual(['atribucion-tardia', 'freno-emergencia', 'sin-avisos'])
    // Y los otros tres piden al menos una decisión de negocio, que es lo que los deja apagados.
    const conDial = CLAVES_PRESET.filter((k) => PRESETS[k].requiere.some((u) => !UMBRALES[u].derivable))
    expect(conDial.sort()).toEqual(['fatiga', 'ganador-escalar', 'gastos-hormiga'])
  })

  /**
   * Un preset que propone escribir tiene que decir con qué permiso, y ese permiso tiene que ser el
   * de la acción que ejecuta — nunca uno propio. Un sub nuevo son dos tildes por persona y por marca.
   */
  it('accionar un hallazgo pide el sub de la acción, no uno nuevo', () => {
    const subsQueExisten = new Set(['pausar', 'presupuesto', 'crear', 'pautar'])
    for (const k of CLAVES_PRESET) {
      expect(subsQueExisten, `${k} pide un sub-permiso que no existe`).toContain(PRESETS[k].sub)
    }
  })
})

describe('reglas — los umbrales', () => {
  it('sólo se autocompleta lo que es un HECHO medido, nunca una decisión de negocio', () => {
    // El ROAS mediano es lo que se OBTIENE, no lo que se QUIERE: autocompletarlo dejaría a la mitad
    // de la pauta permanentemente «por debajo del objetivo».
    expect(UMBRALES.roas_objetivo.derivable).toBe(false)
    expect(UMBRALES.frecuencia_maxima.derivable).toBe(false)
    expect(UMBRALES.cpa_maximo.derivable).toBe(false)
    expect(UMBRALES.techo_diario_crudo.derivable).toBe(false)
    expect(UMBRALES.gasto_minimo.derivable).toBe(true)
  })

  it('el gasto mínimo sale del CPA real de la línea', () => {
    // $90.000 y 9 compras ⇒ cada cliente costó $10.000.
    expect(derivarUmbrales(totalLinea(90000, 9)).gasto_minimo).toBe(10000)
  })

  it('sin una sola compra el CPA no existe y no se inventa un piso', () => {
    expect(derivarUmbrales(totalLinea(90000, 0)).gasto_minimo).toBeNull()
  })

  /**
   * 🔴 La misma plata está en los cuatro niveles de la tabla: el gasto de un aviso está también en
   * su conjunto y en su campaña. Sumar sin filtrar por nivel triplicaría `gastoTotal`, que es
   * justamente el número que se le muestra a una persona al lado del dial.
   */
  it('los totales de la línea salen de UN nivel: la misma plata está en los cuatro', () => {
    const filas = [
      fila({ nivel: 'campania', objeto_id: 'c1', spend: 1000, compras: 2, revenue: 5000 }),
      fila({ nivel: 'conjunto', objeto_id: 's1', spend: 1000, compras: 2, revenue: 5000 }),
      fila({ nivel: 'aviso', objeto_id: 'a1', spend: 1000, compras: 2, revenue: 5000 }),
    ]
    const ctx = contextoUmbrales(filas)
    expect(ctx.gastoTotal).toBe(1000)
    expect(ctx.roasMedio).toBe(5)
    expect(derivarUmbrales(filas).gasto_minimo).toBe(500)
  })

  it('lo de la regla pisa lo de la línea, y un null no pisa nada', () => {
    const u = umbralesEfectivos(
      { parametros: { roas_objetivo: 4 } },
      { roas_objetivo: 2, cpa_maximo: 900, gasto_minimo: null },
      { gasto_minimo: 7000 },
    )
    expect(u.roas_objetivo).toBe(4)
    expect(u.cpa_maximo).toBe(900)
    // El `null` explícito de la línea NO pisa el derivado: pisar con «no definido» sería borrar.
    expect(u.gasto_minimo).toBe(7000)
  })

  it('faltanUmbrales sólo mira los que el preset pide', () => {
    const vacio = umbralesEfectivos(null, null, null)
    expect(faltanUmbrales('sin-avisos', vacio)).toEqual([])
    expect(faltanUmbrales('gastos-hormiga', vacio)).toEqual(['roas_objetivo'])
    expect(faltanUmbrales('ganador-escalar', vacio).sort()).toEqual(['roas_objetivo', 'techo_diario_crudo'])
  })
})

describe('reglas — agrupar y las dos trampas del dato', () => {
  /**
   * 🔴 LA aserción que vale por todo el archivo, junto con la de abajo.
   *
   * `alcance` y `frecuencia` son dedup dentro del período que se le pidió a Meta: sumar siete días
   * cuenta siete veces a quien vio el aviso los siete días. El número sale inflado y creíble, que es
   * lo peor que puede pasar — la regla de fatiga gritaría sobre todo lo que entrega.
   */
  it('la frecuencia es el PICO de un día, jamás la suma de la ventana', () => {
    const filas = dias(4, (i) => ({ frecuencia: [1.2, 3.4, 2.1, 1.8][i], spend: 100 }))
    expect(frecuenciaPico(filas)).toBe(3.4)
    const [g] = agrupar(filas, 'aviso', ventanaDe(HOY, 4))
    expect(g.frecuenciaPico).toBe(3.4)
    // La suma sería 8,5. Que no aparezca por ningún lado es el punto.
    expect(g.frecuenciaPico).not.toBe(8.5)
  })

  /** El ROAS de los totales, no el promedio de los ROAS diarios: un día de $10 pesaría igual que uno de $10.000. */
  it('el ROAS del grupo se recalcula desde los agregados', () => {
    const filas = [
      fila({ fecha: '2026-08-07', spend: 100, revenue: 1000 }),
      fila({ fecha: HOY, spend: 900, revenue: 900 }),
    ]
    const [g] = agrupar(filas, 'aviso', ventanaDe(HOY, 2))
    expect(g.roas).toBe(1.9) // 1900 / 1000, no (10 + 1) / 2
  })

  it('la última fila manda para el estado y el nombre, no la más vieja', () => {
    const filas = [
      fila({ fecha: '2026-08-07', nombre: 'Nombre viejo', estado_efectivo: 'ACTIVE' }),
      fila({ fecha: HOY, nombre: 'Nombre nuevo', estado_efectivo: 'PAUSED' }),
    ]
    const [g] = agrupar(filas, 'aviso', ventanaDe(HOY, 2))
    expect(g.nombre).toBe('Nombre nuevo')
    expect(g.ultima.estado_efectivo).toBe('PAUSED')
  })

  it('el CTR se compara por mitades y se recalcula desde clics e impresiones', () => {
    const filas = dias(4, (i) => ({ impresiones: 1000, clicks: [30, 30, 10, 10][i] }))
    const c = compararCtr(filas)
    expect(c?.antes).toBe(3)
    expect(c?.despues).toBe(1)
    expect(c?.cae).toBe(true)
  })

  it('con menos de cuatro días no se habla de tendencia', () => {
    expect(compararCtr(dias(3, () => ({ impresiones: 100, clicks: 5 })))).toBeNull()
  })

  /** «Tres días seguidos» son los tres ÚLTIMOS: una racha de la semana pasada, cortada ayer, no cuenta. */
  it('los días seguidos se cuentan desde el más reciente hacia atrás', () => {
    // roas: 5, 5, 5, 1 (el último día rompe la racha)
    const filas = dias(4, (i) => ({ spend: 100, revenue: i === 3 ? 100 : 500 }))
    expect(diasSeguidosPorEncima(filas, 3)).toBe(0)
    // roas: 1, 5, 5, 5 ⇒ los tres últimos
    const buenos = dias(4, (i) => ({ spend: 100, revenue: i === 0 ? 100 : 500 }))
    expect(diasSeguidosPorEncima(buenos, 3)).toBe(3)
  })

  it('un día sin gasto CORTA la racha en vez de saltearse', () => {
    // roas: 5, —, 5, 5. El día sin entrega no confirmó nada.
    const filas = dias(4, (i) => ({ spend: i === 1 ? 0 : 100, revenue: i === 1 ? 0 : 500 }))
    expect(diasSeguidosPorEncima(filas, 3)).toBe(2)
  })
})

describe('reglas — la regla apagada', () => {
  /**
   * 🔴 La segunda aserción que vale por todo el archivo.
   *
   * Sin umbral cargado, la regla NO puede gritar contra un default silencioso: un aviso con un
   * número inventado enseña a ignorar los avisos. Y tiene que decir POR QUÉ está callada, o el
   * silencio se lee como que la sección está rota.
   */
  it('sin umbral no devuelve hallazgos, y explica cuál falta', () => {
    const filas = [
      ...totalLinea(90000, 9, 100000),
      ...dias(7, () => ({ spend: 5000, compras: 1, revenue: 5000 })),
    ]
    const r = evaluarRegla(regla('gastos-hormiga'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.apagada).toBe(true)
    expect(r.hallazgos).toEqual([])
    expect(r.faltan).toEqual(['roas_objetivo'])
    expect(r.detalle).toContain('ROAS objetivo')
  })

  /** La contracara: los que no piden umbral tienen que producir con la tabla de umbrales VACÍA. */
  it('«se quedó sin avisos» corre aunque no haya nada definido', () => {
    const filas = [fila({ nivel: 'conjunto', objeto_id: 's1', estado_real: 'avisos-desactivados' })]
    const r = evaluarRegla(regla('sin-avisos'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.apagada).toBe(false)
    expect(r.hallazgos).toHaveLength(1)
  })

  /**
   * 🔴 El estado sólo se escribe en la fila del día en que se sacó la foto: Meta no expone la
   * configuración hacia atrás, así que el backfill de 90 días trajo métricas y **un solo día** de
   * estado. Una regla que detecta una transición no puede decir nada con eso — y decir «0 saltos en
   * 90 días» sería peor que callarse, porque se lee como «esto no pasa nunca».
   */
  it('el radar avisa que le falta historial en vez de mostrar un cero que miente', () => {
    const filas = dias(7, (i) => ({
      objeto_id: 'a1', compras: 1, revenue: 8000,
      // Sólo el último día trae estado, como pasa después de un backfill.
      estado: i === 6 ? 'PAUSED' : null, estado_efectivo: i === 6 ? 'PAUSED' : null,
    }))
    const r = evaluarRegla(regla('atribucion-tardia'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.apagada).toBe(true)
    expect(r.faltan).toEqual([])
    expect(r.detalle).toContain('un solo día de historial')
    expect(r.detalle).toContain('el cron')
  })

  /**
   * El freno de emergencia pide `gasto_minimo`, pero ése se DEDUCE del CPA de la línea: mientras la
   * línea haya vendido algo alguna vez, la regla corre sin que nadie configure nada. Es lo que la
   * pone en el grupo de las tres que se prenden el día uno.
   */
  it('el freno de emergencia corre sin configurar nada, porque su piso se deduce', () => {
    const filas = [
      ...totalLinea(90000, 9, 400000), // CPA medido: $10.000
      ...dias(7, () => ({ objeto_id: 'a-quemado', spend: 3000, compras: 0 })), // $21.000 sin vender
    ]
    const r = evaluarRegla(regla('freno-emergencia'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.apagada).toBe(false)
    expect(r.hallazgos).toHaveLength(1)
    expect(r.hallazgos[0].motivo).toContain('sin una sola compra')
    expect(r.hallazgos[0].sugerencia).toMatchObject({ accion: 'estado', status: 'PAUSED' })
  })

  it('y se queda callado si la línea nunca vendió: sin CPA no hay con qué decir cuánto es mucho', () => {
    const filas = [
      ...totalLinea(90000, 0),
      ...dias(7, () => ({ objeto_id: 'a-quemado', spend: 3000, compras: 0 })),
    ]
    const r = evaluarRegla(regla('freno-emergencia'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.apagada).toBe(true)
    expect(r.faltan).toEqual(['gasto_minimo'])
  })
})

describe('reglas — el radar de atribución tardía es un EVENTO, no un estado', () => {
  /**
   * 🔴 **El defecto que sólo apareció corriendo el calibrador contra los 90 días reales**, y que
   * ningún test previo cazaba: la primera versión decía «está pausado y tuvo compras», que es cierto
   * PARA SIEMPRE. Un aviso saltaba **81 días seguidos** y otro 76. Una regla que grita todos los
   * días se deja de mirar, y ahí se pierde también la que tenía razón.
   *
   * Lo que la vuelve un evento es que la pausa haya pasado adentro de la ventana.
   */
  it('no grita por algo que está apagado desde antes de la ventana', () => {
    const filas = dias(7, () => ({
      objeto_id: 'a-viejo', estado: 'PAUSED', estado_efectivo: 'PAUSED', compras: 2, revenue: 90000,
    }))
    const r = evaluarRegla(regla('atribucion-tardia'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.apagada).toBe(false)
    expect(r.hallazgos).toEqual([])
  })

  it('sí grita cuando lo pausaste adentro de la ventana y siguió vendiendo', () => {
    const filas = dias(7, (i) => ({
      objeto_id: 'a-recien',
      estado: i < 4 ? 'ACTIVE' : 'PAUSED',
      estado_efectivo: i < 4 ? 'ACTIVE' : 'PAUSED',
      spend: i < 4 ? 3000 : 0,
      // Las compras de los días apagados son las que cuentan.
      compras: i >= 4 ? 1 : 0,
      revenue: i >= 4 ? 20000 : 0,
    }))
    const r = evaluarRegla(regla('atribucion-tardia'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toHaveLength(1)
    expect(r.hallazgos[0].motivo).toContain('Lo pausaste hace 3 días')
    expect(r.hallazgos[0].evidencia).toMatchObject({ compras: 3, dias_apagado: 3 })
    expect(r.hallazgos[0].sugerencia).toMatchObject({ accion: 'estado', status: 'ACTIVE' })
  })

  /** Vender MIENTRAS estaba al aire no es atribución tardía: es haber pausado algo que andaba. */
  it('no cuenta las compras de cuando todavía estaba al aire', () => {
    const filas = dias(7, (i) => ({
      objeto_id: 'a-vendia',
      estado: i < 4 ? 'ACTIVE' : 'PAUSED',
      estado_efectivo: i < 4 ? 'ACTIVE' : 'PAUSED',
      spend: i < 4 ? 3000 : 0,
      compras: i < 4 ? 5 : 0,
      revenue: i < 4 ? 90000 : 0,
    }))
    const r = evaluarRegla(regla('atribucion-tardia'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toEqual([])
  })

  it('y no grita por algo que sigue al aire', () => {
    const filas = dias(7, () => ({ objeto_id: 'a-viva', spend: 3000, compras: 2, revenue: 50000 }))
    const r = evaluarRegla(regla('atribucion-tardia'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toEqual([])
  })
})

describe('reglas — cuándo NO detecta (que es lo que evita el ruido)', () => {
  const conCpa = totalLinea(90000, 9, 400000) // CPA $10.000

  it('el freno no grita por algo que gastó menos que un cliente', () => {
    const filas = [...conCpa, ...dias(7, () => ({ objeto_id: 'a-chico', spend: 500, compras: 0 }))]
    const r = evaluarRegla(regla('freno-emergencia'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toEqual([])
  })

  it('el freno no grita por algo ya pausado: no está quemando nada', () => {
    const filas = [...conCpa, ...dias(7, () => ({ objeto_id: 'a-off', spend: 3000, compras: 0, estado_efectivo: 'PAUSED' }))]
    const r = evaluarRegla(regla('freno-emergencia'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toEqual([])
  })

  /** Frecuencia alta con el CTR firme es un público chico, no fatiga. Sin esto gritaría sobre todo remarketing. */
  it('la fatiga no grita con frecuencia alta si el CTR NO cae', () => {
    const filas = dias(6, () => ({ objeto_id: 'a-rmk', spend: 1000, frecuencia: 6, impresiones: 1000, clicks: 30 }))
    const r = evaluarRegla(regla('fatiga', { frecuencia_maxima: 3 }), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toEqual([])
  })

  it('y sí grita cuando la frecuencia pasa el máximo Y el CTR cayó', () => {
    const filas = dias(6, (i) => ({
      objeto_id: 'a-quemado', spend: 1000, frecuencia: 1 + i, impresiones: 1000, clicks: i < 3 ? 40 : 8,
    }))
    const r = evaluarRegla(regla('fatiga', { frecuencia_maxima: 3 }), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toHaveLength(1)
    expect(r.hallazgos[0].motivo).toContain('Está quemado')
    // No propone una escritura: renovar un creativo no es un POST.
    expect(r.hallazgos[0].sugerencia).toBeNull()
  })

  it('gastos hormiga ignora lo que no vendió nada: de eso ya habla el freno', () => {
    const filas = dias(7, () => ({ objeto_id: 'a-cero', spend: 2000, compras: 0, revenue: 0 }))
    const r = evaluarRegla(regla('gastos-hormiga', { roas_objetivo: 3 }), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toEqual([])
  })

  it('el escalón no se propone si ya está en el techo', () => {
    const filas = dias(5, () => ({
      nivel: 'conjunto', objeto_id: 's-ganador', spend: 1000, revenue: 8000, compras: 4, diario_crudo: 500000,
    }))
    const r = evaluarRegla(regla('ganador-escalar', { roas_objetivo: 3, techo_diario_crudo: 500000 }), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toEqual([])
  })

  it('el escalón propone +20% y nunca pasa el techo', () => {
    const filas = dias(5, () => ({
      nivel: 'conjunto', objeto_id: 's-ganador', spend: 1000, revenue: 8000, compras: 4, diario_crudo: 100000,
    }))
    const r = evaluarRegla(regla('ganador-escalar', { roas_objetivo: 3, techo_diario_crudo: 110000 }), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toHaveLength(1)
    // +20% daría 120.000, pero el techo es 110.000.
    expect(r.hallazgos[0].sugerencia).toMatchObject({ accion: 'presupuesto', daily_budget: '110000' })
  })

  /** Un conjunto sin presupuesto propio lo hereda de una campaña con CBO: no hay escalón que dar ahí. */
  it('el escalón no se propone sobre un conjunto sin presupuesto propio', () => {
    const filas = dias(5, () => ({
      nivel: 'conjunto', objeto_id: 's-cbo', spend: 1000, revenue: 8000, compras: 4, diario_crudo: null,
    }))
    const r = evaluarRegla(regla('ganador-escalar', { roas_objetivo: 3, techo_diario_crudo: 999999 }), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toEqual([])
  })
})

describe('reglas — el corte por línea y por cuenta', () => {
  it('una regla sólo mira su línea', () => {
    const filas = [
      ...totalLinea(90000, 9, 400000),
      ...dias(7, () => ({ objeto_id: 'a-otra', linea: 'stunned', spend: 3000, compras: 0 })),
    ]
    const r = evaluarRegla(regla('freno-emergencia'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toEqual([])
  })

  /** Las dos grafías: la fila de la base trae `cuenta_id` y el tipo de la app usa `cuentaId`. */
  it('acota por cuenta con cualquiera de las dos grafías', () => {
    const filas = [
      ...totalLinea(90000, 9, 400000),
      ...dias(7, () => ({ objeto_id: 'a-otra-cuenta', cuenta_id: '999', spend: 3000, compras: 0 })),
    ]
    for (const acotada of [
      { preset: 'freno-emergencia' as const, linea: 'bdi' as const, parametros: {}, cuentaId: '1145878766790149' },
      { preset: 'freno-emergencia' as const, linea: 'bdi' as const, parametros: {}, cuenta_id: '1145878766790149' },
    ]) {
      const r = evaluarRegla(acotada, { filas, umbralLinea: null, hasta: HOY })
      if (!r.ok) throw new Error(r.error)
      expect(r.hallazgos).toEqual([])
    }
  })
})

describe('reglas — el calibrador', () => {
  /**
   * 🎯 El calibrador es lo que hace elegible un umbral sin definirlo de antemano. Su valor entero
   * depende de que sea **la misma función** que la regla: si dijera 6 y la regla gritara 40, se
   * dejaría de confiar en la herramienta completa.
   */
  it('mover el umbral cambia cuántas veces habría saltado', () => {
    const filas = dias(30, () => ({ objeto_id: 'a1', spend: 1000, compras: 1, revenue: 2000 }))
    const flojo = calibrar(regla('gastos-hormiga', { roas_objetivo: 1.5 }), { filas, umbralLinea: null, hasta: HOY, dias: 30 })
    const duro = calibrar(regla('gastos-hormiga', { roas_objetivo: 5 }), { filas, umbralLinea: null, hasta: HOY, dias: 30 })
    if (!flojo.ok || !duro.ok) throw new Error('el calibrador falló')
    // Con objetivo 1,5 un ROAS de 2 lo cumple: no salta nunca.
    expect(flojo.total).toBe(0)
    // Con objetivo 5 no lo cumple ningún día.
    expect(duro.total).toBeGreaterThan(0)
  })

  /**
   * Los dos números juntos son el dato: 30 saltos sobre 1 objeto es una regla repetitiva, 30 sobre
   * 30 es una regla que encontró algo. Uno solo de los dos se lee mal.
   */
  it('distingue cuántas veces gritó de a cuántas cosas distintas señaló', () => {
    const filas = dias(30, () => ({ objeto_id: 'a-unico', spend: 1000, compras: 1, revenue: 1000 }))
    const c = calibrar(regla('gastos-hormiga', { roas_objetivo: 5 }), { filas, umbralLinea: null, hasta: HOY, dias: 30 })
    if (!c.ok) throw new Error('falló')
    expect(c.objetos).toBe(1)
    expect(c.total).toBeGreaterThan(1)
    expect(c.ejemplos[0].veces).toBe(c.total)
  })

  it('una regla apagada calibra en cero y dice por qué', () => {
    const c = calibrar(regla('gastos-hormiga'), { filas: [], umbralLinea: null, hasta: HOY, dias: 30 })
    if (!c.ok) throw new Error('falló')
    expect(c.apagada).toBe(true)
    expect(c.total).toBe(0)
    expect(c.detalle).toContain('ROAS objetivo')
  })
})

/**
 * 🔴 **La forma REAL del dato, que ningún test de este archivo tenía**: la configuración (`estado`,
 * `estado_real`, `diario_crudo`) se escribe **sólo en la fila del día en que se sacó la foto**, así
 * que las filas del backfill traen métricas y el estado en `null`. Todas las series de arriba usan
 * `fila()`, que pone `estado: 'ACTIVE'` en las 30 — y por eso los 43 tests pasaban con el calibrador
 * ciego.
 *
 * Medido contra la pauta real el 9-ago-2026: de 90 días de foto, **2 tenían la configuración escrita**.
 * `freno-emergencia` reportaba 8 saltos en 2 días donde había 86 en 41; `ganador-escalar` con el ROAS
 * en 1,5×, 1 salto en 1 día donde había 34 en 27. La herramienta que existe para elegir un umbral
 * mirando la historia estaba mirando anteayer, y contestaba un número chico en vez de decir que no
 * veía.
 *
 * Ver la cabecera de `agrupar()`. El mismo patrón que el día en curso en los escalones: no lo caza
 * un test más, lo caza un test con **la forma del dato de producción** adentro.
 */
describe('reglas — la configuración vive en una sola fila, y el calibrador tiene que verla igual', () => {
  /** N días de métricas donde SÓLO los últimos `conConfig` traen estado, como en la tabla de verdad. */
  function serieComoEnProduccion(n: number, conConfig: number, over: (i: number) => Partial<FilaRegla> = () => ({})): FilaRegla[] {
    return ventanaDe(HOY, n).reverse().map((fecha, i) => fila({
      fecha,
      ...over(i),
      // Los viejos: métricas sí, configuración no. Es lo que devuelve el backfill.
      ...(i < n - conConfig ? { estado: null, estado_efectivo: null, estado_real: null, diario_crudo: null } : {}),
    }))
  }

  it('agrupar separa la última fila de la VENTANA de la última foto de CONFIGURACIÓN', () => {
    const filas = serieComoEnProduccion(10, 1, () => ({ spend: 100 }))
    // Una ventana que termina antes del único día con configuración.
    const [g] = agrupar(filas, 'aviso', ventanaDe('2026-08-04', 3))
    expect(g.ultima.fecha).toBe('2026-08-04')
    expect(g.ultima.estado_efectivo).toBeNull()
    // `actual` sale de fuera de la ventana: es la pregunta «¿esto está al aire?», que es sobre ahora.
    expect(g.actual.fecha).toBe(HOY)
    expect(g.actual.estado_efectivo).toBe('ACTIVE')
  })

  it('sin ninguna fila con configuración, `actual` cae en la última de la ventana', () => {
    const filas = serieComoEnProduccion(5, 0, () => ({ spend: 100 }))
    const [g] = agrupar(filas, 'aviso', ventanaDe(HOY, 5))
    expect(g.actual.fecha).toBe(g.ultima.fecha)
  })

  /**
   * 🎯 **El test que caza el defecto.** Con `g.ultima` da 1 (sólo el día que tiene estado escrito);
   * con `g.actual`, los 24 días en que la condición se cumplía.
   */
  it('el calibrador ve los 30 días aunque el estado esté escrito en uno solo', () => {
    const filas = serieComoEnProduccion(30, 1, () => ({ spend: 1000, compras: 1, revenue: 1000 }))
    const c = calibrar(regla('gastos-hormiga', { roas_objetivo: 5 }), { filas, umbralLinea: null, hasta: HOY, dias: 30 })
    if (!c.ok) throw new Error('falló')
    // Con el defecto puesto esto valía 1: el único día con configuración escrita.
    expect(c.total).toBeGreaterThan(20)
  })

  it('el freno de emergencia también, y con el gasto mínimo derivado de la propia serie', () => {
    const filas = serieComoEnProduccion(30, 1, () => ({ spend: 1000, compras: 0, revenue: 0 }))
    // Sin una sola compra en la línea el CPA no existe, así que se le da el umbral a mano.
    const c = calibrar(regla('freno-emergencia', { gasto_minimo: 500 }), { filas, umbralLinea: null, hasta: HOY, dias: 30 })
    if (!c.ok) throw new Error('falló')
    expect(c.total).toBeGreaterThan(20)
  })

  it('el ganador para escalar lee el diario de la foto de configuración, no de la fila vieja', () => {
    // 🔴 Este preset es de nivel `conjunto`, no `aviso`: con el nivel de más arriba `agrupar()` no
    // encuentra ningún grupo y el test daría cero por un motivo que no es el que se está probando.
    const filas = serieComoEnProduccion(30, 1, () => ({ nivel: 'conjunto', spend: 1000, compras: 1, revenue: 5000, diario_crudo: 100000 }))
    const c = calibrar(regla('ganador-escalar', { roas_objetivo: 1.5, techo_diario_crudo: 999999 }), { filas, umbralLinea: null, hasta: HOY, dias: 30 })
    if (!c.ok) throw new Error('falló')
    expect(c.total).toBeGreaterThan(20)
  })

  /**
   * 🔴 **Y la contracara: el radar de atribución tardía NO puede usar `actual`.** Él detecta una
   * transición adentro de la ventana; leerle el estado de hoy sería decir «se apagó el jueves» porque
   * hoy está pausado. Tiene que seguir viendo el objeto como ACTIVO cuando la ventana termina en un
   * día en que lo estaba, aunque hoy figure apagado.
   */
  it('el radar de atribución tardía sigue mirando la ventana y no el estado de hoy', () => {
    const filas = [
      ...ventanaDe('2026-08-05', 3).reverse().map((fecha) => fila({ fecha, spend: 500, estado: 'ACTIVE', estado_efectivo: 'ACTIVE' })),
      fila({ fecha: '2026-08-06', spend: 0, compras: 2, revenue: 4000, estado: 'PAUSED', estado_efectivo: 'PAUSED' }),
      fila({ fecha: HOY, spend: 0, compras: 0, revenue: 0, estado: 'PAUSED', estado_efectivo: 'PAUSED' }),
    ]
    // Ventana que termina el 06: ahí adentro pasó de activo a apagado y sumó compras. Salta.
    const r = evaluarRegla(regla('atribucion-tardia'), { filas, umbralLinea: null, hasta: '2026-08-06' })
    if (!r.ok) throw new Error('falló')
    expect(r.apagada).toBe(false)
    expect(r.hallazgos).toHaveLength(1)
    // Ventana que termina el 05, cuando todavía estaba al aire: no hay transición que contar.
    const antes = evaluarRegla(regla('atribucion-tardia'), { filas, umbralLinea: null, hasta: '2026-08-05' })
    if (!antes.ok) throw new Error('falló')
    expect(antes.hallazgos).toHaveLength(0)
  })
})

describe('reglas — el borde', () => {
  it('un preset que no existe es un 400, no una excepción', () => {
    const r = evaluarRegla({ preset: 'inventado' as ClavePreset, linea: 'bdi', cuentaId: null, parametros: {} }, { filas: [], umbralLinea: null, hasta: HOY })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('debería fallar')
    expect(r.status).toBe(400)
  })

  it('sin filas no rompe: devuelve cero hallazgos', () => {
    const r = evaluarRegla(regla('sin-avisos'), { filas: [], umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    expect(r.hallazgos).toEqual([])
  })

  it('la ventana incluye el día pedido y va de más nueva a más vieja', () => {
    expect(ventanaDe(HOY, 3)).toEqual(['2026-08-08', '2026-08-07', '2026-08-06'])
  })

  it('los hallazgos vienen del más caro al más barato', () => {
    const filas = [
      ...totalLinea(90000, 9, 400000),
      ...dias(7, () => ({ objeto_id: 'barato', spend: 2000, compras: 0 })),
      ...dias(7, () => ({ objeto_id: 'caro', spend: 9000, compras: 0 })),
    ]
    const r = evaluarRegla(regla('freno-emergencia'), { filas, umbralLinea: null, hasta: HOY })
    if (!r.ok) throw new Error(r.error)
    // 🔑 En snake: lo que devuelve el core es la FILA que el script upsertea, no el objeto que
    // sirve el handler. Ver `HallazgoNuevo`.
    expect(r.hallazgos.map((h) => h.objeto_id)).toEqual(['caro', 'barato'])
  })
})

/** El tipo `Umbrales` tiene que cubrir todas las claves de `UMBRALES`, o `faltanUmbrales` miente. */
describe('reglas — el espejo de umbrales', () => {
  it('el tipo y la tabla tienen las mismas claves', () => {
    const vacio: Umbrales = umbralesEfectivos(null, null, null)
    expect(Object.keys(vacio).sort()).toEqual(Object.keys(UMBRALES).sort())
  })
})

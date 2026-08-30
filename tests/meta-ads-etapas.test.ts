import { describe, it, expect } from 'vitest'
import {
  diagnosticar,
  etapaDeObjetivo,
  ETAPA_POR_OBJETIVO,
  mapaOverrides,
  overrideViejo,
  RESUMEN_ETAPA,
  UMBRALES_ETAPA,
} from '@/lib/meta-ads/etapas'
import { censoDeLaFoto, estaAlAire, OBJETIVOS_TRAFICO, OBJETIVOS_VENTA } from '@/lib/meta-ads/etapas.core.js'
import type { CampañaEtapa, Etapa } from '@/lib/meta-ads/tipos'

/**
 * El criterio del diagnóstico de etapas. Se testea acá y no en el endpoint porque `api/*.js` no
 * se testea por convención (ver `tests/meta-ads-cliente.test.ts`): el endpoint solo trae filas de
 * Meta, y todo lo que se puede decidir mal —la clasificación, qué cuenta como "al aire", cuándo una
 * etapa está floja y qué frase se muestra— vive en estas funciones puras.
 */

let n = 0
const camp = (p: Partial<CampañaEtapa> & { objetivo?: string | null }): CampañaEtapa => ({
  id: `c${++n}`,
  nombre: `Campaña ${n}`,
  cuentaId: '1',
  objetivo: p.objetivo ?? 'OUTCOME_TRAFFIC',
  etapaAuto: etapaDeObjetivo(p.objetivo ?? 'OUTCOME_TRAFFIC'),
  estado: 'ACTIVE',
  spend: 1000,
  impressions: 0,
  clicks: 0,
  purchases: 0,
  revenue: 0,
  ...p,
})

/** N campañas al aire de una etapa, con el objetivo canónico de cada una. */
const alAire = (etapa: Etapa, cuantas: number, spend = 1000) =>
  Array.from({ length: cuantas }, () =>
    camp({ objetivo: { tofu: 'OUTCOME_TRAFFIC', mofu: 'OUTCOME_LEADS', bofu: 'OUTCOME_SALES' }[etapa], spend }),
  )

describe('clasificación por objetivo', () => {
  it('manda cada objetivo conocido a su etapa', () => {
    expect(etapaDeObjetivo('OUTCOME_AWARENESS')).toBe('tofu')
    expect(etapaDeObjetivo('VIDEO_VIEWS')).toBe('tofu')
    expect(etapaDeObjetivo('OUTCOME_TRAFFIC')).toBe('tofu')
    expect(etapaDeObjetivo('OUTCOME_LEADS')).toBe('mofu')
    expect(etapaDeObjetivo('MESSAGES')).toBe('mofu')
    expect(etapaDeObjetivo('OUTCOME_SALES')).toBe('bofu')
    expect(etapaDeObjetivo('CATALOG_SALES')).toBe('bofu')
  })

  it('lo desconocido NO cae a tofu: cae a sin-clasificar', () => {
    // Asignar por descarte inventaría el diagnóstico. Es preferible admitir que no se sabe y
    // pedir que lo corrijan a mano — de ahí el bloque "sin clasificar" de la pantalla.
    expect(etapaDeObjetivo('OBJETIVO_QUE_META_INVENTE_MAÑANA')).toBe('sin-clasificar')
    expect(etapaDeObjetivo(null)).toBe('sin-clasificar')
    expect(etapaDeObjetivo('')).toBe('sin-clasificar')
    expect(etapaDeObjetivo('APP_INSTALLS')).toBe('sin-clasificar')
  })

  it('no le importan mayúsculas ni espacios', () => {
    expect(etapaDeObjetivo(' outcome_sales ')).toBe('bofu')
  })

  /**
   * La invariante que justifica que los dos mapas vivan en el mismo archivo. `OBJETIVOS_VENTA`
   * alimenta el ROAS de venta, la UI del Resumen y el detector gerencial; `ETAPA_POR_OBJETIVO`
   * alimenta esta pantalla. Si se despegan, la misma campaña sería "de venta" en un lado y de otra
   * etapa en el otro, y nadie se enteraría hasta que los números no cerraran.
   */
  it('todo objetivo de venta es de la etapa de compra, y todo objetivo de tráfico de la primera', () => {
    for (const o of OBJETIVOS_VENTA) expect(etapaDeObjetivo(o), o).toBe('bofu')
    for (const o of OBJETIVOS_TRAFICO) expect(etapaDeObjetivo(o), o).toBe('tofu')
  })

  it('cada etapa real tiene su texto de ayuda completo', () => {
    for (const e of ['tofu', 'mofu', 'bofu'] as Etapa[]) {
      const r = RESUMEN_ETAPA[e]
      expect(r.aQuien, e).toBeTruthy()
      expect(r.queCreativo, e).toBeTruthy()
      expect(r.queNoVa, e).toBeTruthy()
      expect(r.comoSabes, e).toBeTruthy()
    }
  })

  it('los objetivos del mapa apuntan a una etapa válida', () => {
    for (const [obj, etapa] of Object.entries(ETAPA_POR_OBJETIVO)) {
      expect(['tofu', 'mofu', 'bofu', 'sin-clasificar'], obj).toContain(etapa)
    }
  })
})

// El mapa `cuenta publicitaria → marca` se borró el 5-ago-2026: las tres marcas se pautean desde la
// MISMA cuenta, así que no existía ningún valor correcto para cargarle. La atribución bajó a nivel
// campaña y sus tests viven en `tests/meta-ads-lineas.test.ts`.

describe('qué cuenta como "al aire"', () => {
  it('exige activa Y con gasto', () => {
    const d = diagnosticar([
      ...alAire('tofu', 2),
      // Activa pero sin entregar: no tapa el hueco, va aparte.
      camp({ objetivo: 'OUTCOME_LEADS', estado: 'ACTIVE', spend: 0 }),
      // Pausada ayer, pero con gasto en la ventana de 30 días: tampoco está al aire.
      camp({ objetivo: 'OUTCOME_SALES', estado: 'PAUSED', spend: 5000 }),
    ])
    const mofu = d.etapas.find((e) => e.etapa === 'mofu')!
    const bofu = d.etapas.find((e) => e.etapa === 'bofu')!
    expect(mofu.alAire).toHaveLength(0)
    expect(mofu.sinEntrega).toHaveLength(1)
    expect(bofu.alAire).toHaveLength(0)
    expect(bofu.sinEntrega).toHaveLength(0)
    // 🔴 La pausada tiene que caer en ALGÚN lado. Antes no caía en ninguno y desaparecía de la
    // pantalla entera: ni al aire, ni «activa sin entrega», ni «sin asignar» (tiene marca).
    expect(bofu.pausadas).toHaveLength(1)
  })

  /**
   * 🔴 **La invariante que faltaba: ninguna campaña se cae de la pantalla.**
   *
   * `alAire` + `sinEntrega` + `pausadas` reparten TODAS las campañas clasificadas, y `sinClasificar`
   * se lleva el resto. Sin `pausadas`, una campaña apagada no aparecía en ningún lado — y ese era el
   * motivo de fondo de que «Reactivar» fuese código muerto a nivel campaña: el botón existía, pero
   * la fila que lo dibuja nunca llegaba a la tabla.
   */
  it('los cortes reparten TODAS las campañas, sin dejar ninguna afuera', () => {
    const campañas = [
      ...alAire('tofu', 2),
      camp({ objetivo: 'OUTCOME_LEADS', estado: 'ACTIVE', spend: 0 }),
      camp({ objetivo: 'OUTCOME_SALES', estado: 'PAUSED', spend: 5000 }),
      camp({ objetivo: 'OUTCOME_TRAFFIC', estado: 'PAUSED', spend: 0 }),
      // Estados de Meta que no son ni ACTIVE ni PAUSED: también son «no está entregando».
      camp({ objetivo: 'OUTCOME_TRAFFIC', estado: 'WITH_ISSUES', spend: 0 }),
      camp({ objetivo: 'APP_INSTALLS', estado: 'PAUSED', spend: 0 }),
    ]
    const d = diagnosticar(campañas)
    const vistas = d.etapas.flatMap((e) => [...e.alAire, ...e.sinEntrega, ...e.pausadas]).concat(d.sinClasificar)
    expect(vistas).toHaveLength(campañas.length)
    // Y ninguna aparece dos veces: los cortes son excluyentes, no solapados.
    expect(new Set(vistas.map((c) => c.id)).size).toBe(campañas.length)
  })

  it('una pausada NO cuenta como pauta al aire ni mueve el veredicto', () => {
    // Si contaran, apagar toda la pauta de una etapa dejaría el diagnóstico diciendo que está cubierta.
    const conPausadas = diagnosticar([...alAire('tofu', 3), camp({ objetivo: 'OUTCOME_LEADS', estado: 'PAUSED', spend: 9000 })])
    const sinEllas = diagnosticar(alAire('tofu', 3))
    expect(conPausadas.etapas.find((e) => e.etapa === 'mofu')!.estado).toBe('vacia')
    expect(conPausadas.veredicto.titulo).toBe(sinEllas.veredicto.titulo)
    expect(conPausadas.totalAlAire).toBe(sinEllas.totalAlAire)
  })

  /**
   * El censo del servidor (`api/meta-ads.js`) usa ESTA función para decidir qué campañas sin marca
   * se reclaman en ámbar. Si las dos reglas se separan, la pantalla reclama campañas que después no
   * cuenta: pasó con un `||` que metía en el cartel las publicaciones de Instagram promocionadas
   * —Meta le arma una campaña a cada posteo y quedan `ACTIVE` para siempre—, 26 filas de $0 tapando
   * las 5 que se llevaban toda la plata.
   */
  it('la misma regla la exporta el core, que es lo que importa el endpoint', () => {
    const promocionada = camp({ objetivo: 'OUTCOME_TRAFFIC', estado: 'ACTIVE', spend: 0 })
    expect(estaAlAire(promocionada)).toBe(false)
    expect(estaAlAire(camp({ objetivo: 'OUTCOME_TRAFFIC', estado: 'PAUSED', spend: 5000 }))).toBe(false)
    expect(estaAlAire(camp({ objetivo: 'OUTCOME_TRAFFIC', estado: 'ACTIVE', spend: 1 }))).toBe(true)
  })
})

describe('el semáforo', () => {
  it('sin campañas de una etapa, esa etapa está vacía', () => {
    const d = diagnosticar(alAire('tofu', 5))
    expect(d.etapas.find((e) => e.etapa === 'tofu')!.estado).toBe('ok')
    expect(d.etapas.find((e) => e.etapa === 'mofu')!.estado).toBe('vacia')
  })

  it('una sola campaña está FLOJA si otra etapa tiene tres o más', () => {
    const d = diagnosticar([...alAire('tofu', 3), ...alAire('mofu', 1), ...alAire('bofu', 1)])
    expect(d.etapas.find((e) => e.etapa === 'mofu')!.estado).toBe('floja')
  })

  it('una sola campaña NO está floja si ninguna otra etapa domina', () => {
    const d = diagnosticar([...alAire('tofu', 2), ...alAire('mofu', 1), ...alAire('bofu', 1)])
    expect(d.etapas.find((e) => e.etapa === 'mofu')!.estado).toBe('ok')
  })

  it('el gasto NO cambia el veredicto, pero se marca aparte', () => {
    // La decisión de diseño: el semáforo lo maneja la cantidad, que es como se piensa el problema.
    // La campaña de $50 contra $6.000 igual queda 'ok', pero con `gastoFlaco` para que la tarjeta
    // pueda decir "existe más en el papel que en la calle".
    const d = diagnosticar([...alAire('tofu', 2, 3000), ...alAire('mofu', 1, 50), ...alAire('bofu', 1, 3000)])
    const mofu = d.etapas.find((e) => e.etapa === 'mofu')!
    expect(mofu.estado).toBe('ok')
    expect(mofu.gastoFlaco).toBe(true)
    expect(d.etapas.find((e) => e.etapa === 'bofu')!.gastoFlaco).toBe(false)
  })
})

describe('el veredicto', () => {
  it('se calla cuando no hay base para opinar', () => {
    // Una sola campaña entregando no dice nada del reparto por etapas. Antes que inventar un
    // diagnóstico, la pantalla admite que todavía no hay con qué.
    expect(diagnosticar(alAire('tofu', 1)).veredicto.clase).toBe('sin-base')
    expect(diagnosticar([]).veredicto.clase).toBe('sin-base')
    expect(diagnosticar(alAire('tofu', 3, 0)).veredicto.clase).toBe('sin-base')
  })

  it('la segunda etapa vacía le gana a todo lo demás', () => {
    const d = diagnosticar([...alAire('tofu', 4)], { marca: 'Zattia' })
    expect(d.veredicto.clase).toBe('vacia')
    expect(d.veredicto.etapa).toBe('mofu')
    // La frase tiene que nombrar la marca y las cantidades, sin siglas.
    expect(d.veredicto.titulo).toContain('Zattia')
    expect(d.veredicto.titulo).toContain('4 pautas')
    expect(d.veredicto.titulo).not.toMatch(/TOFU|MOFU|BOFU/)
  })

  it('con la segunda cubierta, pasa a reclamar la de compra', () => {
    const d = diagnosticar([...alAire('tofu', 3), ...alAire('mofu', 3)])
    expect(d.veredicto.etapa).toBe('bofu')
    expect(d.veredicto.clase).toBe('vacia')
  })

  it('las vacías le ganan a las flojas', () => {
    // mofu floja (1 contra 3) y bofu vacía: manda la vacía.
    const d = diagnosticar([...alAire('tofu', 3), ...alAire('mofu', 1)])
    expect(d.veredicto.etapa).toBe('bofu')
  })

  it('la primera etapa vacía se avisa última, pero se avisa', () => {
    const d = diagnosticar([...alAire('mofu', 2), ...alAire('bofu', 2)])
    expect(d.veredicto.etapa).toBe('tofu')
    expect(d.veredicto.clase).toBe('vacia')
  })

  it('con las tres cubiertas, lo dice y no inventa un problema', () => {
    const d = diagnosticar([...alAire('tofu', 2), ...alAire('mofu', 2), ...alAire('bofu', 2)])
    expect(d.veredicto.clase).toBe('ok')
    expect(d.veredicto.etapa).toBeNull()
  })

  it('el singular y el plural de las pautas', () => {
    const d = diagnosticar([...alAire('tofu', 1), ...alAire('bofu', 1)])
    expect(d.veredicto.titulo).toContain('1 pauta de')
    expect(d.veredicto.titulo).not.toContain('1 pautas')
  })
})

describe('el override manual', () => {
  it('pisa la clasificación automática y mueve el reparto', () => {
    const campañas = alAire('tofu', 3)
    const sinOverride = diagnosticar(campañas)
    expect(sinOverride.etapas.find((e) => e.etapa === 'mofu')!.estado).toBe('vacia')

    // La misma campaña de tráfico, corregida a mano: era remarketing y nadie lo podía saber
    // mirando el objetivo. Es exactamente para lo que existe el override.
    const conOverride = diagnosticar(campañas, { overrides: { [campañas[0]!.id]: 'mofu' } })
    expect(conOverride.etapas.find((e) => e.etapa === 'mofu')!.alAire).toHaveLength(1)
    expect(conOverride.etapas.find((e) => e.etapa === 'tofu')!.alAire).toHaveLength(2)
  })

  it('rescata una campaña sin clasificar', () => {
    const rara = camp({ objetivo: 'ALGO_NUEVO_DE_META' })
    const d = diagnosticar([rara, ...alAire('tofu', 2)], { overrides: { [rara.id]: 'bofu' } })
    expect(d.sinClasificar).toHaveLength(0)
    expect(d.etapas.find((e) => e.etapa === 'bofu')!.alAire).toHaveLength(1)
  })
})

describe('las filas del override → el mapa que come el diagnóstico', () => {
  it('arma el mapa por campaña', () => {
    const m = mapaOverrides([
      { campaign_id: 'c1', etapa: 'mofu' },
      { campaign_id: 'c2', etapa: 'bofu' },
    ])
    expect(m).toEqual({ c1: 'mofu', c2: 'bofu' })
  })

  it('descarta una etapa que no existe en vez de dejarla entrar', () => {
    // Una fila vieja con un valor que ya no es etapa haría desaparecer a la campaña del reparto:
    // no caería en ninguna de las tres tarjetas ni en "sin clasificar", y nadie podría notarlo.
    const campañas = alAire('tofu', 3)
    const m = mapaOverrides([{ campaign_id: campañas[0]!.id, etapa: 'zombie' }])
    expect(m).toEqual({})
    const d = diagnosticar(campañas, { overrides: m })
    expect(d.etapas.find((e) => e.etapa === 'tofu')!.alAire).toHaveLength(3)
    expect(d.sinClasificar).toHaveLength(0)
  })

  it('aguanta filas rotas y una lista vacía', () => {
    expect(mapaOverrides([])).toEqual({})
    expect(mapaOverrides([{ campaign_id: '', etapa: 'mofu' }])).toEqual({})
  })

  it('avisa cuando le cambiaron el objetivo a la campaña desde que la corrigieron', () => {
    const c = camp({ objetivo: 'OUTCOME_SALES' })
    expect(overrideViejo({ objetivo: 'OUTCOME_SALES' }, c)).toBe(false)
    expect(overrideViejo({ objetivo: 'OUTCOME_TRAFFIC' }, c)).toBe(true)
  })

  it('no marca lo que no se puede comparar', () => {
    const c = camp({ objetivo: 'OUTCOME_SALES' })
    expect(overrideViejo({ objetivo: null }, c)).toBe(false)
    expect(overrideViejo({ objetivo: 'OUTCOME_SALES' }, undefined)).toBe(false)
  })
})

describe('sin clasificar', () => {
  it('se muestran aparte y no se reparten a ninguna etapa', () => {
    const d = diagnosticar([...alAire('tofu', 2), camp({ objetivo: 'ALGO_RARO', spend: 900 })])
    expect(d.sinClasificar).toHaveLength(1)
    const sumaEtapas = d.etapas.reduce((t, e) => t + e.alAire.length, 0)
    expect(sumaEtapas).toBe(2)
    // Pero SÍ pesan en el gasto total: si no, los porcentajes de las etapas darían más de 100%.
    expect(d.gastoTotal).toBe(2900)
  })
})

describe('los umbrales', () => {
  it('son números coherentes entre sí', () => {
    expect(UMBRALES_ETAPA.dias).toBeLessThan(UMBRALES_ETAPA.diasAmplio)
    expect(UMBRALES_ETAPA.pisoGastoRelevante).toBeGreaterThan(0)
    expect(UMBRALES_ETAPA.pisoGastoRelevante).toBeLessThan(1)
    expect(UMBRALES_ETAPA.dominanciaOtraEtapa).toBeGreaterThan(1)
  })
})

/**
 * **La forma REAL de la cuenta, y por qué este bloque existe.**
 *
 * 🔴 Hasta el 30-ago-2026 el docblock del núcleo afirmaba *«toda la pauta de BDI y Zattia es de la
 * primera etapa… nadie arma pauta de las otras dos»*, y era **al revés**. 📊 Medido sobre la foto de
 * agosto (10 campañas, 1→29): **5 BOFU al aire con el 84% del gasto**, 3 TOFU, y **MOFU en CERO**.
 *
 * 🔑 **La conducta ya estaba bien y por eso nada se puso rojo en tres meses.** Ese es todo el punto:
 * una premisa escrita ⛔ no frena nada, y quien la leyera antes de tocar `veredictoDe()` habría
 * "arreglado" la prioridad para que apuntara a la primera etapa. Esto la vuelve test — 📌
 * [[feedback_areben_invariante_escrito_no_frena]].
 *
 * ⚠️ Las cifras van redondeadas y ⛔ no clavadas al peso: lo que se fija es **la FORMA** (dónde está
 * el hueco), ⛔ no la foto de un día. Si mañana hay una campaña de MOFU, este test tiene que caerse
 * — y ese rojo es la noticia buena.
 */
describe('la forma real de la cuenta (agosto 2026)', () => {
  const comoEnAgosto = [
    ...alAire('bofu', 5, 294_000), // ~$1.472.073 entre las cinco
    ...alAire('tofu', 3, 94_800), //  ~$284.509 entre las tres
    // MOFU: ninguna. Es el agujero.
  ]
  const d = diagnosticar(comoEnAgosto, { marca: 'BDI' })

  it('🔴 el hueco está en el MEDIO, ⛔ no arriba del embudo', () => {
    const por = (e: Etapa) => d.etapas.find((x) => x.etapa === e)
    expect(por('mofu')?.alAire).toHaveLength(0)
    expect(por('mofu')?.estado).toBe('vacia')
    expect(por('bofu')?.alAire).toHaveLength(5)
    expect(por('tofu')?.alAire).toHaveLength(3)
  })

  it('la etapa de COMPRA se lleva la mayoría de la plata — al revés de lo que decía la premisa', () => {
    const bofu = d.etapas.find((x) => x.etapa === 'bofu')
    expect(bofu!.parte).toBeGreaterThan(0.8)
  })

  it('🔑 y el veredicto apunta a MOFU, ⛔ no a la primera etapa', () => {
    expect(d.veredicto.etapa).toBe('mofu')
    expect(d.veredicto.clase).not.toBe('sin-base')
  })
})

/**
 * **El censo de respaldo, armado desde la foto** — lo que contesta el Embudo con el token vencido.
 *
 * 🔴 Existe porque `?recurso=etapas` estaba **debajo** del guard de `META_ADS_TOKEN` y el Embudo se
 * moría con un 500, mientras Rendimiento, las reglas y los informes seguían contestando: están
 * arriba a propósito. El dato ya estaba en `meta_ads_snapshot_dia`.
 *
 * Los mutantes que este bloque tiene que matar son los tres modos de **afirmar de más**:
 *  1. Meter una campaña sin objetivo como `sin-clasificar` — diría «nadie le puso etapa» cuando lo
 *     que pasa es que la foto ⛔ no lo guardaba (📊 el 77% de las filas históricas).
 *  2. Tomar el objetivo del ÚLTIMO día en vez del último que lo tenga — una campaña que dejó de
 *     entregar vuelve a escribir `null` y se caería del censo teniendo el dato dos filas atrás.
 *  3. Devolver `completo: true` — la foto ⛔ no tiene las campañas que nunca entregaron.
 */
describe('el censo de respaldo, desde la foto', () => {
  const fila = (o: Record<string, unknown> = {}) => ({
    nivel: 'campania', objeto_id: 'c1', cuenta_id: '999', nombre: 'CAMPAÑA', linea: 'bdi',
    fecha: '2026-08-20', objetivo: 'OUTCOME_SALES', estado: 'ACTIVE', estado_efectivo: 'ACTIVE',
    diario_crudo: 1_000_000, moneda: 'ARS', spend: 100, impresiones: 10, clicks: 5, compras: 1, revenue: 300,
    ...o,
  })

  it('suma la ventana y clasifica por el objetivo', () => {
    const c = censoDeLaFoto([fila({ fecha: '2026-08-20' }), fila({ fecha: '2026-08-21' })])
    expect(c.campanias).toHaveLength(1)
    expect(c.campanias[0].spend).toBe(200)
    expect(c.campanias[0].revenue).toBe(600)
    expect(c.campanias[0].etapaAuto).toBe('bofu')
  })

  it('🔴 una campaña SIN objetivo en ninguna fila ⛔ no entra al censo: sale aparte', () => {
    const c = censoDeLaFoto([fila({ objetivo: null }), fila({ objeto_id: 'c2' })])
    expect(c.campanias.map((x) => x.id)).toEqual(['c2'])
    expect(c.sinObjetivo.map((x) => x.id)).toEqual(['c1'])
    // ⛔ Y en particular NO aparece como «sin-clasificar», que es una afirmación distinta.
    expect(c.campanias.some((x) => x.etapaAuto === 'sin-clasificar')).toBe(false)
  })

  it('🔴 el objetivo sale del último día que LO TENGA, ⛔ no del último día', () => {
    // El caso medido: la campaña de Stunned volvió a escribir `objetivo: null` el día que dejó de
    // gastar. Con el último día mandando, se caía del censo teniendo el dato el día anterior.
    const c = censoDeLaFoto([
      fila({ fecha: '2026-08-20', objetivo: 'OUTCOME_TRAFFIC' }),
      fila({ fecha: '2026-08-21', objetivo: null, spend: 0 }),
    ])
    expect(c.sinObjetivo).toHaveLength(0)
    expect(c.campanias[0].etapaAuto).toBe('tofu')
  })

  it('el nombre, el estado y el presupuesto salen del día MÁS NUEVO', () => {
    const c = censoDeLaFoto([
      fila({ fecha: '2026-08-20', nombre: 'EL VIEJO', estado_efectivo: 'ACTIVE', diario_crudo: 1_000_000 }),
      fila({ fecha: '2026-08-21', nombre: 'EL NUEVO', estado_efectivo: 'PAUSED', diario_crudo: 2_000_000 }),
    ])
    expect(c.campanias[0].nombre).toBe('EL NUEVO')
    expect(c.campanias[0].estado).toBe('PAUSED')
    expect(c.campanias[0].diarioCrudo).toBe(2_000_000)
  })

  it('`estado_efectivo` le gana a `estado`: es el que dice si entrega de verdad', () => {
    const c = censoDeLaFoto([fila({ estado: 'ACTIVE', estado_efectivo: 'CAMPAIGN_PAUSED' })])
    expect(c.campanias[0].estado).toBe('CAMPAIGN_PAUSED')
    expect(estaAlAire(c.campanias[0])).toBe(false)
  })

  it('🔴 NUNCA se declara completo: la foto ⛔ no tiene las que nunca entregaron', () => {
    expect(censoDeLaFoto([fila()]).completo).toBe(false)
    expect(censoDeLaFoto([]).completo).toBe(false)
  })

  it('ignora los otros niveles de la foto y aguanta filas rotas', () => {
    const c = censoDeLaFoto([fila({ nivel: 'conjunto' }), fila({ nivel: 'aviso' }), null, {}, fila({ objeto_id: null })])
    expect(c.campanias).toHaveLength(0)
    expect(c.sinObjetivo).toHaveLength(0)
  })
})

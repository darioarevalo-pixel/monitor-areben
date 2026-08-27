import { describe, it, expect } from 'vitest'
import { estadoRealDe, filaSnapshot, isoDia, sumarDias, tramosDe } from '@/lib/meta-ads/snapshot'
import { accion, metricasDe, CAMPOS_INSIGHTS } from '@/lib/meta-ads/metricas'

describe('cómo se parte el rango del backfill', () => {
  it('90 días salen en tres tramos de 30, sin huecos ni superposición', () => {
    const t = tramosDe('2026-05-11', '2026-08-08', 30)
    expect(t).toEqual([
      { since: '2026-05-11', until: '2026-06-09' },
      { since: '2026-06-10', until: '2026-07-09' },
      { since: '2026-07-10', until: '2026-08-08' },
    ])
  })

  it('un solo día es un solo tramo, con since = until', () => {
    expect(tramosDe('2026-08-08', '2026-08-08')).toEqual([{ since: '2026-08-08', until: '2026-08-08' }])
  })

  it('el último tramo se recorta y no se pasa del final', () => {
    const t = tramosDe('2026-08-01', '2026-08-10', 7)
    expect(t.at(-1)).toEqual({ since: '2026-08-08', until: '2026-08-10' })
  })

  it('un rango al revés o inválido no devuelve nada, en vez de pedirle basura a Meta', () => {
    expect(tramosDe('2026-08-08', '2026-05-01')).toEqual([])
    expect(tramosDe('cualquier cosa', '2026-08-08')).toEqual([])
  })

  it('isoDia toma el día LOCAL: a las 22 h de Argentina sigue siendo hoy', () => {
    // `toISOString()` daría el día siguiente porque es UTC. Ese bug corría la fecha entera.
    const d = new Date(2026, 7, 8, 22, 30)
    expect(isoDia(d)).toBe('2026-08-08')
  })
})

describe('estado_real: lo que la API no contesta aunque no mienta', () => {
  const vivo = { status: 'ACTIVE', effective_status: 'ACTIVE' }
  const muerto = { status: 'PAUSED', effective_status: 'PAUSED' }

  it('un conjunto pausado está pausado, sin mirar los avisos', () => {
    expect(estadoRealDe('PAUSED', [vivo])).toBe('pausado')
  })

  it('activo con al menos un aviso vivo está entregando', () => {
    expect(estadoRealDe('ACTIVE', [muerto, vivo])).toBe('entregando')
  })

  it('🔑 activo con TODOS los avisos apagados no entrega, y ése es el caso que existe esta columna', () => {
    expect(estadoRealDe('ACTIVE', [muerto, muerto])).toBe('avisos-desactivados')
  })

  it('activo y sin ningún aviso se distingue de tenerlos apagados', () => {
    expect(estadoRealDe('ACTIVE', [])).toBe('sin-avisos')
  })

  it('🔴 no haber podido leer los avisos devuelve null, NUNCA "avisos-desactivados"', () => {
    // No saber no es lo mismo que estar apagado: un 'avisos-desactivados' inventado mandaría a
    // pausar algo que estaba entregando bien.
    expect(estadoRealDe('ACTIVE', null)).toBeNull()
    expect(estadoRealDe('ACTIVE', undefined)).toBeNull()
  })

  it('un aviso en revisión cuenta como vivo: todavía puede terminar entregando', () => {
    expect(estadoRealDe('ACTIVE', [{ effective_status: 'PENDING_REVIEW' }])).toBe('entregando')
    expect(estadoRealDe('ACTIVE', [{ effective_status: 'IN_PROCESS' }])).toBe('entregando')
  })

  it('un aviso rechazado no entrega', () => {
    expect(estadoRealDe('ACTIVE', [{ effective_status: 'DISAPPROVED' }])).toBe('avisos-desactivados')
  })
})

describe('de fila de insights a fila de la tabla', () => {
  const row = {
    date_start: '2026-08-07',
    account_id: '1145878766790149',
    campaign_id: '120200',
    campaign_name: 'BDI · Sweaters · BOFU',
    adset_id: '120300',
    adset_name: 'Retargeting 7d',
    spend: '10450.5',
    impressions: '52000',
    reach: '31000',
    frequency: '1.68',
    clicks: '890',
    ctr: '1.71',
    cpc: '11.74',
    cpm: '200.97',
    actions: [{ action_type: 'omni_purchase', value: '14' }, { action_type: 'link_click', value: '890' }],
    action_values: [{ action_type: 'omni_purchase', value: '104505' }],
    purchase_roas: [{ action_type: 'omni_purchase', value: '3.4' }],
  }

  it('el nivel decide de qué campo salen el id y el nombre', () => {
    expect(filaSnapshot(row, 'conjunto', '1145878766790149')?.objeto_id).toBe('120300')
    expect(filaSnapshot(row, 'conjunto', '1145878766790149')?.nombre).toBe('Retargeting 7d')
    expect(filaSnapshot(row, 'campania', '1145878766790149')?.objeto_id).toBe('120200')
    expect(filaSnapshot(row, 'campania', '1145878766790149')?.nombre).toBe('BDI · Sweaters · BOFU')
  })

  it('🔑 el ROAS sale de purchase_roas, NO de revenue/spend', () => {
    const f = filaSnapshot(row, 'conjunto', '1145878766790149')!
    // revenue/spend daría exactamente 10, y Meta dice 3,4 (ventana de atribución).
    expect(f.revenue / f.spend).toBeCloseTo(10, 1)
    expect(f.roas).toBe(3.4)
  })

  it('🔑 el embudo se guarda: carritos, checkouts y visitas a la web salen de `actions`', () => {
    const conEmbudo = {
      ...row,
      actions: [
        ...row.actions,
        { action_type: 'omni_add_to_cart', value: '231' },
        { action_type: 'omni_initiated_checkout', value: '45' },
        { action_type: 'landing_page_view', value: '640' },
      ],
    }
    const f = filaSnapshot(conEmbudo, 'conjunto', '1145878766790149')!
    expect(f.carritos).toBe(231)
    expect(f.checkouts).toBe(45)
    expect(f.lpv).toBe(640)
    // Y el embudo tiene que cerrar hacia abajo: no puede haber más compras que checkouts.
    expect(f.compras).toBeLessThanOrEqual(f.checkouts!)
  })

  it('🔑 `link_clicks` sale de inline_link_clicks y ⛔ NO de `clicks`', () => {
    // El caso real que lo hizo nacer (27-ago-2026): se leyó `clicks - lpv` como "gente que hizo
    // click y no llegó a cargar la tienda" y dio "se pierde la mitad". Era falso: `clicks` cuenta
    // me gusta, comentarios, compartir y agrandar la foto, gente que nunca quiso entrar.
    const conLink = { ...row, clicks: '431', inline_link_clicks: '230' }
    const f = filaSnapshot(conLink, 'conjunto', '1145878766790149')!
    expect(f.clicks).toBe(431)
    expect(f.link_clicks).toBe(230)
    // El invariante que hace que valga la pena: los clicks al link son un SUBCONJUNTO de todos.
    expect(f.link_clicks!).toBeLessThanOrEqual(f.clicks)
  })

  it('🔴 el campo se le PIDE a Meta: sin esto la columna se llenaría de ceros en silencio', () => {
    // `num(undefined)` da 0, así que olvidarse de pedirlo no rompe nada — escribe "nadie hizo
    // click al link" todos los días. Es exactamente el bug que este archivo ya documenta para
    // `actions`, y por eso el pedido se fija acá y no sólo la lectura.
    expect(CAMPOS_INSIGHTS.split(',')).toContain('inline_link_clicks')
  })

  it('🔴 con el escalón bien medido, el que se caía era casi nadie', () => {
    // Los números de BDI del 27-ago: 431 clicks, 230 al link, 208 landing page views.
    const f = filaSnapshot(
      { ...row, clicks: '431', inline_link_clicks: '230',
        actions: [...row.actions, { action_type: 'landing_page_view', value: '208' }] },
      'conjunto', '1145878766790149',
    )!
    // La lectura vieja: 52% "perdido". La buena: 10%. El denominador era todo el error.
    expect(Math.round((1 - f.lpv! / f.clicks) * 100)).toBe(52)
    expect(Math.round((1 - f.lpv! / f.link_clicks!) * 100)).toBe(10)
  })

  it('🔴 sin el action_type los tres dan 0, que NO es lo mismo que el null de las filas viejas', () => {
    // `accion()` sobre un array que no trae el tipo devuelve 0, igual que un día que de verdad no
    // tuvo carritos. Por eso las filas anteriores al 23-ago-2026 quedan en null en la base y no en
    // 0: acá se fija que la función efectivamente no distingue, para que nadie espere que sí.
    const f = filaSnapshot(row, 'conjunto', '1145878766790149')!
    expect(f.carritos).toBe(0)
    expect(f.checkouts).toBe(0)
    expect(f.lpv).toBe(0)
  })

  it('una fila sin fecha o sin id se descarta, en vez de escribirse con una fecha inventada', () => {
    expect(filaSnapshot({ ...row, date_start: undefined }, 'conjunto', '1')).toBeNull()
    expect(filaSnapshot({ ...row, adset_id: undefined }, 'conjunto', '1')).toBeNull()
    expect(filaSnapshot(row, 'no-existe' as never, '1')).toBeNull()
  })

  it('los extras (línea, estado, presupuesto) entran tal cual y por default son null', () => {
    const con = filaSnapshot(row, 'conjunto', '1145878766790149', {
      linea: 'bdi', estado: 'ACTIVE', estadoReal: 'entregando', diarioCrudo: 1200000, moneda: 'ARS',
    })!
    expect(con.linea).toBe('bdi')
    expect(con.estado_real).toBe('entregando')
    // Cruda, en la unidad menor: 1200000 son $12.000. La conversión es una decisión visible.
    expect(con.diario_crudo).toBe(1200000)

    const sin = filaSnapshot(row, 'conjunto', '1145878766790149')!
    expect(sin.linea).toBeNull()
    expect(sin.diario_crudo).toBeNull()
    expect(sin.estado_real).toBeNull()
  })

  it('una acción que no vino queda en 0, no en NaN', () => {
    const f = filaSnapshot({ date_start: '2026-08-07', adset_id: '1' }, 'conjunto', '1')!
    expect(f.compras).toBe(0)
    expect(f.spend).toBe(0)
    expect(Number.isNaN(f.roas)).toBe(false)
  })
})

describe('sumar días en una ventana', () => {
  const dias = [
    { spend: 100, impresiones: 1000, clicks: 10, compras: 1, revenue: 300, alcance: 800, frecuencia: 1.25, visitas_perfil: 0, seguidores: 0 },
    { spend: 900, impresiones: 9000, clicks: 90, compras: 5, revenue: 1500, alcance: 7000, frecuencia: 1.29, visitas_perfil: 0, seguidores: 0 },
  ]

  it('🔴 alcance y frecuencia vuelven en null: son dedup y sumarlos infla el número', () => {
    const t = sumarDias(dias)
    expect(t.alcance).toBeNull()
    expect(t.frecuencia).toBeNull()
  })

  it('🔑 los ratios se recalculan desde los agregados, no se promedian', () => {
    const t = sumarDias(dias)
    // El CTR de los dos días es 1% en los dos, así que el promedio también daría 1 y no probaría
    // nada. Con volúmenes distintos, promediar y recalcular difieren: acá clicks/impresiones.
    expect(t.ctr).toBeCloseTo((100 / 10000) * 100, 6)
    expect(t.cpc).toBeCloseTo(1000 / 100, 6)
    expect(t.cpm).toBeCloseTo((1000 / 10000) * 1000, 6)
  })

  it('el ROAS de la ventana es el de los totales, y dice sobre cuántos días', () => {
    const t = sumarDias(dias)
    expect(t.roas).toBeCloseTo(1800 / 1000, 6)
    expect(t.dias).toBe(2)
  })

  it('promediar el CTR daría otro número: por eso se recalcula', () => {
    const desparejo = [
      { spend: 10, impresiones: 10, clicks: 5, compras: 0, revenue: 0, visitas_perfil: 0, seguidores: 0 },
      { spend: 10, impresiones: 100000, clicks: 100, compras: 0, revenue: 0, visitas_perfil: 0, seguidores: 0 },
    ]
    const promedio = (50 + 0.1) / 2 // lo que daría promediar los CTR de cada día
    expect(sumarDias(desparejo).ctr).toBeCloseTo(0.105, 3)
    expect(sumarDias(desparejo).ctr).not.toBeCloseTo(promedio, 1)
  })

  it('una ventana vacía no explota', () => {
    const t = sumarDias([])
    expect(t.spend).toBe(0)
    expect(t.roas).toBe(0)
    expect(t.dias).toBe(0)
  })
})

describe('la lectura de acciones, que es de donde salen las ventas', () => {
  it('omni_purchase y no otro: purchase suelto no cuenta', () => {
    const arr = [{ action_type: 'purchase', value: '99' }, { action_type: 'omni_purchase', value: '14' }]
    expect(accion(arr, 'omni_purchase')).toBe(14)
  })

  it('un array que no vino da 0, no rompe', () => {
    expect(accion(undefined, 'omni_purchase')).toBe(0)
    expect(metricasDe({}).purchases).toBe(0)
  })
})

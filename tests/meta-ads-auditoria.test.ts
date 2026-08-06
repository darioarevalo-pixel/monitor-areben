import { describe, expect, it } from 'vitest'
import { contar, inciertas, leerResultado, leerUso, rotuloEstado } from '@/lib/meta-ads/auditoria'
import type { FilaAuditoria, ResultadoAccionFila } from '@/lib/meta-ads/tipos'

/**
 * La traducción del registro de acciones a algo que se pueda leer.
 *
 * Lo que se amarra acá no es cosmética: la pantalla de auditoría es la que contesta «¿quién bajó
 * este presupuesto?» y «¿esto quedó aplicado o no?». Los casos que importan son los feos —una acción
 * rechazada, una que se cortó, una anterior a que se guardara el pedido—, porque son justo las filas
 * que alguien va a mirar con una pregunta urgente.
 *
 * Las filas de ejemplo son **las reales de la prueba a mano del 6-ago-2026 en producción**, con sus
 * valores tal como quedaron en la base (los montos crudos vienen como string, no como número).
 */

const fila = (o: Partial<FilaAuditoria>): FilaAuditoria => ({
  id: 1,
  cuando: '2026-08-06T17:49:51.624Z',
  quien: 'Bruno Arevalo',
  accion: 'estado',
  nivel: 'campania',
  objetoId: '120250683011800505',
  objetoNombre: 'STUNNED - Tráfico a Perfil - Abril 2026',
  campaignId: '120250683011800505',
  linea: 'stunned',
  cuentaId: '4366752500136303',
  de: null,
  a: null,
  pedido: null,
  resultado: 'ok',
  detalle: null,
  ...o,
})

describe('cómo terminó', () => {
  it('«no se hizo» y «no sabemos cómo quedó» NO son lo mismo', () => {
    // Es la distinción que ordena la pantalla entera: un rechazo no dejó nada a medias y se puede
    // repetir sin mirar; los otros dos mandan a Ads Manager antes de tocar nada.
    expect(leerResultado('rechazado').incierto).toBe(false)
    expect(leerResultado('error').incierto).toBe(true)
    expect(leerResultado('en-curso').incierto).toBe(true)
    expect(leerResultado('ok').incierto).toBe(false)
  })

  it('un resultado que esta pantalla no conoce cuenta como incierto, no como bueno', () => {
    // Una tanda futura puede sumar un resultado nuevo. Que caiga en «se hizo» sería inventar que
    // salió bien; incierto es lo peor que puede pasar y es lo honesto.
    expect(leerResultado('lo-que-sea' as ResultadoAccionFila).incierto).toBe(true)
  })

  it('el cartel de arriba junta sólo lo que quedó sin saber', () => {
    const filas = [
      fila({ id: 1, resultado: 'ok' }),
      fila({ id: 2, resultado: 'rechazado' }),
      fila({ id: 3, resultado: 'en-curso' }),
      fila({ id: 4, resultado: 'error' }),
    ]
    expect(inciertas(filas).map((f) => f.id)).toEqual([3, 4])
  })
})

describe('pausar y reactivar', () => {
  it('cuenta la pausada de Stunned con su antes y su después', () => {
    const c = contar(fila({ de: { status: 'ACTIVE' }, a: { status: 'PAUSED' } }), 'ARS')
    expect(c.clase).toBe('estado')
    expect(c.titulo).toBe('Pausó la campaña')
    if (c.clase !== 'estado') throw new Error('clase')
    expect(c.desde).toBe('ACTIVE')
    expect(c.hasta).toBe('PAUSED')
    expect(c.sinDato).toBe(false)
  })

  it('el nivel va con su artículo: «el conjunto», no «el/la conjunto»', () => {
    const c = contar(fila({ nivel: 'conjunto', de: { status: 'PAUSED' }, a: { status: 'ACTIVE' } }), 'ARS')
    expect(c.titulo).toBe('Reactivó el conjunto')
  })

  it('lo que no salió se cuenta como intento, no como hecho', () => {
    // Con `a` vacío (no se aplicó), la intención sale de `pedido`: es para eso que se guarda.
    const c = contar(fila({ resultado: 'rechazado', a: null, pedido: { status: 'PAUSED' } }), 'ARS')
    expect(c.titulo).toBe('Intentó pausar la campaña')
  })

  it('el pedido le gana a lo releído', () => {
    // Si alguna vez difieren, lo que la persona quiso hacer es `pedido`. `a` es lo que Meta devolvió.
    const c = contar(fila({ pedido: { status: 'PAUSED' }, a: { status: 'ACTIVE' } }), 'ARS')
    expect(c.titulo).toBe('Pausó la campaña')
  })

  it('un rechazo VIEJO no dice qué se quiso hacer, y no se lo inventa', () => {
    // Las filas anteriores al 6-ago-2026 no tienen `pedido`: la columna se sumó después de la Tanda 1.
    // Completar el hueco con lo que parezca sería atribuirle a alguien una intención que no consta.
    const c = contar(fila({ resultado: 'rechazado', de: null, a: null, pedido: null }), 'ARS')
    expect(c.sinDato).toBe(true)
    expect(c.titulo).toBe('Intentó pausar o reactivar la campaña')
  })
})

describe('el cupo de escritura de Meta', () => {
  /** El header real que quedó guardado en las filas del 6-ago. */
  const real = '{"4366752500136303":[{"type":"ads_management","call_count":16,"total_cputime":2,"total_time":3,"estimated_time_to_regain_access":0,"ads_api_access_tier":"development_access"}]}'

  it('saca el porcentaje y el tier del JSON crudo de Meta', () => {
    // 🔑 `call_count` es el PORCENTAJE del cupo usado, no una cantidad de llamadas.
    expect(leerUso(real)).toEqual({ pct: 16, tier: 'development_access' })
  })

  it('con varias cuentas manda la más cargada: es la que frena todo', () => {
    const dos = '{"111":[{"call_count":16,"ads_api_access_tier":"development_access"}],"222":[{"call_count":91}]}'
    expect(leerUso(dos)?.pct).toBe(91)
  })

  it('un formato que Meta cambie no rompe la pantalla', () => {
    // Esta pantalla existe para averiguar qué pasó: que se caiga porque Meta cambió un header sería
    // perderla justo el día que hace falta.
    expect(leerUso('no soy json')).toBeNull()
    expect(leerUso('{}')).toBeNull()
    expect(leerUso(null)).toBeNull()
    expect(leerUso('{"111":[{}]}')).toEqual({ pct: null, tier: null })
  })
})

describe('presupuesto', () => {
  /** La fila real: el conjunto de prueba de Stunned, de $1.800 a $1.900. */
  const suba = fila({
    accion: 'presupuesto', nivel: 'conjunto',
    de: { daily_budget: '180000' }, a: { daily_budget: '190000' },
  })

  it('convierte de la unidad menor y dice para qué lado fue', () => {
    const c = contar(suba, 'ARS')
    expect(c.clase).toBe('presupuesto')
    if (c.clase !== 'presupuesto') throw new Error('clase')
    // 🔑 El `/100` validado contra Ads Manager: `190000` crudo es $1.900.
    expect(c.desde).toBe(1800)
    expect(c.hasta).toBe(1900)
    expect(c.titulo).toBe('Subió el presupuesto diario del conjunto')
    expect(c.crudo).toBe(false)
  })

  it('la variación es la que muestra el modal: +5,6%', () => {
    const c = contar(suba, 'ARS')
    if (c.clase !== 'presupuesto') throw new Error('clase')
    expect(c.variacion).toBeCloseTo(0.0556, 4)
  })

  it('bajar se cuenta como bajar', () => {
    const c = contar(fila({
      accion: 'presupuesto', nivel: 'conjunto',
      de: { daily_budget: '190000' }, a: { daily_budget: '180000' },
    }), 'ARS')
    expect(c.titulo).toBe('Bajó el presupuesto diario del conjunto')
    if (c.clase !== 'presupuesto') throw new Error('clase')
    expect(c.variacion).toBeCloseTo(-0.0526, 4)
  })

  it('🔑 sin saber la moneda el monto va CRUDO y marcado, no dividido por 100 a ojo', () => {
    // El factor depende de la moneda: en ARS `190000` son $1.900, en guaraníes son 190.000. Adivinarlo
    // en una pantalla que audita plata es errar por dos órdenes de magnitud sin que nadie se entere.
    const c = contar(suba, null)
    if (c.clase !== 'presupuesto') throw new Error('clase')
    expect(c.hasta).toBe(190000)
    expect(c.crudo).toBe(true)
    // La variación es una razón: sale igual de bien con montos crudos.
    expect(c.variacion).toBeCloseTo(0.0556, 4)
  })

  it('en una moneda sin decimales no divide', () => {
    const c = contar(suba, 'CLP')
    if (c.clase !== 'presupuesto') throw new Error('clase')
    expect(c.hasta).toBe(190000)
    expect(c.crudo).toBe(false)
  })

  it('sin el valor anterior dice «puso», que es lo único que consta', () => {
    const c = contar(fila({ accion: 'presupuesto', nivel: 'conjunto', de: null, a: { daily_budget: '190000' } }), 'ARS')
    expect(c.titulo).toBe('Puso el presupuesto diario del conjunto')
    if (c.clase !== 'presupuesto') throw new Error('clase')
    expect(c.desde).toBeNull()
    expect(c.variacion).toBeNull()
  })

  it('un cero anterior no se convierte en una variación infinita', () => {
    const c = contar(fila({ accion: 'presupuesto', nivel: 'conjunto', de: { daily_budget: '0' }, a: { daily_budget: '190000' } }), 'ARS')
    if (c.clase !== 'presupuesto') throw new Error('clase')
    expect(c.variacion).toBeNull()
  })
})

describe('duplicar', () => {
  it('cuenta la copia por su NOMBRE, que es con lo que se la encuentra después', () => {
    const c = contar(fila({
      accion: 'duplicar',
      pedido: { copia_de: '120250683011800505', sufijo: ' — copia 06/08 15:40' },
      a: { copia_id: '120250999', nombre: 'STUNNED - Tráfico a Perfil — copia 06/08 15:40' },
    }), 'ARS')
    expect(c.clase).toBe('duplicar')
    if (c.clase !== 'duplicar') throw new Error('clase')
    expect(c.titulo).toBe('Duplicó la campaña')
    expect(c.copia).toBe('STUNNED - Tráfico a Perfil — copia 06/08 15:40')
    expect(c.sinDato).toBe(false)
  })

  it('una copia que no salió NO es «sin dato»: el sufijo registrado es la pista para buscarla', () => {
    // Es la diferencia entre «no sabemos qué pasó» y «no salió, y así se llama lo que habría que
    // buscar en Ads Manager». El sufijo se anota ANTES del POST justo para este caso.
    const c = contar(fila({
      accion: 'duplicar', resultado: 'error', a: null,
      pedido: { copia_de: '120250683011800505', sufijo: ' — copia 06/08 15:40' },
    }), 'ARS')
    if (c.clase !== 'duplicar') throw new Error('clase')
    expect(c.titulo).toBe('Intentó duplicar la campaña')
    expect(c.deQuien).toBe('120250683011800505')
    expect(c.sinDato).toBe(false)
  })

  it('sin el sufijo registrado sí se perdió el rastro, y se dice', () => {
    const c = contar(fila({ accion: 'duplicar', resultado: 'error', a: null, pedido: null }), 'ARS')
    if (c.clase !== 'duplicar') throw new Error('clase')
    expect(c.sinDato).toBe(true)
  })
})

describe('lo que todavía no existe', () => {
  it('una acción de una tanda futura se ve el día uno, aunque se lea fea', () => {
    // `crear` entra a la misma tabla en la Tanda 3. Que la pantalla la esconda hasta que alguien se
    // acuerde de agregarla sería un agujero de auditoría, no un detalle de presentación.
    const c = contar(fila({ accion: 'crear' }), 'ARS')
    expect(c.clase).toBe('otra')
    expect(c.titulo).toContain('crear')
  })
})

describe('estados en castellano', () => {
  it('traduce los dos que existen y no rompe con el resto', () => {
    expect(rotuloEstado('ACTIVE')).toBe('Activo')
    expect(rotuloEstado('PAUSED')).toBe('Pausado')
    expect(rotuloEstado('CAMPAIGN_PAUSED')).toBe('campaign paused')
    expect(rotuloEstado(null)).toBe('—')
  })
})

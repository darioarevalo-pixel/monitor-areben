import { describe, expect, it } from 'vitest'
import {
  ACCIONES, aCrudo, accionesQuePuede, aMonto, CAMPOS_LECTURA, CLAVES_ACCION, factorMoneda, fotoDe,
  lineasQuePuede, NIVELES, nivelReal, permiteAccion, quedoPuesto, revisarPresupuesto, validarPedido,
  validarValores,
} from '@/lib/meta-ads/acciones'
import type { Perfil } from '@/lib/permisos'

/**
 * El guard de lo que ESCRIBE en Meta.
 *
 * ⚠️ Esto NO es un test de la UI: `api/_meta-acciones.js` valida con estas mismas funciones, así que
 * lo que se fija acá es literalmente lo que el servidor deja pasar. La pantalla dibuja los botones
 * con las mismas líneas, que es lo que hace que no se puedan despegar.
 *
 * El riesgo que ordena todos estos casos: **las tres líneas se pautean desde la MISMA cuenta
 * publicitaria**. Un error de escritura no lo paga una marca sola.
 */

const perfil = (o: Partial<Perfil>): Perfil => ({
  name: 'Alguien', admin: false, cuenta: null, acceso: {}, ...o,
} as Perfil)

/** Ve Meta Ads en las dos marcas y puede pausar en las dos. */
const pausadorTotal = perfil({
  acceso: {
    bdi: { 'meta-ads': true, 'meta-ads.pausar': true },
    zattia: { 'meta-ads': true, 'meta-ads.pausar': true },
  },
})

/** El caso del plan: tiene el sub tildado en las dos, pero está CLAVADO a BDI. */
const clavadoEnBdi = perfil({
  cuenta: 'bdi',
  acceso: {
    bdi: { 'meta-ads': true, 'meta-ads.pausar': true, 'meta-ads.presupuesto': true },
    zattia: { 'meta-ads': true, 'meta-ads.pausar': true, 'meta-ads.presupuesto': true },
  },
})

const soloMira = perfil({ acceso: { bdi: { 'meta-ads': true }, zattia: { 'meta-ads': true } } })
const admin = perfil({ admin: true })

describe('la tabla de acciones', () => {
  it('⛔ NINGUNA acción de la Tanda 1 acepta `bid_strategy`', () => {
    // Meta exige que el presupuesto y la puja vivan al MISMO nivel, y la única forma de no poder
    // violar esa regla es no tener con qué mandar puja. La puja aparece recién en la Tanda 3.
    for (const a of CLAVES_ACCION) expect(ACCIONES[a].campos).not.toContain('bid_strategy')
  })

  it('cada acción declara niveles reales y un sub-permiso', () => {
    for (const a of CLAVES_ACCION) {
      const def = ACCIONES[a]
      expect(def.niveles.length).toBeGreaterThan(0)
      for (const n of def.niveles) expect(NIVELES).toContain(n)
      expect(def.sub).toBeTruthy()
      expect(typeof def.reintentable).toBe('boolean')
    }
  })

  it('el presupuesto NO se toca a nivel aviso: en Meta un aviso no tiene presupuesto propio', () => {
    expect(ACCIONES.presupuesto.niveles).not.toContain('aviso')
    expect(ACCIONES.estado.niveles).toEqual(['campania', 'conjunto', 'aviso'])
  })

  it('cada nivel pide a Meta un campo que SÓLO existe en ese nivel', () => {
    // Es el primer cerrojo del chequeo de nivel: si alguien manda un id de campaña diciendo que es
    // un aviso, Graph contesta `(#100) nonexisting field` y el pedido muere antes de escribir nada.
    expect(CAMPOS_LECTURA.campania).toContain('objective')
    expect(CAMPOS_LECTURA.conjunto).toContain('campaign_id')
    expect(CAMPOS_LECTURA.aviso).toContain('adset_id')
    // Y una campaña NO puede pedir `campaign_id`: no es un campo suyo y anularía la consulta entera.
    expect(CAMPOS_LECTURA.campania).not.toContain('campaign_id')
  })
})

describe('validar la forma del pedido', () => {
  const base = { accion: 'estado', nivel: 'aviso', objetoId: '123', campos: { status: 'PAUSED' }, idem: 'a1b2c3d4e5' }

  it('el camino feliz pasa', () => {
    expect(validarPedido(base).ok).toBe(true)
  })

  it('🔴 un campo fuera de la whitelist es 400, NO un campo ignorado', () => {
    // La diferencia importa: quien mandó `bid_strategy` tiene que enterarse de que no se aplicó,
    // no creer que sí.
    const r = validarPedido({ ...base, campos: { status: 'PAUSED', bid_strategy: 'LOWEST_COST' } })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(400)
      expect(r.error).toContain('bid_strategy')
    }
  })

  it('una acción o un nivel que no existen son 400', () => {
    expect(validarPedido({ ...base, accion: 'borrar' })).toMatchObject({ ok: false, status: 400 })
    expect(validarPedido({ ...base, nivel: 'cuenta' })).toMatchObject({ ok: false, status: 400 })
  })

  it('el presupuesto a nivel aviso no pasa, aunque el aviso exista', () => {
    const r = validarPedido({ ...base, accion: 'presupuesto', nivel: 'aviso', campos: { daily_budget: 500000 } })
    expect(r).toMatchObject({ ok: false, status: 400 })
  })

  it('el id tiene que ser un número de Meta', () => {
    expect(validarPedido({ ...base, objetoId: 'act_123' })).toMatchObject({ ok: false, status: 400 })
    expect(validarPedido({ ...base, objetoId: '' })).toMatchObject({ ok: false, status: 400 })
  })

  it('sin `idem` no se acciona: es el candado del doble clic', () => {
    expect(validarPedido({ ...base, idem: '' })).toMatchObject({ ok: false, status: 400 })
    expect(validarPedido({ ...base, idem: 'corto' })).toMatchObject({ ok: false, status: 400 })
  })

  it('un pedido sin campos no es un pedido', () => {
    expect(validarPedido({ ...base, campos: {} })).toMatchObject({ ok: false, status: 400 })
    expect(validarPedido({ ...base, campos: null })).toMatchObject({ ok: false, status: 400 })
    // Un array pasaría `typeof === 'object'` y `Object.keys` daría los índices.
    expect(validarPedido({ ...base, campos: ['status'] })).toMatchObject({ ok: false, status: 400 })
  })
})

describe('los valores de cada campo', () => {
  it('el estado sólo puede ser ACTIVE o PAUSED', () => {
    expect(validarValores('estado', { status: 'ACTIVE' }).ok).toBe(true)
    expect(validarValores('estado', { status: 'DELETED' }).ok).toBe(false)
    expect(validarValores('estado', { status: 'ARCHIVED' }).ok).toBe(false)
  })

  it('el presupuesto es un entero mayor que cero, en la unidad menor de la moneda', () => {
    expect(validarValores('presupuesto', { daily_budget: 1800000 }).ok).toBe(true)
    expect(validarValores('presupuesto', { daily_budget: 0 }).ok).toBe(false)
    expect(validarValores('presupuesto', { daily_budget: -100 }).ok).toBe(false)
    // Meta no acepta decimales en la unidad menor, y redondear por abajo en silencio sería
    // decidir por el que lo cargó.
    expect(validarValores('presupuesto', { daily_budget: 1500.5 }).ok).toBe(false)
    expect(validarValores('presupuesto', { daily_budget: 'mucho' }).ok).toBe(false)
  })
})

describe('el nivel real, verificado contra el declarado', () => {
  it('un aviso trae adset_id; un conjunto, campaign_id; una campaña, ninguno', () => {
    expect(nivelReal({ id: '1', adset_id: '2', campaign_id: '3' })).toBe('aviso')
    expect(nivelReal({ id: '1', campaign_id: '3' })).toBe('conjunto')
    expect(nivelReal({ id: '1', objective: 'OUTCOME_SALES' })).toBe('campania')
  })

  it('un aviso NO se puede hacer pasar por conjunto: adset_id manda sobre campaign_id', () => {
    // Sin este orden, alguien manda un ad_id declarando 'conjunto' —el ad también trae
    // campaign_id— y se saltea la validación de nivel de la tabla de acciones.
    expect(nivelReal({ id: '1', adset_id: '2', campaign_id: '3' })).not.toBe('conjunto')
  })
})

describe('quién puede accionar sobre qué línea', () => {
  it('🔴 la cuenta fija le gana al sub tildado: clavado en BDI no toca una campaña de Zattia', () => {
    // El caso del plan. Las tres marcas se pautean de la misma cuenta publicitaria, así que si el
    // permiso se resolviera una sola vez por pantalla, alguien de BDI apagaría la pauta de Zattia.
    expect(lineasQuePuede(clavadoEnBdi, 'pausar')).toEqual(['bdi'])
    expect(permiteAccion(clavadoEnBdi, 'estado', 'bdi').ok).toBe(true)
    expect(permiteAccion(clavadoEnBdi, 'estado', 'zattia').ok).toBe(false)
    expect(permiteAccion(clavadoEnBdi, 'presupuesto', 'stunned').ok).toBe(false)
  })

  it('zattia arrastra a stunned, que no es una marca del monitor', () => {
    expect(lineasQuePuede(pausadorTotal, 'pausar')).toEqual(['bdi', 'zattia', 'stunned'])
    expect(permiteAccion(pausadorTotal, 'estado', 'stunned').ok).toBe(true)
  })

  it('pausar y presupuesto son permisos DISTINTOS', () => {
    // Pausar se deshace reactivando; subir un diario de $5.000 a $50.000 es plata gastada.
    expect(permiteAccion(pausadorTotal, 'estado', 'bdi').ok).toBe(true)
    expect(permiteAccion(pausadorTotal, 'presupuesto', 'bdi').ok).toBe(false)
    expect(accionesQuePuede(pausadorTotal, 'bdi')).toEqual(['estado'])
  })

  it('ver la sección no alcanza para tocar nada', () => {
    expect(accionesQuePuede(soloMira, 'bdi')).toEqual([])
    expect(permiteAccion(soloMira, 'estado', 'bdi').ok).toBe(false)
  })

  it('el 403 dice QUÉ permiso y EN QUÉ MARCA, para que se pueda pedir', () => {
    const r = permiteAccion(soloMira, 'presupuesto', 'zattia')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.error).toContain('meta-ads.presupuesto')
      expect(r.error).toContain('Zattia')
    }
  })

  it('el admin puede en las tres líneas', () => {
    expect(accionesQuePuede(admin, 'stunned')).toEqual(CLAVES_ACCION)
  })

  it('el tilde sin la sección no es un permiso: es un resto de una configuración vieja', () => {
    const raro = perfil({ acceso: { bdi: { 'meta-ads.pausar': true } } })
    expect(lineasQuePuede(raro, 'pausar')).toEqual([])
  })

  it('la excepción negativa manda sobre el tilde', () => {
    const excluido = perfil({
      acceso: { bdi: { 'meta-ads': true, 'meta-ads.pausar': true, '-meta-ads.pausar': true } },
    })
    expect(permiteAccion(excluido, 'estado', 'bdi').ok).toBe(false)
  })
})

describe('las reglas de presupuesto que impone Meta', () => {
  const conjunto = { id: '2', daily_budget: 500000, lifetime_budget: 0 }

  it('🔴 un conjunto de una campaña CBO rechaza el presupuesto, y dice DÓNDE tocarlo', () => {
    const padreCbo = { id: '1', daily_budget: 2000000 }
    const r = revisarPresupuesto('conjunto', { id: '2' }, padreCbo, null, 800000)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(409)
      expect(r.error).toContain('campaña')
    }
  })

  it('sin CBO en el padre, el conjunto se puede tocar', () => {
    expect(revisarPresupuesto('conjunto', conjunto, { id: '1', daily_budget: 0 }, null, 800000).ok).toBe(true)
    expect(revisarPresupuesto('conjunto', conjunto, null, null, 800000).ok).toBe(true)
  })

  it('con presupuesto TOTAL (lifetime) se muestra y no se edita', () => {
    const r = revisarPresupuesto('campania', { id: '1', daily_budget: 0, lifetime_budget: 9000000 }, null, null, 800000)
    expect(r).toMatchObject({ ok: false, status: 409 })
  })

  it('sin diario propio no hay qué cambiar: el presupuesto vive en los conjuntos', () => {
    const r = revisarPresupuesto('campania', { id: '1', daily_budget: 0, lifetime_budget: 0 }, null, null, 800000)
    expect(r).toMatchObject({ ok: false, status: 409 })
  })

  it('se valida contra el mínimo de la cuenta, en la unidad menor', () => {
    // 150000 en ARS son $1.500. Pedir 100000 ($1.000) no lo acepta Meta.
    expect(revisarPresupuesto('campania', conjunto, null, 150000, 100000)).toMatchObject({ ok: false, status: 400 })
    expect(revisarPresupuesto('campania', conjunto, null, 150000, 150000).ok).toBe(true)
  })

  it('si el mínimo no se pudo leer NO se bloquea: contesta Meta', () => {
    // Es un enriquecimiento. Negarse a escribir porque falló una lectura secundaria sería peor que
    // dejar que Meta conteste su propio error, que además es el que sabe el número exacto.
    expect(revisarPresupuesto('campania', conjunto, null, null, 1).ok).toBe(true)
  })
})

describe('🔑 la unidad menor de la moneda: la trampa número uno de la tanda', () => {
  it('ARS lleva ×100: $18.000 son 1.800.000 para Meta', () => {
    expect(factorMoneda('ARS')).toBe(100)
    expect(aCrudo(18000, 'ARS')).toBe(1800000)
    expect(aMonto(1800000, 'ARS')).toBe(18000)
  })

  it('las monedas sin decimales van ×1', () => {
    expect(factorMoneda('CLP')).toBe(1)
    expect(aCrudo(18000, 'CLP')).toBe(18000)
  })

  it('una moneda desconocida cae en ×100, que es el caso de las tres cuentas de acá', () => {
    expect(factorMoneda('')).toBe(100)
    expect(factorMoneda('USD')).toBe(100)
  })

  it('ida y vuelta no pierde plata', () => {
    for (const m of [1500, 18000, 123456]) expect(aMonto(aCrudo(m, 'ARS'), 'ARS')).toBe(m)
  })
})

describe('releer y comparar: `ok` no sale del POST', () => {
  it('Meta puede aceptar un presupuesto y no aplicarlo — eso NO es un éxito', () => {
    const r = quedoPuesto({ daily_budget: 1800000 }, { daily_budget: '500000' })
    expect(r.ok).toBe(false)
    expect(r.faltan).toEqual(['daily_budget'])
  })

  it('compara con normalización: Meta devuelve el presupuesto como string', () => {
    expect(quedoPuesto({ daily_budget: 1800000 }, { daily_budget: '1800000' }).ok).toBe(true)
    expect(quedoPuesto({ status: 'PAUSED' }, { status: 'paused' }).ok).toBe(true)
  })

  it('un objeto releído vacío nunca da por bueno el cambio', () => {
    expect(quedoPuesto({ status: 'PAUSED' }, null).ok).toBe(false)
    expect(quedoPuesto({ status: 'PAUSED' }, {}).ok).toBe(false)
  })

  it('la foto de auditoría guarda sólo los campos tocados, y null lo que no vino', () => {
    expect(fotoDe({ daily_budget: 1 }, { daily_budget: 500000, name: 'X' })).toEqual({ daily_budget: 500000 })
    expect(fotoDe({ status: 1 }, {})).toEqual({ status: null })
  })
})

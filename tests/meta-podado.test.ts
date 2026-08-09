import { describe, expect, it } from 'vitest'
import {
  candidatosAPodar,
  decidirPoda,
  faltanParaPodar,
  MOTIVOS_PODA,
  TOPE_PODA,
  type MotivoPoda,
} from '@/lib/meta-ads/podado'
import { armarPlanPodar, TIPOS_PASO, TIPOS_PLAN } from '@/lib/meta-ads/planes'
import { ventanaDe, type FilaRegla, type Umbrales } from '@/lib/meta-ads/reglas'
import { ACCIONES } from '@/lib/meta-ads/acciones'

/**
 * Podar apaga pauta que está entregando. El riesgo no es el ruido —eso era de las
 * automatizaciones— sino **apagar algo que sí vende**, y la forma concreta en que eso pasa está
 * medida: Meta atribuye compras hacia atrás durante días, así que la foto de los últimos días
 * subestima las ventas. Para escalar esa es la dirección barata; acá es la cara.
 *
 * Por eso lo que más se prueba no es que apague, sino **cuándo NO apaga**: el que ya estaba
 * apagado, el que no tiene foto, el que gastó poco, y sobre todo **el que vendió después de entrar
 * en la lista**.
 */

const HOY = '2026-08-08'

function fila(over: Partial<FilaRegla> = {}): FilaRegla {
  return {
    fecha: HOY,
    nivel: 'aviso',
    objeto_id: 'a1',
    cuenta_id: '1145878766790149',
    nombre: 'AD01 - FUNDAS NUEVAS',
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

/** N días terminando en HOY, del más viejo al más nuevo. */
function dias(n: number, over: (i: number) => Partial<FilaRegla> = () => ({})): FilaRegla[] {
  return ventanaDe(HOY, n).reverse().map((fecha, i) => fila({ fecha, ...over(i) }))
}

const umbrales = (over: Partial<Umbrales> = {}) => ({
  roas_objetivo: 3,
  cpa_maximo: null,
  gasto_minimo: 7000,
  frecuencia_maxima: null,
  techo_diario_crudo: null,
  dias_seguidos: 3,
  ...over,
}) as Umbrales

const pedir = (over: Record<string, unknown> = {}) => ({
  objetoId: 'a1',
  nivel: 'aviso' as const,
  estadoActual: 'ACTIVE',
  motivo: 'sin-ventas' as MotivoPoda,
  filas: dias(7, () => ({ spend: 1500 })),
  umbrales: umbrales(),
  hasta: HOY,
  ...over,
})

describe('podado — la forma de los motivos', () => {
  it('cada motivo declara el preset que lo propuso y los umbrales que necesita', () => {
    for (const [clave, def] of Object.entries(MOTIVOS_PODA)) {
      expect(def.preset, clave).toBeTruthy()
      expect(def.rotulo, clave).toBeTruthy()
      expect(Array.isArray(def.requiere), clave).toBe(true)
    }
  })

  /**
   * 🔑 «Gastó y no vendió nada» se puede encender el día uno porque su único umbral es DERIVABLE del
   * CPA medido de la línea. Si alguien le agregara uno que no lo es, la poda dejaría de poder
   * arrancar sola y nadie se enteraría hasta abrir el modal.
   */
  it('podar por «no vendió nada» no pide ningún umbral que haya que decidir', () => {
    expect(MOTIVOS_PODA['sin-ventas'].requiere).toEqual(['gasto_minimo'])
    expect(faltanParaPodar(umbrales({ roas_objetivo: null }), 'sin-ventas')).toEqual([])
  })

  it('podar por «rinde poco» sí pide el ROAS objetivo, y lo dice', () => {
    expect(faltanParaPodar(umbrales({ roas_objetivo: null }), 'bajo-roas')).toContain('roas_objetivo')
    const d = decidirPoda(pedir({ motivo: 'bajo-roas', umbrales: umbrales({ roas_objetivo: null }) }))
    expect(d.seguir).toBe(false)
    expect(d.faltan).toContain('roas_objetivo')
    expect(d.motivo).toContain('ROAS objetivo')
  })
})

describe('podado — el guardarraíl', () => {
  it('apaga lo que gastó de más y no vendió nada', () => {
    const d = decidirPoda(pedir())
    expect(d.seguir).toBe(true)
    expect(d.motivo).toContain('sin una sola compra')
    expect(d.evidencia.spend).toBe(10500)
  })

  /**
   * 🎯 **LA aserción de este archivo.** Meta reatribuye durante días: un aviso marcado el lunes con
   * cero compras puede tener dos el miércoles. Que la lista se haya armado con la condición cumplida
   * no autoriza a apagarlo hoy — y por eso el guardarraíl está adentro del paso y no en el momento de
   * armar el plan.
   */
  it('NO apaga si Meta le atribuyó compras desde que entró en la lista', () => {
    const filas = dias(7, (i) => ({ spend: 1500, ...(i === 5 ? { compras: 2, revenue: 9000 } : {}) }))
    const d = decidirPoda(pedir({ filas }))
    expect(d.seguir).toBe(false)
    expect(d.vendioDespues).toBe(true)
    expect(d.motivo).toContain('2 compras')
  })

  /**
   * 🔑 Contarlas sobre la ventana entera —incluidos los días que todavía se mueven— es la elección
   * conservadora justamente porque **las compras sólo pueden crecer**: un día no cerrado puede salvar
   * a un aviso, nunca condenarlo. Una compra en el último día de la ventana tiene que frenarlo.
   */
  it('una compra en el día más nuevo de la ventana alcanza para frenar la poda', () => {
    const filas = dias(7, (i) => ({ spend: 1500, ...(i === 6 ? { compras: 1, revenue: 3000 } : {}) }))
    expect(decidirPoda(pedir({ filas })).seguir).toBe(false)
  })

  it('no apaga algo que ya está apagado, y no lo cuenta como fallo', () => {
    const d = decidirPoda(pedir({ estadoActual: 'PAUSED' }))
    expect(d.seguir).toBe(false)
    expect(d.yaApagado).toBe(true)
    expect(d.motivo).toContain('Ya estaba apagado')
  })

  /**
   * 🔴 «No encontré filas» y «no vende» son cosas distintas, y sólo una de las dos justifica apagar.
   * Pasa de verdad el día que el cron de las 06:30 falla y alguien avanza el plan igual.
   */
  it('sin foto de la ventana NO apaga: no saber no es lo mismo que ir mal', () => {
    const d = decidirPoda(pedir({ filas: [] }))
    expect(d.seguir).toBe(false)
    expect(d.sinFoto).toBe(true)
  })

  it('si el gasto ya no llega al mínimo para juzgarlo, tampoco apaga', () => {
    const d = decidirPoda(pedir({ filas: dias(7, () => ({ spend: 100 })) }))
    expect(d.seguir).toBe(false)
    expect(d.motivo).toContain('por debajo del mínimo')
  })

  it('por ROAS bajo apaga sólo si vendió algo y aun así no llega', () => {
    const flojo = dias(7, () => ({ spend: 1500, compras: 1, revenue: 1500 }))
    const d = decidirPoda(pedir({ motivo: 'bajo-roas', filas: flojo }))
    expect(d.seguir).toBe(true)
    expect(d.evidencia.roas_objetivo).toBe(3)

    const bueno = dias(7, () => ({ spend: 1500, compras: 1, revenue: 9000 }))
    const e = decidirPoda(pedir({ motivo: 'bajo-roas', filas: bueno }))
    expect(e.seguir).toBe(false)
    expect(e.vendioDespues).toBe(true)
  })

  it('guarda el estado de antes, que es lo que hace falta para devolverlo como estaba', () => {
    expect(decidirPoda(pedir()).evidencia.estado_antes).toBe('ACTIVE')
  })

  it('un motivo que no existe no apaga nada', () => {
    expect(decidirPoda(pedir({ motivo: 'inventado' as MotivoPoda })).seguir).toBe(false)
  })
})

describe('podado — la lista de candidatos', () => {
  const universo = [
    ...dias(7, () => ({ objeto_id: 'quema', nombre: 'AD00 - FALDAS PINTEREST', spend: 1700 })),
    ...dias(7, () => ({ objeto_id: 'vende', nombre: 'AD 05 - EL BUENO', spend: 1700, compras: 1, revenue: 20000 })),
    ...dias(7, () => ({ objeto_id: 'chico', nombre: 'AD 06 - RECIÉN PRENDIDO', spend: 50 })),
    ...dias(7, () => ({ objeto_id: 'dormido', nombre: 'AD 07 - YA APAGADO', spend: 1700, estado: 'PAUSED', estado_efectivo: 'PAUSED' })),
  ]

  it('ofrece sólo lo que el guardarraíl después va a aprobar', () => {
    const r = candidatosAPodar({ filas: universo, umbrales: umbrales(), hasta: HOY })
    expect(r.candidatos.map((c) => c.objetoId)).toEqual(['quema'])
  })

  /**
   * 🔑 La lista y el guardarraíl **tienen que ser la misma cuenta**. Si difirieran, el modal
   * ofrecería cinco y el motor saltearía tres, y eso se lee como que la herramienta está rota.
   */
  it('todo lo que ofrece pasa el guardarraíl, y nada de lo que descarta lo pasaría', () => {
    const r = candidatosAPodar({ filas: universo, umbrales: umbrales(), hasta: HOY })
    for (const c of r.candidatos) {
      const d = decidirPoda({ objetoId: c.objetoId, nivel: 'aviso', estadoActual: 'ACTIVE', motivo: 'sin-ventas', filas: universo, umbrales: umbrales(), hasta: HOY })
      expect(d.seguir, c.objetoId).toBe(true)
    }
    for (const id of ['vende', 'chico']) {
      const d = decidirPoda({ objetoId: id, nivel: 'aviso', estadoActual: 'ACTIVE', motivo: 'sin-ventas', filas: universo, umbrales: umbrales(), hasta: HOY })
      expect(d.seguir, id).toBe(false)
    }
  })

  it('ordena por lo que más cuesta y dice cuánto se libera por día', () => {
    const filas = [
      ...dias(7, () => ({ objeto_id: 'caro', spend: 3000 })),
      ...dias(7, () => ({ objeto_id: 'barato', spend: 1100 })),
    ]
    const r = candidatosAPodar({ filas, umbrales: umbrales(), hasta: HOY })
    expect(r.candidatos.map((c) => c.objetoId)).toEqual(['caro', 'barato'])
    expect(r.candidatos[0].porDia).toBe(3000)
  })

  it('sin el umbral que hace falta devuelve la lista vacía y el motivo, no un error', () => {
    const r = candidatosAPodar({ filas: universo, umbrales: umbrales({ roas_objetivo: null }), hasta: HOY, motivo: 'bajo-roas' })
    expect(r.ok).toBe(true)
    expect(r.candidatos).toEqual([])
    expect(r.detalle).toContain('ROAS objetivo')
  })

  /**
   * 🔴 La forma real del dato: la configuración se escribe sólo en la fila del día en que se saca la
   * foto. Un aviso al aire cuyas filas viejas no tienen estado tiene que seguir siendo candidato.
   * Ver la cabecera de `agrupar()`.
   */
  it('un aviso con el estado escrito en una sola fila sigue siendo candidato', () => {
    const filas = dias(7, (i) => ({
      objeto_id: 'quema', spend: 1700,
      ...(i < 6 ? { estado: null, estado_efectivo: null } : {}),
    }))
    const r = candidatosAPodar({ filas, umbrales: umbrales(), hasta: HOY })
    expect(r.candidatos.map((c) => c.objetoId)).toEqual(['quema'])
  })
})

describe('podado — el plan', () => {
  const uno = (id: string) => ({ objetoId: id, nivel: 'aviso' as const, nombre: `AD ${id}`, motivo: 'sin-ventas' as MotivoPoda })

  it('arma un paso por objeto, todos ahora', () => {
    const a = armarPlanPodar({ objetos: [uno('111'), uno('222'), uno('333')] })
    if (!a.ok) throw new Error(a.error)
    expect(a.pasos).toHaveLength(3)
    expect(a.pasos.every((p) => p.tipo === 'poda')).toBe(true)
    expect(a.pasos.map((p) => p.orden)).toEqual([1, 2, 3])
    expect(a.variante).toBe('poda-3')
  })

  /** El motivo viaja en el paso: una poda puede mezclar los dos y cada uno se vuelve a preguntar el suyo. */
  it('cada paso se lleva el motivo que lo justificó', () => {
    const a = armarPlanPodar({ objetos: [uno('111'), { ...uno('222'), motivo: 'bajo-roas' as MotivoPoda }] })
    if (!a.ok) throw new Error(a.error)
    expect(a.pasos[0].pedido?.motivo).toBe('sin-ventas')
    expect(a.pasos[1].pedido?.motivo).toBe('bajo-roas')
  })

  /** Un id repetido daría un segundo paso que se saltearía diciendo «ya estaba apagado» por culpa del primero. */
  it('un id repetido no genera dos pasos', () => {
    const a = armarPlanPodar({ objetos: [uno('111'), uno('111')] })
    if (!a.ok) throw new Error(a.error)
    expect(a.pasos).toHaveLength(1)
  })

  it('no arma nada sin objetos, con un id que no es de Meta, o con un motivo inventado', () => {
    expect(armarPlanPodar({ objetos: [] }).ok).toBe(false)
    expect(armarPlanPodar({ objetos: [{ ...uno('no-numero') }] }).ok).toBe(false)
    expect(armarPlanPodar({ objetos: [{ ...uno('111'), motivo: 'inventado' as MotivoPoda }] }).ok).toBe(false)
  })

  it('corta arriba del tope: una lista más larga no se revisa a ojo', () => {
    const muchos = Array.from({ length: TOPE_PODA + 1 }, (_, i) => uno(String(1000 + i)))
    const a = armarPlanPodar({ objetos: muchos })
    expect(a.ok).toBe(false)
    if (a.ok) throw new Error('debería fallar')
    expect(a.error).toContain(String(TOPE_PODA))
  })

  /**
   * 🔑 Un plan exige el sub de la acción que ejecuta, ni más ni menos. Podar apaga, que es lo que
   * cualquiera con `pausar` ya puede hacer de a un renglón por vez desde Campañas.
   */
  it('podar pide `pausar` y ningún tilde nuevo', () => {
    expect(TIPOS_PLAN.podar.sub).toBe('pausar')
    expect(TIPOS_PLAN.podar.sub).toBe(ACCIONES.estado.sub)
  })

  /** `PAUSED` es absoluto: el segundo intento deja lo mismo que el primero. Y pregunta antes de escribir. */
  it('el paso de poda es reintentable y tiene guardarraíl', () => {
    expect(TIPOS_PASO.poda.reintentable).toBe(true)
    expect(TIPOS_PASO.poda.crea).toBe(false)
    expect(TIPOS_PASO.poda.guardarrail).toBe(true)
  })
})

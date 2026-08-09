import { describe, expect, it } from 'vitest'
import {
  armarPlanDuplicar, armarPlanMoverPlata, armarPlanPiezas, entraOtroPaso, ESPERA_SONDA_MS,
  estadoDePlan, marcaDePaso, marcadorDe, MAX_INTENTOS, MAX_INTENTOS_DEMORA, maxIntentosDe,
  nombreConMarca, politicaReintento, PRESUPUESTO_MS, repartir, siguientePaso, sustituir,
  TIMEOUT_PASO_MS, TIPOS_PASO, TOPE_COPIAS,
} from '@/lib/meta-ads/planes'
import type { PasoPlan, TipoPaso } from '@/lib/meta-ads/planes'
import { LARGO_NOMBRE } from '@/lib/meta-ads/acciones'

/**
 * El guard del motor de planes.
 *
 * ⚠️ Esto NO es un test de pantalla: `api/_meta-planes.js` decide con estas mismas funciones. Lo que
 * se fija acá es literalmente lo que el motor va a hacer con una escritura que se cortó.
 *
 * El riesgo que ordena todos los casos: **un paso que crea algo y quedó sin respuesta puede haberse
 * aplicado igual**. Repetirlo hace dos campañas, dos conjuntos o dos avisos, y eso es plata que se
 * gasta sola hasta que alguien mire.
 */

const paso = (o: Partial<PasoPlan>): Partial<PasoPlan> => ({
  orden: 1, tipo: 'copiar-campania', rotulo: 'Copiar', estado: 'pendiente', intentos: 0,
  pedido: null, resultadoId: null, marca: null, detalle: null, ultimoEn: null, ...o,
})

const AHORA = new Date('2026-08-08T18:00:00Z').getTime()

describe('politicaReintento — la función que sostiene el motor', () => {
  it('🔴 NUNCA devuelve `ejecutar` para un paso NO reintentable en curso que no fue sondeado', () => {
    // Esta aserción sola vale por todo el archivo: es la diferencia entre adoptar la copia que Meta
    // ya creó y crear una segunda sin que nadie la pida.
    const creadores = (Object.keys(TIPOS_PASO) as TipoPaso[]).filter((t) => !TIPOS_PASO[t].reintentable)
    expect(creadores.length).toBeGreaterThan(0)
    for (const tipo of creadores) {
      for (let intentos = 0; intentos < MAX_INTENTOS; intentos++) {
        expect(politicaReintento(paso({ tipo, estado: 'en-curso', intentos }), AHORA)).toBe('sondear')
      }
    }
  })

  it('un paso reintentable en curso se repite: un valor absoluto deja lo mismo', () => {
    expect(politicaReintento(paso({ tipo: 'presupuesto', estado: 'en-curso' }), AHORA)).toBe('ejecutar')
    expect(politicaReintento(paso({ tipo: 'nombre', estado: 'en-curso' }), AHORA)).toBe('ejecutar')
  })

  it('pendiente → ejecutar: no hay nada que sondear', () => {
    expect(politicaReintento(paso({ estado: 'pendiente' }), AHORA)).toBe('ejecutar')
  })

  it('🔑 sondeado y no encontrado hace poco → esperar, NO atascar', () => {
    // «No la encontré» NO es «no se creó»: justo después de un corte Meta puede seguir armándola.
    const p = paso({ estado: 'dudoso', ultimoEn: new Date(AHORA - ESPERA_SONDA_MS + 1000).toISOString() })
    expect(politicaReintento(p, AHORA)).toBe('esperar')
  })

  it('sondeado y no encontrado hace rato → se vuelve a sondear', () => {
    const p = paso({ estado: 'dudoso', ultimoEn: new Date(AHORA - ESPERA_SONDA_MS - 1000).toISOString() })
    expect(politicaReintento(p, AHORA)).toBe('sondear')
  })

  it(`a los ${MAX_INTENTOS} intentos se rinde, y el plan queda ATASCADO (visible), no en silencio`, () => {
    expect(politicaReintento(paso({ estado: 'en-curso', intentos: MAX_INTENTOS }), AHORA)).toBe('rendirse')
    // También el reintentable: si un valor absoluto no entra en tres intentos, el problema no es el valor.
    expect(politicaReintento(paso({ tipo: 'presupuesto', estado: 'en-curso', intentos: MAX_INTENTOS }), AHORA)).toBe('rendirse')
  })

  it('un paso ya hecho o salteado no se toca', () => {
    expect(politicaReintento(paso({ estado: 'hecho' }), AHORA)).toBe('listo')
    expect(politicaReintento(paso({ estado: 'salteado' }), AHORA)).toBe('listo')
  })
})

describe('las marcas: adoptar en vez de reintentar', () => {
  it('🔑 el marcador se DERIVA del idem: el mismo idem da el mismo marcador', () => {
    // Si fuera un random, un reintento con el mismo idem buscaría algo distinto de lo que creó el
    // primer intento — que es exactamente el caso para el que existe la sonda.
    expect(marcadorDe('pabc123')).toBe(marcadorDe('pabc123'))
    expect(marcadorDe('pabc123')).not.toBe(marcadorDe('pabc124'))
  })

  it('dos pasos del mismo plan tienen marcas distintas', () => {
    // Un plan de 3 copias crea 3 objetos hermanos: buscando sólo por el marcador aparecerían los
    // tres y la sonda no sabría cuál es el del paso 2.
    const m = marcadorDe('pzzz')
    expect(marcaDePaso(m, 1)).not.toBe(marcaDePaso(m, 2))
    // Y las dos siguen conteniendo el marcador, así que buscar el lote entero sigue andando.
    expect(marcaDePaso(m, 1)).toContain(m)
  })

  it('🔴 un nombre largo recorta el NOMBRE, nunca la marca', () => {
    // Un nombre cortado sigue siendo legible; una marca cortada deja el objeto imposible de encontrar.
    const marca = marcaDePaso(marcadorDe('plargo'), 7)
    const n = nombreConMarca('x'.repeat(LARGO_NOMBRE + 50), marca)
    expect(n.length).toBeLessThanOrEqual(LARGO_NOMBRE)
    expect(n.endsWith(marca)).toBe(true)
  })

  it('un nombre con saltos de línea no rompe la fila de la tabla', () => {
    expect(nombreConMarca('Ventas\nago', '·1')).toBe('Ventas ago·1')
  })
})

describe('sustituir: lo que encadena los pasos', () => {
  it('cambia el {{n}} por el id que produjo el paso n', () => {
    const r = sustituir({ adsetId: '{{1}}', creativeId: '999' }, { 1: '234' })
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('debería resolver')
    expect(r.pedido.adsetId).toBe('234')
  })

  it('🔴 si falta un id NO manda nada: un `{{1}}` literal sería un 400 con la fila diciendo que se intentó', () => {
    const r = sustituir({ adsetId: '{{1}}' }, {})
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('debería faltar')
    expect(r.faltan).toEqual(['1'])
  })
})

describe('estadoDePlan y siguientePaso', () => {
  const p = (estado: string) => ({ estado }) as { estado: PasoPlan['estado'] }

  it('un solo paso fallado atasca el plan entero', () => {
    expect(estadoDePlan([p('hecho'), p('fallado'), p('pendiente')])).toBe('atascado')
  })

  it('todos hechos o salteados → hecho', () => {
    expect(estadoDePlan([p('hecho'), p('salteado')])).toBe('hecho')
  })

  it('nada empezado → pendiente; algo empezado → en-curso', () => {
    expect(estadoDePlan([p('pendiente'), p('pendiente')])).toBe('pendiente')
    expect(estadoDePlan([p('hecho'), p('pendiente')])).toBe('en-curso')
    expect(estadoDePlan([p('dudoso'), p('pendiente')])).toBe('en-curso')
  })

  it('siguientePaso saltea los hechos y respeta el orden aunque vengan desordenados', () => {
    const pasos = [
      paso({ orden: 3, estado: 'pendiente' }), paso({ orden: 1, estado: 'hecho' }),
      paso({ orden: 2, estado: 'dudoso' }),
    ] as PasoPlan[]
    expect(siguientePaso(pasos)?.orden).toBe(2)
  })
})

describe('el presupuesto de tiempo', () => {
  it('🔑 no se empieza un paso que no entra entero', () => {
    // Arrancar uno que va a morir por límite de función es exactamente cómo se fabrica un paso en
    // curso del que no se sabe nada.
    expect(entraOtroPaso(0)).toBe(true)
    expect(entraOtroPaso(PRESUPUESTO_MS - TIMEOUT_PASO_MS)).toBe(true)
    expect(entraOtroPaso(PRESUPUESTO_MS - TIMEOUT_PASO_MS + 1)).toBe(false)
  })

  it('el timeout de un paso es MENOR que el de una llamada suelta', () => {
    // Acá se encadenan pasos: uno colgado no se puede comer la función entera.
    expect(TIMEOUT_PASO_MS).toBeLessThan(8000)
  })
})

describe('armarPlanDuplicar', () => {
  const marcador = marcadorDe('pdup')
  // La receta la arma el handler leyendo Meta y la valida antes de que el plan exista; acá entra ya
  // resuelta, que es todo lo que el generador necesita saber de ella. Ver `lib/meta-ads/receta.core.js`.
  const receta = { cuerpo: { targeting: '{}', daily_budget: '600000' }, notas: [] }
  const conjunto = {
    nivel: 'conjunto', objetoId: '111', cuentaId: '999', campaignId: '100', nombreOriginal: 'Conj A',
    copias: 1, censo: { avisos: [{ id: 'a1', nombre: 'Aviso 1', creativeId: 'c1' }, { id: 'a2', nombre: 'Aviso 2', creativeId: 'c2' }] },
    receta,
  }

  it('🔑 el tope de 3 avisos deja de existir: la copia es shallow + un paso por aviso', () => {
    // Es el punto entero de la tanda. Antes esto era un 409 «Meta sólo copia hasta 3 de una vez».
    const seis = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, nombre: `Aviso ${i}`, creativeId: `c${i}` }))
    const r = armarPlanDuplicar({ ...conjunto, censo: { avisos: seis } }, marcador)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.pasos.filter((p) => p.tipo === 'crear-aviso')).toHaveLength(6)
    expect(r.pasos.filter((p) => p.tipo === 'crear-conjunto')).toHaveLength(1)
  })

  it('cada aviso se crea contra el conjunto que devolvió el paso anterior', () => {
    const r = armarPlanDuplicar(conjunto, marcador)
    if (!r.ok) throw new Error(r.error)
    const copia = r.pasos.find((p) => p.tipo === 'crear-conjunto')!
    for (const a of r.pasos.filter((p) => p.tipo === 'crear-aviso')) {
      expect(a.pedido!.adsetId).toBe(`{{${copia.orden}}}`)
    }
  })

  it('🔴 al copiar una campaña, la marca se hereda ENSEGUIDA y no al final', () => {
    // Si el plan se corta después de crear la campaña, sin este paso queda un objeto que nadie puede
    // accionar desde el monitor, ni siquiera quien lo creó.
    const r = armarPlanDuplicar({
      nivel: 'campania', objetoId: '100', cuentaId: '999', campaignId: '100', nombreOriginal: 'Camp',
      copias: 1, censo: { conjuntos: [{ id: 'c1', nombre: 'Conj', receta, avisos: [{ id: 'a1', nombre: 'Av', creativeId: 'cr1' }] }] },
    }, marcador)
    if (!r.ok) throw new Error(r.error)
    expect(r.pasos[0].tipo).toBe('copiar-campania')
    expect(r.pasos[1].tipo).toBe('heredar-linea')
  })

  it('sólo los pasos que CREAN llevan marca propia', () => {
    const r = armarPlanDuplicar({ ...conjunto, nombre: 'Nuevo', presupuestoCrudo: 500000 }, marcador)
    if (!r.ok) throw new Error(r.error)
    for (const p of r.pasos) {
      expect(Boolean(p.marca)).toBe(TIPOS_PASO[p.tipo].crea)
    }
  })

  it('N copias arman N veces la secuencia, y los órdenes no se repiten', () => {
    const r = armarPlanDuplicar({ ...conjunto, copias: 3 }, marcador)
    if (!r.ok) throw new Error(r.error)
    expect(r.pasos.filter((p) => p.tipo === 'crear-conjunto')).toHaveLength(3)
    const ordenes = r.pasos.map((p) => p.orden)
    expect(new Set(ordenes).size).toBe(ordenes.length)
  })

  it(`rechaza más de ${TOPE_COPIAS} copias y niveles que no existen`, () => {
    expect(armarPlanDuplicar({ ...conjunto, copias: TOPE_COPIAS + 1 }, marcador).ok).toBe(false)
    expect(armarPlanDuplicar({ ...conjunto, nivel: 'aviso' }, marcador).ok).toBe(false)
  })
})

describe('armarPlanMoverPlata', () => {
  const base = { deId: '111', aId: '222', montoCrudo: 200000, deActualCrudo: 500000, aActualCrudo: 300000, minDiarioCrudo: 100000 }

  it('⚠️ LA BAJA SIEMPRE ANTES QUE LA SUBA, y es una invariante del generador', () => {
    // Un corte a la mitad deja la cuenta gastando de MENOS, nunca de más. La dirección del fallo es
    // la barata: al revés, un corte entre la suba y la baja gasta plata real todos los días.
    const r = armarPlanMoverPlata(base)
    if (!r.ok) throw new Error(r.error)
    expect(r.pasos[0].pedido!.objetoId).toBe('111')
    expect(Number(r.pasos[0].pedido!.daily_budget)).toBeLessThan(base.deActualCrudo)
    expect(r.pasos[1].pedido!.objetoId).toBe('222')
    expect(Number(r.pasos[1].pedido!.daily_budget)).toBeGreaterThan(base.aActualCrudo)
  })

  it('conserva la suma', () => {
    const r = armarPlanMoverPlata(base)
    if (!r.ok) throw new Error(r.error)
    const suma = Number(r.pasos[0].pedido!.daily_budget) + Number(r.pasos[1].pedido!.daily_budget)
    expect(suma).toBe(base.deActualCrudo + base.aActualCrudo)
  })

  it('🔴 no deja al origen por debajo del mínimo de la cuenta', () => {
    // No es un error que Meta avise al escribir: es un conjunto que deja de entregar.
    const r = armarPlanMoverPlata({ ...base, montoCrudo: 450000 })
    expect(r.ok).toBe(false)
  })

  it('no mueve más de lo que hay, ni entre un conjunto y sí mismo', () => {
    expect(armarPlanMoverPlata({ ...base, montoCrudo: 500000 }).ok).toBe(false)
    expect(armarPlanMoverPlata({ ...base, aId: '111' }).ok).toBe(false)
    expect(armarPlanMoverPlata({ ...base, montoCrudo: 0 }).ok).toBe(false)
  })

  it('repartir conserva la suma con cualquier monto válido', () => {
    for (const monto of [1, 12345, 399999]) {
      const r = repartir(400000, 100000, monto, 0)
      expect(r.ok).toBe(true)
      if (!r.ok) throw new Error(r.error)
      expect(r.deNuevo + r.aNuevo).toBe(500000)
    }
  })
})

describe('armarPlanPiezas — una pieza, un conjunto propio, un aviso', () => {
  const COPY = {
    pageId: '102030405060708', instagramId: '17841400000000000',
    mensaje: 'Bajamos los precios', titulo: 'Hasta 40% off', descripcion: null,
    destino: 'https://bdi.com.ar/frio', cta: 'SHOP_NOW',
  }
  const base = {
    cuentaId: '1145878766790149',
    campaignId: '120238696262900478',
    nombre: 'PIEZAS 12/8',
    copy: COPY,
    receta: { cuerpo: { daily_budget: '180000', optimization_goal: 'OFFSITE_CONVERSIONS' }, notas: [] },
    piezas: [{ nombre: 'reel-uno.mp4', url: 'https://blob.vercel-storage.com/a.mp4', clase: 'video' }],
  }
  const MARCADOR = ' · #abc1234'

  it('un video son cinco pasos, y la pieza va ANTES que el conjunto', () => {
    // 🔴 El orden es la decisión, no un detalle: al revés, un video que Meta rechaza dejaría un
    // conjunto vacío ya creado que alguien tiene que ir a borrar a mano.
    const r = armarPlanPiezas(base, MARCADOR)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.pasos.map((p) => p.tipo)).toEqual([
      'subir-pieza', 'esperar-pieza', 'crear-creativo', 'crear-conjunto', 'crear-aviso',
    ])
  })

  it('una imagen NO tiene subida ni espera: Meta baja la foto de la URL sola', () => {
    const r = armarPlanPiezas(
      { ...base, piezas: [{ nombre: 'foto.jpg', url: 'https://blob.vercel-storage.com/b.jpg', clase: 'imagen' }] },
      MARCADOR,
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.pasos.map((p) => p.tipo)).toEqual(['crear-creativo', 'crear-conjunto', 'crear-aviso'])
  })

  it('🔴 el largo del plan NO es piezas × 5: una tanda mixta tiene pasos distintos por pieza', () => {
    const r = armarPlanPiezas({
      ...base,
      piezas: [
        { nombre: 'a.mp4', url: 'https://blob.vercel-storage.com/a.mp4', clase: 'video' },
        { nombre: 'b.jpg', url: 'https://blob.vercel-storage.com/b.jpg', clase: 'imagen' },
      ],
    }, MARCADOR)
    if (!r.ok) throw new Error(r.error)
    expect(r.pasos).toHaveLength(8)
  })

  it('🔑 las subidas van TODAS primero: los videos se procesan en paralelo del lado de Meta', () => {
    // Intercaladas, la espera de la pieza 2 arranca recién cuando terminó la 1, y una tanda de ocho
    // se vuelve media hora de reloj con la pestaña abierta.
    const r = armarPlanPiezas({
      ...base,
      piezas: [
        { nombre: 'a.mp4', url: 'https://blob.vercel-storage.com/a.mp4', clase: 'video' },
        { nombre: 'b.mp4', url: 'https://blob.vercel-storage.com/b.mp4', clase: 'video' },
      ],
    }, MARCADOR)
    if (!r.ok) throw new Error(r.error)
    expect(r.pasos.slice(0, 2).map((p) => p.tipo)).toEqual(['subir-pieza', 'subir-pieza'])
  })

  it('cada pieza encadena SU creativo con SU conjunto, y nunca con el de la otra', () => {
    // El defecto que esto caza: un `{{n}}` mal calculado hace que las dos piezas terminen en el
    // mismo conjunto, que es exactamente lo que este plan existe para NO hacer.
    const r = armarPlanPiezas({
      ...base,
      piezas: [
        { nombre: 'a.mp4', url: 'https://blob.vercel-storage.com/a.mp4', clase: 'video' },
        { nombre: 'b.mp4', url: 'https://blob.vercel-storage.com/b.mp4', clase: 'video' },
      ],
    }, MARCADOR)
    if (!r.ok) throw new Error(r.error)
    const avisos = r.pasos.filter((p) => p.tipo === 'crear-aviso')
    const esperas = r.pasos.filter((p) => p.tipo === 'esperar-pieza')
    expect(avisos).toHaveLength(2)
    // Cada espera mira el video de SU subida: la primera el paso 1, la segunda el paso 2.
    expect(esperas.map((p) => p.pedido!.videoId)).toEqual(['{{1}}', '{{2}}'])
    expect(avisos[0].pedido!.creativeId).toBe('{{4}}')
    expect(avisos[0].pedido!.adsetId).toBe('{{5}}')
    expect(avisos[1].pedido!.creativeId).toBe('{{8}}')
    expect(avisos[1].pedido!.adsetId).toBe('{{9}}')
  })

  it('la campaña va LITERAL: este plan no crea campañas', () => {
    const r = armarPlanPiezas(base, MARCADOR)
    if (!r.ok) throw new Error(r.error)
    const conj = r.pasos.find((p) => p.tipo === 'crear-conjunto')!
    expect(conj.pedido!.campaignId).toBe('120238696262900478')
    expect(r.pasos.some((p) => p.tipo === 'crear-campania')).toBe(false)
  })

  it('todo lo que crea lleva marca; lo que espera, no', () => {
    const r = armarPlanPiezas(base, MARCADOR)
    if (!r.ok) throw new Error(r.error)
    for (const p of r.pasos) {
      expect(Boolean(p.marca)).toBe(TIPOS_PASO[p.tipo].crea)
    }
  })

  it('el nombre de cada conjunto sale del archivo, sin la extensión', () => {
    const r = armarPlanPiezas(base, MARCADOR)
    if (!r.ok) throw new Error(r.error)
    expect(r.pasos.find((p) => p.tipo === 'crear-conjunto')!.pedido!.nombreBase)
      .toBe('PIEZAS 12/8 · reel-uno')
  })

  it('se planta sin campaña, sin receta, sin copy y sin piezas', () => {
    expect(armarPlanPiezas({ ...base, campaignId: '' }, MARCADOR).ok).toBe(false)
    expect(armarPlanPiezas({ ...base, receta: null }, MARCADOR).ok).toBe(false)
    expect(armarPlanPiezas({ ...base, copy: null }, MARCADOR).ok).toBe(false)
    expect(armarPlanPiezas({ ...base, piezas: [] }, MARCADOR).ok).toBe(false)
    expect(armarPlanPiezas({ ...base, nombre: '' }, MARCADOR).ok).toBe(false)
  })
})

describe('maxIntentosDe — un «todavía no» de Meta no es un error', () => {
  it('el paso que espera pregunta muchas más veces que el que escribe', () => {
    expect(maxIntentosDe('esperar-pieza')).toBe(MAX_INTENTOS_DEMORA)
    expect(maxIntentosDe('crear-aviso')).toBe(MAX_INTENTOS)
    expect(MAX_INTENTOS_DEMORA).toBeGreaterThan(MAX_INTENTOS)
  })

  it('🔴 con los 3 de siempre, esperar un video quedaría atascado antes de que Meta termine', () => {
    // Éste es el defecto que la propiedad `demora` evita, escrito como caso.
    const esperando = paso({ tipo: 'esperar-pieza', estado: 'en-curso', intentos: MAX_INTENTOS })
    expect(politicaReintento(esperando, AHORA)).toBe('ejecutar')
  })

  it('⛔ pero no es infinito: al techo se rinde y el plan queda atascado delante de alguien', () => {
    const agotado = paso({ tipo: 'esperar-pieza', estado: 'en-curso', intentos: MAX_INTENTOS_DEMORA })
    expect(politicaReintento(agotado, AHORA)).toBe('rendirse')
  })
})

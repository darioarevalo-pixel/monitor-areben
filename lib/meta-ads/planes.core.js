/**
 * El motor de planes por pasos: **la lógica pura**, sin Meta y sin base.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `acciones.core.js` y `permisos.core.js`: lo importa `api/_meta-planes.js`, que
 * corre en Node sin pasar por el compilador de Next y **no puede importar TypeScript**. `planes.ts`
 * es el re-export tipado que usa la pantalla.
 *
 * # Qué problema resuelve, y por qué no alcanzaba con `_meta-acciones.js`
 *
 * Una acción suelta entra en un request: se pide, se escribe, se relee, se cierra la fila. Duplicar
 * un conjunto con 6 avisos **no entra**: son 7 POSTs y el plan Hobby corta la función a los 10 s.
 * Medido el 8-ago-2026, una sola copia profunda ya tarda más que los 8 s del `fetch`.
 *
 * El motor parte la operación en pasos chicos, cada uno con su marca anotada ANTES del POST, y deja
 * que el avance se retome donde quedó —otra pestaña, otro día—. Lo que gana de entrada:
 *
 * 1. **El tope de 3 avisos deja de ser un 409.** Copia *shallow* + un paso `crear-aviso` por aviso
 *    reusando el `creative_id` del original: N+1 pasos chicos en vez de una copia profunda que Meta
 *    rechaza. De paso **esquiva** el rechazo por `degrees_of_freedom_spec` que documenta
 *    `?recurso=mejoras`: el aviso nuevo se arma desde el `creative_id` y nunca arrastra ese campo.
 * 2. **Duplicar N veces de una** sin N clics.
 * 3. **Mover plata entre conjuntos**, que es puro paso de presupuesto y es el mejor ejercicio de la
 *    transaccionalidad que Meta no tiene.
 *
 * # La invariante que lo sostiene
 *
 * **Todo objeto que crea un plan lleva su marca en el nombre.** No es cosmética: es lo único que
 * permite **adoptar en vez de reintentar**. Un POST que crea algo y se corta sin respuesta puede
 * haberse aplicado igual; reintentarlo haría dos. Con la marca escrita antes, la sonda lo busca por
 * nombre y lo adopta. Es lo que hoy hace a mano el sufijo de `duplicar`, elevado a regla.
 */

import { LARGO_NOMBRE, lineasQuePuede } from './acciones.core.js'

/**
 * Los tipos de paso que existen. **Todo lo que el motor sabe ejecutar está acá y en ningún otro
 * lado**, igual que la tabla `ACCIONES` con las acciones sueltas.
 *
 * `reintentable` no es una opinión de quien escribe el handler: es una propiedad del paso. Poner un
 * `daily_budget` o un `name` a un valor ABSOLUTO se puede repetir sin consecuencia; crear algo, no
 * —un reintento hace dos objetos—. De ahí sale, sin ninguna otra rama, que un paso que crea y quedó
 * en curso se **sondea** en vez de repetirse.
 *
 * `crea` dice si el paso produce un objeto nuevo, o sea si tiene marca propia y sonda.
 */
export const TIPOS_PASO = {
  'copiar-campania': {
    rotulo: 'copiar la campaña',
    reintentable: false,
    crea: true,
    // Dónde busca la sonda lo que este paso pudo haber creado. `{{cuenta}}` lo resuelve el handler.
    sondaEn: 'cuenta',
  },
  /**
   * Una campaña NUEVA, no una copia. Nace `PAUSED` y vacía; lo que la hace accionable desde el
   * monitor es el `heredar-linea` que va inmediatamente después.
   */
  'crear-campania': {
    rotulo: 'crear la campaña',
    reintentable: false,
    crea: true,
    sondaEn: 'cuenta',
  },
  /**
   * ⚠️ **Ya no se genera.** Queda porque los planes viejos de la base lo referencian y el motor
   * tiene que poder seguir avanzándolos. Lo reemplazó `crear-conjunto`: `POST /copies` revalida la
   * configuración con las reglas de hoy y falla en 12 de 16 conjuntos reales, sin ningún lugar
   * donde meterle la corrección. Ver `receta.core.js`.
   */
  'copiar-conjunto': {
    rotulo: 'copiar el conjunto',
    reintentable: false,
    crea: true,
    sondaEn: 'campania',
  },
  /**
   * El conjunto se **arma desde sus piezas** en vez de pedirle la fotocopia a Meta: es el único
   * camino donde entra una corrección. Sondea igual que la copia —nace con la marca en el nombre—,
   * así que un corte se adopta en vez de crear un segundo.
   */
  'crear-conjunto': {
    rotulo: 'crear el conjunto',
    reintentable: false,
    crea: true,
    sondaEn: 'campania',
  },
  'crear-aviso': {
    rotulo: 'crear el aviso',
    reintentable: false,
    crea: true,
    sondaEn: 'conjunto',
  },
  presupuesto: {
    rotulo: 'poner el presupuesto',
    // Un valor absoluto: el segundo intento deja lo mismo que el primero.
    reintentable: true,
    crea: false,
  },
  nombre: {
    rotulo: 'poner el nombre',
    reintentable: true,
    crea: false,
  },
  'heredar-linea': {
    // No toca Meta: escribe la fila de `meta_ads_campania_linea`. Va igual como paso —y no como un
    // efecto lateral del anterior— porque **es lo que hace accionable a la campaña nueva**: si el
    // plan se corta justo después de crearla, sin este paso queda un objeto que nadie puede tocar
    // desde el monitor, ni siquiera quien lo creó.
    rotulo: 'asignarle la marca',
    reintentable: true,
    crea: false,
  },
}

export const TIPOS_PLAN = {
  duplicar: {
    // El mismo sub que la acción suelta: cada sub son dos tildes manuales por persona y por marca.
    sub: 'crear',
    rotulo: 'duplicar',
    rotuloPermiso: 'Puede duplicar y crear campañas',
  },
  crear: {
    // El mismo sub que duplicar: las dos cosas que hacen son crear objetos en Meta, y un sub propio
    // serían dos tildes más por persona y por marca para habilitar algo del mismo peso.
    sub: 'crear',
    rotulo: 'crear una campaña',
    rotuloPermiso: 'Puede duplicar y crear campañas',
  },
  'mover-plata': {
    // 🔑 Mover plata NO es un sub nuevo: es `presupuesto`, que es exactamente lo que hace. Un sub
    // propio sería un permiso más que dar y uno más que alguien se olvida.
    sub: 'presupuesto',
    rotulo: 'mover presupuesto entre conjuntos',
    rotuloPermiso: 'Puede cambiar el presupuesto',
  },
}

export const CLAVES_PLAN = Object.keys(TIPOS_PLAN)

/**
 * ¿Puede este perfil armar y avanzar un plan de `tipo` sobre `linea`?
 *
 * 🔑 **Un plan no suma un sub-permiso nuevo**: exige el mismo que exige la acción suelta que ejecuta.
 * Duplicar por plan pide `crear`, igual que duplicar de una; mover plata pide `presupuesto`, que es
 * literalmente lo que hace. Un sub propio serían dos tildes más por persona y por marca para
 * habilitar algo que ya se podía hacer de a un paso.
 */
export function permitePlan(perfil, tipo, linea) {
  const def = TIPOS_PLAN[tipo]
  if (!def) return { ok: false, status: 400, error: `No existe el plan «${tipo}».` }
  if (lineasQuePuede(perfil, def.sub).includes(linea)) return { ok: true }
  return {
    ok: false,
    status: 403,
    error: `Para ${def.rotulo} hace falta el permiso «${def.rotuloPermiso}» (meta-ads.${def.sub}) en esa marca.`,
  }
}

/** Cuántas copias se pueden pedir de una. El tope es nuestro: más que esto no se revisa a ojo. */
export const TOPE_COPIAS = 10

/**
 * Cuántos intentos antes de rendirse. Al tercero el paso queda `fallado` y el plan `atascado`, que
 * es un estado **visible con un botón**, no un silencio.
 */
export const MAX_INTENTOS = 3

/**
 * Cuánto se le da a Meta para terminar de armar algo antes de volver a sondear.
 *
 * 🔑 **«No la encontré» NO es «no se creó».** Justo después de un corte, Meta puede seguir armando
 * el objeto. Sondear en bucle sin esperar convertiría ese caso en un `atascado` falso.
 */
export const ESPERA_SONDA_MS = 20000

/**
 * El presupuesto de tiempo de un avance.
 *
 * `TIMEOUT_PASO_MS` es 5000 y no los 8000 de `TIMEOUT_MS`: acá se encadenan pasos, así que uno que
 * se cuelga no se puede comer la función entera. Y el bucle **sólo empieza un paso si le entra
 * entero** (`entraOtroPaso`): arrancar uno que va a morir por límite de función es exactamente cómo
 * se fabrica un paso en curso del que no se sabe nada.
 */
export const TIMEOUT_PASO_MS = 5000
export const PRESUPUESTO_MS = 6500

/** ¿Entra otro paso en lo que queda del request? */
export function entraOtroPaso(gastadoMs) {
  return Number(gastadoMs) + TIMEOUT_PASO_MS <= PRESUPUESTO_MS
}

// ── Las marcas ────────────────────────────────────────────────────────────────────────────────

/** El separador de la marca. Se busca por él en Ads Manager, así que es parte del contrato. */
const PREFIJO_MARCA = ' · #'

/**
 * El marcador de un plan, DERIVADO del `idem`.
 *
 * Sale del `idem` y no de un random para que sea **reproducible**: si el insert del plan se cortó y
 * la pantalla reintenta con el mismo `idem`, el marcador que se calcula es el mismo, así que la
 * sonda del reintento busca lo que buscaba el original. Un random haría que el segundo plan no
 * pudiera encontrar lo que creó el primero, que es justo el caso para el que existe.
 */
export function marcadorDe(idem) {
  const s = String(idem || '')
  // FNV-1a de 32 bits: alcanza y sobra para separar los planes de una cuenta, y es diez líneas.
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${PREFIJO_MARCA}${h.toString(36).padStart(7, '0').slice(-7)}`
}

/**
 * La marca de UN paso dentro del plan.
 *
 * Hace falta además del marcador porque un plan de 3 copias crea 3 objetos hermanos: buscando sólo
 * por el marcador aparecerían los tres y la sonda no sabría cuál es el del paso 2. Con el orden
 * pegado, la búsqueda es exacta — y buscar por el marcador a secas sigue trayendo todo el lote, que
 * es lo que se quiere mirar en Ads Manager.
 */
export function marcaDePaso(marcador, orden) {
  return `${marcador}-${orden}`
}

/**
 * El nombre con el que nace un objeto del plan, recortado para que la marca **nunca** se pierda.
 *
 * El recorte va del lado del nombre base y no de la marca: un nombre cortado sigue siendo legible,
 * una marca cortada deja el objeto imposible de encontrar, que es lo único que no se puede perder.
 */
export function nombreConMarca(base, marca) {
  const m = String(marca || '')
  const b = String(base || '').trim().replace(/[\r\n\t]/g, ' ')
  const cabe = LARGO_NOMBRE - m.length
  return `${b.slice(0, Math.max(0, cabe))}${m}`
}

// ── La política: qué hacer con un paso ────────────────────────────────────────────────────────

/**
 * **La función que sostiene todo el motor.** Dado un paso y la hora, qué corresponde hacer:
 *
 * - `ejecutar` — mandarlo a Meta.
 * - `sondear`  — ir a mirar si Meta lo aplicó, SIN escribir.
 * - `esperar`  — todavía no: Meta puede estar armándolo.
 * - `rendirse` — se agotaron los intentos; el paso queda `fallado` y el plan `atascado`.
 *
 * 🔴 **La aserción que vale por todo el test: nunca devuelve `ejecutar` para un paso NO reintentable
 * que quedó en curso y no fue sondeado.** Ahí está la diferencia entre adoptar la copia que Meta ya
 * creó y crear una segunda sin que nadie lo pida.
 */
export function politicaReintento(paso, ahora) {
  const p = paso || {}
  const def = TIPOS_PASO[p.tipo] || {}
  const estado = String(p.estado || 'pendiente')
  const intentos = Number(p.intentos) || 0
  const t = ahora instanceof Date ? ahora.getTime() : Number(ahora) || 0

  if (estado === 'hecho' || estado === 'salteado') return 'listo'
  if (estado === 'fallado') return 'rendirse'
  if (intentos >= MAX_INTENTOS) return 'rendirse'

  // Nunca se intentó: no hay nada que sondear.
  if (estado === 'pendiente') return 'ejecutar'

  // Quedó en curso: se anotó el intento y no se supo el resultado.
  if (estado === 'en-curso') {
    // Un valor absoluto se repite sin consecuencia, y repetirlo es más barato que ir a mirarlo.
    if (def.reintentable) return 'ejecutar'
    // ⛔ Crea algo: **jamás** se repite. Se va a mirar.
    return 'sondear'
  }

  // `dudoso` = se sondeó y no apareció. No es «no se creó»: puede estar armándose.
  if (estado === 'dudoso') {
    // ⚠️ `ultimoEn`, en camello: el motor trabaja con la forma de la PANTALLA, y el handler traduce
    // las filas de la base una sola vez al leerlas (`filaAPaso`). Con las dos formas dando vueltas,
    // un `ultimo_en` que llega como `undefined` hace que esta rama caiga siempre en `sondear` — o
    // sea que la espera se pierde en silencio y «no la encontré» vuelve a leerse como «no se creó».
    const desde = p.ultimoEn ? new Date(p.ultimoEn).getTime() : 0
    if (desde && t - desde < ESPERA_SONDA_MS) return 'esperar'
    return 'sondear'
  }

  return 'ejecutar'
}

/** El primer paso que todavía tiene algo que hacer. `null` si el plan terminó. */
export function siguientePaso(pasos) {
  const orden = [...(pasos || [])].sort((a, b) => Number(a.orden) - Number(b.orden))
  return orden.find((p) => p.estado !== 'hecho' && p.estado !== 'salteado') || null
}

/**
 * El estado del plan, DERIVADO de sus pasos.
 *
 * Se deriva y no se guarda como fuente porque un estado escrito a mano se despega de los pasos justo
 * cuando algo sale mal, que es cuando se mira. La columna `estado` de la tabla es el espejo de esto.
 */
export function estadoDePlan(pasos, cancelado = false) {
  if (cancelado) return 'cancelado'
  const ps = pasos || []
  if (!ps.length) return 'pendiente'
  if (ps.some((p) => p.estado === 'fallado')) return 'atascado'
  if (ps.every((p) => p.estado === 'hecho' || p.estado === 'salteado')) return 'hecho'
  if (ps.every((p) => p.estado === 'pendiente')) return 'pendiente'
  return 'en-curso'
}

/**
 * Cambia los `{{n}}` del pedido por el `resultado_id` del paso n.
 *
 * Es lo que encadena los pasos: el aviso se crea contra el conjunto que devolvió el paso anterior,
 * y ese id no existe hasta que ese paso corrió. Si falta alguno **no se manda nada**: mandar un
 * `adset_id` literal `{{1}}` sería un 400 de Meta con una fila que dice que se intentó.
 */
export function sustituir(pedido, contexto) {
  const ctx = contexto || {}
  const faltan = []
  const out = {}
  for (const [k, v] of Object.entries(pedido || {})) {
    if (typeof v !== 'string') { out[k] = v; continue }
    out[k] = v.replace(/\{\{(\w+)\}\}/g, (_, ref) => {
      const val = ctx[ref]
      if (val === undefined || val === null || val === '') { faltan.push(ref); return '' }
      return String(val)
    })
  }
  return faltan.length ? { ok: false, faltan: [...new Set(faltan)] } : { ok: true, pedido: out }
}

// ── Armar los planes ──────────────────────────────────────────────────────────────────────────

const err = (status, error) => ({ ok: false, status, error })

/**
 * Los pasos de **duplicar**, a partir del censo YA LEÍDO de Meta.
 *
 * 🔑 **El censo entra como parámetro y no se deduce.** Cuántos conjuntos y avisos tiene el original,
 * y con qué `creative_id`, se mide una vez del lado del handler y se congela en el plan. Deducirlo
 * acá obligaría a esta función a hablar con Meta, que es justo lo que la haría intesteable — y el
 * repo ya paga ese criterio en `?recurso=cuentas`: lo que existe se mide, no se deduce.
 *
 * `entrada`:
 * - `nivel` `'campania' | 'conjunto'`
 * - `objetoId`, `cuentaId`, `campaignId` (la campaña del original; en nivel campaña es él mismo)
 * - `nombreOriginal`
 * - `copias` 1..`TOPE_COPIAS`
 * - `nombre` opcional: cómo se va a llamar la copia cuando termine
 * - `presupuestoCrudo` opcional: el diario que estrena la copia
 * - `censo`: `{ conjuntos: [{id, nombre, receta, avisos:[{id,nombre,creativeId}]}] }` para una
 *   campaña, `{ avisos: [{id,nombre,creativeId}] }` para un conjunto.
 * - `receta` (nivel conjunto): `{ cuerpo, notas }` de `recetaDeConjunto()`, **ya validada contra
 *   Meta y con el presupuesto resuelto por el handler**. Acá no se le toca un campo: si el diario
 *   se decidiera en dos lugares, el cuerpo que se validó no sería el que se manda.
 */
export function armarPlanDuplicar(entrada, marcador) {
  const e = entrada || {}
  const nivel = String(e.nivel || '')
  if (nivel !== 'campania' && nivel !== 'conjunto') {
    return err(400, 'Sólo se duplica una campaña o un conjunto.')
  }
  const copias = Number(e.copias) || 1
  if (!Number.isInteger(copias) || copias < 1 || copias > TOPE_COPIAS) {
    return err(400, `Se pueden pedir entre 1 y ${TOPE_COPIAS} copias.`)
  }
  const censo = e.censo || {}
  const pasos = []
  const nombreBase = String(e.nombre || e.nombreOriginal || 'copia')

  const push = (tipo, rotulo, pedido, opts = {}) => {
    const orden = pasos.length + 1
    const marca = TIPOS_PASO[tipo].crea ? marcaDePaso(marcador, orden) : null
    pasos.push({ orden, tipo, rotulo, pedido: { ...pedido, ...(marca ? { marca } : {}) }, marca, ...opts })
    return orden
  }

  for (let i = 1; i <= copias; i++) {
    // El sufijo del número sólo aparece cuando hay más de una: «Ventas — copia» se lee mejor que
    // «Ventas — copia 1 de 1».
    const cual = copias > 1 ? ` ${i}/${copias}` : ''

    if (nivel === 'conjunto') {
      if (!e.receta || !e.receta.cuerpo) {
        return err(500, 'Falta la receta del conjunto: no se puede crear uno sin su configuración.')
      }
      const nCopia = push('crear-conjunto', `Crear el conjunto${cual}`, {
        cuentaId: String(e.cuentaId),
        campaignId: String(e.campaignId || ''),
        nombreBase: String(e.nombreOriginal || 'conjunto'),
        cuerpo: e.receta.cuerpo,
      })
      for (const a of censo.avisos || []) {
        push('crear-aviso', `Crear el aviso «${a.nombre}»${cual}`, {
          cuentaId: String(e.cuentaId),
          adsetId: `{{${nCopia}}}`,
          creativeId: String(a.creativeId || ''),
          nombreBase: String(a.nombre || 'aviso'),
        })
      }
      if (e.nombre) {
        push('nombre', `Ponerle el nombre definitivo${cual}`, {
          objetoId: `{{${nCopia}}}`,
          name: copias > 1 ? `${nombreBase} ${i}` : nombreBase,
        })
      }
      continue
    }

    // Campaña: copia shallow, la marca ENSEGUIDA, y después cada conjunto y cada aviso.
    const nCamp = push('copiar-campania', `Copiar la campaña${cual}`, {
      objetoId: String(e.objetoId),
      cuentaId: String(e.cuentaId),
    })
    // 🔴 Va acá y no al final: si el plan se corta después de este paso, la campaña nueva ya es
    // accionable desde el monitor. Al final, un corte dejaría un objeto que nadie puede tocar.
    push('heredar-linea', 'Asignarle la marca a la copia', { campaignId: `{{${nCamp}}}` })

    for (const c of censo.conjuntos || []) {
      if (!c.receta || !c.receta.cuerpo) {
        return err(500, `Falta la receta del conjunto «${c.nombre}»: no se puede crear uno sin su configuración.`)
      }
      const nConj = push('crear-conjunto', `Crear el conjunto «${c.nombre}»${cual}`, {
        cuentaId: String(e.cuentaId),
        campaignId: `{{${nCamp}}}`,
        nombreBase: String(c.nombre || 'conjunto'),
        cuerpo: c.receta.cuerpo,
      })
      for (const a of c.avisos || []) {
        push('crear-aviso', `Crear el aviso «${a.nombre}»${cual}`, {
          cuentaId: String(e.cuentaId),
          adsetId: `{{${nConj}}}`,
          creativeId: String(a.creativeId || ''),
          nombreBase: String(a.nombre || 'aviso'),
        })
      }
    }
    if (e.nombre) {
      push('nombre', `Ponerle el nombre definitivo${cual}`, {
        objetoId: `{{${nCamp}}}`,
        name: copias > 1 ? `${nombreBase} ${i}` : nombreBase,
      })
    }
  }

  if (!pasos.length) return err(400, 'No hay nada que copiar.')
  return { ok: true, pasos, variante: 'shallow-n' }
}

/**
 * Los pasos de **crear una campaña nueva** a partir de una receta.
 *
 * # 🔑 La decisión que lo hace viable: nada se edita, todo se copia de algo que ya entrega
 *
 * El `targeting spec` es la superficie más grande y más rechazable de la API, y la matriz de
 * *objetivo × optimización × cobro* es la fuente número uno de rechazos. Copiar las dos cosas de un
 * conjunto **que está entregando hoy, en esta cuenta, con este token** garantiza que son válidas sin
 * tener que modelar ninguna de las dos. Lo único que se elige es **nombre, presupuesto y qué
 * creativo**.
 *
 * Por eso el **objetivo tampoco se elige**: sale de la campaña del conjunto de referencia. Una lista
 * de objetivos en la pantalla sería pedirle a una persona que adivine qué `optimization_goal` es
 * legal debajo de cada uno.
 *
 * `entrada`:
 * - `cuentaId`, `nombre`, `linea`
 * - `campania`: `{ cuerpo }` de `recetaDeCampania()`
 * - `receta`: `{ cuerpo, notas }` del conjunto de referencia, **ya validada** por el handler
 * - `creativos`: `[{ creativeId, nombre }]` — los avisos que va a tener, uno por paso
 */
export function armarPlanCrear(entrada, marcador) {
  const e = entrada || {}
  const nombre = String(e.nombre || '').trim()
  if (!nombre) return err(400, 'Falta el nombre de la campaña.')
  if (nombre.length > LARGO_NOMBRE) return err(400, `El nombre no puede pasar de ${LARGO_NOMBRE} caracteres.`)
  if (!e.campania || !e.campania.cuerpo) return err(500, 'Falta la configuración de la campaña.')
  if (!e.receta || !e.receta.cuerpo) return err(500, 'Falta la receta del conjunto de referencia.')

  const creativos = (e.creativos || []).filter((c) => c && c.creativeId)
  // ⛔ Una campaña sin avisos no entrega nada y no se puede completar después desde acá: es un
  // objeto muerto con un nombre. Se frena antes de crear el primero.
  if (!creativos.length) return err(400, 'Hace falta al menos un creativo: una campaña sin avisos no entrega.')

  const pasos = []
  const push = (tipo, rotulo, pedido) => {
    const orden = pasos.length + 1
    const marca = TIPOS_PASO[tipo].crea ? marcaDePaso(marcador, orden) : null
    pasos.push({ orden, tipo, rotulo, pedido: { ...pedido, ...(marca ? { marca } : {}) }, marca })
    return orden
  }

  const nCamp = push('crear-campania', `Crear la campaña «${nombre}»`, {
    cuentaId: String(e.cuentaId),
    nombreBase: nombre,
    cuerpo: e.campania.cuerpo,
  })
  // 🔴 La marca va ENSEGUIDA, igual que al duplicar: si el plan se corta acá, la campaña nueva ya es
  // accionable desde el monitor. Al final, un corte dejaría un objeto que nadie puede tocar.
  push('heredar-linea', 'Asignarle la marca a la campaña', { campaignId: `{{${nCamp}}}` })

  const nConj = push('crear-conjunto', 'Crear el conjunto con la segmentación de la referencia', {
    cuentaId: String(e.cuentaId),
    campaignId: `{{${nCamp}}}`,
    nombreBase: nombre,
    cuerpo: e.receta.cuerpo,
  })

  for (const c of creativos) {
    push('crear-aviso', `Crear el aviso «${c.nombre || 'aviso'}»`, {
      cuentaId: String(e.cuentaId),
      adsetId: `{{${nConj}}}`,
      creativeId: String(c.creativeId),
      nombreBase: String(c.nombre || nombre),
    })
  }

  return { ok: true, pasos, variante: 'receta' }
}

/**
 * Los pasos de **mover plata** entre dos conjuntos.
 *
 * ⚠️ **La baja SIEMPRE antes que la suba, y es una invariante del generador, no un comentario.** Así,
 * un corte a la mitad deja la cuenta gastando **de menos**, nunca de más: la dirección del fallo es
 * la barata. Al revés, un corte entre la suba y la baja gasta de más, y eso es plata real todos los
 * días hasta que alguien lo mire.
 *
 * Los montos van en la unidad MENOR de la moneda (ver `factorMoneda`), y **el «de» se lee de Meta**,
 * no se pide: el valor guardado puede estar viejo si alguien lo cambió en Ads Manager.
 *
 * ⚠️ **No lleva marcador, y no es una asimetría descuidada**: mover plata no crea ningún objeto, así
 * que no hay nombre en el que anotar una marca ni nada que sondear por ella. Lo que se relee para
 * saber si quedó puesto es el `daily_budget` del propio conjunto (`quedoPuesto`).
 */
export function armarPlanMoverPlata(entrada) {
  const e = entrada || {}
  const monto = Math.round(Number(e.montoCrudo))
  if (!Number.isFinite(monto) || monto <= 0) return err(400, 'El monto a mover tiene que ser mayor que cero.')

  const deId = String(e.deId || '')
  const aId = String(e.aId || '')
  if (!/^\d+$/.test(deId) || !/^\d+$/.test(aId)) return err(400, 'Faltan los conjuntos de origen y destino.')
  if (deId === aId) return err(400, 'El conjunto de origen y el de destino son el mismo.')

  const deActual = Math.round(Number(e.deActualCrudo) || 0)
  const aActual = Math.round(Number(e.aActualCrudo) || 0)
  if (deActual <= 0) return err(409, 'El conjunto de origen no tiene un presupuesto diario propio del que sacar.')
  if (aActual <= 0) return err(409, 'El conjunto de destino no tiene un presupuesto diario propio al que sumarle.')

  const reparto = repartir(deActual, aActual, monto, e.minDiarioCrudo)
  if (!reparto.ok) return reparto

  const pasos = [
    // 1º LA BAJA. Ver el comentario de arriba: el orden es la garantía, no el estilo.
    {
      orden: 1,
      tipo: 'presupuesto',
      rotulo: `Bajarle el diario a «${e.deNombre || 'el origen'}»`,
      pedido: { objetoId: deId, daily_budget: String(reparto.deNuevo) },
      marca: null,
    },
    {
      orden: 2,
      tipo: 'presupuesto',
      rotulo: `Subirle el diario a «${e.aNombre || 'el destino'}»`,
      pedido: { objetoId: aId, daily_budget: String(reparto.aNuevo) },
      marca: null,
    },
  ]
  return { ok: true, pasos, variante: 'baja-y-suba', reparto }
}

/**
 * Cuánto queda en cada lado. **Conserva la suma** y respeta el mínimo diario de la cuenta.
 *
 * El mínimo se chequea del lado del que PIERDE: dejar un conjunto por debajo del mínimo de la cuenta
 * no es un error que Meta avise al escribir, es un conjunto que deja de entregar.
 */
export function repartir(deActual, aActual, monto, minDiarioCrudo) {
  const deNuevo = deActual - monto
  const aNuevo = aActual + monto
  if (deNuevo <= 0) {
    return err(409, 'No se puede mover más de lo que tiene el conjunto de origen. Para dejarlo en cero, pausalo.')
  }
  const min = Number(minDiarioCrudo) || 0
  if (min && deNuevo < min) {
    return err(409, `Sacarle eso dejaría al origen por debajo del mínimo diario que acepta la cuenta (${min} en la unidad menor de la moneda).`)
  }
  if (deNuevo + aNuevo !== deActual + aActual) {
    // No puede pasar con enteros; está para que si alguien mete un redondeo en el medio, se entere acá.
    return err(500, 'El reparto no conserva la suma.')
  }
  return { ok: true, deNuevo, aNuevo }
}

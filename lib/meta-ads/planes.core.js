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
import { escalera, HORAS_ESCALON_DEFECTO, HORAS_ESCALON_MINIMO, TOPE_ESCALONES } from './escalado.core.js'
import { MOTIVOS_PODA, TOPE_PODA } from './podado.core.js'
import { TOPE_PIEZAS } from './pieza.core.js'

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
    // 🔴 El motor ya no lo genera, y por eso mandarlo de nuevo es mandar el MISMO `/copies` que ya
    // falló: no hay dónde meterle la corrección. Ver `esPasoRetirado()`.
    retirado: true,
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
  /**
   * Subir un video NUEVO a la videoteca de la cuenta, desde la URL pública del Blob.
   *
   * 🔑 **Meta lo baja él, no se lo mandamos**: `POST act_<id>/advideos?file_url=…`. Por eso un video
   * de 200 MB no toca ni el tope de 4,5 MB del body de Vercel ni los 10 s de la función — lo único
   * que viaja en el request es la URL.
   *
   * ⚠️ **Sondea en la videoteca y por `title`, no por `name`.** Un `AdVideo` no tiene `name`: la
   * marca se escribe en el título. Es la única sonda del motor que mira otro campo, y por eso el
   * `sondaEn` es propio en vez de reusar `cuenta`.
   */
  'subir-pieza': {
    rotulo: 'subir el video a Meta',
    reintentable: false,
    crea: true,
    sondaEn: 'videos',
  },
  /**
   * Esperar a que Meta termine de procesar el video.
   *
   * 🔑 **No es prolijidad: es de dónde sale la miniatura.** Un `video_data` sin `image_url` es un
   * rechazo, y las miniaturas las genera Meta recién al terminar de procesar. Sin este paso, el
   * creativo se arma contra un video a medio hacer y falla — o peor, sale con una miniatura negra.
   *
   * ⚠️ **Es el único paso con `demora`**, y por eso tiene su propio techo de intentos: un «todavía
   * no» de Meta no es un error, es la respuesta correcta. Contarlo con los 3 de `MAX_INTENTOS`
   * dejaría el plan atascado a los quince segundos de subir un video que iba bien.
   */
  'esperar-pieza': {
    rotulo: 'esperar a que Meta procese el video',
    // Preguntar dos veces «¿ya está?» no crea nada ni cambia nada: es la definición de reintentable.
    reintentable: true,
    crea: false,
    demora: true,
  },
  /**
   * El creativo nuevo: la pieza recién subida con el copy del aviso modelo.
   *
   * Es lo único que separaba al motor de poder probar una pieza nueva. Hasta acá siempre partía de
   * un `creative_id` que ya existía, así que el copy y la pieza venían pegados de fábrica.
   */
  'crear-creativo': {
    rotulo: 'armar el creativo con la pieza',
    reintentable: false,
    crea: true,
    sondaEn: 'creativos',
  },
  presupuesto: {
    rotulo: 'poner el presupuesto',
    // Un valor absoluto: el segundo intento deja lo mismo que el primero.
    reintentable: true,
    crea: false,
  },
  /**
   * Un escalón: **subirle el diario, pero sólo si el guardarraíl deja**.
   *
   * 🔑 **Es un tipo aparte y no un `presupuesto` con una bandera**, porque no hace lo mismo: un paso
   * `presupuesto` pone el número que dice el plan; un `escalon` releé el diario de Meta, lee la foto
   * diaria, llama a `decidirEscalon()` y **recién ahí** calcula cuánto poner. Los dos escriben el
   * mismo campo y ahí se termina el parecido — y `TIPOS_PASO` es justamente la tabla donde se lee de
   * un vistazo todo lo que el motor sabe hacer.
   *
   * `reintentable` porque termina poniendo un valor absoluto: repetirlo deja lo mismo. Y el
   * guardarraíl se vuelve a preguntar en cada intento, que es lo correcto — si entre el primer
   * intento y el segundo el ROAS se cayó, el escalón ya no corresponde.
   *
   * ⚠️ **Puede terminar `salteado`, y es el único que puede.** Salteado no es fallado: el plan sigue
   * vivo, el motivo queda escrito, y el escalón siguiente se pregunta lo suyo por su cuenta.
   */
  escalon: {
    rotulo: 'subir un escalón de presupuesto',
    reintentable: true,
    crea: false,
    // Lo que lo distingue del resto: antes de escribir, pregunta.
    guardarrail: true,
  },
  /**
   * Una poda: **apagarlo, pero sólo si el guardarraíl deja**.
   *
   * Es a `estado` lo que `escalon` es a `presupuesto`: los dos escriben el mismo campo y ahí se
   * termina el parecido. Un paso `estado` pone el status que dice el plan; una `poda` relee el estado
   * de Meta, relee la foto, llama a `decidirPoda()` y **recién ahí** apaga —o no—.
   *
   * `reintentable` porque `PAUSED` es un valor absoluto: repetirlo deja lo mismo. Y el guardarraíl se
   * vuelve a preguntar en cada intento, que es lo correcto: si entre un intento y el otro Meta le
   * atribuyó una compra, ya no corresponde apagarlo.
   *
   * ⚠️ **Puede terminar `salteado`**, igual que el escalón y por los mismos motivos: que un renglón
   * diga «éste no se apagó porque vendió el martes» es la mitad del valor de la pieza.
   */
  poda: {
    rotulo: 'apagar lo que no anda',
    reintentable: true,
    crea: false,
    guardarrail: true,
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
  piezas: {
    /**
     * 🔑 **El mismo sub que crear y duplicar**, por la regla de siempre: un plan exige el sub de la
     * acción que ejecuta, ni más ni menos. Una tanda de piezas crea conjuntos y avisos en Meta —
     * exactamente lo mismo que crear una campaña— y lo hace con la segmentación y el copy de algo
     * que ya está aprobado. Un sub propio serían dos tildes más por persona y por marca para
     * habilitar algo del mismo peso que ya se puede hacer.
     */
    sub: 'crear',
    rotulo: 'probar piezas nuevas',
    rotuloPermiso: 'Puede duplicar y crear campañas',
  },
  'mover-plata': {
    // 🔑 Mover plata NO es un sub nuevo: es `presupuesto`, que es exactamente lo que hace. Un sub
    // propio sería un permiso más que dar y uno más que alguien se olvida.
    sub: 'presupuesto',
    rotulo: 'mover presupuesto entre conjuntos',
    rotuloPermiso: 'Puede cambiar el presupuesto',
  },
  escalar: {
    /**
     * 🔑 **`presupuesto`, y nada más.** Una escalada no crea un solo objeto en Meta: son pasos de
     * presupuesto sobre algo que ya existe, exactamente como mover plata. Pedir además `crear` —que
     * es lo que decía el plan de la tanda 5— dejaría afuera a quien hoy maneja presupuestos y no
     * crea campañas, para protegerlo de algo que ya puede hacer a mano desde Campañas de a un
     * número por vez. La regla del módulo se sostiene: **un plan exige el sub de la acción que
     * ejecuta**, ni más ni menos.
     *
     * Lo que sí es más estricto que una acción suelta es el guardarraíl, y ése no se tilda: se mide.
     */
    sub: 'presupuesto',
    rotulo: 'escalar el presupuesto por escalones',
    rotuloPermiso: 'Puede cambiar el presupuesto',
  },
  podar: {
    /**
     * 🔑 **`pausar`, y nada más**, por la misma regla que escalar pide `presupuesto`: un plan exige
     * el sub de la acción que ejecuta. Una poda no crea ni mueve un peso — apaga, que es lo que
     * cualquiera con `pausar` ya puede hacer desde Campañas de a un renglón por vez. Lo único que
     * agrega es hacerlo de una y con el motivo escrito al lado de cada uno.
     *
     * ⚖️ Y es la acción **más barata de deshacer** de todo el módulo: un objeto pausado se vuelve a
     * prender con el botón que ya está en su fila. Por eso la poda puede ofrecer una lista de veinte
     * donde duplicar pide confirmar de a uno.
     */
    sub: 'pausar',
    rotulo: 'apagar lo que no anda',
    rotuloPermiso: 'Puede pausar y activar anuncios',
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
 * Cuántos intentos antes de rendirse **en un paso que espera algo de Meta** (`demora`).
 *
 * 🔑 **Un «todavía no» no es un error, y contarlo como uno es el defecto que este número evita.**
 * Meta tarda de segundos a minutos en procesar un video según el peso; con los 3 de `MAX_INTENTOS`
 * el plan quedaría `atascado` mientras el video se está subiendo bien. Veinte, con la espera de
 * `ESPERA_PIEZA_MS` entre medio, cubre de sobra lo que se vio en la práctica.
 *
 * ⛔ **No es infinito a propósito.** Un video que no termina nunca es un problema, y el motor tiene
 * que terminar contándolo delante de alguien en vez de preguntar para siempre.
 */
export const MAX_INTENTOS_DEMORA = 20

/**
 * Cuánto se espera entre dos «¿ya está?» sobre el mismo video.
 *
 * Más largo que `ESPERA_SONDA_MS` porque no está preguntando si algo existe —eso Meta lo contesta
 * enseguida— sino si terminó un trabajo que lleva minutos. Preguntar cada 20 s sería gastar el
 * techo de intentos en el primer minuto y medio.
 */
export const ESPERA_PIEZA_MS = 45000

/** El techo de intentos de ESTE paso: los pasos que esperan a Meta tienen el suyo. */
export function maxIntentosDe(tipo) {
  return (TIPOS_PASO[tipo] || {}).demora ? MAX_INTENTOS_DEMORA : MAX_INTENTOS
}

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
  // ⚠️ El techo sale del TIPO de paso, no de una constante sola: uno que espera a que Meta termine
  // de procesar un video pregunta muchas más veces que uno que escribe. Ver `MAX_INTENTOS_DEMORA`.
  if (intentos >= maxIntentosDe(p.tipo)) return 'rendirse'

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
 * ¿Este tipo de paso lo sigue generando el motor?
 *
 * 🔴 **Un paso RETIRADO no se puede reintentar aunque Meta lo haya rechazado sin crear nada.**
 * `puedeReintentar` contesta *«Meta dijo que no, arreglalo afuera y mandalo de nuevo»* — y para un
 * tipo retirado eso es falso por otra razón: el reintento manda **el mismo pedido que ya falló**,
 * porque el camino que sabía corregirlo es otro. Medido: los planes 1 y 2 (8-ago-2026) quedaron
 * atascados en un `copiar-conjunto` con «seleccioná también Explorar», el arreglo salió el 9-ago en
 * `receta.core.js` y vive en `crear-conjunto` — o sea que su botón de «Reintentar» prometía algo que
 * no podía cumplir, y lo iba a prometer para siempre.
 */
export function esPasoRetirado(tipo) {
  return !!(TIPOS_PASO[tipo] || {}).retirado
}

/** Un plan atascado deja la portada después de esto. Días. */
export const DIAS_PLAN_VIEJO = 7

/**
 * **Desde cuándo un plan está como está**, en ISO. `null` si no se puede saber.
 *
 * 🔑 Sale del `ultimoEn` del paso que falló y ⛔ **no** de `actualizado` del plan, aunque hoy los dos
 * den lo mismo. `actualizado` lo pisa cualquier `avanzar`, y avanzar un plan atascado **no hace
 * nada**: el paso está `fallado`, la política contesta `rendirse` y la fila sale igual que entró —
 * con la fecha nueva. Ahí el contador se reiniciaría sin que pasara nada, que es
 * exactamente el defecto de medir una espera con la fecha de la última escritura.
 * `actualizado` queda de respaldo para los planes sin paso fallado, y `creado` de último.
 */
export function atascadoDesde(plan) {
  const p = plan || {}
  const fallado = (p.pasos || []).find((x) => x.estado === 'fallado')
  return (fallado && fallado.ultimoEn) || p.actualizado || p.creado || null
}

/** Días enteros entre una fecha ISO y `ahora`. `null` si la fecha no se puede leer. */
export function diasDesde(iso, ahora) {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const n = ahora instanceof Date ? ahora.getTime() : Number(ahora)
  if (!Number.isFinite(n)) return null
  return Math.floor((n - t) / 86400000)
}

/**
 * Parte los planes en **los que la portada tiene que mostrar** y los que ya son historia.
 *
 * 🔴 **Es un filtro de LECTURA y ⛔ no un archivado.** Nada se escribe: un GET que cambia el estado
 * de una fila es una escritura que nadie pidió y que no deja rastro de quién la hizo. El plan sigue
 * existiendo, `?estado=todos` lo sigue trayendo y el bloque dice cuántos quedaron afuera.
 *
 * 🔑 Sólo se retira un **atascado**: un `pendiente` de hace un mes es alguien que armó algo y no lo
 * empezó —sigue siendo una tarea—, y un `en-curso` viejo es una escalada que corre sola.
 */
export function partirPlanes(planes, ahora, dias = DIAS_PLAN_VIEJO) {
  const vivos = []
  const viejos = []
  for (const p of planes || []) {
    const d = p.estado === 'atascado' ? diasDesde(atascadoDesde(p), ahora) : null
    if (d != null && d >= dias) viejos.push(p)
    else vivos.push(p)
  }
  return { vivos, viejos }
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
 * Los pasos de **probar piezas nuevas**: una pieza, un conjunto propio, un aviso.
 *
 * # 🔑 Por qué un conjunto por pieza y no N avisos en uno
 *
 * Es la única forma de leer cuál pieza anduvo. Meta reparte el presupuesto de un conjunto entre sus
 * avisos según lo que va aprendiendo: dos piezas adentro del mismo conjunto no compiten parejo —una
 * se lleva casi todo a los dos días— y la que quedó sin entrega no perdió, no jugó. Con un conjunto
 * cada una, cada pieza tiene su propio presupuesto y el número que sale al final se puede comparar.
 *
 * ⚠️ **Eso también quiere decir que una tanda de 8 piezas son 8 presupuestos diarios.** Nacen todas
 * pausadas, así que la plata no empieza a correr hasta que alguien las prende de a una.
 *
 * # El orden de los pasos, que es donde está la decisión
 *
 * La pieza va PRIMERO y el conjunto último. Al revés —conjunto, después video— un video que Meta
 * rechaza dejaría un conjunto vacío ya creado, que es basura que alguien tiene que ir a borrar a
 * mano. Así, lo que puede fallar falla antes de que exista nada que limpiar. Es el mismo criterio
 * que ordena `armarPlanMoverPlata`: **la dirección del fallo es la barata**.
 *
 * # Una imagen no tiene los dos primeros pasos
 *
 * `link_data.picture` toma una URL pública y Meta se baja la imagen sola: no hay nada que subir ni
 * nada que esperar. Por eso el plan de una tanda mixta tiene pasos distintos por pieza, y por eso
 * el largo del plan no es `piezas × 5`.
 *
 * `entrada`:
 * - `cuentaId`, `campaignId` (la campaña EXISTENTE donde van los conjuntos), `nombre` (la tanda)
 * - `piezas`: `[{ nombre, url, clase }]` ya validadas por `validarPiezas()`
 * - `copy`: el de `copyDeCreativo()`, leído del aviso modelo
 * - `receta`: `{ cuerpo, notas }` del conjunto de referencia, **ya validada contra Meta y con el
 *   presupuesto resuelto por el handler**. Acá no se le toca un campo, igual que en `armarPlanCrear`.
 */
export function armarPlanPiezas(entrada, marcador) {
  const e = entrada || {}
  const nombre = String(e.nombre || '').trim()
  if (!nombre) return err(400, 'Falta el nombre de la tanda.')
  if (nombre.length > LARGO_NOMBRE) return err(400, `El nombre no puede pasar de ${LARGO_NOMBRE} caracteres.`)
  if (!/^\d+$/.test(String(e.campaignId || ''))) return err(400, 'Falta la campaña donde van los conjuntos nuevos.')
  if (!e.receta || !e.receta.cuerpo) return err(500, 'Falta la receta del conjunto de referencia.')
  if (!e.copy || !e.copy.pageId) return err(500, 'Falta el texto del aviso modelo.')

  const piezas = (e.piezas || []).filter((p) => p && p.url && p.clase)
  if (!piezas.length) return err(400, 'No hay ninguna pieza.')
  if (piezas.length > TOPE_PIEZAS) return err(409, `Son ${piezas.length} piezas y se cargan hasta ${TOPE_PIEZAS} por tanda.`)

  const pasos = []
  const push = (tipo, rotulo, pedido) => {
    const orden = pasos.length + 1
    const marca = TIPOS_PASO[tipo].crea ? marcaDePaso(marcador, orden) : null
    pasos.push({ orden, tipo, rotulo, pedido: { ...pedido, ...(marca ? { marca } : {}) }, marca })
    return orden
  }

  // El nombre de cada conjunto y de cada aviso sale del archivo: es lo único que distingue una
  // pieza de otra cuando después se miran los números en Ads Manager.
  const base = (p) => `${nombre} · ${sinExtension(p.nombre)}`

  /**
   * 🔑 **Las subidas van TODAS primero, antes de armar nada.** No es prolijidad: `POST /advideos` es
   * un pedido chico que vuelve enseguida —Meta se baja el archivo y lo procesa por su cuenta— así
   * que arrancarlas todas de entrada hace que los ocho videos se procesen **en paralelo del lado de
   * Meta** mientras el plan trabaja la primera pieza. Intercaladas, cada espera arranca recién
   * cuando terminó la pieza anterior y una tanda de ocho se vuelve media hora de reloj con la
   * pestaña abierta.
   */
  const subidaDe = new Map()
  for (const p of piezas) {
    if (p.clase !== 'video') continue
    subidaDe.set(p, push('subir-pieza', `Subir «${p.nombre}» a Meta`, {
      cuentaId: String(e.cuentaId), url: p.url, nombreBase: base(p),
    }))
  }

  for (const p of piezas) {
    let nCreativo

    if (p.clase === 'video') {
      const nSubida = subidaDe.get(p)
      push('esperar-pieza', `Esperar a que Meta procese «${p.nombre}»`, { videoId: `{{${nSubida}}}` })
      nCreativo = push('crear-creativo', `Armar el creativo de «${p.nombre}»`, {
        cuentaId: String(e.cuentaId), clase: 'video', videoId: `{{${nSubida}}}`,
        copy: e.copy, nombreBase: base(p),
      })
    } else {
      nCreativo = push('crear-creativo', `Armar el creativo de «${p.nombre}»`, {
        cuentaId: String(e.cuentaId), clase: 'imagen', url: p.url,
        copy: e.copy, nombreBase: base(p),
      })
    }

    const nConj = push('crear-conjunto', `Crear el conjunto de «${p.nombre}»`, {
      cuentaId: String(e.cuentaId),
      // ⛔ La campaña es una que YA existe, así que va literal y no como `{{n}}`: este plan no crea
      // campañas. Ver la cabecera — la tanda entra en la campaña que eligió quien la armó.
      campaignId: String(e.campaignId),
      nombreBase: base(p),
      cuerpo: e.receta.cuerpo,
    })

    push('crear-aviso', `Crear el aviso de «${p.nombre}»`, {
      cuentaId: String(e.cuentaId),
      adsetId: `{{${nConj}}}`,
      creativeId: `{{${nCreativo}}}`,
      nombreBase: base(p),
    })
  }

  return { ok: true, pasos, variante: 'piezas' }
}

/** El nombre del archivo sin la extensión: en Ads Manager el `.mp4` no aporta nada. */
function sinExtension(nombre) {
  return String(nombre || '').replace(/\.[a-z0-9]+$/i, '').trim() || String(nombre || '')
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
 * Los pasos de una **escalada**: N escalones de presupuesto sobre el mismo conjunto, separados en el
 * tiempo.
 *
 * ⚠️ **Los valores que van en los pasos son una PREVISIÓN, no lo que se va a escribir.** Cada escalón
 * recalcula desde el diario releído de Meta y desde la foto de ese día; `previstoCrudo` viaja sólo
 * para que la confirmación pueda decir adónde llegaría esto si todo sale bien, y para que la pantalla
 * pueda mostrar la diferencia cuando no salga así. Guardar el número como si fuera una promesa es
 * exactamente el error que el guardarraíl existe para no cometer.
 *
 * ⚠️ **No lleva marcador**, por lo mismo que mover plata: no crea ningún objeto, así que no hay
 * nombre donde anotar una marca ni nada que sondear. Lo que se relee es el `daily_budget` del propio
 * conjunto.
 *
 * `entrada`:
 * - `objetoId`, `nivel` (`'conjunto' | 'campania'`), `nombre`
 * - `desdeCrudo`: el diario de hoy, leído de Meta al armar. Sólo para la previsión.
 * - `escalones`: cuántos, 1..`TOPE_ESCALONES`
 * - `horas`: cada cuánto se da el siguiente
 * - `techoCrudo`: el techo de la línea, para cortar la escalera
 */
export function armarPlanEscalar(entrada) {
  const e = entrada || {}
  const nivel = String(e.nivel || 'conjunto')
  if (nivel !== 'conjunto' && nivel !== 'campania') {
    return err(400, 'Sólo se escala un conjunto o una campaña.')
  }
  const objetoId = String(e.objetoId || '')
  if (!/^\d+$/.test(objetoId)) return err(400, 'Falta el objeto a escalar.')

  const desde = Math.round(Number(e.desdeCrudo) || 0)
  if (desde <= 0) {
    return err(409, 'Eso no tiene un presupuesto diario propio del que partir: lo hereda de su campaña.')
  }

  const techo = Math.round(Number(e.techoCrudo) || 0)
  if (techo <= 0) {
    return err(409, 'Falta definir el techo de presupuesto de esta marca. Sin techo, «subí mientras aguante» no tiene freno.')
  }
  if (desde >= techo) {
    return err(409, 'Ya está en el techo de presupuesto de esta marca: no hay ningún escalón que dar.')
  }

  const pedidos = Number(e.escalones) || 0
  if (!Number.isInteger(pedidos) || pedidos < 1 || pedidos > TOPE_ESCALONES) {
    return err(400, `Se pueden pedir entre 1 y ${TOPE_ESCALONES} escalones.`)
  }
  const horas = Math.max(HORAS_ESCALON_MINIMO, Math.floor(Number(e.horas) || HORAS_ESCALON_DEFECTO))

  // 🔑 La escalera se corta sola contra el techo, así que un plan de 6 escalones sobre algo que llega
  // al tope en 2 nace con 2 pasos y no con 6 — de los cuales 4 se saltearían diciendo lo mismo. El
  // plan tiene que verse posible cuando se lo mira, no descubrirse imposible al ejecutarlo.
  const valores = escalera(desde, pedidos, techo)
  if (!valores.length) {
    return err(409, 'Con el techo de esta marca no entra ningún escalón.')
  }

  const nombre = e.nombre || 'el conjunto'
  const pasos = valores.map((previsto, i) => ({
    orden: i + 1,
    tipo: 'escalon',
    rotulo: `Escalón ${i + 1} de ${valores.length} en «${nombre}»`,
    pedido: { objetoId, nivel, previstoCrudo: previsto, escalon: i + 1, de: valores.length },
    marca: null,
  }))

  return {
    ok: true,
    pasos,
    variante: `escalones-${valores.length}`,
    // Lo que la confirmación muestra: de acá a acá, en tantos días.
    previsto: { desdeCrudo: desde, valores, techoCrudo: techo, horas, recortada: valores.length < pedidos },
  }
}

/**
 * Los pasos de una **poda**: un paso por objeto a apagar, todos ahora.
 *
 * ⚠️ **Sin `proximo_en` y sin espera entre pasos, a diferencia de una escalada.** Una escalada se
 * separa en el tiempo porque cada escalón necesita ver el efecto del anterior; una poda no espera
 * nada de sí misma — los cinco avisos que no venden no se enteran unos de otros. Meterle una espera
 * sería ceremonia.
 *
 * ⚠️ **No lleva marcador**, por lo mismo que mover plata y que los escalones: no crea ningún objeto,
 * así que no hay nombre donde anotar una marca ni nada que sondear. Lo que se relee para saber si
 * quedó puesto es el `status` del propio objeto.
 *
 * 🔑 **El motivo viaja en cada paso, no en el plan.** Una poda puede mezclar «gastó y no vendió nada»
 * con «rinde por debajo del objetivo», y el guardarraíl tiene que volver a preguntar **el mismo** que
 * lo puso en la lista: si no, un aviso marcado por una condición podría terminar apagado por otra, y
 * el renglón del registro diría un motivo que no es el que se apretó.
 *
 * `entrada`:
 * - `objetos`: `[{ objetoId, nivel, nombre, motivo }]`, 1..`TOPE_PODA`
 */
export function armarPlanPodar(entrada) {
  const e = entrada || {}
  const objetos = Array.isArray(e.objetos) ? e.objetos : []
  if (!objetos.length) return err(400, 'No hay nada seleccionado para apagar.')
  if (objetos.length > TOPE_PODA) {
    return err(400, `Se pueden apagar hasta ${TOPE_PODA} de una. Más que eso no se revisa a ojo, y una poda que no se revisó es un botón que apaga la pauta.`)
  }

  const vistos = new Set()
  const pasos = []
  for (const o of objetos) {
    const objetoId = String((o && o.objetoId) || '')
    if (!/^\d+$/.test(objetoId)) return err(400, 'Hay un objeto sin id de Meta en la lista.')
    // Repetido no es un error del usuario que valga la pena contarle, pero sí un paso de más que
    // terminaría `salteado` diciendo «ya estaba apagado» por culpa del paso anterior del mismo plan.
    if (vistos.has(objetoId)) continue
    vistos.add(objetoId)

    const nivel = String((o && o.nivel) || 'aviso')
    if (nivel !== 'aviso' && nivel !== 'conjunto' && nivel !== 'campania') {
      return err(400, 'Sólo se apaga un aviso, un conjunto o una campaña.')
    }
    const motivo = String((o && o.motivo) || 'sin-ventas')
    if (!MOTIVOS_PODA[motivo]) return err(400, `No existe el motivo de poda «${motivo}».`)

    pasos.push({
      orden: pasos.length + 1,
      tipo: 'poda',
      rotulo: `Apagar «${(o && o.nombre) || objetoId}»`,
      pedido: { objetoId, nivel, motivo },
      marca: null,
    })
  }

  if (!pasos.length) return err(400, 'No quedó nada para apagar.')
  return { ok: true, pasos, variante: `poda-${pasos.length}` }
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

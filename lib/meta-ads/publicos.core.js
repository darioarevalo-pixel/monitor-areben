/**
 * **FRÍA vs REMARKETING: cuánta de la plata de esta marca le está comprando a gente que YA nos
 * conocía.**
 *
 * # Por qué existe, y por qué ⛔ NO es el Embudo
 *
 * Lo pidió Bruno el 30-ago-2026, y nació de una objeción suya al Embudo: *«contesta qué etapa está
 * vacía, y esa pregunta ⛔ no tiene una acción del otro lado»* — llenar TOFU es producir piezas, que
 * pasa en MAKETA y tarda semanas. **Ésta sí decide algo la misma tarde**: dónde van los pesos que se
 * liberan.
 *
 * 🔴 **Y ⛔ no la puede contestar el Embudo, por una razón que su propio núcleo declara**: la etapa
 * ahí sale del `objective` de la campaña, y *«la etapa es una propiedad del PÚBLICO, ⛔ no del
 * objetivo»*. Una `OUTCOME_SALES` apuntada a gente que nunca nos vio es prospecting disfrazado de
 * BOFU. El remarketing de verdad sólo se ve en `targeting{custom_audiences}` **a nivel conjunto**,
 * que es lo que trae este módulo.
 *
 * # 🔴🔑 Los TRES públicos, y por qué son tres y ⛔ no dos
 *
 *  - **`remarketing`** — el conjunto INCLUYE una lista nuestra (`custom_audiences`). Le está
 *    hablando a gente que ya nos vio, nos siguió, entró a la web o compró.
 *  - **`fria`** — el conjunto EXCLUYE nuestras listas (`excluded_custom_audiences`) y ⛔ no incluye
 *    ninguna. Es adquisición **probada**: por construcción no le puede hablar a un conocido.
 *  - **`abierta`** — ⛔ no dice nada de listas. **Y esto ⛔ NO es «fría»**: con público abierto Meta
 *    elige, y le habla a los dos. Contarla como fría sería la respuesta que la pantalla vino a
 *    evitar.
 *
 * ⇒ 🔑 **Si la mayor parte de la plata está en `abierta`, la respuesta honesta a la pregunta es
 * «⛔ no se sabe, y así está armada la cuenta»** — y eso ⛔ no es un módulo que nace mudo: es un
 * hallazgo con una mano concreta al lado (excluir compradores en los conjuntos abiertos, que
 * convierte `abierta` en `fria` y recién ahí la pregunta se puede contestar).
 *
 * # 🔴 La trampa grande: la atribución de Meta le REGALA la compra al remarketing
 *
 * Los `compras` de la foto son la atribución de Meta. El remarketing se lleva la compra que la fría
 * generó —le muestra el aviso al que ya venía decidido— así que **siempre va a salir más barato acá,
 * y eso ⛔ no prueba que sea mejor plata**. Es la misma familia del hallazgo del 26-ago (la
 * elasticidad de Meta, 0,78, contra la medida sobre pedidos reales, 0,54): la atribución mejora
 * justo donde más se la mira.
 *
 * ⇒ **lo que este módulo mide bien es el REPARTO DEL GASTO**, que es un hecho; el costo por compra
 * de cada público va al lado **declarado como de Meta**, ⛔ nunca como la vara. `sesgoDeAtribucion()`
 * arma la advertencia con el número puesto, para que ⛔ no se lea como un ranking.
 *
 * Es `.js` plano porque lo importa `api/_meta-publicos.js`, que corre en Node sin pasar por el
 * compilador de Next.
 */

/** Los tres públicos, en el orden en que se leen. `sin-clasificar` ⛔ NO es uno: es la ausencia. */
export const PUBLICOS = ['remarketing', 'fria', 'abierta']

/** Cómo se llama cada uno **en pantalla**, en criollo y ⛔ no en jerga de compra de medios. */
export const ETIQUETA_PUBLICO = {
  remarketing: 'Gente que ya nos conocía',
  fria: 'Gente nueva, garantizado',
  abierta: 'Público abierto — Meta elige',
  'sin-clasificar': 'Sin clasificar',
}

/** El renglón que explica qué es cada uno, y **qué ⛔ no es**. */
export const AYUDA_PUBLICO = {
  remarketing:
    'El conjunto apunta a una lista nuestra: los que entraron a la web, vieron un video, nos siguen o ya compraron. Le habla a alguien que ya nos vio.',
  fria:
    'El conjunto excluye nuestras listas, así que por construcción ⛔ no le puede hablar a un conocido. Es la única adquisición que está probada.',
  abierta:
    'El conjunto ⛔ no dice nada de listas: elige Meta, y le habla a los dos. ⛔ No es «gente nueva» — es «no sabemos».',
  'sin-clasificar':
    'Gastó en la ventana pero el conjunto ya no está en Meta (pausado y archivado, o borrado), así que ⛔ no se le pudo leer el público.',
}

/**
 * El público de UN conjunto, leído de su `targeting`.
 *
 * 🔴 **Incluir gana sobre excluir, y ⛔ no al revés.** Un conjunto que incluye «visitantes de la web»
 * y excluye «compradores» es remarketing —le habla a conocidos que todavía ⛔ no compraron—, y
 * contarlo como frío por la exclusión sería contar el remarketing más fino de todos como
 * adquisición.
 *
 * ⚠️ Un `targeting` ausente ⛔ no es `abierta` por descarte: es **`null`**, o sea «⛔ no se pudo
 * leer». Meta siempre devuelve `targeting` en un conjunto vivo; que falte significa que la lectura
 * falló, y eso ⛔ no puede caer en un balde con plata adentro.
 */
export function publicoDe(targeting) {
  if (!targeting || typeof targeting !== 'object') return null
  const inc = Array.isArray(targeting.custom_audiences) ? targeting.custom_audiences : []
  const exc = Array.isArray(targeting.excluded_custom_audiences) ? targeting.excluded_custom_audiences : []
  if (inc.length) return 'remarketing'
  if (exc.length) return 'fria'
  return 'abierta'
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const div = (a, b) => (b ? a / b : 0)

/**
 * **El reparto: cuánta plata, cuántas compras y a qué costo, por público.**
 *
 * @param filas    filas de la foto a nivel **conjunto**, ya recortadas a la ventana y a la línea
 * @param publicos `Map` de `objeto_id → 'remarketing' | 'fria' | 'abierta'`, armado desde Graph
 *
 * 🔴 **Una fila sin entrada en el mapa ⛔ NO cae en ninguno de los tres: va a `sin-clasificar`.**
 * Es plata real que gastó un conjunto que Meta ya no lista (pausado y archivado, o borrado). Un
 * balde de descarte que se reparte entre los otros tres infla justo el número que se vino a mirar
 * — y es el mismo error que el reparto por línea del censo vino a matar.
 */
export function repartirPorPublico(filas, publicos) {
  const baldes = new Map()
  const de = (k) => {
    if (!baldes.has(k)) {
      baldes.set(k, {
        publico: k, spend: 0, compras: 0, revenue: 0, clicks: 0, impresiones: 0, conjuntos: new Set(),
      })
    }
    return baldes.get(k)
  }
  for (const k of PUBLICOS) de(k)

  for (const f of Array.isArray(filas) ? filas : []) {
    if (!f || f.nivel !== 'conjunto' || !f.objeto_id) continue
    const id = String(f.objeto_id)
    const b = de(publicos && publicos.get ? (publicos.get(id) || 'sin-clasificar') : 'sin-clasificar')
    b.spend += num(f.spend)
    b.compras += num(f.compras)
    b.revenue += num(f.revenue)
    b.clicks += num(f.clicks)
    b.impresiones += num(f.impresiones)
    b.conjuntos.add(id)
  }

  const total = [...baldes.values()].reduce((s, b) => s + b.spend, 0)
  const partes = [...baldes.values()]
    // 🔑 `sin-clasificar` sólo aparece si TIENE plata: un balde vacío arriba de la tabla es ruido,
    // pero uno con plata escondido es el número que hace dudar de la pantalla entera.
    .filter((b) => PUBLICOS.includes(b.publico) || b.spend > 0)
    .map((b) => ({
      publico: b.publico,
      spend: b.spend,
      compras: b.compras,
      revenue: b.revenue,
      clicks: b.clicks,
      impresiones: b.impresiones,
      conjuntos: b.conjuntos.size,
      parte: div(b.spend, total),
      // ⚠️ De META, ⛔ no de la caja de la tienda. Ver el docblock del archivo: acá la atribución
      // está sesgada A FAVOR del remarketing, así que este número ⛔ no ordena un ranking.
      costoMeta: div(b.spend, b.compras),
      roas: div(b.revenue, b.spend),
    }))
    .sort((a, b) => b.spend - a.spend)

  return { partes, total }
}

/** Cuánto de la plata está en un público. `0` si ⛔ no hay plata: ⛔ nunca `NaN`. */
export function parteDe(partes, publico) {
  const p = (partes || []).find((x) => x.publico === publico)
  return p ? p.parte : 0
}

/**
 * **El veredicto: uno solo, el que tiene una mano del otro lado.**
 *
 * El orden ⛔ no es de gravedad, es de **qué se puede hacer mañana**:
 *
 *  1. **Sin base** — con dos mangos en la ventana el reparto ⛔ no dice nada.
 *  2. **La cuenta ⛔ no se puede partir** — la mayoría de la plata es de público abierto. Es el caso
 *     que se espera encontrar, y su mano es concreta: **excluir compradores** en esos conjuntos.
 *     ⇒ recién ahí la pregunta se puede contestar, y el costo no cambia por hacerlo.
 *  3. **Se le está hablando casi sólo a conocidos** — el remarketing se agota solo: la lista es
 *     finita y sin entrada arriba, en unas semanas ⛔ no queda a quién hablarle.
 *  4. **⛔ No hay remarketing** — la etapa más barata está vacía, con gente que ya nos vio sin que
 *     nadie le diga nada.
 *  5. **Está repartido** — y ahí lo que sigue ⛔ no es este módulo.
 */
export function veredictoDePublicos(partes, { total = 0, marca = 'Esta marca', minGasto = 50000 } = {}) {
  if (!(total >= minGasto)) {
    return {
      clase: 'sin-base',
      titulo: `${marca}: todavía ⛔ no hay gasto suficiente para partir la plata por público.`,
      detalle: 'Con esta plata en la ventana, el reparto es ruido. Cuando la pauta corra unos días, acá va a aparecer a quién le está comprando.',
      mano: null,
    }
  }
  const abierta = parteDe(partes, 'abierta')
  const remk = parteDe(partes, 'remarketing')
  const fria = parteDe(partes, 'fria')
  const pct = (p) => `${Math.round(p * 100)}%`

  if (abierta >= 0.5) {
    return {
      clase: 'no-se-puede-partir',
      titulo: `${marca}: el ${pct(abierta)} de la plata va a público abierto, así que ⛔ no se sabe a quién le está comprando.`,
      detalle:
        'Con público abierto Meta le habla a los dos: al que nunca nos vio y al que ya compró. ⛔ No es «gente nueva» — es que la pregunta ⛔ no se puede contestar con la cuenta armada así.',
      mano: 'Excluir a los compradores en los conjuntos abiertos. Es un cambio de público, ⛔ no de creativo ni de plata: los deja midiendo adquisición de verdad y recién ahí este número quiere decir algo.',
    }
  }
  if (remk >= 0.5) {
    return {
      clase: 'solo-conocidos',
      titulo: `${marca}: el ${pct(remk)} de la plata le habla a gente que ya nos conocía.`,
      detalle:
        'El remarketing se agota solo: la lista es finita y se rehace únicamente con gente nueva entrando arriba. Sin esa entrada, en unas semanas el costo sube sin que haya cambiado nada.',
      mano: 'Mover plata a un conjunto que excluya nuestras listas, y mirarlo contra el techo por compra.',
    }
  }
  if (remk === 0) {
    return {
      clase: 'sin-remarketing',
      titulo: `${marca}: ⛔ no hay un peso hablándole a gente que ya nos conocía.`,
      detalle:
        'Es la plata más barata que hay —ya nos vieron— y hoy nadie les está diciendo nada: el que agregó al carrito y no volvió ⛔ no recibe ni un aviso.',
      mano: 'Armar un conjunto con una lista nuestra (visitantes de la web o carritos de los últimos 30 días) y una pieza que resuelva la duda, ⛔ no que presente la marca.',
    }
  }
  return {
    clase: 'repartido',
    titulo: `${marca}: ${pct(fria)} a gente nueva garantizada y ${pct(remk)} a conocidos.`,
    detalle: 'La plata está repartida entre los dos públicos y los dos se pueden medir. Lo que sigue ⛔ no es esta pantalla: es el costo por compra de cada uno contra el techo.',
    mano: null,
  }
}

/**
 * **La advertencia sobre el costo por compra, con el número puesto.**
 *
 * 🔴 Se devuelve como dato y ⛔ no se escribe a mano en la pantalla porque **⛔ no siempre
 * corresponde**: sin remarketing con plata, no hay sesgo del que avisar y el cartel sería ruido que
 * enseña a ignorar los carteles.
 *
 * ⚠️ Lo que dice, cuando corresponde, es que el remarketing sale más barato **por construcción**:
 * se le muestra el aviso a alguien que ya venía decidido y Meta le imputa esa compra. ⇒ la
 * comparación de costos entre públicos ⛔ no ordena un ranking, y la plata ⛔ no se mueve por ella.
 */
export function sesgoDeAtribucion(partes) {
  const r = (partes || []).find((x) => x.publico === 'remarketing')
  const otros = (partes || []).filter((x) => x.publico !== 'remarketing' && x.compras > 0)
  const costoOtros = div(
    otros.reduce((s, x) => s + x.spend, 0),
    otros.reduce((s, x) => s + x.compras, 0),
  )
  // 🔴 **UN solo guard, y ⛔ no dos.** Hacen falta las dos cosas —remarketing con compras y algo
  // contra qué compararlo— y las dos caen en que alguno de los dos costos dé 0. Había además un
  // guard temprano (`!r || !r.compras || !otros.length`) que ⛔ no cambiaba ninguna respuesta:
  // mutarlo dejaba los 22 tests verdes **porque era EQUIVALENTE, ⛔ no porque faltara un test** —se
  // verificó caso por caso—. Dos guards para la misma condición son el que alguien afloja creyendo
  // que el otro lo cubre.
  if (!r || !(r.costoMeta > 0) || !(costoOtros > 0)) return null
  return {
    costoRemarketing: r.costoMeta,
    costoResto: costoOtros,
    // Cuántas veces más barato se ve. ⛔ No es una medición de calidad: es el tamaño del sesgo.
    veces: div(costoOtros, r.costoMeta),
  }
}

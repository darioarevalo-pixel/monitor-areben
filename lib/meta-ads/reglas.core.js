/**
 * Las automatizaciones de la pauta: **la lógica pura**, sin Meta y sin base.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `planes.core.js` y `permisos.core.js`: lo importan `api/_meta-reglas.js` y
 * `scripts/evaluar-reglas-meta.mjs`, que corren en Node sin pasar por el compilador de Next y **no
 * pueden importar TypeScript**. `reglas.ts` es el re-export tipado que usa la pantalla.
 *
 * # Qué es esto
 *
 * Seis detectores sobre `meta_ads_snapshot_dia`. Cada uno mira la serie de un objeto y, si algo
 * pasa, devuelve un HALLAZGO: la frase que se lee, los números que la justifican y —cuando existe—
 * la `entrada` lista para que el motor de planes arme la acción.
 *
 * ⛔ **Nada de acá ejecuta.** Ni siquiera puede: no importa `graph.core.js`. Lo único que produce
 * son renglones para el Panel. Escribir en Meta es apretar el botón, y de ahí en adelante manda
 * `planes.core.js`, con sus permisos, su sonda y su registro.
 *
 * 🔑 **Y no habla con la base tampoco**: recibe las filas ya leídas. Por eso el calibrador —correr
 * una regla hacia atrás sobre 90 días con otro umbral— es gratis: es la misma función con otros
 * argumentos, no una segunda implementación que podría discrepar.
 *
 * # Las dos trampas del dato, que están acá y en ningún otro lado
 *
 * 1. 🔴 **`frecuencia` y `alcance` NO se suman entre días.** Son dedup dentro del período que se le
 *    pidió a Meta: sumar siete días cuenta siete veces a quien vio el aviso los siete días, y sale
 *    un número inflado y creíble. `sumarDias()` los devuelve en `null` justamente para que nadie los
 *    sume sin darse cuenta, y acá la fatiga lee **la fila de un día**. Ver `frecuenciaPico()`.
 * 2. **`spend` viene en PESOS y `diario_crudo` en unidad menor.** Por eso `gasto_minimo` es numeric
 *    en pesos y `techo_diario_crudo` es bigint: cada umbral vive en la unidad de aquello contra lo
 *    que se compara, para que no haya un `/100` en el medio de una comparación.
 */

import { lineasQuePuede } from './acciones.core.js'
import { decimal, entero, plata, roas as roasTxt } from './formato.core.js'
// `NIVEL_TOTALES` y `soloNivel` nacieron acá y se mudaron a la foto: son un hecho de la TABLA (la
// misma plata está en los cuatro niveles), no de las automatizaciones, y «vs período anterior» los
// necesita igual. Se re-exportan más abajo porque `reglas.ts` y los tests ya los importan de acá.
import { NIVEL_TOTALES, soloNivel } from './snapshot.core.js'

/** Cuántos días mira una regla hacia atrás por defecto. Cada preset puede pedir otra ventana. */
export const VENTANA_DIAS = 7

/**
 * Los umbrales que existen, y **cuáles se pueden deducir de los datos y cuáles no**.
 *
 * 🔑 Esta distinción es la que hace usable el módulo sin que Bruno defina nada de antemano, y no es
 * una comodidad: es la diferencia entre un HECHO y una DECISIÓN.
 *
 * - `derivable: true` — el número sale de medir los 90 días que ya están. El CPA de una línea es lo
 *   que efectivamente cuesta traer un cliente ahí; no hay nada que opinar.
 * - `derivable: false` — el número es una decisión de negocio y **no se autocompleta nunca**. El
 *   ROAS mediano es lo que se OBTIENE, no lo que se QUIERE: usarlo como objetivo dejaría a la mitad
 *   de la pauta permanentemente «por debajo del objetivo», que es ruido con cara de dato. Se
 *   SUGIERE con su contexto medido, y la regla queda apagada hasta que alguien confirme.
 */
export const UMBRALES = {
  roas_objetivo: {
    rotulo: 'ROAS objetivo',
    unidad: 'x',
    derivable: false,
    ayuda: 'Debajo de esto, algo no está rindiendo. Es una decisión de negocio: el ROAS que venís sacando es el que TENÉS, no el que querés.',
  },
  cpa_maximo: {
    rotulo: 'CPA máximo',
    unidad: '$',
    derivable: false,
    ayuda: 'Lo más que estás dispuesto a pagar por una compra.',
  },
  gasto_minimo: {
    rotulo: 'Gasto mínimo para juzgar',
    unidad: '$',
    derivable: true,
    ayuda: 'Cuánto tiene que haber gastado algo antes de que su resultado signifique algo. Se deduce del CPA medido de la línea: gastar lo que sale un cliente y no traer ninguno ya es una señal.',
  },
  frecuencia_maxima: {
    rotulo: 'Frecuencia máxima por día',
    unidad: 'x',
    derivable: false,
    ayuda: 'Cuántas veces por día puede verte la misma persona antes de que se queme. Depende del tamaño del público y del creativo: no hay un número universal.',
  },
  techo_diario_crudo: {
    rotulo: 'Techo del presupuesto diario',
    unidad: '$crudo',
    derivable: false,
    ayuda: 'Hasta dónde puede llegar un escalón. Sin esto, «subí mientras el ROAS aguante» no tiene freno.',
  },
  dias_seguidos: {
    rotulo: 'Días seguidos',
    unidad: 'días',
    derivable: true,
    ayuda: 'Cuántos días tiene que cumplirse algo antes de moverse. Separa una tendencia de un día bueno.',
  },
}

/** Cuántos días seguidos se exigen si nadie dijo otra cosa. Tres es el estándar y es explicable. */
export const DIAS_SEGUIDOS_DEFECTO = 3

/**
 * Los seis presets. **Todo lo que las automatizaciones saben detectar está acá y en ningún otro
 * lado**, igual que `ACCIONES` con las acciones sueltas y `TIPOS_PASO` con los pasos del motor.
 *
 * `requiere` es la lista de umbrales sin los cuales el preset **no corre**. Los tres que la tienen
 * vacía se pueden prender el día uno, y no es una casualidad de diseño: son los tres que detectan
 * un HECHO (un conjunto que no puede entregar, una compra que llegó tarde, plata gastada contra
 * cero ventas) en vez de comparar contra una vara elegida.
 *
 * `sub` es el permiso que hace falta para ACCIONAR el hallazgo — el de la acción que ejecutaría, no
 * uno propio. Un hallazgo no suma tildes: pausar pide `pausar`, subir el diario pide `presupuesto`.
 */
export const PRESETS = {
  'sin-avisos': {
    rotulo: 'Se quedó sin avisos',
    resumen: 'Un conjunto que figura activo y no tiene ningún aviso que pueda entregar.',
    porQue: 'Meta lo muestra como ACTIVE y no miente: la pregunta «¿esto está entregando?» simplemente no es la que contesta `status`. Es plata que creés que está trabajando y no está.',
    nivel: 'conjunto',
    ventana: 1,
    requiere: [],
    sub: 'pausar',
    // El único de los seis que no propone una escritura: qué hacer depende de por qué se apagaron
    // los avisos (rechazados, pausados a mano, borrados), y eso hay que mirarlo.
    proponeAccion: false,
  },
  'atribucion-tardia': {
    rotulo: 'Radar de atribución tardía',
    resumen: 'Algo que pausaste hace poco y que desde entonces igual sumó compras.',
    porQue: 'Meta reatribuye conversiones durante ~72 h, así que un aviso puede haberse apagado por «no vende» y aparecer vendiendo dos días después. La foto diaria relee esa ventana justamente por eso.',
    nivel: 'aviso',
    ventana: VENTANA_DIAS,
    requiere: [],
    sub: 'pausar',
    proponeAccion: true,
    /**
     * 🔴 **El único preset que necesita HISTORIAL DE ESTADO, y por eso arranca sin poder correr.**
     *
     * Detecta una transición —estaba al aire, lo apagaste, siguió vendiendo—, y el estado sólo se
     * escribe en la fila **del día en que se sacó la foto**: Meta no expone el histórico de
     * configuración por ninguna vía, así que el backfill de 90 días trajo métricas pero un solo día
     * de estado. La serie se construye hacia adelante, un día por corrida del cron.
     *
     * Sin esta bandera la regla mostraría «0 saltos en 90 días», que se lee como «esto no pasa
     * nunca» cuando la verdad es «todavía no se puede saber». Es el mismo error que un umbral
     * inventado: un número que parece un dato y no lo es.
     */
    requiereHistorialEstado: true,
  },
  'freno-emergencia': {
    rotulo: 'Freno de emergencia',
    resumen: 'Gastó más de lo que sale un cliente y no trajo ninguno.',
    porQue: 'Cero compras no es un umbral, es un hecho. Lo único que hace falta es un piso de gasto para no gritar por un aviso que gastó $300, y ese piso se DEDUCE del CPA medido de la línea.',
    nivel: 'aviso',
    ventana: VENTANA_DIAS,
    requiere: ['gasto_minimo'],
    sub: 'pausar',
    proponeAccion: true,
  },
  'gastos-hormiga': {
    rotulo: 'Gastos hormiga',
    resumen: 'Avisos que solos gastan poco, pero juntos suman y rinden por debajo del objetivo.',
    porQue: 'Ninguno llama la atención por separado y por eso sobreviven meses. El daño es la suma.',
    nivel: 'aviso',
    ventana: VENTANA_DIAS,
    requiere: ['roas_objetivo'],
    sub: 'pausar',
    proponeAccion: true,
  },
  fatiga: {
    rotulo: 'Fatiga de creativo',
    resumen: 'La misma gente lo está viendo demasiadas veces por día y el CTR viene cayendo.',
    porQue: 'Una frecuencia alta sola no dice nada —un público chico la tiene siempre—; lo que la vuelve fatiga es que el CTR baje mientras sube.',
    nivel: 'aviso',
    ventana: VENTANA_DIAS,
    requiere: ['frecuencia_maxima'],
    // Renovar un creativo no es un POST: lo que se propone es anotar la idea en el tablero.
    sub: 'pautar',
    proponeAccion: false,
  },
  'ganador-escalar': {
    rotulo: 'Ganador para escalar',
    resumen: 'Viene por encima del objetivo varios días seguidos y tiene margen de presupuesto.',
    porQue: 'Es el único de los seis que propone SUBIR plata, y por eso es el que más umbrales pide y el que conviene prender último.',
    nivel: 'conjunto',
    ventana: VENTANA_DIAS,
    requiere: ['roas_objetivo', 'techo_diario_crudo'],
    sub: 'presupuesto',
    proponeAccion: true,
  },
}

export const CLAVES_PRESET = Object.keys(PRESETS)

/** Cuánto sube un escalón de presupuesto. 20% es el paso que Meta recomienda para no resetear el aprendizaje. */
export const PASO_ESCALON = 0.2

/**
 * ¿Puede este perfil ACCIONAR este hallazgo?
 *
 * 🔑 Igual que un plan, un hallazgo **no suma un sub-permiso nuevo**: pide el de la acción que
 * ejecutaría. Cero tildes nuevas por persona y por marca para habilitar algo que ya se podía hacer
 * a mano desde Campañas.
 */
export function permiteAccionarHallazgo(perfil, preset, linea) {
  const def = PRESETS[preset]
  if (!def) return { ok: false, status: 400, error: `No existe la automatización «${preset}».` }
  if (lineasQuePuede(perfil, def.sub).includes(linea)) return { ok: true }
  return {
    ok: false,
    status: 403,
    error: `Para accionar «${def.rotulo}» hace falta el permiso meta-ads.${def.sub} en esa marca.`,
  }
}

// ── Los umbrales: derivar, sugerir, resolver ────────────────────────────────────

// El nivel del que salen los totales vive en `snapshot.core.js`, al lado de `sumarDias()`: es un
// hecho de la tabla. Se re-exporta para no romper a quien ya lo importa de acá.
export { NIVEL_TOTALES, soloNivel }

/**
 * Los umbrales que se DEDUCEN de las filas. Son hechos, no opiniones.
 *
 * `gasto_minimo` sale del CPA real de la línea: lo que efectivamente costó traer un cliente. Gastar
 * eso y no traer ninguno es la definición mínima de «esto no está andando», y no hay nada que
 * opinar al respecto — por eso este umbral se autocompleta y `roas_objetivo` no.
 *
 * ⚠️ Si la línea no tuvo **ninguna** compra, el CPA no existe y devuelve `null`. No se inventa un
 * piso: sin una sola venta no hay con qué decir cuánto es mucho, y una regla apagada con el motivo
 * escrito es mejor que una que grita contra un número sacado del aire.
 */
export function derivarUmbrales(filas) {
  let gasto = 0
  let compras = 0
  for (const f of soloNivel(filas, NIVEL_TOTALES)) {
    gasto += Number(f.spend) || 0
    compras += Number(f.compras) || 0
  }
  return {
    gasto_minimo: compras > 0 ? Math.round(gasto / compras) : null,
    dias_seguidos: DIAS_SEGUIDOS_DEFECTO,
  }
}

/**
 * Los números que la pantalla MUESTRA al lado del dial, para que el umbral no se elija a ciegas.
 *
 * No se aplican solos: son contexto. La diferencia con `derivarUmbrales` es toda la de este módulo —
 * aquello son hechos que se usan, esto son referencias que se miran.
 */
export function contextoUmbrales(filas) {
  const conGasto = soloNivel(filas, NIVEL_TOTALES).filter((f) => (Number(f.spend) || 0) > 0)
  let gasto = 0
  let revenue = 0
  let compras = 0
  for (const f of conGasto) {
    gasto += Number(f.spend) || 0
    revenue += Number(f.revenue) || 0
    compras += Number(f.compras) || 0
  }
  return {
    dias: new Set(conGasto.map((f) => f.fecha)).size,
    campanias: new Set(conGasto.map((f) => f.objeto_id)).size,
    gastoTotal: gasto,
    // El ROAS de los totales, que es el único defendible al agregar. Ver `sumarDias()`.
    roasMedio: gasto ? revenue / gasto : 0,
    cpaMedio: compras ? gasto / compras : null,
    // 🔴 La frecuencia se mide sobre los AVISOS, que es el nivel donde la mira la regla de fatiga, y
    // como PICO de un día, nunca sumada. Es el número contra el que tiene sentido elegir un máximo:
    // «hoy tu peor día es 3,4».
    frecuenciaPico: frecuenciaPico(soloNivel(filas, 'aviso')),
  }
}

/**
 * Cuántos días DISTINTOS de la ventana tienen el estado escrito.
 *
 * El estado va sólo en la fila del día en que se sacó la foto (ver `guardar()` en
 * `scripts/snapshot-meta.mjs`): escribirlo en una fila de hace dos meses sería inventar una
 * configuración histórica que Meta no expone. La consecuencia es que la serie de estados **empieza
 * el día que arrancó el cron**, y hay reglas que sin ella no pueden decir nada.
 */
export function diasConEstado(filas, fechas) {
  const dentro = new Set(fechas)
  const dias = new Set()
  for (const f of Array.isArray(filas) ? filas : []) {
    if (f && dentro.has(f.fecha) && (f.estado || f.estado_efectivo)) dias.add(f.fecha)
  }
  return dias.size
}

/** El mayor valor de frecuencia observado en UN día. 🔴 Nunca una suma: ver la cabecera del archivo. */
export function frecuenciaPico(filas) {
  let max = 0
  for (const f of Array.isArray(filas) ? filas : []) {
    const v = Number(f && f.frecuencia) || 0
    if (v > max) max = v
  }
  return max
}

/**
 * Los umbrales que rigen para una regla: lo suyo pisa lo de la línea, y lo de la línea pisa lo
 * derivado. Un `null` explícito NO pisa — pisar con «no definido» sería borrar.
 */
export function umbralesEfectivos(regla, umbralLinea, derivados) {
  const out = {}
  for (const k of Object.keys(UMBRALES)) {
    const cands = [regla && regla.parametros && regla.parametros[k], umbralLinea && umbralLinea[k], derivados && derivados[k]]
    const hit = cands.find((v) => v !== undefined && v !== null && v !== '')
    out[k] = hit === undefined ? null : Number(hit)
  }
  return out
}

/** Qué umbrales le faltan a un preset para poder correr. Vacío = corre. */
export function faltanUmbrales(preset, efectivos) {
  const def = PRESETS[preset]
  if (!def) return []
  return def.requiere.filter((k) => {
    const v = efectivos && efectivos[k]
    return v === null || v === undefined || !Number.isFinite(Number(v))
  })
}

/** La frase de por qué una regla no está corriendo. Es información, no un error. */
export function motivoApagada(preset, faltan) {
  const nombres = faltan.map((k) => (UMBRALES[k] ? UMBRALES[k].rotulo : k))
  if (nombres.length === 1) return `Falta definir «${nombres[0]}» para esta marca.`
  return `Faltan definir ${nombres.map((n) => `«${n}»`).join(' y ')} para esta marca.`
}

// ── Agrupar las filas ───────────────────────────────────────────────────────────

/** Las fechas de la ventana, de más nueva a más vieja, incluyendo `hasta`. */
export function ventanaDe(hastaIso, dias) {
  const t = Date.parse(`${hastaIso}T00:00:00Z`)
  if (!Number.isFinite(t)) return []
  const n = Math.max(1, Math.floor(dias))
  return Array.from({ length: n }, (_, i) => new Date(t - i * 86400000).toISOString().slice(0, 10))
}

/** ¿Esta fila trae escrita la configuración, o sólo las métricas del día? Ver `configActual()`. */
function tieneConfig(f) {
  return !!(f && (f.estado || f.estado_efectivo))
}

/**
 * Las filas de un nivel, agrupadas por objeto y recortadas a la ventana.
 *
 * Cada grupo lleva sus filas ordenadas de **más vieja a más nueva** (así una tendencia se lee en el
 * orden en que pasó) y dos fotos que **no son la misma y no hay que confundir**:
 *
 * - `ultima` — la última fila **de la ventana**. Es la que corresponde cuando la pregunta es sobre el
 *   período que se está mirando (el radar de atribución tardía mira si se apagó *acá adentro*).
 * - `actual` — 🔴 **la fila con configuración más nueva que exista del objeto, esté o no en la
 *   ventana.** Es la que corresponde cuando la pregunta es sobre AHORA: «¿esto está al aire?»,
 *   «¿cuánto gasta por día?».
 *
 * # 🔴 Por qué `actual` existe: sin él, el calibrador miraba 2 días de 90 y no lo decía
 *
 * La configuración (`estado`, `estado_real`, `diario_crudo`) **se escribe sólo en la fila del día en
 * que se sacó la foto** — a propósito, porque escribirla hacia atrás sería inventar una configuración
 * histórica que Meta no expone por ninguna vía. La consecuencia es que las filas del backfill traen
 * métricas y `estado` en `null`.
 *
 * Cuatro de los seis detectores arrancan con `if (!estaActivo(...)) return null`, que es una pregunta
 * sobre el presente: *no tiene sentido proponer pausar algo que ya está pausado*. Preguntándosela a
 * `ultima`, el calibrador —que corre la regla hacia atrás sobre 90 días, moviendo `hasta`— la contesta
 * con la fila de aquel día, que no tiene estado, y devuelve `null` **todos los días anteriores al
 * primero con foto de configuración**. Medido contra la pauta real el 9-ago-2026: `freno-emergencia`
 * reportaba 8 saltos en 2 días donde había 86 en 41, y con el ROAS objetivo en 50× —donde tendría que
 * caer absolutamente todo— `gastos-hormiga` contestaba «4». Eso no se lee como «la herramienta está
 * ciega»: se lee como «esta regla casi no salta», que es la conclusión contraria. El dial con el que
 * se eligen los umbrales estaba clavado.
 *
 * ⚖️ **Sí, `actual` puede ser una fila POSTERIOR a `hasta`, y es deliberado.** En una corrida del
 * calibrador la pregunta que se contesta pasa a ser «de lo que **hoy** está al aire, cuántas veces
 * habría saltado esta regla en 90 días», que es exactamente la que sirve para elegir un umbral —y la
 * única contestable, porque de lo que estaba al aire en junio no hay registro. Lo que **no** se hace
 * es usar `actual` para detectar una transición: eso necesita historia de verdad, lo pide un solo
 * preset y ese preset ya lo declara con `requiereHistorialEstado`.
 */
export function agrupar(filas, nivel, fechas) {
  const dentro = new Set(fechas)
  const por = new Map()
  // La foto de configuración más nueva de cada objeto, mirando TODAS las filas y no sólo la ventana.
  // Se queda con la última que tenga configuración escrita: una fila sin `estado` no dice «apagado»,
  // dice «no se sabe», y tratarlas igual es justamente el defecto que este mapa arregla.
  const config = new Map()
  for (const f of Array.isArray(filas) ? filas : []) {
    if (!f || f.nivel !== nivel) continue
    const id = String(f.objeto_id)
    if (tieneConfig(f)) {
      const previa = config.get(id)
      if (!previa || String(f.fecha) > String(previa.fecha)) config.set(id, f)
    }
    if (!dentro.has(f.fecha)) continue
    if (!por.has(id)) por.set(id, [])
    por.get(id).push(f)
  }
  return [...por.entries()].map(([objeto_id, fs]) => {
    const orden = fs.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    const ultima = orden[orden.length - 1]
    // Sin ninguna fila con configuración cae en `ultima`, que es lo que se miraba antes: un objeto del
    // que nunca hubo foto de configuración se sigue leyendo como se leía, no peor.
    const actual = config.get(objeto_id) || ultima
    let spend = 0
    let compras = 0
    let revenue = 0
    let impresiones = 0
    let clicks = 0
    for (const f of orden) {
      spend += Number(f.spend) || 0
      compras += Number(f.compras) || 0
      revenue += Number(f.revenue) || 0
      impresiones += Number(f.impresiones) || 0
      clicks += Number(f.clicks) || 0
    }
    return {
      objeto_id,
      nivel,
      filas: orden,
      ultima,
      actual,
      // El nombre y la línea salen de la foto más nueva: en una corrida del calibrador, reconocer el
      // aviso por el nombre que tiene hoy es lo útil, no por el que tenía en junio.
      nombre: actual.nombre || ultima.nombre || objeto_id,
      linea: actual.linea || ultima.linea || null,
      cuenta_id: actual.cuenta_id || ultima.cuenta_id || null,
      dias: orden.length,
      spend,
      compras,
      revenue,
      impresiones,
      clicks,
      // 🔴 El ROAS de los totales, no el promedio de los `roas` diarios. Ver `sumarDias()`.
      roas: spend ? revenue / spend : 0,
      // 🔴 Y la frecuencia como PICO de un día, nunca sumada.
      frecuenciaPico: frecuenciaPico(orden),
    }
  })
}

// ── Los detectores ──────────────────────────────────────────────────────────────

/** ¿Está activo según la última foto? Meta usa varios `*_PAUSED` según de quién sea el interruptor. */
function estaActivo(fila) {
  const s = String((fila && (fila.estado_efectivo || fila.estado)) || '').toUpperCase()
  return s === 'ACTIVE'
}

/**
 * El índice del primer día APAGADO después del último día activo de la ventana, o `null` si nunca
 * estuvo activo acá adentro.
 *
 * Ese `null` es lo que distingue «lo apagaste esta semana» de «está apagado desde mayo», y es la
 * diferencia entre un aviso que se lee y uno que se ignora. Ver el detector de atribución tardía.
 */
export function apagadoEn(filas) {
  const fs = Array.isArray(filas) ? filas : []
  let ultimoActivo = -1
  for (let i = 0; i < fs.length; i++) if (estaActivo(fs[i])) ultimoActivo = i
  if (ultimoActivo === -1) return null
  return ultimoActivo + 1 < fs.length ? ultimoActivo + 1 : null
}

const DETECTORES = {
  // `actual` y no `ultima`: «no puede entregar» es una afirmación sobre ahora, y `estado_real` sólo
  // está escrito en las filas con foto de configuración. Ver la cabecera de `agrupar()`.
  'sin-avisos': (g) => {
    const real = String(g.actual.estado_real || '')
    if (real !== 'avisos-desactivados' && real !== 'sin-avisos') return null
    const detalle = real === 'sin-avisos'
      ? 'no tiene ningún aviso colgando'
      : 'tiene avisos, pero están todos apagados'
    return {
      motivo: `El conjunto figura activo y ${detalle}: no puede entregar nada.`,
      evidencia: { estado_real: real, estado: g.actual.estado, diario_crudo: g.actual.diario_crudo },
    }
  },

  /**
   * 🔴 **El único que se queda con `ultima`, y tiene que quedarse.** Los demás preguntan «¿esto está
   * al aire ahora?»; éste pregunta «¿esto se apagó ADENTRO de la ventana?», que es una transición y
   * necesita historia de verdad. Cambiarlo a `actual` lo rompería en silencio: leería el estado de
   * hoy como si fuera el del último día de la ventana.
   */
  'atribucion-tardia': (g) => {
    if (estaActivo(g.ultima)) return null
    /**
     * 🔴 **La atribución tardía es un EVENTO, no un estado**, y confundirlos fue el defecto que sólo
     * apareció corriendo el calibrador contra los 90 días reales: «está pausado y tuvo compras» es
     * cierto para siempre, así que un aviso saltaba **81 días seguidos**. Una regla que grita todos
     * los días se deja de mirar, y ahí se pierde también la que tenía razón.
     *
     * Lo que la vuelve un evento es que **la pausa tiene que haber pasado adentro de la ventana**:
     * hubo un día activo y después uno apagado. Algo pausado hace dos meses no es una decisión que
     * se esté por revisar. `apagadoEn` devuelve `null` si nunca estuvo activo en la ventana, y ese
     * `null` es todo el arreglo.
     */
    const corte = apagadoEn(g.filas)
    if (corte === null) return null
    const desde = g.filas.slice(corte)
    let compras = 0
    let revenue = 0
    for (const f of desde) {
      compras += Number(f.compras) || 0
      revenue += Number(f.revenue) || 0
    }
    // Las compras tienen que ser DE LOS DÍAS EN QUE YA ESTABA APAGADO. Contar las de cuando estaba
    // al aire diría «vendía cuando lo pausaste», que es otra cosa (y casi siempre cierta).
    if (compras <= 0) return null
    const dias = desde.length
    return {
      motivo: `Lo pausaste hace ${dias} ${dias === 1 ? 'día' : 'días'} y desde entonces igual registró ${entero(compras)} ${compras === 1 ? 'compra' : 'compras'} por ${plata(revenue)}. Meta se las atribuyó tarde.`,
      evidencia: { compras, revenue, dias_apagado: dias, desde: desde[0].fecha, estado: g.ultima.estado },
      sugerencia: { accion: 'estado', objetoId: g.objeto_id, nivel: g.nivel, status: 'ACTIVE' },
    }
  },

  'freno-emergencia': (g, u) => {
    if (g.compras > 0) return null
    if (g.spend < u.gasto_minimo) return null
    if (!estaActivo(g.actual)) return null
    return {
      motivo: `Gastó ${plata(g.spend)} en ${g.dias} ${g.dias === 1 ? 'día' : 'días'} sin una sola compra, y con eso se pagaba un cliente (el gasto mínimo para juzgar es ${plata(u.gasto_minimo)}).`,
      evidencia: { spend: g.spend, compras: 0, dias: g.dias, gasto_minimo: u.gasto_minimo },
      sugerencia: { accion: 'estado', objetoId: g.objeto_id, nivel: g.nivel, status: 'PAUSED' },
    }
  },

  'gastos-hormiga': (g, u) => {
    // Gastó, vendió algo (si no vendió nada es el freno de emergencia, y un objeto no debería
    // salir en dos renglones diciendo lo mismo), y rinde por debajo del objetivo.
    if (g.spend <= 0 || g.compras <= 0) return null
    if (g.roas >= u.roas_objetivo) return null
    if (!estaActivo(g.actual)) return null
    return {
      motivo: `Viene en ${roasTxt(g.roas)} contra un objetivo de ${roasTxt(u.roas_objetivo)}: gastó ${plata(g.spend)} en ${g.dias} días y devolvió ${plata(g.revenue)}.`,
      evidencia: { spend: g.spend, revenue: g.revenue, compras: g.compras, roas: g.roas, roas_objetivo: u.roas_objetivo, dias: g.dias },
      sugerencia: { accion: 'estado', objetoId: g.objeto_id, nivel: g.nivel, status: 'PAUSED' },
    }
  },

  fatiga: (g, u) => {
    if (!estaActivo(g.actual)) return null
    // 🔴 El pico de UN día, nunca la suma. Ver la cabecera.
    if (g.frecuenciaPico < u.frecuencia_maxima) return null
    const ctr = compararCtr(g.filas)
    // Frecuencia alta con el CTR firme es un público chico, no fatiga. Sin la segunda condición
    // esta regla gritaría todos los días sobre las mismas remarketing.
    if (!ctr || ctr.cae === false) return null
    return {
      motivo: `La misma gente lo vio hasta ${decimal(g.frecuenciaPico)} veces en un día (el máximo es ${decimal(u.frecuencia_maxima)}) y el CTR cayó de ${decimal(ctr.antes)}% a ${decimal(ctr.despues)}%. Está quemado.`,
      evidencia: { frecuencia_pico: g.frecuenciaPico, frecuencia_maxima: u.frecuencia_maxima, ctr_antes: ctr.antes, ctr_despues: ctr.despues, dias: g.dias },
    }
  },

  'ganador-escalar': (g, u) => {
    if (!estaActivo(g.actual)) return null
    // El diario también sale de la foto de configuración más nueva: sin esto, la propuesta de escalar
    // era invisible en todo el pasado del calibrador (34 saltos en 27 días leídos como 1 en 1).
    const diario = Number(g.actual.diario_crudo) || 0
    // Sin presupuesto propio no hay escalón que dar: el conjunto lo hereda de una campaña con CBO.
    if (diario <= 0) return null
    if (diario >= u.techo_diario_crudo) return null
    const racha = hayRacha(g.filas, u)
    if (!racha.ok) return null
    // El escalón se calcula sobre el diario RELEÍDO en la última foto, y el paso que lo ejecute lo
    // vuelve a leer de Meta: un aumento guardado sin publicar en Ads Manager no está aplicado y la
    // API devuelve el valor viejo sin avisar. Ver el agujero declarado en el plan del módulo.
    const propuesto = proximoDiario(diario, u.techo_diario_crudo)
    if (propuesto === null) return null
    return {
      motivo: `Lleva ${racha.seguidos} días seguidos por encima del objetivo (${roasTxt(g.roas)} contra ${roasTxt(u.roas_objetivo)}) y todavía tiene margen de presupuesto.`,
      evidencia: { roas: g.roas, roas_objetivo: u.roas_objetivo, dias_seguidos: racha.seguidos, diario_crudo: diario, techo_diario_crudo: u.techo_diario_crudo, propuesto_crudo: propuesto },
      sugerencia: { accion: 'presupuesto', objetoId: g.objeto_id, nivel: g.nivel, daily_budget: String(propuesto), desdeCrudo: diario },
    }
  },
}

/**
 * El CTR de la primera mitad de la ventana contra el de la segunda.
 *
 * Se recalcula desde clics e impresiones agregados y **no se promedian los CTR diarios**: un día de
 * 10 impresiones pesaría lo mismo que uno de 100.000. Es la misma regla que `sumarDias()`.
 * Devuelve `null` con menos de cuatro días o sin impresiones: no hay con qué hablar de tendencia.
 */
export function compararCtr(filas) {
  const fs = Array.isArray(filas) ? filas : []
  if (fs.length < 4) return null
  const corte = Math.floor(fs.length / 2)
  const ctrDe = (arr) => {
    let imp = 0
    let cl = 0
    for (const f of arr) {
      imp += Number(f.impresiones) || 0
      cl += Number(f.clicks) || 0
    }
    return imp ? (cl / imp) * 100 : null
  }
  const antes = ctrDe(fs.slice(0, corte))
  const despues = ctrDe(fs.slice(corte))
  if (antes === null || despues === null || antes === 0) return null
  return { antes, despues, cae: despues < antes }
}

/**
 * Cuántos días SEGUIDOS, contando desde el más reciente hacia atrás, estuvo por encima del objetivo.
 *
 * Desde el final y no desde el principio: «tres días seguidos» quiere decir los tres últimos. Una
 * buena racha de hace una semana, cortada ayer, no es motivo para subir plata hoy. Los días sin
 * gasto **cortan la racha** en vez de saltarse: un objeto que no entregó ayer no confirmó nada.
 */
export function diasSeguidosPorEncima(filas, objetivo) {
  const fs = Array.isArray(filas) ? filas : []
  let n = 0
  for (let i = fs.length - 1; i >= 0; i--) {
    const f = fs[i]
    const spend = Number(f.spend) || 0
    if (spend <= 0) break
    const revenue = Number(f.revenue) || 0
    if (revenue / spend < objetivo) break
    n++
  }
  return n
}

/**
 * ¿Viene bien hace suficientes días como para moverle plata? `{ seguidos, piden, ok }`.
 *
 * 🔑 **Existe como función suelta porque la comparten dos lugares que NO pueden opinar distinto**: el
 * detector `ganador-escalar`, que PROPONE la escalada, y `decidirEscalon()`, el guardarraíl que la
 * deja pasar horas después. Si cada uno contara la racha a su manera, el Panel podría ofrecer subir
 * y el motor frenar el escalón por una condición que nadie ve — o peor, al revés.
 */
export function hayRacha(filas, u) {
  const piden = Math.max(1, Math.floor((u && u.dias_seguidos) || DIAS_SEGUIDOS_DEFECTO))
  const seguidos = diasSeguidosPorEncima(filas, (u && u.roas_objetivo) || 0)
  return { seguidos, piden, ok: seguidos >= piden }
}

/**
 * El diario que sigue después de éste, o `null` si ya no hay adónde subir.
 *
 * Sube `PASO_ESCALON` y **corta contra el techo en vez de pasarlo**: el último escalón de una escalera
 * casi nunca es del 20% justo, es el pedacito que falta para llegar al tope. Devolver `null` cuando el
 * resultado no supera al actual es lo que hace que una escalera se termine sola en vez de repetir el
 * mismo número para siempre.
 */
export function proximoDiario(actualCrudo, techoCrudo) {
  const actual = Math.round(Number(actualCrudo) || 0)
  const techo = Math.round(Number(techoCrudo) || 0)
  if (actual <= 0 || techo <= 0) return null
  const prox = Math.min(Math.round(actual * (1 + PASO_ESCALON)), techo)
  return prox > actual ? prox : null
}

// ── La evaluación ───────────────────────────────────────────────────────────────

/**
 * Evalúa una regla sobre un conjunto de filas de snapshot. **Pura**: no lee ni escribe nada.
 *
 * Devuelve siempre la misma forma, y el caso «apagada» es un resultado válido con su motivo escrito
 * —no una excepción ni un array vacío mudo—: la pantalla tiene que poder decir *por qué* no grita,
 * o el silencio se lee como que la sección está rota.
 */
export function evaluarRegla(regla, { filas, umbralLinea, hasta }) {
  const def = PRESETS[regla && regla.preset]
  if (!def) return { ok: false, status: 400, error: `No existe la automatización «${(regla && regla.preset) || ''}».` }

  const linea = regla.linea
  // Las dos grafías a propósito: la fila de la base trae `cuenta_id` y el tipo de la app usa
  // `cuentaId` (igual que `Plan`). Aceptar las dos evita que el handler tenga que acordarse de
  // mapear en un camino y no en el otro — y ese olvido no rompería nada: silenciosamente dejaría de
  // filtrar por cuenta y la regla miraría toda la línea.
  const cuenta = regla.cuentaId ?? regla.cuenta_id ?? null
  // El universo de la línea (y de la cuenta, si la regla la acota). Los umbrales derivados salen de
  // ACÁ y no de la ventana: el CPA de una línea se mide con toda la historia que haya, no con siete
  // días que pueden no tener una sola venta.
  const suyas = (Array.isArray(filas) ? filas : []).filter((f) => {
    if (!f || f.linea !== linea) return false
    if (cuenta && String(f.cuenta_id) !== String(cuenta)) return false
    return true
  })

  const derivados = derivarUmbrales(suyas)
  const u = umbralesEfectivos(regla, umbralLinea, derivados)
  const faltan = faltanUmbrales(regla.preset, u)
  if (faltan.length) {
    return { ok: true, apagada: true, faltan, umbrales: u, detalle: motivoApagada(regla.preset, faltan), hallazgos: [] }
  }

  const fechas = ventanaDe(hasta, def.ventana)

  // 🔴 Los presets que detectan una TRANSICIÓN necesitan al menos dos días con estado escrito, y el
  // estado sólo existe en la fila del día en que se sacó cada foto. Devolver «0 hallazgos» sin
  // decirlo se leería como «esto no pasa», cuando la verdad es «todavía no hay con qué mirarlo».
  if (def.requiereHistorialEstado) {
    const conEstado = diasConEstado(suyas, fechas)
    if (conEstado < 2) {
      return {
        ok: true,
        apagada: true,
        faltan: [],
        sinHistorial: true,
        umbrales: u,
        detalle: `Necesita ver un cambio de estado y por ahora hay ${conEstado === 1 ? 'un solo día' : `${conEstado} días`} de historial en la ventana. Meta no expone la configuración hacia atrás: la serie la arma el cron, un día por corrida.`,
        hallazgos: [],
      }
    }
  }

  const detectar = DETECTORES[regla.preset]
  const hallazgos = []
  for (const g of agrupar(suyas, def.nivel, fechas)) {
    const hit = detectar(g, u)
    if (!hit) continue
    hallazgos.push({
      fecha: hasta,
      nivel: g.nivel,
      objeto_id: g.objeto_id,
      objeto_nombre: g.nombre,
      linea: g.linea,
      cuenta_id: g.cuenta_id,
      motivo: hit.motivo,
      evidencia: hit.evidencia || {},
      // `undefined` no sobrevive a un `JSON.stringify`, y en la base la columna es nullable: se
      // normaliza acá para que el handler no tenga que acordarse.
      sugerencia: hit.sugerencia || null,
    })
  }
  // Del más caro al más barato: el orden con el que se leen en el Panel es el orden en que conviene
  // mirarlos, y ordenarlo en la UI lo dejaría distinto entre pantallas. Cae a `revenue` porque no
  // todos los detectores hablan de gasto — el radar de atribución tardía habla de plata ENTRADA, y
  // ordenarlo por un `spend` que no puso lo mandaría siempre al fondo.
  const peso = (h) => Number(h.evidencia.spend) || Number(h.evidencia.revenue) || 0
  hallazgos.sort((a, b) => peso(b) - peso(a))
  return { ok: true, apagada: false, faltan: [], umbrales: u, detalle: null, hallazgos }
}

/**
 * 🎯 **El calibrador: la regla corrida HACIA ATRÁS sobre la historia que ya está.**
 *
 * Es la pieza que hace usable el módulo sin que nadie tenga que definir un umbral de antemano. En
 * vez de preguntar «¿cuál es tu ROAS objetivo?» —que nadie sabe contestar en abstracto—, se mueve el
 * dial y esto contesta *«con 2,5 habría saltado 43 veces en 90 días; con 1,5, 6 veces»*, con la
 * lista de cuáles. El umbral deja de ser una definición y pasa a ser algo que se mira.
 *
 * 🔑 **Es `evaluarRegla` con otros argumentos, no una segunda implementación.** Si el calibrador
 * tuviera su propia lógica podría decir 6 y la regla gritar 40, que es exactamente la clase de
 * mentira que hace desconfiar de la herramienta entera. Corre gratis porque lee snapshots, no Meta.
 */
export function calibrar(regla, { filas, umbralLinea, hasta, dias = 90 }) {
  const fechas = ventanaDe(hasta, dias)

  // 🔑 **HOY primero, y no es un detalle de orden.** «¿Esta regla puede correr?» es una pregunta
  // sobre AHORA. Recorriendo de lo más viejo a lo más nuevo y cortando en el primer apagado, una
  // regla que hoy funciona pero que en mayo no tenía historial reportaría el estado de mayo — y el
  // cartel diría «0 días de historial» sobre una regla que está andando.
  const hoy = evaluarRegla(regla, { filas, umbralLinea, hasta })
  if (!hoy.ok) return hoy
  if (hoy.apagada) {
    return {
      ok: true,
      apagada: true,
      faltan: hoy.faltan,
      sinHistorial: !!hoy.sinHistorial,
      detalle: hoy.detalle,
      dias,
      total: 0,
      objetos: 0,
      porFecha: [],
      ejemplos: [],
    }
  }

  const porFecha = []
  const vistos = new Map()
  for (const fecha of fechas.slice().reverse()) {
    const r = evaluarRegla(regla, { filas, umbralLinea, hasta: fecha })
    if (!r.ok) return r
    // Un día sin historial de estado en el pasado no apaga el calibrador: simplemente no aportó
    // nada. Cortar ahí borraría toda la serie por los días viejos del backfill.
    if (r.apagada) continue
    porFecha.push({ fecha, n: r.hallazgos.length })
    for (const h of r.hallazgos) {
      // Por objeto y no por (objeto, fecha): lo que importa saber es a cuántas cosas DISTINTAS
      // habría señalado, no cuántas veces habría repetido el mismo renglón siete días seguidos.
      if (!vistos.has(h.objeto_id)) vistos.set(h.objeto_id, { ...h, veces: 0 })
      vistos.get(h.objeto_id).veces++
    }
  }

  const ejemplos = [...vistos.values()].sort((a, b) => b.veces - a.veces)
  return {
    ok: true,
    apagada: false,
    dias,
    // Cuántas veces habría saltado en total (la misma cosa varios días cuenta varias veces: es lo
    // que se leería en el Panel, o sea el ruido real).
    total: porFecha.reduce((s, d) => s + d.n, 0),
    // Y a cuántas cosas distintas. Los dos números juntos son el dato: 40 saltos sobre 3 objetos es
    // una regla repetitiva, 40 sobre 40 es una regla que encontró algo.
    objetos: ejemplos.length,
    porFecha,
    ejemplos: ejemplos.slice(0, 20),
  }
}

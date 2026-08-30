/**
 * Etapas de la pauta — la cara tipada.
 *
 * ⚠️ **La clasificación no vive acá: vive en `lib/meta-ads/etapas.core.js`**, en JS plano, porque
 * `api/meta-ads.js` la necesita y no puede importar TypeScript. El detalle está en el docblock del
 * core, incluida la advertencia grande: la etapa es una propiedad del PÚBLICO y el objetivo de Meta
 * es apenas una aproximación.
 *
 * Este archivo aporta los tipos, los textos de ayuda y `diagnosticar()`, que es lo único que decide
 * qué se le dice a la persona que abre la pantalla.
 */

import type {
  CampañaEtapa,
  Diagnostico,
  Etapa,
  EtapaOSin,
  ResumenEtapa,
  Veredicto,
} from './tipos'
import {
  ETAPAS as ETAPAS_JS,
  ETAPA_POR_OBJETIVO as ETAPA_POR_OBJETIVO_JS,
  ETIQUETA_ETAPA as ETIQUETA_ETAPA_JS,
  SIGLA_ETAPA as SIGLA_ETAPA_JS,
  etapaDeObjetivo as etapaDeObjetivoJs,
  estaAlAire as estaAlAireJs,
  UMBRALES_ETAPA as UMBRALES_ETAPA_JS,
} from './etapas.core.js'

export const ETAPAS = ETAPAS_JS as readonly Etapa[]
export const ETAPA_POR_OBJETIVO = ETAPA_POR_OBJETIVO_JS as Record<string, EtapaOSin>
export const ETIQUETA_ETAPA = ETIQUETA_ETAPA_JS as Record<EtapaOSin, string>
/**
 * La sigla de la industria, **al lado** del nombre y ⛔ nunca en su lugar. `''` en `sin-clasificar`,
 * que ⛔ no es una etapa del embudo sino el estado de una campaña sin clasificar.
 */
export const SIGLA_ETAPA = SIGLA_ETAPA_JS as Record<EtapaOSin, string>
export const UMBRALES_ETAPA = UMBRALES_ETAPA_JS as {
  dias: number
  diasAmplio: number
  minGastoTotal: number
  minCampanas: number
  dominanciaOtraEtapa: number
  pisoGastoRelevante: number
}

export const etapaDeObjetivo = etapaDeObjetivoJs as (objetivo: string | null | undefined) => EtapaOSin

/**
 * Qué es cada etapa, explicado para quien tiene que craneаr el creativo — no para quien compra
 * medios. Cuatro renglones fijos y siempre los mismos cuatro, así se comparan de un vistazo.
 *
 * `jerga` va aparte y chiquito al pie: sirve para que quien escuche la sigla en una reunión sepa
 * que están hablando de esto, pero no se le pide a nadie que la aprenda para usar la pantalla.
 */
export const RESUMEN_ETAPA: Record<Etapa, {
  aQuien: string
  queCreativo: string
  queNoVa: string
  comoSabes: string
  jerga: string
}> = {
  tofu: {
    aQuien: 'Al que todavía no te conoce. Nunca te compró, no te sigue y no entró a la web.',
    queCreativo:
      'Algo que frene el pulgar en el primer segundo. La prenda puesta y en movimiento, el detalle que se nota de cerca, una escena reconocible. Video corto antes que foto.',
    queNoVa:
      'Un descuento (todavía no te conocen, así que no significa nada) ni una explicación larga de la marca: nadie te la va a leer.',
    comoSabes: 'Cuánta gente distinta lo vio, cuántos siguieron mirando el video, cuántos entraron al perfil.',
    jerga: 'TOFU (top of funnel)',
  },
  mofu: {
    aQuien: 'Al que ya te vio: te siguió, entró a la web, miró un video o dejó el dato, y todavía no compró.',
    queCreativo:
      'Algo que resuelva la duda, no que grite la marca. Reseñas y testimonios reales. Cómo elegir el talle. De qué está hecho y cuánto dura. Detrás de escena. Comparación con lo que ya usan.',
    queNoVa:
      'Un descuento (eso es la etapa siguiente) ni una presentación de marca: eso ya lo vieron y por eso están acá.',
    comoSabes: 'Cuánta gente vuelve a la web, cuántos mensajes entran, cuántos guardan o comparten el posteo.',
    jerga: 'MOFU (middle of funnel)',
  },
  bofu: {
    aQuien: 'Al que ya está decidido y le falta el empujón. Agregó al carrito, arrancó la compra o compró antes.',
    queCreativo:
      'El producto y la razón para comprarlo hoy. Envío gratis, últimas unidades, el descuento si lo hay, la garantía de cambio. Directo y con el precio a la vista.',
    queNoVa:
      'Presentar la marca ni contar la historia: a esta altura sobra y distrae de la única acción que se le está pidiendo.',
    comoSabes: 'Compras, ingresos y ROAS. Es la única etapa donde el ROAS quiere decir lo que uno cree.',
    jerga: 'BOFU (bottom of funnel)',
  },
}

/** Etiqueta legible del objetivo crudo de Meta, para no mostrar `OUTCOME_SALES` en pantalla. */
export function rotuloObjetivo(objetivo: string | null): string {
  if (!objetivo) return 'sin objetivo'
  const map: Record<string, string> = {
    OUTCOME_AWARENESS: 'Reconocimiento',
    BRAND_AWARENESS: 'Reconocimiento de marca',
    REACH: 'Alcance',
    VIDEO_VIEWS: 'Reproducciones de video',
    OUTCOME_TRAFFIC: 'Tráfico',
    LINK_CLICKS: 'Clics al enlace',
    OUTCOME_ENGAGEMENT: 'Interacción',
    POST_ENGAGEMENT: 'Interacción con la publicación',
    PAGE_LIKES: 'Me gusta de la página',
    EVENT_RESPONSES: 'Respuestas a un evento',
    LOCAL_AWARENESS: 'Reconocimiento local',
    OUTCOME_LEADS: 'Clientes potenciales',
    LEAD_GENERATION: 'Generación de clientes potenciales',
    MESSAGES: 'Mensajes',
    OUTCOME_SALES: 'Ventas',
    CONVERSIONS: 'Conversiones',
    PRODUCT_CATALOG_SALES: 'Ventas del catálogo',
    CATALOG_SALES: 'Ventas del catálogo',
    STORE_VISITS: 'Visitas al local',
    STORE_TRAFFIC: 'Tráfico al local',
    OUTCOME_APP_PROMOTION: 'Promoción de app',
    APP_INSTALLS: 'Instalaciones de app',
    MOBILE_APP_INSTALLS: 'Instalaciones de app',
  }
  return map[objetivo] || objetivo
}

/**
 * ¿Está al aire? `ACTIVE` **y** gasto > 0 — la definición vive en el core (la comparte el censo del
 * servidor, que con ella decide qué campañas sin marca se reclaman). Acá sólo se le ponen los tipos.
 *
 * Se exporta porque también decide **a qué campañas se les dibujan los botones de acción**. Con un
 * `||` en vez del `&&` del core, la columna se llenaría con las publicaciones de Instagram
 * promocionadas —Meta le arma una campaña a cada posteo y quedan `ACTIVE` para siempre sin entregar
 * nada— y taparía las cinco que se llevan la plata.
 */
export const estaAlAire = estaAlAireJs as (c: CampañaEtapa) => boolean

function etapaEfectiva(c: CampañaEtapa, overrides: Record<string, Etapa>): EtapaOSin {
  return overrides[c.id] || c.etapaAuto
}

/**
 * El diagnóstico de una marca: cómo se reparte la pauta entre las tres etapas y qué hay que hacer.
 *
 * **El veredicto lo decide la CANTIDAD de campañas al aire, no la plata.** Es como se piensa el
 * problema ("hay cinco de la primera y ninguna de la segunda") y es legible sin saber de números.
 * El gasto igual se calcula y se muestra: si una etapa tiene pauta pero se lleva menos del piso,
 * la tarjeta lo aclara (`gastoFlaco`), y así no se pierde el caso de la campaña con $500 que figura
 * pero no mueve la aguja. Lo que el gasto no hace es cambiar el veredicto.
 */
export function diagnosticar(
  campañas: CampañaEtapa[],
  opts: { overrides?: Record<string, Etapa>; marca?: string } = {},
): Diagnostico {
  const overrides = opts.overrides || {}
  const marca = opts.marca || 'Esta marca'
  const U = UMBRALES_ETAPA

  const gastoTotal = campañas.reduce((t, c) => t + c.spend, 0)

  const etapas: ResumenEtapa[] = ETAPAS.map((etapa) => {
    const suyas = campañas.filter((c) => etapaEfectiva(c, overrides) === etapa)
    const alAire = suyas.filter(estaAlAire).sort((a, b) => b.spend - a.spend)
    const sinEntrega = suyas.filter((c) => c.estado === 'ACTIVE' && c.spend <= 0)
    // Todo lo que no está activo. Los tres cortes reparten `suyas` sin dejar resto: antes de esto,
    // una campaña pausada no caía en ninguno y la pantalla directamente no la mostraba. Se ordenan
    // por gasto porque una pausada con gasto en la ventana es una que se apagó hace poco, y esa es
    // la que alguien está buscando cuando entra a reactivar.
    const pausadas = suyas.filter((c) => c.estado !== 'ACTIVE').sort((a, b) => b.spend - a.spend)
    const spend = alAire.reduce((t, c) => t + c.spend, 0)
    const parte = gastoTotal > 0 ? spend / gastoTotal : 0
    return { etapa, alAire, sinEntrega, pausadas, spend, parte, estado: 'ok', gastoFlaco: false }
  })

  const sinClasificar = campañas
    .filter((c) => etapaEfectiva(c, overrides) === 'sin-clasificar')
    .sort((a, b) => b.spend - a.spend)

  const totalAlAire = etapas.reduce((t, e) => t + e.alAire.length, 0)
  const maxAlAire = etapas.reduce((m, e) => Math.max(m, e.alAire.length), 0)

  for (const e of etapas) {
    const n = e.alAire.length
    if (n === 0) e.estado = 'vacia'
    else if (n === 1 && maxAlAire >= U.dominanciaOtraEtapa) e.estado = 'floja'
    else e.estado = 'ok'
    e.gastoFlaco = n > 0 && e.parte < U.pisoGastoRelevante
  }

  return { etapas, sinClasificar, gastoTotal, totalAlAire, veredicto: veredictoDe(etapas, gastoTotal, totalAlAire, marca) }
}

/**
 * Un solo veredicto: el más urgente. Prioridad: la segunda etapa vacía manda sobre todo, porque es
 * exactamente el agujero que se sabe que existe; después la tercera; después las flojas; y la
 * primera vacía va última porque, si no hay nada arriba del embudo, lo de abajo no tiene de dónde
 * alimentarse igual.
 */
function veredictoDe(etapas: ResumenEtapa[], gastoTotal: number, totalAlAire: number, marca: string): Veredicto {
  const U = UMBRALES_ETAPA
  const por = (e: Etapa) => etapas.find((x) => x.etapa === e) as ResumenEtapa
  const nom = (e: Etapa) => ETIQUETA_ETAPA[e]

  // Guarda anti-ruido: sin base real, la pantalla se calla en vez de inventar un diagnóstico.
  if (gastoTotal < U.minGastoTotal || totalAlAire < U.minCampanas) {
    return {
      etapa: null,
      clase: 'sin-base',
      titulo: `${marca}: todavía no hay pauta suficiente para sacar conclusiones.`,
      detalle:
        'Con una o ninguna campaña entregando, el reparto por etapas no dice nada. Cuando haya un par corriendo, acá va a aparecer qué falta.',
    }
  }

  const tofu = por('tofu')
  const mofu = por('mofu')
  const bofu = por('bofu')

  if (mofu.estado === 'vacia') {
    return {
      etapa: 'mofu',
      clase: 'vacia',
      titulo: `${marca}: ${cuantas(tofu)} de "${nom('tofu')}" al aire y ninguna de "${nom('mofu')}".`,
      detalle:
        'Le estás hablando solo a gente que no te conoce. El que te vio y se quedó pensando no recibe nada, y en unos días se olvida. Toca armar la segunda etapa: contenido para el que ya te vio y todavía no compró.',
    }
  }
  if (bofu.estado === 'vacia') {
    return {
      etapa: 'bofu',
      clase: 'vacia',
      titulo: `${marca}: ninguna pauta de "${nom('bofu')}" al aire.`,
      detalle:
        'Hay gente que agregó al carrito o arrancó la compra y no volvió, y nadie le está diciendo nada. Es la etapa más barata de todas, porque ya te conocen: falta el creativo que los empuje.',
    }
  }
  if (mofu.estado === 'floja') {
    return {
      etapa: 'mofu',
      clase: 'floja',
      titulo: `${marca}: una sola pauta de "${nom('mofu')}" contra ${cuantas(tofu)} de "${nom('tofu')}".`,
      detalle: `${mofu.gastoFlaco ? `Además se lleva el ${pct(mofu.parte)} de la plata. ` : ''}El medio del embudo está sostenido por una sola pieza: si esa se gasta, no queda nada. Vale craneаr dos o tres más.`,
    }
  }
  if (bofu.estado === 'floja') {
    return {
      etapa: 'bofu',
      clase: 'floja',
      titulo: `${marca}: una sola pauta de "${nom('bofu')}" al aire.`,
      detalle: `${bofu.gastoFlaco ? `Y se lleva el ${pct(bofu.parte)} del gasto. ` : ''}Es la etapa que cierra la venta y está sostenida por un solo creativo. Conviene tener más de uno rotando.`,
    }
  }
  if (tofu.estado === 'vacia') {
    return {
      etapa: 'tofu',
      clase: 'vacia',
      titulo: `${marca}: no hay ninguna pauta de "${nom('tofu')}" al aire.`,
      detalle:
        'Nadie nuevo te está viendo. Las otras etapas le hablan a gente que ya te conoce, y ese público se agota: sin entrada arriba, en unas semanas se quedan sin a quién hablarle.',
    }
  }
  return {
    etapa: null,
    clase: 'ok',
    titulo: `${marca}: las tres etapas tienen pauta al aire.`,
    detalle: 'El embudo está cubierto. Lo que sigue es mirar cuál de las tres está flaca de plata o de creativos nuevos.',
  }
}

const cuantas = (e: ResumenEtapa) => `${e.alAire.length} ${e.alAire.length === 1 ? 'pauta' : 'pautas'}`
const pct = (p: number) => `${Math.round(p * 100)}%`

// ── Los overrides, del lado de la pantalla ───────────────────────────────────────────────────

/**
 * Las correcciones manuales como las quiere `diagnosticar()`: `campaign_id → etapa`.
 *
 * Se filtra lo que no sea una de las tres etapas en vez de confiar en la fila. La tabla la escribe
 * el endpoint, que valida contra `ETAPAS`, pero un valor viejo de una versión anterior entraría al
 * diagnóstico como una cuarta etapa fantasma y ninguna tarjeta la mostraría: la campaña
 * desaparecería del reparto sin que nadie pueda notarlo.
 */
export function mapaOverrides(overrides: { campaign_id: string; etapa: string }[]): Record<string, Etapa> {
  const out: Record<string, Etapa> = {}
  for (const o of overrides || []) {
    if (o && o.campaign_id && (ETAPAS as readonly string[]).includes(o.etapa)) out[o.campaign_id] = o.etapa as Etapa
  }
  return out
}

/**
 * ¿Este override quedó viejo? Es decir: ¿le cambiaron el objetivo a la campaña desde que alguien la
 * corrigió a mano?
 *
 * Corregir la etapa es un juicio sobre **una campaña concreta como estaba ese día**. Si después le
 * cambian el objetivo, la corrección puede haber dejado de tener sentido y el diagnóstico seguiría
 * mostrándola donde la pusieron, sin que nadie tenga forma de enterarse. Por eso la fila guarda el
 * objetivo del momento: no es prolijidad, es lo que hace que el override pueda avisar que envejeció.
 *
 * Un override sin objetivo guardado (creado antes de que la columna se llenara) **no se marca**:
 * gritar "quedó vieja" sobre algo que no se puede comparar sería ruido.
 */
export function overrideViejo(
  o: { objetivo?: string | null },
  campaña: { objetivo: string | null } | undefined,
): boolean {
  if (!o || !o.objetivo || !campaña) return false
  return String(o.objetivo) !== String(campaña.objetivo || '')
}

/**
 * Etapas de la pauta (TOFU / MOFU / BOFU): LA implementación. Una sola, para los dos mundos.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js`: los handlers de `api/*.js` corren en Node sin pasar por
 * el compilador de Next y **no pueden importar TypeScript**. La clasificación la necesitan los dos
 * lados —el endpoint para armar la respuesta, la pantalla para agrupar y para el override—, así que
 * vive acá y `lib/meta-ads/etapas.ts` es el re-export tipado. Si se copiara, se despegaría: ya pasó
 * con los permisos y es exactamente el bug que documenta el core de al lado.
 *
 * # Qué problema resuelve
 *
 * Toda la pauta de BDI y Zattia es de la primera etapa (tráfico y reconocimiento). Nadie arma
 * pauta de las otras dos, entre otras cosas porque el monitor nunca lo dijo: la sección Meta Ads
 * muestra plata y ROAS, pero no muestra **a quién le estás hablando**. Esto clasifica cada campaña
 * en una etapa para que el hueco se vea.
 *
 * # ⚠️ La verdad incómoda, que hay que tener presente antes de creerle a este archivo
 *
 * **La etapa es una propiedad del PÚBLICO, no del objetivo de la campaña.** Una campaña
 * `OUTCOME_SALES` apuntada a gente que nunca te vio es prospecting disfrazado de BOFU, y este mapa
 * la va a contar como BOFU igual. El `objective` es la mejor aproximación que se puede hacer con
 * los datos que hoy se traen de la Graph API; el remarketing de verdad solo se detecta leyendo
 * `targeting{custom_audiences}` a nivel conjunto de anuncios, que son más llamadas y otra tanda.
 *
 * Por eso existe el **override manual** (tabla `meta_ads_etapa`): no es un extra cosmético, es la
 * válvula que hace que el diagnóstico sea confiable. Una campaña mal clasificada se corrige una vez
 * y queda corregida.
 */

/** Las tres etapas, en orden de embudo. `sin-clasificar` NO es una etapa: es la ausencia de una. */
export const ETAPAS = ['tofu', 'mofu', 'bofu']

/**
 * Cómo se llama cada etapa **en pantalla**. Sin siglas: la gente de marketing que tiene que craneаr
 * los creativos no habla en TOFU/MOFU/BOFU, y obligarla a aprender la jerga antes de entender el
 * problema es la forma más rápida de que no use la herramienta. La sigla aparece una sola vez, al
 * pie del popover de ayuda, para que quien la escuche en una reunión sepa que es esto.
 */
export const ETIQUETA_ETAPA = {
  tofu: 'Que te conozcan',
  mofu: 'Que te consideren',
  bofu: 'Que compren',
  'sin-clasificar': 'Sin clasificar',
}

/**
 * Objetivos de campaña que buscan VENDER. Es lo que separa el ROAS que importa del ruido: una
 * campaña de tráfico o de reconocimiento baja el ROAS de la cuenta sin que eso signifique nada,
 * porque no está optimizando para comprar. Meta usa los nombres nuevos (OUTCOME_*) y los viejos.
 *
 * ⚠️ Vive acá y no en `api/meta-ads.js` (de donde salió) para que no se despegue de
 * `ETAPA_POR_OBJETIVO`: son dos vistas del mismo hecho y un test amarra la invariante
 * (todo objetivo de venta cae en `bofu`). El `tipo: 'venta'|'trafico'|'otro'` que consume el ROAS
 * de venta, la UI y el detector gerencial NO cambia — esto se suma al lado, no lo reemplaza.
 */
export const OBJETIVOS_VENTA = new Set(['OUTCOME_SALES', 'CONVERSIONS', 'PRODUCT_CATALOG_SALES', 'CATALOG_SALES'])
export const OBJETIVOS_TRAFICO = new Set(['OUTCOME_TRAFFIC', 'LINK_CLICKS', 'OUTCOME_ENGAGEMENT', 'POST_ENGAGEMENT', 'PAGE_LIKES'])

/**
 * Objetivo de Meta → etapa.
 *
 * Notas de las decisiones que no son obvias:
 *
 * - **`OUTCOME_TRAFFIC` → tofu.** Técnicamente, mandar tráfico a la web sobre gente que ya te
 *   conoce sería la segunda etapa. Acá va a la primera porque es literalmente lo que se está
 *   pauteando hoy: público frío al que se le muestra la marca. Si alguna campaña de tráfico es de
 *   verdad de remarketing, se corrige con el override.
 * - **`OUTCOME_ENGAGEMENT` → tofu, y es el candidato #1 al override.** Es el objetivo más ambiguo
 *   de Meta: adentro conviven mensajes, reproducciones de video y engagement de posteo, que no son
 *   la misma etapa. Queda en la primera por ser el caso más común.
 * - **Los que antes caían en `'otro'` ahora tienen lugar.** `OUTCOME_AWARENESS`, `BRAND_AWARENESS`,
 *   `REACH` y `VIDEO_VIEWS` desaparecían del cálculo aunque sean exactamente la primera etapa;
 *   `OUTCOME_LEADS`, `LEAD_GENERATION` y `MESSAGES` son la segunda y también se perdían.
 * - **Lo desconocido NO se asigna en silencio.** Cae en `sin-clasificar`, que la pantalla muestra a
 *   propósito ("3 pautas sin clasificar — decinos a qué etapa van"). Meterlas en la primera etapa
 *   por descarte inventaría un diagnóstico: es preferible admitir que no se sabe.
 */
export const ETAPA_POR_OBJETIVO = {
  // Primera etapa: que te conozcan.
  OUTCOME_AWARENESS: 'tofu',
  BRAND_AWARENESS: 'tofu',
  REACH: 'tofu',
  VIDEO_VIEWS: 'tofu',
  OUTCOME_TRAFFIC: 'tofu',
  LINK_CLICKS: 'tofu',
  OUTCOME_ENGAGEMENT: 'tofu',
  POST_ENGAGEMENT: 'tofu',
  PAGE_LIKES: 'tofu',
  EVENT_RESPONSES: 'tofu',
  LOCAL_AWARENESS: 'tofu',
  // Segunda etapa: que te consideren. Dejar el dato o abrir la conversación es el paso del medio.
  OUTCOME_LEADS: 'mofu',
  LEAD_GENERATION: 'mofu',
  MESSAGES: 'mofu',
  // Tercera etapa: que compren.
  OUTCOME_SALES: 'bofu',
  CONVERSIONS: 'bofu',
  PRODUCT_CATALOG_SALES: 'bofu',
  CATALOG_SALES: 'bofu',
  STORE_VISITS: 'bofu',
  STORE_TRAFFIC: 'bofu',
  // Promoción de apps: no aplica al negocio, y meterla en alguna etapa ensuciaría el diagnóstico.
  OUTCOME_APP_PROMOTION: 'sin-clasificar',
  APP_INSTALLS: 'sin-clasificar',
  MOBILE_APP_INSTALLS: 'sin-clasificar',
}

/** Etapa automática de un objetivo. Sin objetivo (o desconocido) → `sin-clasificar`, nunca `tofu`. */
export function etapaDeObjetivo(objetivo) {
  if (!objetivo) return 'sin-clasificar'
  return ETAPA_POR_OBJETIVO[String(objetivo).trim().toUpperCase()] || 'sin-clasificar'
}

/**
 * Cuenta publicitaria de Meta → marca del monitor.
 *
 * ⚠️ **Está vacío a propósito hasta que se carguen los ids reales.** No se puede completar sin
 * llamar a la API con el token de producción (`META_ADS_TOKEN` vive solo en Vercel). Mientras esté
 * vacío, la pantalla de Etapas no muestra ninguna cuenta y en su lugar lista los ids que devolvió
 * Meta, para copiarlos acá. Es un estado de día 1 visible, no una falla silenciosa.
 *
 * # Por qué constante y no tabla
 *
 * Son tres cuentas que no cambian nunca. Una tabla obligaría a elegir en cuál de las dos bases de
 * Supabase (hay una por marca) vive un dato que es *cross*-marca, que es el mismo olor que arrastra
 * `cfgFor` en `api/_disenos.js`.
 *
 * # Por qué no se adivina por el nombre
 *
 * Antes esto era una regex sobre el nombre de la cuenta (`lib/gerencial/detectores/ads.ts`) que
 * **caía a `bdi` en silencio** cuando no matcheaba. Para un tablero que se lee por marca, atribuirle
 * a BDI la pauta de otra marca es peor que no mostrar nada: el número se ve razonable y está mal.
 */
export const MARCA_POR_CUENTA = {
  // '<account_id sin act_>': 'bdi' | 'zattia'
}

/** Marca de una cuenta publicitaria, o `null` si no está mapeada. NUNCA cae a una marca por defecto. */
export function marcaDeCuentaAds(accountId) {
  const id = String(accountId || '').replace(/^act_/, '')
  return MARCA_POR_CUENTA[id] || null
}

/**
 * Los números del semáforo. Sueltos acá arriba —y no desparramados en la pantalla— por el mismo
 * motivo que `lib/gerencial/umbrales.ts`: son criterio de negocio, se discuten, y hay que poder
 * cambiarlos sin leer el render.
 */
export const UMBRALES_ETAPA = {
  /**
   * Ventana de análisis, en días. FIJA, no la del selector del Resumen: con "Hoy" a las 9 de la
   * mañana todas las etapas darían 0 y el tablero gritaría un hueco falso todos los días.
   */
  dias: 30,
  /** Alternativa que ofrece la pantalla, para mirar más atrás. */
  diasAmplio: 90,
  /** Sin este gasto mínimo en la marca, el diagnóstico se calla (cuenta recién arrancada). */
  minGastoTotal: 1,
  /** Sin al menos esta cantidad de campañas al aire en total, tampoco hay base para opinar. */
  minCampanas: 2,
  /** Una etapa con UNA sola campaña está floja si alguna otra tiene esta cantidad o más. */
  dominanciaOtraEtapa: 3,
  /**
   * Piso de gasto (0-1) para que una etapa cuente como "existe de verdad". No cambia el veredicto
   * —eso lo decide la cantidad de campañas, que es como se piensa el problema—, pero agrega el
   * renglón "hay 1 pauta, pero se lleva el 2% de la plata", que es el caso de la campaña de la
   * segunda etapa con $500 que tapa el hueco sin cubrirlo.
   */
  pisoGastoRelevante: 0.1,
}

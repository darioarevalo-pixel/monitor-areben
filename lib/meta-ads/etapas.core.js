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
 * Cómo se llama cada etapa **en pantalla**. El nombre manda en criollo: quien tiene que craneаr los
 * creativos ⛔ no habla en TOFU/MOFU/BOFU, y obligarlo a aprender la jerga antes de entender el
 * problema es la forma más rápida de que ⛔ no use la herramienta.
 *
 * 🔴 **Pero la sigla dejó de vivir sólo en el popover (30-ago-2026).** Bruno, caminando el Embudo:
 * *«hay una sección que dice que te conozcan, otra que te consideren y otra que compren; que te
 * conozcan es tofu, que te consideren es mofu y vender es bofu»* — o sea que la traducción la estaba
 * haciendo **él**, en la cabeza, cada vez. 🔑 Esconder la sigla ⛔ no evita la jerga: se la escucha
 * igual en cualquier reunión de pauta y en la propia documentación de Meta. Lo que evita es tener
 * que abrir un popover para empatarla.
 *
 * ⇒ el criollo se queda como **nombre** y la sigla va al lado, **chiquita y siempre visible**
 * (`SIGLA_ETAPA`). ⛔ No al revés: un encabezado que dice «TOFU» y nada más vuelve a pedir el
 * popover, que es exactamente el problema con otro signo.
 */
export const ETIQUETA_ETAPA = {
  tofu: 'Que te conozcan',
  mofu: 'Que te consideren',
  bofu: 'Que compren',
  'sin-clasificar': 'Sin clasificar',
}

/**
 * La sigla de la industria, para poner **al lado** del nombre y ⛔ nunca en su lugar.
 *
 * ⛔ `sin-clasificar` ⛔ no tiene sigla, y eso ⛔ no es un olvido: ⛔ no es una etapa del embudo, es
 * el estado de una campaña a la que nadie le puso una. Inventarle una la haría parecer parte del
 * modelo.
 */
export const SIGLA_ETAPA = {
  tofu: 'TOFU',
  mofu: 'MOFU',
  bofu: 'BOFU',
  'sin-clasificar': '',
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
 * ¿Está al aire? `effective_status === 'ACTIVE'` **y** gasto > 0.
 *
 * Las dos condiciones, porque cada una sola miente en una dirección distinta:
 *  - `ACTIVE` sola: una campaña activa con todos sus conjuntos pausados figura activa y no entrega
 *    nada. Contarla taparía el hueco que la pantalla existe para mostrar. El caso masivo son las
 *    publicaciones de Instagram promocionadas: Meta le arma una campaña a cada posteo y quedan
 *    activas para siempre, así que con `ACTIVE` solo son cientos de campañas fantasma.
 *  - `spend > 0` sola: una campaña que se pausó ayer sigue teniendo gasto en una ventana de 30 días
 *    y aparecería como si estuviera corriendo.
 *
 * 🔑 **Vive acá, en el core, porque la usan los dos lados**: el diagnóstico de la pantalla
 * (`diagnosticar()`) y el censo del servidor, que con ella decide qué campañas sin marca se reclaman
 * en ámbar. Escrita dos veces, una de las dos se corrige sola el día que cambie el criterio y la
 * pantalla reclamaría campañas que después no cuenta.
 */
export function estaAlAire(c) {
  return c?.estado === 'ACTIVE' && c.spend > 0
}

/*
 * ⚠️ Acá vivía `MARCA_POR_CUENTA`, el mapa **cuenta publicitaria → marca**. Se borró el 5-ago-2026
 * al ir a cargarle los ids de producción: BDI, Zattia y Stunned se pautean **todas desde la misma
 * cuenta**, así que para esa cuenta no existe ningún valor correcto — cualquiera que se cargara le
 * regalaba a una marca la pauta de las tres.
 *
 * La atribución bajó a nivel campaña y es manual: ver `lib/meta-ads/lineas.core.js`.
 */

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

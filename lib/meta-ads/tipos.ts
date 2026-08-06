/**
 * Tipos de "Meta Ads". Espejo de lo que devuelve `api/meta-ads.js` en sus dos modos:
 * overview (lista de cuentas) y detalle (una cuenta con anuncios/campañas + diaria + placements).
 */

/** Ventanas relativas que ofrece el selector (mapean 1:1 a date_preset de Meta). */
export type PresetMetaAds =
  | 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d'
  | 'this_month' | 'last_month' | 'maximum'

/** Métricas de una fila (cuenta, campaña o anuncio). Ventas/ROAS desde `omni_purchase`. */
export type Metricas = {
  spend: number
  impressions: number
  clicks: number
  /** % (ya viene como porcentaje). */
  ctr: number
  cpc: number
  cpm: number
  purchases: number
  revenue: number
  /** Retorno (ingresos ÷ gasto). */
  roas: number
  /** Visitas al perfil (IG/FB). Es el resultado de una pauta de tráfico, como la compra lo es de una de venta. */
  perfil?: number
  /** Gasto por visita al perfil. Solo en subtotales (`sumar`), donde se recalcula desde los agregados. */
  costoPerfil?: number
  /** Seguidores nuevos (follow de IG / like de página de FB). El otro resultado de una pauta de tráfico. */
  seguidores?: number
  /** Gasto por seguidor nuevo. */
  costoSeguidor?: number
  /** Solo a nivel cuenta (dedup — no se suma en subtotales). */
  reach?: number
  frequency?: number
}

/** Una cuenta en el modo overview (para el selector + vistazo). */
export type CuentaMetaAds = Partial<Metricas> & {
  /** Zona horaria de la cuenta publicitaria: es la que define qué es "hoy" para Meta. */
  zona?: string
  /** account_id (sin `act_`). */
  id: string
  nombre: string
  moneda: string
  /** La cuenta existe pero no tuvo actividad en la ventana. */
  sinDatos?: boolean
  /** Falló el insights de ESA cuenta. */
  error?: string
}

export type RespuestaOverview = {
  rango: PresetMetaAds | { since: string; until: string }
  cuentas: CuentaMetaAds[]
}

/** Rótulo de ranking de Meta (arriba/promedio/debajo del promedio, o UNKNOWN). */
export type Ranking = string | null

/** Diagnóstico de creativo: cómo rankea Meta el anuncio vs. otros que compiten por el mismo público. */
export type RankingAd = { quality: Ranking; engagement: Ranking; conversion: Ranking }

/** Métricas de video de una fila. `hookRate` = reproducciones de 3s ÷ impresiones (%). */
export type VideoMetricas = { plays3s: number; thruplay: number; hookRate: number }

/** Estado de entrega de un anuncio (effective_status de Meta): ACTIVE, PAUSED, etc. */
export type EstadoAd = string | null

/** Una fila de anuncio (level=ad), con su contexto de campaña/conjunto y enriquecimientos. */
export type AdRow = Metricas & {
  ad_id: string
  ad_name: string
  adset_name: string
  campaign_id: string
  campaign_name: string
  /** Enriquecimientos (pueden faltar si su call falló): estado, diagnóstico, video. */
  status?: EstadoAd
  /** Miniatura del creativo (thumbnail_url de Meta), o null si no la trajo. */
  thumb?: string | null
  /** Link al aviso publicado (permalink de IG o historia de FB), o null. */
  permalink?: string | null
  ranking?: RankingAd | null
  video?: VideoMetricas
}

/** Un paso del embudo de compra, con cantidad y costo por resultado. */
export type FunnelPaso = { key: string; label: string; count: number; costo: number }

/** Una fila del desglose por edad × género. */
export type DemografiaFila = { age: string; gender: string; spend: number; purchases: number; revenue: number }

/** Una fila del desglose por región. */
export type RegionFila = { region: string; spend: number; purchases: number; revenue: number }

/** Una campaña con su subtotal y sus anuncios. */
/** Para qué está optimizando una campaña. Decide qué métrica tiene sentido mirarle. */
export type TipoCampaña = 'venta' | 'trafico' | 'otro'

export type Campaña = {
  id: string
  nombre: string
  /** El objetivo crudo de Meta (OUTCOME_SALES, OUTCOME_TRAFFIC…). `null` si la consulta falló. */
  objetivo?: string | null
  tipo?: TipoCampaña
  totales: Metricas
  ads: AdRow[]
}

/**
 * Resumen de las pautas de VENTA. Existe aparte de `totales` a propósito: el ROAS de la cuenta
 * mezcla campañas que ni siquiera optimizan para comprar, así que no dice lo que uno cree.
 * `null` cuando no se pudieron leer los objetivos de campaña.
 */
export type ResumenVenta = { campañas: number; spend: number; revenue: number; purchases: number; roas: number }

/** Un punto de la serie diaria. */
export type DailyPoint = { date: string; spend: number; revenue: number; purchases: number }

/** Una fila del desglose por plataforma × ubicación. */
export type Placement = { platform: string; position: string; spend: number; purchases: number; revenue: number }

// ── Etapas de la pauta (TOFU / MOFU / BOFU) ─────────────────────────────────────
// Ojo: NO confundir con `FunnelPaso`, que es el embudo TRANSACCIONAL (qué pasa con quien ya hizo
// clic). Esto es a QUIÉN le habla cada campaña. Ver `lib/meta-ads/etapas.core.js`.

/** Las tres etapas de la pauta. */
export type Etapa = 'tofu' | 'mofu' | 'bofu'
/** Una etapa, o la admisión de que no se sabe. `sin-clasificar` NO es una etapa: es su ausencia. */
export type EtapaOSin = Etapa | 'sin-clasificar'

/** Una campaña vista desde el diagnóstico de etapas: censo real, incluidas las que no gastaron. */
export type CampañaEtapa = {
  id: string
  nombre: string
  /** account_id (sin `act_`) de la cuenta que la corre. */
  cuentaId: string
  /** El objetivo crudo de Meta. `null` si no vino. */
  objetivo: string | null
  /** Etapa derivada del objetivo. El override manual la pisa, pero este valor se conserva. */
  etapaAuto: EtapaOSin
  /** `effective_status` de Meta (ACTIVE, PAUSED, …). Es lo que dice si está al aire de verdad. */
  estado: string | null
  spend: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
}

/** Cómo le va a una etapa dentro de una marca. */
export type ResumenEtapa = {
  etapa: EtapaOSin
  /** Campañas AL AIRE = activas **y** con gasto. Las dos condiciones; ver `diagnosticar`. */
  alAire: CampañaEtapa[]
  /** Activas pero sin entrega en la ventana. Dato útil aparte: no cuentan como "hay pauta". */
  sinEntrega: CampañaEtapa[]
  spend: number
  /** Porción del gasto de la marca (0-1). */
  parte: number
  estado: 'ok' | 'floja' | 'vacia'
  /** Tiene pauta al aire pero se lleva menos del piso de gasto. No cambia el veredicto, lo matiza. */
  gastoFlaco: boolean
}

/** El veredicto: una sola frase, la más urgente, sin jerga. */
export type Veredicto = {
  /** A qué etapa apunta el pedido (para preseleccionarla al anotar una idea). */
  etapa: Etapa | null
  clase: 'vacia' | 'floja' | 'ok' | 'sin-base'
  titulo: string
  detalle: string
}

/** El diagnóstico completo de una marca. */
export type Diagnostico = {
  /** Las tres etapas, siempre en orden de embudo, existan o no campañas. */
  etapas: ResumenEtapa[]
  /** Campañas cuyo objetivo Meta no supo o no conocemos: se muestran, no se reparten. */
  sinClasificar: CampañaEtapa[]
  gastoTotal: number
  /** Total de campañas al aire en la marca. */
  totalAlAire: number
  veredicto: Veredicto
}

/**
 * Línea de pauta de una campaña. **No es una `Marca` del monitor**: Stunned es una línea adentro de
 * Zattia y no tiene base propia. El porqué está en `lib/meta-ads/lineas.core.js`.
 */
export type LineaPauta = 'bdi' | 'zattia' | 'stunned'

/** Una campaña que todavía no tiene línea asignada. Es un estado real, no una falla. */
export type CampañaSinLinea = CampañaEtapa & {
  /** Lo que el nombre PARECE decir. Prellena el botón; no se guarda hasta que alguien confirma. */
  sugerida: LineaPauta | null
  /** Activa o con gasto en la ventana. Las que no, quedan plegadas: no mueven ningún diagnóstico. */
  tuvoActividad: boolean
}

/** Una asignación guardada, tal como la devuelve `?recurso=meta-funnel&que=lineas`. */
export type AsignacionLinea = {
  campaign_id: string
  linea: LineaPauta
  cuenta_id: string
  nombre: string | null
  objetivo: string | null
  linea_previa: string | null
  por: string
  updated_at: string
}

/** Lo que devuelve `/api/meta-ads?recurso=etapas`. */
export type RespuestaEtapas = {
  /** Ventana usada, en días (fija: ver `UMBRALES_ETAPA`). */
  dias: number
  /** Las cuentas publicitarias del token que se consultaron. */
  cuentas: { id: string; nombre: string }[]
  /**
   * Las campañas repartidas por línea, **con sólo las líneas que el perfil puede ver**. Una línea
   * ausente de este objeto es una que no se tiene permiso de mirar, no una vacía.
   */
  lineas: Partial<Record<LineaPauta, CampañaEtapa[]>>
  /**
   * Campañas sin línea asignada. Su plata no entra en ningún diagnóstico: nadie la hereda por
   * descarte. Las ve cualquiera con Meta Ads en alguna marca — es inevitable, porque alguien tiene
   * que poder asignarlas.
   */
  sinAsignar: CampañaSinLinea[]
}

/** El detalle completo de una cuenta. */
export type DetalleCuenta = {
  rango: PresetMetaAds | { since: string; until: string }
  cuenta: { id: string; nombre: string; moneda: string }
  totales: Metricas
  /** Solo las campañas de venta. Ver `ResumenVenta`. */
  venta: ResumenVenta | null
  /** Diagnóstico: los `action_type` que Meta devolvió en esta cuenta. Ver `RE_PERFIL` en el endpoint. */
  accionesVistas?: string[]
  /** Embudo de compra de la cuenta (clic → web → carrito → checkout → compra). */
  funnel: FunnelPaso[]
  /** Video de la cuenta (hook rate y reproducciones). */
  video: VideoMetricas
  /** Desglose por edad × género (ordenado por gasto). */
  demografia: DemografiaFila[]
  /** Desglose por región (top por gasto). */
  regiones: RegionFila[]
  campañas: Campaña[]
  daily: DailyPoint[]
  placements: Placement[]
}

/**
 * Un aviso con su creativo, para la grilla que se despliega debajo de una campaña en Etapas.
 *
 * No es `AdRow`: aquel son las métricas de un anuncio dentro del detalle de cuenta. Esto es **con
 * qué se está hablando** —la foto, el gancho, el botón—, que es lo que hace falta para pensar la
 * pieza de la etapa que falta. Las métricas van igual, pero de acompañamiento.
 */
export type AvisoCreativo = {
  id: string
  nombre: string
  /** `effective_status` del anuncio (ACTIVE, PAUSED, …), o null si Meta no lo trajo. */
  estado: string | null
  /** La imagen grande del creativo (o el póster, si es video). Null si no vino ninguna. */
  imagen: string | null
  /** La miniatura de 64 px: la única que Meta garantiza. Red por si la grande caducó. */
  thumb: string | null
  titulo: string | null
  texto: string | null
  /** El botón del aviso, ya en castellano («Comprar», «Más información»). */
  cta: string | null
  /** A dónde manda el aviso. */
  destino: string | null
  /** Las fotos de un carrusel (hasta 10). Vacío si no lo es. */
  piezas: string[]
  esVideo: boolean
  /** El aviso publicado: permalink de Instagram, o la historia de Facebook. */
  permalink: string | null
  spend: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
  /** Reproducciones de 3 s ÷ impresiones, en %. 0 si no es video o si no hubo datos. */
  hookRate: number
}

/** Lo que devuelve `/api/meta-ads?recurso=creativos&campania=<id>`. */
export type RespuestaCreativos = {
  dias: number
  ads: AvisoCreativo[]
  /**
   * Motivo por el que no se pudo traer el creativo rico (imagen grande, copy, botón), o null.
   * Cuando viene, los avisos igual se listan pero con la miniatura y sin texto: la pantalla lo dice
   * en vez de dar a entender que los avisos no tienen copy.
   */
  sinCreativo: string | null
}

// ── Diagnóstico del token: ¿se puede ESCRIBIR en Meta? ──────────────────────────

/**
 * El veredicto por cuenta. Son dos candados distintos y el punto del diagnóstico es no
 * confundirlos: el scope del token y el permiso del system user sobre esa cuenta.
 */
export type VeredictoEscritura =
  /** `user_tasks` incluye MANAGE, pero todavía no se probó a escribir (falta `?probar=1`). */
  | 'permiso-de-cuenta-ok'
  /** La escritura de prueba salió bien: esta cuenta se puede accionar. */
  | 'escribe'
  /** `user_tasks` es solo lectura, o Meta contestó (#272): falta "Administrar campañas". */
  | 'sin-permiso-de-cuenta'
  /** Meta contestó (#200): al token le falta el scope `ads_management`. */
  | 'sin-scope'
  /** (#190): el token venció o fue revocado. */
  | 'token-invalido'
  | 'rechazo-desconocido'
  | 'no-se-pudo-leer'

export type PruebaEscritura =
  | { corrida: false; motivo: string }
  | { corrida: true; ok: true; campania: string }
  | { corrida: true; ok: false; codigo: number | null; campania: string; detalle: string }

export type CuentaDiagnostico = {
  id: string
  nombre: string
  veredicto: VeredictoEscritura
  /** Sólo cuando el veredicto es `no-se-pudo-leer`. */
  detalle?: string
  /** Lo que el system user puede hacer sobre la cuenta: ANALYZE, ADVERTISE, MANAGE… */
  tareas?: string[]
  administra?: boolean
  moneda?: string
  /**
   * ⚠️ **En la unidad menor de la moneda**: en ARS, `150000` es $1.500. Hay que dividir por 100
   * al mostrar y multiplicar al escribir. Se deja crudo a propósito, para que la conversión sea
   * una decisión visible y no un `/100` perdido en el medio.
   */
  minDiarioCrudo?: number
  minDiarioAlto?: number
  /** Por qué no se pudieron leer los mínimos. Va aparte: que fallen no invalida el veredicto. */
  minimosMotivo?: string
  estadoCuenta?: number | null
  motivoBaja?: number | null
  prueba?: PruebaEscritura
}

/** Lo que devuelve `/api/meta-ads?recurso=diagnostico` (solo admin). */
export type RespuestaDiagnostico = {
  /** Scopes concedidos del token, o **null si Meta no los contestó** — que no es "ninguno". */
  scopes: string[] | null
  scopesMotivo: string | null
  puedeEscribir: boolean
  cuentas: CuentaDiagnostico[]
}

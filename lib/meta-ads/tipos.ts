/**
 * Tipos de "Meta Ads". Espejo de lo que devuelve `api/meta-ads.js` en sus dos modos:
 * overview (lista de cuentas) y detalle (una cuenta con anuncios/campañas + diaria + placements).
 */

// El nivel se importa de `acciones` en vez de repetir el union acá: es la misma verdad que la tabla
// de acciones y el `CAMPOS_LECTURA` del servidor, y escribirlo dos veces es cómo se despegan. El
// ciclo de imports es sólo de tipos, así que se borra al compilar.
import type { NivelAccion } from './acciones'

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
  /**
   * Presupuesto diario de la campaña, **en la unidad menor de la moneda** (en ARS, `1800000` es
   * $18.000). Cero cuando no lo tiene a nivel campaña.
   *
   * Que sea > 0 significa además que la campaña es **CBO**: reparte sola entre sus conjuntos, y el
   * presupuesto de los conjuntos no se puede tocar. Ver `factorMoneda()` en `acciones.core.js`.
   */
  diarioCrudo?: number
  /** Presupuesto total (lifetime), crudo. Con esto puesto, el diario se muestra pero no se edita. */
  totalCrudo?: number
  spend: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
}

/** Un conjunto de anuncios (adset) de una campaña, tal como lo devuelve `?recurso=conjuntos`. */
export type ConjuntoMeta = {
  id: string
  nombre: string
  /** `effective_status` de Meta. */
  estado: string | null
  /** Presupuesto diario, CRUDO (unidad menor de la moneda). Cero si no tiene propio. */
  diarioCrudo: number
  /** Presupuesto total, crudo. */
  totalCrudo: number
  /** Para qué optimiza el conjunto (OFFSITE_CONVERSIONS, LINK_CLICKS…). */
  objetivo: string | null
  spend: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
}

/** Lo que devuelve `/api/meta-ads?recurso=conjuntos&campania=<id>`. */
export type RespuestaConjuntos = {
  dias: number
  /**
   * La campaña tiene el presupuesto (lo que Meta llama «presupuesto de la campaña», CBO): reparte
   * sola entre sus conjuntos y el de los conjuntos no se toca. Se decide mirando al PADRE, que es
   * lo que no se puede saber mirando el conjunto.
   */
  cbo: boolean
  campania: { id: string; nombre: string; diarioCrudo: number; totalCrudo: number }
  conjuntos: ConjuntoMeta[]
  /** Por qué no se pudo leer la campaña padre. Los conjuntos igual se listan. */
  sinCampania: string | null
}

/** Cómo le va a una etapa dentro de una marca. */
export type ResumenEtapa = {
  etapa: EtapaOSin
  /** Campañas AL AIRE = activas **y** con gasto. Las dos condiciones; ver `diagnosticar`. */
  alAire: CampañaEtapa[]
  /** Activas pero sin entrega en la ventana. Dato útil aparte: no cuentan como "hay pauta". */
  sinEntrega: CampañaEtapa[]
  /**
   * Las que NO están activas. Es el complemento exacto de las otras dos: entre las tres está **toda**
   * la pauta clasificada de la línea, y ninguna campaña se cae de la pantalla.
   *
   * 🔴 Antes no existían y una campaña pausada no aparecía en ningún lado: ni acá, ni en «activas sin
   * entrega», ni en «sin asignar». O sea que era **invisible**, y de yapa no se podía reactivar —el
   * botón existía pero su fila nunca llegaba a dibujarse—. No cuentan para el veredicto: una pauta
   * apagada no es pauta al aire.
   */
  pausadas: CampañaEtapa[]
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
  /**
   * Las cuentas publicitarias del token que se consultaron. `moneda` no es adorno: Meta maneja los
   * presupuestos en la unidad MENOR de la moneda, así que sin ella no se pueden ni mostrar ni
   * escribir. Ver `factorMoneda()` en `acciones.core.js`.
   */
  cuentas: { id: string; nombre: string; moneda?: string }[]
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
  /** `user_tasks` vino con tareas y ninguna es MANAGE, o Meta contestó (#272). */
  | 'sin-permiso-de-cuenta'
  /**
   * Meta no informó `user_tasks`. **No significa que no administre**: con tokens de system user
   * suele venir vacío. Lo resuelve la prueba de escritura, una vez que el scope esté puesto.
   */
  | 'tareas-desconocidas'
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

/**
 * Cómo terminó una acción sobre la pauta.
 *
 * 🔑 **`rechazado` y `error` no son lo mismo, y confundirlos es lo peor que puede hacer esta
 * pantalla.** `rechazado` es «no se tocó nada» —un permiso, una regla, un rechazo de Meta—:
 * se puede volver a intentar sin mirar. `error` es «no sabemos cómo quedó»: Meta aceptó y la
 * relectura no confirmó, o no llegó a leerse. `en-curso` es lo mismo pero peor: la escritura se
 * cortó antes de que Meta contestara. Esas dos mandan a mirar Ads Manager antes de repetir.
 */
export type ResultadoAccionFila = 'en-curso' | 'ok' | 'rechazado' | 'error' | 'simulacro'

/** Una fila del registro de acciones, tal como la devuelve `?recurso=auditoria`. */
export type FilaAuditoria = {
  id: number
  /** ISO con zona (`timestamptz`). Se muestra en hora local. */
  cuando: string
  quien: string
  accion: string
  nivel: NivelAccion
  objetoId: string
  /** El nombre que tenía en Meta al accionar. `null` cuando el pedido murió antes de leerlo. */
  objetoNombre: string | null
  campaignId: string | null
  /** `null` en los rechazos que murieron antes de resolver la marca. Esas filas las ve cualquiera. */
  linea: LineaPauta | null
  cuentaId: string | null
  /** El valor de ANTES, leído de Meta. `null` si no se llegó a leer el objeto. */
  de: Record<string, string | number | null> | null
  /** El valor de DESPUÉS, **releído** de Meta. Nunca lo pedido; `null` si no se aplicó. */
  a: Record<string, string | number | null> | null
  /**
   * Lo que se PIDIÓ, guardado al reservar el `idem`. Es lo único que sobrevive cuando la acción no
   * llegó a aplicarse.
   *
   * ⚠️ **`null` en todo lo anterior al 6-ago-2026**: la columna se sumó después de la Tanda 1. En
   * esas filas viejas, una acción rechazada no dice qué se quiso hacer, y eso se muestra tal cual.
   */
  pedido: Record<string, string | number | null> | null
  resultado: ResultadoAccionFila
  /** El motivo, cuando no salió. Es el texto que se le contestó a quien la mandó. */
  detalle: string | null
  /** Sólo para admin: la clave de idempotencia y el cupo de escritura que iba quedando en Meta. */
  idem?: string
  uso?: string | null
}

/** Lo que devuelve `/api/meta-ads?recurso=auditoria`. */
export type RespuestaAuditoria = {
  filas: FilaAuditoria[]
  /** Hay más filas de las que entraron en `limite`. La pantalla lo dice en vez de mentir un total. */
  hayMas: boolean
  limite: number
  /**
   * `cuenta_id → moneda`, para poder mostrar los presupuestos: se guardan crudos, en la unidad menor
   * de la moneda. Enriquecimiento **aislado**: si Meta no contestó viene vacío y el monto se muestra
   * crudo, pero el registro se lee igual.
   */
  monedas: Record<string, string>
  monedasMotivo: string | null
}

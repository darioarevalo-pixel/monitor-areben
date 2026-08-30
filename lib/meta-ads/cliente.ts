/**
 * Acceso al endpoint propio `/api/meta-ads` (métricas de Meta Ads). Usa `apiFetch`
 * para mandar el header `x-monitor-auth` (el endpoint exige usuario logueado).
 *
 * Distingue "no se pudo leer" de "se leyó": una respuesta OK con cuentas/anuncios
 * vacíos es un éxito; solo `{ok:false}` significa que ni siquiera se pudo consultar
 * (token faltante, red, etc.).
 */

import { apiFetch } from '../api-fetch'
import type { BandaHoy } from './parte'
import type { PedidoAccion, ResultadoAccion } from './acciones'
import type { MarcaFavorito, PiezaAviso, RespuestaBiblioteca } from './biblioteca'
import type { AvanceDePlan, Plan } from './planes'
import type { Candidato, MotivoPoda } from './podado'
import type { CeldaViva } from './rendimiento'
import type { RangoUI } from './rango'
import type { DecisionVista, RespuestaDecisiones } from './decisiones'
import type { Informe, InformeResumen, RespuestaInforme, RespuestaInformes } from './informes'
import type { Calibracion, ClavePreset, ClaveUmbral, Hallazgo, Regla, RespuestaReglas } from './reglas'
import type { RespuestaTendencia } from './tendencia'
import type { RespuestaZona } from './rendimiento'
import type { RespuestaPublicos } from './publicos'

/** Lo que contesta `?recurso=parte`: el texto listo para copiar y qué no se pudo leer. */
/**
 * El parte, en sus dos formas y de una sola llamada: `texto` es el que se copia y se pega en una
 * conversación; `banda` es **la misma verdad en objeto**, para que la pantalla la dibuje en vez de
 * mostrar un `<pre>`. ⛔ No son dos consultas ni dos agregaciones: salen de las mismas cinco
 * llamadas a Graph y de las mismas funciones puras.
 */
/** Las caras de una cuenta. `motivo` con `piezas` cargadas = están las fotos chicas pero no el copy. */
export type RespuestaPiezas = { ok: true; piezas: Record<string, PiezaAviso>; motivo: string | null }

export type RespuestaParte = {
  ok: true
  texto: string
  banda: BandaHoy
  /**
   * El día en curso y el anterior, **por conjunto**. Sale de las mismas filas de aviso que la banda
   * —`level=ad` trae `adset_id`— así que ⛔ no cuesta una llamada más. Es lo único que la foto diaria
   * ⛔ no puede tener, y lo que deja a la zona ofrecer «Hoy» y «Hoy y ayer».
   */
  vivas: { hoy: CeldaViva[]; ayer: CeldaViva[] }
  fechas: { hoy: string; ayer: string; leido: string }
  faltantes: string[]
}
import type {
  DetalleCuenta, PresetMetaAds, RespuestaAuditoria, RespuestaConjuntos, RespuestaCreativos,
  RespuestaCuentas, RespuestaDiagnostico, RespuestaEtapas, RespuestaMejoras, RespuestaOverview,
} from './tipos'

export type Lectura<T> = { ok: true; dato: T } | { ok: false; motivo: string }

export type OpcionesMetaAds =
  | { preset: PresetMetaAds }
  | { since: string; until: string }

function rangoQS(opts: OpcionesMetaAds): URLSearchParams {
  const p = new URLSearchParams()
  if ('since' in opts) {
    p.set('since', opts.since)
    p.set('until', opts.until)
  } else {
    p.set('preset', opts.preset)
  }
  return p
}

async function pedir<T>(qs: URLSearchParams): Promise<Lectura<T>> {
  try {
    const r = await apiFetch(`/api/meta-ads?${qs.toString()}`)
    let d: (T & { ok?: boolean }) | { ok?: boolean; error?: unknown } | null = null
    try {
      d = await r.json()
    } catch {
      return { ok: false, motivo: `respuesta no-JSON (HTTP ${r.status})` }
    }
    if (!r.ok || !d || (d as { ok?: boolean }).ok !== true) {
      const err = (d as { error?: unknown })?.error
      // `detalle` trae el mensaje REAL de Meta (ej. token vencido). El endpoint lo
      // devuelve pero antes se descartaba, así que el error se veía genérico.
      const detalle = (d as { detalle?: unknown })?.detalle
      const extra = detalle ? ` — ${String(detalle).slice(0, 200)}` : ''
      return { ok: false, motivo: `HTTP ${r.status}: ${String(err ?? '').slice(0, 150)}${extra}` }
    }
    return { ok: true, dato: d as T }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/** Overview: las cuentas del token con su total (para el selector). */
export function traerOverview(opts: OpcionesMetaAds): Promise<Lectura<RespuestaOverview>> {
  return pedir<RespuestaOverview>(rangoQS(opts))
}

/** Detalle de una cuenta: totales + campañas/anuncios + serie diaria + placements. */
export function traerDetalleCuenta(accountId: string, opts: OpcionesMetaAds): Promise<Lectura<DetalleCuenta>> {
  const qs = rangoQS(opts)
  qs.set('account', accountId)
  return pedir<DetalleCuenta>(qs)
}

/**
 * El eje de la sección: las cuentas del token con su moneda, su zona, cuántas campañas tienen y qué
 * líneas de pauta viven adentro.
 *
 * 🔑 **No pide insights.** Es lo que llena el selector, y para elegir no hace falta el gasto — que
 * es justo lo caro de Graph. El `overview` sigue existiendo para la pantalla que muestra números.
 */
export function traerCuentas(): Promise<Lectura<RespuestaCuentas>> {
  return pedir<RespuestaCuentas>(new URLSearchParams({ recurso: 'cuentas' }))
}

/**
 * Censo de campañas para el diagnóstico de etapas (TOFU/MOFU/BOFU), repartido por línea de pauta.
 *
 * **No lleva marca**: las tres líneas se pautean desde la misma cuenta publicitaria, así que el
 * censo que hay que pedirle a Meta es idéntico para las tres y pedirlo una vez por marca sería
 * triplicar el gasto de Graph para cortar los mismos datos. El servidor devuelve sólo las líneas que
 * el perfil puede ver, así que el corte de permisos sigue siendo suyo, no de la pantalla.
 *
 * La ventana es fija (30 o 90 días, ver `UMBRALES_ETAPA`) y por eso no toma el rango del selector
 * del Resumen.
 */
export function traerEtapas(dias?: number): Promise<Lectura<RespuestaEtapas>> {
  const qs = new URLSearchParams({ recurso: 'etapas' })
  if (dias) qs.set('dias', String(dias))
  return pedir<RespuestaEtapas>(qs)
}

/**
 * Los avisos de UNA campaña, con su creativo: la imagen, el título, el texto y el botón.
 *
 * Va por campaña y a demanda —cuando alguien despliega la fila—, no junto con el censo: son tres
 * llamadas a Graph por campaña, y el censo lista más de 170. La ventana es la misma del censo,
 * porque el gasto de cada aviso se lee al lado del de su campaña y con otra ventana no cerrarían.
 */
export function traerCreativos(campaignId: string, dias?: number): Promise<Lectura<RespuestaCreativos>> {
  const qs = new URLSearchParams({ recurso: 'creativos', campania: campaignId })
  if (dias) qs.set('dias', String(dias))
  return pedir<RespuestaCreativos>(qs)
}

/**
 * ¿El token puede escribir en Meta? Solo admin.
 *
 * Sin `probar` contesta lo que se puede saber sin tocar nada (`user_tasks` por cuenta y los
 * scopes, si Meta los da). Con `probar` hace además una **escritura idempotente** —pisar el
 * nombre de una campaña con el que ya tiene— que es la única forma de distinguir "falta el scope
 * `ads_management`" de "falta el permiso de la cuenta", porque los dos fallan igual desde afuera.
 */
export function traerDiagnostico(probar = false): Promise<Lectura<RespuestaDiagnostico>> {
  const qs = new URLSearchParams({ recurso: 'diagnostico' })
  if (probar) qs.set('probar', '1')
  return pedir<RespuestaDiagnostico>(qs)
}

/**
 * Los conjuntos de UNA campaña, con su presupuesto, su estado y su gasto.
 *
 * A demanda al desplegar la fila, igual que los creativos: el censo lista más de 170 campañas.
 * Es también el modo que dice si la campaña es **CBO** —si tiene el presupuesto a nivel campaña—,
 * que es lo único que no se puede saber mirando el conjunto.
 */
export function traerConjuntos(campaignId: string, dias?: number): Promise<Lectura<RespuestaConjuntos>> {
  const qs = new URLSearchParams({ recurso: 'conjuntos', campania: campaignId })
  if (dias) qs.set('dias', String(dias))
  return pedir<RespuestaConjuntos>(qs)
}

/**
 * Cuáles avisos de una campaña llevan el campo de «mejoras estándar» que Meta deprecó.
 *
 * Se pide **al abrir el modal de duplicar**, que es el momento en que la respuesta cambia una
 * decisión: con un solo aviso que lo lleve, Meta rechaza la copia entera, y sin preguntar eso se
 * descubre gastando una escritura de cupo. No se pide al desplegar una fila —sería un viaje a Meta
 * por cada campaña que alguien mire— ni junto al censo.
 *
 * Va por campaña porque así lo contesta Graph; el corte por conjunto lo hace el servidor.
 */
export function traerMejoras(campaignId: string): Promise<Lectura<RespuestaMejoras>> {
  return pedir<RespuestaMejoras>(new URLSearchParams({ recurso: 'mejoras', campania: campaignId }))
}

/**
 * **Quién accionó sobre la pauta**: el registro de `meta_ads_accion`, de lo más nuevo a lo más viejo.
 *
 * Es la única lectura de Meta Ads que **no habla con Meta para contestar** —sale de la base—, así que
 * se puede mirar aunque Graph esté caído. Lo único que pide allá son las monedas de las cuentas, para
 * poder mostrar los presupuestos, y va como enriquecimiento aislado.
 *
 * Sin `campania` trae todo lo que este perfil puede ver; con ella, el historial de esa campaña sola
 * (el índice de la tabla está puesto para esas dos consultas y no para otra).
 */
export function traerAuditoria(opts: { campania?: string; limite?: number } = {}): Promise<Lectura<RespuestaAuditoria>> {
  const qs = new URLSearchParams({ recurso: 'auditoria' })
  if (opts.campania) qs.set('campania', opts.campania)
  if (opts.limite) qs.set('limite', String(opts.limite))
  return pedir<RespuestaAuditoria>(qs)
}

/**
 * **Escribe en Meta.** El único camino de escritura del monitor: pausar/activar y cambiar el
 * presupuesto, a nivel campaña, conjunto o aviso.
 *
 * Lo que se manda es sólo la intención; el servidor lee el objeto, verifica el nivel, resuelve de
 * qué marca es la campaña, chequea el permiso EN ESA MARCA y recién ahí escribe —y después relee
 * para confirmar que quedó puesto—. Ver `api/_meta-acciones.js`.
 *
 * El `idem` va en el pedido y lo genera la pantalla **al apretar el botón** (`nuevoIdem()`): es lo
 * que hace que un doble clic no se convierta en dos escrituras.
 *
 * `sinLinea` en la respuesta de error distingue el 409 de «esta campaña no tiene marca» de
 * cualquier otro rechazo: es el único que se arregla asignándola, y por eso la pantalla le pone un
 * botón en vez de un cartel rojo.
 */
export type FalloAccion = {
  ok: false
  motivo: string
  sinLinea?: boolean
  campaignId?: string
  /**
   * Duplicar se cortó por tiempo: **la copia puede existir igual** y hay que ir a buscarla por su
   * sufijo (`reconciliarCopia`). No es un error que se arregle reintentando —reintentar haría dos
   * copias— y medido el 8-ago-2026 es el camino NORMAL cuando lo que se copia tiene avisos.
   */
  puedeExistir?: boolean
  /** El nombre con el que se la puede encontrar, ya recortado. */
  sufijo?: string
}

export async function accionarMeta(pedido: PedidoAccion): Promise<{ ok: true; dato: ResultadoAccion } | FalloAccion> {
  try {
    const r = await apiFetch('/api/meta-ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido),
    })
    let d: (Partial<ResultadoAccion> & {
      ok?: boolean; error?: unknown; detalle?: unknown; sinLinea?: boolean; campaignId?: string
      puedeExistir?: boolean; sufijo?: string
    }) | null = null
    try {
      d = await r.json()
    } catch {
      return { ok: false, motivo: `respuesta no-JSON (HTTP ${r.status})` }
    }
    if (!r.ok || !d || d.ok !== true) {
      // `detalle` trae el mensaje REAL de Meta (`error_user_msg` cuando lo hay). El error de arriba
      // es el nuestro, en castellano; el de abajo es el que sirve para entender qué pasó allá.
      const extra = d?.detalle ? ` — ${String(d.detalle).slice(0, 200)}` : ''
      return {
        ok: false,
        motivo: `${String(d?.error ?? `HTTP ${r.status}`).slice(0, 200)}${extra}`,
        sinLinea: d?.sinLinea,
        campaignId: d?.campaignId,
        puedeExistir: d?.puedeExistir,
        sufijo: d?.sufijo,
      }
    }
    return { ok: true, dato: d as ResultadoAccion }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/** Lo que contesta la reconciliación: la copia apareció, no apareció (todavía), o no se pudo mirar. */
export type Reconciliacion =
  | { ok: true; encontrada: true; copia: CopiaEncontrada }
  | { ok: true; encontrada: false; motivo: string }
  | { ok: false; motivo: string }

export type CopiaEncontrada = {
  id: string
  nombre: string
  /** El `status` de Meta. Siempre `PAUSED` si la copia salió como se pidió. */
  estado: string
  /** El `effective_status`, sólo si dice algo distinto (`IN_PROCESS`). */
  efectivo: string | null
  conLinea: boolean
}

/**
 * **¿La copia que quedó sin confirmar existe?** Se le pregunta al servidor por el `idem` de la
 * duplicación que se cortó.
 *
 * ⚠️ **No es un reintento y no puede crear una segunda copia**: el servidor sólo LEE los hijos del
 * padre buscando el sufijo único que anotó antes de llamar a Meta. Duplicar no es reintentable;
 * esto es la otra mitad de esa decisión — la que permite no reintentar.
 */
export async function reconciliarCopia(idem: string): Promise<Reconciliacion> {
  try {
    const r = await apiFetch('/api/meta-ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reconciliar: idem }),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d || d.ok !== true) {
      return { ok: false, motivo: String(d?.error ?? `HTTP ${r.status}`).slice(0, 200) }
    }
    if (!d.encontrada || !d.copia) return { ok: true, encontrada: false, motivo: String(d.motivo || '') }
    return { ok: true, encontrada: true, copia: d.copia as CopiaEncontrada }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

// ── Planes por pasos ──────────────────────────────────────────────────────────────────────────

/**
 * Los planes vivos —pendientes, en curso y atascados— de las líneas que este perfil puede ver.
 *
 * Como la auditoría, **sale de la base y no habla con Meta**: se puede mirar aunque Graph esté
 * caído, que es justo cuando importa saber qué quedó a medias. Con `estado: 'todos'` trae también
 * los terminados y los cancelados, que es lo que mira el Registro.
 */
export function traerPlanes(estado?: 'todos'): Promise<Lectura<{ planes: Plan[] }>> {
  const qs = new URLSearchParams({ recurso: 'planes' })
  if (estado) qs.set('estado', estado)
  return pedir<{ planes: Plan[] }>(qs)
}

export function traerPlan(id: number): Promise<Lectura<{ plan: Plan }>> {
  return pedir<{ plan: Plan }>(new URLSearchParams({ recurso: 'plan', id: String(id) }))
}

/** Lo que hace falta para dibujar una escalada: el techo de la marca, y qué umbral falta si falta. */
export type ContextoEscalada = {
  techoCrudo: number
  roasObjetivo: number
  diasSeguidos: number
  faltan: ClaveUmbral[]
  motivo: string | null
}

/**
 * 🔑 El techo sale del servidor y **no se tipea en el modal**: un techo que se elige al armar el
 * plan es un techo que se puede subir eligiendo otro número, y entonces no frena nada. Viene de la
 * misma tabla con la que después se va a decidir cada escalón.
 */
export function traerContextoEscalada(linea: string): Promise<Lectura<ContextoEscalada>> {
  return pedir<ContextoEscalada>(new URLSearchParams({ recurso: 'escalada', linea }))
}

/** La lista de candidatos a poda, medida en el servidor. */
export type ContextoPoda = {
  motivo: MotivoPoda
  hasta: string
  puede: boolean
  faltan: ClaveUmbral[]
  detalle: string | null
  candidatos: Candidato[]
  gastoMinimo: number
  roasObjetivo: number
}

/**
 * 🔑 **La lista la mide el servidor, no el browser.** Es la misma función que después usa el
 * guardarraíl de cada paso: si se armara acá con otra fuente, el modal podría ofrecer cinco y el
 * motor saltear tres, y eso se lee como que la herramienta está rota.
 *
 * ⚠️ Y no es una promesa: entre que se dibuja y que se aprieta pueden pasar minutos, y en esos
 * minutos Meta puede atribuir una compra. El servidor vuelve a medir al armar el plan, y cada paso
 * vuelve a preguntar.
 */
export function traerCandidatosAPodar(linea: string, motivo: MotivoPoda = 'sin-ventas'): Promise<Lectura<ContextoPoda>> {
  return pedir<ContextoPoda>(new URLSearchParams({ recurso: 'poda', linea, motivo }))
}

async function postPlan<T>(cuerpo: Record<string, unknown>): Promise<Lectura<T>> {
  try {
    const r = await apiFetch('/api/meta-ads?recurso=plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d || d.ok !== true) {
      const extra = d?.detalle ? ` — ${String(d.detalle).slice(0, 200)}` : ''
      return { ok: false, motivo: `${String(d?.error ?? `HTTP ${r.status}`).slice(0, 200)}${extra}` }
    }
    return { ok: true, dato: d as T }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Arma un plan. **No escribe en Meta**: lo persiste con sus pasos para que se pueda leer antes de
 * ejecutarlo, que es la mitad del valor de tener un plan.
 *
 * El `idem` lo genera la pantalla al apretar el botón (`nuevoIdemPlan()`), igual que en una acción
 * suelta y por el mismo motivo: generarlo al mandar haría dos claves con un doble clic. Y acá pesa
 * más, porque el **marcador** —con el que la sonda encuentra lo que el plan creó— se deriva de él.
 */
export function crearPlan(cuerpo: Record<string, unknown>): Promise<Lectura<{ plan: Plan; repetido?: boolean }>> {
  return postPlan<{ plan: Plan; repetido?: boolean }>({ accion: 'crear', ...cuerpo })
}

/**
 * Ejecuta los pasos que entren en el tiempo del request y devuelve cómo quedó.
 *
 * 🔑 **`seguir` es «volvé a llamarme», no «terminó mal»**, y con `pausa` el que vuelve no tiene que
 * ser el bucle: significa que quedan pasos pero que el freno lo arregla el tiempo (Meta armando la
 * copia, una llamada cortada), así que volver enseguida gasta llamadas para recibir el mismo
 * «todavía no».
 */
export function avanzarPlan(id: number): Promise<Lectura<AvanceDePlan>> {
  return postPlan<AvanceDePlan>({ accion: 'avanzar', id })
}

/**
 * **«Ya arreglé lo que Meta pedía, mandá ese paso de nuevo.»** Lo que ya salió no se rehace.
 *
 * ⚠️ Sólo alcanza a los pasos que el servidor marcó `puedeReintentar`, y esa marca se pone
 * únicamente cuando **Meta contestó que no** —un rechazo determinístico que no creó nada—. El corte
 * sin respuesta no llega nunca acá: ése lo resuelve la sonda, que lee y adopta.
 */
export function reintentarPaso(id: number, orden: number): Promise<Lectura<{ plan: Plan }>> {
  return postPlan<{ plan: Plan }>({ accion: 'reintentar', id, orden })
}

/**
 * ⚠️ **Cancelar no deshace: deja de avanzar.** Lo que el plan ya creó sigue en Meta —pausado, porque
 * todo nace PAUSED— y lo que ya movió de presupuesto sigue movido. `hechosAntes` es cuántos pasos
 * habían corrido, para poder decirlo con un número en vez de con un «puede que algo haya quedado».
 */
export function cancelarPlan(id: number): Promise<Lectura<{ plan: Plan; hechosAntes: number }>> {
  return postPlan<{ plan: Plan; hechosAntes: number }>({ accion: 'cancelar', id })
}

/**
 * Pausa o activa un anuncio. Envoltorio de `accionarMeta` para no tocar al llamador del Resumen.
 *
 * ⚠️ Ya **no** es un camino propio: el gate viejo era un booleano global (`.some()` sobre las dos
 * marcas, sin mirar de quién era la campaña) y con las tres líneas en una sola cuenta eso alcanzaba
 * para que alguien de una marca pausara la pauta de otra. Ahora pasa por el mismo guard que el
 * resto, incluido el 409 de «esta campaña todavía no tiene marca».
 */
export async function pausarAnuncio(
  adId: string,
  status: 'ACTIVE' | 'PAUSED',
  idem: string,
): Promise<Lectura<{ status: string }>> {
  const r = await accionarMeta({ accion: 'estado', nivel: 'aviso', objetoId: adId, campos: { status }, idem })
  if (!r.ok) return { ok: false, motivo: r.motivo }
  return { ok: true, dato: { status: String(r.dato.quedo?.status ?? status) } }
}

// ── Automatizaciones ──────────────────────────────────────────────────────────────────────────

/**
 * Las reglas, los umbrales y el contexto medido de cada línea.
 *
 * Como los planes y la auditoría, **sale de la base y no habla con Meta**: las automatizaciones
 * leen la foto diaria, así que la pantalla abre aunque Graph esté caído o el token vencido.
 *
 * El `contexto` viene calculado del lado del servidor a propósito: sale de las mismas 90 días de
 * filas que ya se leyeron para todo lo demás, y mandarlas al browser serían megabytes.
 */
export function traerReglas(): Promise<Lectura<RespuestaReglas>> {
  return pedir<RespuestaReglas>(new URLSearchParams({ recurso: 'reglas' }))
}

/**
 * Lo que detectaron las reglas. **Uno por objeto, el más reciente**, con `veces` diciendo cuántos
 * días seguidos lleva: la lista completa está en el historial de la regla, y lo que hay que decidir
 * es una cosa por objeto.
 */
export function traerHallazgos(estado?: 'todos' | 'nuevo' | 'accionado' | 'ignorado', regla?: number): Promise<Lectura<{ hallazgos: Hallazgo[] }>> {
  const qs = new URLSearchParams({ recurso: 'hallazgos' })
  if (estado) qs.set('estado', estado)
  if (regla) qs.set('regla', String(regla))
  return pedir<{ hallazgos: Hallazgo[] }>(qs)
}

/**
 * Las decisiones humanas sobre la pauta, y los objetos contra los que se puede anotar una nueva.
 *
 * ⚠️ El literal `recurso: 'decisiones'` de acá abajo es lo que hace fallar a
 * `tests/meta-ads-despacho.test.ts` si alguien olvida sumar la palabra en el despacho de
 * `api/meta-ads.js`. Es el único freno contra el bug que ya llegó a prod con `poda`: un recurso que
 * no figura en el despacho no falla ruidosamente, contesta otra cosa.
 */
export function traerDecisiones(): Promise<Lectura<RespuestaDecisiones>> {
  return pedir<RespuestaDecisiones>(new URLSearchParams({ recurso: 'decisiones' }))
}

/**
 * Anota una decisión con su motivo. Devuelve además cuántos hallazgos vivos quedaron resueltos: la
 * decisión apaga lo que ya estaba gritando, no sólo lo que vendría.
 */
export function guardarDecision(cuerpo: {
  linea: string
  clase?: 'silencio' | 'nota'
  fecha?: string
  nivel?: string
  objetoId?: string | null
  objetoNombre?: string | null
  cuentaId?: string | null
  accionTomada?: string
  motivo: string
  preset?: string | null
  vence?: string | null
  hallazgoId?: number | null
}): Promise<Lectura<{ decision: DecisionVista; hallazgosResueltos: number }>> {
  return postRegla<{ decision: DecisionVista; hallazgosResueltos: number }>({ accion: 'decidir', ...cuerpo })
}

/** Deja de callar, y conserva el motivo: por qué se decidió y por qué se dejó de sostener van juntos. */
export function revocarDecision(id: number): Promise<Lectura<{ decision: DecisionVista }>> {
  return postRegla<{ decision: DecisionVista }>({ accion: 'revocar', id })
}

async function postRegla<T>(cuerpo: Record<string, unknown>): Promise<Lectura<T>> {
  try {
    const r = await apiFetch('/api/meta-ads?recurso=regla', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d || d.ok !== true) {
      const extra = d?.detalle ? ` — ${String(d.detalle).slice(0, 200)}` : ''
      return { ok: false, motivo: `${String(d?.error ?? `HTTP ${r.status}`).slice(0, 200)}${extra}` }
    }
    return { ok: true, dato: d as T }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/** Crea o actualiza la regla de un preset en una marca. Hay una sola por (preset, línea). */
export function guardarRegla(cuerpo: {
  preset: ClavePreset
  linea: string
  cuentaId?: string | null
  parametros?: Partial<Record<ClaveUmbral, number>>
  activa: boolean
}): Promise<Lectura<{ regla: Regla }>> {
  return postRegla<{ regla: Regla }>({ accion: 'guardar', ...cuerpo })
}

/**
 * Los umbrales de una marca.
 *
 * ⚠️ Manda el objeto ENTERO: lo que no venga se guarda en `null`. Es lo que permite BORRAR un
 * umbral desde la pantalla — con un `PATCH` parcial, vaciar el campo no vaciaría nada y la regla
 * seguiría corriendo con un número que la persona cree que sacó.
 */
export function guardarUmbrales(linea: string, umbrales: Partial<Record<ClaveUmbral, number | ''>>): Promise<Lectura<{ umbral: unknown }>> {
  return postRegla<{ umbral: unknown }>({ accion: 'umbrales', linea, umbrales })
}

/**
 * 🎯 El calibrador: qué habría hecho este preset en los últimos 90 días con estos umbrales.
 *
 * No guarda nada y no necesita que la regla exista: la gracia es poder mover el dial ANTES de
 * crearla. Pide sólo ver la línea, no editarla — mirar qué pasaría no cambia nada.
 */
export function calibrarRegla(cuerpo: {
  preset: ClavePreset
  linea: string
  cuentaId?: string | null
  parametros?: Partial<Record<ClaveUmbral, number>>
}): Promise<Lectura<Calibracion & { ok: true }>> {
  return postRegla<Calibracion & { ok: true }>({ accion: 'calibrar', ...cuerpo })
}

/**
 * Marca un hallazgo como accionado o ignorado.
 *
 * ⚠️ **No ejecuta nada.** Para accionar hay que llamar antes a `accionarMeta`, que es el camino que
 * ya tiene el permiso, el `idem`, la relectura y el registro. Esto sólo mueve el estado, y va
 * DESPUÉS: si falla, la acción igual pasó y el hallazgo se vuelve a proponer, que es la dirección
 * barata del error.
 */
export function resolverHallazgo(id: number, estado: 'accionado' | 'ignorado'): Promise<Lectura<Record<string, never>>> {
  return postRegla<Record<string, never>>({ accion: 'resolver', id, estado })
}

// ── Biblioteca de anuncios ─────────────────────────────────────────────────────────────────────

/**
 * Todos los avisos de todas las cuentas que ve el perfil, con sus números y su pieza.
 *
 * **No lleva cuenta ni línea**: el corte por permiso lo hace el servidor y el de la pantalla se hace
 * en el browser, sobre la lista completa. Son ~60 avisos: pedirle al servidor cada cambio de filtro
 * sería un viaje por click para algo que se resuelve en un `filter`.
 *
 * 🔑 **La mitad de la base sobrevive sola**: si Meta no contesta, `avisos` viene igual con todos los
 * números y `sinPiezas` dice por qué no hay fotos. Un `{ok:false}` acá significa que no se pudo leer
 * ni la foto diaria, que es lo único que deja la pantalla sin nada que mostrar.
 */
export function traerBiblioteca(rango: RangoUI): Promise<Lectura<RespuestaBiblioteca>> {
  return pedir<RespuestaBiblioteca>(new URLSearchParams({ recurso: 'biblioteca', rango }))
}

/**
 * Sólo las CARAS de una cuenta, indexadas por id de aviso.
 *
 * La usa la zona de Rendimiento al abrir una celda: los avisos y sus números ya salieron de la foto
 * —gratis—, y esto les pone la imagen, el formato y el estado VIVO, que es lo único que la foto ⛔ no
 * puede tener.
 *
 * 🔑 **`{ok:true}` con `piezas: {}` y un `motivo` es la respuesta normal cuando Meta no contesta**,
 * ⛔ no un error: los avisos igual se dibujan con sus números y la fila dice por qué no hay cara.
 *
 * @param avisos ids que tienen prioridad en el rescate de miniaturas (el tope de Meta son 50).
 *   ⛔ No recorta lo que vuelve ni decide permisos.
 */
export function traerPiezas(cuenta: string, avisos?: string[]): Promise<Lectura<RespuestaPiezas>> {
  const p = new URLSearchParams({ recurso: 'piezas', cuenta })
  if (avisos && avisos.length) p.set('avisos', avisos.join(','))
  return pedir<RespuestaPiezas>(p)
}

/**
 * «Cómo viene»: la ventana actual contra la anterior, del Panel.
 *
 * 🔑 **Sale de la foto diaria, no de Graph.** Por eso contesta aunque el token esté vencido, y por
 * eso sus números pueden diferir unos pesos de los del censo que está al lado: Meta reatribuye hacia
 * atrás unos días y la foto de un día viejo es la que se leyó, no la de hoy.
 *
 * `dias` son los mismos dos del selector del Panel (30 o 90). El servidor no cree cualquier número.
 */
export function traerTendencia(dias: number): Promise<Lectura<RespuestaTendencia>> {
  return pedir<RespuestaTendencia>(new URLSearchParams({ recurso: 'tendencia', dias: String(dias) }))
}

/**
 * LA ZONA DE RENDIMIENTO de una línea: una fila por celda con su veredicto, más el cruce contra los
 * pedidos reales de la tienda.
 *
 * 🔑 **Sale de la FOTO y no de Graph, y por eso ésta SÍ se puede pedir sola al entrar.** Es la
 * diferencia con `traerParte()`, que son cinco llamadas a Meta y cupo gastado: aquél es un botón,
 * esto es la pantalla. Lo que la foto no tiene es el día EN CURSO, y para eso sigue estando el
 * parte.
 *
 * `dias` son los de `DIAS_SERVIBLES` (1, 3, 7, 14 o 30). El servidor ⛔ no cree cualquier número: 400
 * nombrando los que acepta, en vez de caer a un default en silencio.
 */
/**
 * @param hasta ancla la ventana a un día ya CERRADO (`AAAA-MM-DD`). Es a lo que se llega clickeando
 *   un día en la tira. ⛔ Un `hasta` posterior al último cerrado devuelve 400 con el motivo, ⛔ no un
 *   recorte silencioso: medio día dibujado como entero es el defecto original de esta sección.
 */
/**
 * **Fría vs remarketing**: cuánta de la plata de una línea le compra a gente que ya nos conocía.
 *
 * ⚠️ Es el único recurso de LECTURA que necesita el token: el público vive en el `targeting` de cada
 * conjunto y la foto ⛔ no lo guarda. Con Graph caído contesta igual, con `clasificado: false`, el
 * gasto de la ventana y el motivo — así que quien la llama ⛔ no tiene que tratarlo como un error.
 */
export function traerPublicos(linea: string, dias?: number): Promise<Lectura<RespuestaPublicos>> {
  const p = new URLSearchParams({ recurso: 'publicos', linea })
  if (dias) p.set('dias', String(dias))
  return pedir<RespuestaPublicos>(p)
}

export function traerZona(linea: string, dias?: number, hasta?: string): Promise<Lectura<RespuestaZona>> {
  const p = new URLSearchParams({ recurso: 'rendimiento', linea })
  if (dias) p.set('dias', String(dias))
  if (hasta) p.set('hasta', hasta)
  return pedir<RespuestaZona>(p)
}

/**
 * El PARTE DEL DÍA: todo lo que hace falta para decidir presupuestos, en un texto plano.
 *
 * 🔑 **Devuelve texto y no un objeto a propósito.** El destino de esto es el portapapeles: se pega
 * en un chat o en una nota y ahí tiene que poder leerse tal cual, ya agregado por conjunto, ya
 * comparado contra ayer y ya juzgado contra el techo. Armar la tabla del lado del navegador
 * obligaría a mantener dos formatos del mismo parte.
 *
 * `faltantes` dice qué bloque no se pudo leer. Un bloque vacío por una falla se ve igual que uno
 * vacío porque no hubo nada, y esa es la diferencia entre un día flojo y un dato roto.
 */
export function traerParte(account: string, linea?: string): Promise<Lectura<RespuestaParte>> {
  const p = new URLSearchParams({ recurso: 'parte', account })
  if (linea) p.set('linea', linea)
  return pedir<RespuestaParte>(p)
}

/**
 * Marca o desmarca una pieza. **No toca Meta**: por eso no pide ningún sub-permiso de accionar
 * sobre la pauta, sólo poder ver la línea del aviso.
 */
export async function marcarFavorito(objetoId: string, marcar: boolean): Promise<Lectura<{ favorito: MarcaFavorito | null }>> {
  try {
    const r = await apiFetch('/api/meta-ads?recurso=favorito', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objetoId, marcar }),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d || d.ok !== true) {
      return { ok: false, motivo: String(d?.error ?? `HTTP ${r.status}`).slice(0, 200) }
    }
    return { ok: true, dato: { favorito: (d.favorito as MarcaFavorito | null) ?? null } }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

// ── Informes del analista ─────────────────────────────────────────────────────────────────────

/**
 * El historial de informes. **Sin el HTML**: son ~40 KB cada uno y la lista sólo necesita la fecha,
 * la marca, el título y el resumen. El cuerpo viaja recién al abrir uno.
 *
 * ⚠️ El literal `recurso: 'informes'` de acá abajo es lo que hace fallar a
 * `tests/meta-ads-despacho.test.ts` si alguien olvida sumar la palabra en el despacho de
 * `api/meta-ads.js`. Ver el comentario de `traerDecisiones()`: es el freno contra el bug que ya
 * llegó a prod con `poda`, donde el módulo entero era inalcanzable con el CI en verde.
 */
export function traerInformes(linea?: string): Promise<Lectura<RespuestaInformes>> {
  const qs = new URLSearchParams({ recurso: 'informes' })
  if (linea) qs.set('linea', linea)
  return pedir<RespuestaInformes>(qs)
}

/** Un informe con su cuerpo, para dibujarlo. */
export function traerInforme(id: number): Promise<Lectura<RespuestaInforme>> {
  return pedir<RespuestaInforme>(new URLSearchParams({ recurso: 'informe', id: String(id) }))
}

/**
 * Publica un informe o lo devuelve a borrador. Es un acto aparte del guardado a propósito: corregir
 * una coma no puede mandarle un informe al equipo, ni sacar de circulación uno ya publicado.
 */
export function publicarInforme(id: number, publicado: boolean): Promise<Lectura<{ informe: InformeResumen }>> {
  return postInforme<{ informe: InformeResumen }>({ accion: 'publicar', id, publicado })
}

/** Borra un informe. Es para el que se subió por error: uno viejo se despublica, no se borra. */
export function borrarInforme(id: number): Promise<Lectura<{ borrado: number }>> {
  return postInforme<{ borrado: number }>({ accion: 'eliminar', id })
}

/**
 * Sube o corrige un informe. Lo usa el script del analista; la pantalla sólo publica y borra.
 *
 * `pisar` es explícito porque la clave es `(fecha, línea)` y el historial vale por no pisarse: sin
 * él, volver a subir la misma fecha contesta 409 diciendo cuál es el que ya está.
 */
export function guardarInforme(cuerpo: {
  fecha: string
  linea: string
  titulo: string
  resumen?: string
  html: string
  pisar?: boolean
}): Promise<Lectura<{ informe: Informe; reemplazo: boolean; avisos: string[] }>> {
  return postInforme<{ informe: Informe; reemplazo: boolean; avisos: string[] }>({ accion: 'guardar', ...cuerpo })
}

async function postInforme<T>(cuerpo: Record<string, unknown>): Promise<Lectura<T>> {
  try {
    const r = await apiFetch('/api/meta-ads?recurso=informe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d || d.ok !== true) {
      const extra = d?.detalle ? ` — ${String(d.detalle).slice(0, 200)}` : ''
      return { ok: false, motivo: `${String(d?.error ?? `HTTP ${r.status}`).slice(0, 200)}${extra}` }
    }
    return { ok: true, dato: d as T }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

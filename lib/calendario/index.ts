/**
 * Calendario editorial — la cara tipada y el motor de "lo que se viene".
 *
 * ⚠️ El catálogo de fechas no vive acá: vive en `lib/calendario/fechas.core.js`, en JS plano,
 * porque `api/_calendario.js` lo necesita para validar y no puede importar TypeScript. El detalle
 * está en el docblock del core, incluida la advertencia grande sobre las fechas anunciadas.
 *
 * Este archivo aporta `proximas()`, que es lo único que decide qué se ve y en qué orden.
 */

import { ETAPAS } from '@/lib/meta-ads/etapas'
import type { Etapa } from '@/lib/meta-ads/tipos'
import type {
  CoberturaEtapas,
  DecisionFecha,
  EntradaCalendario,
  FechaComercial,
  FechaFijada,
  Hito,
  IdeaParaContar,
  Prioridad,
  TipoFecha,
} from './tipos'
import {
  apagaLaFila as apagaLaFilaJs,
  caeEnFinDeSemana as caeEnFinDeSemanaJs,
  CLAVES_COMERCIALES as CLAVES_COMERCIALES_JS,
  CLAVES_PRIORIDAD as CLAVES_PRIORIDAD_JS,
  CLAVES_TIPO_HITO as CLAVES_TIPO_HITO_JS,
  diaDeSemanaDe as diaDeSemanaDeJs,
  diasDelMes as diasDelMesJs,
  diasEntre as diasEntreJs,
  FECHAS_COMERCIALES as FECHAS_COMERCIALES_JS,
  fechaComercialDe as fechaComercialDeJs,
  idComercial as idComercialJs,
  iso as isoJs,
  juegaLaFecha as juegaLaFechaJs,
  nEsimoDiaDeSemana as nEsimoDiaDeSemanaJs,
  partirIdComercial as partirIdComercialJs,
  PRIORIDADES as PRIORIDADES_JS,
  prioridadDe as prioridadDeJs,
  prioridadSugerida as prioridadSugeridaJs,
  resolverComercial as resolverComercialJs,
  sumarDias as sumarDiasJs,
  TIPOS_HITO as TIPOS_HITO_JS,
  trasladarFeriado as trasladarFeriadoJs,
} from './fechas.core.js'

export const FECHAS_COMERCIALES = FECHAS_COMERCIALES_JS as FechaComercial[]
export const CLAVES_COMERCIALES = CLAVES_COMERCIALES_JS as string[]
export const TIPOS_HITO = TIPOS_HITO_JS as { key: string; label: string }[]
export const CLAVES_TIPO_HITO = CLAVES_TIPO_HITO_JS as string[]

export const PRIORIDADES = PRIORIDADES_JS as {
  key: Prioridad
  label: string
  corto: string
  /** Pide arranque, dibuja el renglón de etapas y entra en `laQueAprieta()`. Sólo suave y fuerte. */
  arrastraProduccion: boolean
  /** La fila se dibuja atenuada. Sólo `pasamos` — `institucional` está decidida y se ve normal. */
  apaga: boolean
  ayuda: string
}[]
export const CLAVES_PRIORIDAD = CLAVES_PRIORIDAD_JS as string[]
export const prioridadDe = prioridadDeJs as (key: string | null) => (typeof PRIORIDADES)[number] | null
export const juegaLaFecha = juegaLaFechaJs as (key: string | null) => boolean
export const apagaLaFila = apagaLaFilaJs as (key: string | null) => boolean
export const prioridadSugerida = prioridadSugeridaJs as (tipo: TipoFecha | null) => Prioridad
export const trasladarFeriado = trasladarFeriadoJs as (fecha: string) => string
export const caeEnFinDeSemana = caeEnFinDeSemanaJs as (fecha: string) => boolean
export const idComercial = idComercialJs as (clave: string, anio: number) => string
export const partirIdComercial = partirIdComercialJs as (id: string) => { clave: string; anio: number } | null

export const iso = isoJs as (anio: number, mes: number, dia: number) => string
export const diasDelMes = diasDelMesJs as (anio: number, mes: number) => number
export const nEsimoDiaDeSemana = nEsimoDiaDeSemanaJs as (anio: number, mes: number, diaSemana: number, n: number) => number | null
export const sumarDias = sumarDiasJs as (fecha: string, n: number) => string
export const diasEntre = diasEntreJs as (desde: string, hasta: string) => number
export const diaDeSemanaDe = diaDeSemanaDeJs as (fecha: string) => number
export const fechaComercialDe = fechaComercialDeJs as (clave: string) => FechaComercial | null
export const resolverComercial = resolverComercialJs as (clave: string, anio: number) => { fecha: string; estimada: boolean } | null

export * from './tipos'

/** El día de hoy como `YYYY-MM-DD`, **en la zona de quien mira**, que es el día que tiene en la cabeza. */
export function hoyIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ceros = (): CoberturaEtapas => Object.fromEntries(ETAPAS.map((e) => [e, 0])) as CoberturaEtapas

/**
 * Los estados de idea que cuentan como "esta etapa está cubierta para esta fecha".
 *
 * Una descartada no cubre nada, obviamente. Una propuesta **sí** cuenta: el renglón contesta "¿hay
 * alguien pensando esto?", no "¿está lista la pieza?". Si solo contaran las listas, el tablero
 * diría "no hay nada de la segunda etapa" con cuatro ideas anotadas y el equipo dejaría de creerle.
 */
const ESTADOS_QUE_CUBREN = new Set(['propuesta', 'aprobada', 'en-produccion', 'lista', 'pauteada'])

/** Cuántas ideas vivas hay por etapa para cada fecha, indexado por el id de la entrada. */
function coberturaPorEvento(ideas: IdeaParaContar[]): Record<string, CoberturaEtapas> {
  const out: Record<string, CoberturaEtapas> = {}
  for (const i of ideas) {
    if (!i.evento || !ESTADOS_QUE_CUBREN.has(i.estado)) continue
    if (!ETAPAS.includes(i.etapa as Etapa)) continue
    if (!out[i.evento]) out[i.evento] = ceros()
    out[i.evento][i.etapa as Etapa] += 1
  }
  return out
}

/**
 * Lo que se viene: comerciales e hitos propios, en una sola lista ordenada por cercanía.
 *
 * `desde` es el día de hoy (`YYYY-MM-DD`) y `dias` la ventana. La ventana **se recorre por años
 * calendario, no por el año de hoy**: parado un 20 de diciembre con 90 días de ventana, lo que se
 * viene es Reyes y San Valentín del año siguiente, y mirar solo el año en curso devolvería una
 * lista vacía justo en la época del año donde más se planifica.
 *
 * Una fecha `fijada` **le gana siempre a la estimada** y pasa a ser firme: es el único punto donde
 * una persona le corrige la mano al catálogo, y si no ganara, confirmar no serviría de nada.
 *
 * `decisiones` es con cuánta fuerza el equipo eligió jugar cada fecha. Sin decisión, la entrada sale
 * con `prioridad: null` y `arrancarEn: null`: el catálogo pone la fecha sobre la mesa y **no opina**
 * sobre si hay que estar produciendo. Ver el docblock de `PRIORIDADES` en `fechas.core.js`.
 */
export function proximas(
  desde: string,
  dias: number,
  opts: {
    fijadas?: FechaFijada[]
    hitos?: Hito[]
    ideas?: IdeaParaContar[]
    decisiones?: DecisionFecha[]
  } = {},
): EntradaCalendario[] {
  const hasta = sumarDias(desde, dias)
  const cobertura = coberturaPorEvento(opts.ideas || [])
  const fijadas = new Map((opts.fijadas || []).map((f) => [`${f.clave}:${f.anio}`, f]))
  const decididas = new Map((opts.decisiones || []).map((d) => [d.entradaId, d]))
  const out: EntradaCalendario[] = []

  const anioDesde = Number(desde.slice(0, 4))
  const anioHasta = Number(hasta.slice(0, 4))

  for (let anio = anioDesde; anio <= anioHasta; anio++) {
    for (const f of FECHAS_COMERCIALES) {
      const auto = resolverComercial(f.clave, anio)
      if (!auto) continue
      const fijada = fijadas.get(`${f.clave}:${anio}`)
      const fecha = fijada?.fecha || auto.fecha
      if (fecha < desde || fecha > hasta) continue
      const id = idComercial(f.clave, anio)
      const decision = decididas.get(id) || null
      out.push({
        id,
        clase: 'comercial',
        fecha,
        titulo: f.titulo,
        // Confirmar una anunciada la vuelve firme; ese es todo el sentido de poder fijarla.
        certeza: fijada ? 'firme' : auto.estimada ? 'estimada' : 'firme',
        faltan: diasEntre(desde, fecha),
        anticipoDias: f.anticipoDias,
        arranqueSugerido: sumarDias(fecha, -f.anticipoDias),
        tipo: f.tipo,
        prioridadSugerida: prioridadSugerida(f.tipo),
        prioridad: decision?.prioridad || null,
        arrancar: decision?.arrancar || null,
        // Sólo hay cuenta regresiva de producción si una persona puso desde cuándo. El catálogo
        // sugiere, no decide: sin `arrancar` esto queda en null y la pantalla no anuncia urgencia.
        arrancarEn: decision?.arrancar ? diasEntre(desde, decision.arrancar) : null,
        detalle: f.porQue,
        comoSeConfirma: f.comoSeConfirma,
        tipoHito: null,
        creadoPor: fijada?.por || null,
        cobertura: cobertura[id] || ceros(),
      })
    }
  }

  for (const h of opts.hitos || []) {
    if (!h?.fecha || h.fecha < desde || h.fecha > hasta) continue
    const id = `hito:${h.id}`
    out.push({
      id,
      clase: 'hito',
      fecha: h.fecha,
      titulo: h.titulo,
      certeza: h.firme ? 'firme' : 'proyectada',
      faltan: diasEntre(desde, h.fecha),
      // Un hito propio no se decide ni se anticipa: **ya es nuestro**. Preguntarle al equipo si se
      // suma a su propio lanzamiento de colección sería pedirle que confirme lo que acaba de
      // cargar, y el anticipo lo pone quien lo cargó eligiendo la fecha, no el catálogo.
      anticipoDias: 0,
      arranqueSugerido: null,
      tipo: null,
      prioridadSugerida: null,
      prioridad: null,
      arrancar: null,
      arrancarEn: null,
      detalle: h.nota || null,
      tipoHito: h.tipo || null,
      creadoPor: h.creadoPor || null,
      cobertura: cobertura[id] || ceros(),
    })
  }

  // Por fecha; a igual día, primero la comercial (es la que tiene anticipo y manda la producción).
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clase.localeCompare(b.clase) || a.titulo.localeCompare(b.titulo))
}

/**
 * La fecha que hay que meter en el veredicto de Etapas de la pauta: **la más cercana de las que
 * decidimos jugar**.
 *
 * 🔴 Antes era "la primera cuyo anticipo ya venció", calculado del catálogo. El problema no era el
 * cálculo sino de dónde salía: mandaba a craneаr piezas para fechas que el equipo nunca pensó
 * trabajar —el Día del Niño pesa poco para estas dos marcas— y una pantalla que reclama trabajo
 * inventado se deja de mirar. Ahora aprieta porque **alguien eligió que apriete**.
 *
 * `pasamos` y "sin decidir" quedan afuera: una fecha que dijimos que dejamos pasar no puede
 * reclamar creativos, y una que nadie miró todavía tampoco. Entre las jugadas gana la más cercana,
 * y si una tiene arranque puesto y ya venció, ésa se adelanta a cualquier otra.
 */
export function laQueAprieta(entradas: EntradaCalendario[]): EntradaCalendario | null {
  const jugadas = entradas.filter((e) => e.clase === 'comercial' && juegaLaFecha(e.prioridad))
  if (!jugadas.length) return null
  const vencidas = jugadas.filter((e) => e.arrancarEn !== null && e.arrancarEn <= 0)
  const candidatas = vencidas.length ? vencidas : jugadas
  return candidatas.reduce((a, b) => (a.fecha <= b.fecha ? a : b))
}

/**
 * Las comerciales de la ventana que nadie decidió todavía. Es lo que la banda de arriba anuncia.
 *
 * Reemplaza al aviso de urgencia calculada, y no es el mismo cartel con otro texto: pide **una
 * decisión**, que es algo que una persona puede hacer en el momento, en vez de anunciar un atraso
 * de producción que nadie eligió tener. Los hitos no entran: lo propio ya está decidido.
 */
export function sinDecidir(entradas: EntradaCalendario[]): EntradaCalendario[] {
  return entradas.filter((e) => e.clase === 'comercial' && !e.prioridad)
}

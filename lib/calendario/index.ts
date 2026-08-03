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
  EntradaCalendario,
  FechaComercial,
  FechaFijada,
  Hito,
  IdeaParaContar,
} from './tipos'
import {
  CLAVES_COMERCIALES as CLAVES_COMERCIALES_JS,
  CLAVES_TIPO_HITO as CLAVES_TIPO_HITO_JS,
  diaDeSemanaDe as diaDeSemanaDeJs,
  diasDelMes as diasDelMesJs,
  diasEntre as diasEntreJs,
  FECHAS_COMERCIALES as FECHAS_COMERCIALES_JS,
  fechaComercialDe as fechaComercialDeJs,
  iso as isoJs,
  nEsimoDiaDeSemana as nEsimoDiaDeSemanaJs,
  resolverComercial as resolverComercialJs,
  sumarDias as sumarDiasJs,
  TIPOS_HITO as TIPOS_HITO_JS,
} from './fechas.core.js'

export const FECHAS_COMERCIALES = FECHAS_COMERCIALES_JS as FechaComercial[]
export const CLAVES_COMERCIALES = CLAVES_COMERCIALES_JS as string[]
export const TIPOS_HITO = TIPOS_HITO_JS as { key: string; label: string }[]
export const CLAVES_TIPO_HITO = CLAVES_TIPO_HITO_JS as string[]

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
 */
export function proximas(
  desde: string,
  dias: number,
  opts: { fijadas?: FechaFijada[]; hitos?: Hito[]; ideas?: IdeaParaContar[] } = {},
): EntradaCalendario[] {
  const hasta = sumarDias(desde, dias)
  const cobertura = coberturaPorEvento(opts.ideas || [])
  const fijadas = new Map((opts.fijadas || []).map((f) => [`${f.clave}:${f.anio}`, f]))
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
      const id = `comercial:${f.clave}:${anio}`
      out.push({
        id,
        clase: 'comercial',
        fecha,
        titulo: f.titulo,
        // Confirmar una anunciada la vuelve firme; ese es todo el sentido de poder fijarla.
        certeza: fijada ? 'firme' : auto.estimada ? 'estimada' : 'firme',
        faltan: diasEntre(desde, fecha),
        anticipoDias: f.anticipoDias,
        arrancarEn: diasEntre(desde, fecha) - f.anticipoDias,
        detalle: f.porQue,
        comoSeConfirma: f.comoSeConfirma,
        tipo: null,
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
      anticipoDias: 0,
      arrancarEn: diasEntre(desde, h.fecha),
      detalle: h.nota || null,
      tipo: h.tipo || null,
      creadoPor: h.creadoPor || null,
      cobertura: cobertura[id] || ceros(),
    })
  }

  // Por fecha; a igual día, primero la comercial (es la que tiene anticipo y manda la producción).
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clase.localeCompare(b.clase) || a.titulo.localeCompare(b.titulo))
}

/**
 * La fecha que hay que meter en el veredicto de Etapas de la pauta: **la primera cuyo anticipo ya
 * arrancó o está por arrancar**, no la más cercana.
 *
 * No es lo mismo. Navidad a 40 días con anticipo de 30 aprieta más que un Día del Amigo a 12 con
 * anticipo de 10, y decir "lo más cercano" mandaría a craneаr la pieza equivocada.
 */
export function laQueAprieta(entradas: EntradaCalendario[]): EntradaCalendario | null {
  const candidatas = entradas.filter((e) => e.clase === 'comercial' && e.arrancarEn <= 7)
  return candidatas.length ? candidatas.reduce((a, b) => (a.fecha <= b.fecha ? a : b)) : null
}

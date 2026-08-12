/**
 * Agenda operativa — la cara tipada del motor, más lo que decide qué se ve hoy.
 *
 * ⚠️ El motor de recurrencia no vive acá: vive en `lib/agenda/reglas.core.js`, en JS plano, porque
 * `api/_agenda.js` lo necesita para validar antes de guardar y no puede importar TypeScript. El
 * porqué está en el docblock del core.
 *
 * Lo que este archivo aporta es `promosDe()` —qué promo corre un día dado— y `rotuloRegla()`, que
 * pone la regla en castellano. Los rótulos se quedan del lado TS a propósito: el handler valida
 * reglas, no las lee en voz alta.
 */

import { hoyIso } from '@/lib/calendario'
import type { Marca } from '@/lib/nav.datos'
import type { Canal, FechaIso, Promo, Regla } from './tipos'
import {
  aplicaEn as aplicaEnJs,
  CLAVES_TIPO_REGLA as CLAVES_TIPO_REGLA_JS,
  esFechaIso as esFechaIsoJs,
  MAX_DIA_MES as MAX_DIA_MES_JS,
  MAX_VENTANA_DIAS as MAX_VENTANA_DIAS_JS,
  motivoReglaInvalida as motivoReglaInvalidaJs,
  ocurrencias as ocurrenciasJs,
  reglaValida as reglaValidaJs,
  TIPOS_REGLA as TIPOS_REGLA_JS,
} from './reglas.core.js'

export const TIPOS_REGLA = TIPOS_REGLA_JS as { key: Regla['tipo']; label: string }[]
export const CLAVES_TIPO_REGLA = CLAVES_TIPO_REGLA_JS as string[]
export const MAX_DIA_MES = MAX_DIA_MES_JS as number
export const MAX_VENTANA_DIAS = MAX_VENTANA_DIAS_JS as number
export const esFechaIso = esFechaIsoJs as (v: unknown) => boolean
export const motivoReglaInvalida = motivoReglaInvalidaJs as (regla: unknown) => string | null
export const reglaValida = reglaValidaJs as (regla: unknown) => boolean
export const aplicaEn = aplicaEnJs as (regla: Regla, fecha: FechaIso) => boolean
export const ocurrencias = ocurrenciasJs as (regla: Regla, desde: FechaIso, hasta: FechaIso) => FechaIso[]

export * from './tipos'
export { hoyIso }

/** 0 = domingo, como `getDay()`. Ver la advertencia de `aplicaEn` antes de tocar el orden. */
const DIAS_LARGOS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']

/** «lunes, miércoles y viernes» — la coma para todos menos el último, que va con "y". */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/**
 * La regla en castellano, para la lista de lo cargado.
 *
 * Es lo único que hace legible una pantalla de administración: un `{"tipo":"semanal","dias":[2,5]}`
 * en una tabla no se puede revisar, y revisar es exactamente para lo que sirve esa lista.
 */
export function rotuloRegla(regla: Regla): string {
  switch (regla.tipo) {
    case 'diaria':
      return 'todos los días'
    case 'unica':
      return `el ${regla.fecha}`
    case 'rango':
      return `del ${regla.desde} al ${regla.hasta}`
    case 'semanal': {
      const dias = [...regla.dias].sort((a, b) => a - b).map((d) => DIAS_LARGOS[d])
      return `los ${enumerar(dias)}`
    }
    case 'mensual':
      return regla.dia === 'ultimo' ? 'el último día de cada mes' : `el ${regla.dia} de cada mes`
    default:
      return ''
  }
}

/** «30%», «3 cuotas sin interés» — el titular de la promo, lo que se lee de lejos. */
export function rotuloBeneficio(b: Promo['beneficio']): string {
  if (b.tipo === 'descuento') return `${b.pct}% de descuento`
  if (b.tipo === 'reintegro') return `${b.pct}% de reintegro`
  return `${b.n} cuotas ${b.sinInteres ? 'sin interés' : 'con interés'}`
}

/**
 * ¿Esta promo corre este día?
 *
 * Cruza **los dos ejes de vigencia**: la ventana (`desde`/`hasta`) y la regla. Que estén separados
 * es lo que permite contestar "ya venció" sin mirar la regla, y "hoy no toca" sin mirar la ventana.
 *
 * `hasta` en `null` es una promo sin fin anunciado, no una vencida: los bancos publican varias así.
 */
export function corre(promo: Promo, fecha: FechaIso): boolean {
  if (!promo.activa) return false
  if (fecha < promo.desde) return false
  if (promo.hasta && fecha > promo.hasta) return false
  return aplicaEn(promo.regla, fecha)
}

/**
 * Las promos de un día, filtradas por canal y por marca, ordenadas por banco.
 *
 * `marcas` vacío en la promo quiere decir **las dos**: la promo la define el banco y lo normal es
 * que valga para todo lo que se cobre ahí. Tratar el vacío como "ninguna" escondería la mayoría.
 */
export function promosDe(
  promos: Promo[],
  fecha: FechaIso,
  opts: { canal?: Canal; marca?: Marca } = {},
): Promo[] {
  const { canal, marca } = opts
  return promos
    .filter((p) => corre(p, fecha))
    .filter((p) => !canal || p.canales.includes(canal))
    .filter((p) => !marca || p.marcas.length === 0 || p.marcas.includes(marca))
    .sort((a, b) => a.banco.localeCompare(b.banco, 'es') || a.medio.localeCompare(b.medio))
}

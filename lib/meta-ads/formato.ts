/**
 * Cómo se escriben los números de Meta Ads. **Una sola implementación de cada uno.**
 *
 * # Por qué existe este archivo
 *
 * `money` estaba escrito **seis veces** —en `MetaAds`, `Etapas`, `Avisos`, `Auditoria`, `Conjuntos`
 * y `ConfirmAccion`— con **tres comportamientos distintos**, y ninguno era un error: el de la
 * auditoría muestra el monto CRUDO cuando no se sabe la moneda (a propósito: el `/100` depende de
 * la moneda y adivinarlo en una pantalla que audita plata es errar por dos órdenes de magnitud), y
 * el de Etapas nunca tuvo la moneda a mano. Seis copias con tres semánticas es la receta para que
 * la séptima elija la equivocada. Acá están las tres, con nombres que dicen cuál es cuál, y un test
 * que las amarra.
 *
 * # La regla que hay que respetar
 *
 * 🔑 **Todo lo que entra acá recibe el monto YA CONVERTIDO** (en pesos, no en centavos). La unidad
 * menor de la moneda es asunto de `aMonto`/`aCrudo` (`lib/meta-ads/acciones`), y meter el `/100` acá
 * lo dejaría en dos lugares: el mismo número dividido dos veces, o ninguna.
 */

import * as core from '@/lib/meta-ads/formato.core.js'
import type { Tone } from '@/components/ui/tokens'

const nf = new Intl.NumberFormat('es-AR')

/**
 * Los cuatro que también necesita el servidor viven en `formato.core.js` y se re-exportan tipados
 * desde acá. Motivo: `reglas.core.js` es `.js` (lo importan un handler y un script de Actions) y
 * escribe plata adentro del `motivo` de cada hallazgo — sin esta bajada, sería la séptima
 * implementación de `money`, que es justo lo que este archivo vino a terminar. Mismo patrón que
 * `permisos.core.js`/`permisos.ts`.
 */

/** Un entero redondeado con separador de miles. `undefined` cuenta como 0. */
export const entero = (v?: number | null): string => core.entero(v)

/**
 * Plata **sin moneda**: `$ 12.345`.
 *
 * Es lo que se usa donde la moneda de la cuenta no viaja hasta ese punto (el censo de Etapas, el
 * gasto al pie de cada aviso). No es un descuido que no diga ARS: son montos de una sola cuenta a
 * la vez y el símbolo alcanza. Donde la moneda SÍ está, va `money`.
 */
export const plata = (v?: number | null): string => core.plata(v)

/** Un número con a lo sumo un decimal (una frecuencia de 3,42 → `3,4`). */
export const decimal = (v?: number | null): string => core.decimal(v)

/**
 * Plata **con la moneda de la cuenta**.
 *
 * `moneda: null` es un caso real y no un olvido: la auditoría guarda montos de acciones viejas sin
 * la moneda, y ahí el número va **crudo y sin símbolo** justamente para que se vea que es crudo.
 * Un código de moneda que no sea de tres letras cae al mismo lugar que un `Intl` que tira: se
 * escribe el código adelante en vez de mentir un símbolo.
 */
export const money = (v: number | undefined | null, moneda: string | null): string => {
  if (moneda === null) return entero(v)
  const cur = /^[A-Z]{3}$/.test(moneda) ? moneda : 'ARS'
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v ?? 0)
  } catch {
    return `${cur} ${entero(v)}`
  }
}

/** El retorno, con la cruz de multiplicar. Sin retorno se dibuja el guion, no un `0×`. */
export const roas = (v?: number | null): string => core.roas(v)

/**
 * Un porcentaje que llega como **proporción** (0,43 → `43%`). Redondeado a entero: es lo que se
 * dibuja al lado de una barra, donde el decimal no cambia ninguna decisión.
 */
export const pctUno = (p?: number | null): string => `${Math.round((p ?? 0) * 100)}%`

/** Un porcentaje que llega **ya en porcentaje** (2,34 → `2,3%`), como los CTR que devuelve Meta. */
export const pctCien = (v?: number | null): string => core.pctCien(v)

/**
 * Una variación, con su signo (0,053 → `+5,3%`). El `+` es el dato: en la auditoría lo que importa
 * de un cambio de presupuesto es para qué lado fue.
 */
export const pctFirmado = (v: number): string => `${v > 0 ? '+' : ''}${nf.format(Math.round(v * 1000) / 10)}%`

/** `2026-08-08` → `08/08`. Para los ejes de los gráficos, donde el año es siempre el mismo. */
export const diaCorto = (iso: string): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

/** El desglose de Meta viene en inglés y con `unknown` para lo que no pudo inferir. */
export const genero = (g: string): string =>
  g === 'male' ? 'Hombres' : g === 'female' ? 'Mujeres' : g === 'unknown' ? 'Sin dato' : g || '—'

/** Los cuatro `publisher_platform` que devuelve Meta hoy. Lo que no conoce se muestra tal cual. */
export const plataforma = (p: string): string =>
  p === 'facebook' ? 'Facebook'
    : p === 'instagram' ? 'Instagram'
      : p === 'audience_network' ? 'Audience Network'
        : p === 'messenger' ? 'Messenger'
          : p || '—'

/** Un rótulo listo para el kit: el texto y el tono, sin colores sueltos. */
export type Rotulo = { txt: string; tone: Tone }

/**
 * El estado de entrega (`effective_status`) en castellano.
 *
 * 🔑 **El género importa** y por eso es un parámetro: una campaña está «Pausada» y un aviso está
 * «Pausado». Es el mismo defecto que ya se corrigió en los carteles de duplicar («Esta conjunto
 * tiene 6 avisos»), y con dos implementaciones sueltas volvía a aparecer solo.
 *
 * 🔑 **Lo pausado se detecta por `includes('PAUSED')`**, no con una lista de tres. Meta devuelve
 * `PAUSED`, `ADSET_PAUSED` y `CAMPAIGN_PAUSED` según de quién sea el interruptor, y una lista
 * cerrada deja al que aparezca mañana cayendo al `else`, que lo muestra en inglés y en gris.
 */
export function rotuloEstado(s: string | null | undefined, genero: 'f' | 'm' = 'm'): Rotulo | null {
  if (!s) return null
  const a = genero === 'f' ? 'a' : 'o'
  if (s === 'ACTIVE') return { txt: `Activ${a}`, tone: 'success' }
  if (s.includes('PAUSED')) return { txt: `Pausad${a}`, tone: 'neutral' }
  if (s === 'PENDING_REVIEW' || s === 'IN_PROCESS' || s === 'PENDING_PROCESSING') return { txt: 'En revisión', tone: 'warning' }
  if (s === 'DISAPPROVED' || s === 'WITH_ISSUES') return { txt: 'Con problemas', tone: 'danger' }
  return { txt: s.toLowerCase().replace(/_/g, ' '), tone: 'neutral' }
}

/**
 * Los rankings de calidad de Meta (`quality_ranking` y hermanos).
 *
 * `UNKNOWN` devuelve `null` y no «no se sabe»: Meta lo manda cuando el aviso no tuvo impresiones
 * suficientes, o sea casi siempre en una cuenta chica. Dibujarlo llenaría cada fila de una etiqueta
 * gris que no dice nada.
 */
export function rotuloRanking(r: string | null | undefined): Rotulo | null {
  if (!r || r === 'UNKNOWN') return null
  if (r === 'ABOVE_AVERAGE') return { txt: 'Arriba del promedio', tone: 'success' }
  if (r === 'AVERAGE') return { txt: 'En el promedio', tone: 'neutral' }
  return { txt: 'Debajo del promedio', tone: 'danger' } // BELOW_AVERAGE_10/20/35
}

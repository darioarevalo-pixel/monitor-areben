/**
 * Los formateadores numéricos de Meta Ads, en `.js` plano.
 *
 * # Por qué este archivo existe aparte de `formato.ts`
 *
 * `formato.ts` nació para matar las **seis** implementaciones de `money` que había repartidas por
 * las pantallas. La regla que dejó escrita es «una sola implementación de cada uno», y
 * `reglas.core.js` estaba por romperla: es `.js` —lo importan `api/_meta-reglas.js` y
 * `scripts/evaluar-reglas-meta.mjs`, que corren en Node sin el compilador de Next— así que **no
 * puede importar TypeScript**, y necesita escribir plata adentro del `motivo` de cada hallazgo.
 *
 * La salida es la misma que ya usan `permisos.core.js`/`permisos.ts` y `planes.core.js`/`planes.ts`:
 * lo compartible baja a `.core.js` y el `.ts` lo re-exporta tipado. Acá bajan sólo los cuatro que el
 * servidor necesita; los que sólo dibuja la UI (`rotuloEstado`, `plataforma`, …) se quedan arriba,
 * donde tienen los tipos del kit a mano.
 *
 * 🔑 **La regla de `formato.ts` sigue valiendo igual acá: todo lo que entra recibe el monto YA
 * CONVERTIDO** (en pesos, no en unidad menor). El `/100` es asunto de `aMonto`/`aCrudo`.
 */

const nf = new Intl.NumberFormat('es-AR')
const nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

/** Un entero redondeado con separador de miles. `undefined` cuenta como 0. */
export function entero(v) {
  return nf.format(Math.round(v ?? 0))
}

/** Plata **sin moneda**: `$ 12.345`. Donde la moneda SÍ está a mano, va `money`. */
export function plata(v) {
  return `$ ${entero(v)}`
}

/** El retorno, con la cruz de multiplicar. Sin retorno se dibuja el guion, no un `0×`. */
export function roas(v) {
  return v ? `${nf1.format(v)}×` : '—'
}

/** Un porcentaje que llega **ya en porcentaje** (2,34 → `2,3%`), como los CTR que devuelve Meta. */
export function pctCien(v) {
  return `${nf1.format(v ?? 0)}%`
}

/** Un número con a lo sumo un decimal (una frecuencia de 3,42 → `3,4`). */
export function decimal(v) {
  return nf1.format(v ?? 0)
}

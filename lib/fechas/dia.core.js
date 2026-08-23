/**
 * El día como `YYYY-MM-DD`. **LA** implementación, en `.js` plano.
 *
 * # Por qué es `.js` y no `dia.ts`
 *
 * Mismo motivo que `lib/permisos.core.js`, `lib/liquidacion/canal.core.js` y
 * `lib/lineas.core.js`: los handlers de `api/*.js` corren en Node sin pasar por el compilador de
 * Next y **no pueden importar TypeScript**. `api/_ventas-diarias.js` tiene que enumerar los días de
 * un rango, que es exactamente lo que hace `sumarDias`, y la alternativa era escribirla de nuevo
 * ahí. El propio encabezado de `dia.ts` avisaba de eso: nació porque ya había **cuatro** copias del
 * mismo formateo a mano y «la quinta iba a escribirse sola». `dia.ts` quedó de re-export tipado y
 * ningún import cambió.
 *
 * 🔴 **`sumarDias` y `diasEntre` sirven en cualquier lado; `hoyIso()` SIN argumento no.** Las dos
 * primeras son funciones de una cadena y dan lo mismo corran donde corran. `hoyIso()` con el reloj
 * de ahora devuelve el día de **quien la corre**: en el navegador de alguien que está en Argentina
 * eso es el día que tiene en la cabeza, y en una función de Vercel —que corre en UTC— a las 21:00
 * de acá ya es mañana. ⛔ **En el servidor no se usa: va `diaArgentino`** (`lib/envios/portal.core.js`).
 */

/** El día de `d` (por default, hoy) como `YYYY-MM-DD` local. Ver el 🔴 de arriba antes de usarla en `api/`. */
export function hoyIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Sumar (o restar) días a una fecha ISO.
 *
 * Se construye la fecha con `T00:00:00` —medianoche **local**— y no con `Date.parse(iso)`, que la
 * interpreta como medianoche UTC: con esa, en Argentina el día vuelve corrido una jornada. El
 * resultado se relee con los mismos getters locales, así que la zona se cancela y la función es
 * pura sobre la cadena.
 */
export function sumarDias(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return hoyIso(d)
}

/** Los días de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diasEntre(desde, hasta) {
  const a = new Date(desde + 'T00:00:00').getTime()
  const b = new Date(hasta + 'T00:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

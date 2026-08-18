/**
 * El día como `YYYY-MM-DD`, **en la zona de quien mira**.
 *
 * # Por qué existe este archivo
 *
 * `hoyIso` vivía en `lib/calendario/index.ts`, que es el barril de Calendario: para usarla desde
 * otra sección había que arrastrar el módulo entero al chunk. Y la app ya tenía **cuatro** copias
 * del mismo formateo a mano (`lib/crm/leads.ts`, `lib/crm/core.ts`, `lib/canjes/reglas.core.js`,
 * el propio Calendario), así que la quinta iba a escribirse sola.
 *
 * ⚠️ **Quedan copias vivas y a propósito**: `addDiasISO` de `lib/crm/core.ts` es esta misma
 * `sumarDias` letra por letra, pero el CRM es de otra sección y de otra mano — se unifica el día
 * que alguien entre a tocarla, no de paso.
 *
 * ⛔ **Esto NO es `diaArgentino` (`lib/envios/portal.core.js`) y no hay que unificarlas.**
 * Aquélla existe porque el **servidor** corre en UTC y necesita el día de Argentina con un offset
 * fijo. Acá corre el navegador de alguien que está en Argentina: su día local **es** el día que
 * tiene en la cabeza, que es el criterio que ya usan la Agenda y el Calendario. Lo que sí está mal
 * en las dos es `toISOString().slice(0, 10)`, que devuelve el día **UTC** y a las 21:00 de acá ya
 * es mañana.
 */

/** El día de `d` (por default, hoy) como `YYYY-MM-DD` local. */
export function hoyIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Sumar (o restar) días a una fecha ISO, en la zona local.
 *
 * Se construye la fecha con `T00:00:00` —medianoche **local**— y no con `Date.parse(iso)`, que la
 * interpreta como medianoche UTC: con esa, en Argentina el día vuelve corrido una jornada.
 */
export function sumarDias(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return hoyIso(d)
}

/** Los días de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  const a = new Date(desde + 'T00:00:00').getTime()
  const b = new Date(hasta + 'T00:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

/**
 * El día como `YYYY-MM-DD`, **en la zona de quien mira**. Acá sólo se le pone el tipo, una vez.
 *
 * # Por qué existe este archivo
 *
 * `hoyIso` vivía en `lib/calendario/index.ts`, que es el barril de Calendario: para usarla desde
 * otra sección había que arrastrar el módulo entero al chunk. Y la app ya tenía **cuatro** copias
 * del mismo formateo a mano (`lib/crm/leads.ts`, `lib/crm/core.ts`, `lib/canjes/reglas.core.js`,
 * el propio Calendario), así que la quinta iba a escribirse sola.
 *
 * 📌 **El cuerpo se mudó a `dia.core.js`** el 23-ago-2026, cuando `api/_ventas-diarias.js` tuvo que
 * enumerar los días de un rango: `api/` corre en Node sin el compilador de Next y no puede importar
 * TypeScript, así que la quinta copia estaba por escribirse ahí. Acá quedó el re-export tipado y
 * **ningún import cambió**.
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

import { diasEntre as diasEntreJs, hoyIso as hoyIsoJs, sumarDias as sumarDiasJs } from './dia.core.js'

/** El día de `d` (por default, hoy) como `YYYY-MM-DD` local. */
export const hoyIso: (d?: Date) => string = hoyIsoJs

/** Sumar (o restar) días a una fecha ISO, en la zona local. */
export const sumarDias: (iso: string, n: number) => string = sumarDiasJs

/** Los días de `desde` a `hasta` (positivo si `hasta` es posterior). */
export const diasEntre: (desde: string, hasta: string) => number = diasEntreJs

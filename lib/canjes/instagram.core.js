/**
 * La normalización del @ de Instagram. **Una sola implementación, para los dos lados.**
 *
 * Es el único campo obligatorio del padrón de creadoras y su `unique` en la base, así que esto no
 * es cosmético: es lo que hace que `Lucia.MKP`, `@lucia.mkp` e `instagram.com/lucia.mkp/reel/xyz`
 * sean **una** persona y no tres fichas con el historial partido.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Es el mismo motivo que `lib/permisos.core.js`: los handlers de `api/*.js` corren en Node sin
 * pasar por el compilador de Next y no pueden importar TypeScript. Hasta el 13-ago-2026 la
 * consecuencia era que esta función vivía **dos veces** —acá en TS y copiada a mano en
 * `api/_canjes.js`— y las dos copias se vigilaban con un test de espejo
 * (`tests/canjes-core.test.ts`).
 *
 * Vigilar el espejo es pagar interés todos los meses en vez de amortizar, y acá el interés es caro:
 * el `unique` de la base es de la versión JS, así que si las copias se despegan **se crean fichas
 * duplicadas sin que falle nada**. No hay error, no hay log: hay una creadora con dos historiales.
 *
 * El repo ya resolvió esto ocho veces (`permisos`, `tienda`, `meta-ads`, `agenda`, `calendario`,
 * `atencion`, `novedades`, `sync-tn`) y la regla está escrita en `lib/permisos.core.js:23`: si un
 * chequeo hace falta en `api/`, va en un `.core.js`. No se copia. Canjes era el que faltaba.
 *
 * ⚠️ **Esto es sólo `normalizarInstagram`, a propósito.** `api/_canjes.js` tiene otras seis
 * funciones espejadas contra `lib/canjes/tipos.ts` (`numeroCanje`, `puedeIr`, `queDatoPide`,
 * `itemsVivos`, `retiroLocalDisponible`, `fechaISO`). Bajarlas todas es un refactor sobre un
 * archivo de 2.218 líneas en uso, y el AGENTS.md pide coordinar los refactors grandes con Darío
 * antes de empezar. Se bajó la que falla en silencio; el resto queda pendiente de esa charla.
 */

/**
 * La forma canónica: minúsculas, sin `@`, sin URL, sin barra final, sin query string.
 *
 * Devuelve `''` si no queda nada usable — el llamador decide si eso es un error (en el alta lo es:
 * el @ es obligatorio).
 */
export function normalizarInstagram(v) {
  let s = String(v ?? '').trim()
  if (!s) return ''

  // Formato URL, con o sin protocolo, con o sin www. Se queda con el primer segmento del path:
  // `instagram.com/lucia.mkp/reel/xyz` es igual de válido como entrada y la persona es `lucia.mkp`.
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  if (/^(instagram\.com|instagr\.am)\//i.test(s)) {
    s = s.replace(/^(instagram\.com|instagr\.am)\//i, '')
  }

  // Query y hash fuera: pegar un link desde el celular arrastra `?igsh=...`.
  s = s.split('?')[0].split('#')[0]
  // Sólo el primer segmento del path.
  s = s.split('/')[0]
  s = s.replace(/^@+/, '').trim().toLowerCase()

  // Instagram permite letras, números, punto y guion bajo. Lo que no entra, no es parte del @.
  s = s.replace(/[^a-z0-9._]/g, '')
  // Un punto al final no es parte del nombre: casi siempre es el punto de la oración pegada.
  s = s.replace(/\.+$/, '')

  return s
}

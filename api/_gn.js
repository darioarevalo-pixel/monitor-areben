/**
 * Hablar con Gestión Nube **desde una función de Vercel**.
 *
 * # Por qué no es `scripts/lib/gn-fetch.mjs`
 *
 * 🔴 **Porque aquél espera hasta 300 segundos por corte, y hasta cinco veces.** Está bien para un
 * job de GitHub Actions, que tiene 20 minutos; acá el techo es el `maxDuration = 30` de
 * `api/datos.js`, así que un `esperaRateLimit` largo no protege nada: se come la función entera y
 * el usuario ve un fallo genérico en vez de «GN está cortando, probá en un minuto».
 *
 * Este archivo salió de adentro de `api/_liquidacion.js` el 18-ago-2026, **sin cambiarle una línea**,
 * cuando Ventas de Marketing necesitó el mismo `fetch` para su botón de traer las ventas del día.
 * Antes de moverlo eran las mismas cuatro constantes y la misma función viviendo en un handler:
 * copiarlas al segundo era exactamente lo que este repo ya pagó una vez con las diez copias de
 * `gnFetch` —cinco de ellas con el `fetch` pelado— que se unificaron en `crearClienteGN`.
 *
 * ⚠️ **No es una función de Vercel**: el prefijo `_` lo garantiza (el plan Hobby admite 12).
 */

// El precio de liquidación rige en el local Y online, y **la conexión es GN → TN**: se escribe en
// Gestión Nube y GN lo propaga a Tienda Nube. Escribirlo derecho en TN es ir contra la corriente
// —el sync de GN lo pisa— aunque el token de TN pueda hacerlo.
export const GN_BASE = 'https://www.gestionnube.com/api/v1';

/** Un token por marca, nunca compartido. */
export const GN_TOKENS = { bdi: process.env.GN_TOKEN, zattia: process.env.GN_TOKEN_ZATTIA };

// 🔑 **Dos topes distintos, y el que muerde es el segundo.** GN limita 60 consultas por minuto *y*
// 2 por segundo, contadas por segundo de reloj: con 600 ms de pausa el PATCH rebota `429`. Van 1200.
export const PAUSA_GN = 1200;

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `fetch` a GN que respeta el rate limit.
 *
 * 🔑 **Se le hace caso al `retry-after` que manda GN**, que es correcto (medido: dice 15 y el
 * `x-ratelimit-reset` cae 15 s después). Esperar de más es peor que esperar de menos: un backoff de
 * 62 s se come tres ventanas enteras y encuentra la cuota igual de vacía, porque el tope está
 * **compartido con los otros sistemas de la casa** y puede estar en `remaining: 0` sin que nosotros
 * hayamos consultado nada.
 */
export async function gnFetch(url, opts, tries = 3) {
  let last;
  for (let a = 1; a <= tries; a++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok || (r.status !== 429 && r.status < 500)) return r;
      last = r;
      if (a < tries) {
        const esperar = Math.min(Math.max(Number(r.headers.get('retry-after')) || 15, 5), 30);
        await dormir(esperar * 1000);
        continue;
      }
      return r;
    } catch (e) { last = e; if (a < tries) { await dormir(900 * a); continue; } throw e; }
  }
  return last;
}


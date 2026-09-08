/**
 * La puerta de lectura del dashboard: a quién le debemos y cuánto.
 *
 * # Por qué salió de `api/_acreedores.js`
 *
 * Vivía ahí, privada, y la necesitan DOS handlers: el que muestra la pantalla y el que anota un
 * compromiso —que antes de anotarlo tiene que saber cuánto se le debe de verdad al acreedor—.
 * Copiarla era exactamente lo que este circuito ya pagó dos veces esta semana: la cuenta de los
 * montos estaba escrita cuatro veces y una quedó desparejada; la del día de hoy, dos veces y una
 * estaba en UTC.
 *
 * Misma regla que `lib/permisos.core.js`: si hace falta en más de un `api/`, va a `lib/` y no se
 * copia.
 *
 * # Por qué `.js` y no `.ts`
 *
 * Los `api/*.js` corren en Node sin pasar por el compilador de Next: no pueden importar TypeScript.
 *
 * ⛔ No importa nada, a propósito: quien la use no arrastra `_auth.js` ni el core de permisos.
 */

const URL_PUENTE =
  process.env.DASHBOARD_PUENTE_URL || 'https://dashboard.arebensrl.com/api/puente/acreedores';

/**
 * El techo de la función son 30 s. Se corta bastante antes para poder contestar con un aviso
 * entendible en vez de que Vercel mate la request y el navegador vea un error pelado.
 */
const TIMEOUT_MS = 8000;

/**
 * Le pregunta al dashboard. Devuelve `{ acreedores }` o `{ aviso }` — **nunca tira**, porque el que
 * la llama tiene que poder decidir qué hacer con la caída:
 *
 * - la pantalla se dibuja igual, sin la columna de plata (ver `api/_acreedores.js`);
 * - anotar un compromiso, en cambio, se frena: sin saber cuánto se le debe no se puede controlar
 *   que no se comprometa de más, que es la razón de ser del circuito.
 */
export async function leerAcreedoresDelDashboard() {
  const secreto = process.env.DASHBOARD_PUENTE_SECRET;
  if (!secreto) {
    return { aviso: 'Falta conectar el dashboard (DASHBOARD_PUENTE_SECRET).' };
  }

  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(URL_PUENTE, {
      headers: { 'x-puente-auth': secreto },
      signal: corte.signal,
    });
    if (!r.ok) {
      // El cuerpo puede no ser JSON (un HTML de error de Vercel, por ejemplo).
      const detalle = await r.text().catch(() => '');
      let mensaje = `el dashboard contestó ${r.status}`;
      try {
        const j = JSON.parse(detalle);
        if (j && j.error) mensaje = j.error;
      } catch {}
      return { aviso: `No se pudo leer la deuda: ${mensaje}` };
    }
    const d = await r.json();
    return { acreedores: Array.isArray(d?.acreedores) ? d.acreedores : [] };
  } catch (e) {
    if (e?.name === 'AbortError') {
      return { aviso: 'El dashboard está tardando. Probá de nuevo en un minuto.' };
    }
    return { aviso: `No se pudo leer la deuda: ${e.message}` };
  } finally {
    clearTimeout(reloj);
  }
}

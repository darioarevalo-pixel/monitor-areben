/**
 * Adelantos de sueldo: las dos llamadas al dashboard (`/api/puente/adelantos`).
 *
 * - `leerAdelantosDelDashboard()` → a quién se le puede adelantar (los empleados activos) y cuánto
 *   de cada adelanto ya entró en una nómina. ⛔ Lo aplicado NO se guarda en el Monitor: se lee de
 *   allá, que es lo que hace que borrar una liquidación devuelva el adelanto a pendiente sin avisar.
 * - `pedirQueAplique(empleadoId)` → "confirmé un adelanto de este empleado". Si su nómina de ese
 *   mes ya existe, entra en el momento; si no, no pasa nada y entrará al liquidar.
 *
 * Las dos devuelven `{ aviso }` en vez de tirar, igual que `lib/acreedores/puente.core.js`.
 *
 * `.js` y sin imports: la usan los `api/*.js`, que corren en Node sin compilar TypeScript.
 */

const URL_PUENTE =
  process.env.DASHBOARD_ADELANTOS_URL || 'https://dashboard.arebensrl.com/api/puente/adelantos';

const TIMEOUT_MS = 8000;

async function llamar(opciones) {
  const secreto = process.env.DASHBOARD_PUENTE_SECRET;
  if (!secreto) return { aviso: 'Falta conectar el dashboard (DASHBOARD_PUENTE_SECRET).' };

  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(URL_PUENTE, {
      ...opciones,
      headers: { 'x-puente-auth': secreto, 'Content-Type': 'application/json' },
      signal: corte.signal,
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || typeof d !== 'object') {
      return { aviso: (d && d.error) || `El dashboard contestó ${r.status}.` };
    }
    return { datos: d };
  } catch (e) {
    if (e?.name === 'AbortError') return { aviso: 'El dashboard está tardando. Probá de nuevo en un minuto.' };
    return { aviso: `No se pudo hablar con el dashboard: ${e.message}` };
  } finally {
    clearTimeout(reloj);
  }
}

export async function leerAdelantosDelDashboard() {
  const r = await llamar({ method: 'GET' });
  if (r.aviso) return { aviso: r.aviso };
  return {
    empleados: Array.isArray(r.datos.empleados) ? r.datos.empleados : [],
    aplicados: Array.isArray(r.datos.aplicados) ? r.datos.aplicados : [],
  };
}

export async function pedirQueAplique(empleadoId) {
  const r = await llamar({ method: 'POST', body: JSON.stringify({ empleado_id: empleadoId }) });
  if (r.aviso) return { aviso: r.aviso };
  return r.datos;
}

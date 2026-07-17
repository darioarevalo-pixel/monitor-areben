// Auth compartida de los endpoints del Monitor.
//
// Los archivos de api/ que empiezan con "_" no son rutas: Vercel los ignora para
// el filesystem routing y quedan como módulo importable.
//
// NO INVENTA UN MODELO NUEVO. Es el mismo que ya usaba api/crear-venta.js desde
// antes: el KV de bdi-catalogo es quien tiene las contraseñas, y acá se le
// pregunta server-side si (user, pass) es un usuario válido. La diferencia es que
// ahora vive en un solo lugar y lo usan todos los endpoints que escriben o que
// exponen datos de las dos marcas.
//
// Contexto de por qué hacía falta: observaciones.js, inventario-vivo.js y
// conteos-deposito.js estaban abiertos a internet con CORS '*' y sin validar
// nada, usando tokens de GN con permiso de escritura y la service key de
// Supabase. Cualquiera podía pisar la ubicación física de un producto, insertar
// conteos falsos, o bajarse el stock completo de las dos marcas.
//
// Lo que esto NO resuelve: la contraseña sigue viajando en cada request y vive en
// sessionStorage del browser. Es el modelo actual del Monitor, no uno nuevo. El
// reemplazo de verdad (Supabase Auth / token firmado) toca bdi-catalogo y es otro
// trabajo. Esto cierra el agujero de "sin credencial alguna", que es lo urgente.

const USU_API = 'https://bdi-catalogo.vercel.app/api/usuarios';

/**
 * Lee las credenciales del request.
 *
 * El header `x-monitor-auth` lleva base64(JSON {user, pass}) en UTF-8. Va en
 * base64 y no en dos headers de texto plano por una razón concreta: los valores
 * de header son latin-1, y una contraseña con "ñ" o un acento haría que fetch
 * tire TypeError del lado del cliente antes de salir.
 *
 * También acepta user/pass en el body, que es como los manda crear-venta.js
 * desde antes de esto. No se toca ese contrato.
 */
export function credenciales(req) {
  const h = req.headers || {};
  const b = req.body || {};

  const raw = h['x-monitor-auth'];
  if (raw) {
    try {
      const json = Buffer.from(String(raw), 'base64').toString('utf8');
      const d = JSON.parse(json);
      return { user: String(d.user || '').trim(), pass: String(d.pass || '') };
    } catch {
      return { user: '', pass: '' };
    }
  }

  return {
    user: String(b.user || b.adminUser || '').trim(),
    pass: String(b.pass || b.adminPass || ''),
  };
}

/**
 * Le pregunta al KV si el usuario existe. Devuelve el perfil o null.
 *
 * Port de usuarioValido (api/crear-venta.js:25), que ahora importa de acá.
 *
 * Ojo con el modo de falla que esto agrega: si bdi-catalogo se cae, estos
 * endpoints devuelven 403 y Conteo depósito deja de andar. Antes no dependían de
 * él. Es el precio de que el KV sea el único que sabe las contraseñas; crear-venta
 * ya cargaba con lo mismo.
 */
export async function usuarioValido(user, pass) {
  if (!user || !pass) return null;
  try {
    const r = await fetch(USU_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', user, pass }),
    });
    const d = await r.json();
    return d && d.ok && d.perfil ? d.perfil : null;
  } catch {
    return null;
  }
}

/**
 * Guard de los handlers: devuelve el perfil, o contesta 403 y devuelve null.
 *
 *   const perfil = await exigirUsuario(req, res);
 *   if (!perfil) return;
 */
export async function exigirUsuario(req, res) {
  const { user, pass } = credenciales(req);
  const perfil = await usuarioValido(user, pass);
  if (!perfil) {
    res.status(403).json({ error: 'Necesitás estar logueado en el Monitor para hacer esto.' });
    return null;
  }
  return perfil;
}

/**
 * Cabeceras de un endpoint que solo sirve al propio Monitor.
 *
 * NO pone Access-Control-Allow-Origin, y no es un olvido: index.html llama a
 * estos endpoints con rutas relativas ('/api/...'), o sea same-origin, y una
 * request same-origin no necesita CORS. El '*' que había no habilitaba ningún uso
 * legítimo — solo permitía que cualquier sitio que visitara alguien del equipo
 * disparara estas llamadas desde su browser.
 *
 * Verificado antes de sacarlo: bdi-catalogo no consume la API del Monitor (tiene
 * su propio api/proxy.js con otro contrato) y ningún script ni workflow la llama.
 *
 * Devuelve true si ya contestó el preflight y el handler debe cortar.
 */
export function soloMismoOrigen(req, res, metodos) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', metodos);
    res.status(204).end();
    return true;
  }
  return false;
}

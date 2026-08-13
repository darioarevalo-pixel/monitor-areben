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
// Desde el SSO hay DOS formas válidas de identificarse, y el guard acepta las dos:
//
//   - {user, pass}  el modelo de siempre. Se queda porque Depósito, Local y bdilocal
//                   son puestos de trabajo compartidos, no personas, y no pueden tener
//                   casilla de Workspace.
//   - {token}       un token del proveedor de identidad de Areben (el proyecto Supabase
//                   del dashboard), para quien entró con Google. La misma cuenta con la
//                   que entra a producción y al dashboard.
//
// Las dos terminan en la misma pregunta a bdi-catalogo y devuelven el mismo perfil del
// KV, así que los handlers no se enteran de cuál se usó. Lo que la segunda arregla es que
// la contraseña deje de viajar en cada request y de vivir cacheada en el navegador.

const USU_API = 'https://bdi-catalogo.vercel.app/api/usuarios';

/**
 * Lee las credenciales del request.
 *
 * El header `x-monitor-auth` lleva base64(JSON) en UTF-8, con `{user, pass}` o `{token}`
 * adentro. Va en base64 y no en headers de texto plano por una razón concreta: los
 * valores de header son latin-1, y una contraseña con "ñ" o un acento haría que fetch
 * tire TypeError del lado del cliente antes de salir.
 *
 * También acepta user/pass en el body, que es como los manda crear-venta.js desde antes
 * de esto. No se toca ese contrato.
 */
export function credenciales(req) {
  const h = req.headers || {};
  const b = req.body || {};

  const raw = h['x-monitor-auth'];
  if (raw) {
    try {
      const json = Buffer.from(String(raw), 'base64').toString('utf8');
      const d = JSON.parse(json);
      if (d.token) return { user: '', pass: '', token: String(d.token) };
      return { user: String(d.user || '').trim(), pass: String(d.pass || ''), token: '' };
    } catch {
      return { user: '', pass: '', token: '' };
    }
  }

  return {
    user: String(b.user || b.adminUser || '').trim(),
    pass: String(b.pass || b.adminPass || ''),
    token: String(b.token || b.adminToken || ''),
  };
}

/**
 * Le pregunta al KV quién es. Devuelve el perfil o null.
 *
 * Port de usuarioValido (api/crear-venta.js:25), que ahora importa de acá.
 *
 * Ojo con el modo de falla que esto agrega: si bdi-catalogo se cae, estos endpoints
 * devuelven 403 y Conteo depósito deja de andar. Antes no dependían de él. Es el precio
 * de que el KV sea el único que sabe quién es quién; crear-venta ya cargaba con lo mismo.
 * Con token hay un eslabón más (bdi-catalogo le pregunta al proveedor), así que si el
 * proveedor se cae, las sesiones de Google dejan de escribir y las de contraseña no.
 */
export async function usuarioValido(user, pass, token) {
  const cuerpo = token
    ? { action: 'login-google', token }
    : user && pass
      ? { action: 'login', user, pass }
      : null;
  if (!cuerpo) return null;
  try {
    const r = await fetch(USU_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
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
  const { user, pass, token } = credenciales(req);
  const perfil = await usuarioValido(user, pass, token);
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
 * su propio `api/proxy.js`, con el contrato `?_path=` en vez de `?path=`) y ningún
 * script ni workflow la llama.
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

/**
 * Los únicos orígenes desde los que el Monitor se llama a sí mismo CRUZANDO de dominio.
 *
 * Los dos primeros son **el mismo deployment** (`monitor.arebensrl.com` es alias de
 * `monitorareben.vercel.app`); son dos porque `crear-venta` se llama por URL ABSOLUTA a propósito
 * —"las ventas van siempre al crear-venta de producción, esté donde esté corriendo el Monitor:
 * los tokens de ventas de GN viven solo ahí" (`lib/reclamos/cliente.ts:25`)—, y la app se sirve en
 * el otro. Eso es lo que lo vuelve cross-origin y lo que obliga a que haya CORS.
 *
 * `localhost` está para que se pueda probar contra producción desde la máquina, que es el otro
 * caso que el comentario de arriba contempla.
 *
 * ⛔ **Los deploys de PREVIEW quedan afuera a propósito** (13-ago-2026, decidido con Bruno). Un
 * preview no tiene por qué crear ventas reales en Gestión Nube ni bajar stock. Y no alcanzaría con
 * permitir `*.vercel.app`: ese dominio lo puede tener cualquiera, así que la "lista" no filtraría
 * nada. Si algún día hace falta, va el prefijo exacto del proyecto, no el comodín.
 */
export const ORIGENES_PROPIOS = [
  'https://monitor.arebensrl.com',
  'https://monitorareben.vercel.app',
  'http://localhost:3000',
];

/**
 * CORS para el puñado de endpoints que SÍ se llaman cruzando de dominio.
 *
 * 🔴 **Reemplaza un `Access-Control-Allow-Origin: *`**, que en `crear-venta` significaba que
 * cualquier sitio de internet podía POSTear al endpoint que crea ventas reales en GN y descuenta
 * stock. Con el guard puesto haría falta además una credencial válida, pero el `*` no habilitaba
 * ningún uso legítimo que la lista no cubra.
 *
 * A un origen desconocido no se le contesta un error: simplemente **no se le manda el header**, y
 * el navegador corta solo. Es lo que hace que un `curl` siga andando (CORS es una regla del
 * navegador, no una autenticación) y por eso el guard de identidad sigue siendo el que protege.
 *
 * `Vary: Origin` no es decorativo: sin él un caché podría servirle a un origen la respuesta que se
 * armó para otro.
 *
 * Devuelve true si ya contestó el preflight y el handler debe cortar.
 */
export function corsOrigenPropio(req, res, metodos) {
  const origen = (req.headers && req.headers.origin) || '';
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  if (ORIGENES_PROPIOS.includes(origen)) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Access-Control-Allow-Methods', metodos);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

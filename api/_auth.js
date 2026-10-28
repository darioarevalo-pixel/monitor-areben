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

import { abrirSesion, firmarSesion } from '../lib/sesion-firmada.core.js';

const USU_API = 'https://bdi-catalogo.vercel.app/api/usuarios';

/**
 * El secreto de la sesión propia. Sin él, todo sigue como antes del 21-oct: cada request le
 * pregunta a bdi-catalogo. Se lee en cada llamada (y no al cargar el módulo) para que los tests
 * lo puedan prender y apagar.
 */
const secretoSesion = () => process.env.MONITOR_SESION_SECRETO || '';

/** La cabecera en la que la respuesta le devuelve al navegador su sesión firmada (renovada). */
export const CABECERA_SESION = 'x-monitor-sesion';

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
 *
 * 🔑 `sesion` (21-oct-2026) viaja AL LADO de lo anterior, ⛔ en su lugar: el mismo sobre va también a
 * bdi-catalogo (17 pantallas y 4 reenvíos del servidor), que sólo entiende `{user,pass}`/`{token}`.
 */
export function credenciales(req) {
  const h = req.headers || {};
  const b = req.body || {};

  const raw = h['x-monitor-auth'];
  if (raw) {
    try {
      const json = Buffer.from(String(raw), 'base64').toString('utf8');
      const d = JSON.parse(json);
      const sesion = typeof d.sesion === 'string' ? d.sesion : '';
      if (d.token) return { user: '', pass: '', token: String(d.token), sesion };
      return { user: String(d.user || '').trim(), pass: String(d.pass || ''), token: '', sesion };
    } catch {
      return { user: '', pass: '', token: '', sesion: '' };
    }
  }

  return {
    user: String(b.user || b.adminUser || '').trim(),
    pass: String(b.pass || b.adminPass || ''),
    token: String(b.token || b.adminToken || ''),
    sesion: '',
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
  const r = await preguntarAlKv(user, pass, token);
  return r.perfil || null;
}

/**
 * La misma pregunta que `usuarioValido`, pero distingue «no» de «no contesta»: con la sesión
 * firmada, un «no» CORTA (baja, cambio de clave) y un silencio deja seguir con la firma vigente.
 * Devuelve `{perfil}`, `{no: true}` o `{caido: true}`.
 */
async function preguntarAlKv(user, pass, token) {
  const cuerpo = token
    ? { action: 'login-google', token }
    : user && pass
      ? { action: 'login', user, pass }
      : null;
  if (!cuerpo) return { no: true };
  // 🔑 Un tropiezo de bdi-catalogo (no contesta, 5xx, respuesta rota) se reintenta UNA vez antes de
  // contestar 403: sin esto, un segundo de corte allá le decía «Necesitás estar logueado» a alguien
  // logueado (16-oct-2026). Una respuesta clara de «no» (ok:false) ⛔ se reintenta: es la respuesta.
  for (let intento = 0; intento < 2; intento++) {
    try {
      const r = await fetch(USU_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      return d && d.ok && d.perfil ? { perfil: d.perfil } : { no: true };
    } catch {
      if (intento === 0) await new Promise((ok) => setTimeout(ok, 400));
    }
  }
  return { caido: true };
}

/**
 * Guard de los handlers: devuelve el perfil, o contesta 403 y devuelve null.
 *
 *   const perfil = await exigirUsuario(req, res);
 *   if (!perfil) return;
 */
export async function exigirUsuario(req, res) {
  const perfil = await resolverPerfil(req, res);
  if (!perfil) {
    res.status(403).json({ error: 'Necesitás estar logueado en el Monitor para hacer esto.' });
    return null;
  }
  return perfil;
}

/**
 * **El login propio** (fase Bases, paso 3, 21-oct-2026): bdi-catalogo deja de ser una pregunta
 * de CADA request.
 *
 *   1. Firma fresca (<10 min) ⇒ el perfil sale de la firma, sin red.
 *   2. Si no, se le pregunta a bdi-catalogo con la credencial de siempre:
 *      - dice que sí ⇒ ese perfil, y la respuesta lleva una firma nueva (`x-monitor-sesion`);
 *      - dice que NO ⇒ nada, aunque la firma siga viva: así se cortan una baja o un cambio de clave;
 *      - NO CONTESTA ⇒ la firma vieja vale hasta su vencimiento (12 h). Es para lo que existe:
 *        con bdi-catalogo caído, la Caja con la sesión iniciada sigue cobrando.
 *
 * ⚠️ La firma sola, sin credencial al lado, sólo vale fresca: pasados los 10 minutos tiene que haber
 * con qué preguntar. Si no, alguien que se llevó la firma la usaría las 12 horas.
 * Sin `MONITOR_SESION_SECRETO` esto es exactamente lo de antes.
 */
async function resolverPerfil(req, res) {
  const { user, pass, token, sesion } = credenciales(req);
  const secreto = secretoSesion();
  const firmada = sesion ? abrirSesion(sesion, secreto) : null;
  // Una firma de OTRA persona que la del sobre ⛔ cuenta: el sobre manda.
  const deEsteUsuario = firmada && (!user || firmada.perfil.name === user) ? firmada : null;
  if (deEsteUsuario?.fresca) return deEsteUsuario.perfil;

  const r = await preguntarAlKv(user, pass, token);
  if (r.perfil) {
    const nueva = firmarSesion(r.perfil, secreto);
    if (nueva && res && typeof res.setHeader === 'function') res.setHeader(CABECERA_SESION, nueva);
    return r.perfil;
  }
  if (r.caido && deEsteUsuario) return deEsteUsuario.perfil;
  return null;
}

/**
 * **Quién es quién**: el equipo con su función, y nada más.
 *
 * # Para qué
 *
 * La Agenda necesita saber si un pendiente está dirigido a Dirección (`lib/agenda/jerarquia.core.js`)
 * y el destino puede venir **por nombre**, así que hay que poder traducir nombre → función. Ese dato
 * vive en el padrón, que está en el KV de `bdi-catalogo`.
 *
 * # 🔑 Por qué NO es admin-only, si el padrón lo es
 *
 * Hay dos puertas y no son la misma. El POST `{action:'config'}` —el que usa `traerConfigAdmin`—
 * pide credencial de administrador y devuelve la config para editarla. El **GET** contesta a
 * cualquiera que esté logueado en el Monitor, con la misma credencial que ya viaja en cada request,
 * y devuelve la config **sin contraseñas**. Es el que se usa acá.
 *
 * ⚠️ Y de todo eso **acá sale sólo `{name, funcion}`**. El achique se hace en este archivo y no en
 * el llamador a propósito: lo que no se devuelve no se puede filtrar por accidente más adelante, y
 * el resto de la config (los permisos de cada uno, quién es admin, los mails) no tiene por qué
 * entrar a ningún handler que lo único que quiera saber sea de qué sector es alguien.
 *
 * # El caché, y por qué es corto
 *
 * El GET de la Agenda lo dispara también el poll de avisos, o sea cada tres minutos por persona.
 * Sin caché serían dos idas a `bdi-catalogo` por request en vez de una. 60 segundos es el plazo en
 * el que un cambio de función se propaga: nadie edita el padrón esperando que el efecto sea
 * instantáneo, y el que lo edita es admin y ve todo igual.
 *
 * ⚠️ **No agrega un modo de falla nuevo**: `exigirUsuario` ya le pregunta a `bdi-catalogo` en cada
 * request. Si se cae, esto devuelve `[]` y el llamador decide — la Agenda muestra de más en lectura
 * y **cierra la escritura**, que es el lado correcto para cada uno.
 */
let equipoCache = { at: 0, lista: [] };
const EQUIPO_TTL_MS = 60 * 1000;

export async function equipoDelPadron(req, ahora = Date.now()) {
  if (ahora - equipoCache.at < EQUIPO_TTL_MS) return equipoCache.lista;
  // El sobre se REARMA con la credencial sola: la sesión firmada del Monitor ⛔ sale a bdi-catalogo.
  const { user, pass, token } = credenciales(req);
  const sobre = Buffer.from(JSON.stringify(token ? { token } : { user, pass }), 'utf8').toString('base64');
  try {
    const r = await fetch(USU_API, { headers: { 'x-monitor-auth': sobre } });
    const d = await r.json();
    const users = (d && d.config && d.config.users) || [];
    const lista = users
      .filter((u) => u && u.name)
      .map((u) => ({ name: u.name, funcion: Array.isArray(u.funcion) ? u.funcion : u.funcion ? [u.funcion] : [] }));
    // Una lista vacía NO se cachea: sería congelar por un minuto el resultado de una caída.
    if (lista.length) equipoCache = { at: ahora, lista };
    return lista;
  } catch {
    return [];
  }
}

/**
 * El padrón para la lista de encargadas del POS (`lib/erp/encargadas.core.js`): `{name, apodo, funcion, admin, cuenta}`.
 * Sin caché (se pide al abrir la ventana del PIN). `null` = no se pudo leer ⇒ la pantalla deja escribir el usuario.
 * ⚠️ `admin` entra SÓLO para sacarlo de esa lista: el handler devuelve nombres, ⛔ este padrón.
 */
export async function padronParaEncargadas(req) {
  const { user, pass, token } = credenciales(req);
  const sobre = Buffer.from(JSON.stringify(token ? { token } : { user, pass }), 'utf8').toString('base64');
  try {
    const r = await fetch(USU_API, { headers: { 'x-monitor-auth': sobre } });
    const users = (await r.json())?.config?.users;
    if (!Array.isArray(users)) return null;
    return users.filter((u) => u && u.name).map((u) => ({ name: u.name, apodo: u.apodo || null, funcion: u.funcion ?? null, admin: !!u.admin, cuenta: u.cuenta ?? null }));
  } catch {
    return null;
  }
}

/** Sólo para los tests: el caché es de módulo y vive entre casos. */
export function _olvidarEquipo() {
  equipoCache = { at: 0, lista: [] };
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

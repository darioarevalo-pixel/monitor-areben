/**
 * **Caminar el alta pública contra PRODUCCIÓN** (30-ago-2026).
 *
 * 🔑 **Por qué hace falta un script y ⛔ no alcanza el chunk servido**: el alta vive en una función
 * serverless (`api/_reclamo.js`), que ⛔ no entra al bundle del navegador ⇒ el oráculo del deploy
 * ⛔ no puede ser un texto nuevo. **Es el comportamiento**, y el más limpio es éste: antes de este
 * commit, un POST con `accion: 'alta'` caía en la puerta del token y contestaba **404**; ahora un
 * alta mal formada contesta **400**. Un 404 en la primera prueba = ⛔ no está deployado.
 *
 * ⚠️ **El camino feliz ⛔ no se puede caminar desde acá**: hace falta **el mail con el que se
 * compró**, y ⛔ no hay forma de leerlo —`mail_diag` contesta sí o no y ⛔ nunca cuál, a propósito—.
 * Eso lo camina Bruno con el mail de una orden real, pasándolo por `MAIL=` (ver abajo). Sin él, lo
 * que se prueba es **todo lo que tiene que cerrarse**, que es la mitad que importa en una puerta
 * abierta a internet.
 *
 * ⛔ **⛔ No siembra nada** salvo que se le pase `MAIL=`, y en ese caso borra lo que creó.
 *
 * Uso:  node scripts/caminar-alta-publica.mjs
 *       MAIL=el@mail.real ORDEN=21033 node scripts/caminar-alta-publica.mjs
 */
import { leerEnv } from './lib/kv-auth.mjs';

const env = leerEnv();
const BASE = process.env.BASE || 'https://monitorareben.vercel.app';
const ORDEN = process.env.ORDEN || '21033';
const MAIL = process.env.MAIL || '';
const URL_SB = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;

const alta = async (body) => {
  const r = await fetch(`${BASE}/api/postventa?recurso=reclamo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'reclamo', accion: 'alta', ...body }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

let ok = 0, mal = 0;
const chequear = (nombre, cond, detalle = '') => {
  console.log(`${cond ? '✅' : '❌'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (cond) ok++; else mal++;
};

const BIEN = { store: 'bdi', orden: ORDEN, mail: 'nadie@ejemplo.com', opcion: 'talle', productos: [0] };

// 1 · EL ORÁCULO DEL DEPLOY. Antes de este commit esto era 404 (la puerta del token).
const forma = await alta({ ...BIEN, orden: 'abc' });
chequear('el alta está deployada: una orden mal formada da 400 y ⛔ no 404', forma.status === 400, `status ${forma.status}`);
chequear('y el 400 ⛔ no cuenta qué estaba mal', !JSON.stringify(forma.body || {}).includes('orden-'), JSON.stringify(forma.body));

// 2 · Las puertas que tienen que cerrarse.
chequear('una marca desconocida no pasa', (await alta({ ...BIEN, store: 'otra' })).status === 400);
chequear('sin productos no pasa', (await alta({ ...BIEN, productos: [] })).status === 400);
chequear('una opción inventada no pasa', (await alta({ ...BIEN, opcion: 'sin_stock' })).status === 400);
chequear('un mail que no es mail no pasa', (await alta({ ...BIEN, mail: 'nada' })).status === 400);

// 3 · 🔴 El cruce: un mail que ⛔ no es el de la orden da 404 pelado, y ⛔ no crea nada.
const ajeno = await alta(BIEN);
chequear('🔴 un mail ajeno da 404 y ⛔ no abre nada', ajeno.status === 404, `status ${ajeno.status}`);
chequear('el 404 ⛔ no dice si la orden existe', !JSON.stringify(ajeno.body || {}).includes(ORDEN), JSON.stringify(ajeno.body));

// 4 · Una orden que ⛔ no existe se ve IGUAL que un mail equivocado.
const inexistente = await alta({ ...BIEN, orden: '999999' });
chequear('🔴 una orden inexistente contesta lo MISMO', inexistente.status === ajeno.status && JSON.stringify(inexistente.body) === JSON.stringify(ajeno.body));

// 5 · El mail ⛔ no viaja por la URL. El otro repo lo rechaza con 400, pero el que ⛔ no lo escribe
//     es éste: acá se verifica que la puerta pública ⛔ no acepte el mail por query string.
const porUrl = await fetch(`${BASE}/api/postventa?recurso=reclamo&mail=${encodeURIComponent('x@y.com')}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ recurso: 'reclamo', accion: 'alta', ...BIEN, mail: undefined }),
});
chequear('sin mail en el body ⛔ no pasa, aunque venga en la URL', porUrl.status === 400, `status ${porUrl.status}`);

// 6 · El camino feliz, sólo con el mail real.
if (MAIL) {
  const r = await alta({ ...BIEN, mail: MAIL, opcion: 'talle' });
  chequear('🔑 con el mail correcto abre y devuelve token', r.status === 200 && /^[a-f0-9]{64}$/.test(String(r.body?.token || '')), `status ${r.status} ${JSON.stringify(r.body)}`);
  const token = String(r.body?.token || '');
  if (token && !r.body?.yaExistia && URL_SB && KEY) {
    const cab = { apikey: KEY, Authorization: `Bearer ${KEY}` };
    const fila = await (await fetch(`${URL_SB}/rest/v1/devoluciones?token=eq.${token}&select=id,estado,motivo,usuario,items,orden_tn,reclamo_correo_estado,stock_estado`, { headers: cab })).json();
    const f = fila[0] || {};
    console.log('   fila cruda:', JSON.stringify(f));
    // 🔑 El oráculo por OTRO camino que el hecho: la fila se lee por PostgREST, ⛔ no por la API.
    chequear('nace en borrador, a nombre del cliente, con el motivo de la opción', f.estado === 'borrador' && f.usuario === 'cliente' && f.motivo === 'talle');
    chequear('⛔ ningún pendiente prendido', f.reclamo_correo_estado === 'no_aplica' && f.stock_estado === 'no_aplica');
    chequear('los ítems salieron de la orden y ⛔ no traen precio', Array.isArray(f.items) && f.items.length === 1 && !('precio' in (f.items[0] || {})));
    // Segundo intento: tiene que devolver EL MISMO token, ⛔ no crear otro.
    const otra = await alta({ ...BIEN, mail: MAIL, opcion: 'fallado' });
    chequear('🔑 un segundo alta devuelve el MISMO link, ⛔ no un segundo expediente', otra.body?.token === token && otra.body?.yaExistia === true);
    await fetch(`${URL_SB}/rest/v1/devoluciones?id=eq.${f.id}`, { method: 'DELETE', headers: cab });
    const quedó = await (await fetch(`${URL_SB}/rest/v1/devoluciones?id=eq.${f.id}&select=id`, { headers: cab })).json();
    chequear('la fila sembrada se borró', quedó.length === 0);
  }
} else {
  console.log('\n⚠️ El camino feliz ⛔ NO se caminó: falta el mail real de la orden. Correr con MAIL=…');
}

console.log(`\n${ok} de ${ok + mal}`);
process.exit(mal ? 1 : 0);

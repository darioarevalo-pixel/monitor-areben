/**
 * **Caminar en vivo el portal del cliente** contra BDI de producción (D16 de la auditoría del
 * 28-ago-2026).
 *
 * 🔴 **Por qué existe.** Es **lo único de todo el módulo abierto a internet**, y la regla de cuándo
 * contesta estaba escrita dos veces —`ESTADOS_CON_LINK` en la app y `ABIERTO` en el handler— con un
 * comentario que decía *«tiene que ser el mismo conjunto»*. Ya habían dejado de coincidir: un
 * **cambio decidido vuelve a `borrador` a propósito**, así que el link mandado antes seguía
 * abriendo — y `accion: 'enviar'` le escribía `estado: 'en_revision'`, o sea que **el cliente podía
 * mover para atrás una fila ya resuelta**, desde afuera y sin sesión.
 *
 * 🔑 **Y lo que sólo se puede verificar contra la base de verdad**: que `compensacion` **vuelva del
 * `select`**. Los tests corren con un Supabase de mentira que devuelve la fila entera, así que una
 * columna mal nombrada dejaría el freno mirando `undefined` —dejando pasar justo lo que vino a
 * frenar— **con todo en verde**.
 *
 * 🔑 Corre el handler **en proceso**: el arreglo todavía no está deployado.
 *
 * ⚠️ Siembra sus propias filas y las borra al final. Las reales ⛔ no se tocan.
 *
 * Uso: node scripts/caminar-portal-cliente.mjs
 */
import { randomUUID } from 'node:crypto';
import { leerEnv } from './lib/kv-auth.mjs';

const env = leerEnv();
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

const URL_SB = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;
if (!URL_SB || !KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el .env'); process.exit(1); }

const { default: handler } = await import('../api/_reclamo.js');

const sb = (path, init = {}) => fetch(`${URL_SB}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
});

function resFalso() {
  const r = {
    code: 0, body: null,
    setHeader() {}, status(c) { r.code = c; return r }, json(b) { r.body = b; return r }, end() { return r },
  };
  return r;
}

const abrir = async (token) => {
  const res = resFalso();
  await handler({ method: 'GET', headers: {}, query: { token }, body: null }, res);
  return { status: res.code, ...(res.body || {}) };
};
const enviar = async (token) => {
  const res = resFalso();
  await handler({ method: 'POST', headers: {}, query: {}, body: { token, accion: 'enviar', relato: 'CAMINATA — no debería escribirse' } }, res);
  return { status: res.code, ...(res.body || {}) };
};

let ok = 0, mal = 0;
const chequear = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { mal++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};

const nuevoToken = () => randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
const leer = async (id) => (await (await sb(`devoluciones?id=eq.${id}&select=*`)).json())[0];
const borrar = (id) => sb(`devoluciones?id=eq.${id}`, { method: 'DELETE' });

const sembrar = async (extra) => {
  const token = nuevoToken();
  const [fila] = await (await sb('devoluciones', {
    method: 'POST',
    body: JSON.stringify({
      store: 'bdi', motivo: 'falla', cliente: 'CAMINATA PORTAL — BORRAR', orden_tn: '000000',
      token, token_vence: new Date(Date.now() + 86400000).toISOString(),
      items: [{ sku: 'CAM-1', producto: 'PRODUCTO DE PRUEBA', cantidad: 1, precio: '20000.00' }],
      stock_estado: 'no_aplica', reintegro_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
      historial: [], ...extra,
    }),
  })).json();
  return { id: fila.id, token };
};

const antes = await (await sb('devoluciones?store=eq.bdi&select=id')).json();
console.log(`\nFilas reales de BDI antes: ${antes.length}\n`);

const sembradas = [];
try {
  // ── 1. Un reclamo abierto de verdad: el portal tiene que contestar ──────────
  console.log('1. Un reclamo esperando las fotos del cliente');
  const vivo = await sembrar({ estado: 'esperando_cliente', compensacion: null });
  sembradas.push(vivo.id);
  const r1 = await abrir(vivo.token);
  chequear('el link abre (200)', r1.status === 200, JSON.stringify(r1).slice(0, 160));
  chequear('y trae su número', r1.reclamo?.numero === `R-${String(vivo.id).padStart(4, '0')}`, r1.reclamo?.numero);
  chequear('🔑 y ⛔ NO filtra `compensacion` (entró al select por la regla)',
    !('compensacion' in (r1.reclamo || {})), JSON.stringify(Object.keys(r1.reclamo || {})));

  // ── 2. El caso de D16: un CAMBIO ya decidido, que vive en «borrador» ────────
  console.log('\n2. 🔴 Un cambio YA DECIDIDO, que vuelve a «borrador» a propósito');
  const cambio = await sembrar({ estado: 'borrador', compensacion: 'otro_producto' });
  sembradas.push(cambio.id);
  const r2 = await abrir(cambio.token);
  chequear('🔴 el link ⛔ NO abre: 404, igual que un token inventado', r2.status === 404, JSON.stringify(r2));

  const relatoAntes = (await leer(cambio.id)).relato_cliente;
  const estadoAntes = (await leer(cambio.id)).estado;
  const r2b = await enviar(cambio.token);
  chequear('🔴 y `enviar` tampoco: 404', r2b.status === 404, JSON.stringify(r2b));
  const f2 = await leer(cambio.id);
  chequear('🔴 la fila ⛔ NO se movió a «en_revision»', f2.estado === estadoAntes, `${estadoAntes} → ${f2.estado}`);
  chequear('⛔ ni le entró el relato', f2.relato_cliente === relatoAntes, JSON.stringify(f2.relato_cliente));

  // ── 3. Las otras puertas siguen igual ──────────────────────────────────────
  console.log('\n3. Las puertas que ya estaban');
  const resuelto = await sembrar({ estado: 'resuelto', compensacion: 'plata_total' });
  sembradas.push(resuelto.id);
  chequear('un reclamo resuelto tampoco abre', (await abrir(resuelto.token)).status === 404);

  const vencido = await sembrar({ estado: 'en_revision', compensacion: null, token_vence: '2020-01-01T00:00:00Z' });
  sembradas.push(vencido.id);
  chequear('un token vencido tampoco', (await abrir(vencido.token)).status === 404);

  chequear('un token que no existe tampoco', (await abrir(nuevoToken())).status === 404);
  chequear('y uno con forma inválida ni se consulta', (await abrir('no-es-un-token')).status === 404);
} finally {
  for (const id of sembradas) await borrar(id);
  console.log(`\nBorradas las filas sembradas: ${sembradas.join(', ')}`);
}

const despues = await (await sb('devoluciones?store=eq.bdi&select=id')).json();
chequear(`las ${antes.length} filas reales quedaron intactas`, despues.length === antes.length, `ahora hay ${despues.length}`);

console.log(`\n${ok} de ${ok + mal}`);
process.exit(mal ? 1 : 0);

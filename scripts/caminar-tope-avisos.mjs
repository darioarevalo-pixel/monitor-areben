/**
 * **Caminar en vivo el recorte del aviso del sidebar** contra BDI de producción (D12).
 *
 * 🔴 **Lo que los tests ⛔ NO pueden decir.** El Supabase de mentira **ignora el `.in`**: devuelve la
 * fila entera pida lo que pida el handler, así que un filtro mal escrito —una lista con un estado de
 * más, un nombre de columna equivocado— sale **verde**. Lo único que contesta si el recorte
 * realmente recorta es la base.
 *
 * 🔑 Corre el handler **en proceso** (el arreglo todavía no está deployado) y el **oráculo viene por
 * otro camino**: se cuenta por PostgREST con la service key.
 *
 * ⚠️ Siembra sus propias filas y las borra. Las reales ⛔ no se tocan.
 *
 * Uso: node scripts/caminar-tope-avisos.mjs
 */
import { leerEnv, authKv } from './lib/kv-auth.mjs';
import { ESTADOS_ABIERTOS } from '../lib/reclamos/casos.core.js';

const env = leerEnv();
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

const URL_SB = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;
if (!URL_SB || !KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el .env'); process.exit(1); }
const auth = authKv(env);

const { default: handler } = await import('../api/_reclamos.js');

const sb = (path, init = {}) => fetch(`${URL_SB}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
});

function resFalso() {
  const r = { code: 0, body: null, setHeader() {}, status(c) { r.code = c; return r }, json(b) { r.body = b; return r }, end() { return r } };
  return r;
}
const leerVista = async (query) => {
  const res = resFalso();
  await handler({ method: 'GET', headers: auth, query, body: null }, res);
  return { status: res.code, ...(res.body || {}) };
};

let ok = 0, mal = 0;
const chequear = (n, cond, det = '') => { if (cond) { ok++; console.log(`  ✓ ${n}`) } else { mal++; console.log(`  ✗ ${n}${det ? ` — ${det}` : ''}`) } };
const borrar = (id) => sb(`devoluciones?id=eq.${id}`, { method: 'DELETE' });

const sembrar = async (estado) => {
  const [f] = await (await sb('devoluciones', {
    method: 'POST',
    body: JSON.stringify({
      store: 'bdi', motivo: 'falla', cliente: `CAMINATA TOPE ${estado} — BORRAR`, orden_tn: '000000',
      estado, items: [{ sku: 'CAM-1', producto: 'PRUEBA', cantidad: 1, precio: '1.00' }],
      stock_estado: 'no_aplica', reintegro_estado: 'no_aplica', tn_stock_estado: 'no_aplica', historial: [],
    }),
  })).json();
  return f.id;
};

const antes = await (await sb('devoluciones?store=eq.bdi&select=id')).json();
console.log(`\nFilas reales de BDI antes: ${antes.length}\n`);

const sembradas = [];
try {
  console.log('1. Una fila CERRADA y una ABIERTA, sembradas');
  const cerrada = await sembrar('cerrado'); sembradas.push(cerrada);
  const abierta = await sembrar('esperando_cliente'); sembradas.push(abierta);

  const avisos = await leerVista({ store: 'bdi', vista: 'avisos' });
  chequear('el aviso contesta 200', avisos.status === 200, JSON.stringify(avisos).slice(0, 120));
  const ids = (avisos.devoluciones || []).map((d) => d.id);
  chequear('🔴 la ABIERTA está', ids.includes(abierta), JSON.stringify(ids));
  chequear('🔴 y la CERRADA ⛔ NO — el filtro filtra de verdad', !ids.includes(cerrada), JSON.stringify(ids));
  chequear('⛔ ni una sola fila fuera de ESTADOS_ABIERTOS',
    (avisos.devoluciones || []).every((d) => ESTADOS_ABIERTOS.includes(d.estado)),
    JSON.stringify([...new Set((avisos.devoluciones || []).map((d) => d.estado))]));

  // 🔑 El oráculo por el otro camino: contar por PostgREST.
  const abiertosSb = await (await sb(`devoluciones?store=eq.bdi&estado=in.(${ESTADOS_ABIERTOS.join(',')})&select=id`)).json();
  chequear('y trae EXACTAMENTE los que dice la base', ids.length === abiertosSb.length, `${ids.length} vs ${abiertosSb.length}`);
  chequear('⛔ no dice que cortó, porque ⛔ no cortó', avisos.hayMas === false, String(avisos.hayMas));

  console.log('\n2. Del más viejo al más nuevo');
  const fechas = (avisos.devoluciones || []).map((d) => Date.parse(d.created_at));
  chequear('🔴 vienen ordenados ascendente', fechas.every((f, i) => i === 0 || f >= fechas[i - 1]), JSON.stringify(fechas.slice(0, 5)));

  console.log('\n3. El listado SÍ baja lo cerrado (la pestaña «Todos» existe)');
  const listado = await leerVista({ store: 'bdi' });
  const idsL = (listado.devoluciones || []).map((d) => d.id);
  chequear('la cerrada está en el listado', idsL.includes(cerrada), JSON.stringify(idsL));
  chequear('y ⛔ no dice que cortó', listado.hayMas === false, String(listado.hayMas));

  console.log('\n4. Un tope chico: el listado corta Y LO DICE');
  const corto = await leerVista({ store: 'bdi', limit: '1' });
  chequear('devuelve 1 sola', (corto.devoluciones || []).length === 1, String((corto.devoluciones || []).length));
  chequear('🔴 y avisa que hay más', corto.hayMas === true, String(corto.hayMas));
} finally {
  for (const id of sembradas) await borrar(id);
  console.log(`\nBorradas las filas sembradas: ${sembradas.join(', ')}`);
}

const despues = await (await sb('devoluciones?store=eq.bdi&select=id')).json();
chequear(`las ${antes.length} filas reales quedaron intactas`, despues.length === antes.length, `ahora hay ${despues.length}`);

console.log(`\n${ok} de ${ok + mal}`);
process.exit(mal ? 1 : 0);

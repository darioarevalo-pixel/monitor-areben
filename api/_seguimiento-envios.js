// Seguimiento de envíos: los paquetes despachados y lo que dice el Correo de cada uno. Sólo lee.
//
//   GET ?recurso=seguimiento-envios&store=bdi|zattia → { ok, retiro, trabados, volvieron, resumen, desde, leidoEn, sinCodigo, correoCaido }
//
// ⛔ Archivo `_`: entra por `api/datos.js`. Las decisiones viven en `lib/seguimiento-envios/core.core.js`.
// 🔑 Se lee en vivo y se recuerda unos minutos, ⛔ hay tabla hasta que haya avisos que registrar.
// 🔴 `api/datos.js` corta a los 30 s: de ahí los tramos en paralelo.
// 🔴 Cada tramo son 3 pedidos a TN, con un cupo compartido con Envíos, Cobros y el resto. Un tramo que pasa
// de 200 órdenes se tira y se repite: con 15 días en BDI eran unos 66 pedidos y dio 429 (5-nov). Por eso cada
// tienda tiene su largo, y el resultado se recuerda unos minutos.
// 🔴 Una lectura incompleta de TN contesta error: ⛔ una lista a medias, que parecería que no hay nada más.
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { armarSolapas, esDelCorreo, leerHistoriaCorreo, leerPiezaCorreo, tramosDeFechas } from '../lib/seguimiento-envios/core.core.js';

const AUDIT = process.env.CATALOGO_AUDIT_URL || 'https://bdi-catalogo.vercel.app/api/tiendanube-audit';
const CORREO = 'https://www.correoargentino.com.ar/sites/all/modules/custom/ca_forms/api/wsFacade.php';
// 🔑 Stunned tiene Tienda Nube propia pero en el monitor es una línea de Zattia.
const TIENDAS = { bdi: ['bdi'], zattia: ['zattia', 'stunned'] };
const DIAS = 90;
// Órdenes en 90 días, medido 5-nov: BDI 1.454 · Zattia 780 · Stunned 41. Quedan por debajo del corte de 200.
const LARGO_TRAMO = { bdi: 10, zattia: 15, stunned: DIAS };
const A_LA_VEZ_TN = 3;
const MEMORIA_MS = 5 * 60_000;
const ESPERA_429_MS = 2_000;
const REINTENTOS_429 = 2;
const A_LA_VEZ_CORREO = 6;

const diaAR = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);

async function enTandas(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  const trabajar = async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k]); }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajar));
  return res;
}

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Órdenes de un tramo. Si TN corta en el límite de 200, se parte en dos: ⛔ se pierde ninguna. */
async function ordenesDelTramo(tienda, sobre, desde, hasta, intento = 0) {
  const qs = `ordenes=1&store=${tienda}&from=${diaAR(desde)}&to=${diaAR(hasta)}&limite=200&modo=lista`;
  const r = await fetch(`${AUDIT}?${qs}`, { headers: { 'x-monitor-auth': sobre } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) {
    if (/\b429\b/.test(String(d.error)) || r.status === 429) {
      if (intento < REINTENTOS_429) {
        await dormir(ESPERA_429_MS * (intento + 1));
        return ordenesDelTramo(tienda, sobre, desde, hasta, intento + 1);
      }
      throw new Error('Tienda Nube está recibiendo demasiados pedidos. Probá de nuevo en unos minutos.');
    }
    throw new Error(d.error || `No se pudieron leer las órdenes de ${tienda} (${r.status}).`);
  }
  if (!d.truncado) return d.ordenes || [];
  if (diaAR(desde) === diaAR(hasta)) throw new Error(`Tienda Nube cortó las órdenes de ${tienda} del ${diaAR(desde)}.`);
  const medio = new Date((desde.getTime() + hasta.getTime()) / 2);
  const siguiente = new Date(medio.getTime() + 86_400_000);
  const [a, b] = await Promise.all([ordenesDelTramo(tienda, sobre, desde, medio), ordenesDelTramo(tienda, sobre, siguiente, hasta)]);
  return [...a, ...b];
}

/** La historia y el HC de un paquete. `filas: null` si el Correo no contestó o vino sin filas: es el aviso de que cambió la página. */
async function historiaDelCorreo(codigo) {
  try {
    const r = await fetch(CORREO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0' },
      body: `action=ecommerce&id=${encodeURIComponent(codigo)}`,
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { filas: null, pieza: null };
    const html = await r.text();
    const filas = leerHistoriaCorreo(html);
    return { filas: filas.length ? filas : null, pieza: leerPiezaCorreo(html) };
  } catch {
    return { filas: null, pieza: null };
  }
}

async function leerSeguimiento(store, sobre) {
  const ahora = new Date();
  const trabajos = TIENDAS[store].flatMap((tienda) => (
    tramosDeFechas(ahora, DIAS, LARGO_TRAMO[tienda]).map((t) => ({ tienda, ...t }))
  ));
  const partes = await enTandas(trabajos, A_LA_VEZ_TN, async (t) => (
    (await ordenesDelTramo(t.tienda, sobre, t.desde, t.hasta)).map((orden) => ({ tienda: t.tienda, orden }))
  ));
  // Los tramos no se pisan, pero el corte por día de TN puede repetir una orden en el borde.
  const unicas = [...new Map(partes.flat().map((x) => [`${x.tienda}/${x.orden.id}`, x])).values()];

  const paraConsultar = unicas.filter((x) => esDelCorreo(x.orden));
  const sinCodigo = unicas.filter((x) => x.orden.envio_estado === 'shipped' && x.orden.estado_orden !== 'cancelled' && !x.orden.envio_tracking).length;
  const leidos = await enTandas(paraConsultar, A_LA_VEZ_CORREO, async (x) => ({ ...x, ...(await historiaDelCorreo(x.orden.envio_tracking)) }));

  const solapas = armarSolapas(leidos, ahora.getTime());
  return {
    ok: true,
    ...solapas,
    sinCodigo,
    // ⚠️ Es la página pública del Correo, ⛔ una API oficial: si deja de dar filas, se tiene que notar.
    correoCaido: leidos.length > 0 && solapas.resumen.sinLeer.length === leidos.length,
    desde: diaAR(new Date(ahora.getTime() - (DIAS - 1) * 86_400_000)),
    leidoEn: ahora.toISOString(),
  };
}

// Por marca, en la memoria de la función: abrir la pantalla varias veces ⛔ vuelve a gastar el cupo de TN, y dos
// pedidos a la vez comparten la misma lectura. Se chequea el permiso ANTES. Lo que falla ⛔ se recuerda.
const memoria = new Map();

function recordado(store, sobre) {
  const hay = memoria.get(store);
  if (hay && Date.now() - hay.cuando < MEMORIA_MS) return hay.lectura;
  const lectura = leerSeguimiento(store, sobre);
  memoria.set(store, { cuando: Date.now(), lectura });
  lectura.catch(() => { memoria.delete(store); });
  return lectura;
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'método no permitido' });

  const store = String(req.query.store || '').toLowerCase();
  if (!TIENDAS[store]) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });
  if (!puedeVerAlguna(perfil, store, ['seguimiento-envios'])) {
    return res.status(403).json({ error: 'No tenés acceso a Seguimiento de envíos de esta marca.' });
  }
  const sobre = req.headers && req.headers['x-monitor-auth'];
  if (!sobre) return res.status(400).json({ error: 'Falta la credencial para hablar con el catálogo.' });

  try {
    return res.status(200).json(await recordado(store, sobre));
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : 'No se pudo leer el seguimiento.' });
  }
}

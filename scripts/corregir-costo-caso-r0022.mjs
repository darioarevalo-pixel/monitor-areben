/**
 * **Corrección de una celda en producción: el `costo_caso` de R-0022** (28-ago-2026).
 *
 * La fila se resolvió el 28-ago a las 13:36 cuando el local apretó «Aceptó» sobre la oferta de
 * retención. Esa rama ⛔ no recalculaba `costo_caso`, así que quedó el de la decisión vieja —con
 * $6.500 de un envío de vuelta que aceptar acababa de apagar—: la pantalla mostraba *«Se le devuelve
 * $13.491»* al lado de *«Lo que nos costó $20.682»*.
 *
 * 🔑 **El número nuevo ⛔ no se tipea: sale de `costoDeLaFila`**, la misma función que desde hoy
 * escriben `decidir`, `editar` y aceptar la oferta. Si se tipeara, esto sería una segunda opinión
 * sobre la misma cuenta — que es el defecto que se está arreglando.
 *
 * Corre en seco por defecto. Para escribir: `node --env-file=.env scripts/corregir-costo-caso-r0022.mjs --escribir`
 */
import { costoDeLaFila, ENTRADAS_DEL_COSTO } from '../lib/reclamos/plata.core.js';

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const STORE = 'bdi';
const ID = 22;
const ESCRIBE = process.argv.includes('--escribir');

const cabeceras = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const pedir = async (ruta, opciones = {}) => {
  const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { ...opciones, headers: { ...cabeceras, ...opciones.headers } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
};

const cols = [...ENTRADAS_DEL_COSTO, 'id', 'orden_tn', 'costo_caso', 'historial'].join(',');
const [fila] = await pedir(`devoluciones?select=${cols}&store=eq.${STORE}&id=eq.${ID}`);
if (!fila) throw new Error(`no existe el reclamo ${ID} en ${STORE}`);

const nuevo = costoDeLaFila(fila);
console.log(`R-00${ID} (orden #${fila.orden_tn})`);
console.log(`  compensación ${fila.compensacion} · devuelto ${fila.monto_total} · retorno ${fila.retorno_decidido} · envío de vuelta ${fila.envio_costo}`);
console.log(`  costo_caso guardado: ${fila.costo_caso}`);
console.log(`  costo_caso derivado: ${nuevo}`);

if (fila.costo_caso === nuevo) { console.log('  ⇒ ya está al día, no hay nada que escribir.'); process.exit(0); }
if (!ESCRIBE) { console.log('  ⇒ en seco. Con --escribir se corrige.'); process.exit(0); }

const historial = [
  ...(Array.isArray(fila.historial) ? fila.historial : []),
  {
    estado: 'resuelto',
    at: new Date().toISOString(),
    usuario: 'Monitor',
    nota: `corrección: costo_caso ${fila.costo_caso} → ${nuevo} (aceptar la oferta apagó el retorno y ⛔ no lo recalculaba)`,
  },
];
await pedir(`devoluciones?id=eq.${ID}&store=eq.${STORE}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ costo_caso: nuevo, historial, updated_at: new Date().toISOString() }),
});

// El oráculo llega por otro camino que el hecho: se relee de la base, ⛔ no se confía en el PATCH.
const [despues] = await pedir(`devoluciones?select=id,costo_caso&store=eq.${STORE}&id=eq.${ID}`);
console.log(`  ⇒ releído de la base: costo_caso = ${despues.costo_caso}`);
if (despues.costo_caso !== nuevo) { console.error('🔴 la base ⛔ no quedó con el número derivado'); process.exit(1); }
console.log('  ✅ corregido.');

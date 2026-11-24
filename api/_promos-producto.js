// Las promos de PRODUCTO vigentes, para la banda de promos (la misma que muestra las bancarias).
// Bruno, 23-nov-2026: «donde aparezcan promociones bancarias, también aparezcan las promociones de
// productos vigentes». Decidió que ⛔ se cargan a mano: se LEEN de donde ya viven.
//
//   · canal 'web'       → Resorty (`/api/promos-vigentes?cuenta=`): lo que el widget anuncia y el
//                         carrito cobra en la tienda online. Zattia trae también lo de Stunned.
//   · canal 'mostrador' → la Caja de la marca (`caja_config.reglas.promos`): lo que cobra el POS.
//
// 🔴 **Nunca tira.** La agenda es el GET del shell: que Resorty no conteste o falte una base no puede
// dejar al mostrador sin la promo bancaria. Cada fuente que falla vuelve vacía y se anota en `fallas`.
// ⛔ Filtra por fecha: el día lo decide el navegador (`hoyIso()`), igual que las bancarias.
// ⚠️ Lo que se arma SÓLO en el admin de Tienda Nube (otra compra cruzada, envío gratis) ⛔ llega acá.
import { createClient } from '@supabase/supabase-js';
import { cfgDeMarca } from './_recepciones-base.js';

const RESORTY = process.env.RESORTY_URL || 'https://resorty.arebensrl.com';
/** Las cuentas de Resorty de cada marca del monitor. Stunned vive dentro de Zattia en el monitor. */
const TIENDAS_WEB = { bdi: ['bdi'], zattia: ['zattia', 'stunned'] };
const NOMBRE = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' };
const TIEMPO_MS = 2500;

const plata = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;

/** «FUNDAS», «todo el local», o los productos — SIN lo excluido, que va aparte en `excluye`. */
function queAlcance(a) {
  const al = a || { tipo: 'todo' };
  const nombreProd = (x) => x.nombre || `producto ${x.id}`;
  return al.tipo === 'todo' ? 'todo el local' : al.tipo === 'categorias' ? (al.categorias || []).join(', ') : (al.productos || []).map(nombreProd).join(', ');
}

/** Lo que queda afuera del alcance (y de lo que habilita, en «llevando»), por nombre y sin repetir. */
function excluidosCaja(p) {
  const nombres = [];
  for (const al of [p.alcance, p.requiere]) {
    if (al && al.tipo !== 'productos' && Array.isArray(al.excluidos)) for (const x of al.excluidos) nombres.push(x.nombre || `producto ${x.id}`);
  }
  return [...new Set(nombres)];
}

/**
 * Una promo de la Caja en palabras, para las CONDICIONES (Bruno, 23-nov: la tarjeta lleva sólo el
 * título; con la lista de excluidos adentro, la regla ocupaba media pantalla). Misma lectura que
 * `resumen()` de `components/caja/PromosCaja.tsx`, sin las fechas y sin lo excluido.
 */
function detalleCaja(p) {
  const que =
    p.tipo === 'nxm' ? `${p.lleva}x${p.paga}`
    : p.tipo === 'segunda_unidad' ? `2ª unidad al ${p.pct}%`
    : p.tipo === 'pct' ? `${p.pct}% de descuento`
    : p.tipo === 'llevando' ? `${p.pct}% llevando ${p.requiere ? queAlcance(p.requiere) : '—'}`
    : p.tipo === 'cantidad' ? (p.escalones || []).map((e, i, l) => `${e.desde}${i === l.length - 1 ? ' o más' : ''}: ${e.pct}%`).join(' · ')
    : `${plata(p.pesos)} de descuento desde ${plata(p.minimo)}`;
  const donde = p.tipo === 'monto_minimo' ? null : `en ${queAlcance(p.alcance)}`;
  return [que, donde].filter(Boolean).join(' · ');
}

async function deResorty(cuenta) {
  const r = await fetch(`${RESORTY}/api/promos-vigentes?cuenta=${encodeURIComponent(cuenta)}`, { signal: AbortSignal.timeout(TIEMPO_MS) });
  const j = await r.json().catch(() => null);
  // La cuenta no está en Resorty: no es una falla. ⚠️ Sólo con SU error: un 404 pelado es un Resorty
  // sin la ruta (sin deployar), y tragarlo dejaría la banda vacía sin que nada avise.
  if (r.status === 404 && j && j.error === 'cuenta desconocida') return [];
  if (!r.ok || !j || !j.ok) throw new Error(`Resorty ${cuenta}: ${r.status}`);
  return (j.promos || []).map((p) => ({
    id: `web:${cuenta}:${p.id}`,
    marca: null, // la completa quien llama
    tienda: NOMBRE[cuenta] || cuenta,
    canal: 'web',
    titulo: String(p.titulo || ''),
    detalle: String(p.detalle || ''),
    excluye: Array.isArray(p.excluye) ? p.excluye.map(String) : [],
    nota: p.nota ? String(p.nota) : null,
    desde: p.desde || null,
    hasta: p.hasta || null,
  }));
}

async function deCaja(marca) {
  const cfg = cfgDeMarca(marca);
  if (!cfg.url || !cfg.key) throw new Error(`Caja ${marca}: faltan credenciales`);
  const { data, error } = await createClient(cfg.url, cfg.key).from('caja_config').select('reglas').eq('store', marca).maybeSingle();
  if (error) throw new Error(`Caja ${marca}: ${error.message}`);
  const promos = data && data.reglas && Array.isArray(data.reglas.promos) ? data.reglas.promos : [];
  return promos.filter((p) => p && p.activa !== false).map((p) => ({
    id: `local:${marca}:${p.id}`,
    marca,
    tienda: 'Local',
    canal: 'mostrador',
    titulo: String(p.nombre || ''),
    detalle: detalleCaja(p),
    excluye: excluidosCaja(p),
    nota: 'No aplica a productos en oferta ni a productos con descuento a mano.',
    desde: p.desde || null,
    hasta: p.hasta || null,
  }));
}

/** @param {string[]} marcas las que la persona puede mirar @returns {Promise<{ promos: any[], fallas: string[] }>} */
export async function promosProducto(marcas) {
  const tareas = [];
  for (const m of marcas) {
    for (const cuenta of TIENDAS_WEB[m] || []) tareas.push(deResorty(cuenta).then((ps) => ps.map((p) => ({ ...p, marca: m }))));
    tareas.push(deCaja(m));
  }
  const res = await Promise.allSettled(tareas);
  const promos = [];
  const fallas = [];
  for (const r of res) {
    if (r.status === 'fulfilled') promos.push(...r.value);
    else fallas.push(String((r.reason && r.reason.message) || r.reason));
  }
  return { promos, fallas };
}

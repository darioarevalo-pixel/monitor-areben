// El costo de los productos, servido con la clave de servicio. Pieza B del escalón 3 de la Fase S.
//
//   POST { recurso:'costos', store }            → { ok, costos:{ '<id>': <unit_cost|null> }, sinPermiso? }
//   POST { recurso:'costos', store, ids:[…] }   → idem, sólo esos product_id
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO EXISTE
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// `productos.unit_cost` lo leía el navegador derecho de Supabase con la **anon key**, que viaja en
// el bundle: 450 costos en BDI y 2.676 en Zattia para cualquiera que abriera la página. El ETL lo
// pedía **para los 14 usuarios** y quedaba en el IndexedDB de cada máquina.
//
// 🔑 **Medido el 14-ago-2026 contra el padrón real**: de 14 personas, sólo 3 ven una cifra de costo
// en pantalla (Bruno y Darío por admins, y Lorena por Post-venta). Otras 10 lo leían nada más que
// para **estamparlo** en un canje o una falla — cosa que ahora hace el servidor solo. Por eso
// gatear por permiso no le saca la pantalla a nadie.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// SIN PERMISO SE CONTESTA 200 CON LA LISTA VACÍA, NO 403
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 Es la decisión de forma que hace que esto no rompa nada. El costo es un **enriquecimiento
// opcional** del payload del ETL, no el payload: quien no lo puede ver igual necesita que la carga
// termine. Un 403 acá dejaría a 11 de 14 personas sin poder abrir el Monitor.
//
// Lo que pasa sin costos ya está medido y es lo correcto: `computarDatos` marca cada producto con
// `sinCosto: true`, y `sinCosto` y el margen **sólo se pintan en Liquidación, Márgenes y
// Comisiones** — las tres secciones que esa persona no abre. No aparecen avisos raros en las
// pantallas que sí usa.
//
// `sinPermiso` viaja igual para que el que llama pueda distinguir "no tenés permiso" de "la base
// no tiene un solo costo cargado", que se ven iguales y no son lo mismo.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';

// Las cinco secciones que muestran una cifra de costo en pantalla. Medidas contra el código, no a
// ojo: Márgenes, Proveedores, Liquidación, Comisiones y Post-venta en modo admin
// (`postventa-local` y `postventa-deposito` lo esconden con `esAdmin`, por eso no están).
//
// 📌 Gerencial NO usa costos: `lib/gerencial/` no toca `unit_cost`.
export const SECCIONES_CON_COSTO = ['margenes', 'proveedores', 'liquidacion', 'comisiones', 'postventa'];

function cfgFor(store) {
  if (store === 'zattia') {
    return {
      url: process.env.ZATTIA_SUPABASE_URL,
      key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY,
    };
  }
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

// El corte de PostgREST, que **también aplica con `supabase-js`** — medido en el escalón 2: un
// `.limit(20000)` devuelve 1.000. Zattia tiene 2.676 productos, así que sin paginar se perderían
// 1.676 costos **en silencio**: los productos existirían y aparecerían como "sin costo".
const PAGINA = 1000;

// Los ids que entran por `ids` se concatenan en el `in.(…)` de PostgREST. Se cortan en lotes por lo
// mismo que en `_crm.js`: una URL de más de ~8 KB se come el techo de un proxy.
const LOTE = 500;

/**
 * El costo de esos `product_id`, leído con la clave de servicio. **Sin permisos ni sesión**: es la
 * pieza cruda, y quien la llama decide quién puede.
 *
 * 🔑 **Existe para que haya UNA sola implementación.** La usan el handler de acá abajo (gateada por
 * permiso) y los dos que ESTAMPAN el costo sin mostrarlo —`_canjes.js` y `_fallas.js`—, que no lo
 * piden para enseñárselo a nadie sino para guardarlo. Duplicar la consulta en cada uno es cómo
 * empiezan las derivas que este repo ya pagó ocho veces.
 *
 * @param store 'bdi' | 'zattia'. **Stunned no existe acá**: sus costos son los de Zattia, y esa
 *              traducción la hace quien llama (`baseDeCostos`), que es quien sabe de canjes.
 * @returns `{ '<product_id>': <unit_cost|null> }`. Un id que no está en la tabla no aparece.
 */
export async function leerCostos(store, ids) {
  const limpios = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!limpios.length) return {};

  const cfg = cfgFor(store);
  if (!cfg.key) throw new Error(`Falta la clave de Supabase de ${store} en el entorno.`);
  const supabase = createClient(cfg.url, cfg.key);

  const costos = {};
  for (let i = 0; i < limpios.length; i += LOTE) {
    const { data, error } = await supabase
      .from('productos')
      .select('id, unit_cost')
      .in('id', limpios.slice(i, i + LOTE));
    if (error) throw new Error(error.message);
    for (const p of data || []) costos[String(p.id)] = p.unit_cost == null ? null : Number(p.unit_cost);
  }
  return costos;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const b = req.body || {};
  const store = String(b.store || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // 🔴 Tener sesión no es tener permiso, y va por `puedeVerAlguna` y no por `puedeVer` pelado para
  // que la cuenta fija siga valiendo: la `store` viene en el request, así que con `puedeVer`
  // alcanzaba con pedir la otra marca desde una cuenta clavada a una.
  if (!puedeVerAlguna(perfil, store, SECCIONES_CON_COSTO)) {
    return res.status(200).json({ ok: true, costos: {}, sinPermiso: true });
  }

  const cfg = cfgFor(store);
  if (!cfg.key) return res.status(500).json({ error: `Falta la clave de Supabase de ${store} en el entorno.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    // ── Los ids que pidieron ────────────────────────────────────────────────────────────────
    if (Array.isArray(b.ids)) {
      return res.status(200).json({ ok: true, costos: await leerCostos(store, b.ids) });
    }

    const costos = {};

    // ── Todos los activos, que es lo que pide el ETL ────────────────────────────────────────
    //
    // El filtro `active=eq.1` es el mismo del select del ETL. No hace falta que coincida para que
    // el merge ande —es por id— pero pedir de más son 2.676 filas que nadie va a mirar.
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await supabase
        .from('productos')
        .select('id, unit_cost')
        .eq('active', 1)
        .order('id')
        .range(desde, desde + PAGINA - 1);
      if (error) throw new Error(error.message);
      for (const p of data || []) costos[String(p.id)] = p.unit_cost == null ? null : Number(p.unit_cost);
      if ((data || []).length < PAGINA) break;
    }

    return res.status(200).json({ ok: true, costos });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

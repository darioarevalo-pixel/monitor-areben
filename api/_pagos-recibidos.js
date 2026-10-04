// Pagos recibidos: lo que entró a la cuenta de Mercado Pago del local
// (`/api/datos?recurso=pagos-recibidos`).
//
//   GET  ?recurso=pagos-recibidos&store=zattia[&dia=YYYY-MM-DD]
//   POST { recurso, store, action: 'verificar', token }   → de quién es la llave (no guarda)
//   POST { recurso, store, action: 'cargar', token }      → la guarda y la pone en uso
//   POST { recurso, store, action: 'usar', cuenta_id }    → vuelve a una cuenta ya cargada
//
// La pantalla pide el GET cada ~15 s. Los pagos se leen de MP en el momento —no se guardan—
// porque lo único que importa es lo que MP dice AHORA: una copia es lo que podría quedar vieja sin
// que nadie se entere. Lo que SÍ se guarda son las cuentas y desde cuándo se usa cada una
// (`sql/migrate-mp-cuentas.sql`): el local cambia de cuenta y un día viejo se busca en la suya.
//
// 🔴 **El total, los otros días y las cuentas son sólo para admin.** La empleada verifica que el
// cobro llegó y nada más (decisión de Darío, 2-oct-2026); el total lo usa Dirección para cruzarlo
// con el cierre de caja. Por eso el servidor ⛔ los manda a quien no es admin: esconderlos sólo en
// la pantalla no esconde nada. Cambiar de cuenta, también sólo admin.
//
// 🔴 **La llave (`mp_cuentas.token`) ⛔ sale de este archivo en ninguna respuesta.** Se lee con la
// service key, se usa para hablar con MP y se descarta. Las consultas que van a la respuesta piden
// las columnas por nombre: pedir todas acá la mandaría al navegador.
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12 funciones.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { esAdmin, puedeVerAlguna } from '../lib/permisos.core.js';
import { diaArgentino } from '../lib/envios/portal.core.js';
import { cuentasDelDia, esDiaValido, limpiarPagos, nombreDeCuenta, rangoDelDia, totalDe } from '../lib/pagos-recibidos/core.core.js';

/** 100 es el máximo por página de `/v1/payments/search`; 10 páginas = 1.000 pagos en un día. */
const POR_PAGINA = 100;
const PAGINAS_MAX = 10;

/** Mismo `cfgFor` que `_ventas-diarias.js` y `_memo.js`: las tablas viven en la base de cada marca. */
function clienteDe(store) {
  const cfg = store === 'zattia'
    ? { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY }
    : { url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co', key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY };
  if (!cfg.url || !cfg.key) return null;
  return createClient(cfg.url, cfg.key);
}

function errorMp(status) {
  const e = new Error(status === 401 ? 'Mercado Pago rechazó la llave de la cuenta.' : 'Mercado Pago no respondió bien.');
  e.status = 502;
  return e;
}

async function buscarDelDia(token, dia) {
  const { begin_date, end_date } = rangoDelDia(dia);
  const todos = [];
  for (let i = 0; i < PAGINAS_MAX; i++) {
    const qs = new URLSearchParams({
      sort: 'date_created',
      criteria: 'desc',
      range: 'date_created',
      begin_date,
      end_date,
      limit: String(POR_PAGINA),
      offset: String(i * POR_PAGINA),
    });
    const r = await fetch(`https://api.mercadopago.com/v1/payments/search?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw errorMp(r.status);
    const res = (d && d.results) || [];
    todos.push(...res);
    if (res.length < POR_PAGINA) break;
  }
  return todos;
}

/** De quién es una llave, según MP. ⛔ Se confía en lo que diga el body: el id sale de acá. */
async function quienEs(token) {
  const t = String(token || '').trim();
  if (!/^APP_USR-[\w-]+$/.test(t)) {
    const e = new Error('Eso no parece una llave de Mercado Pago: tiene que empezar con APP_USR-.');
    e.status = 400;
    throw e;
  }
  const r = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${t}` } });
  const yo = await r.json().catch(() => null);
  if (r.status === 401 || r.status === 403) {
    const e = new Error('Mercado Pago no reconoce esa llave. Copiala de nuevo desde «Credenciales de producción».');
    e.status = 400;
    throw e;
  }
  if (!r.ok || !yo || !yo.id) throw errorMp(r.status);
  return { token: t, cuenta_id: Number(yo.id), nombre: nombreDeCuenta(yo) };
}

/** Las cuentas de la marca, con su período de uso. ⛔ Sin la llave. */
async function cuentasDe(sb, store) {
  const [c, u] = await Promise.all([
    sb.from('mp_cuentas').select('cuenta_id, nombre').eq('store', store),
    sb.from('mp_cuenta_uso').select('cuenta_id, desde').eq('store', store).order('desde'),
  ]);
  if (c.error) throw c.error;
  if (u.error) throw u.error;
  const usos = u.data || [];
  const enUso = usos.length ? Number(usos[usos.length - 1].cuenta_id) : null;
  const cuentas = (c.data || []).map((x) => {
    const propios = usos.filter((v) => Number(v.cuenta_id) === Number(x.cuenta_id));
    return {
      cuenta_id: Number(x.cuenta_id),
      nombre: x.nombre,
      enUso: Number(x.cuenta_id) === enUso,
      ultimaVez: propios.length ? propios[propios.length - 1].desde : null,
    };
  });
  return { cuentas, usos, enUso };
}

async function ponerEnUso(sb, store, cuentaId, perfil) {
  const { error } = await sb.from('mp_cuenta_uso').insert({ store, cuenta_id: cuentaId, puesta_por: perfil.name || null });
  if (error) throw error;
}

/**
 * Lo que entró un día a las cuentas que estaban en uso, ya limpio (`limpiarPagos`), más nuevo primero.
 * Lo usa también la Caja (`api/_caja.js`) para cruzar las transferencias: la MISMA lectura que ve
 * la empleada en Pagos recibidos, ⛔ una copia. `usos` sale de `cuentasDe` (o de `usosDe`).
 */
export async function pagosDelDia(sb, usos, dia) {
  const ids = cuentasDelDia(usos, dia);
  const { data: llaves, error: eLl } = await sb.from('mp_cuentas').select('cuenta_id, token').in('cuenta_id', ids);
  if (eLl) throw eLl;
  const pagos = [];
  const devueltos = [];
  for (const ll of llaves || []) {
    const crudos = await buscarDelDia(ll.token, dia);
    const l = limpiarPagos(crudos, Number(ll.cuenta_id));
    pagos.push(...l.pagos);
    devueltos.push(...l.devueltos);
  }
  const porFecha = (a, b) => Date.parse(b.cuando) - Date.parse(a.cuando);
  pagos.sort(porFecha);
  devueltos.sort(porFecha);
  return { pagos, devueltos };
}

/** Desde cuándo se usa cada cuenta de la marca. Vacío ⇒ ⛔ hay cuenta de MP conectada. */
export async function usosDe(sb, store) {
  const { data, error } = await sb.from('mp_cuenta_uso').select('cuenta_id, desde').eq('store', store).order('desde');
  if (error) throw error;
  return data || [];
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'método no permitido' });

  const store = String(req.query.store || (req.body && req.body.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  if (!puedeVerAlguna(perfil, store, ['pagos-recibidos'])) {
    return res.status(403).json({ error: 'No tenés acceso a Pagos recibidos en esta marca.' });
  }
  const admin = esAdmin(perfil);

  const sb = clienteDe(store);
  if (!sb) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });

  try {
    if (req.method === 'POST') {
      // 🔴 Cambiar la cuenta de cobro es de Dirección: la empleada ⛔ puede ni verificar una llave.
      if (!admin) return res.status(403).json({ error: 'Sólo un admin puede cambiar la cuenta de cobro.' });
      const b = req.body || {};

      if (b.action === 'verificar') {
        const q = await quienEs(b.token);
        return res.status(200).json({ ok: true, cuenta_id: q.cuenta_id, nombre: q.nombre });
      }

      if (b.action === 'cargar') {
        const q = await quienEs(b.token);
        // Una cuenta es de UN local: cargarla en la otra marca la mostraría en los dos mostradores.
        const { data: ya, error: e0 } = await sb.from('mp_cuentas').select('store').eq('cuenta_id', q.cuenta_id).maybeSingle();
        if (e0) throw e0;
        if (ya && ya.store !== store) return res.status(409).json({ error: `Esa cuenta ya está cargada en ${ya.store.toUpperCase()}.` });
        const { error: e1 } = await sb.from('mp_cuentas').upsert(
          { cuenta_id: q.cuenta_id, store, nombre: q.nombre, token: q.token, cargada_en: new Date().toISOString(), cargada_por: perfil.name || null },
          { onConflict: 'cuenta_id' },
        );
        if (e1) throw e1;
        const { enUso } = await cuentasDe(sb, store);
        if (enUso !== q.cuenta_id) await ponerEnUso(sb, store, q.cuenta_id, perfil);
        return res.status(200).json({ ok: true, cuentas: (await cuentasDe(sb, store)).cuentas });
      }

      if (b.action === 'usar') {
        const id = Number(b.cuenta_id);
        const { cuentas, enUso } = await cuentasDe(sb, store);
        if (!cuentas.some((c) => c.cuenta_id === id)) return res.status(404).json({ error: 'Esa cuenta no está cargada en esta marca.' });
        if (enUso !== id) await ponerEnUso(sb, store, id, perfil);
        return res.status(200).json({ ok: true, cuentas: (await cuentasDe(sb, store)).cuentas });
      }

      return res.status(400).json({ error: 'acción desconocida' });
    }

    const hoy = diaArgentino(Date.now());
    const dia = req.query.dia ? String(req.query.dia) : hoy;
    if (!esDiaValido(dia)) return res.status(400).json({ error: 'dia inválido (usá AAAA-MM-DD)' });
    if (dia !== hoy && !admin) return res.status(403).json({ error: 'Sólo se puede ver el día de hoy.' });

    const { cuentas, usos } = await cuentasDe(sb, store);
    // Sin cuenta no es un error: todavía no se cargó ninguna, y la pantalla lo dice.
    if (!usos.length) return res.status(200).json({ ok: true, conectada: false, dia, hoy, admin, ...(admin ? { cuentas } : {}) });

    const { pagos, devueltos } = await pagosDelDia(sb, usos, dia);
    const r = { ok: true, conectada: true, dia, hoy, admin, pagos, leidoEn: new Date().toISOString() };
    if (admin) Object.assign(r, { total: totalDe(pagos), cantidad: pagos.length, devueltos, cuentas });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(r);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'error inesperado' });
  }
}

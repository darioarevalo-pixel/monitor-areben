// "Cobranzas": órdenes de Tienda Nube con medio de pago MANUAL, y su cobro. Tabla `tn_cobros`.
//
//   GET  ?recurso=cobranzas&store=bdi|zattia[&dias=N]          → { ok, filas, cuenta, desde, puedeCobrar }
//   POST { recurso, store, action:'cobrar', order_id, medio, monto, operacion?, idem }
//   POST { recurso, store, action:'anular', id }
//   POST { recurso, store, action:'nota', id }                  (reintenta la nota de TN)
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=cobranzas`. El plan Hobby
// de Vercel admite 12 funciones; crear `api/cobranzas.js` «por prolijidad» **frena todos los
// deploys sin error visible**.
//
// # Las dos verdades
//
// 🔴 TiendaNube ⛔ deja marcar una orden pagada por API. El cobro vive acá (`tn_cobros`) y el
// «pagado» en TN lo aprieta una persona en el admin. El estado de cada orden sale de CRUZAR las dos,
// y esa regla vive en `lib/cobranzas/core.core.js` — ⛔ acá no se decide ningún estado.
//
// # Quién
//
// Ver la sección pide `cobranzas`. Cobrar y anular piden además el sub `cobranzas.cobrar`, que ⛔ se
// hereda de la función: se tilda a mano. `quien` sale de `perfil.name`, NUNCA del body.
//
// # Lo que toca afuera de su tabla
//
//  - La nota interna de la orden en TN, por `bdi-catalogo` (el monitor ⛔ habla con TN directo).
//  - 🔴 `envios_reparto`: una orden cobrada acá y todavía `pending` en TN figuraría como plata que
//    el cadete cobra en la puerta ⇒ se le pone en cero el saldo, y se guarda el previo para
//    devolvérselo si el cobro se anula. Misma base (la de BDI), por eso la tabla vive ahí.
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeSub, puedeVerAlguna } from '../lib/permisos.core.js';
import { filasDeCobranzas, lineaDeNota, validarCobro } from '../lib/cobranzas/core.core.js';

const CATALOGO = process.env.CATALOGO_URL || 'https://bdi-catalogo.vercel.app/api/tn-categorias';
const AUDIT = process.env.CATALOGO_AUDIT_URL || 'https://bdi-catalogo.vercel.app/api/tiendanube-audit';
const TABLA = 'tn_cobros';
const DIAS_DEFAULT = 45;

function nuevoId() {
  return `co${Date.now()}_${randomBytes(3).toString('hex')}`;
}

/** YYYY-MM-DD en hora de Argentina. */
function diaAR(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);
}

/** Escribe la línea en la nota de la orden. Devuelve el valor de `nota_tn`. */
async function anotarEnTn(store, sobre, orderId, linea) {
  try {
    const r = await fetch(`${CATALOGO}?store=${store}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-monitor-auth': sobre },
      body: JSON.stringify({ accion: 'nota-cobro', orderId, linea }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok) return d.verificado ? 'ok' : 'sin-verificar';
    return d.sinPermiso ? 'sin-permiso' : 'error';
  } catch {
    return 'error';
  }
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const b = req.method === 'POST' ? (req.body || {}) : {};
  const store = String((req.method === 'POST' ? b.store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });
  if (!puedeVerAlguna(perfil, store, ['cobranzas'])) {
    return res.status(403).json({ error: 'No tenés acceso a Cobranzas de esta marca.' });
  }
  const puedeCobrar = puedeSub(perfil, store, 'cobranzas', 'cobrar');

  const url = process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const db = createClient(url, key);
  const yo = perfil.name || perfil.email || null;
  const sobre = req.headers && req.headers['x-monitor-auth'];

  try {
    // ── Listar: las órdenes de TN de la ventana, cruzadas con los cobros ─────────
    if (req.method === 'GET') {
      if (!sobre) return res.status(400).json({ error: 'Falta la credencial para hablar con el catálogo.' });
      const dias = Math.min(Math.max(Number(req.query.dias) || DIAS_DEFAULT, 1), 180);
      const { data: cobros, error: eC } = await db.from(TABLA).select('*').eq('store', store)
        .order('cuando', { ascending: false }).limit(1000);
      if (eC) throw new Error(eC.message);

      // 🔑 La ventana se estira hasta la orden más vieja con un cobro VIGENTE: si no, una orden
      // cobrada hace dos meses y todavía sin marcar en TN desaparecería de «Falta marcar en TN»
      // sólo por vieja — que es justo cuando más importa verla.
      const hoy = new Date();
      let desde = new Date(hoy.getTime() - dias * 86400000);
      for (const c of cobros || []) {
        if (c.anulado_en || !c.orden_fecha) continue;
        const f = new Date(c.orden_fecha);
        if (f < desde) desde = f;
      }
      const qs = `store=${store}&cobros=1&from=${diaAR(desde)}&to=${diaAR(hoy)}`;
      const r = await fetch(`${AUDIT}?${qs}`, { headers: { 'x-monitor-auth': sobre } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) return res.status(502).json({ error: d.error || `No se pudieron leer las órdenes de TN (${r.status}).` });

      const { filas, cuenta } = filasDeCobranzas(d.ordenes || [], cobros || []);
      return res.status(200).json({ ok: true, filas, cuenta, desde: diaAR(desde), puedeCobrar });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
    if (!puedeCobrar) return res.status(403).json({ error: 'Para cobrar o anular hace falta el permiso «Cobrar» de Cobranzas.' });

    // ── Cobrar ────────────────────────────────────────────────────────────────
    if (b.action === 'cobrar') {
      const mal = validarCobro(b);
      if (mal) return res.status(400).json({ error: mal });
      if (!b.idem || typeof b.idem !== 'string') return res.status(400).json({ error: 'Falta idem.' });
      if (!b.numero) return res.status(400).json({ error: 'Falta el número de la orden.' });

      const fila = {
        id: nuevoId(), store, order_id: String(b.order_id), numero: String(b.numero),
        orden_fecha: b.orden_fecha || null, monto: Number(b.monto), medio: b.medio,
        operacion: b.operacion ? String(b.operacion).trim() || null : null,
        idem: b.idem, quien: yo, cuando: new Date().toISOString(), nota_tn: 'pendiente',
      };
      const { error: eIns } = await db.from(TABLA).insert(fila);
      if (eIns) {
        // 23505 por `idem` = doble click: se devuelve el primero. Por `idx_tn_cobros_vigente` =
        // la orden ya tiene un cobro vigente (otra persona, otra pestaña).
        if (eIns.code === '23505') {
          const { data: ya } = await db.from(TABLA).select('*').eq('idem', b.idem).maybeSingle();
          if (ya) return res.status(200).json({ ok: true, cobro: ya, repetido: true });
          return res.status(409).json({ error: 'Esta orden ya tiene un cobro registrado. Recargá la lista.' });
        }
        throw new Error(eIns.message);
      }

      // La hoja del cadete: si la orden está en reparto y todavía no se entregó, ya ⛔ hay nada que
      // cobrar en la puerta. Se guarda cuánto había, para devolvérselo si se anula.
      const { data: envio } = await db.from('envios_reparto')
        .select('id, monto_pedido_a_cobrar, estado')
        .eq('store', store).eq('origen', 'tn').eq('orden_numero', fila.numero).maybeSingle();
      if (envio && envio.estado !== 'entregado' && Number(envio.monto_pedido_a_cobrar) > 0) {
        const { error: eEnv } = await db.from('envios_reparto')
          .update({ monto_pedido_a_cobrar: 0, autor: yo, updated_at: new Date().toISOString() })
          .eq('id', envio.id);
        if (!eEnv) {
          fila.envio_id = envio.id;
          fila.envio_saldo_previo = Number(envio.monto_pedido_a_cobrar);
        }
      }

      fila.nota_tn = sobre ? await anotarEnTn(store, sobre, fila.order_id, lineaDeNota(fila)) : 'error';
      await db.from(TABLA).update({
        nota_tn: fila.nota_tn, envio_id: fila.envio_id || null, envio_saldo_previo: fila.envio_saldo_previo ?? null,
      }).eq('id', fila.id);
      return res.status(200).json({ ok: true, cobro: fila });
    }

    // ── Anular ────────────────────────────────────────────────────────────────
    if (b.action === 'anular') {
      const { data: c, error: eSel } = await db.from(TABLA).select('*').eq('id', String(b.id || '')).eq('store', store).maybeSingle();
      if (eSel) throw new Error(eSel.message);
      if (!c) return res.status(404).json({ error: 'No existe ese cobro.' });
      if (c.anulado_en) return res.status(200).json({ ok: true, cobro: c, yaEstaba: true });

      const anulado = { ...c, anulado_en: new Date().toISOString(), anulado_por: yo };
      const { error: eUp } = await db.from(TABLA).update({ anulado_en: anulado.anulado_en, anulado_por: yo })
        .eq('id', c.id).is('anulado_en', null);
      if (eUp) throw new Error(eUp.message);

      // Devolverle el saldo al cadete, SÓLO si nadie lo tocó desde entonces (sigue en 0) y el
      // paquete todavía no se entregó. Si alguien ya lo corrigió a mano, su número manda.
      if (c.envio_id && c.envio_saldo_previo != null) {
        await db.from('envios_reparto')
          .update({ monto_pedido_a_cobrar: c.envio_saldo_previo, autor: yo, updated_at: new Date().toISOString() })
          .eq('id', c.envio_id).eq('monto_pedido_a_cobrar', 0).neq('estado', 'entregado');
      }
      if (sobre) await anotarEnTn(store, sobre, c.order_id, lineaDeNota(anulado, { anulado: true }));
      return res.status(200).json({ ok: true, cobro: anulado });
    }

    // ── Reintentar la nota de TN ──────────────────────────────────────────────
    if (b.action === 'nota') {
      if (!sobre) return res.status(400).json({ error: 'Falta la credencial para hablar con el catálogo.' });
      const { data: c } = await db.from(TABLA).select('*').eq('id', String(b.id || '')).eq('store', store).maybeSingle();
      if (!c || c.anulado_en) return res.status(404).json({ error: 'No existe ese cobro vigente.' });
      const nota_tn = await anotarEnTn(store, sobre, c.order_id, lineaDeNota(c));
      await db.from(TABLA).update({ nota_tn }).eq('id', c.id);
      return res.status(200).json({ ok: true, nota_tn });
    }

    return res.status(400).json({ error: `acción desconocida: ${b.action}` });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno' });
  }
}

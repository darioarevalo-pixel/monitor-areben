// Compromisos de pago — tabla `compromisos_pago` (ver sql/migrate-compromisos-pago.sql).
//
//   GET  ?recurso=compromisos                                → { ok, compromisos, puede }
//   POST { recurso:'compromisos', action:'crear', compromiso }
//   POST { recurso:'compromisos', action:'estado', id, estado }
//   POST { recurso:'compromisos', action:'confirmar', id, monto_real, fecha }
//
// Un compromiso es "este cliente le va a transferir a este acreedor". Se anota mientras la plata
// TODAVÍA NO se movió, que es justo el rato que hoy no queda registrado en ningún lado.
//
// # El único verbo que sale de esta casa es `confirmar`
//
// Crear una promesa y cambiarle el estado son cosas de acá. `confirmar` es distinto: escribe pagos
// REALES en el ledger del dashboard, por su puerta de servicio. Por eso es el único que:
//   - pide su propio permiso (`acreedores.confirmar`, aparte de `acreedores.prometer`),
//   - manda el `operacion_id` que nació con el compromiso, para que reintentar no duplique pagos,
//   - archiva lo que devolvió la puerta (`pagos_dashboard`), que es la trazabilidad para poder ir
//     del compromiso al renglón del ledger sin buscar a ojo.
//
// # 🔑 Si la puerta escribió y nosotros no llegamos a anotarlo
//
// El orden es: llamar a la puerta → anotar acá. Si el segundo paso falla, el pago quedó hecho y el
// compromiso figura sin confirmar. **Eso NO se arregla reintentando a ciegas**, y por eso el
// `operacion_id` no se genera acá sino que viene con el compromiso: el reintento manda el mismo
// número, la puerta lo reconoce y devuelve lo de la primera vez sin escribir nada. El segundo
// intento termina de anotar lo que faltó.
//
// ⛔ Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby admite 12 funciones.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { esAdmin, marcasConAcceso, puedeSub } from '../lib/permisos.core.js';

const URL_PUENTE_PAGOS =
  process.env.DASHBOARD_PUENTE_PAGOS_URL || 'https://dashboard.arebensrl.com/api/puente/pagos';

const TIMEOUT_MS = 12000;

const ESTADOS = ['prometido', 'transferido', 'confirmado', 'cancelado'];
const TRANSICIONES = {
  prometido: ['transferido', 'confirmado', 'cancelado'],
  transferido: ['confirmado', 'prometido', 'cancelado'],
  confirmado: [],
  cancelado: ['prometido'],
};

let sb = null;
function base() {
  if (!sb) {
    sb = createClient(
      process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
    );
  }
  return sb;
}

const CAMPOS =
  'id, acreedor_id, acreedor_nombre, cuenta_alias, cuenta_cbu, cuenta_banco, cuenta_titular, ' +
  'cliente_id, cliente_store, cliente_nombre, titular_real, monto, monto_confirmado, estado, ' +
  'fecha_prometida, notas, operacion_id, pagos_dashboard, viene_de, creado_en, creado_por, ' +
  'confirmado_en, confirmado_por';

/** Ver la sección alcanza para leer; prometer y confirmar son permisos aparte. */
function permisos(perfil) {
  const admin = esAdmin(perfil);
  const ve = admin || marcasConAcceso(perfil, 'acreedores', ['bdi', 'zattia']).length > 0;
  return {
    ver: ve,
    // ⚠️ Los subs NO se heredan de la función: se tildan a mano. Un admin puede siempre.
    prometer: admin || (ve && ['bdi', 'zattia'].some((m) => puedeSub(perfil, m, 'acreedores', 'prometer'))),
    confirmar: admin || (ve && ['bdi', 'zattia'].some((m) => puedeSub(perfil, m, 'acreedores', 'confirmar'))),
  };
}

function texto(v, max = 300) {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const puede = permisos(perfil);
  if (!puede.ver) {
    return res.status(403).json({ error: 'No tenés permiso para ver a quién le debemos.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await base()
      .from('compromisos_pago')
      .select(CAMPOS)
      .order('creado_en', { ascending: false })
      .limit(500);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, compromisos: data || [], puede });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  const body = req.body || {};
  const accion = String(body.action || '');
  const quien = perfil.name || null;

  // ── Anotar una promesa ────────────────────────────────────────────────────
  if (accion === 'crear') {
    if (!puede.prometer) {
      return res.status(403).json({ error: 'No tenés permiso para crear promesas de pago.' });
    }
    const c = body.compromiso || {};
    if (!c.acreedor_id || !texto(c.acreedor_nombre)) {
      return res.status(400).json({ error: 'Falta a quién se le va a pagar.' });
    }
    if (!texto(c.cliente_nombre)) {
      return res.status(400).json({ error: 'Falta qué cliente va a transferir.' });
    }
    const monto = Number(c.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ error: 'Poné cuánto va a transferir.' });
    }

    const { data, error } = await base()
      .from('compromisos_pago')
      .insert({
        acreedor_id: c.acreedor_id,
        acreedor_nombre: texto(c.acreedor_nombre),
        // 🔑 La cuenta se CONGELA acá: si mañana cambia el CBU, esta promesa tiene que seguir
        // diciendo a dónde se mandó la plata, no a dónde se manda hoy.
        cuenta_alias: texto(c.cuenta_alias, 60),
        cuenta_cbu: texto(c.cuenta_cbu, 30),
        cuenta_banco: texto(c.cuenta_banco, 80),
        cuenta_titular: texto(c.cuenta_titular, 120),
        cliente_id: texto(c.cliente_id, 60),
        cliente_store: c.cliente_store === 'zattia' ? 'zattia' : 'bdi',
        cliente_nombre: texto(c.cliente_nombre, 160),
        titular_real: texto(c.titular_real, 160),
        monto,
        fecha_prometida: c.fecha_prometida || null,
        notas: texto(c.notas, 1000),
        viene_de: c.viene_de || null,
        creado_por: quien,
        actualizado_por: quien,
      })
      .select(CAMPOS)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, compromiso: data });
  }

  // ── Moverla de estado (sin tocar el dashboard) ────────────────────────────
  if (accion === 'estado') {
    if (!puede.prometer) {
      return res.status(403).json({ error: 'No tenés permiso para cambiar promesas de pago.' });
    }
    const estado = String(body.estado || '');
    if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Ese estado no existe.' });
    // ⛔ `confirmado` NO entra por acá: confirmar escribe plata y tiene su propio verbo y su
    // propio permiso. Sin este corte, `estado` sería una puerta de atrás para saltear los dos.
    if (estado === 'confirmado') {
      return res.status(400).json({ error: 'Para confirmar usá el botón de confirmar: es lo que impacta en el dashboard.' });
    }

    const { data: actual, error: eLeer } = await base()
      .from('compromisos_pago').select('estado').eq('id', body.id).single();
    if (eLeer || !actual) return res.status(404).json({ error: 'No se encontró esa promesa.' });
    if (!(TRANSICIONES[actual.estado] || []).includes(estado)) {
      const motivo = actual.estado === 'confirmado'
        ? 'Esa promesa ya impactó en el dashboard y no se puede volver atrás desde acá. Si hay que corregirla, se borra el pago en el dashboard.'
        : `No se puede pasar de "${actual.estado}" a "${estado}".`;
      return res.status(409).json({ error: motivo });
    }

    const { data, error } = await base()
      .from('compromisos_pago')
      .update({ estado, actualizado_en: new Date().toISOString(), actualizado_por: quien })
      .eq('id', body.id)
      .select(CAMPOS)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, compromiso: data });
  }

  // ── Confirmar: la plata se movió, que impacte en el dashboard ─────────────
  if (accion === 'confirmar') {
    if (!puede.confirmar) {
      return res.status(403).json({ error: 'No tenés permiso para confirmar pagos. Podés crear la promesa y que la confirme otro.' });
    }

    const { data: c, error: eLeer } = await base()
      .from('compromisos_pago').select(CAMPOS).eq('id', body.id).single();
    if (eLeer || !c) return res.status(404).json({ error: 'No se encontró esa promesa.' });
    if (c.estado === 'confirmado') {
      return res.status(409).json({ error: 'Esa promesa ya está confirmada.', compromiso: c });
    }
    if (c.estado === 'cancelado') {
      return res.status(409).json({ error: 'Esa promesa está cancelada. Reabrila antes de confirmarla.' });
    }

    // Lo que entró DE VERDAD. Puede ser menos de lo prometido: se confirma por esto.
    const montoReal = Number(body.monto_real ?? c.monto);
    if (!Number.isFinite(montoReal) || montoReal <= 0) {
      return res.status(400).json({ error: 'Poné cuánta plata entró de verdad.' });
    }
    const fecha = String(body.fecha || '').match(/^\d{4}-\d{2}-\d{2}$/)
      ? body.fecha
      : new Date().toISOString().slice(0, 10);

    const secreto = process.env.DASHBOARD_PUENTE_SECRET;
    if (!secreto) {
      return res.status(503).json({ error: 'Falta conectar el dashboard (DASHBOARD_PUENTE_SECRET). Sin eso el pago no se puede registrar.' });
    }

    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), TIMEOUT_MS);
    let respuesta;
    try {
      const r = await fetch(URL_PUENTE_PAGOS, {
        method: 'POST',
        headers: { 'x-puente-auth': secreto, 'Content-Type': 'application/json' },
        signal: corte.signal,
        body: JSON.stringify({
          // 🔑 El mismo número de siempre: nació con el compromiso. Si esta llamada ya se hizo,
          // el dashboard devuelve lo de la primera vez en vez de escribir los pagos otra vez.
          operacion_id: c.operacion_id,
          acreedor_id: c.acreedor_id,
          monto: montoReal,
          fecha,
          instrumento: 'TRANSFERENCIA',
          pagador: { cliente_id: c.cliente_id, nombre: c.titular_real || c.cliente_nombre },
          pedido_por: quien,
          notas: `Transferencia de ${c.cliente_nombre}${c.titular_real && c.titular_real !== c.cliente_nombre ? ` (a nombre de ${c.titular_real})` : ''}`,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        return res.status(409).json({ error: (d && d.error) || `El dashboard rechazó el pago (${r.status}).`, detalle: d || null });
      }
      respuesta = d;
    } catch (e) {
      const msg = e?.name === 'AbortError'
        ? 'El dashboard está tardando. Fijate en unos minutos si el pago quedó registrado antes de volver a intentar.'
        : `No se pudo registrar el pago: ${e.message}`;
      return res.status(502).json({ error: msg });
    } finally {
      clearTimeout(reloj);
    }

    // El pago YA está escrito del otro lado. Si esto falla, el reintento manda el mismo
    // `operacion_id` y termina de anotar sin duplicar nada.
    const { data, error } = await base()
      .from('compromisos_pago')
      .update({
        estado: 'confirmado',
        monto_confirmado: montoReal,
        pagos_dashboard: respuesta,
        confirmado_en: new Date().toISOString(),
        confirmado_por: quien,
        actualizado_en: new Date().toISOString(),
        actualizado_por: quien,
      })
      .eq('id', c.id)
      .select(CAMPOS)
      .single();
    if (error) {
      return res.status(500).json({
        error: `El pago SÍ se registró en el dashboard, pero no se pudo anotar acá: ${error.message}. Volvé a apretar confirmar: no se va a duplicar.`,
        pagos: respuesta,
      });
    }

    // Si entró menos de lo prometido, lo que falta va como una promesa NUEVA (decidido con Darío):
    // un compromiso es una transferencia, así que dos transferencias son dos filas.
    const restante = Math.max(0, Math.round((Number(c.monto) - montoReal) * 100) / 100);
    let nueva = null;
    if (restante > 0.005 && body.anotar_restante !== false) {
      const { data: n } = await base()
        .from('compromisos_pago')
        .insert({
          acreedor_id: c.acreedor_id,
          acreedor_nombre: c.acreedor_nombre,
          cuenta_alias: c.cuenta_alias,
          cuenta_cbu: c.cuenta_cbu,
          cuenta_banco: c.cuenta_banco,
          cuenta_titular: c.cuenta_titular,
          cliente_id: c.cliente_id,
          cliente_store: c.cliente_store,
          cliente_nombre: c.cliente_nombre,
          titular_real: c.titular_real,
          monto: restante,
          notas: `Lo que faltó de la promesa del ${String(c.creado_en).slice(0, 10)}: se pidieron ${c.monto} y entraron ${montoReal}.`,
          viene_de: c.id,
          creado_por: quien,
          actualizado_por: quien,
        })
        .select(CAMPOS)
        .single();
      nueva = n || null;
    }

    return res.status(200).json({ ok: true, compromiso: data, nueva, pagos: respuesta });
  }

  return res.status(400).json({ error: 'Acción desconocida.' });
}

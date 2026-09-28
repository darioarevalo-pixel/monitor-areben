// Adelantos de sueldo — la puerta que llama el SERVIDOR del dashboard, no una persona.
//
//   GET ?recurso=adelantos-puente&empleado_id=<uuid>     header  x-puente-auth: <secreto>
//     → { adelantos: [{ id, monto, fecha, mes, cliente_nombre, cliente_id }] }
//
// Al liquidar un sueldo, el dashboard pregunta qué adelantos confirmados tiene ese empleado y los
// cuelga de la nómina como pagos parciales (`areben-dashboard/lib/adelantos.ts`). Devuelve TODOS los
// confirmados, no sólo los pendientes: lo aplicado se cuenta allá, de sus propios pagos, y este lado
// no sabe ni tiene que saber qué entró dónde.
//
// 🔑 Es la misma llave que usa el Monitor para llamar al dashboard (`DASHBOARD_PUENTE_SECRET` acá,
// `PUENTE_SECRET` allá, el mismo valor), sólo que viaja para el otro lado.
//
// ⛔ Archivo aparte de `_adelantos.js` a propósito: ésta no pide sesión, aquélla sí. Un verbo abierto
// no convive con verbos con login en el mismo archivo (el mismo criterio que `votacion`).
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

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

function sobreValido(req) {
  const esperado = process.env.DASHBOARD_PUENTE_SECRET;
  const recibido = String(req.headers['x-puente-auth'] || '');
  // Falla CERRADA: sin secreto configurado no entra nadie.
  if (!esperado || esperado.length < 32) return false;
  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(recibido, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!sobreValido(req)) return res.status(401).json({ error: 'Sobre inválido.' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });

  const empleadoId = String(req.query?.empleado_id || '');
  if (!UUID.test(empleadoId)) return res.status(400).json({ error: 'Falta de qué empleado.' });

  const { data, error } = await base()
    .from('compromisos_pago')
    .select('operacion_id, monto_confirmado, fecha_acreditado, mes_sueldo, cliente_nombre, cliente_id')
    .eq('origen', 'empleado')
    .eq('acreedor_id', empleadoId)
    .eq('estado', 'confirmado');
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    adelantos: (data || []).map((c) => ({
      id: c.operacion_id,
      monto: Number(c.monto_confirmado),
      fecha: c.fecha_acreditado,
      mes: c.mes_sueldo,
      cliente_nombre: c.cliente_nombre,
      cliente_id: c.cliente_id || null,
    })),
  });
}

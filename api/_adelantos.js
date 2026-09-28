// Adelantos de sueldo — lo que necesita la pantalla.
//
//   GET ?recurso=adelantos   → { ok, empleados, aplicados } | { ok, aviso }
//
// `empleados`: a quién se le puede adelantar (los activos del dashboard, con su CBU si está cargado).
// `aplicados`: cuánto de cada adelanto ya entró en una nómina, y de qué mes — `{ adelanto_id, monto,
// mes }`, donde `adelanto_id` es el `operacion_id` del compromiso.
//
// Los compromisos mismos salen de `?recurso=compromisos`, como los de cualquier destino: esto sólo
// agrega lo que vive en el dashboard. ⛔ Lo aplicado se lee, no se copia (ver
// `lib/adelantos/puente.core.js`).
//
// Con el dashboard caído contesta 200 con `aviso`: la lista de adelantos se sigue viendo, sólo que
// sin saber cuáles ya se aplicaron.
import { exigirUsuario } from './_auth.js';
import { esAdmin, marcasConAcceso } from '../lib/permisos.core.js';
import { leerAdelantosDelDashboard } from '../lib/adelantos/puente.core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Solo GET.' });

  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  // Mismo permiso que el resto del circuito: es la misma pantalla.
  const puede = esAdmin(perfil) || marcasConAcceso(perfil, 'acreedores', ['bdi', 'zattia']).length > 0;
  if (!puede) return res.status(403).json({ error: 'No tenés permiso para ver a quién le debemos.' });

  const r = await leerAdelantosDelDashboard();
  if (r.aviso) return res.status(200).json({ ok: true, aviso: r.aviso, empleados: [], aplicados: [] });
  return res.status(200).json({ ok: true, empleados: r.empleados, aplicados: r.aplicados });
}

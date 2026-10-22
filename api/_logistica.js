// El puente a Logística (logistica.arebensrl.com, la mantiene Ger) para el panel de WhatsApp —
// pedidos mayoristas de BDI. Darío, 22-oct-2026: «Ger ya hizo la parte de logística para
// conectarnos». La guía de Ger está en `docs/secciones/crm.md` (bloque del 22-oct).
//
//   POST { recurso:'logistica', action:'me' }                   → lo que contesta GET /me
//   POST { recurso:'logistica', action:'cliente', clienteId }   → GET /mayorista/clientes/{id}/pedidos
//   POST { recurso:'logistica', action:'telefono', tel }        → GET /mayorista/pedidos?telefono=
//   POST { recurso:'logistica', action:'pendientes' }           → GET /mayorista/pendientes
//
// 🔑 **El navegador nunca le habla a Logística.** La API no tiene CORS y el token (`LOGISTICA_TOKEN`,
// lo creó Darío y queda todo a su nombre en el Historial de cada pedido) no puede salir de acá.
// ⛔ El token no se devuelve ni se registra nunca.
//
// 🔑 **Lista cerrada de rutas, no un pase libre.** Cada acción arma su ruta; nada del cuerpo llega a
// la URL salvo un número (`clienteId`, `tel`), y sólo con dígitos. Es el error del viejo
// `api/proxy.js` de bdi-catalogo, que exponía toda la API de GN.
//
// 🔑 **Código y cuerpo de error de Logística tal cual**: `detail` viene en castellano para mostrar, y
// el 409 de las cargas (cuando lleguen) trae el pedido como quedó.
//
// ⛔ Por ahora SOLO consultas. Las cargas (PATCH, despachar, etiqueta) tocan pedidos reales —no hay
// entorno de prueba— y se suman en una segunda tanda, probadas sobre un pedido acordado.
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';

const BASE = 'https://logistica.arebensrl.com/api/ext/v1';
const ESPERA_MS = 10_000;

/** La ruta de Logística para cada acción, o un error para mostrar. */
export function rutaDe(body) {
  const accion = String(body?.action || '');
  if (accion === 'me') return { ruta: '/me' };
  if (accion === 'pendientes') return { ruta: '/mayorista/pendientes' };
  if (accion === 'cliente') {
    const id = String(body.clienteId ?? '');
    if (!/^\d{1,12}$/.test(id)) return { error: 'Falta el número de cliente.' };
    return { ruta: `/mayorista/clientes/${id}/pedidos` };
  }
  if (accion === 'telefono') {
    const tel = String(body.tel ?? '').replace(/\D/g, '');
    if (tel.length < 8 || tel.length > 15) return { error: 'Falta el teléfono.' };
    return { ruta: `/mayorista/pedidos?telefono=${tel}` };
  }
  return { error: 'acción inválida (usá me, cliente, telefono o pendientes)' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;
  // Son pedidos con nombre y teléfono de clientes: el mismo gate que el CRM.
  if (!puedeVerAlguna(perfil, 'bdi', ['clientes'])) {
    return res.status(403).json({ error: 'No tenés acceso a Clientes.' });
  }

  const { ruta, error } = rutaDe(req.body);
  if (error) return res.status(400).json({ error });

  const token = process.env.LOGISTICA_TOKEN;
  if (!token) return res.status(500).json({ error: 'Falta la clave de Logística en el Monitor.' });

  res.setHeader('Cache-Control', 'no-store');
  try {
    const r = await fetch(BASE + ruta, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    const datos = await r.json().catch(() => null);
    if (!r.ok) {
      const detalle = datos && typeof datos.detail === 'string' ? datos.detail : `Logística contestó ${r.status}.`;
      return res.status(r.status).json({ ...(datos || {}), error: detalle });
    }
    return res.status(200).json(datos ?? {});
  } catch (e) {
    const tarde = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return res.status(502).json({ error: tarde ? 'Logística tardó demasiado en contestar.' : 'No pude hablar con Logística.' });
  }
}

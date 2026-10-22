// El puente a Logística (logistica.arebensrl.com, la mantiene Ger) para el panel de WhatsApp —
// pedidos mayoristas de BDI. Darío, 22-oct-2026: «Ger ya hizo la parte de logística para
// conectarnos». La guía de Ger está resumida en `docs/secciones/crm.md` (bloque del 22-oct).
//
//   POST { recurso:'logistica', action:'me' }                   → GET /me
//   POST { recurso:'logistica', action:'catalogos' }            → GET /catalogos
//   POST { recurso:'logistica', action:'cliente', clienteId }   → GET /mayorista/clientes/{id}/pedidos
//   POST { recurso:'logistica', action:'telefono', tel }        → GET /mayorista/pedidos?telefono=
//   POST { recurso:'logistica', action:'pendientes' }           → GET /mayorista/pendientes
//   POST { recurso:'logistica', action:'entrega', id, dispatch_option, carrier?, expected }
//                                                               → PATCH /mayorista/pedidos/{id}
//
// 🔑 **El navegador nunca le habla a Logística.** La API no tiene CORS y el token (`LOGISTICA_TOKEN`,
// lo creó Darío y queda todo a su nombre en el Historial de cada pedido) no puede salir de acá.
// ⛔ El token no se devuelve ni se registra nunca.
//
// 🔑 **Lista cerrada de rutas, no un pase libre.** Cada acción arma su ruta; nada del cuerpo llega a
// la URL salvo un número, y sólo con dígitos. Es el error del viejo `api/proxy.js` de bdi-catalogo,
// que exponía toda la API de GN. Las escrituras arman su cuerpo campo por campo: lo que no está en
// la lista no viaja.
//
// 🔑 **Código y cuerpo de error de Logística tal cual**: `detail` viene en castellano para mostrar, y
// el 409 trae `conflicts` y el pedido como quedó (`order`). ⛔ El 409 no se reintenta.
//
// 🔴 **Escribir es sólo de admin**: queda a nombre de Darío en Logística, y no hay entorno de prueba —
// cada escritura cambia un pedido real—. Mirar alcanza con el permiso de Clientes.
import { exigirUsuario } from './_auth.js';
import { esAdmin, puedeVerAlguna } from '../lib/permisos.core.js';

const BASE = 'https://logistica.arebensrl.com/api/ext/v1';
const ESPERA_MS = 10_000;

/** La ruta de Logística para cada acción (con método y cuerpo si escribe), o un error para mostrar. */
export function rutaDe(body) {
  const accion = String(body?.action || '');
  if (accion === 'me') return { ruta: '/me' };
  if (accion === 'catalogos') return { ruta: '/catalogos' };
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
  if (accion === 'entrega') return entrega(body);
  return { error: 'acción inválida (usá me, catalogos, cliente, telefono, pendientes o entrega)' };
}

const opcion = (v) => (v === null ? null : Number.isInteger(v) && v >= 1 && v <= 9 ? v : undefined);
const transporte = (v) => (v === null ? null : typeof v === 'string' && v.trim() && v.length <= 60 ? v.trim() : undefined);

/**
 * Elegir la forma de entrega (y el transporte). `expected` es lo que el panel VIO de cada dato que
 * cambia: si alguien lo cargó en el medio, Logística contesta 409 y no guarda nada.
 */
function entrega(body) {
  const id = String(body.id ?? '');
  if (!/^\d{1,12}$/.test(id)) return { error: 'Falta el pedido.' };
  const dispatch = opcion(body.dispatch_option);
  if (dispatch === undefined || dispatch === null) return { error: 'Falta la forma de entrega.' };
  const vio = body.expected || {};
  if (!('dispatch_option' in vio) || opcion(vio.dispatch_option) === undefined) return { error: 'Falta lo que viste del pedido.' };
  const cuerpo = { dispatch_option: dispatch, expected: { dispatch_option: vio.dispatch_option } };
  if ('carrier' in body) {
    const c = transporte(body.carrier);
    if (c === undefined) return { error: 'El transporte no es válido.' };
    if (!('carrier' in vio) || transporte(vio.carrier) === undefined) return { error: 'Falta lo que viste del pedido.' };
    cuerpo.carrier = c;
    cuerpo.expected.carrier = vio.carrier;
  }
  return { ruta: `/mayorista/pedidos/${id}`, metodo: 'PATCH', cuerpo };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;
  // Son pedidos con nombre y teléfono de clientes: el mismo gate que el CRM.
  if (!puedeVerAlguna(perfil, 'bdi', ['clientes'])) {
    return res.status(403).json({ error: 'No tenés acceso a Clientes.' });
  }

  const { ruta, metodo = 'GET', cuerpo, error } = rutaDe(req.body);
  if (error) return res.status(400).json({ error });
  if (metodo !== 'GET' && !esAdmin(perfil)) {
    return res.status(403).json({ error: 'Cargar en Logística es sólo de administradores.' });
  }

  const token = process.env.LOGISTICA_TOKEN;
  if (!token) return res.status(500).json({ error: 'Falta la clave de Logística en el Monitor.' });

  res.setHeader('Cache-Control', 'no-store');
  try {
    const r = await fetch(BASE + ruta, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
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
    // En una carga, que no conteste no quiere decir que no guardó: se mira antes de repetir.
    const motivo = tarde ? 'Logística tardó demasiado en contestar.' : 'No pude hablar con Logística.';
    return res.status(502).json({ error: metodo === 'GET' ? motivo : `${motivo} Fijate en el pedido si quedó guardado antes de repetirlo.` });
  }
}

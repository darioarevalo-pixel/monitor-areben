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
//   POST { recurso:'logistica', action:'em', id, em, expected:{em} } → PATCH /mayorista/pedidos/{id}
//   POST { recurso:'logistica', action:'despachar', id }       → POST /mayorista/pedidos/{id}/despachar
//   POST { recurso:'logistica', action:'interpretar', text }   → POST /etiquetas/interpretar (IA, no guarda)
//   POST { recurso:'logistica', action:'vista-previa', id, datos }
//                                                  → POST /mayorista/pedidos/{id}/etiqueta/vista-previa
//                                                    (PNG; vuelve como `{ png: 'data:image/png;base64,…' }`)
//   POST { recurso:'logistica', action:'etiqueta', id, datos, expected }
//                                                  → POST /mayorista/pedidos/{id}/etiqueta (guarda y genera)
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
// cada escritura cambia un pedido real—. Mirar alcanza con el permiso de Clientes. Leer el mensaje
// con IA y la vista previa no guardan, pero también son de admin: la IA es paga (20 por minuto).
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
  // En EM lo único que se carga es su número: los datos los pone Envío Nube (Darío, 22-oct-2026).
  if (accion === 'em') {
    const id = String(body.id ?? '');
    if (!/^\d{1,12}$/.test(id)) return { error: 'Falta el pedido.' };
    const em = body.em;
    if (!Number.isInteger(em) || em <= 0 || em > 9_999_999_999) return { error: 'El número de EM no es válido.' };
    const vio = body.expected?.em;
    if (vio !== null && !Number.isInteger(vio)) return { error: 'Falta lo que viste del pedido.' };
    return { ruta: `/mayorista/pedidos/${id}`, metodo: 'PATCH', cuerpo: { em, expected: { em: vio } } };
  }
  // Sólo desde Listo (si no, 409 con el pedido). Repetirlo no hace nada: vuelve `already: true`.
  if (accion === 'despachar') {
    const id = String(body.id ?? '');
    if (!/^\d{1,12}$/.test(id)) return { error: 'Falta el pedido.' };
    return { ruta: `/mayorista/pedidos/${id}/despachar`, metodo: 'POST' };
  }
  if (accion === 'interpretar') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return { error: 'Pegá el mensaje del cliente.' };
    if (text.length > 4000) return { error: 'El mensaje es muy largo.' };
    return { ruta: '/etiquetas/interpretar', metodo: 'POST', cuerpo: { text } };
  }
  if (accion === 'vista-previa' || accion === 'etiqueta') {
    const id = String(body.id ?? '');
    if (!/^\d{1,12}$/.test(id)) return { error: 'Falta el pedido.' };
    const datos = datosEtiqueta(body.datos);
    if (datos.error) return { error: datos.error };
    if (accion === 'vista-previa') {
      return { ruta: `/mayorista/pedidos/${id}/etiqueta/vista-previa?formato=png`, metodo: 'POST', cuerpo: datos.cuerpo, imagen: true };
    }
    const vio = datosEtiqueta(body.expected);
    if (vio.error) return { error: vio.error };
    return { ruta: `/mayorista/pedidos/${id}/etiqueta`, metodo: 'POST', cuerpo: { ...datos.cuerpo, expected: vio.cuerpo } };
  }
  return { error: 'acción inválida (usá me, catalogos, cliente, telefono, pendientes, entrega, em, despachar, interpretar, vista-previa o etiqueta)' };
}

const opcion = (v) => (v === null ? null : Number.isInteger(v) && v >= 1 && v <= 9 ? v : undefined);
const transporte = (v) => (v === null ? null : typeof v === 'string' && v.trim() && v.length <= 60 ? v.trim() : undefined);

/** Los datos de quien recibe que se pueden cargar: los de «Datos del cliente» en Logística. */
const CAMPOS_ENVIO = ['first_name', 'last_name', 'dni', 'phone', 'email', 'delivery_type', 'branch_name', 'address', 'locality', 'province', 'zipcode', 'insurance_amount', 'payment_info', 'free_text'];

const texto = (v, max) => (v === null ? null : typeof v === 'string' && v.length <= max ? v.trim() || null : undefined);

/**
 * El cuerpo de una etiqueta (o lo que se vio de él, para `expected`), campo por campo. Lo que no está
 * en la lista no viaja; un valor que no es texto corta todo.
 */
export function datosEtiqueta(d) {
  const cuerpo = {};
  if (!d || typeof d !== 'object') return { cuerpo };
  if ('dispatch_option' in d) {
    const o = opcion(d.dispatch_option);
    if (o === undefined) return { error: 'La forma de entrega no es válida.' };
    cuerpo.dispatch_option = o;
  }
  if ('carrier' in d) {
    const c = transporte(d.carrier);
    if (c === undefined) return { error: 'El transporte no es válido.' };
    cuerpo.carrier = c;
  }
  if (d.shipping && typeof d.shipping === 'object') {
    const envio = {};
    for (const k of CAMPOS_ENVIO) {
      if (!(k in d.shipping)) continue;
      const v = texto(d.shipping[k], k === 'free_text' ? 1000 : 200);
      if (v === undefined) return { error: 'Hay un dato de envío que no es válido.' };
      envio[k] = v;
    }
    cuerpo.shipping = envio;
  }
  return { cuerpo };
}

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

  const { ruta, metodo = 'GET', cuerpo, imagen, error } = rutaDe(req.body);
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
    // La vista previa es una imagen: vuelve en base64 para que el panel la muestre sin otra puerta.
    if (imagen && r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      return res.status(200).json({ png: `data:image/png;base64,${buf.toString('base64')}` });
    }
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

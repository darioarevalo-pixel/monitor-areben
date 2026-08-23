/**
 * Las reglas del buzón que **escriben**: las lee el handler y las lee la pantalla.
 *
 * ⛔ Es `.js` plano a propósito, igual que `lib/envios/reglas.core.js`: los handlers de `api/*.js`
 * corren en Node sin pasar por el compilador de Next y no pueden importar TypeScript. Si esto
 * viviera en `core.ts`, el handler tendría que copiar la validación adentro — y una copia de una
 * regla de validación es la forma de que la pantalla y la base no coincidan.
 */

/** Las columnas que el cliente puede escribir. Lo que no está en la lista se cae. */
export const CAMPOS = ['id', 'store', 'orden_numero', 'remitente', 'asunto', 'cuerpo', 'recibido_en', 'origen', 'mensaje_ext_id'];

export const ORIGENES = ['mail', 'a_mano'];

/**
 * El número de orden, como se guarda.
 *
 * 🔴 **Sin esto el freno no frena.** Envíos guarda `orden_numero` como `'1234'`, y la clienta —y el
 * asunto del mail de Tienda Nube— lo escriben `#1234`, `# 1234`, `Nº 1234`. Un mensaje cargado con
 * el `#` adelante queda atado a una orden que no existe: se guarda bien, no falla nada, y la fila
 * de Envíos no muestra ninguna pastilla. O sea, el defecto que este módulo viene a evitar, otra vez.
 *
 * Devuelve `null` cuando no hay número, que **no es lo mismo que `'0'`**.
 */
export function normalizarOrden(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[^0-9]/g, '');
  return s ? String(Number(s)) : null;
}

/** La llave con la que un mensaje se ata a un envío. Una orden es de una marca. */
export function llaveDeOrden(store, orden) {
  const n = normalizarOrden(orden);
  return n ? `${String(store || '').toLowerCase()}|${n}` : null;
}

/**
 * Valida lo que llega del cliente. Devuelve el motivo, o `null` si está bien.
 *
 * **El cuerpo es obligatorio y el resto no.** Un mensaje sin texto es una fila que ocupa lugar en la
 * bandeja y no le dice a nadie qué pidió la clienta; sin remitente y sin orden, en cambio, sigue
 * sirviendo —alguien lo completa después—.
 */
export function validarMensaje(m) {
  if (!m || typeof m !== 'object') return 'falta el mensaje';
  if (!['bdi', 'zattia'].includes(String(m.store || '').toLowerCase())) return 'store inválido (usá bdi o zattia)';
  if (!String(m.cuerpo || '').trim()) return 'el mensaje no puede estar vacío';
  if (m.origen != null && !ORIGENES.includes(String(m.origen))) return `origen inválido (usá ${ORIGENES.join(' o ')})`;
  if (m.recibido_en != null && m.recibido_en !== '' && Number.isNaN(Date.parse(String(m.recibido_en)))) return 'la fecha de recepción no se entiende';
  return null;
}

/**
 * La fila lista para la base.
 *
 * `autor` sale del perfil y **nunca del body**: si viajara del cliente, cualquiera podría firmar
 * como otro el mensaje que después frena —o deja de frenar— un despacho. Mismo criterio que
 * `api/_envios.js`.
 */
export function filaDe(m, yo, ahora) {
  const cuando = m.recibido_en && !Number.isNaN(Date.parse(String(m.recibido_en))) ? new Date(String(m.recibido_en)).toISOString() : ahora;
  return {
    id: m.id ? String(m.id) : `bz${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    store: String(m.store).toLowerCase(),
    orden_numero: normalizarOrden(m.orden_numero),
    remitente: m.remitente ? String(m.remitente).slice(0, 300) : null,
    asunto: m.asunto ? String(m.asunto).slice(0, 500) : null,
    cuerpo: String(m.cuerpo).trim(),
    recibido_en: cuando,
    origen: ORIGENES.includes(String(m.origen)) ? String(m.origen) : 'a_mano',
    mensaje_ext_id: m.mensaje_ext_id ? String(m.mensaje_ext_id) : null,
    autor: yo || null,
  };
}

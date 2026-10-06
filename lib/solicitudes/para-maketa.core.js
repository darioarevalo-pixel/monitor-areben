/**
 * **La puerta de SÓLO LECTURA por la que MAKETA ve las sesiones de fotos** (6-oct-2026).
 *
 * Decidido por Bruno: la sesión de fotos **se carga en el Monitor y se ve en Maketa** —el
 * calendario de marketing y un mail con la checklist a las involucradas—. Las dos apps ⛔ no
 * comparten base (sólo el SSO), así que Maketa le pregunta a este cajón con una llave propia.
 *
 * # 🔴 Por qué una LLAVE y ⛔ no un usuario del padrón
 *
 * Era lo más corto —un usuario «Maketa» con el permiso `solicitudes`— y es justo lo que ⛔ sirve:
 * en `api/_solicitudes.js` ese permiso es el mismo para LEER y para BORRAR. Una credencial guardada
 * en otra app que puede borrar el historial del cajón es mucho más de lo que esa app pidió. La llave
 * de acá **sólo entra por GET**, sólo a los dos `kind` de sesión de fotos, y devuelve una proyección.
 *
 * # 🔑 La proyección, y lo que ⛔ sale
 *
 * Sale lo que el calendario y la checklist necesitan: el día, la hora si la hay, qué es, quién la
 * cargó, el estado y **qué prendas** (nombre, variante, cantidad, de dónde salen). ⛔ **No salen**
 * `ventas`, `verif`, `devuelto`, `retirado` ni los SKU/ids de Tienda Nube: son la operación del
 * local, y lo que no viaja no se puede filtrar por accidente del otro lado.
 *
 * `.js` y ⛔ `.ts` por lo mismo que `evento.core.js`: lo importa un handler de `api/`, que corre en
 * Node sin pasar por el compilador.
 */

import crypto from 'node:crypto';

/** El header que trae la llave. */
export const HEADER_LLAVE_MAKETA = 'x-maketa-llave';

/** Los únicos `kind` que Maketa puede leer: la sesión suelta y el evento. */
export const KINDS_PARA_MAKETA = ['sesionfotos', 'sesion-evento'];

/**
 * ¿Es la llave de Maketa? En tiempo constante.
 *
 * 🔴 **Sin llave configurada, NADIE pasa** —ni siquiera una vacía contra otra vacía—: un deploy sin
 * la variable ⛔ puede quedar abierto. ⚠️ `timingSafeEqual` tira si los largos difieren, y por eso
 * se compara el largo antes (mismo molde que `lib/recepciones/webhook.core.js`).
 */
export function esLlaveDeMaketa(recibida, esperada) {
  if (!esperada || !recibida) return false;
  const a = Buffer.from(String(recibida));
  const b = Buffer.from(String(esperada));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Texto limpio o `null`: lo vacío ⛔ viaja como vacío, viaja como ausente. */
function texto(v) {
  const s = v == null ? '' : String(v).trim();
  return s || null;
}

/** Lo que Maketa ve de UNA sesión. */
export function paraMaketa(store, kind, s) {
  const items = Array.isArray(s && s.items) ? s.items : [];
  return {
    id: String(s.id),
    marca: store,
    kind,
    fecha: texto(s.fecha),
    hora: texto(s.hora),
    duracionMin: Number.isFinite(Number(s.duracionMin)) && Number(s.duracionMin) > 0 ? Number(s.duracionMin) : null,
    descripcion: texto(s.descripcion),
    estado: texto(s.estado) || 'pendiente',
    creadoPor: texto(s.creadoPor),
    eventoId: texto(s.eventoId),
    modelo: texto(s.modelo && s.modelo.nombre),
    prendas: items.map((it) => ({
      nombre: texto(it && it.nombre) || '(sin nombre)',
      variante: texto(it && it.variante),
      cantidad: Math.max(1, Math.round(Number(it && it.qty)) || 1),
      origen: texto(it && it.origen),
    })),
  };
}

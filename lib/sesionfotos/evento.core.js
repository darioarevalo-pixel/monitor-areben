/**
 * El EVENTO de sesión de fotos, en JS plano: **lo que el handler necesita decidir antes de
 * escribir** — la hora y qué siembra en la Agenda.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js`, `lib/solicitudes/disparador.core.js` y
 * `lib/modelos/core.core.js`: **`api/_solicitudes.js` corre en Node sin pasar por el compilador de
 * Next y ⛔ no puede importar TypeScript**. Y desde la Fase 5 del octavo lo necesita, porque el
 * hecho que siembra los pasos de la Agenda dejó de ser la solicitud y pasó a ser **el evento**.
 *
 * # 🔑 La decisión de qué se siembra vive ACÁ, ⛔ no adentro del handler
 *
 * Es una sola pregunta con tres respuestas —el evento siembra, la hija ⛔ no, la solicitud suelta
 * sigue como siempre— y escribirla en el `for` del POST la dejaba **sin poder probarse sin
 * levantar el handler entero**. Es la misma lección que `pedidoDesdeBanco` en la Fase 3: la
 * secuencia sube al núcleo y el handler y el test llaman a **la misma función**.
 *
 * # 🔑 `horaNormalizada` se MUDÓ acá el 4-sep-2026
 *
 * Nació en `lib/sesionfotos/evento.ts`, que la **re-exporta**, así que sus consumidores ⛔ no se
 * enteran. Se mudó porque desde la Fase 5 la hora ⛔ ya no decide sólo lo que dibuja una pantalla:
 * **entra al título de un pendiente que leen otras personas**, y ese texto lo arma el handler.
 * Mismo movimiento que `talleNormalizado` cuando la sesión de fotos empezó a escribir la ficha.
 */

import { esDisparador } from '../solicitudes/disparador.core.js';

/**
 * El prefijo de la clave de idempotencia de lo sembrado **desde un evento**.
 *
 * 🔴 **Es un prefijo NUEVO a propósito.** Las claves viejas son `sesion-fotos·<idSolicitud>` y
 * quedan intactas: si el evento usara esa misma forma, un id de evento que coincidiera con uno de
 * solicitud —los dos son strings que elegimos nosotros— haría que uno de los dos ⛔ no sembrara
 * nunca, y el que lo mirara ⛔ no tendría cómo saber por qué. Con `evento:` adentro, los dos
 * espacios de nombres ⛔ no se pueden tocar.
 */
export const CLAVE_SIEMBRA_EVENTO = 'sesion-fotos·evento:';

/**
 * Los `kind` del cajón que pueden sembrar. 🔑 **La lista vive acá y el handler la IMPORTA**: allá
 * sólo decide si vale la pena preguntarle a la base cuáles son nuevas —una consulta que ⛔ no tiene
 * sentido para una solicitud interna—, y dos listas de los mismos dos valores es la forma exacta en
 * que ese atajo y la regla de abajo terminan diciendo cosas distintas.
 */
export const KINDS_QUE_SIEMBRAN = ['sesionfotos', 'sesion-evento'];

/**
 * Normaliza una hora a `HH:MM` en 24 h, o `null` si ⛔ no se puede leer como hora.
 *
 * 🔴 **Devolver `null` y ⛔ no `'00:00'` es la regla**: un `00:00` inventado se dibuja igual que
 * una medianoche real y el que lea la agenda va a creer que la sesión es de madrugada.
 */
export function horaNormalizada(v) {
  const m = /^\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * El agrupador que encabeza el título de cada paso sembrado: «Cápsula primavera 15:30 · Buscar
 * modelo».
 *
 * 🔑 **La hora va en el TÍTULO, ⛔ no en la regla.** `Regla` es día calendario en toda la Agenda —
 * Hoy, Mes, arrastre y cumplimiento la leen así— y bajarla a hora-del-día para esto tocaría las
 * cuatro a la vez. Lo que hace falta es que quien abre el pendiente **sepa a qué hora tiene que
 * estar**, y eso lo contesta el texto.
 *
 * ⛔ **Sin hora ⛔ no se inventa ninguna**: el evento la deja ausente a propósito hasta que se
 * sepa, y un «00:00» colgado del título se lee como una sesión de madrugada.
 */
export function nombreDelHecho(s) {
  const desc = String((s && s.descripcion) || '').trim();
  const base = desc || `Sesión ${(s && s.fecha) || ''}`.trim();
  const hora = horaNormalizada(s && s.hora);
  return hora ? `${base} ${hora}` : base;
}

/**
 * Qué hay que sembrar en la Agenda por una fila **recién creada** del cajón, o `null` si ⛔ no
 * siembra nada.
 *
 * Las tres respuestas, y las tres importan:
 *
 * 1. **`sesion-evento`** → siembra, con la clave del espacio de nombres nuevo y la hora en el
 *    título. Es el hecho de verdad: la sesión que se va a hacer.
 * 2. 🔴 **`sesionfotos` CON `eventoId`** → ⛔ no siembra. Es una hija: sus pasos ya los sembró el
 *    evento, y sembrar por cada una repetiría los nueve pasos **una vez por pedido** —un evento con
 *    tres solicitudes le tiraría 36 renglones encima a tres personas—.
 * 3. **`sesionfotos` suelta** → siembra **igual que siempre**, con la clave vieja. Es el caso de
 *    todas las sesiones que existen hoy y del que ⛔ no usa el cajón de eventos.
 *
 * ⛔ **Sin disparador ⛔ no se siembra**, en los tres casos: de dónde viene la sesión decide de
 * quién es cada paso, así que sembrar «igual» deja nueve renglones con la dueña equivocada.
 */
export function siembraDeSesion(kind, s) {
  if (!s || !s.id || !esDisparador(s.disparador)) return null;
  const nombre = nombreDelHecho(s);
  if (kind === 'sesion-evento') return { nombre, clave: `${CLAVE_SIEMBRA_EVENTO}${s.id}` };
  if (kind !== 'sesionfotos') return null;
  if (s.eventoId) return null;
  return { nombre, clave: `sesion-fotos·${s.id}` };
}

/**
 * **Qué mide una meta.** El catálogo de medidores de Norte — LA lista.
 *
 * # Por qué existe, y por qué es `.js`
 *
 * Antes una meta era `objetivo` + `unidad` escrita a mano, y el avance no se calculaba: la pantalla
 * mostraba la columna vacía a propósito, porque un 0 se lee como «no avanzamos». El problema de
 * fondo no era la cuenta, era que **la meta no decía qué se estaba contando**: cargar «500 por mes»
 * contra un medido que sale por día da un avance plausible y falso, y nada falla.
 *
 * ⇒ 🔑 **La unidad la decide el medidor, no la mano.** El que carga la meta elige de esta lista y
 * la unidad viene con ella. Es la misma razón por la que dos sesiones midieron el mismo archivo y
 * dieron 214 y 224: un número sin unidad no se compara.
 *
 * Es `.js` plano —y no `.ts`— por el mismo motivo que `canal.core.js` y `contribucion.core.js`:
 * `api/_norte.js` valida contra esta lista antes de guardar, y los handlers corren en Node sin
 * pasar por el compilador de Next. ⛔ **No copiar la lista allá**: una copia que envejece acepta un
 * medidor que el motor no sabe medir, y esa meta queda muda para siempre sin que nada avise.
 * `medidores.ts` es la cara tipada para la app.
 */

import { CANALES } from '../liquidacion/canal.core.js';

/**
 * Los tres medidores, con su unidad pegada.
 *
 * `necesitaPlata` es la diferencia que importa hoy: los dos de contribución dependen de que el
 * servidor haya podido leer las reglas del dashboard (`DASHBOARD_SUPABASE_*`). Sin eso el motor
 * devuelve **null y el motivo**, no un cero — mostrar 0 sería decir «no deja nada», que es otra
 * afirmación y es falsa.
 */
export const MEDIDORES = [
  {
    key: 'unidades-dia',
    label: 'Fundas por día que salen',
    unidad: 'fundas/día',
    necesitaPlata: false,
    hint: 'El mismo número del veredicto de arriba: el ritmo de salida de los últimos 30 días.',
  },
  {
    key: 'contrib-unidad',
    label: 'Contribución por funda',
    unidad: '$/funda',
    necesitaPlata: true,
    hint: 'Lo que deja cada unidad después del CMV, las comisiones y el envío.',
  },
  {
    key: 'contrib-dia',
    label: 'Contribución por día',
    unidad: '$/día',
    necesitaPlata: true,
    hint: 'La plata por día con la que se pagan las importaciones y la estructura.',
  },
];

/** ¿Es un medidor que el motor sabe medir? Lo que no está acá **no se guarda**. */
export function esMedidor(key) {
  return MEDIDORES.some((m) => m.key === key);
}

/** La ficha de un medidor, o `null`. */
export function medidorDe(key) {
  return MEDIDORES.find((m) => m.key === key) || null;
}

/**
 * El canal de una meta: uno de los canales conocidos, `null` = **todos juntos**, `undefined` = no
 * es un canal y el que llama tiene que rechazarlo.
 *
 * ⚠️ El vacío se normaliza a `null` en vez de rechazarse: «todos» es el caso más común y tiene que
 * poder cargarse sin elegir nada. Un canal escrito mal, en cambio, no se guarda: la meta mediría
 * contra un canal que no existe y diría «no vendió nada» para siempre.
 */
export function canalDeMeta(valor) {
  const c = String(valor || '').trim();
  if (!c) return null;
  return CANALES.includes(c) ? c : undefined;
}

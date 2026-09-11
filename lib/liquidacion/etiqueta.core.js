/**
 * EL DISEÑO DE LA ETIQUETA DE UNA CAMPAÑA — lo que sale impreso en la prenda.
 *
 * Idea de Bruno (11-sep-2026): *«no estaría mal pensar en que la edición de la etiqueta esté en la
 * campaña con las condiciones del evento»*. Tiene razón y es el lugar correcto: **las condiciones
 * son del evento, ⛔ no de la máquina que imprime**. La feria se cobra en efectivo y transferencia,
 * y eso va abajo del precio en las ~1.800 etiquetas. Si viviera en cada computadora, dos personas
 * etiquetando desde dos lugares pondrían carteles distintos y ⛔ nadie se entera hasta que las
 * prendas están en la mesa.
 *
 * En `.js` plano porque lo importa `api/_liquidacion.js`, y los handlers corren en Node sin pasar
 * por el compilador de Next. `lib/liquidacion/etiqueta.ts` es el re-export tipado de la pantalla.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ ES LISTA BLANCA Y NO EL OBJETO DEL NAVEGADOR
 *
 * Esto se guarda en `liquidaciones.datos` y **se dibuja en un PDF**. Aceptar el objeto tal cual deja
 * que el navegador escriba cualquier cosa adentro —un `tam` que no existe, mil renglones, un texto
 * de dos mil caracteres— y el error ⛔ no se ve en ninguna pantalla: se ve en la Zebra, cuando ya
 * salieron doscientas. Mismo criterio que `itemDelBody` en el mismo handler.
 *
 * Los topes ⛔ no son arbitrarios: la etiqueta chica mide **5 × 2,5 cm**, y ahí adentro entran el
 * título, el precio y dos o tres renglones cortos. Más que eso ⛔ no se imprime más chico: se sale
 * de la etiqueta.
 */

/** Los cuerpos que la etiqueta sabe dibujar. Espejo de `LineaEtiqueta['tam']`. */
export const TAMANIOS_LINEA = ['titulo', 'subtitulo', 'normal', 'chico'];

/** Cuántos renglones entran abajo del precio sin comerse la etiqueta. */
export const MAX_LINEAS_ABAJO = 3;

/** Cuántos caracteres entran en un renglón de 5 cm sin que se parta en tres. */
export const MAX_TEXTO_LINEA = 40;

/**
 * El cuerpo del precio, en puntos.
 *
 * ⚠️ **El default es el de siempre (15).** Una campaña sin diseño tiene que dibujar exactamente la
 * etiqueta que dibujaba antes de que esto existiera.
 */
export const TAM_PRECIO_DEFAULT = 15;
export const TAM_PRECIO_MIN = 8;
export const TAM_PRECIO_MAX = 30;

const clamp = (n, min, max, porDefecto) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return porDefecto;
  return Math.max(min, Math.min(max, Math.round(v)));
};

/** Una línea, normalizada. Devuelve `null` si no queda texto: un renglón vacío ⛔ no es un renglón. */
function unaLinea(raw) {
  const texto = String((raw && raw.texto) || '').trim().slice(0, MAX_TEXTO_LINEA);
  if (!texto) return null;
  const tam = TAMANIOS_LINEA.includes(raw && raw.tam) ? raw.tam : 'chico';
  return { texto, tam, bold: !!(raw && raw.bold) };
}

/**
 * El diseño guardado de una campaña, listo para dibujar.
 *
 * 🔑 **Siempre devuelve un objeto completo**, también para una campaña vieja que ⛔ no tiene nada
 * guardado: la pantalla y el dibujo leen los mismos campos y ⛔ no tienen que preguntar si existe.
 */
export function etiquetaDeCampania(raw) {
  const d = raw || {};
  return {
    abajo: (Array.isArray(d.abajo) ? d.abajo : []).map(unaLinea).filter(Boolean).slice(0, MAX_LINEAS_ABAJO),
    tamPrecio: clamp(d.tamPrecio, TAM_PRECIO_MIN, TAM_PRECIO_MAX, TAM_PRECIO_DEFAULT),
    /**
     * El cuerpo del título (el nombre comercial). Se guarda aparte del texto porque el texto vive en
     * `nombreComercial`, que ⛔ no es sólo de la etiqueta: es cómo se llama la acción para el cliente.
     */
    tamTitulo: TAMANIOS_LINEA.includes(d.tamTitulo) ? d.tamTitulo : 'titulo',
  };
}

/** ¿Este diseño dice algo distinto del default? Sirve para no guardar ruido en campañas que no lo usan. */
export function etiquetaPersonalizada(e) {
  const x = etiquetaDeCampania(e);
  return x.abajo.length > 0 || x.tamPrecio !== TAM_PRECIO_DEFAULT || x.tamTitulo !== 'titulo';
}

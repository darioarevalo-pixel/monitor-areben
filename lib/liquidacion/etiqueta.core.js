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

/**
 * 🔑 **ETIQUETA POR PRENDA** (Bruno, 30-oct-2026, Cyber de Zattia): el cartón del exhibido lleva dos
 * etiquetas —la de nombre/precio/código y la de formas de pago— y si cambia una cambian las dos.
 * Prendido, Precio de campaña imprime **la etiqueta completa** (lista tachada + precio de campaña,
 * nombre, talle, barras, SKU) **y detrás la de formas de pago con los montos de ESA prenda**.
 * Apagado es la etiqueta de mesa de la feria de septiembre: sólo el precio.
 *
 * `pctEfectivo`: cuánto más barato es efectivo/transferencia que la tarjeta. El precio de la
 * campaña ES el de efectivo, así que tarjeta = precio ÷ (1 − pct), redondeado al 90 — la misma
 * regla que armó CYBER MONDAY ONLINE (29-oct) ⇒ el número de tarjeta es el de la tienda.
 */
export const PCT_EFECTIVO_DEFAULT = 10;
export const CUOTAS_DEFAULT = 3;

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
    porPrenda: !!d.porPrenda,
    // 0 es válido (efectivo = tarjeta); por eso ⛔ pasa por `clamp`, que lo leería como «sin dato».
    pctEfectivo: Number.isFinite(Number(d.pctEfectivo)) && d.pctEfectivo !== null && d.pctEfectivo !== ''
      ? Math.max(0, Math.min(50, Math.round(Number(d.pctEfectivo))))
      : PCT_EFECTIVO_DEFAULT,
    cuotas: clamp(d.cuotas, 1, 12, CUOTAS_DEFAULT),
  };
}

/** ¿Este diseño dice algo distinto del default? Sirve para no guardar ruido en campañas que no lo usan. */
export function etiquetaPersonalizada(e) {
  const x = etiquetaDeCampania(e);
  return x.abajo.length > 0 || x.tamPrecio !== TAM_PRECIO_DEFAULT || x.tamTitulo !== 'titulo' || x.porPrenda;
}

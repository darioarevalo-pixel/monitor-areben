/**
 * La tienda pública de cada marca: dónde vive, cómo se arma el link de un producto y a qué precio
 * se lo está vendiendo hoy.
 *
 * # Por qué existe este archivo
 *
 * El dominio de cada tienda estaba escrito a mano en **cinco** lugares, y no coincidían: tres
 * valores distintos para dos marcas. `lib/marketing/core.ts` y `lib/atencion/*` usaban
 * `zattia.com.ar`; `lib/tncat/export.ts` y `components/tncat/FichaProducto.tsx`, `www.zattia.com.ar`;
 * y BDI aparecía con y sin `www` según la pantalla.
 *
 * Ninguno estaba roto —los cuatro hosts contestan, y el `www` de BDI redirige al apex— así que
 * nadie lo notó: esos links iban a un Excel. Dejó de ser inocuo cuando el buscador de Atención al
 * cliente empezó a copiar el link para pegarlo en el WhatsApp de un cliente. **El canónico es el
 * apex** en las dos marcas: es el que sirve Tienda Nube sin redirección.
 *
 * # Por qué es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js`: `api/_atencion.js` necesita el dominio para leer el menú
 * de la tienda, y los handlers de `api/*.js` corren en Node sin pasar por el compilador de Next, así
 * que no pueden importar TypeScript. Si esto fuera `.ts`, el handler sería la sexta copia y la
 * deriva volvería. `lib/tienda.ts` es el re-export tipado que usa la app.
 */

/**
 * El dominio público de cada tienda, sin barra al final. Apex, no `www`.
 *
 * 🔑 **La clave es la LÍNEA, no la marca**: Stunned comparte la base y el Gestión Nube de Zattia
 * (`lib/lineas.core.js`) pero **tiene Tienda Nube propia** —otra tienda, otro token, otro dominio—,
 * y ahí es donde las dos líneas dejan de ser la misma cosa. Verificado el 22-ago-2026:
 * `stunned.com.ar/productos/remera-vintage` contesta 200 y el admin es `stunned3.mitiendanube.com`.
 */
export const TIENDA_BASE = {
  bdi: 'https://bdiaccesorios.com.ar',
  zattia: 'https://zattia.com.ar',
  stunned: 'https://stunned.com.ar',
};

/** El admin de Tienda Nube de cada línea, hasta `/products`. */
export const ADMIN_BASE = {
  bdi: 'https://bdiaccesorios4.mitiendanube.com/admin/products',
  zattia: 'https://zattiaco.mitiendanube.com/admin/products',
  stunned: 'https://stunned3.mitiendanube.com/admin/products',
};

/**
 * 🔴 **Devuelve `null` ante una línea desconocida — nunca BDI por descarte.**
 *
 * Hasta el 22-ago-2026 estas dos funciones terminaban en `|| TIENDA_BASE.bdi`, y eso convertía
 * cualquier string en un link de BDI: un `stunned` que el mapa todavía no tenía habría mandado al
 * cliente a la tienda equivocada, con la URL bien formada y sin fallar. Es el mismo defecto que
 * `baseDeLinea` vino a matar en los permisos (`lib/lineas.core.js`), viviendo acá. `null` corta.
 */
export function tiendaBaseUrl(linea) {
  return TIENDA_BASE[linea] || null;
}

export function adminBaseUrl(linea) {
  return ADMIN_BASE[linea] || null;
}

/**
 * El link público de un producto, o `null` si no se puede armar.
 *
 * Devuelve `null` y no una cadena a medias porque `handle` es opcional en el payload de
 * `tiendanube-audit`: sin él saldría `/productos/undefined`, que es una URL que existe, abre un 404
 * y —lo importante— se puede copiar y mandar sin que nadie se dé cuenta. Con `null`, quien llama
 * tiene que decidir qué mostrar, y lo que muestra es "sin link". Lo mismo con una línea que el
 * mapa no conoce: antes salía un link de BDI.
 */
export function linkProducto(linea, handle) {
  const base = tiendaBaseUrl(linea);
  const h = String(handle == null ? '' : handle).trim();
  return base && h ? `${base}/productos/${h}` : null;
}

/**
 * El precio que la tienda cobra hoy por un producto, o `null` si no hay uno válido.
 *
 * `promo_price` gana cuando existe. Medido sobre los dos catálogos: 35 productos de BDI y 202 de
 * Zattia están en promo, y en los 237 casos el precio de la variante **es** el de promo — o sea que
 * el de promo es el que la tienda está cobrando de verdad.
 *
 * Se toma a nivel producto y no de variante porque las variantes de un mismo producto **nunca**
 * tienen precios distintos: 0 de 235 en BDI y 0 de 661 en Zattia.
 *
 * Vivía en `lib/canjes/vitrina.ts` como `precioDeVitrina` (que hoy es un re-export de esto). Se
 * mudó acá cuando el buscador de Atención necesitó el mismo número: el precio que se le cotiza a
 * alguien por WhatsApp y el que se le congela en la vitrina tienen que ser el mismo, o el día que
 * uno de los dos cambie la regla vamos a tener dos precios para el mismo producto.
 *
 * ⚠️ `null` **no** es cero: es "no hay precio". Quien lo muestre tiene que decir "sin precio", nunca
 * `$0` — un `$0` en un WhatsApp es un problema comercial, no un detalle de formato.
 */
export function precioVigente(p) {
  if (!p) return null;
  const promo = p.promo_price == null ? null : Number(p.promo_price);
  if (promo != null && Number.isFinite(promo) && promo > 0) return promo;
  const lista = p.price == null ? null : Number(p.price);
  return lista != null && Number.isFinite(lista) && lista > 0 ? lista : null;
}

/** Un número que sirve como precio, o `null`. Cero, negativo y `NaN` son "no hay precio". */
function precioValido(n) {
  const v = n == null ? null : Number(n);
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Qué precio le corresponde a la etiqueta —y al cartelito de la góndola— de un producto.
 *
 * Es la misma pregunta en dos pantallas: **Etiquetas** imprime el número y **el chequeo de
 * exhibición** lo compara contra el cartel que cuelga de la percha. Vive acá porque las dos tienen
 * que contestar igual: si una imprime un precio y la otra dice que ese precio está mal, el recorrido
 * del local manda a reimprimir etiquetas que están bien.
 *
 * 🔑 **Una promo que no es MENOR que el precio de lista no es una oferta.** Pasa cuando sube la lista
 * y queda la promo vieja arriba. Tratarla como oferta imprimiría un precio más caro que el de lista
 * y pondría un descuento negativo en la pantalla. Ahí se cobra el de lista, que es lo que hace la
 * tienda. 📌 Medido el 16-ago-2026 sobre los tres catálogos (706 Zattia · 252 BDI · 28 Stunned, 478
 * promos vivas): **cero casos hoy**. Es un pozo tapado antes de pisarlo, no una pérdida en curso.
 *
 * ⚠️ **`aCobrar: null` significa "no se sabe", nunca cero** — un cero se lee como regalado. Quien lo
 * muestre tiene que decir "sin precio".
 *
 * ⛔ **No reemplaza a `precioVigente`**, que sigue como está: ése lo usan la vitrina de Canjes y el
 * buscador de Atención, donde la promo gana siempre. Unificar las ocho reglas de precio del repo es
 * otro trabajo y cambia números que la gente ya usa.
 */
export function ofertaVigente(precioLista, precioPromo) {
  const lista = precioValido(precioLista);
  const promo = precioValido(precioPromo);
  const enOferta = promo != null && lista != null && promo < lista;
  if (enOferta) {
    return { aCobrar: promo, lista, enOferta: true, pct: Math.round((1 - promo / lista) * 100) };
  }
  // Sin precio de lista, una promo suelta es el único número que hay: mejor eso que "no se sabe".
  return { aCobrar: lista == null ? promo : lista, lista, enOferta: false, pct: null };
}

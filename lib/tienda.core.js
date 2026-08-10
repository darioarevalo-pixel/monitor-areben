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

/** El dominio público de cada tienda, sin barra al final. Apex, no `www`. */
export const TIENDA_BASE = {
  bdi: 'https://bdiaccesorios.com.ar',
  zattia: 'https://zattia.com.ar',
};

/** El admin de Tienda Nube de cada marca, hasta `/products`. */
export const ADMIN_BASE = {
  bdi: 'https://bdiaccesorios4.mitiendanube.com/admin/products',
  zattia: 'https://zattiaco.mitiendanube.com/admin/products',
};

export function tiendaBaseUrl(marca) {
  return TIENDA_BASE[marca] || TIENDA_BASE.bdi;
}

export function adminBaseUrl(marca) {
  return ADMIN_BASE[marca] || ADMIN_BASE.bdi;
}

/**
 * El link público de un producto, o `null` si no se puede armar.
 *
 * Devuelve `null` y no una cadena a medias porque `handle` es opcional en el payload de
 * `tiendanube-audit`: sin él saldría `/productos/undefined`, que es una URL que existe, abre un 404
 * y —lo importante— se puede copiar y mandar sin que nadie se dé cuenta. Con `null`, quien llama
 * tiene que decidir qué mostrar, y lo que muestra es "sin link".
 */
export function linkProducto(marca, handle) {
  const h = String(handle == null ? '' : handle).trim();
  return h ? `${tiendaBaseUrl(marca)}/productos/${h}` : null;
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

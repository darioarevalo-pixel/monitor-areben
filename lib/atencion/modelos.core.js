/**
 * Los links de la tienda por modelo de celular, leídos del menú público.
 *
 * # Por qué `.js` y no `.ts`
 * Igual que `permisos.core.js`: `api/_atencion.js` corre en Node sin pasar por el compilador de
 * Next y no puede importar TypeScript. El parseo tiene que correr del lado del servidor porque la
 * tienda está en otro dominio y el navegador no puede leerla. `lib/atencion/modelos.ts` es el
 * re-export tipado que usa la app.
 *
 * # Por qué del menú y no de la API de Tienda Nube
 * Los links ya existen ahí, con el mismo handle que ve la clienta, y no hay que pedirle un campo
 * nuevo a `tn-categorias` ni mantener una lista a mano. Cuando sale un iPhone nuevo y lo cargan en
 * la tienda, aparece solo. Verificado el 9-ago-2026 en bdiaccesorios.com.ar: 27 modelos, del
 * iPhone 11 al 17.
 *
 * El orden es **el del menú**, tal cual: la tienda ya los ordena del más nuevo al más viejo, que es
 * el que sirve para atender. Re-ordenarlos con `ordenarModelo` los dejaría al revés y mandaría el
 * iPhone Air al fondo (no tiene número, así que ese comparador lo manda a 99).
 */

/** El tramo de URL que cuelga de la categoría madre "Modelo de iPhone". */
const RUTA_MODELOS = '/fundas/modelo-de-iphone/';

const RE_ANCHOR = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

/** Quita el markup de adentro del `<a>` y normaliza los espacios y las entidades más comunes. */
function soloTexto(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `iphone-15-pro-max` → `iPhone 15 Pro Max`. Sólo se usa cuando el `<a>` no tiene texto propio
 * (viene con una imagen adentro, por ejemplo); si lo tiene, gana el de la tienda, que es el que la
 * clienta reconoce.
 */
export function nombreDesdeSlug(slug) {
  const partes = String(slug || '').split('-').filter(Boolean);
  return partes
    .map((p) => {
      if (/^iphone$/i.test(p)) return 'iPhone';
      if (/^\d+$/.test(p)) return p;
      if (p.length <= 2) return p.toLowerCase(); // el "e" de iPhone 16e
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    })
    .join(' ')
    .replace(/(\d) (e)\b/i, '$1$2'); // "16 e" → "16e", como lo escribe Apple
}

/**
 * Los modelos del menú, en el orden en que aparecen y sin repetidos.
 *
 * Devuelve `[]` si el HTML no tiene ninguno — el llamador decide si eso es un error o si cae a la
 * semilla. No tira: que la tienda cambie el menú no puede dejar la pantalla en blanco.
 */
export function modelosDelMenu(html, base) {
  const raiz = String(base || '').replace(/\/+$/, '');
  const vistos = new Set();
  const salida = [];
  let m;
  RE_ANCHOR.lastIndex = 0;
  while ((m = RE_ANCHOR.exec(String(html || '')))) {
    const href = m[1];
    const i = href.indexOf(RUTA_MODELOS);
    if (i === -1) continue;
    const slug = href.slice(i + RUTA_MODELOS.length).replace(/[/?#].*$/, '');
    if (!slug || vistos.has(slug)) continue;
    vistos.add(slug);
    // El menú mezcla links absolutos y relativos según el tema de la tienda. Se normaliza a
    // absoluto porque el destino es un chat: un `/fundas/...` pegado en WhatsApp no lleva a ningún
    // lado.
    const url = /^https?:\/\//i.test(href) ? href : raiz + RUTA_MODELOS + slug + '/';
    salida.push({ slug, nombre: soloTexto(m[2]) || nombreDesdeSlug(slug), url });
  }
  return salida;
}

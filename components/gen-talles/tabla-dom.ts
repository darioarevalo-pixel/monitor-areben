/**
 * Extracción DOM de la tabla vieja de una descripción de TN. Es la ÚNICA parte de
 * gen-talles que toca el DOM (usa `DOMParser`), por eso vive aislada del dominio
 * puro (`lib/gen-talles/core.ts`) y sólo se llama desde el cliente. Port de la parte
 * DOM de gtRenderTablaActual (index.html:7420) y genTallesImportar (7432-7449); el
 * emparejado de medidas contra la plantilla lo hace `emparejarMedidas` (puro).
 */

import type { MedidaImportada } from '@/lib/gen-talles/core'

/**
 * Las etiquetas que pueden sobrevivir dentro de la tabla que se muestra en pantalla.
 *
 * Todo lo demás se descarta y se conserva sólo su texto. La lista es de estructura de tabla más
 * un puñado de marcas de formato: alcanza para que la tabla de Tienda Nube se vea igual.
 */
const TAGS_OK = new Set([
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION', 'COLGROUP', 'COL',
  'B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'P', 'BR', 'SMALL', 'SUP', 'SUB',
])

/** Lo único que puede quedar de los atributos. Ni `style`, ni `class`, ni nada que empiece con `on`. */
const ATTRS_OK = new Set(['colspan', 'rowspan'])

/**
 * Deja la tabla en los huesos: sin atributos y sin etiquetas raras.
 *
 * 🔴 **Esto no existía y por eso había un XSS.** `tablaActualHtml` devolvía el `outerHTML` crudo de
 * la primera `<table>` de la **descripción de un producto de Tienda Nube**, y `GenTalles.tsx:182`
 * lo metía con `dangerouslySetInnerHTML`. `DOMParser` **no sanitiza nada**: parsea. Un
 * `<td><img src=x onerror="..."></td>` en la descripción sobrevivía entero y se ejecutaba al abrir
 * la sección. (El `<script>` no corre vía innerHTML, pero los handlers de evento sí, que es lo que
 * importa.)
 *
 * Quién puede escribir esa descripción: cualquiera con acceso al panel de Tienda Nube, una
 * integración, o una cuenta de TN comprometida. Y lo primero que ese JS podía leer era
 * `localStorage['monitor_adminpass']`, que hasta hoy guardaba **la contraseña en claro** — de ahí
 * que estos dos arreglos vayan juntos: el XSS solo es medio, la cadena completa no.
 *
 * Se limpia en vez de reconstruir con JSX a propósito: la tabla se muestra para que alguien copie
 * los números a mano cuando la importación no engancha, así que conviene que se siga viendo como
 * en la tienda. Lo que se pierde son los estilos, que no aportan a eso.
 */
function limpiarTabla(tabla: Element): Element {
  const limpia = tabla.cloneNode(true) as Element
  // `querySelectorAll('*')` devuelve una lista estática, así que borrar mientras se recorre es
  // seguro. Se va de adentro hacia afuera para que al desarmar un nodo sus hijos ya estén limpios.
  const nodos = [...limpia.querySelectorAll('*')].reverse()
  for (const n of nodos) {
    if (!TAGS_OK.has(n.tagName)) {
      // No se borra el contenido: se reemplaza el nodo por su texto. Si alguien puso el talle
      // adentro de un `<font>`, el número tiene que seguir estando.
      n.replaceWith(n.ownerDocument!.createTextNode(n.textContent || ''))
      continue
    }
    for (const attr of [...n.attributes]) {
      if (!ATTRS_OK.has(attr.name.toLowerCase())) n.removeAttribute(attr.name)
    }
  }
  for (const attr of [...limpia.attributes]) {
    if (!ATTRS_OK.has(attr.name.toLowerCase())) limpia.removeAttribute(attr.name)
  }
  return limpia
}

/**
 * El HTML de la primera `<table>` de la descripción, **ya sanitizado**, o null si no hay.
 * Port de gtRenderTablaActual.
 */
export function tablaActualHtml(rawDesc: string | undefined): string | null {
  const doc = new DOMParser().parseFromString(rawDesc || '', 'text/html')
  const tabla = doc.querySelector('table')
  return tabla ? limpiarTabla(tabla).outerHTML : null
}

export type TablaExtraida = { talles: string[]; medidas: MedidaImportada[] }

/**
 * Lee la tabla vieja: talles (cabecera, sin el "T " y el "cm") y una medida por fila
 * con su valor por talle. Devuelve null si no hay tabla o tiene menos de 2 filas.
 * Port de la parte DOM de genTallesImportar.
 */
export function extraerTabla(rawDesc: string | undefined): TablaExtraida | null {
  const doc = new DOMParser().parseFromString(rawDesc || '', 'text/html')
  const tabla = doc.querySelector('table')
  if (!tabla) return null
  const rows = [...tabla.querySelectorAll('tr')].filter((tr) => tr.querySelector('th,td'))
  if (rows.length < 2) return null
  const head = [...rows[0].querySelectorAll('th,td')].map((c) => (c.textContent || '').trim())
  const limpiarTalle = (t: string) => t.replace(/^t\s*(?=\d)/i, '').trim() // "T 36" → "36"
  const limpiarValor = (v: string) => v.replace(/cm\.?/gi, '').replace(/\s+/g, ' ').trim() // "68 CM" → "68"
  const talles = head.slice(1).map(limpiarTalle).filter(Boolean)
  if (!talles.length) return null
  const medidas: MedidaImportada[] = []
  for (let i = 1; i < rows.length; i++) {
    const cells = [...rows[i].querySelectorAll('th,td')].map((c) => (c.textContent || '').trim())
    if (!cells.length || !cells[0]) continue
    const nombre = cells[0].replace(/^[a-zA-Z][.)]\s*/, '').trim()
    const valores: Record<string, string> = {}
    talles.forEach((t, idx) => {
      valores[t] = limpiarValor(cells[idx + 1] || '')
    })
    medidas.push({ nombre, valores })
  }
  return medidas.length ? { talles, medidas } : null
}

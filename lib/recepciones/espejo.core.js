// **El cruce de un renglón de orden de compra contra el espejo de Gestión Nube**, en un solo lugar.
//
// ⛔ **Es `.js` plano, no TypeScript**, porque lo importan `api/_oc-webhook.js`, `api/_recepciones.js`
// y `api/_prm.js`, y los handlers de `api/` corren en Node sin pasar por el compilador de Next
// (ver AGENTS.md).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 LA FOTO ES DEL DÍA QUE LLEGÓ LA ORDEN, Y ENVEJECE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `recepcion_linea.producto_id` / `en_gn` los escribe el webhook **una sola vez**, con el espejo
// que había en ese momento. Y el caso normal —una importación, un proveedor nuevo— es que el
// producto **todavía no esté cargado en Gestión Nube cuando el aviso entra**: se da de alta
// después. Esa columna ⛔ nunca se reescribe (`lib/sesionfotos/banco-oc.ts:11` lo dice y el banco
// de fotos depende de que siga siendo la foto): **quien necesita el producto de HOY lo vuelve a
// cruzar, y esa vuelta es esto.**
//
// 📌 **Medido el 7-sep-2026, y es la razón por la que este archivo existe.** Las 13 órdenes de
// Zattia del 1-sep entraron con **182 de 188 renglones sin `producto_id`** —los productos se
// crearon en GN el 2-sep, 29 horas después— y **los 182 cruzan hoy**. Sin recruce, la ficha de PRM
// de ELIANA IND decía «vendió 0» con **7 unidades vendidas** el 4 y 5-sep, y lo mismo en otros 12
// proveedores: **43 unidades en 30 días**, invisibles.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 «NO SE PUDO PREGUNTAR» ⛔ NO ES «NO ESTÁ»
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `leerEspejo` devuelve `null` —y ⛔ no un mapa vacío— cuando la base de esa marca no contesta o no
// tiene credenciales cargadas. Un mapa vacío se leería como "ninguno de estos SKU existe en GN",
// que es justo la afirmación cara y falsa. Quien llama tiene que ramificar con esos tres estados:
// **está / no está / no pude preguntar**.

/**
 * De a cuántos se pregunta.
 *
 * El `in` de PostgREST viaja en la query string: una orden de 800 renglones armaría una URL que el
 * proxy corta por largo — y **cortada devuelve 200 con menos filas, no un error**.
 */
export const LOTE_ESPEJO = 200

/** Parte una lista en lotes. Con la lista vacía devuelve `[]` y ⛔ no un lote vacío. */
export function enLotes(xs, n = LOTE_ESPEJO) {
  const out = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** Los SKU y códigos de barras distintos que hay que preguntar por estos renglones. */
export function loQuePreguntar(lineas) {
  const skus = [...new Set((lineas || []).map((l) => (l && l.sku ? String(l.sku) : '')).filter(Boolean))]
  const barras = [...new Set((lineas || []).map((l) => (l && l.codigo_barras ? String(l.codigo_barras) : '')).filter(Boolean))]
  return { skus, barras }
}

/**
 * **A qué producto de Gestión Nube apunta un renglón.** Puro.
 *
 * 🔑 **SKU primero, código de barras después**, y ⛔ no al revés: el SKU lo escribe el mismo sistema
 * de Ingresos que carga GN, así que es el que cruza. Medido el 7-sep-2026 sobre los 1.622 renglones
 * del historial, contra el espejo `inventario` de cada marca: Zattia cruza **800 por SKU** y sólo
 * **2 por barcode**, BDI **749** y **0**. El barcode es la red, ⛔ no el camino.
 *
 * ⛔ Devuelve `null` con el espejo mudo, igual que si no estuviera: quien necesite distinguir los
 * dos casos mira si el espejo es `null`, ⛔ no el resultado de acá.
 */
export function productoDeLinea(linea, espejo) {
  if (!espejo || !linea) return null
  const sku = linea.sku ? String(linea.sku) : ''
  const barra = linea.codigo_barras ? String(linea.codigo_barras) : ''
  // El `||` encadenado y ⛔ no un `??`: el espejo guarda `''` para la fila cuyo `product_id` vino
  // en null, y esa cadena vacía tiene que dejar seguir al barcode, no cortar la búsqueda.
  return (sku && espejo.porSku.get(sku)) || (barra && espejo.porBarra.get(barra)) || null
}

/** Si el renglón aparece en el espejo, tenga o no producto. `null` = ⛔ no se pudo preguntar. */
export function estaEnEspejo(linea, espejo) {
  if (!espejo || !linea) return null
  const sku = linea.sku ? String(linea.sku) : ''
  const barra = linea.codigo_barras ? String(linea.codigo_barras) : ''
  return Boolean((sku && espejo.porSku.has(sku)) || (barra && espejo.porBarra.has(barra)))
}

/**
 * Lee el espejo (`inventario`) de UNA marca para estos renglones.
 *
 * Recibe el cliente ya armado —⛔ no las credenciales— para que el núcleo no dependa de cómo se
 * elige la base de cada marca y el test pueda pasarle uno de mentira.
 *
 * @returns `{ porSku, porBarra }`, o **`null` si no se pudo preguntar**.
 */
export async function leerEspejo(cliente, lineas) {
  if (!cliente) return null
  const { skus, barras } = loQuePreguntar(lineas)
  if (!skus.length && !barras.length) return null
  //
  // 🔴 🔑 **LOS LOTES VAN EN PARALELO, y ⛔ no en fila india: el costo son los VIAJES.** Medido el
  // 8-sep-2026 con la lista del PRM (1.622 renglones = 793 SKU de BDI y 782 de Zattia): de a uno
  // son **8 viajes seguidos por marca** y el recruce entero tardaba **3,1 s** — más de la mitad de
  // lo que tardaba la lista. Ninguno de esos lotes espera nada del anterior. Es la misma lección
  // que ya está escrita en `leerTodoEnParalelo`, con otra ropa.
  //
  // 🔑 **Los dos GRUPOS siguen en orden —primero los SKU, después los códigos de barras— y eso ⛔ no
  // es un descuido**: `porBarra` se escribe en los dos, y el segundo tiene que poder pisar al
  // primero. Adentro de cada grupo el orden ⛔ no importa: los lotes son pedazos disjuntos de la
  // misma lista de claves.
  const pedir = async (columna, lotes) => {
    const paginas = await Promise.all(
      lotes.map(async (lote) => {
        const { data, error } = await cliente.from('inventario').select('sku, barcode, product_id').in(columna, lote)
        if (error) throw new Error(error.message)
        return data || []
      }),
    )
    return paginas.flat()
  }

  try {
    const porSku = new Map()
    const porBarra = new Map()
    for (const f of await pedir('sku', enLotes(skus))) {
      if (f.sku) porSku.set(String(f.sku), String(f.product_id ?? ''))
      if (f.barcode) porBarra.set(String(f.barcode), String(f.product_id ?? ''))
    }
    for (const f of await pedir('barcode', enLotes(barras))) {
      if (f.barcode) porBarra.set(String(f.barcode), String(f.product_id ?? ''))
    }
    return { porSku, porBarra }
  } catch {
    return null
  }
}

/**
 * **El recruce de HOY para renglones de VARIAS marcas** — lo que necesitan el PRM y cualquiera que
 * mire órdenes de las dos a la vez.
 *
 * `clienteDeMarca(store)` devuelve el cliente de esa base, o algo falsy si no hay con qué preguntar.
 * Las marcas se preguntan **en paralelo**: son bases distintas y ninguna espera nada de la otra.
 *
 * @returns `{ lineas, mudas, recruzados }` — los renglones con `producto_id` puesto al día, las
 * marcas que ⛔ no se pudieron preguntar, y **cuántos renglones cambiaron**, que es el número que
 * hace visible el envejecimiento en vez de dejarlo callado.
 *
 * 🔴 **«No había nada que preguntar» ⛔ NO es una marca muda.** Renglones sin SKU ni código de
 * barras ⛔ no se le pueden preguntar a nadie: contarlos como muda haría que la pantalla dijera «no
 * se pudo preguntar por las ventas de BDI» por una orden vieja cargada sin códigos, y ese cartel
 * tapa los números buenos de toda la marca.
 */
export async function recruzarPorMarca(lineas, clienteDeMarca) {
  const porStore = new Map()
  for (const l of lineas || []) {
    const s = String(l.store || '')
    if (!porStore.has(s)) porStore.set(s, [])
    porStore.get(s).push(l)
  }

  const espejos = new Map()
  const sinNadaQuePreguntar = new Set()
  const mudas = []
  await Promise.all(
    [...porStore].map(async ([store, suyas]) => {
      const { skus, barras } = loQuePreguntar(suyas)
      if (!skus.length && !barras.length) {
        sinNadaQuePreguntar.add(store)
        return
      }
      espejos.set(store, await leerEspejo(clienteDeMarca(store), suyas))
    }),
  )
  // El orden de `mudas` sale del recorrido de `porStore` y ⛔ no de cuál contestó primero: si
  // dependiera de la carrera, la pantalla nombraría las marcas en distinto orden en cada recarga.
  for (const store of porStore.keys()) if (!espejos.get(store) && !sinNadaQuePreguntar.has(store)) mudas.push(store)

  let recruzados = 0
  const salida = (lineas || []).map((l) => {
    const espejo = espejos.get(String(l.store || ''))
    // 🔴 Con el espejo mudo se conserva la FOTO. Poner `null` sería contestar "este renglón no
    // tiene producto" con la única respuesta que no tenemos.
    if (!espejo) return l
    const hoy = productoDeLinea(l, espejo)
    const antes = l.producto_id == null ? null : String(l.producto_id)
    if (hoy && hoy !== antes) recruzados += 1
    return { ...l, producto_id: hoy || (antes ?? null) }
  })

  return { lineas: salida, mudas, recruzados }
}

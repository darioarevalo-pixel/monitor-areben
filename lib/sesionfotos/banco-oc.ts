/**
 * De la ORDEN DE COMPRA recibida al banco de la sesión — la Fase 4 del octavo (4-sep-2026).
 *
 * Lo pidió Bruno el 3-sep, y es la puerta que le faltaba al banco: *«si el producto de la OC que
 * ingresó no alcanza para armar outfits, se procede a pedir una solicitud a local»*. Para que esa
 * frase se pueda ejecutar, **lo que entró tiene que poder apoyarse en la mesa sin tipearlo de
 * nuevo**: una importación de 130 renglones cargada a mano no la carga nadie.
 *
 * ## 🔴 Se cruza con el espejo de HOY, ⛔ nunca con la foto que quedó guardada
 *
 * Cada renglón de la recepción trae `en_gn` / `producto_id`: **la foto del momento en que llegó la
 * OC**. Y el caso normal de una importación es que el producto **todavía no esté** en Gestión Nube
 * cuando el aviso entra — se da de alta después. Medido el 4-sep sobre las **74 órdenes de Zattia
 * (819 renglones)**: **186 renglones llegaron con `en_gn` en false o null y HOY sí cruzan**. Leer la
 * foto vieja habría dejado afuera **casi uno de cada cuatro**, y el que mira la pantalla lo habría
 * leído como «esto no está cargado» — que es falso y manda a hacer un alta que ya está hecha.
 *
 * Por eso acá se cruza contra `variantesGn`, que son **las mismas que va a expandir el pedido**, y
 * el único dato de la recepción que se cree es el **recruce en vivo** (`en_gn_hoy`), que el
 * endpoint rehace en cada lectura.
 *
 * ## 🔑 El cruce ⛔ NO se reescribe: es el de la cola de fotos
 *
 * `variantesGnDe` —SKU primero, barcode después— y los cuatro motivos de exclusión son los de
 * `cruzarParaSesion`. Lo único que cambia es la **unidad**: allá se pregunta por un producto de
 * Tienda Nube, acá por un renglón de una orden, que ya es una variante. Escribir el criterio dos
 * veces es lo que haría que la cola y el banco llegaran a **productos distintos con el mismo
 * código**.
 *
 * ## 📌 Lo medido el 4-sep-2026, y por qué el número de acá ⛔ no se parece al de la cola
 *
 * El cruce TN → GN de la cola de fotos cubre **BDI 89,5% / Zattia 73,3%**, porque son dos catálogos
 * cargados por manos distintas. El de la OC es **otra cosa**: el SKU del renglón lo escribe el
 * mismo sistema de Ingresos que carga Gestión Nube. Medido sobre **todo el historial**:
 *
 * | | renglones | cruzan por código | por SKU | por barcode | ⛔ no cruzan | sin stock hoy | al banco |
 * |---|---|---|---|---|---|---|---|
 * | Zattia | 819 | **802 (97,9%)** | 800 | 2 | 17 | 252 | 550 |
 * | BDI | 803 | **749 (93,3%)** | 749 | 0 | 54 | 83 | 666 |
 *
 * Y sobre las **10 órdenes más recientes** —que es el caso de uso real, una sesión sobre lo que
 * acaba de entrar— queda **Zattia 167 de 167** y **BDI 402 de 424**.
 *
 * 🔑 **«Sin stock» ⛔ no es un defecto del cruce**: son las órdenes viejas, ya vendidas. Es la
 * misma exclusión que hereda el pedido (`expandirProductos`), y por eso se nombra igual.
 *
 * ⚠️ **`ambiguo` y el renglón que llega a dos variantes ⛔ no pasaron nunca** (0 de 1.622). El guard
 * queda igual: cuesta una línea y el día que pase, elegir sería adivinar.
 *
 * ⚠️ **Ninguna OC trajo mercadería de Stunned** (0 renglones con SKU `STU` en 819) ⇒ ⛔ no se
 * inventa un motivo «es de la otra línea»: hoy no describiría a nadie. Una sesión de Stunned que
 * abriera una OC de Zattia vería sus renglones como «no cruza», que es lo que un catálogo partido
 * puede contestar sin adivinar.
 */

import { indexar, variantesGnDe, type MotivoExcluido } from '../tncat/a-sesion-fotos'
import type { ItemBanco } from './banco'
import type { Variante } from '../etl/tipos'

/**
 * Un renglón de una orden recibida, con **lo único que este cruce mira**.
 *
 * 🔑 Forma estructural, ⛔ no `LineaConCruce`: así el núcleo ⛔ no depende del cliente HTTP de
 * recepciones —y el test ⛔ no tiene que construir una fila entera de la base para probar el cruce—.
 * `LineaConCruce` encaja tal cual.
 *
 * ⛔ **`en_gn` y `producto_id` ⛔ NO están acá, y es a propósito**: son la foto del momento en que
 * llegó la OC. No pedirlos es lo que impide que alguien los lea por error más adelante.
 */
export type LineaOC = {
  oc_ref?: string | null
  sku?: string | null
  codigo_barras?: string | null
  nombre?: string | null
  talle?: string | null
  color?: string | null
  /** El recruce EN VIVO contra el espejo. `null` = ⛔ no se pudo preguntar, que ⛔ no es «no está». */
  en_gn_hoy?: boolean | null
}

/** Un renglón que ⛔ no llegó al banco, con el motivo que dice qué hacer con él. */
export type ExcluidoOC = {
  sku: string
  nombre: string
  motivo: MotivoExcluido
}

export type CruceOC = {
  items: ItemBanco[]
  excluidos: ExcluidoOC[]
}

const conStock = (v: Variante) => (v.local || 0) + (v.deposito || 0) > 0

const nombreDe = (l: LineaOC): string => {
  const partes = [l.nombre || '', l.color || '', l.talle || ''].map((x) => String(x).trim()).filter(Boolean)
  return partes.length ? partes.join(' · ') : '—'
}

/**
 * Los candidatos que salen de una orden recibida, listos para `agregarAlBanco`.
 *
 * `variantesGn` son **las mismas que va a expandir el pedido** (`allVariantes`), y `huerfanas` las
 * que existen en el espejo pero cuyo producto todavía ⛔ no está en Gestión Nube: sirven sólo para
 * separar «cargalo en GN» de «mapeá el SKU», que son dos manos distintas.
 *
 * 🔴 **Nada se descarta en silencio**: cada renglón sale como candidato o como excluido con su
 * motivo. Un cruce que esconde lo que no pudo hace que la sesión salga corta y **nadie se entere**.
 */
export function itemsBancoDesdeOC(
  lineas: LineaOC[],
  variantesGn: Variante[],
  opciones: { huerfanas?: Variante[]; ocRef?: string; ocLabel?: string } = {},
): CruceOC {
  const idx = indexar(variantesGn || [])
  const idxHuerfanas = indexar(opciones.huerfanas || [])
  const items: ItemBanco[] = []
  const excluidos: ExcluidoOC[] = []
  // Dos renglones de la misma orden pueden llegar a la misma variante. ⛔ No es un error ni una
  // exclusión: es la misma prenda contada dos veces, y al banco entra una sola.
  const puestos = new Set<string>()

  for (const l of lineas || []) {
    const sku = String(l.sku || '')
    const nombre = nombreDe(l)
    const encontradas = variantesGnDe({ sku: l.sku, barcode: l.codigo_barras }, idx)

    if (!encontradas.length) {
      // 🔑 Tres respuestas, ⛔ no dos. El espejo de hoy dice si el código está en Gestión Nube; si
      // ⛔ no está —o si su producto ⛔ no está—, lo que falta es un ALTA. Si está y aun así ⛔ no
      // llegamos a una variante viva, lo que falta es mapear el código.
      // ⚠️ `en_gn_hoy` en `null` es «⛔ no se pudo preguntar» y ⛔ no baja a false: sin ese cuidado,
      // una lectura sin espejo mandaría la orden entera a «hay que darlos de alta».
      const enHuerfanas = variantesGnDe({ sku: l.sku, barcode: l.codigo_barras }, idxHuerfanas).length > 0
      const motivo: MotivoExcluido = enHuerfanas || l.en_gn_hoy === false ? 'sin-producto-gn' : 'sin-cruce'
      excluidos.push({ sku, nombre, motivo })
      continue
    }

    // 🔴 Un mismo código que lleva a DOS productos de GN ⛔ no se resuelve eligiendo: el banco
    // quedaría con la mercadería de otro producto y el pedido saldría a buscarla.
    const pids = [...new Set(encontradas.map((v) => String(v.pid)))]
    if (pids.length > 1) {
      excluidos.push({ sku, nombre, motivo: 'ambiguo' })
      continue
    }

    // El mismo control que hereda el pedido: `expandirProductos` deja afuera lo que ⛔ no tiene
    // stock, así que apoyarlo en la mesa sería apoyar algo que después ⛔ no va a entrar.
    const conUnidades = encontradas.filter(conStock)
    if (!conUnidades.length) {
      excluidos.push({ sku, nombre, motivo: 'sin-stock' })
      continue
    }

    for (const v of conUnidades) {
      const vid = String(v.id)
      if (puestos.has(vid)) continue
      puestos.add(vid)
      items.push({
        vid,
        pid: v.pid == null ? null : String(v.pid),
        sid: v.sid == null ? null : String(v.sid),
        // 🔑 El nombre y el talle salen de **Gestión Nube**, ⛔ no del renglón: el banco y la
        // solicitud hablan el idioma del pedido, y ahí es donde alguien lo va a ir a buscar.
        nombre: v.name || nombreDe(l),
        variante: v.size || '—',
        sku: v.sku || sku,
        stockDep: v.deposito || 0,
        stockLoc: v.local || 0,
        candidato: 'oc',
        ...(opciones.ocRef || l.oc_ref ? { ocRef: String(opciones.ocRef || l.oc_ref) } : {}),
        ...(opciones.ocLabel ? { ocLabel: opciones.ocLabel } : {}),
      })
    }
  }

  return { items, excluidos }
}

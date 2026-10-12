/**
 * Las etiquetas de una prenda «para exhibir» y la impresión rápida del armado con el lector
 * (tanda 4, Darío 12-oct-2026). La Zebra está en la MISMA compu donde Lorena escanea.
 *
 * 🔑 **Qué etiqueta sale depende del estado de la variante** (Darío):
 * - **En la campaña de feria** elegida en Configurar → SÓLO la etiqueta de feria, con el precio de
 *   la campaña (el mismo dibujo que Etiquetas → Precio de campaña). Las prendas de la feria se
 *   ocultan en Tienda Nube: su precio ⛔ no sale de la tienda.
 * - **Precio regular** → etiqueta de precio + la de formas de pago.
 * - **En oferta en Tienda Nube** sin estar en la feria → precio rebajado + formas de pago, como en
 *   Etiquetas (el 12-oct era una sola campera, que se retiraba al día siguiente).
 * - **Impresión rápida** (prenda mal etiquetada) → la etiqueta de información de producto: nombre,
 *   talle, código de barras y SKU, sin precio.
 *
 * El dibujo y la impresión son los de Etiquetas (`lib/etiquetas/pdf.ts`): geometría de la Zebra
 * de 5 × 2,5 cm, que ⛔ no se toca.
 */

// ⚠️ En pantalla se dice «campaña» (VOCABULARIO §5: «feria» es el NOMBRE COMERCIAL de una
// campaña); en el papel sale el título que tenga la campaña («FERIA ZATTIA»).

import type { VarianteEti } from '@/lib/etiquetas/tipos'
import type { RepoItem } from './tipos'

export type PrecioDeCampania = { precio: number; firme: boolean }

export type EtiquetaExhibir =
  | { tipo: 'campania'; precio: number }
  | { tipo: 'precio'; precio: number }
  | { tipo: 'rebajado'; antes: number; ahora: number }
  /** En la campaña, pero con un precio que nadie revisó: ⛔ no se imprime (después hay que despegarla). */
  | { tipo: 'campania-provisoria'; precio: number }
  /** Sin precio en ningún lado: ⛔ no se imprime una etiqueta de precio en $0. */
  | { tipo: 'sin-precio' }

/** Qué etiqueta le toca a una prenda para exhibir. Puro. */
export function etiquetaDeExhibir(
  pid: string,
  campania: Record<string, PrecioDeCampania> | null,
  precio: number,
  promo: { normal: number; promo: number } | null,
): EtiquetaExhibir {
  const f = campania?.[pid]
  if (f && f.precio > 0) return f.firme ? { tipo: 'campania', precio: f.precio } : { tipo: 'campania-provisoria', precio: f.precio }
  if (promo && promo.promo > 0 && promo.normal > promo.promo) return { tipo: 'rebajado', antes: promo.normal, ahora: promo.promo }
  if (precio > 0) return { tipo: 'precio', precio }
  return { tipo: 'sin-precio' }
}

/** En palabras, para el botón y el aviso. */
export function rotuloEtiqueta(e: EtiquetaExhibir): string {
  const $ = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
  switch (e.tipo) {
    case 'campania':
      return `Etiqueta de campaña · ${$(e.precio)}`
    case 'precio':
      return `Precio ${$(e.precio)} + formas de pago`
    case 'rebajado':
      return `Precio rebajado ${$(e.ahora)} + formas de pago`
    case 'campania-provisoria':
      return `Precio de campaña sin confirmar (${$(e.precio)})`
    case 'sin-precio':
      return 'Sin precio'
  }
}

/** La variante del reposición, con la forma que piden los dibujos de Etiquetas. */
export function aVarianteEti(it: Pick<RepoItem, 'vid' | 'pid' | 'name' | 'size' | 'sku' | 'barcode' | 'local' | 'deposito'>): VarianteEti {
  return { id: it.vid, pid: it.pid, name: it.name, size: it.size, sku: it.sku || '', barcode: it.barcode || '', stock: (it.local || 0) + (it.deposito || 0) }
}

/** La búsqueda de la impresión rápida: por nombre, SKU o código; sólo variantes con código de barras. */
export function buscarParaImprimir(vars: VarianteEti[], q: string, tope = 20): VarianteEti[] {
  const t = q.trim().toLowerCase()
  if (t.length < 2) return []
  const palabras = t.split(/\s+/)
  return vars
    .filter((v) => !!v.barcode)
    .filter((v) => {
      const texto = `${v.name} ${v.size} ${v.sku} ${v.barcode}`.toLowerCase()
      const enteras = texto.split(/[^0-9a-záéíóúñü#]+/)
      // Una o dos letras sueltas son un TALLE («m», «xl», «38»): palabra entera. Si no, «mini blush m»
      // trae también la S, porque «mini» tiene una m.
      return palabras.every((p) => (p.length <= 2 ? enteras.includes(p) : texto.includes(p)))
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.size.localeCompare(b.size, 'es', { numeric: true }))
    .slice(0, tope)
}

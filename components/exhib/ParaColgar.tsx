'use client'

import { Button, Notice, color, font, space } from '@/components/ui'
import { descargarXlsx } from '@/lib/excel'
import { agruparColgarPorProducto, ANCHOS_COLGAR, filasColgar, resumenColgar, type Colgar } from '@/lib/exhib/colgar'

/**
 * **Lo que falta colgar**, dibujado igual en los tres momentos en que se pregunta: mientras se
 * camina el mueble, al cerrar el recorrido y después, desde otra máquina.
 *
 * 🔑 **Se agrupa por PRENDA y ⛔ no por variante.** Se manda a colgar «traé el TOP ZARA», ⛔ no
 * «traé la variante 9». Las unidades van al lado de cada color porque son la razón por la que una
 * línea importa más que otra: medido en el primer recorrido real, TOP ZARA tenía **9 unidades de un
 * solo color** en el guardado.
 *
 * ⛔ **Esta lista ⛔ no dice «falta» de todo el local**: sólo de las prendas que el recorrido tocó.
 * Ver `lib/exhib/colgar.ts`, que es donde vive la regla y el porqué.
 */
export function ParaColgar({ lista, titulo, archivo, plegable }: { lista: Colgar[]; titulo?: string; archivo?: string; plegable?: boolean }) {
  const { variantes, unidades, productos } = resumenColgar(lista)
  if (!variantes) return null
  const grupos = agruparColgarPorProducto(lista)

  const cuerpo = (
    <>
      <div style={{ maxHeight: plegable ? 260 : 420, overflowY: 'auto', margin: `${space[2]}px 0` }}>
        {grupos.map((g) => (
          <div key={g.productId} style={{ padding: '7px 2px', borderBottom: `1px solid ${color.line}` }}>
            <div style={{ fontWeight: 600, fontSize: font.base, color: color.ink }}>
              {g.name} <span style={{ color: color.mut, fontWeight: 500 }}>· {g.unidades} {g.unidades === 1 ? 'unidad' : 'unidades'}</span>
            </div>
            <div style={{ fontSize: font.xs, color: color.mut }}>
              {g.variantes.map((c) => `${c.it.size || '—'} (${c.it.qty}u)`).join(' · ')} · está en «{g.lugar}»
            </div>
            {/* Aclara y ⛔ no esconde: con el lector engancha bien, y sacarla sería tapar una prenda
                que casi seguro falta de verdad. */}
            {g.variantes.some((c) => c.skuAmbiguo) && (
              <div style={{ fontSize: font.xs, color: color.warningInk }}>⚠ comparte SKU con otra variante: confirmalo con el lector</div>
            )}
          </div>
        ))}
      </div>
      {archivo && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void descargarXlsx(filasColgar(lista), { archivo, hoja: 'Para colgar', anchos: ANCHOS_COLGAR })
          }
        >
          Descargar la lista
        </Button>
      )}
    </>
  )

  return (
    <Notice tone="warning" icon="🧺" style={{ marginBottom: space[4] }}>
      <div style={{ fontWeight: 700 }}>
        {titulo || 'Para colgar'}: {productos} {productos === 1 ? 'prenda' : 'prendas'} · {variantes} {variantes === 1 ? 'color/talle' : 'colores o talles'} · {unidades} {unidades === 1 ? 'unidad' : 'unidades'}
      </div>
      <div style={{ fontSize: font.sm }}>Tienen stock en el Local y no pasaron por el lector, pero sus hermanas sí: están en el guardado.</div>
      {cuerpo}
    </Notice>
  )
}

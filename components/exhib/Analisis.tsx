'use client'

import { Notice, color, font, space } from '@/components/ui'
import { analisisUnidades, type LineaUnidades } from '@/lib/exhib/analisis'
import type { EscaneoLibre } from '@/lib/exhib/libre'
import type { ExhibItem } from '@/lib/exhib/tipos'

/**
 * **El conteo del final: lo que se vio colgado contra lo que el sistema dice que hay.**
 *
 * 🔑 **Va SEPARADO de «para colgar», y es a propósito.** Aquélla es un mandado —alguien va al
 * guardado con esa lista— y sólo lleva variantes de las que ⛔ no se vio ninguna. Esto es un
 * **dato**: de las que sí se vieron, cuántas hay. Una línea de acá ⛔ no manda a nadie a ningún
 * lado: las que faltan pueden estar dobladas en la mesa, y está bien que lo estén.
 *
 * ⚠️ **Sólo habla de lo que se caminó.** La regla y el porqué, en `lib/exhib/analisis.ts`.
 */
export function Analisis({ escaneos, items, titulo }: { escaneos: EscaneoLibre[]; items: ExhibItem[]; titulo?: string }) {
  const a = analisisUnidades(escaneos, items)
  const hayAlgo = a.puedenFaltar.length || a.hayDeMas.length || a.cuadran
  if (!hayAlgo) return null

  const linea = (l: LineaUnidades) => (
    <div key={l.it.productId + '|' + l.it.size} style={{ padding: '6px 2px', borderBottom: `1px solid ${color.line}` }}>
      <div style={{ fontWeight: 600, fontSize: font.base, color: color.ink }}>
        {l.it.name} <span style={{ color: color.mut, fontWeight: 500 }}>· {l.it.size || '—'}</span>
      </div>
      <div style={{ fontSize: font.xs, color: color.mut }}>
        Contaste <b>{l.vistas}</b> · el sistema dice <b>{l.stock}</b> · {l.dif < 0 ? `faltarían ${-l.dif}` : `${l.dif} de más`}
        {l.lugar ? ` · en «${l.lugar}»` : ''}
      </div>
    </div>
  )

  return (
    <Notice tone="neutral" icon="🔢" style={{ marginBottom: space[4] }}>
      <div style={{ fontWeight: 700 }}>
        {titulo || 'El conteo'}: contaste <b>{a.unidadesVistas}</b> {a.unidadesVistas === 1 ? 'unidad' : 'unidades'} · el sistema dice{' '}
        <b>{a.unidadesEnSistema}</b>
      </div>
      <div style={{ fontSize: font.sm }}>
        Sólo de las prendas que pasaron por el lector. {a.cuadran} {a.cuadran === 1 ? 'cuadra' : 'cuadran'} exacto
        {a.repetidas.length > 0 && <> · en <b>{a.repetidas.length}</b> contaste más de una</>}.
      </div>

      {a.puedenFaltar.length > 0 && (
        <>
          <div style={{ fontWeight: 700, marginTop: space[3], color: color.warningInk }}>
            Pueden faltar en el salón ({a.puedenFaltar.length})
          </div>
          <div style={{ fontSize: font.xs, color: color.mut }}>
            Contaste menos de las que hay en el sistema: o están dobladas, o en un mueble que no caminaste, o el stock está mal.
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>{a.puedenFaltar.map(linea)}</div>
        </>
      )}

      {a.hayDeMas.length > 0 && (
        <>
          <div style={{ fontWeight: 700, marginTop: space[3] }}>Hay de más ({a.hayDeMas.length})</div>
          <div style={{ fontSize: font.xs, color: color.mut }}>
            Contaste más de las que el sistema tiene: o el stock está mal cargado, o entró mercadería sin ingresar.
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>{a.hayDeMas.map(linea)}</div>
        </>
      )}
    </Notice>
  )
}

'use client'

import { color, font, space, weight } from '@/components/ui'
import type { Movimiento } from '@/lib/mapa-local/core'
import { nombreBarra, rotuloPrenda } from '@/lib/mapa-local/hoja'

/**
 * La lista «Mover»: qué cambia de lugar con el armado nuevo, agrupado por a dónde va. Lo que va al
 * depósito, al final: es lo último que se hace, cuando ya se colgó lo que entra.
 */
export function Mover({ movs }: { movs: Movimiento[] }) {
  if (!movs.length) return <div style={{ fontSize: font.sm, color: color.mut }}>No hay nada que mover: el armado cuelga lo mismo en los mismos lugares.</div>
  const grupos = new Map<string, Movimiento[]>()
  for (const m of movs) {
    const k = nombreBarra(m.a)
    grupos.set(k, [...(grupos.get(k) || []), m])
  }
  const traer = movs.filter((m) => m.de == null).length
  const guardar = movs.filter((m) => m.a == null).length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ fontSize: font.sm, color: color.ink2 }}>
        {movs.length} prendas cambian de lugar: {traer} se traen del depósito, {guardar} van al depósito y {movs.length - traer - guardar} pasan de una barra a otra.
      </div>
      {[...grupos].map(([destino, ms]) => (
        <div key={destino}>
          <div style={{ fontSize: font.md, fontWeight: weight.bold, color: color.ink, marginBottom: space[1] }}>
            {ms[0].a == null ? 'Al depósito' : `A ${destino}`} <span style={{ fontWeight: 400, color: color.mut }}>({ms.length})</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: space[5], fontSize: font.sm, color: color.ink2 }}>
            {ms.map((m) => (
              <li key={m.prenda.clave}>
                {rotuloPrenda(m.prenda)} <span style={{ color: color.mut }}>· {m.de == null ? 'del depósito' : `de ${nombreBarra(m.de)}`}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

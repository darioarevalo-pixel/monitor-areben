'use client'

import { useState } from 'react'
import { Button, Notice, color, font, space } from '@/components/ui'
import { textoDestino, type ControlModulo as Control } from '@/lib/mapa-local/control'

/**
 * El control de un módulo del Mapa del local, mientras se lo camina con el lector (F4).
 *
 * ⚠️ Como «Falta colgar acá», va como **contador con un botón**, ⛔ no como lista desplegada: mientras
 * se camina el módulo, todo lo que todavía ⛔ no pasó figura como faltante, y desplegarlo es ruido
 * justo cuando hay que mirar el lector.
 */
export function ControlModulo({ c }: { c: Control }) {
  const [ver, setVer] = useState(false)
  const fila = (titulo: string, sub: string, key: string) => (
    <div key={key} style={{ padding: '6px 2px', borderBottom: `1px solid ${color.line}` }}>
      <div style={{ fontWeight: 600, fontSize: font.base, color: color.ink }}>{titulo}</div>
      <div style={{ fontSize: font.xs, color: color.mut }}>{sub}</div>
    </div>
  )
  const conColor = (nombre: string, col: string) => (col ? `${nombre} · ${col}` : nombre)

  return (
    <Notice tone={c.faltan.length || c.sobran.length ? 'warning' : 'neutral'} icon="🗺️" style={{ marginBottom: space[3] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          Mapa · <b>{c.codigo}</b>: {c.bien} de {c.esperadas} en su lugar · faltan <b>{c.faltan.length}</b> · sobran <b>{c.sobran.length}</b>
          {c.sinJuzgar > 0 && ` · ${c.sinJuzgar} sin cruzar`}
        </span>
        {(c.faltan.length > 0 || c.sobran.length > 0) && (
          <Button size="sm" variant="outline" onClick={() => setVer((v) => !v)}>
            {ver ? 'Ocultar' : 'Ver cuáles'}
          </Button>
        )}
      </div>
      {ver && (
        <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: space[2] }}>
          {c.faltan.length > 0 && <div style={{ fontWeight: 600, fontSize: font.sm, marginTop: space[1] }}>Faltan: el mapa las pone acá</div>}
          {c.faltan.map((f) =>
            fila(conColor(f.prenda.nombre, f.prenda.color), f.vistaEn.length ? `se escaneó en «${f.vistaEn.join('», «')}»` : 'no pasó por el lector en este recorrido', f.prenda.clave),
          )}
          {c.sobran.length > 0 && <div style={{ fontWeight: 600, fontSize: font.sm, marginTop: space[2] }}>Sobran: el mapa las pone en otro lado</div>}
          {c.sobran.map((s) => fila(conColor(s.nombre, s.color), textoDestino(s.destino), s.clave))}
        </div>
      )}
    </Notice>
  )
}

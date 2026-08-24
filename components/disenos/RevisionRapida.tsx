'use client'

/**
 * Decidir de a uno, a pantalla completa y con el teclado. El camino alternativo al lote: sirve
 * cuando hay que mirar cada funda en serio, no cuando ya se decidió y falta ejecutar.
 *
 * Sobre la versión anterior cambian dos cosas: va sobre el `Modal` del kit (antes era un
 * `position: fixed` a mano, sin Escape ni scroll lock) y **muestra el puntaje de la ronda** al lado
 * de la foto — que es el dato con el que se decide y no estaba a la vista.
 */

import { useCallback, useEffect } from 'react'
import { etiquetaPuntaje } from '@/lib/disenos/core'
import { MAX_PUNTAJE } from '@/lib/disenos/votacion.core.js'
import type { Diseno, EstadoDiseno } from '@/lib/disenos/tipos'
import type { PuntajeDiseno } from '@/lib/disenos/votacion'
import { Button, Modal, color, font, radius, space } from '@/components/ui'

const TECLAS: { k: EstadoDiseno; lbl: string; tecla: string; tone: 'danger' | 'warning' | 'success' }[] = [
  { k: 'rechazado', lbl: 'Rechazar', tecla: '1', tone: 'danger' },
  { k: 'duda', lbl: 'Duda', tecla: '2', tone: 'warning' },
  { k: 'confirmado', lbl: 'Confirmar', tecla: '3', tone: 'success' },
]

export function RevisionRapida({
  abierto,
  onCerrar,
  cola,
  total,
  index,
  puntajes,
  onClasificar,
  onSaltar,
  onNombre,
}: {
  abierto: boolean
  onCerrar: () => void
  cola: Diseno[]
  total: number
  index: number
  puntajes: Record<string, PuntajeDiseno>
  onClasificar: (e: EstadoDiseno) => void
  onSaltar: () => void
  onNombre: (id: string, v: string) => void
}) {
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!abierto) return
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const hit = TECLAS.find((x) => x.tecla === e.key)
      if (hit) onClasificar(hit.k)
      else if (e.key === ' ') {
        e.preventDefault()
        onSaltar()
      }
    },
    [abierto, onClasificar, onSaltar],
  )
  useEffect(() => {
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onKey])

  const d = cola[Math.min(index, Math.max(0, cola.length - 1))]

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Revisión rápida" cerrarConFondo={false}>
      {!cola.length || !d ? (
        <div style={{ textAlign: 'center', padding: `${space[4]}px 0` }}>
          <div style={{ fontSize: 42 }}>✓</div>
          <div style={{ fontSize: font.lg, fontWeight: 700, margin: '10px 0 4px' }}>Revisaste los {total} diseños</div>
          <div style={{ color: color.mut, fontSize: font.sm, marginBottom: space[4] }}>No queda ninguno por revisar.</div>
          <Button variant="solid" tone="brand" onClick={onCerrar}>
            Ver el tablero
          </Button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>
            Faltan <b style={{ color: color.brand }}>{cola.length}</b> por revisar · {total - cola.length}/{total} clasificados
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.url} alt="" style={{ width: '100%', maxHeight: '46vh', objectFit: 'contain', borderRadius: radius.lg, background: color.bg }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], margin: `${space[2]}px 0` }}>
            <span style={{ fontSize: font.sm, fontWeight: 600, color: puntajes[d.id]?.promedio == null ? color.mut2 : color.ink }}>
              {etiquetaPuntaje(puntajes[d.id])}
            </span>
            {puntajes[d.id]?.promedio != null && (
              <span style={{ fontSize: font.xs, color: color.mut2 }}>de {MAX_PUNTAJE} · lo votó el equipo por link</span>
            )}
          </div>
          <input
            defaultValue={d.name}
            key={d.id}
            onChange={(e) => onNombre(d.id, e.target.value)}
            placeholder="Nombre comercial…"
            style={{ width: '100%', fontSize: font.base, fontWeight: 600, textAlign: 'center', border: 'none', borderBottom: `1px solid ${color.bg2}`, margin: `${space[2]}px 0`, padding: 5, boxSizing: 'border-box', background: 'transparent', color: color.ink }}
          />
          <div style={{ display: 'flex', gap: space[2] }}>
            {TECLAS.map((t) => (
              <Button key={t.k} variant="outline" tone={t.tone} onClick={() => onClasificar(t.k)} style={{ flex: 1, flexDirection: 'column' }}>
                {t.lbl}
                <span style={{ fontSize: font.xs, fontWeight: 400, opacity: 0.65 }}>tecla {t.tecla}</span>
              </Button>
            ))}
          </div>
          <Button variant="ghost" onClick={onSaltar} disabled={cola.length < 2} style={{ width: '100%', marginTop: space[2] }}>
            Saltar por ahora → (barra espaciadora)
          </Button>
        </>
      )}
    </Modal>
  )
}

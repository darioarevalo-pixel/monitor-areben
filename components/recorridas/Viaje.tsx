'use client'

/**
 * Una recorrida abierta: la lista de paradas en el orden en que conviene caminarlas.
 *
 * 🔴 **Todo el viaje se bajó en UN pedido** (`leerRecorrida`) y moverse entre paradas ⛔ no vuelve a
 * pedir red: en las galerías de Avellaneda no hay señal. Por eso las paradas se guardan acá y
 * `Parada` recibe la suya ya cargada.
 *
 * 🔑 **El orden viene GUARDADO de la base, no se recalcula al abrir.** Si se recalculara, tildar una
 * parada movería a las demás de lugar mientras se camina.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, EmptyState, Esqueleto, Notice, color, space } from '@/components/ui'
import { escribir, leerRecorrida, type ParadaViva } from '@/lib/prm/cliente'
import type { Recorrida } from '@/lib/prm/tipos'
import { Parada } from './Parada'

export function Viaje({ marca, id, hoy, onVolver }: { marca: string; id: string; hoy: string; onVolver: () => void }) {
  const [recorrida, setRecorrida] = useState<Recorrida | null>(null)
  const [paradas, setParadas] = useState<ParadaViva[]>([])
  const [abierta, setAbierta] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      try {
        const r = await leerRecorrida(marca, id)
        if (!vivo) return
        setRecorrida(r.recorrida)
        setParadas(r.paradas)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo abrir la recorrida.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, id, tick])

  async function marcar(paradaId: string, patch: { visitado?: boolean; salteado?: boolean }) {
    try {
      await escribir(marca, 'parada.marcar', { id: paradaId, ...patch })
      recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar la parada.')
    }
  }

  if (cargando) return <Esqueleto />
  if (error && !recorrida) return <Notice tone="danger">{error}</Notice>
  if (!recorrida) return null

  const enFoco = paradas.find((p) => p.id === abierta)
  if (enFoco) {
    return (
      <Parada
        marca={marca}
        parada={enFoco}
        hoy={hoy}
        onVolver={() => setAbierta(null)}
        onCambio={() => {
          setAbierta(null)
          recargar()
        }}
      />
    )
  }

  const hechas = paradas.filter((p) => p.visitado_en).length
  const salteadas = paradas.filter((p) => p.salteado && !p.visitado_en).length

  return (
    <div style={{ display: 'grid', gap: space[3], padding: space[3], maxWidth: 680, margin: '0 auto' }}>
      <Button variant="ghost" onClick={onVolver} style={{ justifySelf: 'start' }}>← Volver a las recorridas</Button>

      <div>
        <h2 style={{ margin: 0, fontSize: 20 }}>
          {recorrida.zona || 'Recorrida'} — {recorrida.fecha}
        </h2>
        <div style={{ color: color.mut, fontSize: 13 }}>
          {hechas} de {paradas.length} visitadas{salteadas ? ` · ${salteadas} salteadas` : ''}
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <div style={{ display: 'flex', gap: space[2] }}>
        {recorrida.estado !== 'en_curso' && (
          <Button
            variant="outline"
            onClick={() => void escribir(marca, 'recorrida.estado', { id, estado: 'en_curso' }).then(recargar)}
          >
            Empezar
          </Button>
        )}
        {recorrida.estado !== 'cerrada' && (
          <Button
            variant="ghost"
            onClick={() => void escribir(marca, 'recorrida.estado', { id, estado: 'cerrada' }).then(recargar)}
          >
            Cerrar la recorrida
          </Button>
        )}
      </div>

      {!paradas.length && <EmptyState title="Esta recorrida no tiene paradas." />}

      {paradas.map((p) => (
        <div
          key={p.id}
          style={{
            border: `1px solid ${color.line}`,
            borderRadius: 10,
            padding: space[3],
            opacity: p.visitado_en || p.salteado ? 0.55 : 1,
          }}
        >
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
            <span style={{ color: color.mut2, fontSize: 12, minWidth: 20 }}>{p.orden + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{p.local?.nombre ?? '— local eliminado —'}</div>
              <div style={{ color: color.mut, fontSize: 12 }}>
                {[p.local?.galeria, p.local?.direccion].filter(Boolean).join(' · ') || 'sin dirección'}
              </div>
            </div>
            {p.visitado_en && <Badge tone="success">visitada</Badge>}
            {!p.visitado_en && p.salteado && <Badge tone="neutral">salteada</Badge>}
            {p.intereses.length > 0 && <Badge tone="brand" subtle>{p.intereses.length} interés</Badge>}
            {p.compromisos.length > 0 && <Badge tone="warning" subtle>{p.compromisos.length} prometido</Badge>}
          </div>
          <div style={{ display: 'flex', gap: space[2], marginTop: space[2] }}>
            <Button size="sm" onClick={() => setAbierta(p.id)}>Abrir</Button>
            {!p.visitado_en && (
              <Button size="sm" variant="ghost" onClick={() => void marcar(p.id, { salteado: !p.salteado })}>
                {p.salteado ? 'Volver a la lista' : 'Saltear'}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

'use client'

/**
 * Un local abierto **fuera de un viaje**: tocado desde la lista o recién cargado en la calle.
 *
 * 🔑 **Es la misma pantalla de la calle (`Parada`), con una parada armada acá.** Una segunda
 * pantalla para anotar lo mismo divergiría a la primera semana. La parada suelta tiene
 * `recorrida_id` vacío y `Parada` ⛔ no manda `parada_id` con ella.
 *
 * Lo que hay que saber parado ahí —intereses, promesas, la última vez— sale de la ficha del local
 * (`action=local`), que Recorridas puede leer.
 */
import { useEffect, useState } from 'react'
import { Esqueleto, Notice, Button, space } from '@/components/ui'
import { leerFicha, type ParadaViva } from '@/lib/prm/cliente'
import { ultimaVisita } from '@/lib/prm/core'
import { Parada } from './Parada'

export function LocalSuelto({ marca, id, hoy, onVolver }: { marca: string; id: string; hoy: string; onVolver: () => void }) {
  const [parada, setParada] = useState<ParadaViva | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const f = await leerFicha(marca, id)
        if (!vivo) return
        setParada({
          id: `suelta-${id}`,
          recorrida_id: '',
          local_id: id,
          orden: 0,
          visitado_en: null,
          salteado: false,
          visita_id: null,
          local: f.local,
          intereses: f.intereses.filter((i) => i.estado === 'mirando'),
          compromisos: f.compromisos.filter((c) => !c.cumplido_en),
          ultimaVisita: ultimaVisita(f.visitas),
        })
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo abrir el local.')
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, id, tick])

  if (error)
    return (
      <div style={{ padding: space[4], display: 'grid', gap: space[3] }}>
        <Button variant="ghost" onClick={onVolver} style={{ justifySelf: 'start' }}>← Volver a los locales</Button>
        <Notice tone="danger">{error}</Notice>
      </div>
    )
  if (!parada) return <Esqueleto />
  return (
    <Parada
      marca={marca}
      parada={parada}
      hoy={hoy}
      volverA="Volver a los locales"
      onVolver={onVolver}
      // Guardar la visita relee la ficha: la «última vez» pasa a ser la de hoy.
      onCambio={() => setTick((n) => n + 1)}
    />
  )
}

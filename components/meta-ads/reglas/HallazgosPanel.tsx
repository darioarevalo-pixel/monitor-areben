'use client'

/**
 * Los hallazgos de las automatizaciones, adentro de «Qué hay que decidir» del Panel.
 *
 * # Por qué NO hay una pantalla de alertas
 *
 * El lugar donde se mira «qué hay que hacer» ya existe y ya se usa. Una pantalla nueva de alertas
 * sería un segundo lugar al que hay que acordarse de entrar, y el que no entra no se entera —que es
 * la forma más común en que un sistema de avisos deja de servir. Los hallazgos entran como un
 * renglón más, al lado de las campañas sin marca y de las ideas listas.
 *
 * # Accionar son DOS llamadas, y el orden es el barato
 *
 * Primero la acción de verdad (`accionarMeta`, el camino que ya tiene permiso, `idem`, relectura y
 * registro) y después marcar el hallazgo. Si la segunda falla, la acción igual pasó y el renglón
 * vuelve mañana: se propone de nuevo. Al revés —marcar primero— dejaría dado por hecho algo que no
 * se hizo, que es el error caro.
 */

import { useCallback, useState } from 'react'
import { accionarMeta, resolverHallazgo } from '@/lib/meta-ads/cliente'
import { nuevoIdem } from '@/lib/meta-ads/acciones'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import type { Hallazgo } from '@/lib/meta-ads/reglas'
import type { NivelAccion } from '@/lib/meta-ads/acciones'
import {
  Button, StatusPill, color, font, radius, space, weight, useToast,
} from '@/components/ui'

/** Cómo se lee el botón según lo que propone el hallazgo. */
function rotuloAccion(h: Hallazgo): string | null {
  const s = h.sugerencia
  if (!s) return null
  if (s.accion === 'estado') return s.status === 'PAUSED' ? 'Pausarlo' : 'Reactivarlo'
  return 'Subir el presupuesto'
}

export function HallazgosPanel({ hallazgos, quitar }: { hallazgos: Hallazgo[]; quitar: (id: number) => void }) {
  if (!hallazgos.length) return null
  return (
    <>
      {hallazgos.map((h) => (
        <FilaHallazgo key={h.id} h={h} quitar={quitar} />
      ))}
    </>
  )
}

function FilaHallazgo({ h, quitar }: { h: Hallazgo; quitar: (id: number) => void }) {
  const toast = useToast()
  const [ocupado, setOcupado] = useState(false)

  const accionar = useCallback(async () => {
    const s = h.sugerencia
    if (!s) return
    setOcupado(true)
    // El `idem` se genera acá, al apretar, y no al mandar: generarlo al mandar haría dos claves con
    // un doble clic. Mismo criterio que las acciones sueltas y los planes.
    const campos: Record<string, string | number> = s.accion === 'estado'
      ? { status: s.status }
      : { daily_budget: s.daily_budget }
    const r = await accionarMeta({
      accion: s.accion,
      nivel: s.nivel as NivelAccion,
      objetoId: s.objetoId,
      campos,
      idem: nuevoIdem(),
    })
    if (!r.ok) {
      setOcupado(false)
      toast.error(r.motivo)
      return
    }
    // Recién ahora se marca. Si esto falla, la acción ya pasó y el renglón vuelve mañana.
    const m = await resolverHallazgo(h.id, 'accionado')
    setOcupado(false)
    if (!m.ok) {
      toast.aviso(`Se hizo, pero no se pudo marcar como resuelto: ${m.motivo}. Va a volver a proponerse.`)
      return
    }
    toast.ok('Hecho')
    quitar(h.id)
  }, [h, toast, quitar])

  const ignorar = useCallback(async () => {
    setOcupado(true)
    const m = await resolverHallazgo(h.id, 'ignorado')
    setOcupado(false)
    if (!m.ok) { toast.error(m.motivo); return }
    quitar(h.id)
  }, [h, toast, quitar])

  const rotulo = rotuloAccion(h)

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'center',
        justifyContent: 'space-between',
        border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[3],
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], flexWrap: 'wrap' }}>
          <StatusPill tone="warning" label="Detectado" />
          <span style={{ fontSize: font.base, fontWeight: weight.semibold }}>{h.objetoNombre || h.objetoId}</span>
          <span style={{ fontSize: font.sm, color: color.mut2 }}>{ETIQUETA_LINEA[h.linea]}</span>
        </div>
        <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[1], lineHeight: 1.45 }}>{h.motivo}</div>
      </div>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
        {rotulo && (
          <Button variant="solid" size="sm" disabled={ocupado} onClick={() => void accionar()}>
            {ocupado ? 'Un segundo…' : rotulo}
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => void ignorar()}>
          Ignorar
        </Button>
      </div>
    </div>
  )
}

'use client'

/**
 * Corregir la etapa de una campaña.
 *
 * El modal explica **por qué** existe esta corrección, y no por prolijidad: el que la usa tiene que
 * saber que no está arreglando un error del monitor sino aportando lo único que la API no dice —a
 * qué público le está hablando esa campaña—. Si se lee como «el sistema clasificó mal», se corrige
 * una vez y no se vuelve a mirar.
 */

import { useState } from 'react'
import { ETAPAS, ETIQUETA_ETAPA, rotuloObjetivo } from '@/lib/meta-ads/etapas'
import type { OverrideEtapa } from '@/lib/meta-ads/ideas'
import type { CampañaEtapa, Etapa } from '@/lib/meta-ads/tipos'
import type { Campanias } from '@/components/meta-ads/useCampanias'
import { Button, Field, Input, Modal, Select, color, font, space } from '@/components/ui'

/**
 * El modal enganchado al hook, para que cada pantalla lo ponga con una línea.
 *
 * Va acá y no en cada pantalla porque el `if` de arriba es el que le deja al modal recibir una
 * campaña ya definida: con `m.corrigiendo` leído adentro del `onCorregir`, TypeScript no puede
 * saber que sigue sin ser `null` cuando alguien aprieta Guardar, y la alternativa era un cast.
 */
export function CorreccionAbierta({ m }: { m: Campanias }) {
  const c = m.corrigiendo
  if (!c) return null
  return (
    <ModalCorregir
      c={c}
      override={m.correccion.porCampaña[c.id] || null}
      onCerrar={m.cerrarCorreccion}
      onCorregir={(etapa, motivo) => m.corregir(c, etapa, motivo)}
    />
  )
}

export function ModalCorregir({ c, override, onCerrar, onCorregir }: {
  c: CampañaEtapa
  override: OverrideEtapa | null
  onCerrar: () => void
  onCorregir: (etapa: Etapa, motivo: string) => void
}) {
  const [etapa, setEtapa] = useState<Etapa>((override?.etapa as Etapa) || (c.etapaAuto === 'sin-clasificar' ? 'mofu' : c.etapaAuto))
  const [motivo, setMotivo] = useState(override?.motivo || '')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo="Corregir la etapa de la campaña"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" onClick={() => onCorregir(etapa, motivo.trim())}>Guardar la corrección</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.5 }}>
          <b>{c.nombre}</b>
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[0.5] }}>
            Objetivo en Meta: {rotuloObjetivo(c.objetivo)} · hoy cuenta como {ETIQUETA_ETAPA[c.etapaAuto]}
          </div>
        </div>

        <Field label="A qué etapa va de verdad" width={260}>
          <Select value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa)}>
            {ETAPAS.map((x) => <option key={x} value={x}>{ETIQUETA_ETAPA[x]}</option>)}
          </Select>
        </Field>

        <Field label="Por qué" hint="Opcional, pero es lo que le da sentido a la corrección dentro de seis meses.">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Está apuntada a quienes ya vieron el video" />
        </Field>

        <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.5 }}>
          La etapa es una propiedad del <b>público</b>, no del objetivo de la campaña: una de ventas
          apuntada a gente que nunca te vio es primera etapa disfrazada de tercera, y con lo que la
          API devuelve no hay forma de distinguirlo. Esta corrección es ese dato, y pisa a la
          automática hasta que alguien la saque.
        </div>
      </div>
    </Modal>
  )
}

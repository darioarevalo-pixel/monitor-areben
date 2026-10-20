'use client'

/**
 * 🔔 «Activar avisos», en «Hoy» (Darío, 20-oct-2026). Una vez activados, el renglón dice que
 * están activados y deja mandar un aviso de prueba a este mismo teléfono.
 *
 * ⛔ En la compu y en el navegador común no molesta: si no se puede, ⛔ se dibuja nada — salvo en
 * el iPhone abierto desde Safari, donde dice cómo se hace (agregarlo a inicio).
 */

import { useEffect, useState } from 'react'
import { Button, color, font, space } from '@/components/ui'
import { activarAvisos, estadoAvisos, type EstadoAvisos } from '@/lib/agenda/avisos'
import { avisoDePrueba } from '@/lib/agenda/cliente'

export function ActivarAvisos() {
  const [estado, setEstado] = useState<EstadoAvisos | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [nota, setNota] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    estadoAvisos().then(setEstado).catch(() => setEstado('no-se-puede'))
  }, [])

  if (!estado || estado === 'no-se-puede') return null

  const correr = async (fn: () => Promise<void>) => {
    setOcupado(true)
    setNota(null)
    try { await fn() } catch (e) {
      setNota({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo.' })
    } finally { setOcupado(false) }
  }

  const caja: React.CSSProperties = {
    display: 'grid', gap: space[2], padding: space[3], borderRadius: 12,
    background: color.surface, border: `1px solid ${color.line}`, fontSize: font.base, color: color.ink2,
  }

  return (
    <div style={caja}>
      {estado === 'agregar-a-inicio' && (
        <span>🔔 Para recibir avisos: en Safari, Compartir → <b>Agregar a inicio</b>, y abrir el Monitor desde ese ícono.</span>
      )}
      {estado === 'bloqueados' && (
        <span>🔕 Los avisos están bloqueados. Se activan en Ajustes → Notificaciones → Monitor.</span>
      )}
      {estado === 'apagados' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 180 }}>🔔 Activá los avisos para enterarte de las tareas nuevas.</span>
          <Button variant="solid" tone="brand" disabled={ocupado}
            onClick={() => correr(async () => setEstado(await activarAvisos()))}>
            {ocupado ? 'Activando…' : 'Activar avisos'}
          </Button>
        </div>
      )}
      {estado === 'activados' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 180 }}>🔔 Avisos activados en este teléfono.</span>
          <Button variant="soft" tone="neutral" disabled={ocupado}
            onClick={() => correr(async () => {
              await avisoDePrueba()
              setNota({ ok: true, texto: 'Aviso enviado. Tiene que llegar en unos segundos.' })
            })}>
            {ocupado ? 'Enviando…' : 'Enviar aviso de prueba'}
          </Button>
        </div>
      )}
      {nota && <span style={{ fontSize: font.sm, color: nota.ok ? color.successInk : color.dangerInk }}>{nota.texto}</span>}
    </div>
  )
}

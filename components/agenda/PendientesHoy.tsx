'use client'

/**
 * Los pendientes de hoy, con su tilde. **Un solo componente para los dos lugares donde se tildan**:
 * la pestaña Hoy de la Agenda y el bloque de Inicio.
 *
 * Que sea uno solo no es prolijidad: los dos leen `pendientesDe()`, que es la misma función de la
 * que sale el número del menú, así que **la lista, el bloque y el badge no pueden discrepar**. Un
 * contador que marca uno y una lista que no lo muestra es un número que no se puede apagar, y un
 * número que no se puede apagar se deja de mirar en una semana.
 *
 * # Qué dice el tilde, exactamente
 *
 * ⚠️ `usuario` es `perfil.name`, y `Local` y `Depósito` son **puestos compartidos**, no personas. Por
 * eso el renglón dice "lo marcó Local" y nunca "lo hizo tal": prometer trazabilidad de persona con
 * un usuario de puesto es peor que no prometer nada, porque después alguien la usa para preguntar.
 */

import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, Card, Markdown, Modal, Notice, StatusPill, color, font, space, weight } from '@/components/ui'
import { feriadoDe, pendientesDe, type PendienteHoy } from '@/lib/agenda'
import { leerManual } from '@/lib/manuales/cliente'
import type { Manual } from '@/lib/manuales/tipos'
import { useAgenda } from '@/store/useAgenda'
import { useSistema } from '@/store/useSistema'

export function PendientesHoy({
  fecha,
  /** En Inicio sólo va lo que falta: lo ya tildado ahí sería una lista de cosas para no hacer. */
  soloPendientes = false,
}: {
  fecha: string
  soloPendientes?: boolean
}) {
  const { perfil, marca } = useSesion()
  const items = useAgenda((s) => s.items)
  const hechos = useAgenda((s) => s.hechos)

  const todos = pendientesDe(items, hechos, fecha, { marca })
  const lista = soloPendientes ? todos.filter((p) => !p.hecho) : todos
  if (lista.length === 0) return null

  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      {lista.map((p) => (
        <Renglon key={p.item.id} p={p} fecha={fecha} yo={perfil?.name ?? ''} />
      ))}
    </div>
  )
}

function Renglon({ p, fecha, yo }: { p: PendienteHoy; fecha: string; yo: string }) {
  const marcar = useAgenda((s) => s.marcar)
  const desmarcar = useAgenda((s) => s.desmarcar)
  const [error, setError] = useState<string | null>(null)
  const hecho = p.hecho
  const feriado = feriadoDe(fecha)

  const toggle = async () => {
    setError(null)
    try {
      if (hecho) await desmarcar(p.item.id, fecha)
      else await marcar(p.item.id, fecha, yo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el tilde.')
    }
  }

  return (
    <Card padding={3}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/*
          El cuadradito es el botón, y es grande a propósito: se toca de parado y muchas veces desde
          el teléfono. Es un `button` y no un `input type=checkbox` porque el tilde viaja al servidor
          y puede fallar — el estado real lo manda el store, no el navegador.
        */}
        <button
          type="button"
          onClick={toggle}
          aria-pressed={!!hecho}
          title={hecho ? 'Destildar' : 'Marcar como hecho'}
          style={{
            height: 30, width: 30, flex: '0 0 auto', borderRadius: 8, cursor: 'pointer',
            fontSize: font.base, lineHeight: 1,
            border: `1px solid ${hecho ? color.success : color.line2}`,
            background: hecho ? color.success : 'transparent',
            color: hecho ? '#fff' : color.mut,
          }}
        >
          {hecho ? '✓' : ''}
        </button>

        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: font.base,
                fontWeight: weight.semibold,
                color: hecho ? color.mut : color.ink,
                textDecoration: hecho ? 'line-through' : undefined,
              }}
            >
              {p.item.titulo}
            </span>
            {/*
              El feriado se avisa y no se saltea: saltearlo solo sería deducir que el local está
              cerrado, y hay feriados que se trabaja. Quien mira decide.
            */}
            {feriado && <StatusPill tone="warning" label={`feriado · ${feriado}`} />}
          </div>

          {p.item.cuerpo && (
            <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>{p.item.cuerpo}</div>
          )}

          {hecho && (
            <div style={{ fontSize: font.sm, color: color.mut2, marginTop: 2 }}>
              Lo marcó <b>{hecho.usuario}</b>
              {hora(hecho.hechoAt) ? ` a las ${hora(hecho.hechoAt)}` : ''}
            </div>
          )}

          {error && (
            <Notice tone="danger" style={{ marginTop: space[2] }}>{error}</Notice>
          )}
        </div>

        {p.item.manualId && <BotonComoSeHace manualId={p.item.manualId} />}
      </div>
    </Card>
  )
}

/** «hh:mm» del tilde. Vacío si el timestamp no vino (una fila vieja o un tilde optimista). */
function hora(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * «Cómo se hace»: el manual enganchado a este pendiente.
 *
 * Es el mismo mecanismo que `BotonManual` del encabezado, pero por **id** y no por sección: un
 * procedimiento como "cómo se cierra la caja" no cuelga de ninguna pantalla y por eso se elige a
 * mano al cargar. El cuerpo se pide recién al abrirlo; el título ya viaja en el índice del shell.
 */
function BotonComoSeHace({ manualId }: { manualId: string }) {
  const indice = useSistema((s) => s.manuales).find((m) => m.id === manualId && m.publicado)
  const [abierto, setAbierto] = useState(false)
  const [manual, setManual] = useState<Manual | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Si el manual se despublicó o se borró, no se ofrece: un botón que promete ayuda y no la da es
  // peor que no tener botón.
  if (!indice) return null

  const abrir = () => {
    setAbierto(true)
    if (manual) return
    leerManual(manualId)
      .then(setManual)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo abrir el manual.'))
  }

  return (
    <>
      <Button variant="ghost" size="sm" iconLeft="📘" onClick={abrir}>Cómo se hace</Button>
      {abierto && (
        <Modal abierto ancho="ancho" onCerrar={() => setAbierto(false)} titulo={indice.titulo}>
          {error ? <Notice tone="danger">{error}</Notice>
            : manual ? <Markdown texto={manual.cuerpo} />
            : <div style={{ color: color.mut }}>Abriendo…</div>}
        </Modal>
      )}
    </>
  )
}

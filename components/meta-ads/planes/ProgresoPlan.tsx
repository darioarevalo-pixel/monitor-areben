'use client'

/**
 * **Un plan, paso por paso, con lo que pasó en cada uno.**
 *
 * # Qué tiene que contestar esta pantalla, y por qué no alcanza una barra de progreso
 *
 * «7 de 9» no sirve cuando algo salió mal, que es cuando se mira. Las preguntas reales son *¿qué
 * quedó hecho?*, *¿qué se creó y dónde está?* y *¿qué falta?* — y la última se contesta distinto si
 * el paso está esperando a Meta que si lo rechazó.
 *
 * 🔴 **Un paso «dudoso» NO se dibuja como un error.** Es «se cortó la llamada y todavía no aparece»,
 * que la mayoría de las veces termina en la copia adoptada un momento después. Pintarlo en rojo
 * enseñaría a rearmar el plan, que es exactamente lo que hace dos copias.
 *
 * ⚠️ **Cancelar no deshace**, y el cartel lo dice con todas las letras antes de apretar. Meta no
 * tiene transacciones y fingir que sí sería la mentira más cara de esta sección.
 */

import { useState } from 'react'
import type { EstadoPaso, PasoPlan, Plan } from '@/lib/meta-ads/planes'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import { Button, Card, Notice, StatusPill, color, font, radius, space, weight } from '@/components/ui'

/** Cómo se lee cada estado de paso. El tono es la mitad del mensaje. */
const PINTA: Record<EstadoPaso, { label: string; tone: 'success' | 'warning' | 'danger' | 'brand' | 'neutral' }> = {
  pendiente: { label: 'Falta', tone: 'neutral' },
  'en-curso': { label: 'Mandado', tone: 'brand' },
  hecho: { label: 'Hecho', tone: 'success' },
  // Ámbar y no rojo: ver el comentario de arriba.
  dudoso: { label: 'Esperando a Meta', tone: 'warning' },
  fallado: { label: 'Falló', tone: 'danger' },
  salteado: { label: 'Salteado', tone: 'neutral' },
}

const PINTA_PLAN: Record<Plan['estado'], { label: string; tone: 'success' | 'warning' | 'danger' | 'brand' | 'neutral' }> = {
  pendiente: { label: 'Sin empezar', tone: 'neutral' },
  'en-curso': { label: 'En curso', tone: 'brand' },
  hecho: { label: 'Terminado', tone: 'success' },
  atascado: { label: 'Atascado', tone: 'danger' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
}

export function ProgresoPlan({ plan, avanzando, motivo, onSeguir, onCancelar }: {
  plan: Plan
  avanzando: boolean
  motivo: string | null
  onSeguir: () => void
  onCancelar: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  const hechos = plan.pasos.filter((p) => p.estado === 'hecho' || p.estado === 'salteado').length
  const terminado = plan.estado === 'hecho' || plan.estado === 'cancelado'
  const pinta = PINTA_PLAN[plan.estado]

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], flexWrap: 'wrap' }}>
            <StatusPill tone={pinta.tone} label={pinta.label} />
            <span style={{ fontSize: font.base, fontWeight: weight.semibold }}>{titulo(plan)}</span>
            {plan.simulacro && <StatusPill tone="neutral" label="Simulacro" />}
          </div>
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[1] }}>
            {ETIQUETA_LINEA[plan.linea] || plan.linea} · {hechos} de {plan.pasos.length} pasos · lo armó {plan.quien}
          </div>
        </div>
        <div style={{ display: 'flex', gap: space[2] }}>
          {!terminado && (
            <Button size="sm" variant="solid" tone="brand" onClick={onSeguir} disabled={avanzando}>
              {avanzando ? 'Avanzando…' : hechos ? 'Seguir' : 'Empezar'}
            </Button>
          )}
          {!terminado && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(true)} disabled={avanzando}>
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* 🔑 La marca, visible y copiable: es con lo que se busca en Ads Manager todo lo que este plan
          creó. Esconderla dejaría al que tiene que ir a mirar sin con qué buscar. */}
      <div style={{ fontSize: font.sm, color: color.mut2 }}>
        Todo lo que crea este plan lleva <code style={{ fontWeight: weight.semibold }}>{plan.marcador}</code> en el
        nombre. Buscá eso en Ads Manager para verlo junto.
      </div>

      {confirmando && (
        <Notice tone="warning">
          <div style={{ fontWeight: weight.semibold }}>Cancelar no deshace lo que ya se hizo.</div>
          <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.45 }}>
            {hechos > 0
              ? `Ya corrieron ${hechos} paso(s): lo que se creó sigue en Meta, pausado, y lo que se movió de presupuesto sigue movido. Cancelar sólo deja de avanzar.`
              : 'Todavía no se tocó nada en Meta, así que cancelar no deja nada a medias.'}
          </div>
          <div style={{ display: 'flex', gap: space[2], marginTop: space[2] }}>
            <Button size="sm" variant="solid" tone="danger" onClick={() => { setConfirmando(false); onCancelar() }}>
              Sí, dejar de avanzar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>Volver</Button>
          </div>
        </Notice>
      )}

      {plan.estado === 'atascado' && plan.detalle && <Notice tone="danger">{plan.detalle}</Notice>}
      {plan.estado !== 'atascado' && motivo && <Notice tone="brand">{motivo}</Notice>}

      <ol style={{ display: 'flex', flexDirection: 'column', gap: space[1], margin: 0, padding: 0, listStyle: 'none' }}>
        {plan.pasos.map((p) => <Paso key={p.orden} paso={p} />)}
      </ol>
    </Card>
  )
}

function Paso({ paso }: { paso: PasoPlan }) {
  const pinta = PINTA[paso.estado] || PINTA.pendiente
  return (
    <li
      style={{
        display: 'flex', gap: space[2], alignItems: 'flex-start',
        border: `1px solid ${color.line}`, borderRadius: radius.md, padding: space[2],
      }}
    >
      <span style={{ fontSize: font.sm, color: color.mut2, minWidth: 20, textAlign: 'right' }}>{paso.orden}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.sm, fontWeight: weight.medium }}>{paso.rotulo}</span>
          <StatusPill tone={pinta.tone} label={pinta.label} />
          {paso.intentos > 1 && (
            <span style={{ fontSize: font.xs, color: color.mut2 }}>{paso.intentos} intentos</span>
          )}
        </div>
        {paso.detalle && (
          <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[1], lineHeight: 1.4 }}>{paso.detalle}</div>
        )}
      </div>
    </li>
  )
}

/** Qué dice el plan que hace, en castellano y sin jerga de la API. */
function titulo(plan: Plan): string {
  const e = plan.entrada as Record<string, unknown>
  if (plan.tipo === 'duplicar') {
    const copias = Number(e.copias) || 1
    const que = e.nivel === 'campania' ? 'la campaña' : 'el conjunto'
    const nombre = String(e.nombreOriginal || '')
    return `Duplicar ${que}${copias > 1 ? ` ${copias} veces` : ''}${nombre ? ` «${nombre}»` : ''}`
  }
  if (plan.tipo === 'mover-plata') {
    return `Mover presupuesto de «${String(e.deNombre || '')}» a «${String(e.aNombre || '')}»`
  }
  return plan.tipo
}

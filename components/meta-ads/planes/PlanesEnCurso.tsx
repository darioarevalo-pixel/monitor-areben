'use client'

/**
 * **Planes en curso** — el bloque del Panel que contesta «¿quedó algo a medias?».
 *
 * # Por qué vive en la portada y no en una pantalla propia
 *
 * Porque un plan a medias es una **tarea pendiente de la cuenta**, no un detalle de quien lo armó.
 * El que se cortó puede ser de otra persona, o de anteayer, y si hay que entrar a buscarlo no se
 * entra: queda una campaña pausada dando vueltas que nadie termina ni borra.
 *
 * 🔑 **No se dibuja si no hay nada.** Un bloque vacío prometiendo un motor que todavía no se usó es
 * la misma trampa del ámbar permanente: enseña a ignorar la portada. Cuando hay algo, aparece —y
 * aparece arriba, porque es lo único de esta pantalla que está a medio hacer en Meta ahora mismo.
 *
 * ⚠️ Sale de la BASE, no de Graph: se ve aunque Meta esté caído. Que es exactamente cuando hace
 * falta saber qué quedó a medias.
 */

import { ProgresoPlan } from '@/components/meta-ads/planes/ProgresoPlan'
import { usePlanes } from '@/components/meta-ads/planes/usePlanes'
import { Notice, SectionCard, font, color, space } from '@/components/ui'

export function PlanesEnCurso() {
  const p = usePlanes()

  // Ni mientras carga ni cuando no hay nada: en los dos casos el Panel no tiene nada que decir y un
  // esqueleto que casi siempre queda vacío es peor que el silencio.
  if (p.estado.fase === 'cargando') return null
  if (p.estado.fase === 'error') {
    return (
      <Notice tone="warning">
        No se pudieron leer los planes en curso: {p.estado.motivo}
        <div style={{ fontSize: font.sm, marginTop: space[1] }}>
          Si hay alguno a medias, sigue existiendo: esto es la lectura, no el motor.
        </div>
      </Notice>
    )
  }
  if (!p.planes.length) return null

  const atascados = p.planes.filter((x) => x.estado === 'atascado').length

  return (
    <SectionCard
      title="Planes en curso"
      subtitle={atascados
        ? `${atascados} de ${p.planes.length} necesita que alguien mire: se frenaron y no siguen solos.`
        : 'Lo que está a medio armar en Meta. Se puede cerrar la pestaña: el avance se retoma desde donde quedó.'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {p.planes.map((plan) => (
          <ProgresoPlan
            key={plan.id}
            plan={plan}
            avanzando={p.avanzando === plan.id}
            motivo={p.motivo && p.motivo.id === plan.id ? p.motivo.texto : null}
            onSeguir={() => void p.seguir(plan.id)}
            onCancelar={() => void p.cancelar(plan.id)}
          />
        ))}
      </div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[2] }}>
        Todo lo que crea un plan nace pausado, en los tres niveles: un plan cortado a la mitad no
        gasta un peso.
      </div>
    </SectionCard>
  )
}

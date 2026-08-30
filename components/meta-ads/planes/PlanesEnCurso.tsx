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
 *
 * # 🔴 Por qué un plan atascado se cae de acá a los 7 días
 *
 * Medido el 30-ago-2026: los planes 1 y 2 estaban en este bloque desde el **8-ago** —22 días—, los
 * dos con el mismo rechazo de Meta, los dos imposibles de destrabar reintentando. Un aviso que está
 * siempre no es un aviso: es parte del fondo, y termina tapando al plan de ayer que sí se puede
 * terminar. Con la edad a la vista y los viejos plegados, lo que queda arriba es lo accionable.
 *
 * 🔑 **Y ⛔ NO se archivan: es un filtro de LECTURA** (`partirPlanes`). No se escribe nada — un GET
 * que cambia el estado de una fila es una escritura que nadie pidió —, siguen existiendo, siguen
 * en el Registro y este mismo bloque dice cuántos son y los abre de un click.
 */

import { useState } from 'react'
import { DIAS_PLAN_VIEJO, partirPlanes, type Plan } from '@/lib/meta-ads/planes'
import { ProgresoPlan } from '@/components/meta-ads/planes/ProgresoPlan'
import { usePlanes } from '@/components/meta-ads/planes/usePlanes'
import { Button, Notice, SectionCard, font, color, space } from '@/components/ui'

/**
 * El reloj entra acá y ⛔ no en el cuerpo del componente: `react-hooks/purity` prohíbe `Date.now()`
 * en el render, y con razón. El núcleo lo recibe como parámetro para poder probarlo — es la misma
 * partición que `leerSilencio()` en `ZonaRendimiento.tsx`.
 */
function repartir(planes: Plan[]) {
  return partirPlanes(planes, Date.now())
}

export function PlanesEnCurso() {
  const p = usePlanes()
  // ⚠️ Arriba de las salidas tempranas: un hook después de un `return` cambia la cantidad de hooks
  // entre renders. Es la misma razón por la que el despacho de vistas vive en `MetaAds.tsx`.
  const [abiertos, setAbiertos] = useState(false)

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

  const { vivos, viejos } = repartir(p.planes)
  // Con TODOS viejos el bloque igual se dibuja, pero sin prometer que hay algo a medio hacer hoy:
  // esconderlo del todo perdería el único lugar donde se los puede cancelar.
  const atascados = vivos.filter((x) => x.estado === 'atascado').length
  const dibujados = abiertos ? [...vivos, ...viejos] : vivos

  return (
    <SectionCard
      title="Planes en curso"
      subtitle={atascados
        ? `${atascados} de ${vivos.length} necesita que alguien mire: se frenaron y no siguen solos.`
        : vivos.length
          ? 'Lo que está a medio armar en Meta. Se puede cerrar la pestaña: el avance se retoma desde donde quedó.'
          : `Nada a medio armar hoy. Quedan ${viejos.length} frenados de hace más de ${DIAS_PLAN_VIEJO} días.`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {dibujados.map((plan) => (
          <ProgresoPlan
            key={plan.id}
            plan={plan}
            avanzando={p.avanzando === plan.id}
            motivo={p.motivo && p.motivo.id === plan.id ? p.motivo.texto : null}
            onSeguir={() => void p.seguir(plan.id)}
            onReintentar={(orden) => void p.reintentar(plan.id, orden)}
            onCancelar={() => void p.cancelar(plan.id)}
          />
        ))}
      </div>
      {/* 🔑 La línea dice CUÁNTOS y desde cuándo: «hay más» sin el número se lee como un detalle de
          la interfaz, y lo que tiene que quedar claro es que hay trabajo frenado que nadie cerró. */}
      {viejos.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', marginTop: space[2] }}>
          <span style={{ fontSize: font.sm, color: color.mut }}>
            {viejos.length === 1
              ? `Y 1 frenado hace más de ${DIAS_PLAN_VIEJO} días, que nadie cerró.`
              : `Y ${viejos.length} frenados hace más de ${DIAS_PLAN_VIEJO} días, que nadie cerró.`}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setAbiertos((v) => !v)}>
            {abiertos ? 'Ocultarlos' : 'Verlos'}
          </Button>
        </div>
      )}
      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[2] }}>
        Todo lo que crea un plan nace pausado, en los tres niveles: un plan cortado a la mitad no
        gasta un peso.
      </div>
    </SectionCard>
  )
}

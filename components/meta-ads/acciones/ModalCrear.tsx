'use client'

/**
 * **Una campaña NUEVA, a partir de un conjunto que ya entrega.**
 *
 * # Por qué esto no es «duplicar» y por qué el formulario es tan corto
 *
 * Duplicar deja la copia **en la misma campaña** que el original. Esto crea la campaña propia, con
 * su objetivo, y le cuelga el conjunto y los avisos. Es la operación que hace falta para estrenar
 * una idea del tablero sin heredar la historia de la campaña vieja.
 *
 * 🔑 **Lo único que se elige es el nombre y el presupuesto.** La segmentación, la optimización, el
 * cobro, el píxel y los creativos salen del conjunto de referencia, tal cual. No es una limitación
 * del MVP: el `targeting spec` es la superficie más grande y más rechazable de la API, y la matriz
 * de *objetivo × optimización × cobro* es la fuente número uno de rechazos. Copiarlos de algo que
 * está entregando **hoy, en esta cuenta, con este token** garantiza que son válidos sin tener que
 * modelar ninguna de las dos cosas. Un formulario con esos campos sería pedirle a una persona que
 * adivine qué combinaciones son legales.
 *
 * ⚠️ **El objetivo tampoco se elige, y eso tiene un borde**: si la campaña de la referencia usa un
 * objetivo que Meta retiró —`LINK_CLICKS`, que es el de 23 de los 43 conjuntos activos—, no se puede
 * crear nada a partir de ella. El servidor lo dice con la lista de los que sí sirven.
 *
 * 🔑 **Armar el plan NO escribe en Meta**, y acá eso es la mitad del valor: los pasos que aparecen
 * —con el nombre de cada aviso que se va a crear— son la vista previa de lo que va a pasar, ya
 * validada contra Meta. Lo que escribe es «Empezar».
 */

import { useState } from 'react'
import { cancelarPlan, crearPlan, reintentarPaso } from '@/lib/meta-ads/cliente'
import { aCrudo, aMonto, LARGO_NOMBRE } from '@/lib/meta-ads/acciones'
import { nuevoIdemPlan, type Plan } from '@/lib/meta-ads/planes'
import { ProgresoPlan } from '@/components/meta-ads/planes/ProgresoPlan'
import { avanzarHasta } from '@/components/meta-ads/planes/usePlanes'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import { Button, Field, Input, Modal, Notice, NumberField, color, font, space } from '@/components/ui'
import type { ObjetoMeta } from '@/components/meta-ads/acciones/tipos'

export function ModalCrear({ o, diarioCrudo, onCerrar }: {
  /** El conjunto de referencia: de acá sale todo lo que no se elige. */
  o: ObjetoMeta
  diarioCrudo: number
  onCerrar: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [monto, setMonto] = useState<number | ''>(diarioCrudo > 0 ? aMonto(diarioCrudo, o.moneda) : '')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [enPlan, setEnPlan] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)
  // 🔑 El `idem` nace al ABRIR el modal, no al apretar: si naciera al apretar, un doble clic serían
  // dos claves y dos campañas. Y es el mismo con el que la sonda encuentra lo que el plan creó.
  const [idem] = useState(nuevoIdemPlan)

  const limpio = nombre.trim()
  const nombreLargo = limpio.length > LARGO_NOMBRE
  const montoInvalido = typeof monto !== 'number' || monto <= 0
  const listo = !!limpio && !nombreLargo && !montoInvalido

  const armar = async () => {
    setEnPlan(true)
    setMotivo(null)
    const r = await crearPlan({
      tipo: 'crear',
      idem,
      referenciaId: o.id,
      nombre: limpio,
      presupuestoCrudo: typeof monto === 'number' ? aCrudo(monto, o.moneda) : null,
    })
    setEnPlan(false)
    if (!r.ok) { setMotivo(r.motivo); return }
    setPlan(r.dato.plan)
  }

  // Con el plan armado el modal deja de ser un formulario y pasa a ser el progreso: mandar a
  // buscarlo al Panel perdería a la persona justo en el medio de la operación.
  if (plan) {
    return (
      <Modal
        abierto
        onCerrar={onCerrar}
        cerrarConFondo={false}
        titulo="Plan · campaña nueva"
        pie={<Button variant="ghost" onClick={onCerrar}>Cerrar</Button>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.5 }}>
            Estos son los pasos que se van a mandar, <b>y Meta ya dijo que los acepta</b>. Todavía no
            se escribió nada. <b>Se puede cerrar esto</b>: el plan queda en el Panel y el avance se
            retoma desde donde quedó.
          </div>
          <ProgresoPlan
            plan={plan}
            avanzando={enPlan}
            motivo={motivo}
            onSeguir={() => {
              setEnPlan(true)
              setMotivo(null)
              void avanzarHasta(plan.id, setPlan).then((m) => { setMotivo(m); setEnPlan(false) })
            }}
            onReintentar={(orden) => {
              setEnPlan(true)
              setMotivo(null)
              void reintentarPaso(plan.id, orden).then((r) => {
                if (!r.ok) { setMotivo(r.motivo); setEnPlan(false); return }
                setPlan(r.dato.plan)
                return avanzarHasta(plan.id, setPlan).then((m) => { setMotivo(m); setEnPlan(false) })
              })
            }}
            onCancelar={() => { void cancelarPlan(plan.id).then((r) => { if (r.ok) setPlan(r.dato.plan) }) }}
          />
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo="Nueva campaña, con esta segmentación"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={enPlan}>Cancelar</Button>
          <Button variant="solid" tone="brand" disabled={!listo || enPlan} onClick={() => void armar()}>
            {enPlan ? 'Preguntándole a Meta…' : 'Armar el plan'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.5 }}>
          Se crea una campaña propia —con el objetivo de la campaña de <b>{o.nombre}</b>— y adentro un
          conjunto con <b>su misma segmentación</b> y los mismos avisos. <b>Todo nace pausado</b>, así
          que no gasta hasta que alguien lo prenda.
          {o.linea && <> Queda como pauta de <b>{ETIQUETA_LINEA[o.linea] || o.linea}</b>.</>}
        </div>

        <Notice tone="brand">
          <b>Sólo elegís el nombre y el presupuesto.</b> La segmentación, la optimización, el cobro,
          el píxel y los creativos se copian del conjunto de referencia sin tocarlos — que es lo que
          hace que Meta no los rechace. Para cambiar alguno de ésos, el camino es en Ads Manager,
          sobre la campaña ya creada.
        </Notice>

        <Field label="Cómo se va a llamar la campaña">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="GIRLHOOD CALOR — intereses"
            autoFocus
          />
        </Field>
        {nombreLargo && <Notice tone="danger">El nombre no puede pasar de {LARGO_NOMBRE} caracteres.</Notice>}

        <Field label="Presupuesto diario del conjunto">
          <NumberField value={monto} onChange={setMonto} min={0} />
        </Field>
        {montoInvalido && <Notice tone="warning">Poné un presupuesto diario mayor que cero.</Notice>}

        {motivo && <Notice tone="danger">No se pudo armar el plan: {motivo}</Notice>}
      </div>
    </Modal>
  )
}

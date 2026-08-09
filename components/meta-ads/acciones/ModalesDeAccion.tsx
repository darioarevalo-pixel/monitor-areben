'use client'

/**
 * Los cinco modales de escritura, dibujados desde el estado que devuelve `useAccionMeta`.
 *
 * 🔑 **Una sola línea por pantalla.** Cada pantalla de Meta que pueda accionar pone `<ModalesDeAccion
 * m={a.modales} />` y ya tiene los cinco, con sus `idem`, sus conversiones de moneda y su recarga.
 * Antes esto eran tres `useState` y tres handlers sueltos en `Etapas.tsx`, así que **Etapas era la
 * única pantalla desde la que se podía accionar**: repartirla habría significado copiar el `/100` a
 * los dos lados, que es exactamente el cálculo que no puede estar dos veces.
 */

import { ModalCrear } from '@/components/meta-ads/acciones/ModalCrear'
import { ModalDuplicar } from '@/components/meta-ads/acciones/ModalDuplicar'
import { ModalEscalar } from '@/components/meta-ads/acciones/ModalEscalar'
import { ModalNombre } from '@/components/meta-ads/acciones/ModalNombre'
import { ModalPresupuesto } from '@/components/meta-ads/acciones/ModalPresupuesto'
import type { ModalesAccion } from '@/components/meta-ads/acciones/useAccionMeta'

export function ModalesDeAccion({ m }: { m: ModalesAccion }) {
  return (
    <>
      {m.presu && (
        <ModalPresupuesto
          o={m.presu.o}
          diarioCrudo={m.presu.diarioCrudo}
          guardando={m.enCurso === m.presu.o.id}
          onCerrar={m.cerrar}
          onGuardar={m.guardarPresupuesto}
        />
      )}

      {m.ren && (
        <ModalNombre
          o={m.ren}
          guardando={m.enCurso === m.ren.id}
          onCerrar={m.cerrar}
          onGuardar={m.guardarNombre}
        />
      )}

      {m.dup && (
        <ModalDuplicar
          o={m.dup.o}
          diarioCrudo={m.dup.diarioCrudo}
          sinPresupuesto={m.dup.sinPresupuesto}
          trabajando={m.enCurso === m.dup.o.id}
          onCerrar={m.cerrar}
          onDuplicar={m.duplicar}
        />
      )}

      {m.nueva && (
        <ModalCrear
          o={m.nueva.o}
          diarioCrudo={m.nueva.diarioCrudo}
          onCerrar={m.cerrar}
        />
      )}

      {m.esc && (
        <ModalEscalar
          o={m.esc.o}
          diarioCrudo={m.esc.diarioCrudo}
          techoCrudo={m.esc.techoCrudo}
          onCerrar={m.cerrar}
        />
      )}
    </>
  )
}

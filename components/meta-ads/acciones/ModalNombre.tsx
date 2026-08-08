'use client'

/**
 * Cambiar el nombre y nada más.
 *
 * # Por qué esto tiene su propio botón y no vive sólo adentro de duplicar
 *
 * Nació como el segundo paso de «duplicar y ajustar» —la copia sale con el sufijo automático y hay
 * que poderle poner el nombre de verdad—, pero la acción de renombrar sirve igual por su cuenta: los
 * nombres son el único mapa que hay para saber qué es cada campaña cuando son 170, y hasta ahora
 * arreglar uno mal puesto obligaba a ir a Ads Manager.
 *
 * Es la única escritura de esta pantalla que **no cambia lo que Meta hace**: no toca la entrega, ni
 * el presupuesto, ni el estado. Por eso el cartel es corto y el botón no es de tono de advertencia.
 */

import { useState } from 'react'
import { LARGO_NOMBRE, nuevoIdem } from '@/lib/meta-ads/acciones'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import { Button, ConfirmDetalle, Field, Input, Modal, Notice, color, font, space } from '@/components/ui'
import { ROTULO_NIVEL, type ObjetoMeta } from '@/components/meta-ads/acciones/tipos'

export function ModalNombre({ o, onCerrar, onGuardar, guardando }: {
  o: ObjetoMeta
  onCerrar: () => void
  onGuardar: (nombre: string, idem: string) => void
  guardando: boolean
}) {
  const [nombre, setNombre] = useState(o.nombre)
  // El `idem` nace con el modal, no con el clic. Ver `ModalPresupuesto`.
  const [idem] = useState(nuevoIdem)

  const limpio = nombre.trim()
  const largo = limpio.length > LARGO_NOMBRE
  const invalido = !limpio || largo
  const sinCambio = limpio === o.nombre.trim()

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={`Renombrar · ${ROTULO_NIVEL[o.nivel]}`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button
            variant="solid"
            tone="brand"
            disabled={invalido || sinCambio || guardando}
            onClick={() => onGuardar(limpio, idem)}
          >
            {guardando ? 'Escribiendo en Meta…' : 'Renombrar'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field
          label="Nombre"
          hint="Sólo cambia cómo se llama. No toca la entrega, el presupuesto ni el estado."
        >
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            invalid={invalido}
            maxLength={LARGO_NOMBRE + 1}
            style={{ width: '100%' }}
            autoFocus
          />
        </Field>

        <div>
          <ConfirmDetalle label="Hoy" valor={o.nombre} />
          {o.cuenta && <ConfirmDetalle label="Cuenta" valor={o.cuenta} />}
          {o.linea && <ConfirmDetalle label="Marca" valor={ETIQUETA_LINEA[o.linea]} />}
        </div>

        {largo && <Notice tone="warning">El nombre no puede pasar de {LARGO_NOMBRE} caracteres.</Notice>}

        {/* El nombre es lo único que hay para desempatar dos campañas parecidas en Ads Manager, en
            los informes y en la auditoría de esta misma pantalla. Cambiarlo no rompe nada, pero
            quien mire un reporte viejo va a ver el nombre de antes. */}
        {!invalido && !sinCambio && (
          <div style={{ fontSize: font.xs, color: color.mut }}>
            El nombre nuevo se ve enseguida acá y en Ads Manager. Los informes ya exportados siguen
            con el viejo.
          </div>
        )}
      </div>
    </Modal>
  )
}

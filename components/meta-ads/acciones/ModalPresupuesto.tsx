'use client'

/**
 * Cambiar el presupuesto diario.
 *
 * # Por qué esto es un modal propio y no un `confirmar()` más
 *
 * Porque hay un número que tipear, y partirlo en dos pasos —primero pedir el monto, después
 * confirmarlo— sería preguntar dos veces lo mismo. **Este modal ES la confirmación**: muestra el
 * valor de hoy, el nuevo y la diferencia en vivo, y su botón dice cuánto va a quedar. Un cero de
 * más se ve mientras se tipea, que es cuando sirve verlo.
 *
 * 🔑 Meta maneja los montos en la **unidad menor de la moneda** (en ARS, `1800000` es $18.000). La
 * conversión pasa por `aCrudo`/`aMonto` y por ningún otro lado: un `×100` de más es la diferencia
 * entre subir el diario y multiplicarlo por cien, y Meta acepta los dos sin chistar.
 */

import { useState } from 'react'
import { aCrudo, aMonto, nuevoIdem } from '@/lib/meta-ads/acciones'
import { money } from '@/lib/meta-ads/formato'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import {
  Button, ConfirmDetalle, Field, Modal, Notice, NumberField, color, font, space,
} from '@/components/ui'
import { ROTULO_NIVEL, type ObjetoMeta } from '@/components/meta-ads/acciones/tipos'

export function ModalPresupuesto({ o, diarioCrudo, onCerrar, onGuardar, guardando }: {
  o: ObjetoMeta
  diarioCrudo: number
  onCerrar: () => void
  onGuardar: (nuevoCrudo: number, idem: string) => void
  guardando: boolean
}) {
  const actual = aMonto(diarioCrudo, o.moneda)
  const [monto, setMonto] = useState<number | ''>(Math.round(actual))
  // El `idem` nace con el modal, no con el clic en Guardar: si naciera con el clic, dos clics
  // rápidos serían dos claves y dos escrituras.
  const [idem] = useState(nuevoIdem)

  const nuevo = typeof monto === 'number' ? monto : 0
  const delta = nuevo - actual
  const invalido = typeof monto !== 'number' || monto <= 0
  const sinCambio = !invalido && aCrudo(nuevo, o.moneda) === diarioCrudo

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={`Presupuesto diario · ${ROTULO_NIVEL[o.nivel]}`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button
            variant="solid"
            tone={delta > 0 ? 'warning' : 'brand'}
            disabled={invalido || sinCambio || guardando}
            onClick={() => onGuardar(aCrudo(nuevo, o.moneda), idem)}
          >
            {guardando ? 'Escribiendo en Meta…' : `Poner ${money(nuevo, o.moneda)} por día`}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.5 }}>
          <b>{o.nombre}</b>
          {o.linea && <div style={{ fontSize: font.sm, color: color.mut }}>{ETIQUETA_LINEA[o.linea]}</div>}
        </div>

        {/* El caso CBO —el presupuesto vive en la campaña y el del conjunto no se toca— no llega
            hasta acá: el botón no se dibuja (`BotonesAccion`, `sinPresupuesto`) y, si alguien lo
            fuerza igual, lo corta el 409 del servidor. Este modal sólo se abre donde hay un diario
            propio que cambiar. */}
        <Field label="Presupuesto diario" hint="Lo que Meta puede gastar por día. Cambia la entrega en el acto.">
          <NumberField value={monto} onChange={setMonto} min={0} step={100} prefix="$" width={160} invalid={invalido} />
        </Field>

        <div>
          <ConfirmDetalle label="Hoy" valor={money(actual, o.moneda)} />
          <ConfirmDetalle label="Va a quedar" valor={invalido ? '—' : money(nuevo, o.moneda)} />
          {!invalido && delta !== 0 && (
            <ConfirmDetalle
              label="Diferencia"
              valor={
                <span style={{ color: delta > 0 ? color.warningInk : color.mut }}>
                  {delta > 0 ? '+' : '−'}{money(Math.abs(delta), o.moneda)} por día
                  {actual > 0 && ` (${delta > 0 ? '+' : '−'}${Math.round(Math.abs(delta / actual) * 100)}%)`}
                </span>
              }
            />
          )}
        </div>

        {/* Lo que no es obvio y cambia la decisión: un salto grande de presupuesto reabre la fase de
            aprendizaje y los primeros días rinden peor. No se bloquea —los topes de variación
            quedaron descartados a propósito—, se dice. */}
        {!invalido && actual > 0 && Math.abs(delta / actual) >= 0.25 && (
          <Notice tone="warning">
            Es un salto de más del 25%. Meta vuelve a poner {ROTULO_NIVEL[o.nivel]} en fase de
            aprendizaje y los primeros días suelen rendir peor. No lo impide nadie, pero conviene
            saberlo antes.
          </Notice>
        )}
      </div>
    </Modal>
  )
}

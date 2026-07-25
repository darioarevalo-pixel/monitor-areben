'use client'

/**
 * Los diálogos de Fundas.
 *
 * Nacieron acá porque el kit todavía no tenía modal y el legacy usaba `confirm()`/
 * `prompt()`. Con el rediseño jul-2026 pasan a apoyarse en `Modal` del kit: misma API
 * para quien los usa (Fundas no cambia), pero heredan lo que estos no hacían —cerrar con
 * Escape, bloquear el scroll del fondo, devolver el foco, y en el teléfono apoyarse abajo
 * para que llegue el pulgar.
 *
 * Para código nuevo, el camino es `useConfirmar()` (async) y no estos componentes: se
 * mantienen porque Fundas maneja su apertura con estado propio.
 */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

/** Confirmación con dos botones. */
export function ConfirmModal({ mensaje, onSi, onNo }: { mensaje: string; onSi: () => void; onNo: () => void }) {
  return (
    <Modal
      abierto
      onCerrar={onNo}
      titulo="¿Confirmás?"
      pie={
        <>
          <Button variant="outline" onClick={onNo}>Cancelar</Button>
            <Button variant="solid" tone="brand" onClick={onSi} data-foco>Aceptar
          </Button>
        </>
      }
    >
      <div style={{ whiteSpace: 'pre-line' }}>{mensaje}</div>
    </Modal>
  )
}

/** Pide un texto con un input. */
export function PromptModal({
  mensaje,
  valorInicial,
  onOk,
  onCancel,
}: {
  mensaje: string
  valorInicial: string
  onOk: (v: string) => void
  onCancel: () => void
}) {
  const [valor, setValor] = useState(valorInicial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.select()
  }, [])
  return (
    <Modal
      abierto
      onCerrar={onCancel}
      cerrarConFondo={false} // hay algo tipeado: perderlo por un clic afuera duele
      titulo="Completá el dato"
      pie={
        <>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button variant="solid" tone="brand" onClick={() => onOk(valor)}>
            Aceptar
          </Button>
        </>
      }
    >
      <div style={{ whiteSpace: 'pre-line', marginBottom: 10 }}>{mensaje}</div>
      <input
        ref={ref}
        className="mo-input"
        data-foco
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOk(valor)
          if (e.key === 'Escape') onCancel()
        }}
      />
    </Modal>
  )
}

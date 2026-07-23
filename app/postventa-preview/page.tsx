'use client'
// TEMPORAL — preview del rediseño de Post-venta/Fallas (se elimina antes de cerrar la tanda).
import { SesionProvider } from '@/components/SesionProvider'
import { Postventa } from '@/components/postventa/Postventa'

export default function PostventaPreview() {
  return (
    <div style={{ background: '#F3F4F6', minHeight: '100vh', padding: 28 }}>
      <SesionProvider>
        <Postventa />
      </SesionProvider>
    </div>
  )
}

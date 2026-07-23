'use client'
// TEMPORAL — preview del rediseño de Cambios (se elimina antes de cerrar la tanda).
import { SesionProvider } from '@/components/SesionProvider'
import { CambiosLocal } from '@/components/cambios/Cambios'

export default function CambiosPreview() {
  return (
    <div style={{ background: '#F3F4F6', minHeight: '100vh', padding: 28 }}>
      <SesionProvider>
        <CambiosLocal />
      </SesionProvider>
    </div>
  )
}

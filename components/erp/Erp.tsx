'use client'

/**
 * ERP (key `erp`, sólo admin): lo que el monitor va construyendo para reemplazar a Gestión Nube.
 * Bruno, 12-oct-2026: todo el ERP en UNA sección que ven él y Darío mientras dura el desarrollo,
 * para poder probarlo y opinar sin que lo vea el equipo; cuando reemplace a GN se reparte en las
 * secciones de siempre. Cada parte es una pestaña.
 */

import { useState } from 'react'
import { SectionCard, Tabs, space } from '@/components/ui'
import { Facturacion } from './Facturacion'

const PESTANIAS = [{ key: 'facturacion', label: 'Facturación' }]

export function Erp() {
  const [pestania, setPestania] = useState('facturacion')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="ERP" subtitle="En construcción: lo que va a reemplazar a Gestión Nube. Lo ven sólo los administradores.">
        <Tabs items={PESTANIAS} value={pestania} onChange={setPestania} />
      </SectionCard>
      {pestania === 'facturacion' && <Facturacion />}
    </div>
  )
}

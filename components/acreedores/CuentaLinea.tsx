'use client'

/**
 * A dónde transferirle: el alias y el CBU con sus botones de copiar.
 *
 * Es lo único que se HACE con esta pantalla —copiar un alias y pegarlo en el home banking, o
 * pasárselo al cliente por WhatsApp—, así que está armado alrededor de eso.
 *
 * Vive en su propio archivo porque lo usan las dos clases de destino: los acreedores del dashboard
 * y las cuentas manuales. Era local de `Acreedores.tsx` hasta que apareció la segunda.
 */

import { Badge, CopyButton, space } from '@/components/ui'
import type { CuentaBancaria } from '@/lib/acreedores/cliente'

/** El CBU en dos bloques (8 + 14), que es como se lee y se dicta por teléfono. */
export function cbuLegible(cbu: string): string {
  return cbu.length === 22 ? `${cbu.slice(0, 8)} ${cbu.slice(8)}` : cbu
}

export function CuentaLinea({ cuenta, sinChapa }: {
  cuenta: CuentaBancaria
  /** En una cuenta manual hay una sola cuenta: la chapa de "la que se usa" no distingue nada. */
  sinChapa?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
      {cuenta.sugerida && !sinChapa && <Badge tone="success">la que se usa</Badge>}
      {cuenta.alias && (
        <>
          <b>{cuenta.alias}</b>
          <CopyButton getText={() => cuenta.alias || ''} label="alias" />
        </>
      )}
      {cuenta.cbu && (
        <>
          <span style={{ fontFamily: 'monospace' }}>{cbuLegible(cuenta.cbu)}</span>
          {/* Se copia el CBU PELADO, no el que se ve con el espacio: es lo que acepta el banco. */}
          <CopyButton getText={() => cuenta.cbu || ''} label="CBU" />
        </>
      )}
      <span className="muted">
        {[cuenta.banco, cuenta.titular && `a nombre de ${cuenta.titular}`].filter(Boolean).join(' · ')}
      </span>
    </div>
  )
}

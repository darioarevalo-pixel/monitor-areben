'use client'
/** «¿A qué cuenta entró la plata?», cuando la ruta del cobro la deja abierta (`pideCuentaReal`). Lo usan los tres «Cobrar». */
import { Field, Select } from '@/components/ui'
import { nombreCuentaReal } from '@/lib/erp/cobro-destino.core.js'
import type { CuentaRealDeCobro } from '@/lib/erp/cliente'

export function CampoCuentaReal({ cuentas, valor, onCambio }: { cuentas: CuentaRealDeCobro[]; valor: string; onCambio: (id: string) => void }) {
  return (
    <Field label="¿A qué cuenta entró la plata?">
      <Select value={valor} aria-label="Cuenta donde entró la plata" onChange={(e) => onCambio(e.target.value)}>
        <option value="">Elegí la cuenta</option>
        {cuentas.map((c) => <option key={c.id} value={c.id}>{nombreCuentaReal(c)}</option>)}
      </Select>
    </Field>
  )
}

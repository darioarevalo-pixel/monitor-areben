'use client'
/**
 * Los datos del cheque en «Cobrar», cuando la cuenta elegida es «Cheque» (sólo admin; motor sql/079). Lo usan los tres «Cobrar»
 * (ERP › Clientes, ficha de venta y panel de WhatsApp). El cobro baja la deuda en el momento y el cheque queda en cartera: la cuenta
 * se elige al depositarlo, en Ventas › Cobros › Cheques.
 */
import { useState } from 'react'
import { Field, Input, Select } from '@/components/ui'
import type { ChequeACobrar, MarcaErp } from '@/lib/erp/cliente'
import { chequeParaMandar, chequeVacio, cuentasParaCobrar, esCuentaCheque, faltaDelCheque } from '@/lib/erp/cheque.core.js'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'

export type ChequeEnForm = Omit<ChequeACobrar, 'librador_cuit'> & { librador_cuit: string }

export function CamposCheque({ valor, onCambio }: { valor: ChequeEnForm; onCambio: (c: ChequeEnForm) => void }) {
  const poner = (k: keyof ChequeEnForm) => (e: { target: { value: string } }) => onCambio({ ...valor, [k]: e.target.value })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Tipo" style={{ flex: '0 1 140px' }}>
          <Select value={valor.tipo} aria-label="Tipo de cheque" onChange={poner('tipo')}>
            <option value="fisico">Físico</option>
            <option value="echeq">eCheq</option>
          </Select>
        </Field>
        <Field label="Número" style={{ flex: '1 1 140px' }}><Input value={valor.numero} inputMode="numeric" onChange={poner('numero')} /></Field>
        <Field label="Banco" style={{ flex: '1 1 160px' }}><Input value={valor.banco} onChange={poner('banco')} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Quién lo firma" hint="El librador: puede no ser el cliente." style={{ flex: '1 1 200px' }}><Input value={valor.librador} onChange={poner('librador')} /></Field>
        <Field label="CUIT de quien firma" hint="Opcional." style={{ flex: '0 1 160px' }}><Input value={valor.librador_cuit} inputMode="numeric" onChange={poner('librador_cuit')} /></Field>
        <Field label="Fecha de pago" hint="Desde cuándo se puede depositar." style={{ flex: '0 1 160px' }}><Input type="date" value={valor.vence_el} onChange={poner('vence_el')} /></Field>
      </div>
    </div>
  )
}

/**
 * Lo del cheque para un «Cobrar»: qué cuentas mostrar (la «Cheque» sólo a un admin), los campos si la elegida es «Cheque», qué le
 * falta y lo que se suma al pedido (`extra`). El servidor lo vuelve a chequear (403 si no es admin; el motor valida los datos).
 */
export function useChequeDelCobro<T extends { id: string | number; medio?: string }>(marca: MarcaErp, cuentas: T[], elegida: string) {
  const admin = usePuedeErp(marca)('configurar')
  const [cheque, setCheque] = useState<ChequeEnForm>(chequeVacio as () => ChequeEnForm)
  const visibles = cuentasParaCobrar(cuentas, admin) as T[]
  const es = esCuentaCheque(visibles.find((c) => String(c.id) === elegida))
  return {
    cuentas: visibles,
    esCheque: es,
    falta: es ? faltaDelCheque(cheque) : null,
    extra: es ? { cheque: chequeParaMandar(cheque) as ChequeACobrar } : {},
    campos: es ? <CamposCheque valor={cheque} onCambio={setCheque} /> : null,
  }
}

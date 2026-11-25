'use client'

/**
 * El estado «Publicidad» del POS (Bruno, 25-nov): la MISMA venta, con la persona y lo que tiene a favor, que se descuenta del total.
 * Si se lleva más, se cobra la diferencia como en una venta; si se lleva menos, lo que sobra le queda a favor. Las cuentas viven en
 * `lib/caja/publicidad.core.js` (las mismas del servidor). ⛔ «Canje»: «una sesion de fotos que te pago en ropa no es canje».
 */

import { useEffect, useState } from 'react'
import { Badge, Button, Field, Input, Notice, Plegable, TBody, THead, TableWrap, Td, Th, Tr, color, font, space, weight } from '@/components/ui'
import { leerPublicidadConSaldo, type VentaConPublicidad } from '@/lib/caja/cliente'
import { plata } from '@/lib/caja/ticket'

export type PublicidadUI = { persona: string; aFavor: string }

export function BandaPublicidad({ p, onCambio, onSalir, trabajando }: { p: PublicidadUI; onCambio: (p: PublicidadUI) => void; onSalir: () => void; trabajando: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: `${space[2]}px ${space[4]}px`, padding: `${space[2]}px ${space[4]}px`, background: color.brandBg, borderBottom: `1px solid ${color.brandBorder}`, color: color.brand }}>
      <b style={{ fontSize: font.md, fontWeight: weight.bold, alignSelf: 'center' }}>Publicidad</b>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <Field label="Persona" hint="Una sesión de fotos, lo acordado con una creadora, un descuento a un influencer: lo que tiene a favor se descuenta del total.">
          <Input value={p.persona} placeholder="Nombre, DNI o @instagram" maxLength={80} disabled={trabajando} onChange={(e) => onCambio({ ...p, persona: e.target.value })} style={{ height: 40 }} />
        </Field>
      </div>
      <div style={{ width: 160 }}>
        <Field label="Tiene a favor">
          <Input value={p.aFavor} inputMode="decimal" placeholder="$ 0" disabled={trabajando} onChange={(e) => onCambio({ ...p, aFavor: e.target.value })} style={{ height: 40, textAlign: 'right' }} />
        </Field>
      </div>
      <Button variant="outline" onClick={onSalir} disabled={trabajando} style={{ height: 40 }}>
        Salir de publicidad
      </Button>
    </div>
  )
}

/** En el pie del pedido: lo a favor que se usó (en lugar del descuento a mano) y lo que le queda. */
export function LineasPublicidad({ persona, usado, sobra }: { persona: string; usado: number | null; sobra: number | null }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2], fontSize: font.md, color: color.brand }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{persona.trim() ? `A favor de ${persona.trim()}` : 'A favor'}</span>
        <b style={{ fontVariantNumeric: 'tabular-nums' }}>{usado == null ? '—' : `−${plata(usado)}`}</b>
      </div>
      {sobra != null && sobra > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2], fontSize: font.sm }}>
          <Badge tone="info">Le queda a favor</Badge>
          <b style={{ fontVariantNumeric: 'tabular-nums', color: color.ink2 }}>{plata(sobra)}</b>
        </div>
      )}
    </>
  )
}

/**
 * «Publicidad con saldo» (pestaña Caja; Bruno, 25-nov): a quién le sobró plata a favor en una venta con publicidad, para que lo
 * organice quien acordó el monto. Sólo se mira: ⛔ toca la cuenta de nadie.
 */
export function PublicidadConSaldo() {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState<{ ventas: VentaConPublicidad[]; dias: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    leerPublicidadConSaldo()
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError((e as Error).message))
    return () => {
      vivo = false
    }
  }, [])
  const n = datos?.ventas.length ?? 0
  const total = Math.round((datos?.ventas.reduce((s, v) => s + v.a_mano.publicidad.sobra, 0) ?? 0) * 100) / 100
  return (
    <Plegable
      variante="tarjeta"
      abierto={abierto}
      onToggle={() => setAbierto((a) => !a)}
      titulo={`Publicidad con saldo${datos ? ` · ${n}` : ''}`}
      ayuda={n > 0 ? `${plata(total)} a favor en total, para organizar con quien acordó el monto.` : 'Lo que le sobró a favor a alguien en una venta con publicidad.'}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      {datos && n === 0 && <span style={{ color: color.mut, fontSize: font.base }}>{`Sin saldos a favor en los últimos ${datos.dias} días.`}</span>}
      {n > 0 && (
        <TableWrap>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead>
              <Tr>
                <Th>Fecha</Th>
                <Th>Persona</Th>
                <Th>Venta</Th>
                <Th align="right">Tenía</Th>
                <Th align="right">Usó</Th>
                <Th align="right">Le queda</Th>
              </Tr>
            </THead>
            <TBody>
              {datos!.ventas.map((v) => (
                <Tr key={v.id}>
                  <Td>{new Date(v.creada_en).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' })}</Td>
                  <Td>{v.a_mano.publicidad.persona}</Td>
                  <Td>{v.erp_numero ? `#${v.erp_numero}` : v.gn_number ? `#${v.gn_number}` : 'pendiente'}</Td>
                  <Td align="right">{plata(v.a_mano.publicidad.a_favor)}</Td>
                  <Td align="right">{plata(v.a_mano.publicidad.usado)}</Td>
                  <Td align="right"><b>{plata(v.a_mano.publicidad.sobra)}</b></Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableWrap>
      )}
    </Plegable>
  )
}

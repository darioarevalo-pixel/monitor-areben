'use client'

/**
 * "A quién le debemos" (key `acreedores`, área Dirección).
 *
 * # Para qué está
 *
 * Cuando un cliente mayorista nos debe plata, en vez de que nos pague a nosotros y nosotros le
 * paguemos al contador, se le pide que le transfiera DIRECTO: una transferencia cancela las dos
 * deudas. Para poder pedírselo hay que tener, en la misma pantalla y en el momento de la charla,
 * a quién le debemos, cuánto, y a qué cuenta.
 *
 * # ⛔ Acá no se carga nada
 *
 * El saldo lo calcula **el dashboard** y acá se lo lee. No hay una segunda copia: si el Monitor
 * rehiciera la resta, el día que una de las dos apps cambie un criterio —qué pago cuenta, cuál
 * está sólo agendado— iban a mostrar números distintos y nadie iba a saber cuál creer.
 * Las cuentas bancarias también se cargan allá (Finanzas → Acreedores).
 *
 * # 🔑 Los dos números que no son el mismo
 *
 * «Se le debe» es lo que el banco todavía no debitó. «Se le puede pedir» descuenta lo que ya está
 * comprometido con un cheque entregado. Cuando no coinciden, la pantalla lo dice con todas las
 * letras: la deuda figura abierta pero ya está saldada con un papel en la calle, y mandarle la
 * plata de nuevo sería pagar dos veces.
 */

import { useState } from 'react'
import {
  Badge,
  CopyButton,
  DatosGate,
  EmptyState,
  KpiCard,
  Notice,
  SectionCard,
  formatMoney,
  space,
} from '@/components/ui'
import { useAcreedores } from './useAcreedores'
import type { Acreedor, CuentaBancaria } from '@/lib/acreedores/cliente'

/** El CBU en dos bloques (8 + 14), que es como se lee y se dicta por teléfono. */
function cbuLegible(cbu: string): string {
  return cbu.length === 22 ? `${cbu.slice(0, 8)} ${cbu.slice(8)}` : cbu
}

function mesLargo(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  if (!y || !m) return mes
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
}

function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

export function Acreedores() {
  const { acreedores, aviso, cargando, error, recargar } = useAcreedores()
  const [abierto, setAbierto] = useState<string | null>(null)

  const datos = cargando ? null : acreedores
  const totalDeuda = acreedores.reduce((s, a) => s + a.saldo, 0)
  const conDeuda = acreedores.filter((a) => a.saldo > 0)
  const sinCuenta = conDeuda.filter((a) => a.cuentas.length === 0)

  return (
    <div style={{ display: 'grid', gap: space[5] }}>
      {/* El aviso va ARRIBA de todo y la pantalla se dibuja igual: que el dashboard no conteste
          tiene que dejar la sección sin los montos, no sin pantalla. */}
      {aviso && (
        <Notice tone="warning">
          <span>
            <b>No se pudieron traer los montos.</b> {aviso} Los datos viven en el dashboard; probá
            de nuevo en un rato.
          </span>
        </Notice>
      )}

      <DatosGate datos={datos} error={error} esqueleto="tarjetas" onReintentar={recargar}>
        {(lista: Acreedor[]) =>
          lista.length === 0 ? (
            <EmptyState
              title="No hay ninguna cuenta abierta"
              hint="Las cuentas de los acreedores se abren en el dashboard, en Finanzas → Acreedores."
            />
          ) : (
            <div style={{ display: 'grid', gap: space[5] }}>
              <div style={{ display: 'grid', gap: space[4], gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <KpiCard label="Total que se debe" value={formatMoney(totalDeuda)} />
                <KpiCard label="Cuentas con saldo" value={`${conDeuda.length} de ${lista.length}`} />
                {sinCuenta.length > 0 && (
                  <KpiCard
                    label="Sin CBU cargado"
                    value={String(sinCuenta.length)}
                    sub="Cargalo en el dashboard para poder pedir la transferencia"
                  />
                )}
              </div>

              <div style={{ display: 'grid', gap: space[4] }}>
                {lista.map((a) => (
                  <FilaAcreedor
                    key={a.id}
                    acreedor={a}
                    abierto={abierto === a.id}
                    onToggle={() => setAbierto(abierto === a.id ? null : a.id)}
                  />
                ))}
              </div>
            </div>
          )
        }
      </DatosGate>
    </div>
  )
}

function FilaAcreedor({ acreedor, abierto, onToggle }: {
  acreedor: Acreedor
  abierto: boolean
  onToggle: () => void
}) {
  const alDia = acreedor.saldo <= 0
  // Los dos números se separan sólo cuando NO son el mismo. Mostrarlos siempre los dos convierte
  // el caso normal —que son iguales— en una pregunta que nadie tiene que hacerse.
  const hayChequeEnLaCalle = acreedor.yaPagadoSinDebitar > 0

  return (
    <SectionCard
      title={acreedor.nombre}
      subtitle={
        alDia
          ? 'Al día'
          : `Se le debe ${formatMoney(acreedor.saldo)}${
              acreedor.ultimoMovimiento ? ` · último pago ${fechaCorta(acreedor.ultimoMovimiento)}` : ''
            }`
      }
      actions={
        <button type="button" onClick={onToggle} className="btn btn-soft btn-sm">
          {abierto ? 'Ocultar' : 'Ver detalle'}
        </button>
      }
    >
      {hayChequeEnLaCalle && (
        <Notice tone="warning">
          <span>
          <b>Ojo: parte de esto ya está pagado.</b> Se le debe {formatMoney(acreedor.saldo)}, pero {formatMoney(acreedor.yaPagadoSinDebitar)} ya
          salieron con un cheque que el banco todavía no debitó. Pedile al cliente como mucho{' '}
          <b>{formatMoney(acreedor.disponible)}</b>, o se le va a pagar dos veces lo mismo.
          </span>
        </Notice>
      )}

      <CuentasDe acreedor={acreedor} />

      {abierto && (
        <div style={{ marginTop: space[4] }}>
          {acreedor.conceptos.length === 0 ? (
            <p className="muted">No queda nada pendiente.</p>
          ) : (
            <ul style={{ display: 'grid', gap: space[1], listStyle: 'none', padding: 0, margin: 0 }}>
              {acreedor.conceptos.map((c) => (
                <li key={c.id} style={{ display: 'flex', gap: space[2], justifyContent: 'space-between' }}>
                  <span>
                    {c.concepto} <span className="muted" style={{ textTransform: 'capitalize' }}>· {mesLargo(c.mes)}</span>
                  </span>
                  <b>{formatMoney(c.saldo)}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SectionCard>
  )
}

/**
 * A dónde transferirle. Es lo único que se HACE con esta pantalla —copiar un alias o un CBU y
 * pegarlo en el home banking— así que está armado alrededor de eso.
 */
function CuentasDe({ acreedor }: { acreedor: Acreedor }) {
  if (acreedor.cuentas.length === 0) {
    return (
      <p className="muted">
        No tiene ninguna cuenta cargada. Se carga en el dashboard, en Finanzas → Acreedores: sin eso
        no se le puede pedir a un cliente que le transfiera.
      </p>
    )
  }
  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      {acreedor.cuentas.map((c) => (
        <CuentaLinea key={c.id} cuenta={c} />
      ))}
    </div>
  )
}

function CuentaLinea({ cuenta }: { cuenta: CuentaBancaria }) {
  return (
    <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
      {cuenta.sugerida && <Badge tone="success">la que se usa</Badge>}
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

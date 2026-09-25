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
 * # ⛔ De los ACREEDORES acá no se carga nada
 *
 * El saldo lo calcula **el dashboard** y acá se lo lee. No hay una segunda copia: si el Monitor
 * rehiciera la resta, el día que una de las dos apps cambie un criterio —qué pago cuenta, cuál
 * está sólo agendado— iban a mostrar números distintos y nadie iba a saber cuál creer.
 * Las cuentas bancarias también se cargan allá (Finanzas → Acreedores).
 *
 * # 🔑 Y abajo, lo que el dashboard NO conoce
 *
 * La segunda mitad de la pantalla son las **cuentas manuales** (`CuentasManuales.tsx`): la cuota
 * del crédito, las bolsas. Se abren acá, se prenden con un monto y no le hablan al dashboard —ni
 * para leer ni para escribir—, así que siguen andando cuando el dashboard no contesta. El circuito
 * de compromisos es el MISMO para las dos mitades.
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
  Card,
  DatosGate,
  EmptyState,
  KpiCard,
  Notice,
  color,
  font,
  formatMoney,
  space,
} from '@/components/ui'
import { useAcreedores } from './useAcreedores'
import { useCompromisos } from './useCompromisos'
import { Compromisos } from './Compromisos'
import { CuentasManuales } from './CuentasManuales'
import { CuentaLinea } from './CuentaLinea'
import { EstadoCompromisos, FilaDestino, TituloGrupo } from './FilaDestino'
import { destinoDeAcreedor } from '@/lib/compromisos/destino'
import { comprometidoPorAcreedor } from '@/lib/compromisos/core'
import type { Compromiso } from '@/lib/compromisos/core'
import type { PuedeCompromisos } from '@/lib/compromisos/cliente'
import type { Acreedor } from '@/lib/acreedores/cliente'

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
  // Los compromisos van por su propia puerta: si el dashboard no contesta, se tienen que seguir viendo.
  const cobros = useCompromisos()
  const [abierto, setAbierto] = useState<string | null>(null)

  const datos = cargando ? null : acreedores
  const totalDeuda = acreedores.reduce((s, a) => s + a.saldo, 0)
  const conDeuda = acreedores.filter((a) => a.saldo > 0)
  const sinCuenta = conDeuda.filter((a) => a.cuentas.length === 0)
  // Lo comprometido y todavía sin entrar, sobre TODOS los acreedores: es la plata que ya está en
  // camino y que el dashboard no ve.
  const enCamino = [...comprometidoPorAcreedor(cobros.compromisos).values()].reduce((s, n) => s + n, 0)

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
                {enCamino > 0 && (
                  <KpiCard
                    label="Pedido sin acreditar"
                    value={formatMoney(enCamino)}
                    sub="plata en camino que el dashboard todavía no ve"
                  />
                )}
                {sinCuenta.length > 0 && (
                  <KpiCard
                    label="Sin CBU cargado"
                    value={String(sinCuenta.length)}
                    sub="Cargalo en el dashboard para poder pedir la transferencia"
                  />
                )}
              </div>

              <ListaAcreedores
                lista={lista}
                compromisos={cobros.compromisos}
                puede={cobros.puede}
                onCambio={cobros.recargar}
                abierto={abierto}
                setAbierto={setAbierto}
              />
            </div>
          )
        }
      </DatosGate>

      {/* 🔑 FUERA del gate a propósito: las cuentas manuales no dependen del dashboard, y si
          quedaran adentro una caída de allá escondería la cuenta de la cuota del crédito —que es
          de acá— junto con los acreedores. */}
      <CuentasManuales
        compromisos={cobros.compromisos}
        puedeCompromisos={cobros.puede}
        onCambioCompromisos={cobros.recargar}
      />
    </div>
  )
}

/**
 * Una fila por acreedor (25-sep-2026, ver `FilaDestino.tsx`). Arriba los que tienen saldo, de
 * mayor a menor; los que están al día van plegados abajo —no hay nada que pedir para ellos—.
 */
function ListaAcreedores({ lista, compromisos, puede, onCambio, abierto, setAbierto }: {
  lista: Acreedor[]
  compromisos: Compromiso[]
  puede: PuedeCompromisos
  onCambio: () => void
  abierto: string | null
  setAbierto: (id: string | null) => void
}) {
  const [verAlDia, setVerAlDia] = useState(false)
  const conSaldo = lista.filter((a) => a.saldo > 0).sort((a, b) => b.saldo - a.saldo)
  const alDia = lista.filter((a) => a.saldo <= 0)
  const alDiaAbiertos = verAlDia || conSaldo.length === 0

  const fila = (a: Acreedor) => (
    <FilaAcreedor
      key={a.id}
      acreedor={a}
      compromisos={compromisos}
      puede={puede}
      onCambio={onCambio}
      abierto={abierto === a.id}
      onToggle={() => setAbierto(abierto === a.id ? null : a.id)}
    />
  )

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ marginTop: -1 }}>
        {conSaldo.length > 0 && (
          <>
            <TituloGrupo n={conSaldo.length}>Con saldo</TituloGrupo>
            {conSaldo.map(fila)}
          </>
        )}
        {alDia.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setVerAlDia((v) => !v)}
              disabled={conSaldo.length === 0}
              style={{
                // ⛔ `height: auto`: `.shell-content button` le fija la altura de un control.
                height: 'auto', width: '100%', textAlign: 'left', cursor: 'pointer',
                background: 'transparent', border: 'none', borderTop: `1px solid ${color.line}`,
                padding: `${space[2]}px ${space[4]}px`, fontSize: font.xs, fontWeight: 700,
                color: color.mut, textTransform: 'uppercase', letterSpacing: 0.4,
              }}
            >
              {alDiaAbiertos ? '▾' : '▸'} Al día · {alDia.length}
            </button>
            {alDiaAbiertos && alDia.map(fila)}
          </>
        )}
      </div>
    </Card>
  )
}

function FilaAcreedor({ acreedor, compromisos, puede, onCambio, abierto, onToggle }: {
  acreedor: Acreedor
  compromisos: Compromiso[]
  puede: PuedeCompromisos
  onCambio: () => void
  abierto: boolean
  onToggle: () => void
}) {
  const alDia = acreedor.saldo <= 0
  // Los dos números se separan sólo cuando NO son el mismo. Mostrarlos siempre los dos convierte
  // el caso normal —que son iguales— en una pregunta que nadie tiene que hacerse.
  const hayChequeEnLaCalle = acreedor.yaPagadoSinDebitar > 0

  return (
    <FilaDestino
      nombre={acreedor.nombre}
      detalle={acreedor.ultimoMovimiento ? `último pago ${fechaCorta(acreedor.ultimoMovimiento)}` : undefined}
      abierto={abierto}
      onToggle={onToggle}
      cuenta={acreedor.cuentas[0] ?? null}
      monto={
        alDia ? (
          <span style={{ color: color.mut2 }}>Al día</span>
        ) : (
          <span style={{ display: 'grid' }}>
            <span>
              Saldo <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(acreedor.saldo)}</b>
            </span>
            {/* El cheque en la calle se avisa ya en la fila: es lo que evita pedir de más. */}
            {hayChequeEnLaCalle && (
              <span style={{ fontSize: font.xs, color: color.warningInk }}>
                disponible {formatMoney(acreedor.disponible)}
              </span>
            )}
          </span>
        )
      }
      estado={alDia ? null : <EstadoCompromisos destinoId={acreedor.id} compromisos={compromisos} />}
    >
      <div style={{ display: 'grid', gap: space[3] }}>
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

        <Compromisos destino={destinoDeAcreedor(acreedor)} compromisos={compromisos} puede={puede} onCambio={onCambio} />

        {acreedor.conceptos.length > 0 && (
          <div>
            <b style={{ fontSize: font.base }}>Detalle del saldo</b>
            <ul style={{ display: 'grid', gap: space[1], listStyle: 'none', padding: 0, margin: `${space[2]}px 0 0`, maxWidth: 520 }}>
              {acreedor.conceptos.map((c) => (
                <li key={c.id} style={{ display: 'flex', gap: space[2], justifyContent: 'space-between', fontSize: font.base }}>
                  <span>
                    {c.concepto} <span className="muted" style={{ textTransform: 'capitalize' }}>· {mesLargo(c.mes)}</span>
                  </span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(c.saldo)}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </FilaDestino>
  )
}

/**
 * A dónde transferirle. Es lo único que se HACE con esta pantalla —copiar un alias o un CBU y
 * pegarlo en el home banking— así que está armado alrededor de eso.
 */
function CuentasDe({ acreedor }: { acreedor: Acreedor }) {
  if (acreedor.cuentas.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
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

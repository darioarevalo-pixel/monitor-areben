'use client'

/**
 * Una fila de la lista de destinos —un acreedor o una cuenta manual— que se abre al tocarla.
 *
 * # Por qué fila y no tarjeta
 *
 * Hasta el 25-sep-2026 cada destino era una tarjeta entera, con el alias, el bloque de compromisos,
 * el «todavía no hay ningún compromiso» y el párrafo de «esta cuenta está quieta», todo a la vista:
 * ~230 px por destino aunque estuviera vacío. Bruno iba a cargar ~30 cuentas que **se usan una vez
 * por mes**, o sea que casi siempre están quietas: eran seis pantallas de scroll donde la que está
 * juntando plata hoy se veía igual que las veintisiete dormidas.
 *
 * La fila lleva sólo lo que se mira sin abrir: **cuánto, el alias con copiar** (lo único que se
 * HACE con esta pantalla) y **cómo vienen los compromisos**. Todo lo demás va en el detalle, uno
 * abierto por vez.
 *
 * ⛔ Los botones de adentro de la fila cortan el clic (`stopPropagation`): si no, copiar el alias
 * también abriría la fila.
 */

import { CopyButton, color, font, space, weight } from '@/components/ui'
import type { CuentaBancaria } from '@/lib/acreedores/cliente'
import { estaAbierto, type Compromiso } from '@/lib/compromisos/core'

export function FilaDestino({ nombre, detalle, monto, cuenta, estado, accion, abierto, onToggle, children }: {
  nombre: string
  /** Una línea chica debajo del nombre (la nota de la vuelta, "último pago…"). */
  detalle?: React.ReactNode
  /** El número de la fila, ya armado: cada mitad dice otra cosa ("se le debe", "faltan"). */
  monto: React.ReactNode
  /** La cuenta a la que se transfiere. `null` = no tiene ninguna, y la fila lo avisa. */
  cuenta: CuentaBancaria | null
  estado?: React.ReactNode
  /** Un botón que se usa sin abrir la fila (el "Activar" de todos los meses). */
  accion?: React.ReactNode
  abierto: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{ borderTop: `1px solid ${color.line}` }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={abierto}
        className="mo-fila-plegable"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
        }}
        style={{
          padding: `${space[2]}px ${space[4]}px`, minHeight: 48,
        }}
      >
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: space[2] }}>
          <span aria-hidden style={{ color: color.mut2, fontSize: font.xs, width: 10 }}>{abierto ? '▾' : '▸'}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: weight.semibold, color: color.ink, fontSize: font.md, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nombre}
            </div>
            {detalle && (
              <div style={{ fontSize: font.xs, color: color.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {detalle}
              </div>
            )}
          </div>
        </div>

        <div style={{ fontSize: font.base }}>{monto}</div>

        <div style={{ minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
          <AliasCorto cuenta={cuenta} />
        </div>

        <div style={{ fontSize: font.sm }}>{estado}</div>

        <div style={{ justifySelf: 'end' }} onClick={(e) => e.stopPropagation()}>
          {accion}
        </div>
      </div>

      {abierto && (
        <div style={{ padding: `${space[3]}px ${space[4]}px ${space[4]}px ${space[8]}px`, background: color.bg, borderTop: `1px dashed ${color.line}` }}>
          {children}
        </div>
      )}
    </div>
  )
}

/** El alias (o el CBU si no hay alias) con su botón. El resto de la cuenta va en el detalle. */
function AliasCorto({ cuenta }: { cuenta: CuentaBancaria | null }) {
  if (!cuenta || (!cuenta.alias && !cuenta.cbu)) {
    return <span style={{ fontSize: font.sm, color: color.warningInk }}>Sin alias ni CBU</span>
  }
  const texto = cuenta.alias || cuenta.cbu || ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
      <span
        title={texto}
        style={{
          fontSize: font.base, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: cuenta.alias ? undefined : 'monospace',
        }}
      >
        {texto}
      </span>
      {/* Se copia el CBU PELADO, sin el espacio con que se muestra en el detalle. */}
      <CopyButton getText={() => texto} label={cuenta.alias ? 'alias' : 'CBU'} />
    </div>
  )
}

/**
 * Cuántos compromisos abiertos tiene un destino. Un `transferido` viejo cuenta como Pedido: desde el
 * 25-sep-2026 son tres estados a la vista (ver `colaDeCobranza`).
 */
export function EstadoCompromisos({ destinoId, compromisos }: { destinoId: string; compromisos: Compromiso[] }) {
  const n = compromisos.filter((c) => c.acreedor_id === destinoId && estaAbierto(c)).length
  if (n === 0) return <span style={{ color: color.mut2 }}>Sin pedidos</span>
  return <span style={{ color: color.ink2, fontWeight: weight.semibold }}>{n === 1 ? '1 pedido' : `${n} pedidos`}</span>
}

/** El título de un grupo de filas ("Activas · 3"). */
export function TituloGrupo({ children, n }: { children: React.ReactNode; n: number }) {
  return (
    <div style={{
      padding: `${space[2]}px ${space[4]}px`, fontSize: font.xs, fontWeight: weight.bold,
      color: color.mut, textTransform: 'uppercase', letterSpacing: 0.4, borderTop: `1px solid ${color.line}`,
    }}>
      {children} · {n}
    </div>
  )
}

'use client'

/**
 * La calculadora de billetes de la Caja (fase B, Bruno 5-oct): cantidad × billete ⇒ total. Se abre
 * al abrir el turno (el fondo), en el conteo intermedio y al cerrarlo (el efectivo contado).
 *
 * 🔑 **El total lo calcula `lib/caja/conteo.core.js`, el MISMO que usa el servidor**: la pantalla
 * manda los billetes, el servidor rearma el total y, si ⛔ es el fondo o el contado, contesta 400.
 *
 * 🔑 **Cada conteo arranca VACÍO** (Bruno, 5-oct: «pareciera que está preguardado lo del cierre
 * anterior: no guardarlo»). Lo único que se recuerda es el borrador SIN usar del mismo momento —el
 * modal cerrado sin querer—: se anota en esta computadora (`caja:conteo:zattia:<momento>`), dura
 * 12 h y quien lo usa lo olvida (`olvidarConteo`) cuando el servidor contestó bien.
 *
 * 🔑 **Un solo paso** (Bruno, 5-oct): el botón principal ES la acción —«Abrir turno», «Guardar
 * conteo», «Cerrar turno»—, ⛔ un «Usar este total» y después otro botón.
 */

import { useState } from 'react'
import { Button, Input, Modal, Notice, color, font, space, weight } from '@/components/ui'
import { totalDeConteo } from '@/lib/caja/conteo.core.js'
import { plata } from '@/lib/caja/ticket'
import { aNumero } from '@/lib/caja/textos'
import type { Conteo } from '@/lib/caja/cliente'
import { textoDiferencia } from '@/lib/caja/textos'

/** Lo tipeado, como texto: un input vacío es 0. */
type Textos = Record<string, string>
type Apunte = { conteo: Textos; en: string }

const claveDe = (momento: string) => `caja:conteo:zattia:${momento}`
/** Un borrador más viejo que esto es de otro turno (la apertura ⛔ lleva el id: el turno ⛔ existe). */
const VIDA_MS = 12 * 3_600_000

function leerApunte(momento: string): Apunte | null {
  try {
    const a = JSON.parse(localStorage.getItem(claveDe(momento)) || 'null') as Apunte | null
    if (a && a.conteo && typeof a.conteo === 'object' && typeof a.en === 'string' && Date.now() - Date.parse(a.en) < VIDA_MS) return a
  } catch {
    /* sin localStorage: arranca vacía */
  }
  return null
}
function anotar(momento: string, conteo: Textos) {
  try {
    localStorage.setItem(claveDe(momento), JSON.stringify({ conteo, en: new Date().toISOString() }))
  } catch {
    /* modo privado o cuota: queda en pantalla */
  }
}
/** El conteo ya se usó (el servidor contestó): el próximo arranca vacío. */
export function olvidarConteo(momento: string) {
  try {
    localStorage.removeItem(claveDe(momento))
  } catch {
    /* sin localStorage: ⛔ había nada */
  }
}

/** Con qué números arranca: el borrador sin usar de este momento, o vacía. */
function inicial(billetes: number[], momento: string): Textos {
  const fuente: Record<string, unknown> = leerApunte(momento)?.conteo ?? {}
  return Object.fromEntries(billetes.map((v) => {
    const c = fuente[String(v)]
    return [String(v), c == null || Number(c) === 0 ? '' : String(c)]
  }))
}

export function CalculadoraBilletes({
  momento,
  billetes,
  titulo,
  accion,
  trabajando = false,
  error,
  esperado,
  extra,
  aMano = false,
  onUsar,
  onCerrar,
}: {
  /** `apertura`, `intermedio:<turno>` o `cierre:<turno>`: dónde se anota en esta computadora. */
  momento: string
  billetes: number[]
  titulo: string
  /** El botón principal, que ES la acción: «Abrir turno», «Guardar conteo», «Cerrar turno». */
  accion: string
  /** Al cerrar: el efectivo esperado ⇒ se ven Esperado / Contado / Diferencia mientras se cuenta. */
  esperado?: number | null
  /** Lo que va abajo del total (la nota del cierre). */
  extra?: React.ReactNode
  /** Deja escribir el total sin contar billetes (abrir y cerrar): entonces viaja sin conteo. */
  aMano?: boolean
  trabajando?: boolean
  error?: string | null
  onUsar: (total: number, conteo: Conteo | null) => void
  onCerrar: () => void
}) {
  const [textos, setTextos] = useState<Textos>(() => inicial(billetes, momento))

  const cambiar = (v: number, t: string) => {
    const nuevo = { ...textos, [String(v)]: t.replace(/\D/g, '') }
    setTextos(nuevo)
    anotar(momento, nuevo)
  }
  const conteo: Conteo = Object.fromEntries(billetes.map((v) => [String(v), Number(textos[String(v)] || 0)]))
  let deBilletes: number | null = null
  try {
    deBilletes = totalDeConteo(conteo, billetes)
  } catch {
    /* ⛔ pasa: el input sólo deja dígitos */
  }
  // El total escrito a mano manda sobre los billetes: el que ⛔ cuenta, escribe.
  const [manual, setManual] = useState('')
  const manualN = aMano && manual.trim() ? aNumero(manual) : null
  const total = aMano && manual.trim() ? (manualN != null && manualN >= 0 ? manualN : null) : deBilletes

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={titulo}
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="outline" onClick={onCerrar}>
            Volver
          </Button>
          <Button tone="success" loading={trabajando} disabled={total == null} onClick={() => total != null && onUsar(total, manualN != null ? null : conteo)}>
            {accion}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[1] }}>
        {billetes.map((v) => {
          const n = Number(textos[String(v)] || 0)
          return (
            <div key={v} style={{ display: 'grid', gridTemplateColumns: '90px auto 1fr', gap: space[2], alignItems: 'center', fontSize: font.base }}>
              <Input
                value={textos[String(v)] ?? ''}
                onChange={(e) => cambiar(v, e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                aria-label={`Billetes de ${plata(v)}`}
                style={{ textAlign: 'right' }}
              />
              <span style={{ color: color.mut }}>× {plata(v)}</span>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: n ? undefined : color.mut }}>{plata(n * v)}</span>
            </div>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${color.line}`, paddingTop: space[2], marginTop: space[1], fontSize: font.xl, fontWeight: weight.bold }}>
          <span>Total</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{total == null ? '—' : plata(total)}</span>
        </div>
        {aMano && (
          <label style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: space[2], alignItems: 'center', fontSize: font.sm, color: color.mut }}>
            <span>Total a mano (sin contar billetes)</span>
            <Input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="$" aria-label="Total a mano" style={{ textAlign: 'right' }} />
          </label>
        )}
        {esperado != null && total != null && (
          <div style={{ display: 'grid', gap: space[0.5], fontSize: font.base }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: color.mut }}>
              <span>Esperado</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{plata(esperado)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: weight.bold, color: diferenciaColor(total - esperado) }}>
              <span>Diferencia</span>
              <span>{textoDiferencia(Math.round((total - esperado) * 100) / 100)}</span>
            </div>
          </div>
        )}
        {extra}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}

/** Cuadrado en verde, el resto en rojo: una diferencia es algo para mirar. */
export const diferenciaColor = (d: number) => (Math.abs(d) < 0.005 ? color.successInk : color.dangerInk)

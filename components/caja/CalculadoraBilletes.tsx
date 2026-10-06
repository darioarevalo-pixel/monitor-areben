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
import { Button, Input, Modal, Notice, color, font, radius, space, weight } from '@/components/ui'
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
  tono = 'brand',
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
  /** El color del botón principal: índigo para abrir y contar, rojo para cerrar el turno (prototipo). */
  tono?: 'brand' | 'danger'
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
  /** El − / + del contador: de a un billete, ⛔ menos de cero. */
  const sumar = (v: number, paso: number) => {
    const n = Math.max(0, Number(textos[String(v)] || 0) + paso)
    cambiar(v, n ? String(n) : '')
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
  const diferencia = esperado != null && total != null ? Math.round((total - esperado) * 100) / 100 : null

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
          <Button variant="solid" tone={tono} loading={trabajando} disabled={total == null} onClick={() => total != null && onUsar(total, manualN != null ? null : conteo)}>
            {accion}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[3] }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.md }}>
          <thead>
            <tr>
              <th style={th}>Billete</th>
              <th style={th}>Cantidad</th>
              <th style={{ ...th, textAlign: 'right' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {billetes.map((v) => {
              const n = Number(textos[String(v)] || 0)
              return (
                <tr key={v}>
                  <td style={td}>
                    <span style={chipBillete}>{plata(v)}</span>
                  </td>
                  <td style={td}>
                    <div style={contador}>
                      <button type="button" style={botonContador} onClick={() => sumar(v, -1)} aria-label={`Un billete de ${plata(v)} menos`}>
                        −
                      </button>
                      <input
                        value={textos[String(v)] ?? ''}
                        onChange={(e) => cambiar(v, e.target.value)}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="0"
                        aria-label={`Billetes de ${plata(v)}`}
                        style={inputContador}
                      />
                      <button type="button" style={botonContador} onClick={() => sumar(v, 1)} aria-label={`Un billete de ${plata(v)} más`}>
                        +
                      </button>
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: n ? undefined : color.mut }}>{plata(n * v)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: font.lg, fontWeight: weight.heavy }}>
          <span>Total</span>
          <strong style={{ fontSize: 24, fontWeight: weight.heavy, fontVariantNumeric: 'tabular-nums' }}>{total == null ? '—' : plata(total)}</strong>
        </div>
        {aMano && (
          <label style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: space[2], alignItems: 'center', fontSize: font.base, color: color.mut }}>
            <span>Total a mano (sin contar billetes)</span>
            <Input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="$" aria-label="Total a mano" style={{ textAlign: 'right' }} />
          </label>
        )}
        {esperado != null && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: space[2] }}>
            <Mosaico rotulo="Esperado" valor={plata(esperado)} />
            <Mosaico rotulo="Contado" valor={total == null ? '—' : plata(total)} />
            <Mosaico rotulo="Diferencia" valor={diferencia == null ? '—' : textoDiferencia(diferencia)} tinta={diferencia == null ? undefined : diferenciaColor(diferencia)} />
          </div>
        )}
        {extra}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}

/** Cuadrado en verde, hasta $1.000 en ámbar, más en rojo (prototipo): la misma vara que el turno. */
export const diferenciaColor = (d: number) => (Math.abs(d) < 0.005 ? color.successInk : Math.abs(d) <= 1000 ? color.warningInk : color.dangerInk)

/** Un mosaico Esperado / Contado / Diferencia: el mismo dibujo que el `Dato` del turno. */
function Mosaico({ rotulo, valor, tinta }: { rotulo: string; valor: string; tinta?: string }) {
  return (
    <div style={{ border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: `${space[3]}px ${space[3] + 2}px`, background: color.surface, display: 'grid', gap: space[0.5], minWidth: 0 }}>
      <span style={{ fontSize: font.sm, color: color.mut, fontWeight: weight.semibold }}>{rotulo}</span>
      <strong style={{ fontSize: font.xl + 2, fontWeight: weight.heavy, letterSpacing: '-0.01em', color: tinta ?? color.ink, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{valor}</strong>
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', fontSize: font.xs + 0.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: color.mut, fontWeight: weight.semibold, padding: `0 0 ${space[1.5]}px`, borderBottom: `1px solid ${color.line}` }
const td: React.CSSProperties = { padding: `${space[1] + 1}px 0`, borderBottom: `1px solid ${color.bg2}` }
/** El billete como chip verde (prototipo `.billete`). */
const chipBillete: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 28, padding: `0 ${space[2] + 2}px`, borderRadius: radius.sm,
  background: color.successBg, color: color.successInk, border: `1px solid ${color.successBorder}`,
  fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums', fontSize: font.base,
}
const contador: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', border: `1px solid ${color.line2}`, borderRadius: radius.md, height: 30, background: color.surface }
// `height` explícita: la regla legacy `.shell-content button` le fija a todo botón la altura de un control.
const botonContador: React.CSSProperties = { width: 28, height: 28, padding: 0, border: 'none', background: 'transparent', display: 'grid', placeItems: 'center', color: color.ink2, fontSize: 16, cursor: 'pointer' }
const inputContador: React.CSSProperties = { width: 48, height: 28, textAlign: 'center', fontWeight: weight.semibold, fontSize: font.base, border: 0, background: 'transparent', padding: 0, outline: 'none', fontVariantNumeric: 'tabular-nums' }

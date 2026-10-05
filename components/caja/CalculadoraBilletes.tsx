'use client'

/**
 * La calculadora de billetes de la Caja (fase B, Bruno 5-oct): cantidad × billete ⇒ total. Se abre
 * al abrir el turno (el fondo), en el conteo intermedio y al cerrarlo (el efectivo contado).
 *
 * 🔑 **El total lo calcula `lib/caja/conteo.core.js`, el MISMO que usa el servidor**: la pantalla
 * manda los billetes, el servidor rearma el total y, si ⛔ es el fondo o el contado, contesta 400.
 *
 * 🔑 **Los números se recuerdan** (Bruno: «al volver a entrar, mantiene la cantidad de cada
 * billete»): cada cambio se anota en esta computadora (`caja:conteo:zattia:<momento>`), y lo que se
 * guardó en la base (la apertura, el último intermedio) se ve desde cualquier PC. Arranca con lo
 * más nuevo de los dos.
 */

import { useState } from 'react'
import { Button, Input, Modal, Notice, color, font, space, weight } from '@/components/ui'
import { totalDeConteo } from '@/lib/caja/conteo.core.js'
import { plata } from '@/lib/caja/ticket'
import type { Conteo, ConteoGuardado } from '@/lib/caja/cliente'

/** Lo tipeado, como texto: un input vacío es 0. */
type Textos = Record<string, string>
type Apunte = { conteo: Textos; en: string }

const claveDe = (momento: string) => `caja:conteo:zattia:${momento}`

function leerApunte(momento: string): Apunte | null {
  try {
    const a = JSON.parse(localStorage.getItem(claveDe(momento)) || 'null') as Apunte | null
    if (a && a.conteo && typeof a.conteo === 'object' && typeof a.en === 'string') return a
  } catch {
    /* sin localStorage: arranca con lo de la base */
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

/** Con qué números arranca: lo anotado en esta computadora o lo guardado en la base, lo más nuevo. */
function inicial(billetes: number[], momento: string, guardado: ConteoGuardado | null | undefined): Textos {
  const apunte = leerApunte(momento)
  const deBase = guardado && (!apunte || Date.parse(guardado.en) > Date.parse(apunte.en))
  const fuente: Record<string, unknown> = deBase ? guardado.billetes : apunte ? apunte.conteo : {}
  return Object.fromEntries(billetes.map((v) => {
    const c = fuente[String(v)]
    return [String(v), c == null || Number(c) === 0 ? '' : String(c)]
  }))
}

export function CalculadoraBilletes({
  momento,
  billetes,
  guardado,
  titulo,
  accion,
  trabajando = false,
  error,
  onUsar,
  onCerrar,
}: {
  /** `apertura`, `intermedio:<turno>` o `cierre:<turno>`: dónde se anota en esta computadora. */
  momento: string
  billetes: number[]
  /** El conteo de la base con que puede arrancar (el último del turno). */
  guardado?: ConteoGuardado | null
  titulo: string
  /** El botón principal: «Usar este total» o «Guardar conteo». */
  accion: string
  trabajando?: boolean
  error?: string | null
  onUsar: (total: number, conteo: Conteo) => void
  onCerrar: () => void
}) {
  const [textos, setTextos] = useState<Textos>(() => inicial(billetes, momento, guardado))

  const cambiar = (v: number, t: string) => {
    const nuevo = { ...textos, [String(v)]: t.replace(/\D/g, '') }
    setTextos(nuevo)
    anotar(momento, nuevo)
  }
  const conteo: Conteo = Object.fromEntries(billetes.map((v) => [String(v), Number(textos[String(v)] || 0)]))
  let total: number | null = null
  try {
    total = totalDeConteo(conteo, billetes)
  } catch {
    /* ⛔ pasa: el input sólo deja dígitos */
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={titulo}
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button tone="success" loading={trabajando} disabled={total == null} onClick={() => total != null && onUsar(total, conteo)}>
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
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { Button, Input, color, font, space, weight } from '@/components/ui'
import { leerEspacio, lugarDe, type PosEspacio } from '@/lib/mapa-local/relevamiento'
import type { MapaLocal, Pared } from '@/lib/mapa-local/tipos'

/**
 * **Elegir el espacio con botones**, en «Chequeo + mapa»: lado → número → largo → simple o doble →
 * arriba o abajo. Lo pidió Bruno el 5-oct-2026: *«que vaya eligiendo entre los D o I, y el número. Que elija
 * si hay doble altura o simple, y que vaya escaneando»*.
 *
 * 🔑 **Escribe el MISMO texto del lugar** (`D01 arriba`) que se guarda en cada escaneo: los botones son
 * una forma de escribirlo sin teclado, ⛔ un campo nuevo. Por eso la vidriera y las mesas se siguen
 * escribiendo a mano en el campo de abajo.
 *
 * 🔑 **Simple o doble lo dice quien está parado ahí**, ⛔ el mapa: el mapa guardado está viejo (por
 * eso se releva). El mapa sólo propone los números que conoce y la estructura que tenía.
 *
 * 🔑 **Largo** (5-oct-2026): un perchero de DOBLE LARGO ocupa este número y el siguiente, y se escanea
 * entero como uno (`D07-08 arriba`). El primer relevamiento ⛔ tenía cómo decirlo y se cargó con un solo
 * número. El mapa propone el largo que conoce; lo confirma quien está parado ahí.
 *
 * ⚠️ Botones grandes y ⛔ chips: se tocan con el lector en la otra mano.
 */
export function ElegirEspacio({ mapa, lugar, onElegir }: { mapa: MapaLocal | null; lugar: string; onElegir: (lugar: string) => void }) {
  const actual = leerEspacio(lugar)
  const [pared, setPared] = useState<Pared | null>(actual?.pared ?? null)
  const [numero, setNumero] = useState<number | null>(actual?.numero ?? null)
  const [doble, setDoble] = useState<boolean | null>(actual ? actual.pos !== 'simple' : null)
  const [largo, setLargo] = useState<boolean>(actual?.largo ?? false)
  const [otro, setOtro] = useState(false)

  // Si el lugar cambió por otro lado (se escribió a mano, se retomó, «Pasar a abajo»), los botones
  // lo siguen. Se ajusta en el render y ⛔ en un efecto: así ⛔ hay un dibujo con los botones viejos.
  const [visto, setVisto] = useState(lugar)
  if (visto !== lugar) {
    setVisto(lugar)
    if (actual) {
      setPared(actual.pared)
      setNumero(actual.numero)
      setDoble(actual.pos !== 'simple')
      setLargo(actual.largo)
      setOtro(false)
    }
  }

  const numeros = useMemo(() => {
    if (!pared || pared === 'isla') return []
    const delMapa = (mapa?.modulos ?? []).filter((m) => m.pared === pared).map((m) => leerEspacio(m.codigo)?.numero).filter((n): n is number => !!n)
    return [...new Set(delMapa)].sort((a, b) => a - b)
  }, [mapa, pared])

  /** Lo que el mapa guardado dice de este módulo: sólo para proponer, ⛔ decide. */
  const moduloDelMapa = (p: Pared, n: number) => mapa?.modulos.find((x) => x.codigo === lugarDe({ pared: p, numero: n, pos: 'simple' }))
  const dobleSegunMapa = (p: Pared, n: number): boolean | null => {
    const m = moduloDelMapa(p, n)
    return m ? m.niveles.some((x) => x.pos === 'alta' || x.pos === 'baja') : null
  }
  /** Largo según el mapa: el doble de ancho que un módulo (150 cm). La isla ⛔ cuenta: es otra cosa. */
  const largoSegunMapa = (p: Pared, n: number): boolean => (moduloDelMapa(p, n)?.anchoCm ?? 0) >= 150
  const dos = (n: number) => String(n).padStart(2, '0')
  const etiquetaNumero = (n: number) => (pared && pared !== 'isla' && largoSegunMapa(pared, n) ? `${dos(n)}–${dos(n + 1)}` : dos(n))

  function elegirPared(p: Pared) {
    setPared(p)
    setOtro(false)
    if (p === 'isla') {
      setNumero(0)
      setDoble(false)
      onElegir(lugarDe({ pared: 'isla', numero: 0, pos: 'simple' }))
      return
    }
    setNumero(null)
    setDoble(null)
    setLargo(false)
  }

  function elegirNumero(n: number) {
    setNumero(n)
    setOtro(false)
    const d = pared ? dobleSegunMapa(pared, n) : null
    const l = pared ? largoSegunMapa(pared, n) : false
    setDoble(d)
    setLargo(l)
    // Simple según el mapa: ya se puede escanear. Si en el salón es doble, se toca «Doble».
    if (pared && d === false) onElegir(lugarDe({ pared, numero: n, pos: 'simple', largo: l }))
  }

  /** Cambiar el largo con la altura ya elegida reescribe el lugar: se sigue escaneando en la misma barra. */
  function elegirLargo(l: boolean) {
    setLargo(l)
    if (!pared || numero == null || doble == null) return
    if (!doble) onElegir(lugarDe({ pared, numero, pos: 'simple', largo: l }))
    else if (posActual) onElegir(lugarDe({ pared, numero, pos: posActual, largo: l }))
  }

  function elegirEstructura(d: boolean) {
    setDoble(d)
    if (pared && numero != null && !d) onElegir(lugarDe({ pared, numero, pos: 'simple', largo }))
  }

  function elegirAltura(pos: PosEspacio) {
    if (pared && numero != null) onElegir(lugarDe({ pared, numero, pos, largo }))
  }

  const grande = { minWidth: 56, height: 48, fontSize: font.lg } as const
  const opcion = (activo: boolean, label: string, onClick: () => void, extra?: React.CSSProperties) => (
    <Button key={label} variant={activo ? 'solid' : 'outline'} tone={activo ? 'brand' : undefined} onClick={onClick} style={{ ...grande, ...extra }} aria-pressed={activo}>
      {label}
    </Button>
  )
  const fila = (titulo: string, hijos: React.ReactNode) => (
    <div style={{ marginBottom: space[3] }}>
      <div style={{ fontSize: font.xs, fontWeight: weight.bold, color: color.mut, marginBottom: space[1] }}>{titulo}</div>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>{hijos}</div>
    </div>
  )
  const posActual = actual && actual.pared === pared && actual.numero === numero ? actual.pos : null

  return (
    <div style={{ marginBottom: space[3] }}>
      {fila(
        'Lado',
        <>
          {opcion(pared === 'der', 'D', () => elegirPared('der'))}
          {opcion(pared === 'izq', 'I', () => elegirPared('izq'))}
          {opcion(pared === 'isla', 'ISLA', () => elegirPared('isla'))}
        </>,
      )}

      {pared && pared !== 'isla' &&
        fila(
          'Número',
          <>
            {numeros.map((n) => opcion(numero === n && !otro, etiquetaNumero(n), () => elegirNumero(n)))}
            {/* Un número que el mapa ⛔ tiene es justo lo que el relevamiento viene a encontrar. */}
            {otro || (numero != null && !numeros.includes(numero)) ? (
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                aria-label="Otro número"
                defaultValue={numero != null && !numeros.includes(numero) ? numero : undefined}
                autoFocus={otro}
                onChange={(e) => {
                  const n = Math.trunc(Number(e.target.value))
                  if (n >= 1 && n <= 99) {
                    setNumero(n)
                    setDoble(null)
                  }
                }}
                style={{ width: 80, height: 48, fontSize: font.lg }}
              />
            ) : (
              opcion(false, 'otro número', () => setOtro(true), { fontSize: font.base })
            )}
          </>,
        )}

      {pared && pared !== 'isla' && numero != null &&
        fila(
          'Largo',
          <>
            {opcion(!largo, 'Un módulo', () => elegirLargo(false))}
            {opcion(largo, `Doble largo (${dos(numero)} + ${dos(numero + 1)})`, () => elegirLargo(true))}
          </>,
        )}

      {pared && pared !== 'isla' && numero != null &&
        fila(
          'Barras',
          <>
            {opcion(doble === false, 'Simple', () => elegirEstructura(false))}
            {opcion(doble === true, 'Doble', () => elegirEstructura(true))}
          </>,
        )}

      {pared && pared !== 'isla' && numero != null && doble === true &&
        fila(
          'Altura',
          <>
            {opcion(posActual === 'alta', 'Arriba', () => elegirAltura('alta'))}
            {opcion(posActual === 'baja', 'Abajo', () => elegirAltura('baja'))}
          </>,
        )}
    </div>
  )
}

/**
 * «Pasar a abajo» / «pasar a arriba»: el cambio más común del recorrido, a un toque. `null` si el
 * lugar ⛔ es una barra de un módulo doble.
 */
export function otraAltura(lugar: string): { label: string; lugar: string } | null {
  const e = leerEspacio(lugar)
  if (!e || e.pos === 'simple') return null
  const pos: PosEspacio = e.pos === 'alta' ? 'baja' : 'alta'
  return { label: pos === 'alta' ? 'Pasar a arriba' : 'Pasar a abajo', lugar: lugarDe({ ...e, pos }) }
}

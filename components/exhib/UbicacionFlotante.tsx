'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Input, color, font, space, weight } from '@/components/ui'
import { claveLugar, siguienteParada, type Parada } from '@/lib/exhib/paradas'

/**
 * **La ubicación flotante del chequeo con mapa** (Darío, 12-oct-2026): fija arriba, dice dónde está
 * parada la empleada. Tocándola se abre la lista de barras en el orden del local; un toque elige y
 * la lista se cierra. La flecha salta a la próxima barra sin escanear.
 *
 * Reemplaza las cinco filas de botones de `ElegirEspacio` (lado, número, largo, barras, altura), que
 * ocupaban media pantalla para algo que el mapa guardado ya sabe. La lógica vive en
 * `lib/exhib/paradas.ts`.
 *
 * 🔑 **Lo ya escaneado ⛔ se ofrece** (*«normalmente no se vuelve a un lugar donde ya chequeaste»*):
 * queda detrás de «Ver los ya escaneados».
 * 🔴 **Después de elegir, el foco vuelve al escaneo** (`onElegir` lo hace): el lector TIPEA donde está
 * el cursor, y un código que cae en un botón se pierde sin que nadie se entere.
 * ⚠️ Botones grandes: se tocan con el lector en la otra mano.
 */
export function UbicacionFlotante({ paradas, lugar, hechos, onElegir }: { paradas: Parada[]; lugar: string; hechos: Set<string>; onElegir: (lugar: string) => void }) {
  const [abierta, setAbierta] = useState(false)
  const [verHechas, setVerHechas] = useState(false)
  const [otro, setOtro] = useState('')
  const actual = claveLugar(lugar)
  const sigue = useMemo(() => siguienteParada(paradas, lugar, hechos), [paradas, lugar, hechos])

  // Al arrancar sin lugar, la primera barra del recorrido: la empleada ⛔ tiene que elegir nada para empezar.
  useEffect(() => {
    if (!lugar.trim() && paradas.length) onElegir((siguienteParada(paradas, '', hechos) ?? paradas[0]).lugar)
  }, [lugar, paradas, hechos, onElegir])

  const hecha = (p: Parada) => hechos.has(claveLugar(p.lugar)) && claveLugar(p.lugar) !== actual
  const visibles = paradas.filter((p) => verHechas || !hecha(p))
  const cuantasHechas = paradas.filter(hecha).length
  /** Agrupadas por perchero, en el orden del local: «D01 [Arriba] [Abajo]». */
  const porModulo = useMemo(() => {
    const m = new Map<string, Parada[]>()
    for (const p of visibles) m.set(p.modulo, [...(m.get(p.modulo) ?? []), p])
    return [...m]
  }, [visibles])

  function elegir(l: string) {
    setAbierta(false)
    setVerHechas(false)
    setOtro('')
    onElegir(l)
  }

  const etiqueta = (p: Parada) => (p.pos === 'alta' ? 'Arriba' : p.pos === 'baja' ? 'Abajo' : p.modulo)
  const pendientes = paradas.filter((p) => !hechos.has(claveLugar(p.lugar))).length

  return (
    <div style={{ position: 'sticky', top: 8, zIndex: 20, marginBottom: space[3] }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'stretch' }}>
        <button
          type="button"
          onClick={() => setAbierta(!abierta)}
          aria-expanded={abierta}
          style={{
            flex: 1,
            height: 'auto',
            minHeight: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space[2],
            padding: `0 ${space[3]}px`,
            borderRadius: 12,
            border: `2px solid ${color.brand}`,
            background: color.surface,
            color: color.ink,
            fontSize: font.xl,
            fontWeight: weight.bold,
            cursor: 'pointer',
            boxShadow: 'var(--mo-sh-md)',
          }}
        >
          <span>📍 {lugar.trim() || 'Elegí dónde estás'}</span>
          <span style={{ fontSize: font.sm, fontWeight: weight.normal, color: color.mut }}>
            {pendientes ? `faltan ${pendientes}` : 'todos hechos'} {abierta ? '▴' : '▾'}
          </span>
        </button>
        {sigue && (
          <Button
            variant="solid"
            tone="brand"
            onClick={() => elegir(sigue.lugar)}
            title={`Pasar a ${sigue.lugar}`}
            aria-label={`Pasar a ${sigue.lugar}`}
            style={{ minWidth: 64, height: 'auto', minHeight: 52, fontSize: font['2xl'], boxShadow: 'var(--mo-sh-md)' }}
          >
            →
          </Button>
        )}
      </div>
      {sigue && !abierta && <div style={{ fontSize: font.xs, color: color.mut, marginTop: 4, textAlign: 'right' }}>→ {sigue.lugar}</div>}

      {abierta && (
        <div style={{ marginTop: space[2], padding: space[3], borderRadius: 12, border: `1px solid ${color.line}`, background: color.surface, boxShadow: 'var(--mo-sh-pop)', maxHeight: '60vh', overflowY: 'auto' }}>
          {porModulo.length === 0 && <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>Ya se escanearon todos los lugares del mapa.</div>}
          {porModulo.map(([modulo, ps]) => (
            <div key={modulo} style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1]}px 0`, borderBottom: `1px solid ${color.line}` }}>
              <span style={{ width: 72, fontWeight: weight.bold, color: color.ink }}>{modulo}</span>
              {ps.map((p) => {
                const esActual = claveLugar(p.lugar) === actual
                return (
                  <Button
                    key={p.lugar}
                    variant={esActual ? 'solid' : 'outline'}
                    tone={esActual ? 'brand' : undefined}
                    onClick={() => elegir(p.lugar)}
                    style={{ minWidth: 88, height: 44, fontSize: font.md, opacity: hecha(p) ? 0.55 : 1 }}
                  >
                    {etiqueta(p)}
                    {hecha(p) && ' ✓'}
                  </Button>
                )
              })}
            </div>
          ))}
          <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', marginTop: space[3], fontSize: font.sm }}>
            {cuantasHechas > 0 && (
              <button type="button" onClick={() => setVerHechas(!verHechas)} style={{ height: 'auto', background: 'none', border: 'none', padding: 0, color: color.brand, cursor: 'pointer', fontSize: font.sm, textDecoration: 'underline' }}>
                {verHechas ? 'Ocultar los ya escaneados' : `Ver los ya escaneados (${cuantasHechas})`}
              </button>
            )}
            {/* Para lo que ⛔ es una barra del mapa: un perchero nuevo, algo colgado fuera de lugar. */}
            <Input
              value={otro}
              onChange={(e) => setOtro(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && otro.trim()) {
                  e.preventDefault()
                  elegir(otro.trim())
                }
              }}
              placeholder="Otro lugar… (Enter)"
              aria-label="Otro lugar"
              autoComplete="off"
              style={{ width: 200, height: 40, fontSize: 16 }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

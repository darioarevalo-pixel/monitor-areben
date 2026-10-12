'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Input, color, font, space, weight } from '@/components/ui'
import { claveLugar, conFrontal, esFrontal, lugarDeParada, percherosHechos, percherosPendientes, percheroDe, siguienteLugar, sinFrontal, type Perchero, type PosParada } from '@/lib/exhib/paradas'

/**
 * **La ubicación flotante del chequeo con mapa** (Darío, 12-oct-2026): fija arriba, dice dónde está
 * parada la empleada. Tocándola se abre la lista de percheros en el orden del recorrido (I → ISLA →
 * D), cada uno con Arriba / Abajo; un toque elige y la lista se cierra. La flecha salta al lugar que
 * sigue. El botón **Frontal** marca la barra de adelante como exhibición frontal (lo repetido ahí ⛔
 * es duplicado) y se apaga solo al cambiar de barra. La lógica vive en `lib/exhib/paradas.ts`.
 *
 * 🔑 **Cada perchero ofrece SIEMPRE Arriba y Abajo** (y «Única» si el mapa lo tiene de una barra): el mapa
 * guardado puede estar viejo (el 10-oct se movió todo y ⛔ se actualizó), así que elige quien está
 * delante, ⛔ el mapa.
 * 🔑 **Un perchero ya escaneado ⛔ se ofrece** al pasar a otro: queda tras «Ver los ya escaneados».
 * 🔴 **Después de elegir, el foco vuelve al escaneo** (`onElegir` lo hace): el lector TIPEA donde
 * está el cursor, y un código que cae en un botón se pierde sin que nadie se entere.
 * ⚠️ Botones grandes: se tocan con el lector en la otra mano.
 */
export function UbicacionFlotante({ percheros, lugar, escaneos, onElegir }: { percheros: Perchero[]; lugar: string; escaneos: { lugar: string }[]; onElegir: (lugar: string) => void }) {
  const [abierta, setAbierta] = useState(false)
  const [verHechos, setVerHechos] = useState(false)
  const [otro, setOtro] = useState('')
  const actual = claveLugar(lugar)
  const percheroActual = percheroDe(lugar)
  const hechos = useMemo(() => percherosHechos(escaneos), [escaneos])
  const sigue = useMemo(() => siguienteLugar(percheros, lugar, escaneos), [percheros, lugar, escaneos])
  const faltan = useMemo(() => percherosPendientes(percheros, escaneos), [percheros, escaneos])

  // Al arrancar sin lugar, el primer perchero del recorrido: ⛔ tiene que elegir nada para empezar.
  useEffect(() => {
    if (!lugar.trim() && percheros.length) {
      const primero = siguienteLugar(percheros, '', escaneos)
      if (primero) onElegir(primero)
    }
  }, [lugar, percheros, escaneos, onElegir])

  const hecho = (p: Perchero) => hechos.has(p.codigo) && p.codigo !== percheroActual
  const visibles = percheros.filter((p) => verHechos || !hecho(p))
  const cuantosHechos = percheros.filter(hecho).length

  function elegir(l: string) {
    setAbierta(false)
    setVerHechos(false)
    setOtro('')
    onElegir(l)
  }

  const posiciones = (p: Perchero): [PosParada, string][] =>
    p.isla ? [['simple', 'ISLA']] : [...(p.doble ? [] : ([['simple', 'Única']] as [PosParada, string][])), ['alta', 'Arriba'], ['baja', 'Abajo']]
  const frontal = esFrontal(lugar)

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
            padding: `0 ${space[2]}px`,
            borderRadius: 12,
            border: `2px solid ${color.brand}`,
            background: frontal ? color.brandBg : color.surface,
            color: color.ink,
            // 🔑 lg y ⛔ xl (Darío, 12-oct-2026): con Frontal y la flecha al lado, «D05 arriba» se cortaba.
            fontSize: font.lg,
            minWidth: 0,
            fontWeight: weight.bold,
            cursor: 'pointer',
            boxShadow: 'var(--mo-sh-md)',
          }}
        >
          {/* Un solo renglón (Darío: «se hacen 2 renglones, queda feo»): que es frontal lo dicen el
              botón prendido y el fondo de la ubicación. */}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📍 {sinFrontal(lugar) || 'Elegí dónde estás'}</span>
          <span style={{ fontSize: font.sm, fontWeight: weight.normal, color: color.mut }}>{abierta ? '▴' : '▾'}</span>
        </button>
        {/* 🔑 Frontal es de la BARRA de adelante (Darío: «D03 arriba es frontal y abajo normal»):
            se prende acá y se apaga sola al pasar a otra barra. */}
        <Button
          variant={frontal ? 'solid' : 'outline'}
          tone={frontal ? 'brand' : undefined}
          aria-pressed={frontal}
          disabled={!lugar.trim()}
          onClick={() => onElegir(conFrontal(lugar, !frontal))}
          style={{ height: 'auto', minHeight: 52, padding: `0 ${space[2]}px`, fontSize: font.base, background: frontal ? undefined : color.surface, boxShadow: 'var(--mo-sh-md)' }}
        >
          Frontal
        </Button>
        {sigue && (
          <Button
            variant="solid"
            tone="brand"
            onClick={() => elegir(sigue)}
            title={`Pasar a ${sigue}`}
            aria-label={`Pasar a ${sigue}`}
            style={{ minWidth: 52, height: 'auto', minHeight: 52, fontSize: font.xl, boxShadow: 'var(--mo-sh-md)' }}
          >
            →
          </Button>
        )}
      </div>
      {/* «faltan N» va abajo y ⛔ al lado del lugar: en el celular cortaba «D05 arriba» (Darío, 12-oct-2026). */}
      {!abierta && (
        <div style={{ fontSize: font.xs, color: color.mut, marginTop: 4, textAlign: 'right' }}>
          {faltan ? `faltan ${faltan} percheros` : 'todos los percheros hechos'}
          {sigue && <> · sigue {sigue}</>}
        </div>
      )}

      {abierta && (
        <div style={{ marginTop: space[2], padding: space[3], borderRadius: 12, border: `1px solid ${color.line}`, background: color.surface, boxShadow: 'var(--mo-sh-pop)', maxHeight: '60vh', overflowY: 'auto' }}>
          {visibles.length === 0 && <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>Ya se escanearon todos los percheros.</div>}
          {visibles.map((p) => (
            <div key={p.codigo} style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1]}px 0`, borderBottom: `1px solid ${color.line}`, flexWrap: 'wrap', opacity: hecho(p) ? 0.55 : 1 }}>
              <span style={{ width: 64, fontWeight: weight.bold, color: color.ink }}>
                {p.nombre}
                {hecho(p) && ' ✓'}
              </span>
              {posiciones(p).map(([pos, etiqueta]) => {
                const l = lugarDeParada(p, pos)
                const esActual = claveLugar(l) === actual
                return (
                  <Button
                    key={pos}
                    variant={esActual ? 'solid' : 'outline'}
                    tone={esActual ? 'brand' : undefined}
                    onClick={() => elegir(l)}
                    style={{ minWidth: 76, height: 44, fontSize: font.md }}
                  >
                    {etiqueta}
                  </Button>
                )
              })}
            </div>
          ))}
          <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', marginTop: space[3], fontSize: font.sm }}>
            {cuantosHechos > 0 && (
              <button type="button" onClick={() => setVerHechos(!verHechos)} style={{ height: 'auto', background: 'none', border: 'none', padding: 0, color: color.brand, cursor: 'pointer', fontSize: font.sm, textDecoration: 'underline' }}>
                {verHechos ? 'Ocultar los ya escaneados' : `Ver los ya escaneados (${cuantosHechos})`}
              </button>
            )}
            {/* Para un perchero que ⛔ está en el mapa: uno nuevo, o algo colgado fuera de lugar. */}
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

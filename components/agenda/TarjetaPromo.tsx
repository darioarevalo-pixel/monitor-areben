'use client'

/**
 * Una promoción bancaria, como la lee quien está cobrando.
 *
 * 🔑 **Se lee a un metro de distancia, con el cliente delante.** Por eso el titular es el banco y el
 * beneficio en grande, y todo lo demás —condiciones, tope, pasos— está plegado. Poner la letra chica
 * a la misma altura que el número obliga a leer seis renglones para contestar "¿le hago el 30%?".
 *
 * El mismo componente sirve en la sección Agenda y en la banda del mostrador (`compacta`): que la
 * promo se vea igual en los dos lados es lo que hace que se pueda confiar en cualquiera de ellos.
 */

import { useState } from 'react'
import { Badge, Markdown, color, font, radius, space, weight } from '@/components/ui'
import { rotuloBeneficio, type Promo } from '@/lib/agenda'
import { MEDIOS } from '@/lib/agenda/tipos'

const LABEL_MEDIO = Object.fromEntries(MEDIOS.map((m) => [m.key, m.label]))

/** El monto como lo escribe una persona: `$15.000`. El tope se lee de un vistazo o no se lee. */
function pesos(n: number): string {
  return `$${n.toLocaleString('es-AR')}`
}

export function TarjetaPromo({ promo, compacta = false }: { promo: Promo; compacta?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const tope = promo.beneficio.tipo === 'reintegro' ? promo.beneficio.tope : null
  // "Cómo se cobra" y las condiciones son el mismo gesto: lo que hay que mirar recién cuando ya
  // decidiste aplicarla. Un solo botón para los dos, o son dos plegables que compiten.
  const hayDetalle = !!promo.pasos || promo.condiciones.length > 0

  return (
    <div
      style={{
        border: `1px solid ${color.line}`,
        borderRadius: radius.xl,
        padding: compacta ? space[3] : space[4],
        background: color.bg2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
        <span style={{ fontSize: compacta ? font.lg : font.xl, fontWeight: weight.bold, color: color.ink }}>
          {promo.banco}
        </span>
        <Badge tone="neutral">{LABEL_MEDIO[promo.medio] || promo.medio}</Badge>
      </div>

      <div
        style={{
          fontSize: compacta ? font['2xl'] : font['3xl'],
          fontWeight: weight.heavy,
          color: color.brand,
          lineHeight: 1.15,
          marginTop: space[1],
        }}
      >
        {rotuloBeneficio(promo.beneficio)}
      </div>

      {/*
        El tope va pegado al número y NO adentro de las condiciones: es la parte del beneficio que
        cambia lo que se le dice al cliente ("hasta $15.000"), no letra chica. Sin tope escrito, un
        reintegro del 20% se promete sobre el total de la compra.
      */}
      {tope !== null && (
        <div style={{ fontSize: font.md, color: color.ink2, marginTop: 2 }}>hasta {pesos(tope)}</div>
      )}
      {promo.beneficio.tipo === 'reintegro' && tope === null && (
        <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>sin tope cargado</div>
      )}

      {hayDetalle && (
        <>
          <button
            onClick={() => setAbierto((v) => !v)}
            style={{
              // `height: auto` no es de adorno: la regla legacy `.shell-content button` le fija a
              // TODO botón la altura de un renglón.
              height: 'auto',
              background: 'transparent',
              border: 'none',
              padding: 0,
              marginTop: space[3],
              cursor: 'pointer',
              color: color.brand,
              fontSize: font.base,
              fontWeight: weight.semibold,
            }}
          >
            {abierto ? '▾' : '▸'} Cómo se cobra
          </button>

          {abierto && (
            <div style={{ marginTop: space[3] }}>
              {promo.condiciones.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: space[5], color: color.ink2, fontSize: font.base }}>
                  {promo.condiciones.map((c, i) => (
                    <li key={i} style={{ marginBottom: space[1] }}>{c}</li>
                  ))}
                </ul>
              )}
              {promo.pasos && (
                <div style={{ marginTop: promo.condiciones.length > 0 ? space[3] : 0 }}>
                  <Markdown texto={promo.pasos} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

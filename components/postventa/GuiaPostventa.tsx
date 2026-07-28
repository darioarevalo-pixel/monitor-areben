'use client'

/**
 * Las dos ayudas de Post-venta, en un solo lugar porque resuelven el mismo problema: **las
 * pantallas no dicen lo que esperan de vos**.
 *
 *  - `DondeVa` — el selector de arriba. El error caro no es cargar mal una devolución: es
 *    cargarla en la pestaña equivocada, y ahí el stock y la plata terminan mal en dos lados a la
 *    vez. Tres líneas que se leen en cinco segundos.
 *  - `Instructivo` — el paso a paso de cada pestaña, plegado. Mismo molde que
 *    `InstructivoConteo` (`components/conteos/comunes.tsx`), que nació de un problema idéntico:
 *    "si alguien sale sin terminar, el conteo no se guarda, y eso ya pasó".
 *
 * Van plegados a propósito: quien ya sabe no los abre, y quien no sabe los tiene ahí sin
 * preguntarle a nadie.
 */

import { color, font, space } from '@/components/ui'

/** Dónde se carga cada cosa. La regla es de dónde VIENE el producto, no qué le pasó. */
export function DondeVa({ activa }: { activa: 'fallas' | 'reclamos' | 'cambios' }) {
  const filas: { key: typeof activa; pregunta: string; donde: string }[] = [
    { key: 'fallas', pregunta: '¿El producto ya está acá, sin orden de por medio?', donde: 'Fallas' },
    { key: 'reclamos', pregunta: '¿Compró online y algo salió mal?', donde: 'Reclamos' },
    { key: 'cambios', pregunta: '¿Ya sabés que quiere cambiarlo por otro?', donde: 'Cambios' },
  ]
  return (
    <details style={{ marginBottom: space[3], border: `1px solid ${color.line}`, background: color.bg2, borderRadius: 'var(--mo-r-lg)', padding: '10px 14px' }}>
      <summary style={{ cursor: 'pointer', fontSize: font.base, fontWeight: 600, color: color.ink2 }}>
        ¿Esto va acá? — dónde se carga cada cosa
      </summary>
      <div style={{ marginTop: space[2], fontSize: font.base, lineHeight: 1.9, color: color.ink2 }}>
        {filas.map((f) => (
          <div key={f.key} style={{ fontWeight: f.key === activa ? 600 : 400, color: f.key === activa ? color.brand : color.ink2 }}>
            {f.pregunta} → <b>{f.donde}</b>{f.key === activa ? ' (estás acá)' : ''}
          </div>
        ))}
        <div style={{ marginTop: space[2], fontSize: font.sm, color: color.mut }}>
          <b>Reclamos y Cambios son la misma cola</b>: comparten el número (<b>R-0042</b>) y la
          lista, y los ves a los dos desde Reclamos. Lo que cambia es por dónde entrás. Si ya sabés
          que quiere otro producto, entrá por <b>Cambios</b> y resolvelo ahí mismo — no hace falta
          que Administración decida nada. Si hay que evaluar (vino fallado, no llegó), entrá por
          <b> Reclamos</b>, y si la resolución termina siendo un cambio, se sigue en Cambios.
          <div style={{ marginTop: 4 }}>
            Si te equivocás de lugar, el stock y la plata pueden quedar mal a la vez. Ante la duda,
            preguntá antes de cargar.
          </div>
        </div>
      </div>
    </details>
  )
}

/** El paso a paso de una pestaña. `pasos` en el orden real de la operación. */
export function Instructivo({ titulo, pasos, ojo }: { titulo: string; pasos: React.ReactNode[]; ojo?: React.ReactNode }) {
  return (
    <details style={{ marginBottom: space[3], border: `1px solid ${color.brandBorder}`, background: color.brandBg, borderRadius: 'var(--mo-r-lg)', padding: '10px 14px' }}>
      <summary style={{ cursor: 'pointer', fontSize: font.base, fontWeight: 600, color: color.brand }}>{titulo}</summary>
      <ol style={{ margin: '10px 0 2px', paddingLeft: 20, fontSize: font.base, color: color.ink2, lineHeight: 1.8 }}>
        {pasos.map((p, i) => <li key={i}>{p}</li>)}
      </ol>
      {ojo && (
        <div style={{ marginTop: space[2], fontSize: font.sm, color: color.warningInk }}>⚠️ {ojo}</div>
      )}
    </details>
  )
}

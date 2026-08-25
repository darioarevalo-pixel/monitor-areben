'use client'

/**
 * La ayuda propia de Post-venta. Resuelve el problema que tiene sólo este módulo: **el error caro
 * no es cargar mal, es cargar en la pestaña equivocada.**
 *
 * Son tres líneas que se leen en cinco segundos y evitan que el stock y la plata terminen mal en
 * dos lados a la vez. Va **plegado**: quien ya sabe no lo abre, y quien no sabe lo tiene ahí sin
 * preguntarle a nadie.
 *
 * El paso a paso de cada pestaña es `Instructivo`, que vive en el kit (`components/ui`): nació acá
 * y en conteos por separado, con el mismo markup, y ahora es uno solo.
 */

import { color, font, space } from '@/components/ui'

/** Dónde se carga cada cosa. La regla es de dónde VIENE el producto, no qué le pasó. */
export function DondeVa({ activa }: { activa: 'fallas' | 'reclamos' | 'cambios' | 'retornos' }) {
  const filas: { key: typeof activa; pregunta: string; donde: string }[] = [
    { key: 'fallas', pregunta: '¿El producto ya está acá, sin orden de por medio?', donde: 'Fallas' },
    { key: 'reclamos', pregunta: '¿Compró online y algo salió mal?', donde: 'Reclamos' },
    { key: 'cambios', pregunta: '¿Ya sabés que quiere cambiarlo por otro?', donde: 'Cambios' },
    // La cuarta no es "dónde se carga" sino "dónde se espera": el paquete que vuelve no se carga en
    // ningún lado, ya tiene reclamo. Va igual acá porque es exactamente donde lo buscan mal (en
    // Envíos, que es lo que sale).
    { key: 'retornos', pregunta: '¿Estás esperando que un producto vuelva?', donde: 'Retornos' },
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

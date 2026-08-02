'use client'

/**
 * El paso a paso de una pantalla, plegado.
 *
 * Existe porque **las pantallas no dicen lo que esperan de vos**, y en los módulos donde el
 * proceso pasa por varias personas —o donde la mitad de los pasos ocurren fuera del sistema— eso
 * se paga con casos cargados mal. Nació dos veces por separado (post-venta y conteos) con el mismo
 * markup; esta es la única implementación.
 *
 * **Va plegado a propósito**: quien ya sabe no lo abre, y quien no sabe lo tiene ahí sin
 * preguntarle a nadie. Un instructivo desplegado por defecto se vuelve ruido en dos días y
 * empieza a estorbar justo a quien más rápido trabaja.
 */

import { color, font, space } from '@/components/ui/tokens'

export type InstructivoProps = {
  /** La pregunta que trae a alguien a abrirlo, en criollo. No "Ayuda". */
  titulo: string
  /** En el orden real de la operación, no en el orden en que está programado. */
  pasos: React.ReactNode[]
  /** Lo que si sale mal cuesta caro. Va al pie, con el ⚠️ puesto. */
  ojo?: React.ReactNode
}

export function Instructivo({ titulo, pasos, ojo }: InstructivoProps) {
  return (
    <details
      style={{
        marginBottom: space[3],
        border: `1px solid ${color.brandBorder}`,
        background: color.brandBg,
        borderRadius: 'var(--mo-r-lg)',
        padding: '10px 14px',
      }}
    >
      <summary style={{ cursor: 'pointer', fontSize: font.base, fontWeight: 600, color: color.brand }}>
        {titulo}
      </summary>
      <ol style={{ margin: '10px 0 2px', paddingLeft: 20, fontSize: font.base, color: color.ink2, lineHeight: 1.8 }}>
        {pasos.map((p, i) => <li key={i}>{p}</li>)}
      </ol>
      {ojo && <div style={{ marginTop: space[2], fontSize: font.sm, color: color.warningInk }}>⚠️ {ojo}</div>}
    </details>
  )
}

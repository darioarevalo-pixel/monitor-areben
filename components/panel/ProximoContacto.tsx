'use client'

import { color, font, radius, space } from '@/components/ui/tokens'
import { addDiasISO, diaHabil } from '@/lib/crm/core'
import { estadoContacto, plazosConSugerido, textoEstado, type EstadoContacto } from '@/lib/crm/proximo'
import { plazoEnPalabras } from '@/lib/crm/ritmo'

/**
 * El color de cada estado, el mismo en la ficha, en «Hoy» y en «Pagos»: rojo atrasado, amarillo
 * hoy, verde agendado. Sin fecha va en gris: no es una alarma, es la ausencia de un dato.
 */
export const TONO_CONTACTO: Record<EstadoContacto, { fuerte: string; bg: string; ink: string; borde: string }> = {
  atrasado: { fuerte: color.danger, bg: color.dangerBg, ink: color.dangerInk, borde: color.dangerBorder },
  hoy: { fuerte: color.warning, bg: color.warningBg, ink: color.warningInk, borde: color.warningBorder },
  agendado: { fuerte: color.success, bg: color.successBg, ink: color.successInk, borde: color.successBorder },
  'sin-fecha': { fuerte: color.line2, bg: color.surface, ink: color.mut, borde: color.line2 },
}

const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function dia(iso: string, largo: boolean): string {
  const d = new Date(iso + 'T00:00:00')
  return largo ? DIAS_LARGOS[d.getDay()] : `${DIAS_CORTOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

/** La rayita de color debajo de las solapas: el estado de la ficha sin leer nada. */
export function RayaEstado({ estado }: { estado: EstadoContacto }) {
  return <div aria-hidden style={{ height: 4, background: TONO_CONTACTO[estado].fuerte }} />
}

/** El estado de la ficha, el mismo que pinta la franja y la rayita. */
export function estadoDeFicha(fecha: string | null | undefined, hoy: string, faltaFecha: boolean): EstadoContacto {
  return faltaFecha ? 'atrasado' : estadoContacto(fecha, hoy).estado
}

/**
 * «Próximo contacto», fijo abajo de la ficha (Darío, 19-oct-2026: «me preocupa el tema de lo
 * importante de la fecha de recontacto»). Estaba al final, debajo de la última compra: había que
 * bajar en cada chat para lo único que se toca en todos.
 *
 * Arriba la fecha grande con su estado; abajo los plazos de siempre, de menor a mayor, con el
 * sugerido por el ritmo de compra en azul y en su lugar.
 *
 * ⚠️ Se pega arriba de la calculadora, que también es fija abajo: su alto llega por
 * `--alto-calc` (lo publica `CalculadoraEnvio`). Sin eso la tapaba.
 */
export function ProximoContacto({
  fecha,
  hoy,
  faltaFecha,
  ritmo,
  guardando,
  calendario,
  onPlazo,
}: {
  fecha: string | null | undefined
  hoy: string
  faltaFecha: boolean
  ritmo: { cadaDias: number; desdeUltima: number; enDias: number } | null
  guardando: boolean
  /** El casillero de la fecha (`CampoFecha`): se escribe con el teclado o se elige en el calendario. */
  calendario: React.ReactNode
  onPlazo: (dias: number) => void
}) {
  const est = estadoContacto(fecha, hoy)
  const estado = estadoDeFicha(fecha, hoy, faltaFecha)
  const t = TONO_CONTACTO[estado]
  const plazos = plazosConSugerido(ritmo && ritmo.enDias > 0 ? ritmo.enDias : null)
  const etiqueta = faltaFecha ? 'Le escribiste hoy · falta fecha' : textoEstado(est)

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 'var(--alto-calc, 0px)',
        zIndex: 2,
        background: t.bg,
        borderTop: `3px solid ${t.fuerte}`,
        padding: `${space[2]}px ${space[3]}px ${space[2] + 2}px`,
        boxShadow: '0 -6px 14px rgba(16, 24, 40, 0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: color.mut }}>
            Próximo contacto
            {est.estado !== 'sin-fecha' && fecha && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}> · {dia(String(fecha).slice(0, 10), true)}</span>}
          </div>
          {calendario}
        </div>
        <span
          style={{
            flex: 'none',
            marginBottom: 6,
            fontSize: font.xs,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: radius.pill,
            whiteSpace: 'nowrap',
            border: `1px solid ${t.borde}`,
            background: color.surface,
            color: t.ink,
          }}
        >
          {etiqueta}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        {plazos.map(({ dias, sugerido }) => {
          const cae = diaHabil(addDiasISO(hoy, dias))
          return (
            <button
              key={dias}
              type="button"
              disabled={guardando}
              onClick={() => onPlazo(dias)}
              title={`${sugerido ? 'Sugerido: ' : ''}${plazoEnPalabras(dias)} · ${dia(cae, false)}`}
              aria-label={`${plazoEnPalabras(dias)}, el ${dia(cae, false)}`}
              style={{
                flex: 1,
                minWidth: 0,
                height: 30,
                padding: 0,
                fontSize: font.sm,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                borderRadius: radius.md,
                cursor: guardando ? 'not-allowed' : 'pointer',
                border: `1px solid ${sugerido ? color.brandSolid : color.line2}`,
                background: sugerido ? color.brandSolid : color.surface,
                color: sugerido ? color.sideActiveInk : color.ink2,
                boxShadow: sugerido ? '0 2px 6px rgba(79, 70, 229, 0.3)' : 'none',
              }}
            >
              {dias}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: font.xs, color: color.mut, marginTop: 5, textAlign: 'center' }}>
        {ritmo ? (
          <>
            {ritmo.enDias === 0 && <b style={{ color: color.warningInk }}>Ya le tocaba comprar. </b>}
            Compra cada {ritmo.cadaDias} {ritmo.cadaDias === 1 ? 'día' : 'días'} · última compra hace{' '}
            {ritmo.desdeUltima === 0 ? 'nada' : ritmo.desdeUltima === 1 ? '1 día' : `${ritmo.desdeUltima} días`}
          </>
        ) : (
          'En cuántos días volver a hablarle'
        )}
      </div>
    </div>
  )
}

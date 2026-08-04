/**
 * `− 3 +`: una cantidad chica que se sube y se baja tocando, no tipeando.
 *
 * Nació dentro de la grilla de entregables de Canjes y salió al kit cuando Bruno pidió el mismo
 * control para la cantidad de productos: **es el mismo gesto y tiene que ser el mismo botón**. Es
 * para cantidades de un dígito o dos —cuántas historias, cuántas fundas—, donde tipear en un input
 * chico (y en el celular, abrir el teclado numérico) es más trabajo que tocar dos veces.
 *
 * ⚠️ **No reemplaza a `NumberField`**: ese es para plata y medidas, donde el número se escribe y un
 * campo vacío no es un cero. Acá siempre hay un número.
 *
 * El input del medio se queda: sirve para saltar de 1 a 12 sin doce clicks, y es lo que lee un
 * lector de pantalla.
 */
import { color, font, space } from '@/components/ui/tokens'

export type PasoCantidadProps = {
  valor: number
  onCambio: (n: number) => void
  /** El piso. `0` en lo que se puede no pedir, `1` en lo que existe porque tiene al menos uno. */
  min?: number
  /**
   * Qué se está contando, para los `aria-label`: "Menos historia", "Más historia". Sin esto los
   * tres controles de una fila son "−", "+" y un número sin nombre.
   */
  etiqueta: string
  /** El plural, para el `aria-label` del input ("Cuántas historias"). Cae al singular si falta. */
  etiquetaPlural?: string
  ancho?: number
  autoFocus?: boolean
}

export function PasoCantidad({
  valor, onCambio, min = 0, etiqueta, etiquetaPlural, ancho = 56, autoFocus,
}: PasoCantidadProps) {
  const n = Number(valor) || 0
  const enElPiso = n <= min
  const poner = (x: number) => onCambio(Math.max(min, x))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
      <button
        type="button"
        aria-label={`Menos ${etiqueta}`}
        onClick={() => poner(n - 1)}
        disabled={enElPiso}
        style={botonPaso(enElPiso)}
      >
        −
      </button>
      <input
        type="number"
        min={min}
        value={String(n)}
        onChange={(e) => poner(parseInt(e.target.value, 10) || min)}
        aria-label={`Cuántas ${etiquetaPlural || etiqueta}`}
        autoFocus={autoFocus}
        style={{
          width: ancho,
          textAlign: 'center',
          fontSize: font.md,
          padding: space[1],
          border: `1px solid ${color.line2}`,
          borderRadius: 6,
          background: color.surface,
          color: color.ink,
        }}
      />
      <button
        type="button"
        aria-label={`Más ${etiqueta}`}
        onClick={() => poner(n + 1)}
        style={botonPaso(false)}
      >
        +
      </button>
    </div>
  )
}

function botonPaso(deshabilitado: boolean): React.CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: 6,
    border: `1px solid ${color.line2}`,
    background: color.surface,
    color: deshabilitado ? color.mut2 : color.ink,
    fontSize: font.md,
    lineHeight: 1,
    cursor: deshabilitado ? 'default' : 'pointer',
  }
}

'use client'

/**
 * DatosGate — el trío cargando / error / vacío, en un solo lugar.
 *
 * Antes cada sección que consume el store del ETL escribía su propia versión con hex a
 * mano. El mismo bloque estaba copiado en 9 archivos (Resumen, Margenes, Talles, Colores,
 * ProductosTable, VariantesTable, VentasMensuales, FundasModelo, Proveedores) y lo
 * consumen 22 secciones:
 *
 *   if (error && !datos) return <div style={{ padding: 16, color: '#B91C1C' … }}>…
 *   if (!datos) return <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>
 *
 * Dos mejoras además de la unificación: el error ofrece **reintentar** (antes era un
 * cartel sin salida) y la espera muestra un **esqueleto de la pantalla** en vez de la
 * palabra "Cargando…", que en un tablero de datos se lee como que no hay nada.
 *
 * Uso:
 *   const { datos, error } = useDatosMonitor()
 *   return <DatosGate datos={datos} error={error}>{(d) => <Tabla datos={d} />}</DatosGate>
 */
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { color, font, space } from '@/components/ui/tokens'

export type DatosGateProps<T> = {
  datos: T | null | undefined
  error?: string | null
  /** Forma del esqueleto: qué se está por dibujar. */
  esqueleto?: 'tabla' | 'kpis' | 'tarjetas'
  /** Si la sección sabe recargar (ej. `cargar(marca, rol, true)`), el error ofrece el botón. */
  onReintentar?: () => void
  children: (datos: T) => React.ReactNode
}

export function DatosGate<T>({ datos, error, esqueleto = 'tabla', onReintentar, children }: DatosGateProps<T>) {
  if (error && !datos) {
    return (
      <Notice
        tone="danger"
        icon="⚠"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <span>
            No se pudieron cargar los datos: <b>{error}</b>
          </span>
          {onReintentar && (
            <Button size="sm" variant="outline" tone="danger" onClick={onReintentar}>
              Reintentar
            </Button>
          )}
        </div>
      </Notice>
    )
  }
  if (datos == null) return <Esqueleto forma={esqueleto} />
  return <>{children(datos)}</>
}

/** Esqueleto de carga: la forma de lo que viene, para que la espera no parezca vacío. */
export function Esqueleto({ forma = 'tabla', filas = 8 }: { forma?: 'tabla' | 'kpis' | 'tarjetas'; filas?: number }) {
  if (forma === 'kpis') {
    return (
      <div className="mo-kpis" aria-busy="true" aria-label="Cargando">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="mo-card" style={{ padding: space[4] }}>
            <div className="mo-skel" style={{ height: 10, width: '55%' }} />
            <div className="mo-skel" style={{ height: 20, width: '40%', marginTop: 10 }} />
          </div>
        ))}
      </div>
    )
  }
  if (forma === 'tarjetas') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: space[3] }} aria-busy="true" aria-label="Cargando">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="mo-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="mo-skel" style={{ height: 150, borderRadius: 0 }} />
            <div style={{ padding: space[3] }}>
              <div className="mo-skel" style={{ height: 10, width: '80%' }} />
              <div className="mo-skel" style={{ height: 10, width: '50%', marginTop: 8 }} />
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="mo-card" style={{ padding: 0, overflow: 'hidden' }} aria-busy="true" aria-label="Cargando">
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${color.line}`, background: color.bg2 }}>
        <div className="mo-skel" style={{ height: 9, width: 180 }} />
      </div>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: space[4], alignItems: 'center', padding: '0 12px', height: 'var(--mo-row-h)', borderBottom: i === filas - 1 ? undefined : `1px solid ${color.line}` }}>
          <div className="mo-skel" style={{ height: 9, flex: '1 1 40%', opacity: 1 - i * 0.07 }} />
          <div className="mo-skel" style={{ height: 9, flex: '1 1 15%', opacity: 1 - i * 0.07 }} />
          <div className="mo-skel" style={{ height: 9, flex: '1 1 15%', opacity: 1 - i * 0.07 }} />
        </div>
      ))}
    </div>
  )
}

/** Línea de progreso para operaciones largas contra GN ("3/40"), que antes era un span gris. */
export function ProgressInline({ hechos, total, label }: { hechos: number; total: number; label?: string }) {
  const pct = total ? Math.round((hechos / total) * 100) : 0
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], fontSize: font.sm, color: color.mut }}>
      <span style={{ width: 90, height: 5, background: color.bg2, borderRadius: 999, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color.brandSolid, transition: 'width .2s ease' }} />
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: color.ink2, fontWeight: 600 }}>
        {hechos}/{total}
      </span>
      {label && <span>{label}</span>}
    </span>
  )
}

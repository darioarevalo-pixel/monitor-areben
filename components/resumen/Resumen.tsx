'use client'

import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { useMonitorStore } from '@/store/useMonitorStore'
import { userRole } from '@/lib/permisos'
import { computarKpis, estadoSync, fmtFechaVenta } from '@/lib/resumen'

/**
 * "📈 Resumen / KPIs" (key `resumen`, BDI + Zattia) en Next.
 *
 * Port del panel `#stats-overview` (index.html:373) + la línea de sincronización
 * (renderSyncInfo, 2193). Read-only puro sobre el store del ETL — primer paso de
 * la Tanda A (analítica). Toda la data ya la computa `computarDatos`; acá solo se
 * renderiza y se ofrece el refresco.
 */
export function Resumen() {
  const { perfil, marca } = useSesion()
  const { datos, estado, error } = useDatosMonitor()
  const cargar = useMonitorStore((s) => s.cargar)

  if (error && !datos) {
    return <div style={{ padding: 16, color: '#B91C1C', fontSize: 13 }}>No se pudieron cargar los datos: {error}</div>
  }
  if (!datos) return <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>

  const kpis = computarKpis(datos)
  const sync = estadoSync(datos.syncMeta, new Date())
  const ventaReciente = fmtFechaVenta(datos.maxVentaDate)
  const refrescando = estado === 'cargando'

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
          fontSize: 13,
          color: '#374151',
        }}
      >
        <div id="sync-info">
          {sync.tipo === 'ok' ? (
            <>
              {sync.dot} Última sincronización: <strong>{sync.fecha}</strong> ({sync.hace}){sync.nota}
              {ventaReciente ? (
                <>
                  {'  ·  '}Venta más reciente cargada: <strong>{ventaReciente}</strong>
                </>
              ) : null}
            </>
          ) : sync.tipo === 'fallando' ? (
            <>🔴 ⚠️ El sync está fallando — no hay ninguna corrida exitosa reciente</>
          ) : (
            <>⚪ No pude leer el estado del sync</>
          )}
        </div>
        <button
          className="btn-sm"
          onClick={() => cargar(marca, userRole(perfil), true)}
          disabled={refrescando}
          title="Trae los datos más nuevos de Supabase"
          style={{ background: '#fff', border: '1px solid #D1D5DB', marginLeft: 'auto' }}
        >
          {refrescando ? '⏳ Actualizando…' : '🔄 Actualizar datos'}
        </button>
      </div>

      <div className="stats-grid">
        <Stat label="Productos" value={kpis.productos} />
        <Stat label="Sin ventas +30d" value={kpis.sinVenta30} mod="danger" />
        <Stat label="En declive" value={kpis.declive} mod="warning" />
        <Stat label="Creciendo" value={kpis.crecimiento} mod="success" />
        <Stat label="Variantes analizadas" value={kpis.variantes} mod="info" />
      </div>
    </div>
  )
}

function Stat({ label, value, mod }: { label: string; value: number; mod?: 'danger' | 'warning' | 'success' | 'info' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${mod ? ' ' + mod : ''}`}>{value.toLocaleString('es-AR')}</div>
    </div>
  )
}

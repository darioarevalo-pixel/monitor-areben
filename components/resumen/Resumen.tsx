'use client'

import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { useMonitorStore } from '@/store/useMonitorStore'
import { userRole } from '@/lib/permisos'
import { computarKpis, estadoSync, fmtFechaVenta } from '@/lib/resumen'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Button, DatosGate, KpiCard, Notice, color, font, space } from '@/components/ui'

/**
 * "📈 Resumen / KPIs" (key `resumen`, BDI + Zattia).
 *
 * Read-only sobre el store del ETL: toda la data la computa `computarDatos`, acá solo se
 * renderiza y se ofrece el refresco.
 *
 * Rediseño jul-2026 (patrón Tablero): el refresco pasó al header de la sección —el lugar
 * fijo de la acción de cada pantalla— y el estado del sync, que era una línea de texto
 * suelta arriba de todo, pasó a leerse como lo que es: un aviso, con el tono según esté
 * bien, atrasado o fallando. Antes un sync CAÍDO se anunciaba en el mismo gris que uno
 * sano.
 */
export function Resumen() {
  const { perfil, marca } = useSesion()
  const { datos, estado, error, progreso, origen } = useDatosMonitor()
  const cargar = useMonitorStore((s) => s.cargar)
  const refrescar = () => cargar(marca, userRole(perfil), true)
  const refrescando = estado === 'cargando'

  return (
    <>
      <HeaderAcciones>
        <Button variant="outline" onClick={refrescar} loading={refrescando} title="Trae los datos más nuevos de Supabase">
          {refrescando ? 'Actualizando…' : '🔄 Actualizar datos'}
        </Button>
      </HeaderAcciones>

      <DatosGate datos={datos} error={error} progreso={progreso} origen={origen} esqueleto="kpis" onReintentar={refrescar}>
        {(d) => {
          const kpis = computarKpis(d)
          const sync = estadoSync(d.syncMeta, new Date())
          const ventaReciente = fmtFechaVenta(d.maxVentaDate)

          return (
            <>
              <Notice tone={sync.tipo === 'ok' ? 'neutral' : sync.tipo === 'fallando' ? 'danger' : 'warning'} icon={sync.tipo === 'ok' ? '🕒' : '⚠'} style={{ marginBottom: space[4] }}>
                {sync.tipo === 'ok' ? (
                  <>
                    Última sincronización: <strong>{sync.fecha}</strong> ({sync.hace}){sync.nota}
                    {ventaReciente && (
                      <span style={{ color: color.mut }}>
                        {' · '}Venta más reciente cargada: <strong style={{ color: color.ink2 }}>{ventaReciente}</strong>
                      </span>
                    )}
                  </>
                ) : sync.tipo === 'fallando' ? (
                  <>El sync está fallando — no hay ninguna corrida exitosa reciente. Los números de abajo son viejos.</>
                ) : (
                  <>No pude leer el estado del sync, así que no sé qué tan actuales son estos números.</>
                )}
              </Notice>

              <div className="mo-kpis">
                <KpiCard label="Productos" value={kpis.productos.toLocaleString('es-AR')} />
                <KpiCard label="Sin ventas +30d" value={kpis.sinVenta30.toLocaleString('es-AR')} tone="danger" sub="No se vendió ni una unidad en 30 días" />
                <KpiCard label="En declive" value={kpis.declive.toLocaleString('es-AR')} tone="warning" sub="Venden menos que el período anterior" />
                <KpiCard label="Creciendo" value={kpis.crecimiento.toLocaleString('es-AR')} tone="success" />
                <KpiCard label="Variantes analizadas" value={kpis.variantes.toLocaleString('es-AR')} />
              </div>

              <p style={{ fontSize: font.sm, color: color.mut2, marginTop: space[3] }}>
                Los KPI salen del último sync, no de Gestión Nube en vivo.
              </p>
            </>
          )
        }}
      </DatosGate>
    </>
  )
}

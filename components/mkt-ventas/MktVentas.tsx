'use client'

/**
 * Ventas (key `mkt-ventas`, área Marketing) — el objetivo del sector y el contador diario.
 *
 * # Por qué existe
 *
 * Marketing no veía **una sola pantalla de ventas**: su función hereda las áreas `marketing` y
 * `meta`, y todo el análisis de venta es de Dirección. Las campañas se arman sobre ese dato.
 *
 * # Las decisiones
 *
 * 1. **Sección propia y no un bloque arriba de `marketing`.** Esa pantalla es la auditoría de
 *    fichas de TiendaNube —fotos, descripciones, tabla de talles— y sus cinco KPI **son filtros**
 *    de su tabla. Un objetivo de venta arriba habría sido un sexto número que no filtra nada.
 * 2. 🔴 **El contador dice CUÁNDO se leyó, siempre.** El espejo lo llena `sync-diario.yml` a las 6
 *    UTC (3 de la mañana acá) y no hay otro reloj: a las 17:00 de un martes el día de hoy tiene lo
 *    que había a las 4 de la mañana. Sin la línea de la última lectura, un sync muerto se ve
 *    exactamente igual que un día flojo.
 * 3. **La barra mide el escalón vigente de la rampa y el título dice el techo** — el porqué está
 *    en `Objetivo.tsx`.
 */

import { useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useMonitorStore } from '@/store/useMonitorStore'
import { HeaderAcciones } from '@/components/layout/acciones'
import { userRole } from '@/lib/permisos'
import { estadoSync, fmtFechaVenta } from '@/lib/resumen'
import { hoyIso, sumarDias } from '@/lib/fechas/dia'
import { escalonVigente, serieDiaria, techoDeLaRampa } from '@/lib/mkt-ventas/core'
import { Button, DatosGate, Notice, color, font, space } from '@/components/ui'
import { useMetas } from './useMetas'
import { Objetivo } from './Objetivo'
import { ContadorDiario } from './ContadorDiario'

/**
 * Cuántos días de serie se arman. Es el techo de historia de un usuario que no es admin
 * (`desdeVentas`, `lib/datos.ts`) menos un día de gracia: pedir más devolvería días en cero que
 * no son cero, son «no bajó».
 */
const DIAS_DE_SERIE = 34

export function MktVentas() {
  const { perfil, marca } = useSesion()
  const { datos, error, progreso, origen, estado } = useDatosMonitor()
  const { metas, error: errorMetas } = useMetas(marca)
  const cargar = useMonitorStore((s) => s.cargar)
  const refrescar = () => cargar(marca, userRole(perfil), true)
  const refrescando = estado === 'cargando'

  const hoy = useMemo(() => hoyIso(), [])
  const [offset, setOffset] = useState(0)
  const fecha = sumarDias(hoy, offset)

  return (
    <>
      <HeaderAcciones>
        <Button variant="outline" onClick={refrescar} loading={refrescando} title="Vuelve a bajar el espejo de Supabase">
          {refrescando ? 'Actualizando…' : 'Actualizar datos'}
        </Button>
      </HeaderAcciones>

      <DatosGate datos={datos} error={error} progreso={progreso} origen={origen} esqueleto="kpis" onReintentar={refrescar}>
        {(d) => {
          const serie = serieDiaria(d.ventas, d.detalles, 'online', hoy, DIAS_DE_SERIE)
          const dia = serie.find((x) => x.fecha === fecha) ?? null
          const escalon = metas ? escalonVigente(metas, hoy) : null
          const techo = metas ? techoDeLaRampa(metas) : null
          const sync = estadoSync(d.syncMeta, new Date())
          const ventaReciente = fmtFechaVenta(d.maxVentaDate)

          return (
            <>
              {/* 🔑 Esta línea va SIEMPRE, con datos y sin datos. Es lo único que distingue «hoy
                  vendimos poco» de «el sync no corrió y el día está vacío porque nadie lo trajo». */}
              <Notice
                tone={sync.tipo === 'ok' ? 'neutral' : sync.tipo === 'fallando' ? 'danger' : 'warning'}
                icon={sync.tipo === 'ok' ? '🕒' : '⚠'}
                style={{ marginBottom: space[4] }}
              >
                {sync.tipo === 'ok' ? (
                  <>
                    Leído por última vez <strong>{sync.hace}</strong> ({sync.fecha}){sync.nota}
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

              {metas === null && !errorMetas ? null : errorMetas ? (
                <Notice tone="warning" icon="⚠" style={{ marginBottom: space[4] }}>
                  No pude leer los objetivos: <b>{errorMetas}</b>. El contador de abajo igual cuenta.
                </Notice>
              ) : (
                <Objetivo escalon={escalon} techo={techo} dia={dia} hoy={hoy} />
              )}

              <ContadorDiario
                dia={dia}
                fecha={fecha}
                hoy={hoy}
                tope={DIAS_DE_SERIE}
                puedeAtras={offset > -(DIAS_DE_SERIE - 1)}
                puedeAdelante={offset < 0}
                onMover={(n) => setOffset((o) => o + n)}
              />

              <p style={{ fontSize: font.sm, color: color.mut2 }}>
                Online son las ventas de Tienda Nube. El día lo decide tu computadora, y las ventas
                salen del espejo de Gestión Nube, no de la tienda en vivo.
              </p>
            </>
          )
        }}
      </DatosGate>
    </>
  )
}

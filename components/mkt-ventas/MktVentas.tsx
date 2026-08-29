'use client'

/**
 * Ventas (key `mkt-ventas`, área Marketing) — el objetivo del sector, el contador diario de ventas
 * online y cómo viene la venta en general.
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
 * 4. ⛔ **El resultado del sale NO va acá.** Llegó a estar y lo sacó Bruno mirándolo: *«esto en la
 *    vista marketing borralo, sólo sirve en análisis»*. Vive en Liquidación, que es donde se decide
 *    el precio. Con él se fue la quinta llave de `api/_liquidacion.js` —una puerta de permisos sin
 *    consumidor es peor que no tenerla— así que **volver a montarlo pide reabrirla**.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useMonitorStore } from '@/store/useMonitorStore'
import { HeaderAcciones } from '@/components/layout/acciones'
import { veVentasHistoricas } from '@/lib/permisos'
import { estadoSync, fmtFechaVenta, fmtHace } from '@/lib/resumen'
import { articuloDe } from '@/lib/cuentas'
import { hoyIso, sumarDias } from '@/lib/fechas/dia'
import { escalonVigente, losQueMasSalieron, resumenPorCanal, serieDiaria, techoDeLaRampa } from '@/lib/mkt-ventas/core'
import { Button, DatosGate, Notice, SelectorLinea, color, font, space, useToast } from '@/components/ui'
import { leerUltimaTraida, traerVentasDeHoy } from '@/lib/mkt-ventas/persistencia'
import { useMetas } from './useMetas'
import { Objetivo } from './Objetivo'
import { ContadorDiario } from './ContadorDiario'
import { VentaGeneral } from './VentaGeneral'

/**
 * Cuántos días de serie se arman. Es el techo de historia de un usuario que no es admin
 * (`desdeVentas`, `lib/datos.ts`) menos un día de gracia: pedir más devolvería días en cero que
 * no son cero, son «no bajó».
 */
const DIAS_DE_SERIE = 34

export function MktVentas() {
  const { perfil, marca } = useSesion()
  const { datos, error, progreso, origen, estado, linea, setLinea, lineas } = useDatosMonitor({ porLinea: true })
  // 🔴 Por LÍNEA: con la marca, la pestaña Stunned mostraba la rampa de Zattia con su rótulo.
  const { metas, error: errorMetas } = useMetas(linea)
  const cargar = useMonitorStore((s) => s.cargar)
  const refrescar = () => cargar(marca, veVentasHistoricas(perfil, marca), true)
  const refrescando = estado === 'cargando'

  // Cómo se llama lo que vende esta marca. ⛔ No se escribe «fundas» en ningún rótulo: en Zattia
  // eso habla del negocio de al lado.
  const articulo = articuloDe(marca)
  const hoy = useMemo(() => hoyIso(), [])
  const [offset, setOffset] = useState(0)
  const fecha = sumarDias(hoy, offset)
  const toast = useToast()
  const [trayendo, setTrayendo] = useState(false)
  /**
   * Cuándo se apretó el botón por última vez. Es un hecho DISTINTO del run del sync diario, y va al
   * lado y no en lugar: la línea de arriba dice cuándo corrió el reloj de la madrugada —y después
   * de apretar el botón **sigue teniendo razón**—, y ésta dice cuándo se trajeron las de hoy.
   */
  const [traidoEn, setTraidoEn] = useState<string | null>(null)
  const [diasGeneral, setDiasGeneral] = useState<7 | 30>(30)

  useEffect(() => {
    let vivo = true
    leerUltimaTraida(marca).then((t) => vivo && setTraidoEn(t))
    return () => {
      vivo = false
    }
  }, [marca])

  /**
   * 🔑 **Son DOS pasos y los dos hacen falta.** El primero le pide a Gestión Nube las ventas de hoy
   * y las escribe en el espejo; el segundo vuelve a bajar el ETL, porque **lo que dibuja el contador
   * está en IndexedDB, no en el espejo**. Sin el segundo, el botón escribiría en la base y la
   * pantalla no se movería — que se lee como «no anduvo».
   *
   * ⚠️ El segundo cuesta ~20 s (son ~14,7 MB por marca) y por eso el botón dice lo que va a hacer.
   */
  const traerHoy = async () => {
    setTrayendo(true)
    try {
      const t = await traerVentasDeHoy(marca)
      setTraidoEn(t.traidoEn)
      if (t.salteado) toast.info('Las ventas de hoy ya se trajeron hace menos de un minuto.')
      else toast.ok(`Gestión Nube devolvió ${t.ventas} venta${t.ventas === 1 ? '' : 's'}. Actualizando la pantalla…`)
      await cargar(marca, veVentasHistoricas(perfil, marca), true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setTrayendo(false)
    }
  }

  return (
    <>
      <HeaderAcciones>
        <Button variant="outline" onClick={refrescar} loading={refrescando} title="Vuelve a bajar el espejo de Supabase">
          {refrescando ? 'Actualizando…' : 'Actualizar datos'}
        </Button>
        <Button onClick={traerHoy} loading={trayendo} title="Le pide a Gestión Nube las ventas de hoy, las guarda y vuelve a bajar los datos (tarda ~20 s)">
          {trayendo ? 'Trayendo…' : 'Traer las ventas de hoy'}
        </Button>
      </HeaderAcciones>

      <SelectorLinea linea={linea} lineas={lineas} onChange={setLinea} />
      <DatosGate datos={datos} error={error} progreso={progreso} origen={origen} esqueleto="kpis" onReintentar={refrescar}>
        {(d) => {
          // Un solo reloj para TODA la pantalla: las dos mitades de la línea de arriba («hace 17 h»
          // y «traídas hace 3 min») serían dos instantes distintos con dos `new Date()`, y la
          // ventana de «cómo viene la venta» tiene que ser la misma que mira el ETL.
          const ahora = new Date()
          const serie = serieDiaria(d.ventas, d.detalles, 'online', hoy, DIAS_DE_SERIE)
          const porCanal = resumenPorCanal(d.ventas, d.detalles, ahora, diasGeneral)
          const top = losQueMasSalieron(d.allProductos, diasGeneral)
          const dia = serie.find((x) => x.fecha === fecha) ?? null
          const escalon = metas ? escalonVigente(metas, hoy) : null
          const techo = metas ? techoDeLaRampa(metas) : null
          const sync = estadoSync(d.syncMeta, ahora)
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
                  <>La sincronización está fallando — hace rato que no termina bien. Los números de abajo son viejos.</>
                ) : (
                  <>No pude leer el estado de la sincronización, así que no sé qué tan actuales son estos números.</>
                )}
                {traidoEn && (
                  <span style={{ color: color.mut }}>
                    {' · '}Las de hoy, traídas a mano{' '}
                    <strong style={{ color: color.ink2 }}>{fmtHace(ahora.getTime() - Date.parse(traidoEn))}</strong>
                  </span>
                )}
              </Notice>

              {metas === null && !errorMetas ? null : errorMetas ? (
                <Notice tone="warning" icon="⚠" style={{ marginBottom: space[4] }}>
                  No pude leer los objetivos: <b>{errorMetas}</b>. El contador de abajo igual cuenta.
                </Notice>
              ) : (
                <Objetivo escalon={escalon} techo={techo} dia={dia} hoy={hoy} articulo={articulo} />
              )}

              <ContadorDiario
                dia={dia}
                fecha={fecha}
                hoy={hoy}
                tope={DIAS_DE_SERIE}
                articulo={articulo}
                puedeAtras={offset > -(DIAS_DE_SERIE - 1)}
                puedeAdelante={offset < 0}
                onMover={(n) => setOffset((o) => o + n)}
              />

              <p style={{ fontSize: font.sm, color: color.mut2, marginBottom: space[6] }}>
                Online son las ventas de Tienda Nube. El día lo decide tu computadora, y las ventas
                salen del espejo de Gestión Nube, no de la tienda en vivo.
              </p>

              <VentaGeneral porCanal={porCanal} top={top} dias={diasGeneral} onDias={setDiasGeneral} articulo={articulo} />

            </>
          )
        }}
      </DatosGate>
    </>
  )
}

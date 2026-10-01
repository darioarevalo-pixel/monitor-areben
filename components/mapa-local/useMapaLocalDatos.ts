'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { bajarExhib, type CrudosExhib } from '@/lib/exhib/datos'
import { armarProdMap, construirItems } from '@/lib/exhib/core'
import { hoyIso } from '@/lib/fechas/dia'
import { actividadDelEtl, prendasDelLocal } from '@/lib/mapa-local/core'
import { leerMapa } from '@/lib/mapa-local/cliente'
import type { MapaLocal, Prenda } from '@/lib/mapa-local/tipos'

export type Guardado = { mapa: MapaLocal; en: string | null; por: string | null }

/**
 * El día y las ventas del ETL hechas `Actividad`. 🔑 **Lo usan el mapa Y el control del lector**
 * (`ExhibLibre`): si el control ordenara distinto que la hoja del módulo, diría «falta» de una prenda
 * que la hoja manda al depósito. Sin ETL todavía, `actividad` es `null` (todas en «vende»).
 */
export function useActividad() {
  const { datos } = useDatosMonitor()
  // El día se fija al abrir: la regla de temporada ⛔ no cambia a mitad de una pantalla abierta.
  const hoy = useMemo(() => hoyIso(), [])
  const actividad = useMemo(() => (datos ? actividadDelEtl(datos.allVariantes, datos.allProductos, hoy) : null), [datos, hoy])
  return { datos, hoy, actividad }
}

/**
 * Lo que leen las dos vistas del Mapa del local («Percheros» y «Qué se cuelga»): el mapa guardado,
 * el stock del Local y las ventas del ETL, ya hechos prendas.
 *
 * 🔑 **Una sola carga para las dos vistas**, así ⛔ no pueden dar números distintos: las prendas, su
 * tramo y el día salen de acá. Cada vista arma su ubicación con `ubicar`.
 *
 * `guardado` es `null` mientras carga; con la tabla vacía trae el `inicial` y `en: null`.
 */
export function useMapaLocalDatos(inicial: MapaLocal) {
  const { marca } = useSesion()
  const { datos, hoy, actividad } = useActividad()
  const productos = useMemo(() => datos?.allProductos ?? [], [datos])

  const [crudos, setCrudos] = useState<CrudosExhib>({ inv: [], tnProducts: [] })
  const [guardado, setGuardado] = useState<Guardado | null>(null)
  // El mapa que estaba guardado al abrir: el «antes» de «Mover». `null` = nadie guardó ninguno.
  const [base, setBase] = useState<MapaLocal | null>(null)
  const [editar, setEditar] = useState(false)
  const [sinTabla, setSinTabla] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (marca !== 'zattia') return
    let vivo = true
    void (async () => {
      try {
        const [m, c] = await Promise.all([leerMapa(), bajarExhib('zattia')])
        if (!vivo) return
        setGuardado({ mapa: m.mapa || inicial, en: m.actualizadoEn, por: m.actualizadoPor })
        setBase(m.mapa)
        setEditar(m.puede.editar)
        setSinTabla(m.sinTabla)
        setCrudos(c)
      } catch (e) {
        if (vivo) setError((e as Error).message)
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, inicial])

  // El cruce GN ↔ TN se recalcula cuando llega el ETL, que es después de montar (ver `useExhib`).
  const prodMap = useMemo(() => armarProdMap(productos, crudos.tnProducts), [productos, crudos.tnProducts])
  const prendas: Prenda[] = useMemo(() => prendasDelLocal(construirItems(crudos.inv, prodMap, {}), 'zattia', actividad), [crudos.inv, prodMap, actividad])

  return {
    marca,
    hoy,
    crudos,
    prendas,
    /** El ETL todavía ⛔ no llegó: ninguna prenda sabe sus ventas ni si está en sale. */
    sinEtl: !datos,
    sinCruzarTn: productos.length === 0 && crudos.inv.length > 0,
    guardado,
    setGuardado,
    base,
    editar,
    sinTabla,
    cargando,
    error,
  }
}

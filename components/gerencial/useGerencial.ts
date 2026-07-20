'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { CUENTAS } from '@/lib/cuentas'
import { esAdmin, puedeVer, userRole, type Perfil } from '@/lib/permisos'
import { leerCache, mapaColorManual } from '@/lib/cache'
import { traerDatos } from '@/lib/datos'
import { computarDatos } from '@/lib/etl/computar'
import { leerIngresos, leerLista } from '@/lib/kv/cliente'
import type { Marca } from '@/lib/nav.generated'
import type { DatosETL } from '@/lib/etl/tipos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import type { Ingreso } from '@/lib/ingresos/tipos'
import { detectarDeMarca, type DatosMarca } from '@/lib/gerencial/agregar'
import { ordenar, type Accionable } from '@/lib/gerencial/tipos'
import { UMBRALES } from '@/lib/gerencial/umbrales'

/**
 * Marcas para las que este usuario puede ver el panel gerencial (respeta la cuenta
 * fija). Mismo criterio que `marcasVisibles` de Inicio, pero gateado por el permiso
 * `gerencial` en vez de `sesion-fotos`.
 */
export function marcasGerenciales(perfil: Perfil | null): Marca[] {
  if (!perfil) return []
  const todas = perfil.cuenta ? [perfil.cuenta] : (Object.keys(CUENTAS) as Marca[])
  return todas.filter((m) => esAdmin(perfil) || puedeVer(perfil, m, 'gerencial'))
}

/**
 * ETL de una marca sin pasar por el store (que solo publica una marca a la vez):
 * caché de localStorage aunque esté vencido —la misma que ya usa el equipo— y, si no
 * hay, la red. Mismo cómputo que el store (`computarDatos` + `mapaColorManual`).
 */
async function cargarETL(marca: Marca, rol: 'admin' | 'marketing', today: Date): Promise<DatosETL> {
  const cache = leerCache(marca, true)
  const payload = cache?.data ?? (await traerDatos({ marca, rol, today }))
  return computarDatos(payload, { today, colorManualMap: mapaColorManual(payload.colorManual) })
}

/** Carga todo lo de una marca, tolerando que falle cada fuente por separado. */
async function cargarMarca(marca: Marca, rol: 'admin' | 'marketing', today: Date): Promise<DatosMarca> {
  const errores: string[] = []
  const [etlR, fotosR, internasR, ingresosR] = await Promise.allSettled([
    cargarETL(marca, rol, today),
    leerLista<Solicitud>('sesionfotos', marca),
    leerLista<SolicitudInterna>('solicitudesinternas', marca),
    leerIngresos<Ingreso>(marca),
  ])

  const etl = etlR.status === 'fulfilled' ? etlR.value : null
  if (etlR.status === 'rejected') errores.push('no se pudieron cargar ventas/stock')

  const fotos = fotosR.status === 'fulfilled' && fotosR.value.ok ? fotosR.value.dato : []
  const internas = internasR.status === 'fulfilled' && internasR.value.ok ? internasR.value.dato : []
  const ingresos = ingresosR.status === 'fulfilled' && ingresosR.value.ok ? ingresosR.value.dato : []

  return { marca, etl, fotos, internas, ingresos, errores }
}

export type EstadoGerencial = {
  accionables: Accionable[]
  cargando: boolean
  errores: string[]
  recargar: () => void
}

/**
 * Carga en paralelo las marcas visibles, corre los detectores y devuelve los
 * accionables ordenados por severidad. Una fuente/marca que falla no tumba el panel:
 * aporta lo que pudo y suma un aviso a `errores`.
 */
export function useGerencial(): EstadoGerencial {
  const { perfil } = useSesion()
  const [accionables, setAccionables] = useState<Accionable[]>([])
  const [errores, setErrores] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [nonce, setNonce] = useState(0)

  const recargar = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let vivo = true
    // Todo el setState va dentro del IIFE async (no en el cuerpo del effect) para no
    // disparar renders en cascada — mismo patrón que Inicio.
    void (async () => {
      const marcas = marcasGerenciales(perfil)
      if (!marcas.length) {
        if (vivo) {
          setAccionables([])
          setErrores([])
          setCargando(false)
        }
        return
      }
      if (vivo) setCargando(true)
      const rol = userRole(perfil)
      const today = new Date()
      const datos = await Promise.all(marcas.map((m) => cargarMarca(m, rol, today)))
      if (!vivo) return
      setAccionables(ordenar(datos.flatMap((d) => detectarDeMarca(d, UMBRALES, today))))
      setErrores(datos.flatMap((d) => d.errores.map((e) => `${d.marca.toUpperCase()}: ${e}`)))
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [perfil, nonce])

  return { accionables, cargando, errores, recargar }
}

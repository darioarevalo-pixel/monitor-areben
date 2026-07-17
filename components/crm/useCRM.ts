'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { guardarMapa, leerMapa } from '@/lib/kv/cliente'
import { traerClientes, traerVentas, type ModoCanal } from '@/lib/crm/datos'
import { calcularAgregado } from '@/lib/crm/core'
import type { Agregado, FilaCliente, FilaVenta, MapaSeguimiento, MapaTelefonos } from '@/lib/crm/tipos'

/**
 * Carga y edición del CRM. Port de cargarCRM (index.html:13188) + las escrituras
 * de seguimiento y teléfonos (`crmSeg…` / `crmTel…`, 13437-13580).
 *
 * Tres trampas que este hook existe para no pisar:
 *
 * 1. **El orden KV → ventas no es negociable.** La marca `es_mayorista` sale de
 *    `crmSeg`, y con ella se arma la consulta de ventas. Un `Promise.all` "de
 *    sentido común" hace desaparecer a los 274 clientes ★ **en silencio**.
 *
 * 2. **`renderCRM` reentra en `cargarCRM`.** Acá el corte es un ref que marca la
 *    carga en curso.
 *
 * 3. **`cargado` viaja hacia afuera.** Sin él en `true`, ningún guardado sale:
 *    es lo que evita que un POST del mapa entero borre los 305 clientes cuando el
 *    GET falló y `crmSeg` quedó en `{}`.
 *
 * El agregado se recomputa reactivamente sobre las ventas ya cargadas cada vez
 * que cambia `crmSeg` — igual que el legacy re-corría calcularAgregadoCRM tras
 * cada escritura, sin volver a bajar las 27k ventas.
 */

export type EstadoCRM = {
  cargando: boolean
  error: string | null
  agregado: Agregado
  crmSeg: MapaSeguimiento
  crmTelOverride: MapaTelefonos
  /** ¿Se pudo leer el KV? Sin esto en true, ningún guardado puede salir. */
  cargado: boolean
  recargar: () => void
  /** Persiste un mapa de seguimiento nuevo (optimista + POST del mapa entero). */
  guardarSeg: (nuevo: MapaSeguimiento) => Promise<boolean>
  /** Persiste un mapa de teléfonos nuevo. */
  guardarTel: (nuevo: MapaTelefonos) => Promise<boolean>
}

const VACIO: Agregado = { activos: [], descartados: [] }

export function useCRM(modo: ModoCanal): EstadoCRM {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ventas, setVentas] = useState<FilaVenta[]>([])
  const [clientes, setClientes] = useState<Record<number, FilaCliente>>({})
  const [crmSeg, setCrmSeg] = useState<MapaSeguimiento>({})
  const [crmTelOverride, setCrmTelOverride] = useState<MapaTelefonos>({})
  const [cargado, setCargado] = useState(false)
  const [tick, setTick] = useState(0)

  // TODAY del legacy (index.html:1914): congelado al montar. Los cortes de días
  // del agregado lo usan; las escrituras (hoyISO) usan el día real, aparte.
  const [today] = useState(() => new Date())

  const enCurso = useRef(false)
  const recargar = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (enCurso.current) return
    enCurso.current = true
    let vivo = true

    ;(async () => {
      setCargando(true)
      setError(null)
      try {
        // 1. El KV PRIMERO, siempre. Ver la trampa 1.
        const [seg, tel] = await Promise.all([
          leerMapa<MapaSeguimiento[string]>('crmseg', 'bdi'),
          leerMapa<string>('crmtel', 'bdi'),
        ])
        if (!vivo) return

        const okKv = seg.ok && tel.ok
        const mapaSeg = seg.ok ? seg.dato : {}
        const mapaTel = tel.ok ? tel.dato : {}
        setCrmSeg(mapaSeg)
        setCrmTelOverride(mapaTel)
        setCargado(okKv)

        // 2. Recién ahora las ventas: la consulta depende de es_mayorista.
        const vts = await traerVentas(modo, mapaSeg)
        if (!vivo) return
        const cli = await traerClientes(vts)
        if (!vivo) return

        setVentas(vts)
        setClientes(cli)

        if (!okKv) {
          setError(
            'No se pudo leer el seguimiento del CRM desde el KV. La lista puede verse incompleta y los guardados están bloqueados para no borrar lo que hay.',
          )
        }
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (vivo) setCargando(false)
        enCurso.current = false
      }
    })()

    return () => {
      vivo = false
    }
  }, [modo, tick])

  // El agregado se recalcula solo cuando cambian las ventas cargadas o crmSeg.
  const agregado = useMemo(
    () =>
      ventas.length || Object.keys(clientes).length
        ? calcularAgregado({ ventas, clientes, crmSeg, crmTelOverride, today })
        : VACIO,
    [ventas, clientes, crmSeg, crmTelOverride, today],
  )

  const guardarSeg = useCallback(
    async (nuevo: MapaSeguimiento): Promise<boolean> => {
      setCrmSeg(nuevo) // optimista, como el legacy (renderCRM antes del POST)
      const r = await guardarMapa({ kind: 'crmseg', store: 'bdi', mapa: nuevo, cargado })
      if (!r.ok) alert('No se pudo guardar el seguimiento: ' + r.motivo)
      return r.ok
    },
    [cargado],
  )

  const guardarTel = useCallback(
    async (nuevo: MapaTelefonos): Promise<boolean> => {
      setCrmTelOverride(nuevo)
      const r = await guardarMapa({ kind: 'crmtel', store: 'bdi', mapa: nuevo, cargado })
      if (!r.ok) alert('No se pudieron guardar los teléfonos: ' + r.motivo)
      return r.ok
    },
    [cargado],
  )

  return { cargando, error, agregado, crmSeg, crmTelOverride, cargado, recargar, guardarSeg, guardarTel }
}

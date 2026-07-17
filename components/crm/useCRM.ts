'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { leerMapa } from '@/lib/kv/cliente'
import { traerClientes, traerVentas, type ModoCanal } from '@/lib/crm/datos'
import { calcularAgregado } from '@/lib/crm/core'
import type { Agregado, FilaCliente, MapaSeguimiento, MapaTelefonos } from '@/lib/crm/tipos'

/**
 * Carga del CRM. Port de cargarCRM (index.html:13188-13260).
 *
 * Tres trampas que este hook existe para no pisar:
 *
 * 1. **El orden KV → ventas no es negociable.** La marca `es_mayorista` sale de
 *    `crmSeg`, y con ella se arma la consulta de ventas. Un `Promise.all` "de
 *    sentido común" hace desaparecer a los 274 clientes ★ **en silencio**.
 *
 * 2. **`renderCRM` reentra en `cargarCRM`** (13646). En el legacy el corte es el
 *    early-return de `crmCargadoCuenta`; en un `useEffect` eso sería un loop de
 *    fetch. Acá el corte es explícito: un ref que marca la carga en curso.
 *
 * 3. **`cargado` viaja hacia afuera.** Es lo que habilita o bloquea los guardados
 *    (ver lib/kv/cliente.ts). Si el KV no se pudo leer, la lista se ve vacía —
 *    igual que hoy — pero además no se puede guardar encima.
 */

export type EstadoCRM = {
  cargando: boolean
  error: string | null
  agregado: Agregado
  crmSeg: MapaSeguimiento
  crmTelOverride: MapaTelefonos
  clientes: Record<number, FilaCliente>
  /** ¿Se pudo leer el KV? Sin esto en true, ningún guardado puede salir. */
  cargado: boolean
  recargar: () => void
}

const VACIO: Agregado = { activos: [], descartados: [] }

export function useCRM(modo: ModoCanal): EstadoCRM {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agregado, setAgregado] = useState<Agregado>(VACIO)
  const [crmSeg, setCrmSeg] = useState<MapaSeguimiento>({})
  const [crmTelOverride, setCrmTelOverride] = useState<MapaTelefonos>({})
  const [clientes, setClientes] = useState<Record<number, FilaCliente>>({})
  const [cargado, setCargado] = useState(false)
  const [tick, setTick] = useState(0)

  // El corte de la reentrada: si ya hay una carga en curso, no se dispara otra.
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
        const ventas = await traerVentas(modo, mapaSeg)
        if (!vivo) return
        const cli = await traerClientes(ventas)
        if (!vivo) return

        setClientes(cli)
        setAgregado(calcularAgregado({ ventas, clientes: cli, crmSeg: mapaSeg, crmTelOverride: mapaTel, today: new Date() }))

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

  return { cargando, error, agregado, crmSeg, crmTelOverride, clientes, cargado, recargar }
}

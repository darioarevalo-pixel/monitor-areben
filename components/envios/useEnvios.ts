'use client'

/**
 * El estado de la hoja del cadete: qué día se está mirando y qué hay cargado ese día.
 *
 * La lectura es de la fecha entera (los dos turnos), y el turno se elige en la pantalla: son ~2
 * envíos por día, así que traer el día completo es más barato que dos viajes, y cambiar de turno
 * no tiene que esperar a la red.
 */

import { useCallback, useEffect, useState } from 'react'
import { hoyIso, sumarDias } from '@/lib/calendario'
import { leerDia, leerOrdenesTN, leerPendientes } from '@/lib/envios/cliente'
import { ordenAEnvio, vaAlReparto, vaPorCorreo } from '@/lib/envios/core'
import { apiFetch } from '@/lib/api-fetch'
import type { CierreTurno, Envio, Turno } from '@/lib/envios/tipos'
import type { Marca } from '@/lib/nav'

const MARCAS: Marca[] = ['bdi', 'zattia']

/**
 * Cuántos días para atrás se piden al traer de Tienda Nube.
 *
 * No es "hoy" porque nadie garantiza que alguien haya apretado el botón ayer, y una orden que no se
 * trajo el día que entró no la trae nadie después: quedaría fuera del sistema sin que se note. Traer
 * de más es gratis —la dedup por `(marca, nº de orden)` no deja repetir— pero traer un rango largo
 * no: el detalle pide una orden por vez y Tienda Nube corta por rate limit. Tres días es lo que
 * cubre un fin de semana sin acercarse a ese techo.
 */
const DIAS_PARA_ATRAS = 3

export type EstadoEnvios = {
  fecha: string
  setFecha: (f: string) => void
  turno: Turno
  setTurno: (t: Turno) => void
  envios: Envio[]
  /** Los cotizados que todavía no tienen día. Es la otra pestaña. */
  pendientes: Envio[]
  cierres: CierreTurno[]
  cargando: boolean
  error: string | null
  recargar: () => Promise<void>
  traerDeTiendaNube: () => Promise<{ agregados: number; ya_estaban: number; sinDireccion: number; porCorreo: number }>
}

export function useEnvios(): EstadoEnvios {
  // 🔴 El día sale del NAVEGADOR, no del servidor. El servidor corre en UTC y a las 21:00 de
  // Argentina ya devuelve mañana: la hoja se vaciaría sola en el medio del turno tarde.
  const [fecha, setFecha] = useState<string>(() => hoyIso())
  const [turno, setTurno] = useState<Turno>('mañana')
  const [envios, setEnvios] = useState<Envio[]>([])
  const [pendientes, setPendientes] = useState<Envio[]>([])
  const [cierres, setCierres] = useState<CierreTurno[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tick, setTick] = useState(0)

  /**
   * Volver a pedir el día. Mueve un contador en vez de traer los datos acá: el `useEffect` de abajo
   * es el único que escribe el estado, así que no hay dos caminos que puedan dejar la pantalla
   * distinta según por cuál se llegó. Además la carga vive adentro de una IIFE con bandera `vivo`
   * —el patrón que ya usan Cupones y el resto—, porque llamar a `setState` derecho en el cuerpo de
   * un efecto encadena renders y el lint del repo lo rechaza.
   */
  const recargar = useCallback(async () => {
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      try {
        // Las dos listas en el mismo viaje: la pestaña de pendientes muestra su cuenta al lado del
        // nombre, así que si llegaran por separado el número aparecería tarde y cambiando solo.
        const [d, p] = await Promise.all([leerDia(fecha), leerPendientes()])
        if (!vivo) return
        setEnvios(d.envios)
        setCierres(d.cierres)
        setPendientes(p)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo leer el día.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    // Cambiar de día mientras el anterior está en vuelo no puede terminar pintando el viejo encima.
    return () => {
      vivo = false
    }
  }, [fecha, tick])

  /**
   * Trae las órdenes de las DOS tiendas a la **bandeja de pendientes**, no a un día.
   *
   * Las dos juntas y no la de la marca del header: la hoja del cadete no tiene marca. Si una tienda
   * falla, la otra entra igual y el error se cuenta — media hoja es mejor que ninguna, siempre que
   * se sepa que está a medias.
   *
   * 🔑 **Ninguna orden cae en un día.** El día del reparto lo confirma el cliente y no tiene por qué
   * ser el de la orden: mandarla directo a la fecha en que se compró es inventar una entrega que
   * nadie acordó. Entra a la bandeja, alguien le pone el precio del envío y de ahí se agenda.
   */
  const traerDeTiendaNube = useCallback(async () => {
    const candidatas: ReturnType<typeof ordenAEnvio>[] = []
    let sinDireccion = 0
    // Las que se dejan afuera porque las despacha el correo. Se cuentan y se dicen: sin el número,
    // "el día tenía 39 órdenes y en la hoja hay 16" parece que la pantalla perdió paquetes.
    let porCorreo = 0
    const fallos: string[] = []

    const hasta = hoyIso()
    const desde = sumarDias(hasta, -DIAS_PARA_ATRAS)

    for (const marca of MARCAS) {
      try {
        const { ordenes } = await leerOrdenesTN(marca, desde, hasta)
        for (const o of ordenes) {
          if (vaPorCorreo(o) && o.envio_tipo !== 'pickup' && !o.cancelada && o.estado_orden !== 'cancelled') porCorreo++
          if (!vaAlReparto(o)) continue
          const fila = ordenAEnvio(o, marca)
          // Una orden sin dirección igual entra: es un envío real que alguien tiene que completar a
          // mano. Esconderla haría que el paquete no salga y nadie sepa por qué.
          if (!o.envio_direccion || !o.envio_direccion.calle) sinDireccion++
          candidatas.push(fila)
        }
      } catch (e) {
        fallos.push(`${marca}: ${e instanceof Error ? e.message : 'no contestó'}`)
      }
    }

    if (!candidatas.length) {
      if (fallos.length) throw new Error(fallos.join(' · '))
      return { agregados: 0, ya_estaban: 0, sinDireccion: 0, porCorreo }
    }

    const r = await apiFetch('/api/datos?recurso=envios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recurso: 'envios', action: 'traer-tn', envios: candidatas }),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron traer las órdenes.')

    await recargar()
    if (fallos.length) throw new Error(`Se trajeron las que se pudieron. ${fallos.join(' · ')}`)
    return { agregados: d.agregados || 0, ya_estaban: d.ya_estaban || 0, sinDireccion, porCorreo }
  }, [recargar])

  return { fecha, setFecha, turno, setTurno, envios, pendientes, cierres, cargando, error, recargar, traerDeTiendaNube }
}

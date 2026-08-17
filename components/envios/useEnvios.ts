'use client'

/**
 * El estado de la hoja del cadete: qué día se está mirando y qué hay cargado ese día.
 *
 * Se pide **el día entero, con sus dos turnos**, y no un turno por vez: un día de reparto es un
 * día —el cadete es el mismo y la rendición es una—, así que partirlo obligaría a acordarse de
 * mirar dos pantallas para saber qué sale hoy.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { hoyIso, sumarDias } from '@/lib/calendario'
import { leerCuenta, leerDia, leerOrdenesTN, leerPendientes, leerZonas } from '@/lib/envios/cliente'
import { cuentaDelCadete, marcasATraer, ordenAEnvio, vaAlReparto, vaPorCorreo } from '@/lib/envios/core'
import { apiFetch } from '@/lib/api-fetch'
import type { CuentaCadete, Envio, Traida, ZonaDeReparto } from '@/lib/envios/tipos'

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
  envios: Envio[]
  /**
   * Los cotizados que todavía no tienen día, **sólo de la marca del header**.
   *
   * 🔑 Es la única lista de la pantalla que se filtra por marca, y va al revés que la hoja del día
   * a propósito: cotizar y acordar el día con la clienta lo hace el equipo de una marca, mirando su
   * tienda. El reparto, en cambio, es uno solo — el cadete sale con las dos en la misma mochila.
   */
  pendientes: Envio[]
  cargando: boolean
  error: string | null
  recargar: () => Promise<void>
  traerDeTiendaNube: () => Promise<Traida>
}

export function useEnvios(): EstadoEnvios {
  // 🔴 El día sale del NAVEGADOR, no del servidor. El servidor corre en UTC y a las 21:00 de
  // Argentina ya devuelve mañana: la hoja se vaciaría sola en el medio del turno tarde.
  const { marca: marcaActiva } = useSesion()
  const [fecha, setFecha] = useState<string>(() => hoyIso())
  const [envios, setEnvios] = useState<Envio[]>([])
  const [todosLosPendientes, setTodosLosPendientes] = useState<Envio[]>([])
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
        setTodosLosPendientes(p)
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
   * Trae las órdenes de **la marca del header** a la bandeja de pendientes, no a un día.
   *
   * 🔑 **Traía las dos y era desconcertante.** La hoja del día no tiene marca —el cadete lleva las
   * dos en la misma mochila—, pero la bandeja sí: cotizar y acordar el día lo hace el equipo de una
   * marca mirando su tienda. Con la traída cross-marca, apretar el botón parado en BDI contestaba
   * «5 nuevos» y no aparecía ninguno, porque los cinco eran de Zattia. El número decía la verdad y
   * la pantalla también; lo que no cerraba era que fueran dos preguntas distintas.
   *
   * La consecuencia, dicha: si nadie se para en Zattia, las de Zattia no entran. Es visible —la
   * bandeja de Zattia queda vacía— y era el precio de que el cartel signifique algo.
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
    // 🔴 Las que había en Tienda Nube y no vinieron. Se suman las dos tiendas: la hoja es una sola,
    // así que "faltan 12" es la pregunta, no de cuál de las dos faltan.
    let noLeidas = 0
    const fallos: string[] = []

    const hasta = hoyIso()
    const desde = sumarDias(hasta, -DIAS_PARA_ATRAS)

    // Sin marca en la sesión no se adivina: se traen las dos, que es lo que hacía siempre. Con
    // sesión nunca pasa, pero un `[]` acá sería un botón que no hace nada y no dice por qué.
    for (const marca of marcasATraer(marcaActiva)) {
      try {
        const { ordenes, noLeidas: faltantes } = await leerOrdenesTN(marca, desde, hasta)
        noLeidas += faltantes
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

    // Ninguna candidata NO quiere decir que no había nada: si Tienda Nube cortó, acá es donde el
    // corte se vería como un día tranquilo. Por eso `noLeidas` viaja también por este camino.
    if (!candidatas.length) {
      if (fallos.length) throw new Error(fallos.join(' · '))
      return { agregados: 0, ya_estaban: 0, sinDireccion: 0, porCorreo, noLeidas }
    }

    const r = await apiFetch('/api/datos?recurso=envios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recurso: 'envios', action: 'traer-tn', envios: candidatas }),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron traer las órdenes.')

    await recargar()
    if (fallos.length) {
      const faltan = noLeidas ? ` · ${noLeidas} más que Tienda Nube no contestó` : ''
      throw new Error(`Se trajeron las que se pudieron. ${fallos.join(' · ')}${faltan}`)
    }
    return { agregados: d.agregados || 0, ya_estaban: d.ya_estaban || 0, sinDireccion, porCorreo, noLeidas }
  }, [recargar, marcaActiva])

  // El filtro por marca se hace acá y no en el servidor: la bandeja es chica y así cambiar de marca
  // en el header no cuesta un viaje. Sin marca (nunca pasa con sesión) se muestran las dos.
  const pendientes = useMemo(
    () => (marcaActiva ? todosLosPendientes.filter((e) => e.store === marcaActiva) : todosLosPendientes),
    [todosLosPendientes, marcaActiva],
  )

  return { fecha, setFecha, envios, pendientes, cargando, error, recargar, traerDeTiendaNube }
}

/**
 * La cuenta corriente del cadete, y **sólo cuando se abre su pestaña**.
 *
 * Va aparte de `useEnvios` a propósito: la cuenta pide todos los días desde el principio —el saldo
 * de hoy es la suma de todo lo anterior— y eso no puede pagarse en cada carga de la hoja, que es la
 * pantalla que se abre veinte veces por día para ver qué sale.
 */
export function useCuentaCadete(activa: boolean) {
  const [cuenta, setCuenta] = useState<CuentaCadete>({ dias: [], saldo: 0, sinCobrar: 0 })
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(async () => {
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!activa) return
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      try {
        const { envios, movimientos } = await leerCuenta()
        if (!vivo) return
        setCuenta(cuentaDelCadete(envios, movimientos))
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo leer la cuenta del cadete.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [activa, tick])

  return { cuenta, cargando, error, recargar }
}

/**
 * El mapa de zonas de reparto. Mismo molde que `useCuentaCadete`, incluida la carga perezosa: son
 * dieciséis filas con un polígono adentro cada una y la pestaña se abre una vez por mes.
 */
export function useZonas(activa: boolean) {
  const [zonas, setZonas] = useState<ZonaDeReparto[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const recargar = useCallback(async () => {
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!activa) return
    let vivo = true
    void (async () => {
      setCargando(true)
      setError(null)
      try {
        const lista = await leerZonas()
        if (!vivo) return
        setZonas(lista)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudieron leer las zonas de reparto.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [activa, tick])

  return { zonas, cargando, error, recargar }
}

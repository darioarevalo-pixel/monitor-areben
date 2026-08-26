'use client'

/**
 * LAS CARAS de los avisos de una cuenta, para ponérselas a lo que la zona ya sacó de la foto.
 *
 * # 🔑 Se piden al ABRIR la primera fila, ⛔ no al montar la pantalla
 *
 * Eso mantiene cierta la promesa que hace toda la zona: **mirar la tabla ⛔ no gasta un peso de
 * cupo**. Quien abre `/meta-ads` a leer los veredictos no pide nada a Meta; quien quiere ver la
 * pieza, sí, y una sola vez para toda la cuenta.
 *
 * # Una llamada, no una por fila
 *
 * `?recurso=piezas&cuenta=` trae **la cuenta entera en dos llamadas a Graph** (más una de rescate de
 * miniaturas). Abrir cinco celdas cuesta lo mismo que abrir una. Es el mismo idioma de caché que
 * `useParte`: `Map` de módulo + `enVuelo` + TTL.
 *
 * 🔴 **Y el TTL es CORTO a propósito, más corto de lo que parecería razonable.** Las URLs de
 * `scontent`/`fbcdn` que devuelve Meta vienen firmadas y **caducan**; una guardada de ayer no es una
 * foto vieja, es **una imagen rota**. Por eso tampoco va a `sessionStorage`.
 */

import { useCallback, useEffect, useState } from 'react'
import { traerPiezas } from '@/lib/meta-ads/cliente'
import type { PiezaAviso } from '@/lib/meta-ads/biblioteca'

/** Diez minutos: alcanza para una sesión de trabajo y no llega a que caduquen las URLs firmadas. */
const TTL_MS = 10 * 60 * 1000

type Guardado = { piezas: Record<string, PiezaAviso>; motivo: string | null; a: number }

const cache = new Map<string, Guardado>()
const enVuelo = new Map<string, Promise<Guardado>>()

function pedirUnaVez(cuenta: string): Promise<Guardado> {
  const guardado = cache.get(cuenta)
  if (guardado && Date.now() - guardado.a < TTL_MS) return Promise.resolve(guardado)
  const yaVa = enVuelo.get(cuenta)
  if (yaVa) return yaVa
  const p = traerPiezas(cuenta)
    .then((r): Guardado => {
      // ⛔ Un fallo NO se guarda con el TTL de un éxito: se guarda igual para no reintentar en bucle
      // al abrir cada fila, pero lo que se muestra es el motivo, y los avisos salen sin cara.
      const g: Guardado = r.ok
        ? { piezas: r.dato.piezas || {}, motivo: r.dato.motivo, a: Date.now() }
        : { piezas: {}, motivo: r.motivo, a: Date.now() }
      cache.set(cuenta, g)
      return g
    })
    .finally(() => enVuelo.delete(cuenta))
  enVuelo.set(cuenta, p)
  return p
}

/**
 * @param activo `false` mientras no haya ninguna fila abierta. Es lo que hace que mirar la tabla no
 * gaste cupo, y por eso es un parámetro y no un `if` del que llama.
 */
export function usePiezas(cuenta: string | null, activo: boolean) {
  const [resp, setResp] = useState<{ key: string; g: Guardado } | null>(null)

  useEffect(() => {
    if (!cuenta || !activo) return
    let vivo = true
    pedirUnaVez(cuenta).then((g) => {
      if (vivo) setResp({ key: cuenta, g })
    })
    return () => { vivo = false }
  }, [cuenta, activo])

  const vigente = resp && resp.key === cuenta ? resp.g : null
  // 🔑 `piezaDe` devuelve `null` para un aviso que Meta ya no tiene —un borrado sigue vivo en la
  // foto—, y quien dibuja tiene que poder distinguir «todavía no llegaron» de «éste no tiene».
  const piezaDe = useCallback(
    (adId: string) => (vigente ? vigente.piezas[adId] || null : null),
    [vigente],
  )
  return { piezaDe, motivo: vigente ? vigente.motivo : null, cargando: !!cuenta && activo && !vigente }
}

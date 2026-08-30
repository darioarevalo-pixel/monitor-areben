'use client'

/**
 * LAS CARAS de los avisos de una cuenta, para ponérselas a lo que la zona ya sacó de la foto.
 *
 * # 🔴 Se piden AL MONTAR — y eso cambió el 30-ago-2026
 *
 * Esto se pedía **al abrir la primera fila**, para mantener la promesa de que *«mirar la tabla ⛔ no
 * gasta un peso de cupo»*. Dos cosas la tumbaron, y las dos son medidas y ⛔ no de opinión:
 *
 *  1. 🔑 **La promesa ya era falsa.** El parte se pide solo al entrar a la zona desde el 26-ago, y
 *     son **cinco** llamadas a Graph. Un candado que cuida dos llamadas al lado de una puerta que
 *     hace cinco ⛔ no protege nada: sólo esconde las caras.
 *  2. 📊 **El cupo, releído contra prod el 30-ago**: `call_count` de la cuenta `1145878766790149` en
 *     **2** sobre 100 (`X-Business-Use-Case-Usage`, lo que guarda el registro de acciones). Esto son
 *     2-3 llamadas más, cacheadas 10 minutos por cuenta.
 *
 * Y del otro lado hay un pedido concreto: *«sería esencial ver qué anuncio está activo sin estar
 * haciendo movimientos de más»*. Una miniatura que aparece sólo si abrís la fila ⛔ no contesta
 * «cuál es cuál» mientras mirás la tabla, que es cuando se decide.
 *
 * ⚠️ `activo` **se queda igual**: es lo que deja apagarlo desde afuera —sin cuenta elegida, o si un
 * día hay que volver atrás— y sacarlo obligaría a que el llamador ponga un `if`, que es justo donde
 * la decisión se vuelve invisible.
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
 * @param activo el interruptor de afuera. Hoy la tabla lo prende al montar; queda como parámetro
 * —y ⛔ no como un `if` del que llama— para poder apagarlo sin tocar este archivo.
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

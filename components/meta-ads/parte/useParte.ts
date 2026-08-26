'use client'

/**
 * La lectura del PARTE, compartida por la banda de hoy y por el texto que se copia.
 *
 * # 🔴 Acá cambia una decisión que este repo tenía escrita en cinco lugares
 *
 * Hasta el 26-ago-2026 el parte **no se pedía solo**, y el motivo escrito era *«son cinco llamadas
 * a Graph y el cupo de la Marketing API es un porcentaje que se agota»*. 🔑 **Eso era una
 * suposición de magnitud, nunca una medición.** Medido el 26-ago contra prod —el header
 * `X-Business-Use-Case-Usage` que `usoDe()` ya guarda en la auditoría— el `call_count` de la cuenta
 * está en **1-3%**. Cinco llamadas por visita entran holgadas.
 *
 * ⇒ **cuando la premisa se mide, la decisión se revisa.** El parte se pide solo. Pero la medición
 * no es un permiso para pedirlo N veces: es lo que hace segura UNA vez, y por eso van los tres
 * candados de abajo.
 *
 * # Los tres candados
 *
 * 1. **Caché de módulo** por `cuenta|linea`, con TTL. Volver a entrar a la zona ⛔ no re-pega.
 * 2. **`enVuelo`**: dos montajes simultáneos —el doble montaje de React en desarrollo, o la banda y
 *    el `<pre>` pidiendo a la vez— comparten la MISMA promesa. Sin esto, «se pide una vez» sería
 *    mentira justo en el caso más común.
 * 3. **La hora a la vista**: quien consume esto muestra `leído a las HH:MM`. 🔑 Un número sin hora
 *    al lado se lee como vivo, y éste puede tener diez minutos.
 *
 * ⛔ **No hay caché de servidor y no debería haberlo**: esta puerta contesta `Cache-Control:
 * no-store`, y una memoria de módulo del lado de la función es mentira con cold starts.
 * ⛔ **Y no va a `localStorage`**: un parte de anteayer al abrir la app es peor que ninguno.
 */

import { useCallback, useEffect, useState } from 'react'
import { traerParte } from '@/lib/meta-ads/cliente'
import type { RespuestaParte } from '@/lib/meta-ads/cliente'

/** Cuánto vale un parte antes de volver a pedirlo. Diez minutos: la pauta no cambia de veredicto
 *  en menos, y es lo que hace que ir y venir entre pantallas no gaste cupo. */
const TTL_MS = 10 * 60 * 1000

type Guardado = { dato: RespuestaParte; a: number }

const cache = new Map<string, Guardado>()
const enVuelo = new Map<string, Promise<Resuelto>>()

export type EstadoParte =
  | { fase: 'sin-cuenta' }
  | { fase: 'cargando' }
  | { fase: 'error'; motivo: string }
  | { fase: 'ok'; dato: RespuestaParte; leidoA: number }

/**
 * Lo que resuelve una lectura. Los dos campos existen a la vez a propósito: `dato` con `motivo`
 * es **un parte viejo que no se pudo actualizar**, que es un estado distinto de los otros dos y el
 * que más se va a dar. `dato: null` con `motivo` es la primera lectura fallada.
 */
type Resuelto = { dato: RespuestaParte | null; a: number; motivo: string | null }

/**
 * Pide el parte **una sola vez** por clave.
 *
 * @param forzar deja de mirar el TTL. Es lo que hace el botón «Actualizar», y la ÚNICA forma de
 * re-pegar dentro de los diez minutos.
 */
function pedirUnaVez(clave: string, cuenta: string, linea: string | undefined, forzar: boolean): Promise<Resuelto> {
  const guardado = cache.get(clave)
  if (!forzar && guardado && Date.now() - guardado.a < TTL_MS) {
    return Promise.resolve({ ...guardado, motivo: null })
  }
  const yaVa = enVuelo.get(clave)
  if (yaVa) return yaVa
  const p: Promise<Resuelto> = traerParte(cuenta, linea)
    .then((r) => {
      if (r.ok) {
        const fresco = { dato: r.dato, a: Date.now() }
        cache.set(clave, fresco)
        return { ...fresco, motivo: null }
      }
      // ⛔ Un error NO pisa lo que ya había: un parte de hace ocho minutos con su hora al lado es
      // más útil que un cartel rojo, y el cartel se muestra igual, al lado.
      const previo = cache.get(clave)
      return previo ? { ...previo, motivo: r.motivo } : { dato: null, a: Date.now(), motivo: r.motivo }
    })
    .finally(() => enVuelo.delete(clave))
  enVuelo.set(clave, p)
  return p
}

export function useParte(cuenta: string | null, linea?: string) {
  const clave = cuenta ? `${cuenta}|${linea || 'todas'}` : ''
  const [tic, setTic] = useState(0)
  // 🔑 Keyeado por la clave y ⛔ sin efecto que limpie: al cambiar de cuenta o de línea, la
  // respuesta vieja deja de coincidir y la fase vuelve a «cargando» sola. Es el mismo patrón que
  // `useZona`, y por el mismo motivo: un efecto que arregla el estado después de pintar deja un
  // cuadro con los números de la línea anterior, y un número dibujado no se lee como provisorio.
  const [resp, setResp] = useState<{ key: string; r: Resuelto } | null>(null)

  useEffect(() => {
    if (!cuenta) return
    let vivo = true
    pedirUnaVez(clave, cuenta, linea, tic > 0).then((r) => {
      if (vivo) setResp({ key: clave, r })
    })
    return () => { vivo = false }
  }, [clave, cuenta, linea, tic])

  const actualizar = useCallback(() => setTic((n) => n + 1), [])

  const vigente = resp && resp.key === clave ? resp.r : null
  const estado: EstadoParte = !cuenta
    ? { fase: 'sin-cuenta' }
    : !vigente
      ? { fase: 'cargando' }
      : vigente.dato
        ? { fase: 'ok', dato: vigente.dato, leidoA: vigente.a }
        : { fase: 'error', motivo: vigente.motivo || 'no se pudo leer el parte' }

  // 🔑 El motivo viaja APARTE de la fase: con un parte viejo en mano la fase sigue siendo `ok` —se
  // dibujan los números que hay— y el error se muestra al lado. Eso es lo que deja distinguir
  // «esto es de hace rato» de «esto no se pudo actualizar», que son dos cosas distintas.
  return { estado, error: vigente && vigente.dato ? vigente.motivo : null, actualizar }
}

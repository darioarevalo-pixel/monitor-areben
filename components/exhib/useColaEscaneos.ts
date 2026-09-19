'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { abrirRecorrido, cerrarRecorrido, eliminarRecorrido, sacarEscaneo, subirEscaneos } from '@/lib/exhib/cliente'
import { claveEscaneo, esDobleLectura, sumarUna, vecesDe, type EscaneoLibre } from '@/lib/exhib/libre'

/**
 * **El recorrido que se camina con el aparato en la mano**: borrador en el teléfono, cola de
 * subida, y el cierre que ⛔ no deja nada afuera. Lo usan **los dos modos**.
 *
 * 🔴 **Está en un solo lugar a propósito.** Nació en el modo libre (19-sep-2026) y cuando el modo
 * por categoría subió a la base hacía falta lo mismo: copiarlo era tener **dos veces escrita la
 * regla que evita perder un escaneo**, y esas dos copias se despegan el día que una se corrige.
 *
 * 🔴 **El borrador se limpia SÓLO cuando el servidor confirmó.** Regla heredada de Recorridas: en
 * el local la señal se corta, y un escaneo borrado del teléfono porque «ya se mandó» y que nunca
 * llegó ⛔ no se puede reconstruir —la prenda ya se caminó—. Por eso `pendientes` sobrevive a la
 * recarga, la pantalla dice cuántos quedan y **cerrar con pendientes está prohibido**.
 */

/** El borrador que vive en el teléfono. `extra` es lo propio de cada modo (el lugar, la categoría). */
export type Borrador<E> = { id: string; escaneos: EscaneoLibre[]; pendientes: string[]; extra: E }

function leerLS<E>(clave: string, vacio: Borrador<E>): Borrador<E> {
  try {
    const r = localStorage.getItem(clave)
    if (!r) return vacio
    const d = JSON.parse(r) as Partial<Borrador<E>>
    return {
      id: String(d.id || ''),
      escaneos: Array.isArray(d.escaneos) ? d.escaneos : [],
      pendientes: Array.isArray(d.pendientes) ? d.pendientes : [],
      extra: (d.extra ?? vacio.extra) as E,
    }
  } catch {
    return vacio
  }
}

function guardarLS<E>(clave: string, b: Borrador<E>) {
  try {
    localStorage.setItem(clave, JSON.stringify(b))
  } catch {
    /* quota / modo privado: el recorrido sigue en memoria y en el servidor */
  }
}

export function useColaEscaneos<E>(marca: Marca, clave: string, extraVacio: E, modo: 'libre' | 'categoria') {
  const VACIO: Borrador<E> = { id: '', escaneos: [], pendientes: [], extra: extraVacio }
  const [bor, setBor] = useState<Borrador<E>>(VACIO)
  const [subiendo, setSubiendo] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  /**
   * El borrador vigente, leído de una ref y ⛔ no del estado.
   *
   * 🔴 `subir` se dispara desde el handler del escaneo, que puede correr dos veces antes de que
   * React re-renderice (el lector dispara rápido). Leyendo del estado, la segunda subida mandaría
   * el borrador viejo y el escaneo nuevo quedaría pendiente para siempre, con la pantalla diciendo
   * «1 sin subir» y nada volviendo a intentarlo.
   */
  const ref = useRef<Borrador<E>>(VACIO)
  /** La apertura en el servidor, asegurada una vez por sesión de pantalla. */
  const abierto = useRef<string>('')
  /** Lo que hay que mandar en `abrir` cuando la apertura se reintenta (la categoría del recorrido). */
  const alAbrir = useRef<{ categoria?: string | null }>({})

  // Se lee del aparato al montar (y al cambiar de marca), ⛔ no de un request: es justamente lo que
  // tiene que estar antes de que haya red. Va adentro de un async porque `localStorage` ⛔ no existe
  // en el render del servidor.
  useEffect(() => {
    let vivo = true
    void (async () => {
      const b = leerLS(clave, VACIO)
      if (!vivo) return
      ref.current = b
      setBor(b)
      setErrorMsg(null)
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  const guardar = useCallback(
    (next: Borrador<E>) => {
      ref.current = next
      setBor(next)
      guardarLS(clave, next)
    },
    [clave],
  )

  /**
   * Sube lo pendiente. **Sólo ahí se sacan de `pendientes`.**
   *
   * ⚠️ Empieza asegurando la apertura: el id lo generó el teléfono y la apertura pudo fallar sin
   * red. `abrir` es idempotente (upsert que ignora duplicados), así que repetirla ⛔ no cuesta nada
   * y evita que los escaneos reboten con «ese recorrido no está».
   */
  const subir = useCallback(async () => {
    const b = ref.current
    if (!b.id || !b.pendientes.length) return
    setSubiendo(true)
    try {
      if (abierto.current !== b.id) {
        await abrirRecorrido(marca, b.id, { modo, ...alAbrir.current })
        abierto.current = b.id
      }
      const claves = new Set(b.pendientes)
      const aMandar = b.escaneos.filter((e) => claves.has(claveEscaneo(e)))
      if (aMandar.length) await subirEscaneos(marca, b.id, aMandar)
      // El estado de acá puede haber crecido mientras viajaba el pedido: se sacan sólo las claves
      // que efectivamente se mandaron, ⛔ no `pendientes` entero.
      const ahora = ref.current
      guardar({ ...ahora, pendientes: ahora.pendientes.filter((k) => !claves.has(k)) })
      setErrorMsg(null)
    } catch (e) {
      // 🔴 El pendiente NO se toca: queda para el próximo intento y la pantalla lo dice.
      setErrorMsg((e as Error).message)
    } finally {
      setSubiendo(false)
    }
  }, [marca, modo, guardar])

  const iniciar = useCallback(
    (id: string, extra: E, opts?: { categoria?: string | null }) => {
      abierto.current = ''
      alAbrir.current = { categoria: opts?.categoria ?? null }
      guardar({ id, escaneos: [], pendientes: [], extra })
      void abrirRecorrido(marca, id, { modo, ...alAbrir.current })
        .then(() => {
          abierto.current = id
        })
        // Sin red el recorrido arranca igual: `subir` vuelve a intentar la apertura antes de cada
        // tanda. Un cartel acá diría «no se pudo empezar» sobre un recorrido que sí empezó.
        .catch(() => {})
    },
    [marca, modo, guardar],
  )

  const setExtra = useCallback(
    (extra: E) => {
      guardar({ ...ref.current, extra })
    },
    [guardar],
  )

  /**
   * Reemplaza un escaneo que ya estaba (misma clave) — lo usa el triage por categoría, donde la
   * persona cambia de opinión: «no se encuentra» pasa a «solucionado» sobre la misma variante.
   *
   * ⚠️ En la base es un **upsert que ignora duplicados**, así que la fila vieja gana: por eso se
   * saca primero del servidor y después se manda la nueva. ⛔ No alcanza con pisarla en el teléfono.
   */
  const reemplazarFila = (e: EscaneoLibre) => {
    const k = claveEscaneo(e)
    const b = ref.current
    guardar({
      ...b,
      escaneos: [...b.escaneos.filter((x) => claveEscaneo(x) !== k), e],
      pendientes: [...b.pendientes.filter((x) => x !== k), k],
    })
    if (b.id) {
      void sacarEscaneo(marca, b.id, e.lugar, e.variante_id)
        .catch(() => {})
        .then(() => subir())
    } else {
      void subir()
    }
  }

  /**
   * Agrega el escaneo al borrador y lo manda a subir. **Es la única puerta que escribe.**
   *
   * 🔴 **El repetido SUMA una unidad; ⛔ no rebota.** Hasta el 19-sep-2026 devolvía «repetido» y ⛔
   * no guardaba nada, porque el único de la base es (recorrido, lugar, variante). Bruno: *«que te
   * permita escanear todo aunque vaya repetido… que se pueda anotar que hay dos repetidos, pero te
   * deje»*. La fila sigue siendo **una sola**: lo que sube es el contador, así que el único ⛔ no se
   * toca y en el Excel sigue habiendo un renglón por prenda.
   *
   * ⚠️ **Salvo el rebote del aparato** (`esDobleLectura`): el lector entra como teclado y puede
   * repetir el Enter solo. Ése ⛔ no se cuenta, y se dice —callarlo sería inventar una prenda—.
   */
  const registrar = useCallback(
    (e: EscaneoLibre, ahora: number = Date.now()): { que: 'nuevo' | 'sumado' | 'doble-lectura'; veces: number } => {
      const k = claveEscaneo(e)
      const b = ref.current
      const previo = b.escaneos.find((x) => claveEscaneo(x) === k)
      if (!previo) {
        guardar({ ...b, escaneos: [...b.escaneos, e], pendientes: [...b.pendientes, k] })
        void subir()
        return { que: 'nuevo', veces: 1 }
      }
      if (esDobleLectura(previo, ahora)) return { que: 'doble-lectura', veces: vecesDe(previo) }
      // La fila crece; y como el upsert del servidor ignora duplicados, la vieja se saca primero.
      const sumado = sumarUna(previo, ahora)
      reemplazarFila(sumado)
      return { que: 'sumado', veces: vecesDe(sumado) }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guardar, subir],
  )

  // ⚠️ Una sola implementación: `registrar` la necesita para sumarle una unidad al repetido, y
  // dos cuerpos iguales es la copia que se despega el día que uno se corrige.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reemplazar = useCallback((e: EscaneoLibre) => reemplazarFila(e), [marca, guardar, subir])

  const sacar = useCallback(
    (e: EscaneoLibre) => {
      const k = claveEscaneo(e)
      const b = ref.current
      guardar({
        ...b,
        escaneos: b.escaneos.filter((x) => claveEscaneo(x) !== k),
        pendientes: b.pendientes.filter((x) => x !== k),
      })
      // Si todavía estaba pendiente, en el servidor no hay nada que borrar; el `catch` vacío es a
      // propósito: el 404 de un escaneo que nunca subió ⛔ no es un error para quien está caminando.
      if (b.id) void sacarEscaneo(marca, b.id, e.lugar, e.variante_id).catch(() => {})
    },
    [marca, guardar],
  )

  /** Cierra el recorrido: primero sube lo que quede, después lo sella y limpia el borrador. */
  const cerrar = useCallback(async () => {
    await subir()
    const b = ref.current
    if (!b.id) return
    // 🔴 Con pendientes sin subir ⛔ no se cierra: sellar un recorrido al que le faltan escaneos lo
    // deja incompleto para siempre y nadie se entera. La pantalla ya muestra cuántos son.
    if (b.pendientes.length) throw new Error(`Quedan ${b.pendientes.length} escaneos sin subir. Probá de nuevo cuando haya señal.`)
    await cerrarRecorrido(marca, b.id)
    guardar({ id: '', escaneos: [], pendientes: [], extra: extraVacio })
    abierto.current = ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marca, subir, guardar])

  /**
   * Elimina el recorrido: el borrador del teléfono **y** la fila del servidor.
   *
   * 🔑 Las dos puntas. Limpiar de un lado dejaba un recorrido abierto para siempre en la lista, con
   * escaneos a medias y sin nadie que lo pueda cerrar — y el que lo mirara después ⛔ no tendría
   * cómo saber que fue un arranque en falso.
   */
  const eliminar = useCallback(async () => {
    const b = ref.current
    guardar({ id: '', escaneos: [], pendientes: [], extra: extraVacio })
    abierto.current = ''
    if (b.id) await eliminarRecorrido(marca, b.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marca, guardar])

  return {
    id: bor.id,
    escaneos: bor.escaneos,
    extra: bor.extra,
    sinSubir: bor.pendientes.length,
    subiendo,
    errorMsg,
    ref,
    iniciar,
    setExtra,
    registrar,
    reemplazar,
    sacar,
    cerrar,
    eliminar,
    reintentar: subir,
  }
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { buscarItem, candidatosPorCodigo, TOPE_CANDIDATOS } from '@/lib/exhib/core'
import { abrirRecorrido, eliminarRecorrido, cerrarRecorrido, leerLugares, sacarEscaneo, subirEscaneos } from '@/lib/exhib/cliente'
import { aEscaneo, claveEscaneo, contarEnLugar, lugaresSugeridos, nuevoRecorridoId, yaEscaneado, type EscaneoLibre } from '@/lib/exhib/libre'
import type { ExhibItem } from '@/lib/exhib/tipos'

/**
 * Estado del recorrido **libre**: se escanea por LUGAR y cada escaneo va a la base.
 *
 * 🔴 **Hook aparte, y ⛔ no un modo adentro de `useExhib`.** Aquél es el recorrido por categoría, con
 * sus estados de triage y sus errores de categoría, y ⛔ no se tocó: son dos recorridos distintos
 * que comparten los ítems y nada más.
 *
 * 🔴 **El borrador local se limpia SÓLO cuando el servidor confirmó.** Es la regla escrita de
 * Recorridas (`docs/secciones/recorridas.md`) y acá vale igual: en el local la señal se corta, y un
 * escaneo que se borra del teléfono porque "ya se mandó" y ⛔ nunca llegó es un dato que no se puede
 * reconstruir —la prenda ya se caminó—. Por eso `pendientes` sobrevive a la recarga y la pantalla
 * muestra cuántos quedan sin subir en vez de callarse.
 */

const clave = (m: Marca) => 'monitor_exhib_libre_' + m

/** El borrador que vive en el teléfono mientras se camina. */
type Borrador = {
  id: string
  lugar: string
  escaneos: EscaneoLibre[]
  /** Claves (`claveEscaneo`) de lo que todavía ⛔ no confirmó el servidor. */
  pendientes: string[]
}

const VACIO: Borrador = { id: '', lugar: '', escaneos: [], pendientes: [] }

function leerLS(m: Marca): Borrador {
  try {
    const r = localStorage.getItem(clave(m))
    if (!r) return VACIO
    const d = JSON.parse(r) as Partial<Borrador>
    return {
      id: String(d.id || ''),
      lugar: String(d.lugar || ''),
      escaneos: Array.isArray(d.escaneos) ? d.escaneos : [],
      pendientes: Array.isArray(d.pendientes) ? d.pendientes : [],
    }
  } catch {
    return VACIO
  }
}
function guardarLS(m: Marca, b: Borrador) {
  try {
    localStorage.setItem(clave(m), JSON.stringify(b))
  } catch {
    /* quota / modo privado: el recorrido sigue en memoria y en el servidor */
  }
}

/** Lo que contesta un escaneo, para el feedback de la pantalla. */
export type ResultadoLibre =
  | { tipo: 'ok'; it: ExhibItem; e: EscaneoLibre }
  | { tipo: 'repetido'; it: ExhibItem | null; e: EscaneoLibre }
  /** Existe y está colgada, pero el sistema la tiene en cero. Se guarda como `encontrado`, con qty 0. */
  | { tipo: 'stock-cero'; it: ExhibItem; e: EscaneoLibre }
  /** El código ⛔ no cruzó con nada. `parecidos` = cuántos había, cuando eran demasiados para mostrar. */
  | { tipo: 'no-cruzo'; e: EscaneoLibre; parecidos?: number }
  /**
   * ⚠️ **El único que ⛔ NO guarda todavía**: el código ⛔ no enganchó exacto pero se parece a unos
   * pocos, y decide la persona (`confirmar` / `descartar`).
   */
  | { tipo: 'candidatos'; codigo: string; lugar: string; candidatos: ExhibItem[] }

export function useExhibLibre(marca: Marca, buscables: ExhibItem[]) {
  const [bor, setBor] = useState<Borrador>(VACIO)
  const [lugaresServidor, setLugaresServidor] = useState<string[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  /**
   * El borrador vigente, leído de una ref y ⛔ no del estado.
   *
   * 🔴 `subir` se dispara desde el handler del escaneo, que puede correr dos veces antes de que
   * React re-renderice (el lector dispara rápido). Leyendo del estado, la segunda subida mandaría
   * el borrador viejo y el escaneo nuevo quedaría pendiente para siempre, con la pantalla diciendo
   * «1 sin subir» y nada volviendo a intentarlo.
   *
   * ⚠️ La ref la escribe **sólo `guardar`**, que es el único que toca `bor`. ⛔ No se sincroniza en
   * el cuerpo del render: ahí no se pueden tocar refs, y además no haría falta.
   */
  const ref = useRef<Borrador>(VACIO)

  // El borrador se lee del aparato al montar (y al cambiar de marca), ⛔ no de un request: es
  // justamente lo que tiene que estar antes de que haya red. Va adentro del async como en
  // `useExhib`: `localStorage` ⛔ no existe en el render del servidor.
  useEffect(() => {
    let vivo = true
    void (async () => {
      const b = leerLS(marca)
      if (!vivo) return
      ref.current = b
      setBor(b)
      setErrorMsg(null)
      try {
        const l = await leerLugares(marca)
        if (vivo) setLugaresServidor(l)
      } catch {
        // Las sugerencias son una comodidad: sin ellas se escribe el lugar a mano y el recorrido
        // sigue. ⛔ No corta nada ni pinta un error que no es del recorrido.
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const guardar = useCallback(
    (next: Borrador) => {
      ref.current = next
      setBor(next)
      guardarLS(marca, next)
    },
    [marca],
  )

  /** La apertura del recorrido en el servidor, asegurada una vez por sesión de pantalla. */
  const abierto = useRef<string>('')

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
        await abrirRecorrido(marca, b.id)
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
  }, [marca, guardar])

  const iniciar = useCallback(() => {
    const id = nuevoRecorridoId()
    abierto.current = ''
    guardar({ id, lugar: '', escaneos: [], pendientes: [] })
    void abrirRecorrido(marca, id)
      .then(() => {
        abierto.current = id
      })
      // Sin red el recorrido arranca igual: `subir` vuelve a intentar la apertura antes de cada
      // tanda. Un cartel acá diría «no se pudo empezar» sobre un recorrido que sí empezó.
      .catch(() => {})
  }, [marca, guardar])

  const setLugar = useCallback(
    (lugar: string) => {
      guardar({ ...ref.current, lugar })
    },
    [guardar],
  )

  /** Guarda el escaneo (con prenda o sin ella) y lo manda a subir. Es la única puerta que escribe. */
  const registrar = useCallback(
    (it: ExhibItem | null, codigo: string, lugar: string): ResultadoLibre => {
      const e = aEscaneo(it, codigo, lugar)
      const k = claveEscaneo(e)
      const b = ref.current
      // El único de la base es (recorrido, lugar, variante) y lo rechazaría en silencio: mejor
      // decirlo acá, que es donde la persona todavía tiene la prenda en la mano.
      if (yaEscaneado(b.escaneos, k)) return { tipo: 'repetido', it, e }
      guardar({ ...b, escaneos: [...b.escaneos, e], pendientes: [...b.pendientes, k] })
      void subir()
      if (!it) return { tipo: 'no-cruzo', e }
      return it.qty <= 0 ? { tipo: 'stock-cero', it, e } : { tipo: 'ok', it, e }
    },
    [guardar, subir],
  )

  /**
   * El código parcial que está esperando que alguien confirme cuál de los candidatos era.
   *
   * 🔴 **Se guarda solo como «no cruzó» apenas llega otro escaneo o se cierra el recorrido.** Es la
   * regla que hace que preguntar ⛔ no pueda costar un dato: la persona está caminando con el lector
   * y el siguiente código llega en dos segundos, así que un panel sin resolver que desaparece en
   * silencio es exactamente el escaneo perdido que este recorrido existe para no perder. Lo peor
   * que puede pasar es que quede como quedaba antes de preguntar.
   */
  const sinResolver = useRef<{ codigo: string; lugar: string } | null>(null)

  const resolverSolo = useCallback(() => {
    const p = sinResolver.current
    sinResolver.current = null
    if (p) registrar(null, p.codigo, p.lugar)
  }, [registrar])

  /**
   * Escanea un código en el lugar vigente. El que ⛔ no cruza se guarda igual.
   *
   * 🔑 **`buscarItem` sigue pidiendo el código COMPLETO.** Lo parcial ⛔ no engancha solo: se
   * ofrecen los candidatos y confirma quien tiene la prenda en la mano. Aflojarlo a un match
   * parcial mudo marcaría **la prenda equivocada**, que con gente usándolo es peor que no marcar.
   */
  const escanear = useCallback(
    (codigo: string, lugar: string): ResultadoLibre => {
      resolverSolo()
      const it = buscarItem(buscables, codigo)
      if (it) return registrar(it, codigo, lugar)

      const candidatos = candidatosPorCodigo(buscables, codigo)
      if (candidatos.length && candidatos.length <= TOPE_CANDIDATOS) {
        sinResolver.current = { codigo, lugar }
        return { tipo: 'candidatos', codigo, lugar, candidatos }
      }
      // Ninguno, o demasiados para mirarlos de parado: se guarda como siempre, diciendo cuántos
      // parecidos había — que es la diferencia entre «no existe» y «escaneá de nuevo».
      const r = registrar(null, codigo, lugar)
      return r.tipo === 'no-cruzo' ? { ...r, parecidos: candidatos.length } : r
    },
    [buscables, registrar, resolverSolo],
  )

  /** «Es ésta»: guarda el escaneo con la prenda elegida y el código crudo tal como se tipeó. */
  const confirmar = useCallback(
    (it: ExhibItem, codigo: string, lugar: string): ResultadoLibre => {
      sinResolver.current = null
      return registrar(it, codigo, lugar)
    },
    [registrar],
  )

  /** «Ninguna de éstas»: queda como hallazgo sin cruzar, que es lo que hacía antes de preguntar. */
  const descartar = useCallback(
    (codigo: string, lugar: string): ResultadoLibre => {
      sinResolver.current = null
      return registrar(null, codigo, lugar)
    },
    [registrar],
  )

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
    // Un candidato sin confirmar al momento de cerrar se guarda como «no cruzó»: sellar el
    // recorrido dejándolo afuera lo perdería para siempre, y el salón ya se caminó.
    resolverSolo()
    await subir()
    const b = ref.current
    if (!b.id) return
    // 🔴 Con pendientes sin subir ⛔ no se cierra: sellar un recorrido al que le faltan escaneos lo
    // deja incompleto para siempre y nadie se entera. La pantalla ya muestra cuántos son.
    if (b.pendientes.length) throw new Error(`Quedan ${b.pendientes.length} escaneos sin subir. Probá de nuevo cuando haya señal.`)
    await cerrarRecorrido(marca, b.id)
    guardar(VACIO)
    abierto.current = ''
  }, [marca, subir, guardar, resolverSolo])

  /**
   * Elimina el recorrido: el borrador del teléfono **y** la fila del servidor.
   *
   * 🔑 Borrar las dos puntas y ⛔ no sólo el teléfono. Limpiar de un lado dejaba un recorrido
   * abierto para siempre en la lista, con escaneos a medias y sin nadie que lo pueda cerrar — y el
   * que lo mirara después ⛔ no tendría cómo saber que fue un arranque en falso.
   */
  const eliminar = useCallback(async () => {
    const b = ref.current
    guardar(VACIO)
    abierto.current = ''
    if (b.id) await eliminarRecorrido(marca, b.id)
  }, [marca, guardar])

  const sugerencias = useMemo(
    () => lugaresSugeridos(lugaresServidor, bor.escaneos.map((e) => e.lugar)),
    [lugaresServidor, bor.escaneos],
  )
  const enEsteLugar = useMemo(() => contarEnLugar(bor.escaneos, bor.lugar), [bor.escaneos, bor.lugar])

  return {
    recorridoId: bor.id,
    lugar: bor.lugar,
    escaneos: bor.escaneos,
    sinSubir: bor.pendientes.length,
    enEsteLugar,
    sugerencias,
    subiendo,
    errorMsg,
    iniciar,
    setLugar,
    escanear,
    confirmar,
    descartar,
    sacar,
    cerrar,
    eliminar,
    reintentar: subir,
  }
}

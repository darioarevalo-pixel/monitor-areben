'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { candidatosPorCodigo, coincidencias, TOPE_CANDIDATOS } from '@/lib/exhib/core'
import { leerLugares } from '@/lib/exhib/cliente'
import { aEscaneo, contarEnLugar, lugaresSugeridos, nuevoRecorridoId, type EscaneoLibre } from '@/lib/exhib/libre'
import type { ExhibItem } from '@/lib/exhib/tipos'
import { useColaEscaneos } from './useColaEscaneos'

/**
 * Estado del recorrido **libre**: se escanea por LUGAR y cada escaneo va a la base.
 *
 * 🔴 **Hook aparte, y ⛔ no un modo adentro de `useExhib`.** Aquél es el recorrido por categoría,
 * con sus estados de triage: son dos recorridos distintos que comparten los ítems y **la cola**
 * (`useColaEscaneos`), que es donde vive la regla de no perder un escaneo.
 */

const clave = (m: Marca) => 'monitor_exhib_libre_' + m

/** Lo que contesta un escaneo, para el feedback de la pantalla. */
export type ResultadoLibre =
  | { tipo: 'ok'; it: ExhibItem; e: EscaneoLibre }
  /** Ya estaba en este lugar y **se le sumó una unidad**: hay dos colgadas, y eso es el dato. */
  | { tipo: 'sumado'; it: ExhibItem | null; e: EscaneoLibre; veces: number }
  /** El aparato repitió el Enter solo (menos de `DOBLE_LECTURA_MS`): ⛔ no se contó. */
  | { tipo: 'doble-lectura'; it: ExhibItem | null; e: EscaneoLibre; veces: number }
  /** Existe y está colgada, pero el sistema la tiene en cero. Se guarda como `encontrado`, con qty 0. */
  | { tipo: 'stock-cero'; it: ExhibItem; e: EscaneoLibre }
  /** El código ⛔ no cruzó con nada. `parecidos` = cuántos había, cuando eran demasiados para mostrar. */
  | { tipo: 'no-cruzo'; e: EscaneoLibre; parecidos?: number }
  /**
   * ⚠️ **El único que ⛔ NO guarda todavía**: el código enganchó varias, o ninguna exacta pero se
   * parece a unas pocas, y decide la persona (`confirmar` / `descartar`).
   */
  | { tipo: 'candidatos'; codigo: string; lugar: string; candidatos: ExhibItem[] }

export function useExhibLibre(marca: Marca, buscables: ExhibItem[]) {
  const cola = useColaEscaneos<string>(marca, clave(marca), '', 'libre')
  const [lugaresServidor, setLugaresServidor] = useState<string[]>([])

  useEffect(() => {
    let vivo = true
    void leerLugares(marca)
      .then((l) => vivo && setLugaresServidor(l))
      // Las sugerencias son una comodidad: sin ellas se escribe el lugar a mano y el recorrido
      // sigue. ⛔ No corta nada ni pinta un error que no es del recorrido.
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [marca])

  /** Guarda el escaneo y traduce a lo que la pantalla tiene que decir. */
  const registrar = useCallback(
    (it: ExhibItem | null, codigo: string, lugar: string): ResultadoLibre => {
      const e = aEscaneo(it, codigo, lugar)
      const r = cola.registrar(e)
      // 🔴 **El repetido ⛔ ya no rebota: suma una unidad** (19-sep-2026). Lo único que ⛔ no se
      // cuenta es el rebote del propio aparato, y se dice.
      if (r.que === 'doble-lectura') return { tipo: 'doble-lectura', it, e, veces: r.veces }
      if (r.que === 'sumado') return { tipo: 'sumado', it, e, veces: r.veces }
      if (!it) return { tipo: 'no-cruzo', e }
      return it.qty <= 0 ? { tipo: 'stock-cero', it, e } : { tipo: 'ok', it, e }
    },
    [cola],
  )

  /**
   * El código sin resolver que está esperando que alguien confirme cuál de los candidatos era.
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
   * 🔑 **El código completo sigue siendo el criterio.** Lo parcial ⛔ no engancha solo y lo ambiguo
   * ⛔ no se resuelve al primero: se ofrecen los candidatos y confirma quien tiene la prenda en la
   * mano. Aflojarlo marcaría **la prenda equivocada**, que con gente usándolo es peor que no marcar.
   */
  const escanear = useCallback(
    (codigo: string, lugar: string): ResultadoLibre => {
      resolverSolo()
      const exactas = coincidencias(buscables, codigo)
      if (exactas.length === 1) return registrar(exactas[0], codigo, lugar)
      // 🔴 Enganchó **varias**: pasa con un SKU tipeado a mano que dos variantes comparten (20 con
      // stock). Quedarse con la primera marcaría la prenda equivocada sin decir una palabra.
      if (exactas.length > 1) {
        sinResolver.current = { codigo, lugar }
        return { tipo: 'candidatos', codigo, lugar, candidatos: exactas }
      }

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

  const iniciar = useCallback(() => {
    cola.iniciar(nuevoRecorridoId(), '')
  }, [cola])

  const cerrar = useCallback(async () => {
    // Un candidato sin confirmar al momento de cerrar se guarda como «no cruzó»: sellar el
    // recorrido dejándolo afuera lo perdería para siempre, y el salón ya se caminó.
    resolverSolo()
    await cola.cerrar()
  }, [cola, resolverSolo])

  const sugerencias = useMemo(
    () => lugaresSugeridos(lugaresServidor, cola.escaneos.map((e) => e.lugar)),
    [lugaresServidor, cola.escaneos],
  )
  const enEsteLugar = useMemo(() => contarEnLugar(cola.escaneos, cola.extra), [cola.escaneos, cola.extra])

  return {
    recorridoId: cola.id,
    lugar: cola.extra,
    escaneos: cola.escaneos,
    sinSubir: cola.sinSubir,
    enEsteLugar,
    sugerencias,
    subiendo: cola.subiendo,
    errorMsg: cola.errorMsg,
    iniciar,
    setLugar: cola.setExtra,
    escanear,
    confirmar,
    descartar,
    sacar: cola.sacar,
    cerrar,
    eliminar: cola.eliminar,
    reintentar: cola.reintentar,
  }
}

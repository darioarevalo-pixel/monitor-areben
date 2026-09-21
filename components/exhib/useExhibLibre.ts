'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { candidatosPorCodigo, coincidencias } from '@/lib/exhib/core'
import { leerLugares } from '@/lib/exhib/cliente'
import { aEscaneo, avanceDelRecorrido, contarEnLugar, lugaresSugeridos, nuevoRecorridoId, type EscaneoLibre } from '@/lib/exhib/libre'
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
  /** `avance` = unidades que van en el recorrido. Es el número que se canta. Ver `avisoDe`. */
  | { tipo: 'ok'; it: ExhibItem; e: EscaneoLibre; avance: number }
  /** Ya estaba en este lugar y **se le sumó una unidad**: hay dos colgadas, y eso es el dato. */
  | { tipo: 'sumado'; it: ExhibItem | null; e: EscaneoLibre; veces: number; avance: number }
  /**
   * El aparato repitió el Enter solo (menos de `DOBLE_LECTURA_MS`): ⛔ no se contó una unidad más.
   * ⚠️ Lleva `avance` igual —**la prenda sí está detectada**— y por eso suena como cualquier
   * escaneo bueno: el número se repite, que es exactamente lo que pasó.
   */
  | { tipo: 'doble-lectura'; it: ExhibItem | null; e: EscaneoLibre; veces: number; avance: number }
  /** Existe y está colgada, pero el sistema la tiene en cero. Se guarda como `encontrado`, con qty 0. */
  | { tipo: 'stock-cero'; it: ExhibItem; e: EscaneoLibre; avance: number }
  /**
   * El código ⛔ no enganchó a UNA sola prenda. **Se guarda igual**, con el código crudo.
   *
   * `parecidos` = a cuántas enganchaba —varias con el mismo SKU, o parecidas a un código cortado—.
   * ⚠️ Es la diferencia entre «ese código ⛔ no existe» y «pasala de nuevo», y por eso se dice.
   */
  | { tipo: 'no-cruzo'; e: EscaneoLibre; parecidos?: number }

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
      // ⚠️ El avance se lee de la **ref** y ⛔ no del estado de React: `registrar` acaba de escribir
      // el borrador, y el estado todavía ⛔ no se re-dibujó. Del estado saldría el número anterior
      // —el de la prenda de antes— cantado sobre la que la persona tiene en la mano.
      const avance = avanceDelRecorrido(cola.ref.current.escaneos)
      // 🔴 **El repetido ⛔ ya no rebota: suma una unidad** (19-sep-2026). Lo único que ⛔ no se
      // cuenta es el rebote del propio aparato, y se dice.
      if (r.que === 'doble-lectura') return { tipo: 'doble-lectura', it, e, veces: r.veces, avance }
      if (r.que === 'sumado') return { tipo: 'sumado', it, e, veces: r.veces, avance }
      if (!it) return { tipo: 'no-cruzo', e }
      return it.qty <= 0 ? { tipo: 'stock-cero', it, e, avance } : { tipo: 'ok', it, e, avance }
    },
    [cola],
  )

  /**
   * Escanea un código en el lugar vigente. **Nunca frena a quien está caminando.**
   *
   * 🔴 **El que ⛔ no engancha a UNA sola prenda se guarda sin identificar, y ⛔ no se pregunta**
   * (20-sep-2026, decisión de Bruno: *«yo ⛔ no la frenaría a la chica que escanea; luego prefiero
   * hacer el balance yo mismo»*). Hasta esa noche la pantalla abría un panel con los candidatos y
   * esperaba que eligiera **quien tiene el lector en la mano**, que es justamente quien ⛔ no puede
   * pararse a decidir: son **dos personas y dos momentos**, y el que decide mira después.
   *
   * 🔑 **Y ⛔ no se elige la primera, que sería marcar la prenda equivocada en silencio** — el bug
   * que `coincidencias` existe para evitar. Se guarda el **código crudo** con `encontrado = false`
   * —el dato que nadie puede reconstruir después— y se dice **cuántas se parecían**: con el lector
   * eso casi siempre es una lectura cortada, así que lo que corresponde es **volver a pasar la
   * prenda**, que todavía está en la mano. 📊 Medido sobre el recorrido real de 97 escaneos: los 97
   * engancharon por código de barras exacto y sólo **2** códigos ⛔ no cruzaron.
   */
  const escanear = useCallback(
    (codigo: string, lugar: string): ResultadoLibre => {
      const exactas = coincidencias(buscables, codigo)
      if (exactas.length === 1) return registrar(exactas[0], codigo, lugar)
      // Varias exactas = un SKU compartido (20 variantes con stock lo comparten). Ninguna exacta =
      // puede ser un pedazo de código. Los dos terminan igual: se guarda y se dice cuántas eran.
      const parecidos = exactas.length > 1 ? exactas.length : candidatosPorCodigo(buscables, codigo).length
      const r = registrar(null, codigo, lugar)
      return r.tipo === 'no-cruzo' ? { ...r, parecidos } : r
    },
    [buscables, registrar],
  )

  const iniciar = useCallback(() => {
    cola.iniciar(nuevoRecorridoId(), '')
  }, [cola])

  const cerrar = useCallback(async () => {
    await cola.cerrar()
  }, [cola])

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
    sacar: cola.sacar,
    cerrar,
    eliminar: cola.eliminar,
    reintentar: cola.reintentar,
  }
}

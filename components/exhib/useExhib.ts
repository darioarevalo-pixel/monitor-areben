'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Marca } from '@/lib/nav'
import type { Producto } from '@/lib/etl/tipos'
import { bajarExhib, type CrudosExhib } from '@/lib/exhib/datos'
import { armarProdMap, buscarItem, construirItems, esCruce, exhibId, ordenarCats } from '@/lib/exhib/core'
import { aEscaneo, estadosDe, nuevoRecorridoId, type EscaneoLibre } from '@/lib/exhib/libre'
import type { ExhibErrores, ExhibEstado, ExhibEstados, ExhibItem } from '@/lib/exhib/tipos'
import { useColaEscaneos } from './useColaEscaneos'

const keyEstados = (m: Marca) => 'monitor_exhib_' + m
const keyErrores = (m: Marca) => 'monitor_exhib_err_' + m
const keyCola = (m: Marca) => 'monitor_exhib_cat_' + m

/**
 * ⛔ **La categoría vacía («Todas») necesita un lugar igual**: el único de la base es
 * (recorrido, lugar, variante) y el servidor rechaza un lugar en blanco. En este modo el «lugar»
 * **es la categoría que se recorrió** —su unidad de trabajo, igual que el mueble en el libre—.
 */
const TODAS = 'Todas las categorías'

function leerLS<T>(k: string, fallback: T): T {
  try {
    const r = localStorage.getItem(k)
    return r ? (JSON.parse(r) as T) : fallback
  } catch {
    return fallback
  }
}
function guardarLS(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* quota / modo privado: el chequeo sigue en memoria */
  }
}

/** Resultado de escanear/tipear un código. */
export type ResultadoMarca =
  | { tipo: 'no-encontrado'; code: string }
  | { tipo: 'ok'; it: ExhibItem }
  | { tipo: 'cruce'; it: ExhibItem; catSel: string }
  /** Existe y está colgada, pero el sistema la tiene en cero ⇒ ⛔ no está en la lista a chequear. */
  | { tipo: 'stock-cero'; it: ExhibItem }
  /** ⛔ No hay recorrido abierto: sin él ⛔ no hay dónde guardar la tilde. */
  | { tipo: 'sin-recorrido' }

/**
 * Estado del chequeo de exhibición **por categoría**.
 *
 * 🔴 **Desde el 19-sep-2026 el recorrido GUARDA EN LA BASE, como el libre.** Antes cada tilde era
 * una entrada en el `localStorage` del teléfono —**sin fecha, sin persona y sin recorrido**, y no
 * se limpiaba nunca—, así que el reporte decía «EXHIBIDO CORRECTAMENTE (245)» queriendo decir
 * **«alguien lo marcó alguna vez»**. Medido contra el recorrido libre del mismo día: de los
 * productos escaneados ahí, **46 variantes con stock (143 u) ⛔ no pasaron por el lector y 39 salían
 * «exhibido correctamente»**. Bruno: *«habría que mejorarlo como el libre, y que tenga registro de
 * hora, día y quién»*.
 *
 * 🔑 **Los estados pasan a DERIVARSE de los escaneos** (`estadosDe`). El `localStorage` sigue,
 * pero como **borrador de la cola** y ⛔ no como la verdad: la verdad es la fila, con su hora.
 *
 * ⚠️ **Los «errores de categoría» siguen siendo locales**, y está bien: ⛔ no son del recorrido sino
 * una lista de cosas a corregir en Tienda Nube, que se resuelve mirando el reporte.
 */
export function useExhib(marca: Marca, productos: Producto[]) {
  const [crudos, setCrudos] = useState<CrudosExhib>({ inv: [], tnProducts: [] })
  const [errores, setErrores] = useState<ExhibErrores>({})
  const [viejas, setViejas] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const cola = useColaEscaneos<string>(marca, keyCola(marca), '', 'categoria')

  useEffect(() => {
    let vivo = true
    void (async () => {
      const err = leerLS<ExhibErrores>(keyErrores(marca), {})
      // Las tildes de antes del cambio: ⛔ no se suben —no tienen ni fecha ni recorrido, que es
      // justo lo que las vuelve inservibles— pero se dice cuántas son y se pueden borrar.
      const antiguas = Object.keys(leerLS<ExhibEstados>(keyEstados(marca), {})).length
      if (!vivo) return
      setErrores(err)
      setViejas(antiguas)
      setCargando(true)
      setErrorMsg(null)
      try {
        const bajado = await bajarExhib(marca)
        if (!vivo) return
        setCrudos(bajado)
      } catch (e) {
        if (vivo) setErrorMsg((e as Error).message)
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  /**
   * 🔴 **El cruce es DERIVADO, ⛔ no un resultado guardado — y ésa es la corrección del 7-sep-2026.**
   * El catálogo del ETL (`productos`) llega **después** de que esta pantalla monta, así que
   * cruzarlo una vez dejaba las 870 prendas en «(Sin categoría)» para siempre.
   *
   * 🔑 **Dos listas**: `buscables` es todo el Local —lo que el lector puede enganchar— e `items` lo
   * que hay que **chequear** (con stock). Ver `lib/exhib/datos.ts`.
   */
  const prodMap = useMemo(() => armarProdMap(productos, crudos.tnProducts), [productos, crudos.tnProducts])
  const buscables = useMemo(() => construirItems(crudos.inv, prodMap, errores), [crudos.inv, prodMap, errores])
  const items = useMemo(() => buscables.filter((it) => it.qty > 0), [buscables])
  const enCero = buscables.length - items.length
  const cats = useMemo(() => ordenarCats(items), [items])

  /** El estado de cada variante, **derivado de los escaneos del recorrido** (`estadosDe`, con test). */
  const estados = useMemo<ExhibEstados>(() => estadosDe(cola.escaneos), [cola.escaneos])

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      setCrudos(await bajarExhib(marca))
      setErrorMsg(null)
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [marca])

  const persistErrores = useCallback(
    (next: ExhibErrores) => {
      setErrores(next)
      guardarLS(keyErrores(marca), next)
    },
    [marca],
  )

  /** Abre el recorrido de una categoría. Sin esto ⛔ no hay dónde guardar una tilde. */
  const iniciarRecorrido = useCallback(
    (categoria: string) => {
      const lugar = categoria.trim() || TODAS
      cola.iniciar(nuevoRecorridoId(), lugar, { categoria: lugar })
    },
    [cola],
  )

  /** La fila de una variante marcada: el mismo `aEscaneo` del libre, con el estado encima. */
  const filaDe = useCallback(
    (it: ExhibItem, estado: ExhibEstado, codigo: string): EscaneoLibre => ({
      ...aEscaneo(it, codigo, cola.extra || TODAS),
      estado,
    }),
    [cola.extra],
  )

  /**
   * Marca 'exhibido' por código; devuelve el resultado para el feedback de la UI.
   *
   * ⚠️ Busca en `buscables` —todo el Local— pero **la que está en cero ⛔ no se marca**: no está en
   * la lista de esta pantalla, así que un estado ahí es peso muerto que nadie va a mirar.
   */
  const marcarPorCodigo = useCallback(
    (code: string, catSel: string): ResultadoMarca => {
      const it = buscarItem(buscables, code)
      if (!it) return { tipo: 'no-encontrado', code }
      if (it.qty <= 0) return { tipo: 'stock-cero', it }
      if (!cola.id) return { tipo: 'sin-recorrido' }
      cola.reemplazar(filaDe(it, 'exhibido', code))
      return esCruce(it, catSel) ? { tipo: 'cruce', it, catSel } : { tipo: 'ok', it }
    },
    [buscables, cola, filaDe],
  )

  /** El triage de lo que ⛔ no apareció: se guarda como fila, con su hora, igual que una tilde. */
  const setEstado = useCallback(
    (id: string, estado: ExhibEstado) => {
      const it = items.find((x) => exhibId(x) === id)
      if (!it || !cola.id) return
      cola.reemplazar(filaDe(it, estado, it.barcode || ''))
    },
    [items, cola, filaDe],
  )

  /**
   * "Va acá → corregir TN": registra el error y reasigna la categoría del ítem.
   *
   * La reasignación ⛔ no se escribe acá: `errores` alimenta `construirItems`, así que guardar el
   * error **es** cambiar la categoría del ítem y las cats se reordenan solas.
   */
  const marcarErrorCat = useCallback(
    (pid: string, catCorrecta: string) => {
      const it = items.find((x) => x.productId === pid)
      if (!it) return
      persistErrores({ ...errores, [pid]: { name: it.name, sku: it.sku || '', tnId: it.tnId || null, catTN: it.cat, catCorrecta } })
      if (cola.id) cola.reemplazar(filaDe(it, 'exhibido', it.barcode || ''))
    },
    [items, errores, persistErrores, cola, filaDe],
  )

  const quitarError = useCallback(
    (pid: string) => {
      const next = { ...errores }
      delete next[pid]
      persistErrores(next)
    },
    [errores, persistErrores],
  )

  /** Saca las tildes viejas del teléfono: las de antes del cambio, que ⛔ no tienen cuándo. */
  const borrarViejas = useCallback(() => {
    guardarLS(keyEstados(marca), {})
    setViejas(0)
  }, [marca])

  return {
    items,
    buscables,
    enCero,
    cats,
    estados,
    errores,
    cargando,
    errorMsg,
    viejas,
    borrarViejas,
    // El recorrido, igual que en el libre
    recorridoId: cola.id,
    categoria: cola.extra,
    escaneos: cola.escaneos,
    sinSubir: cola.sinSubir,
    subiendo: cola.subiendo,
    errorCola: cola.errorMsg,
    iniciarRecorrido,
    cerrar: cola.cerrar,
    eliminar: cola.eliminar,
    reintentar: cola.reintentar,
    setEstado,
    marcarPorCodigo,
    marcarErrorCat,
    quitarError,
    recargar,
  }
}

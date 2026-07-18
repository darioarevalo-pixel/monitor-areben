'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav'
import type { Producto } from '@/lib/etl/tipos'
import { cargarDatosExhib } from '@/lib/exhib/datos'
import { buscarItem, esCruce, exhibId, ordenarCats } from '@/lib/exhib/core'
import type { ExhibErrores, ExhibEstado, ExhibEstados, ExhibItem } from '@/lib/exhib/tipos'

const keyEstados = (m: Marca) => 'monitor_exhib_' + m
const keyErrores = (m: Marca) => 'monitor_exhib_err_' + m

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
export type ResultadoMarca = { tipo: 'no-encontrado'; code: string } | { tipo: 'ok'; it: ExhibItem } | { tipo: 'cruce'; it: ExhibItem; catSel: string }

/**
 * Estado del chequeo de exhibición: ítems (Supabase↔TN), estados de escaneo y errores
 * de categoría, ambos persistidos en localStorage con las MISMAS claves del iframe
 * (`monitor_exhib_<marca>` / `_err_`) → sin migración de datos. El flujo activo es el
 * lector físico (`marcarPorCodigo`); la cámara ZXing del legacy era código muerto.
 */
export function useExhib(marca: Marca, productos: Producto[]) {
  const [items, setItems] = useState<ExhibItem[]>([])
  const [cats, setCats] = useState<string[]>([])
  const [estados, setEstados] = useState<ExhibEstados>({})
  const [errores, setErrores] = useState<ExhibErrores>({})
  const [cargando, setCargando] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Cargar estados/errores de localStorage al cambiar de marca (antes de bajar datos).
  useEffect(() => {
    let vivo = true
    void (async () => {
      const est = leerLS<ExhibEstados>(keyEstados(marca), {})
      const err = leerLS<ExhibErrores>(keyErrores(marca), {})
      if (!vivo) return
      setEstados(est)
      setErrores(err)
      setCargando(true)
      setErrorMsg(null)
      try {
        const { items } = await cargarDatosExhib(marca, productos, err)
        if (!vivo) return
        setItems(items)
        setCats(ordenarCats(items))
      } catch (e) {
        if (vivo) setErrorMsg((e as Error).message)
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
    // productos se pasa estable desde el store; recargar solo al cambiar de marca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marca])

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const { items } = await cargarDatosExhib(marca, productos, errores)
      setItems(items)
      setCats(ordenarCats(items))
      setErrorMsg(null)
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [marca, productos, errores])

  const persistEstados = useCallback((next: ExhibEstados) => {
    setEstados(next)
    guardarLS(keyEstados(marca), next)
  }, [marca])
  const persistErrores = useCallback((next: ExhibErrores) => {
    setErrores(next)
    guardarLS(keyErrores(marca), next)
  }, [marca])

  const setEstado = useCallback((id: string, estado: ExhibEstado) => {
    persistEstados({ ...estados, [id]: estado })
  }, [estados, persistEstados])

  /** Marca 'exhibido' por código; devuelve el resultado para el feedback de la UI. */
  const marcarPorCodigo = useCallback((code: string, catSel: string): ResultadoMarca => {
    const it = buscarItem(items, code)
    if (!it) return { tipo: 'no-encontrado', code }
    persistEstados({ ...estados, [exhibId(it)]: 'exhibido' })
    return esCruce(it, catSel) ? { tipo: 'cruce', it, catSel } : { tipo: 'ok', it }
  }, [items, estados, persistEstados])

  /** "Va acá → corregir TN": registra el error y reasigna la categoría del ítem. */
  const marcarErrorCat = useCallback((pid: string, catCorrecta: string) => {
    const it = items.find((x) => x.productId === pid)
    if (!it) return
    persistErrores({ ...errores, [pid]: { name: it.name, sku: it.sku || '', tnId: it.tnId || null, catTN: it.cat, catCorrecta } })
    setItems((prev) => {
      const next = prev.map((x) => {
        if (x.productId !== pid) return x
        const cleanCats = x.cleanCats.includes(catCorrecta) ? x.cleanCats : [...x.cleanCats, catCorrecta]
        return { ...x, cat: catCorrecta, cleanCats }
      })
      setCats(ordenarCats(next))
      return next
    })
    persistEstados({ ...estados, [exhibId(it)]: 'exhibido' })
  }, [items, errores, estados, persistErrores, persistEstados])

  const quitarError = useCallback((pid: string) => {
    const next = { ...errores }
    delete next[pid]
    persistErrores(next)
  }, [errores, persistErrores])

  const reiniciar = useCallback(() => {
    persistEstados({})
    persistErrores({})
  }, [persistEstados, persistErrores])

  return { items, cats, estados, errores, cargando, errorMsg, setEstado, marcarPorCodigo, marcarErrorCat, quitarError, reiniciar, recargar }
}

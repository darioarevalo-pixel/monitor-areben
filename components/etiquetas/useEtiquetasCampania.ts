'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import type { EtiquetaCampania } from '@/lib/liquidacion/etiqueta'
import { formasDePagoDePrenda } from '@/lib/etiquetas/core'
import { buildEtiquetasPdf } from '@/lib/etiquetas/pdf'
import type { LabelItem, VarianteEti } from '@/lib/etiquetas/tipos'

/**
 * LOS PRECIOS DE UNA CAMPAÑA, PARA ETIQUETAR ANTES DE APLICARLOS.
 *
 * 🔴 **Por qué existe, si Etiquetas ya sabe precios.** Las otras pestañas sacan el número de Tienda
 * Nube, y eso supone que el precio ya está puesto. **En la feria del local no lo está y ⛔ no lo va
 * a estar**: los productos se OCULTAN en Tienda Nube para que el precio de remate no se publique
 * online. ⇒ preguntarle a TN devuelve el precio del sale anterior, o nada.
 *
 * 🔑 **Y eso es lo que desata el etiquetado del día de aplicar.** El orden del switch —sacar el sale,
 * ocultar en TN, aplicar— es de un día. Etiquetar 1.282 prendas ⛔ no entra en un día. Con el precio
 * saliendo de la campaña, la etiqueta se imprime cuando haya gente, y aplicar sigue siendo del
 * domingo.
 *
 * 🔑 **Entra por la llave de Etiquetas** (`&etiquetas=1`), no por la de Liquidación: se resuelve con
 * el permiso que el local ya tiene y lo que viaja es una lista blanca de cuatro campos — pid,
 * nombre, precio y si el precio es firme. ⛔ No trae costo, ni margen, ni ventas.
 */

const API = '/api/datos?recurso=liquidacion'

/** Un producto de la campaña, tal como sale de `preciosAEtiquetar`. */
export type PrecioCampania = { pid: string; nombre: string; imagen: string | null; precio: number; lista: number | null; firme: boolean }

export type CampaniaEti = { id: string; nombre: string; desde: string | null; hasta: string | null }

/**
 * Cómo se imprime la etiqueta de esta campaña: el título de arriba y el diseño (qué va debajo del
 * precio y de qué tamaño). 🔑 **Las dos cosas salen del SERVIDOR**: van en miles de etiquetas y
 * tienen que ser una sola, no una por computadora.
 */
export type RotuloCampania = { id: string; nombre: string; nombreComercial: string | null; etiqueta: EtiquetaCampania }

export interface EstadoCampania {
  campanias: CampaniaEti[]
  /**
   * El rótulo que va IMPRESO arriba del precio, tal como lo dejó quien armó la campaña. 🔑 Sale del
   * servidor y ⛔ no de esta máquina: va en miles de etiquetas y tiene que ser uno solo.
   */
  rotulo: RotuloCampania | null
  /** pid → precio de campaña. El mapa es lo que consume el escaneo. */
  porPid: Record<string, PrecioCampania>
  /** Cuántos hay de cada precio: es el recuento por MESA, que es como se piensa una feria. */
  porPrecio: { precio: number; modelos: number; firmes: number }[]
  cargando: boolean
  error: string | null
  /**
   * La campaña que se está leyendo de verdad. Con UNA sola campaña viva no hay nada que elegir, así
   * que se entra directo a escanear. 🔑 Se **deriva**, ⛔ no se guarda con un efecto: un `setState`
   * dentro de un `useEffect` es una cascada de renders y el CI lo frena.
   */
  liqEfectivo: string
}

export function useEtiquetasCampania(marca: Marca, liq: string, activo = true): EstadoCampania {
  const [campanias, setCampanias] = useState<CampaniaEti[]>([])
  const [items, setItems] = useState<PrecioCampania[]>([])
  const [rotulo, setRotulo] = useState<RotuloCampania | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const traerLista = useCallback(async () => {
    if (!activo) return
    try {
      const r = await apiFetch(`${API}&store=${marca}&etiquetas=1`)
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer las campañas.')
      setCampanias(d.campanias || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer las campañas.')
    }
  }, [marca, activo])

  const liqEfectivo = liq || (campanias.length === 1 ? campanias[0].id : '')

  const traerItems = useCallback(async () => {
    if (!activo || !liqEfectivo) {
      setItems([])
      setRotulo(null)
      return
    }
    setCargando(true)
    setError(null)
    try {
      const r = await apiFetch(`${API}&store=${marca}&etiquetas=1&precios=1&liq=${encodeURIComponent(liqEfectivo)}&nc=${Date.now()}`)
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer los precios de la campaña.')
      setItems(d.items || [])
      setRotulo(d.campania || null)
    } catch (e) {
      // 🔑 La lista se vacía al fallar, igual que la cola: seguir escaneando contra un mapa viejo
      // imprime precios que ya no son los de la campaña, y eso no se ve hasta que está en la percha.
      setItems([])
      setRotulo(null)
      setError(e instanceof Error ? e.message : 'No se pudieron leer los precios de la campaña.')
    } finally {
      setCargando(false)
    }
  }, [marca, liqEfectivo, activo])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      await traerLista()
      if (!vivo) return
    })()
    return () => {
      vivo = false
    }
  }, [traerLista])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      await traerItems()
      if (!vivo) return
    })()
    return () => {
      vivo = false
    }
  }, [traerItems])

  const porPid = useMemo(() => Object.fromEntries(items.map((i) => [i.pid, i])) as Record<string, PrecioCampania>, [items])

  const porPrecio = useMemo(() => {
    const m = new Map<number, { precio: number; modelos: number; firmes: number }>()
    for (const i of items) {
      const o = m.get(i.precio) || { precio: i.precio, modelos: 0, firmes: 0 }
      o.modelos++
      if (i.firme) o.firmes++
      m.set(i.precio, o)
    }
    return [...m.values()].sort((a, b) => a.precio - b.precio)
  }, [items])

  return { campanias, rotulo, porPid, porPrecio, cargando, error, liqEfectivo }
}

/**
 * El dibujo de la etiqueta de una campaña (el que consume `buildLibrePdf`). Lo usan la pestaña
 * «Precio de campaña» —su previa y sus dos formas de imprimir— y el armado de Reposición para las
 * prendas «para exhibir» que están en la feria (Darío, 12-oct-2026): una sola definición, para que
 * la feria salga igual imprima quien imprima.
 *
 * 🔑 **Sin nombre comercial la etiqueta es SÓLO EL PRECIO**; las condiciones del evento van debajo
 * y salen del diseño de la CAMPAÑA (se editan en Liquidación, no en cada máquina).
 */
export function dibujoDeCampania(rotulo: RotuloCampania | null, precio: number, copias: number, barcode: string) {
  return {
    grande: false,
    copias,
    barcode,
    precio,
    lineas: [{ texto: rotulo?.nombreComercial || '', tam: rotulo?.etiqueta?.tamTitulo || ('titulo' as const), bold: true }],
    lineasAbajo: rotulo?.etiqueta?.abajo || [],
    tamPrecio: rotulo?.etiqueta?.tamPrecio,
  }
}

/**
 * LA ETIQUETA POR PRENDA de una campaña (Cyber de Zattia, 30-oct-2026): por cada copia, la etiqueta
 * completa —lista tachada + precio de campaña, nombre, talle, barras, SKU— y DETRÁS la de formas de
 * pago con los montos de esa prenda. Van de a pares porque en el cartón van juntas: si cambia una,
 * cambia la otra. La usan la previa y el escaneo: una sola definición (`solo` es para la previa,
 * que muestra cada una en su recuadro).
 */
export async function pdfPorPrenda(rotulo: RotuloCampania, v: VarianteEti, item: PrecioCampania, copias: number, solo?: 'prenda' | 'fp') {
  const fp = formasDePagoDePrenda(item.precio, { pctEfectivo: rotulo.etiqueta.pctEfectivo, cuotas: rotulo.etiqueta.cuotas })
  const labels: LabelItem[] = []
  for (let c = 0; c < copias; c++) {
    if (solo !== 'fp') labels.push(v)
    if (solo !== 'prenda') labels.push({ __fp: true, lineas: fp })
  }
  return buildEtiquetasPdf(labels, 'promo', {
    precioDe: () => item.precio,
    promoDe: () => ({ normal: item.lista || item.precio, promo: item.precio }),
    fpLines: fp,
    rotuloPromo: { izq: rotulo.nombreComercial || '', bajoPrecio: rotulo.etiqueta.abajo.map((l) => l.texto).join(' · ') },
  })
}

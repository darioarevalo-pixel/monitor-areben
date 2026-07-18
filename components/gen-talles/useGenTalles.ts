'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import { guardarMapa, leerMapa } from '@/lib/kv/cliente'
import { indexarTn, type IndiceTn, type TnProducto } from '@/lib/tn'
import type { TablaGuardada } from '@/lib/gen-talles/plantillas'

/**
 * Datos de la Tabla de talles: el catálogo rico de TiendaNube (con `raw_desc`,
 * categorías y señales de calidad, para vincular productos y armar la lista de
 * pendientes) y el mapa `talles` del KV (nuestras tablas ya cargadas, por id de
 * producto de TN). Port de la carga de genTallesInit + gtGuardarVinculado
 * (index.html:7247-7258 / 7484).
 *
 * El catálogo TN se baja del mismo endpoint que las fotos (`tiendanube-audit`),
 * pero acá se guardan los productos CRUDOS (con raw_desc/categories) que
 * `useTnImages` descarta. Caché por marca a nivel de módulo (cambiar de sección y
 * volver no re-pega). `refrescar` fuerza la re-bajada tras cargar una tabla en TN.
 *
 * El KV `talles` es un mapa entero-en-cada-guardado (como el CRM): `guardarVinculado`
 * re-lee fresco y mergea SÓLO la clave del producto editado, así no pisa las tablas
 * que otro haya cargado mientras tanto (misma disciplina que Solicitudes internas).
 */

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'
const TN_CATEGORIAS = 'https://bdi-catalogo.vercel.app/api/tn-categorias'

const cacheProductos: Partial<Record<Marca, TnProducto[]>> = {}
const enVuelo: Partial<Record<Marca, Promise<void>>> = {}

async function bajarAudit(marca: Marca, refrescar = false): Promise<void> {
  if (cacheProductos[marca] && !refrescar) return
  if (!enVuelo[marca] || refrescar) {
    enVuelo[marca] = (async () => {
      try {
        const r = await fetch(`${AUDIT}?store=${marca}${refrescar ? `&refresh=1&nc=${Date.now()}` : ''}`)
        const d = await r.json()
        cacheProductos[marca] = (d && d.products) || []
      } catch {
        cacheProductos[marca] = cacheProductos[marca] || []
      } finally {
        enVuelo[marca] = undefined
      }
    })()
  }
  await enVuelo[marca]
}

export type EstadoGenTalles = {
  cargando: boolean
  tnProducts: TnProducto[]
  tnIdx: IndiceTn
  guardadas: Record<string, TablaGuardada>
  /** ¿Se pudo leer `talles:<marca>`? Sin esto, guardar lo borraría. */
  cargado: boolean
  /** Guarda (merge por-clave) la tabla de un producto en el KV. false si no se pudo. */
  guardarVinculado: (id: string, tabla: TablaGuardada) => Promise<boolean>
  /** Carga la tabla en la descripción del producto en TN. Devuelve accion o error. */
  cargarEnTN: (productId: string | number, tablaHtml: string) => Promise<{ ok: boolean; accion?: string; error?: string }>
  /** Re-baja el audit de TN (tras cargar una tabla) y devuelve el producto fresco. */
  refrescarAudit: (id?: string | number) => Promise<TnProducto | null>
}

export function useGenTalles(marca: Marca): EstadoGenTalles {
  const [cargando, setCargando] = useState(true)
  const [tnProducts, setTnProducts] = useState<TnProducto[]>([])
  const [guardadas, setGuardadas] = useState<Record<string, TablaGuardada>>({})
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      const [, mapa] = await Promise.all([bajarAudit(marca), leerMapa<TablaGuardada>('talles', marca)])
      if (!vivo) return
      setTnProducts(cacheProductos[marca] || [])
      if (mapa.ok) {
        setGuardadas(mapa.dato)
        setCargado(true)
      } else {
        setGuardadas({})
        setCargado(false)
      }
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const guardarVinculado = useCallback(
    async (id: string, tabla: TablaGuardada): Promise<boolean> => {
      if (!cargado) {
        alert('No se pudo leer las tablas guardadas, así que no se guarda nada (guardar ahora las borraría). Recargá y probá de nuevo.')
        return false
      }
      // Merge por-clave: re-leer fresco y setear sólo este producto.
      const fresca = await leerMapa<TablaGuardada>('talles', marca)
      if (!fresca.ok) {
        alert('No se pudo re-leer las tablas para guardar sin pisar las de otros: ' + fresca.motivo)
        return false
      }
      const merged = { ...fresca.dato, [id]: tabla }
      const r = await guardarMapa({ kind: 'talles', store: marca, mapa: merged, cargado: true })
      if (!r.ok) {
        alert('No se pudo guardar la tabla de talles: ' + r.motivo)
        return false
      }
      setGuardadas(merged)
      return true
    },
    [cargado, marca],
  )

  const cargarEnTN = useCallback(
    async (productId: string | number, tablaHtml: string) => {
      try {
        const r = await fetch(`${TN_CATEGORIAS}?store=${marca}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'descripcion-talles', productId, tablaHtml }),
        })
        const d = await r.json()
        if (!d.ok) return { ok: false, error: `${d.error || ''}${d.detalle ? '\n' + d.detalle : ''}` }
        return { ok: true, accion: d.accion as string }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
    [marca],
  )

  const refrescarAudit = useCallback(
    async (id?: string | number): Promise<TnProducto | null> => {
      await bajarAudit(marca, true)
      const prods = cacheProductos[marca] || []
      setTnProducts(prods)
      return id != null ? prods.find((p) => p.id === id) ?? null : null
    },
    [marca],
  )

  const tnIdx = indexarTn(tnProducts)
  return { cargando, tnProducts, tnIdx, guardadas, cargado, guardarVinculado, cargarEnTN, refrescarAudit }
}

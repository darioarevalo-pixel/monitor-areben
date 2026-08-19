'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { apiFetch } from '@/lib/api-fetch'
import { prosaDe, type Prosa } from '@/lib/tn-desc/prosa'
import type { Borrador } from '@/lib/tn-desc/formato'

/**
 * Los datos de Redacción: el catálogo de TiendaNube y la cola de `tn_descripciones`.
 *
 * El catálogo sale del mismo endpoint que usan Fotos y la Tabla de talles, pero **con
 * `?variantes=1`**: la regla que más importa del formato base es «no nombrar colores», y para
 * poder chequearla hace falta saber qué valores tienen las variantes. Ese payload ya existía
 * y ya está deployado — no hizo falta tocar `bdi-catalogo`.
 *
 * ⚠️ `?variantes=1` usa OTRA clave de caché del lado del servidor (`:var3`), así que esta
 * bajada no comparte caché con la de Fotos ni con la de Talles.
 */

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'
const COLA = '/api/datos?recurso=tn-desc'

export type ProductoTn = {
  id: string
  name: string
  raw_desc: string
  published: boolean
  categories: string[]
  image_count: number
  imagenes: { id: string; src: string }[]
  /** Los valores de todas las variantes (colores y talles). De acá sale lo que NO se nombra. */
  variantes: string[]
  prosa: Prosa
}

export type FilaCola = {
  tn_id: string
  nombre: string | null
  insumo: string | null
  insumo_por: string | null
  borrador: Borrador | null
  estado: string
  aprobado_por: string | null
  aprobado_at: string | null
  updated_at: string | null
}

const cacheProductos: Partial<Record<Marca, ProductoTn[]>> = {}
const enVuelo: Partial<Record<Marca, Promise<void>>> = {}

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizar(p: any): ProductoTn {
  const valores: string[] = []
  for (const v of p?.variantes || []) for (const val of v?.valores || []) if (val) valores.push(String(val))
  return {
    id: String(p?.id ?? ''),
    name: String(p?.name ?? ''),
    raw_desc: String(p?.raw_desc ?? ''),
    published: p?.published !== false,
    categories: p?.categories || [],
    image_count: p?.image_count ?? 0,
    imagenes: (p?.imagenes || []).filter((i: any) => i?.src),
    variantes: [...new Set(valores)],
    prosa: prosaDe(p?.raw_desc),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function bajarAudit(marca: Marca, refrescar = false): Promise<void> {
  if (cacheProductos[marca] && !refrescar) return
  if (!enVuelo[marca] || refrescar) {
    enVuelo[marca] = (async () => {
      try {
        const r = await apiFetch(`${AUDIT}?store=${marca}&variantes=1${refrescar ? `&refresh=1&nc=${Date.now()}` : ''}`)
        const d = await r.json()
        cacheProductos[marca] = ((d && d.products) || []).map(normalizar)
      } catch {
        cacheProductos[marca] = cacheProductos[marca] || []
      } finally {
        enVuelo[marca] = undefined
      }
    })()
  }
  await enVuelo[marca]
}

export type EstadoGenDesc = {
  cargando: boolean
  productos: ProductoTn[]
  cola: Record<string, FilaCola>
  /** ¿El perfil puede aprobar y publicar, o sólo cargar el insumo? Lo dice el servidor. */
  puedePublicar: boolean
  error: string | null
}

/** Baja el catálogo y la cola, y arma el estado. Puro respecto de React: no toca setState. */
async function leerTodo(marca: Marca): Promise<EstadoGenDesc> {
  let error: string | null = null
  let cola: Record<string, FilaCola> = {}
  let puedePublicar = false
  try {
    const [, r] = await Promise.all([bajarAudit(marca), apiFetch(`${COLA}&store=${marca}`)])
    const d = await r.json()
    if (!d?.ok) error = d?.error || 'No se pudo leer la cola.'
    else {
      puedePublicar = !!d.puedePublicar
      cola = Object.fromEntries(((d.filas || []) as FilaCola[]).map((f) => [String(f.tn_id), f]))
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'No se pudo leer la cola.'
  }
  return { cargando: false, productos: cacheProductos[marca] || [], cola, puedePublicar, error }
}

export function useGenDesc(marca: Marca) {
  const [estado, setEstado] = useState<EstadoGenDesc>({
    cargando: true,
    productos: [],
    cola: {},
    puedePublicar: false,
    error: null,
  })

  // ⚠️ `cargar` NO marca `cargando` al arrancar: el efecto de abajo la llama y poner estado
  // de forma síncrona dentro de un efecto encadena renders (lo caza `react-hooks/set-state-in-effect`).
  // El estado inicial ya nace en `cargando: true`, y el botón de refrescar usa `refrescar`.
  const cargar = useCallback(async () => {
    setEstado(await leerTodo(marca))
  }, [marca])

  // La carga inicial va como IIFE con guarda de vida —el molde es `useGenTalles`—: así el
  // único `setEstado` del efecto ocurre DESPUÉS de un await, y no encadena renders. El
  // estado ya nace en `cargando: true`, así que no hace falta marcarlo acá.
  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await leerTodo(marca)
      if (vivo) setEstado(r)
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  /** Re-baja el catálogo de TiendaNube salteando el caché. Va desde un botón, no desde un efecto. */
  const refrescar = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true }))
    await bajarAudit(marca, true)
    await cargar()
  }, [marca, cargar])

  /**
   * Guarda un paso de la cola. Devuelve el error o `null`.
   * 🔑 Recarga la cola después de escribir: el estado que dibuja la pantalla lo decide la
   * base, no lo que este cliente creyó haber mandado.
   */
  const guardar = useCallback(
    async (cuerpo: Record<string, unknown>): Promise<string | null> => {
      try {
        const r = await apiFetch(COLA, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recurso: 'tn-desc', store: marca, ...cuerpo }),
        })
        const d = await r.json()
        if (!r.ok || !d?.ok) return d?.error || `Error ${r.status}`
        await cargar()
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'No se pudo guardar.'
      }
    },
    [marca, cargar],
  )

  return { ...estado, cargar, refrescar, guardar }
}

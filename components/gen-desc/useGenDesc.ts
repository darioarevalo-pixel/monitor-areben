'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { apiFetch } from '@/lib/api-fetch'
import { prosaDe, type Prosa } from '@/lib/tn-desc/prosa'
import { familiaDe, type Atributo, type Cargados, type Familia } from '@/lib/tn-desc/atributos'
import type { Medida, Medidas } from '@/lib/tn-medidas/medidas'
import type { Borrador } from '@/lib/tn-desc/formato'

/**
 * Los datos de «Descripción y medidas»: el catálogo de TiendaNube y la cola de `tn_descripciones`.
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
const IA = '/api/datos?recurso=tn-desc-ia'

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
  /** Alta en TiendaNube. Es lo que separa «lo que entró esta tanda» de los 328 de siempre. */
  created_at: string
  /** La familia del diccionario. `null` = le falta la categoría en la tienda. */
  familia: Familia | null
  prosa: Prosa
}

export type FilaCola = {
  tn_id: string
  nombre: string | null
  /** La prenda elegida a mano, para los productos que en TiendaNube no tienen categoría. */
  familia: Familia | null
  insumo: string | null
  insumo_por: string | null
  borrador: Borrador | null
  estado: string
  aprobado_por: string | null
  aprobado_at: string | null
  updated_at: string | null
  /** «No lleva tabla de medidas», con su motivo de lista cerrada. `null` = sí lleva. */
  sin_medidas: string | null
  /** 🔑 La ÚNICA copia del texto que había antes. TiendaNube no tiene historial. */
  html_previo: string | null
  /** ⛔ Que el PUT diera 200 no alcanza: esto es la relectura. */
  verificado: boolean | null
  escrito_at: string | null
  error: string | null
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
    created_at: String(p?.created_at ?? ''),
    familia: familiaDe(p?.categories || []),
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

/** Lo que contesta el redactor. `borrador` puede venir CON problemas: se muestra igual. */
export type ResultadoIA = {
  ok: boolean
  error: string | null
  borrador: Borrador | null
  problemas: { campo: string; motivo: string }[]
  intentos: number
  modeloNombre: string
  /** Dólares de esta corrida, sumando los reintentos. Lo calcula el servidor. */
  costo: number
}

export type EstadoGenDesc = {
  cargando: boolean
  productos: ProductoTn[]
  cola: Record<string, FilaCola>
  /** La ficha de cada producto: `{tn_id: {atributo: valor}}`. De acá salen los bullets. */
  atributos: Record<string, Cargados>
  /** Las medidas: `{tn_id: {talle: {medida: valor}}}`. Sin talles, la clave es `''`. */
  medidas: Record<string, Medidas>
  /** ¿El perfil puede aprobar y publicar, o sólo cargar el insumo? Lo dice el servidor. */
  puedePublicar: boolean
  error: string | null
}

/** Baja el catálogo y la cola, y arma el estado. Puro respecto de React: no toca setState. */
async function leerTodo(marca: Marca): Promise<EstadoGenDesc> {
  let error: string | null = null
  let cola: Record<string, FilaCola> = {}
  let atributos: Record<string, Cargados> = {}
  let medidas: Record<string, Medidas> = {}
  let puedePublicar = false
  try {
    const [, r] = await Promise.all([bajarAudit(marca), apiFetch(`${COLA}&store=${marca}`)])
    const d = await r.json()
    if (!d?.ok) error = d?.error || 'No se pudo leer la cola.'
    else {
      puedePublicar = !!d.puedePublicar
      cola = Object.fromEntries(((d.filas || []) as FilaCola[]).map((f) => [String(f.tn_id), f]))
      atributos = (d.atributos || {}) as Record<string, Cargados>
      medidas = (d.medidas || {}) as Record<string, Medidas>
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'No se pudo leer la cola.'
  }
  return { cargando: false, productos: cacheProductos[marca] || [], cola, atributos, medidas, puedePublicar, error }
}

export function useGenDesc(marca: Marca) {
  const [estado, setEstado] = useState<EstadoGenDesc>({
    cargando: true,
    productos: [],
    cola: {},
    atributos: {},
    medidas: {},
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

  /**
   * Guarda UN atributo de la ficha. Devuelve el error o `null`.
   *
   * 🔑 **Se guarda al elegir, sin botón.** Son 6 desplegables por producto: un botón «Guardar»
   * que junta los seis es un botón que alguien no aprieta, y ahí se pierde la ficha entera. Es
   * la misma lección que la nota que se perdió en MAKETA — la red va abajo del campo, no arriba.
   *
   * ⚠️ Y **no** recarga la cola después de escribir, a diferencia de `guardar`: recargar el
   * catálogo entero seis veces seguidas mientras alguien completa una ficha haría que la
   * pantalla parpadee en cada elección. El estado local se actualiza con lo que confirmó el
   * servidor (`d.valor`), que es lo que quedó guardado — no lo que el `<select>` creía tener.
   */
  /**
   * Guarda qué prenda es, para los productos que en TiendaNube no tienen categoría.
   *
   * 🔴 Son dos de los 328 (medido el 27-ago-2026) y la lista los muestra ARRIBA, porque ordena
   * los mudos primero: el local se choca con ellos antes que con ningún otro. Bloquearlos hasta
   * que alguien arregle la categoría en la tienda es dejarlos mudos por algo que no depende de
   * quien está cargando.
   */
  const guardarFamilia = useCallback(
    async (tnId: string, familia: Familia, nombre?: string): Promise<string | null> => {
      try {
        const r = await apiFetch(COLA, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recurso: 'tn-desc', store: marca, tn_id: tnId, op: 'familia', familia, nombre }),
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

  const guardarAtributo = useCallback(
    async (tnId: string, familia: Familia, atributo: Atributo, valor: string, nombre?: string, propuesto?: boolean): Promise<string | null> => {
      try {
        const r = await apiFetch(COLA, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recurso: 'tn-desc', store: marca, tn_id: tnId, op: 'atributos', familia, atributo, valor, nombre, propuesto }),
        })
        const d = await r.json()
        if (!r.ok || !d?.ok) return d?.error || `Error ${r.status}`
        setEstado((e) => {
          const ficha = { ...(e.atributos[tnId] || {}) }
          if (d.valor) ficha[atributo] = d.valor as string
          else delete ficha[atributo]
          return { ...e, atributos: { ...e.atributos, [tnId]: ficha } }
        })
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'No se pudo guardar.'
      }
    },
    [marca],
  )

  /**
   * Guarda una medida. Misma forma que `guardarAtributo` —una por llamada, se guarda al tipear—
   * y por el mismo motivo: un botón «Guardar» que junta doce números es un botón que alguien no
   * aprieta, y ahí se pierde la carga de una prenda entera.
   *
   * 🔑 `ficha` viaja en el pedido porque el servidor **vuelve a preguntar** qué se le mide a esta
   * prenda, y para eso necesita saber si tiene mangas. Que el casillero no se dibuje es una
   * comodidad del que carga, no un candado.
   */
  const guardarMedida = useCallback(
    async (tnId: string, familia: Familia, ficha: Cargados, talle: string, medida: Medida, valor: string, nombre?: string): Promise<string | null> => {
      try {
        const r = await apiFetch(COLA, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recurso: 'tn-desc', store: marca, tn_id: tnId, op: 'medida', familia, ficha, talle, medida, valor, nombre }),
        })
        const d = await r.json()
        if (!r.ok || !d?.ok) return d?.error || `Error ${r.status}`
        setEstado((e) => {
          const delProducto: Medidas = { ...(e.medidas[tnId] || {}) }
          const delTalle = { ...(delProducto[talle] || {}) }
          if (d.valor) delTalle[medida] = d.valor as string
          else delete delTalle[medida]
          delProducto[talle] = delTalle
          return { ...e, medidas: { ...e.medidas, [tnId]: delProducto } }
        })
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'No se pudo guardar.'
      }
    },
    [marca],
  )

  /** «Esta prenda no lleva tabla de medidas», con su motivo. Vacío lo saca. */
  const marcarSinMedidas = useCallback(
    async (tnId: string, motivo: string, nombre?: string): Promise<string | null> => {
      try {
        const r = await apiFetch(COLA, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recurso: 'tn-desc', store: marca, tn_id: tnId, op: 'sin-medidas', motivo, nombre }),
        })
        const d = await r.json()
        if (!r.ok || !d?.ok) return d?.error || `Error ${r.status}`
        setEstado((e) => {
          const fila = e.cola[tnId]
          if (!fila) return e
          return { ...e, cola: { ...e.cola, [tnId]: { ...fila, sin_medidas: (d.motivo as string) || null } } }
        })
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'No se pudo guardar.'
      }
    },
    [marca],
  )

  /**
   * Le pide un borrador al modelo. **No guarda nada**: devuelve el texto para que alguien lo
   * mire. Guardar y aprobar siguen siendo dos botones aparte, y los aprieta una persona.
   *
   * 🔴 Es la única llamada de la pantalla que gasta plata, así que el error se devuelve para
   * mostrarlo tal cual: un fallo silencioso acá se lee como «el modelo no supo qué decir» y
   * lleva a apretar de nuevo, que cuesta otra vez.
   */
  const redactar = useCallback(
    async (cuerpo: Record<string, unknown>): Promise<ResultadoIA> => {
      const vacio = { ok: false, borrador: null, problemas: [], intentos: 0, modeloNombre: '', costo: 0 }
      try {
        const r = await apiFetch(IA, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recurso: 'tn-desc-ia', store: marca, ...cuerpo }),
        })
        const d = await r.json()
        if (!r.ok || !d?.ok) return { ...vacio, ...d, ok: false, error: d?.error || `Error ${r.status}` }
        return d as ResultadoIA
      } catch (e) {
        return { ...vacio, error: e instanceof Error ? e.message : 'No se pudo redactar.' }
      }
    },
    [marca],
  )

  /**
   * Publica el borrador aprobado en TiendaNube. Es el único botón de la pantalla que sale a
   * la tienda en vivo.
   *
   * 🔑 El navegador no compone ni escribe: manda `op:'publicar'` y el servidor hace los
   * cuatro pasos seguidos —leer fresco, respaldar, escribir con compare-and-swap, releer—.
   * Va así para que cerrar la pestaña en el medio no pueda dejar la tienda escrita y la fila
   * diciendo que no.
   *
   * 🔴 Devuelve `verificado` aparte de `ok`: un 200 del PUT no prueba que la escritura haya
   * pasado, y esa diferencia tiene que llegar hasta la pantalla.
   */
  const publicar = useCallback(
    async (tnId: string, conservarResiduo: boolean): Promise<{ error: string | null; verificado: boolean }> => {
      try {
        const r = await apiFetch(COLA, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recurso: 'tn-desc', store: marca, tn_id: tnId, op: 'publicar', conservarResiduo }),
        })
        const d = await r.json()
        await cargar()
        if (!r.ok || !d?.ok) return { error: d?.error || `Error ${r.status}`, verificado: false }
        return { error: null, verificado: !!d.verificado }
      } catch (e) {
        await cargar()
        return { error: e instanceof Error ? e.message : 'No se pudo publicar.', verificado: false }
      }
    },
    [marca, cargar],
  )

  return { ...estado, cargar, refrescar, guardar, guardarAtributo, guardarMedida, marcarSinMedidas, guardarFamilia, redactar, publicar }
}

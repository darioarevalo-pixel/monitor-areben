'use client'

/**
 * El censo de campañas de Meta y todo lo que se calcula sobre él: los diagnósticos por línea, las
 * correcciones a mano (etapa y marca) y la palanca para accionar.
 *
 * # Por qué existe
 *
 * 🔑 **Los tres cálculos vivían adentro de un componente de 1.277 líneas, y por eso la sección no se
 * podía repartir.** El Panel, el Embudo, las Campañas y las Ideas necesitan exactamente los mismos
 * datos —el censo, los overrides, las asignaciones de línea y los diagnósticos ya cruzados—, pero
 * mientras eso se armaba adentro de `Etapas.tsx` la única forma de tener otra pantalla era copiar
 * los `useEffect`, los `useMemo` y los handlers. Copiar `asignar()` en dos lados es tener dos
 * criterios sobre de quién es la plata.
 *
 * # Las tres cosas que hay que respetar si se toca
 *
 * 1. 🔑 **Pedir de nuevo es un cambio de DEPENDENCIA del efecto (`pedido`), no un borrado del
 *    resultado.** Vaciar el estado pinta «cargando» sin que salga ningún fetch — es exactamente lo
 *    que dejaba el panel colgado para siempre después de asignar una campaña.
 * 2. 🔑 **Los diagnósticos se calculan acá arriba, con los overrides ya puestos.** Sin eso, la
 *    corrección se guarda en la base y la pantalla sigue mostrando la clasificación automática, que
 *    es peor que no tener override: alguien lo corrigió y no pasó nada.
 * 3. 🔑 **La marca sale de la LÍNEA (`baseDeLinea`), no del sidebar.** Es lo único para lo que hace
 *    falta una marca acá adentro: las ideas y las correcciones viven en Supabase por store y Stunned
 *    no tiene base propia.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useMeta } from '@/components/meta-ads/ContextoMeta'
import { useAvisos, type Avisos } from '@/components/meta-ads/Avisos'
import { useConjuntos, type Conjuntos } from '@/components/meta-ads/Conjuntos'
import { useAccionMeta, type AccionMeta } from '@/components/meta-ads/acciones'
import { traerEtapas } from '@/lib/meta-ads/cliente'
import { diagnosticar, ETIQUETA_ETAPA, mapaOverrides, UMBRALES_ETAPA } from '@/lib/meta-ads/etapas'
import {
  asignarLinea, clasificarCampaña, desasignarLinea, desclasificarCampaña, leerIdeas, SUB_PAUTAR,
  type Idea, type OverrideEtapa, type PoderesIdeas,
} from '@/lib/meta-ads/ideas'
import { baseDeLinea, ETIQUETA_LINEA, LINEAS, lineasDeMarca } from '@/lib/meta-ads/lineas'
import type {
  AsignacionLinea, CampañaEtapa, Diagnostico, Etapa, LineaPauta, RespuestaEtapas,
} from '@/lib/meta-ads/tipos'
import type { Marca } from '@/lib/nav.datos'
import { esAdmin, marcasConAcceso, puedeSub } from '@/lib/permisos'
import { useToast } from '@/components/ui'

export type Cargable<T> = { fase: 'cargando' } | { fase: 'error'; motivo: string } | { fase: 'ok'; data: T }

/** Lo que hace falta para corregir la etapa —y la marca— de una campaña desde la tabla. */
export type Correccion = {
  /** Las correcciones vigentes, por campaña. Vacío mientras no las lea nadie. */
  porCampaña: Record<string, OverrideEtapa>
  puedePautar: boolean
  onCorregir: (c: CampañaEtapa) => void
  onVolverAuto: (c: CampañaEtapa) => void
  /** La línea asignada de cada campaña, por id. */
  lineaPorCampaña: Record<string, AsignacionLinea>
  /** Si esta persona puede mover plata HACIA esa línea. Se pregunta por línea, no por sesión. */
  puedeAsignarEn: (linea: LineaPauta) => boolean
  onAsignar: (c: CampañaEtapa, linea: LineaPauta) => void
  onDesasignar: (c: CampañaEtapa) => void
}

/**
 * Lo que hace falta para accionar desde una tabla. Va junto y no como cuatro props sueltas porque
 * las cuatro viajan siempre a la misma profundidad y son inútiles por separado.
 */
export type Palanca = {
  acciones: AccionMeta['acciones']
  conjuntos: Conjuntos
  /** La moneda de la cuenta que corre cada campaña: define la unidad menor con la que Meta escribe. */
  monedaDe: (cuentaId: string) => string
  /**
   * El nombre de la cuenta publicitaria. Se usa **sólo para desempatar** dos campañas del mismo
   * nombre. Mostrarlo siempre sería una columna de ruido.
   */
  cuentaDe: (cuentaId: string) => string
}

export type Campanias = {
  dias: number
  setDias: (d: number) => void
  estado: Cargable<RespuestaEtapas>
  /** Un diagnóstico por línea, con las correcciones a mano ya aplicadas. */
  diagPorLinea: Partial<Record<LineaPauta, Diagnostico>> | null
  /** El de la línea abierta, o `null` si esta persona no la puede ver. */
  diag: Diagnostico | null
  lineaAbierta: LineaPauta
  abrirLinea: (l: LineaPauta) => void
  /** La marca del monitor de la que sale la base de Supabase. Derivada de la línea. */
  marca: Marca
  visibles: readonly Marca[]
  correccion: Correccion
  /** La campaña que se está corrigiendo, para el modal. */
  corrigiendo: CampañaEtapa | null
  cerrarCorreccion: () => void
  corregir: (c: CampañaEtapa, etapa: Etapa, motivo: string) => void
  funnel: Funnel
  avisos: Avisos
  palanca: Palanca
  accion: AccionMeta
  /** El diagnóstico de la MARCA (no de la línea): es de la marca el tablero de ideas. */
  diagDeLaMarca: Diagnostico | null
  campañasDeLaMarca: CampañaEtapa[]
  /** Volver a pedir el censo y las asignaciones. Lo llama quien asigna o acciona. */
  recargarTodo: () => void
}

export function useCampanias(): Campanias {
  const { perfil } = useSesion()
  const { linea: lineaEje, setLinea } = useMeta()
  const toast = useToast()
  const [dias, setDias] = useState<number>(UMBRALES_ETAPA.dias)
  const [r, setR] = useState<{ key: string; e: Cargable<RespuestaEtapas> } | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<CampañaEtapa | null>(null)
  const visibles = useMemo(() => marcasConAcceso(perfil, 'meta-ads', ['bdi', 'zattia']), [perfil])

  /**
   * Qué línea está abierta: la del selector de la sección, y con «Todas» la primera que esta persona
   * pueda ver.
   *
   * ⛔ **No filtra la grilla del Embudo**, ni con una línea elegida: las tres se ven siempre, porque
   * el hueco de la que NO estás mirando es justamente el que nadie ve. Elegir una abre su detalle.
   */
  const lineaAbierta: LineaPauta = lineaEje !== 'todas'
    ? lineaEje
    : (visibles.includes('bdi') ? 'bdi' : 'zattia')
  const abrirLinea = useCallback((l: LineaPauta) => setLinea(l), [setLinea])
  const marca = (baseDeLinea(lineaAbierta) ?? visibles[0] ?? 'bdi') as Marca

  // Ya no viaja la marca: el censo es el mismo para las tres líneas y el servidor devuelve sólo las
  // que este perfil puede ver. Ver la nota 1 de la cabecera sobre `pedido`.
  const [pedido, setPedido] = useState(0)
  const key = `${dias}|${pedido}`
  useEffect(() => {
    let vivo = true
    traerEtapas(dias).then((res) => {
      if (!vivo) return
      setR({ key: `${dias}|${pedido}`, e: res.ok ? { fase: 'ok', data: res.dato } : { fase: 'error', motivo: res.motivo } })
    })
    return () => { vivo = false }
  }, [dias, pedido])

  // El `useMemo` no es de rendimiento: sin él, el objeto `{ fase: 'cargando' }` es nuevo en cada
  // render y arrastra a los diagnósticos —que son lo caro de acá— a recalcularse siempre. Mismo
  // motivo que en `ContextoMeta.tsx`.
  const estado: Cargable<RespuestaEtapas> = useMemo(
    () => (!r || r.key !== key ? { fase: 'cargando' } : r.e),
    [r, key],
  )
  // Los avisos de cada campaña, a demanda. Cuelgan de `dias` porque su gasto se lee al lado del de
  // la campaña y con otra ventana no cerrarían.
  const avisos = useAvisos(dias)
  const funnel = useFunnel(marca, visibles)

  const overrides = useMemo(() => mapaOverrides(funnel.overrides), [funnel.overrides])
  const porCampaña = useMemo(
    () => Object.fromEntries(funnel.overrides.map((o) => [o.campaign_id, o])) as Record<string, OverrideEtapa>,
    [funnel.overrides],
  )
  const lineaPorCampaña = useMemo(
    () => Object.fromEntries(funnel.lineas.map((l) => [l.campaign_id, l])) as Record<string, AsignacionLinea>,
    [funnel.lineas],
  )

  const diagPorLinea = useMemo(() => {
    if (estado.fase !== 'ok') return null
    const out: Partial<Record<LineaPauta, Diagnostico>> = {}
    for (const l of LINEAS) {
      const suyas = estado.data.lineas[l]
      if (suyas) out[l] = diagnosticar(suyas, { overrides, marca: ETIQUETA_LINEA[l] })
    }
    return out
  }, [estado, overrides])

  const diag = diagPorLinea?.[lineaAbierta] ?? null
  // El tablero de ideas es de la MARCA, no de la línea: Stunned no tiene tablero propio y sus ideas
  // se anotan en el de Zattia, que es de donde cuelga (ver `lineas.core.js`).
  const diagDeLaMarca = diagPorLinea?.[marca as LineaPauta] ?? null
  const campañasDeLaMarca = useMemo(
    () => lineasDeMarca(marca).flatMap((l) => diagPorLinea?.[l]?.etapas.flatMap((e) => e.alAire) ?? []),
    [diagPorLinea, marca],
  )

  /** Recargar las dos cosas: asignar mueve campañas de línea y eso cambia todos los diagnósticos. */
  const recargarFunnel = funnel.recargar
  const recargarTodo = useCallback(() => {
    recargarFunnel()
    setPedido((p) => p + 1)
  }, [recargarFunnel])

  const corregir = useCallback(async (c: CampañaEtapa, etapa: Etapa, motivo: string) => {
    try {
      await clasificarCampaña(marca, {
        campaignId: c.id, etapa, cuentaId: c.cuentaId, objetivo: c.objetivo, nombre: c.nombre, motivo,
      })
      setCorrigiendo(null)
      toast.ok(`Ahora cuenta como «${ETIQUETA_ETAPA[etapa]}».`)
      recargarFunnel()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo corregir la etapa.')
    }
  }, [marca, toast, recargarFunnel])

  const volverAuto = useCallback(async (c: CampañaEtapa) => {
    try {
      await desclasificarCampaña(marca, c.id)
      toast.ok('Vuelve a clasificarse por su objetivo en Meta.')
      recargarFunnel()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo volver a la clasificación automática.')
    }
  }, [marca, toast, recargarFunnel])

  // Se pregunta por la marca de la LÍNEA, no por la de la sesión: alguien parado en BDI que también
  // pautea Zattia puede asignarle una campaña a Zattia sin cambiar de marca arriba. Es la misma
  // función que usa el servidor (`lib/permisos.core.js`), importada, no copiada.
  const puedeAsignarEn = useCallback((linea: LineaPauta) => {
    const base = baseDeLinea(linea)
    return !!base && (esAdmin(perfil) || puedeSub(perfil, base, 'meta-ads', SUB_PAUTAR))
  }, [perfil])

  const asignar = useCallback(async (c: CampañaEtapa, linea: LineaPauta) => {
    try {
      await asignarLinea(marca, {
        campaignId: c.id, linea, cuentaId: c.cuentaId, objetivo: c.objetivo, nombre: c.nombre,
      })
      toast.ok(`«${c.nombre}» ahora cuenta como ${ETIQUETA_LINEA[linea]}.`)
      recargarTodo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo asignar la marca.')
    }
  }, [marca, toast, recargarTodo])

  const desasignar = useCallback(async (c: CampañaEtapa) => {
    try {
      await desasignarLinea(marca, c.id)
      toast.ok('Vuelve a quedar sin marca: su plata no la cuenta nadie.')
      recargarTodo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo sacar la marca.')
    }
  }, [marca, toast, recargarTodo])

  const correccion: Correccion = {
    porCampaña,
    puedePautar: funnel.puede.pautar || funnel.puede.admin,
    onCorregir: setCorrigiendo,
    onVolverAuto: volverAuto,
    lineaPorCampaña,
    puedeAsignarEn,
    onAsignar: asignar,
    onDesasignar: desasignar,
  }

  // ── Accionar sobre la pauta ───────────────────────────────────────────────────────────────────
  // Los conjuntos de una campaña, a demanda al desplegar la fila. Van acá y no adentro de la tabla
  // porque después de accionar sobre uno hay que volver a pedirlos.
  const conjuntos = useConjuntos(dias)

  /**
   * Recargar el censo, LAS ASIGNACIONES y los conjuntos abiertos.
   *
   * 🔴 **Las asignaciones también, y esto se vio recién al duplicar en prod.** Duplicar escribe una
   * fila nueva en `meta_ads_campania_linea` (la copia hereda la línea del original) y el censo la
   * reparte bien enseguida — pero la columna «Marca» y los botones se dibujan con `funnel.lineas`,
   * que no se estaba recargando: la copia aparecía «sin marca» y sin acciones hasta recargar a mano.
   */
  const recargarTrasAccion = useCallback(() => {
    setPedido((p) => p + 1)
    recargarFunnel()
    for (const id of conjuntos.abiertas) conjuntos.recargar(id)
  }, [conjuntos, recargarFunnel])

  const accion = useAccionMeta(recargarTrasAccion)

  // La moneda de la cuenta que corre cada campaña. **No es un detalle**: Meta maneja los
  // presupuestos en la unidad MENOR de la moneda, así que sin esto no se pueden ni mostrar ni
  // escribir. Viene del censo, en el mismo `?fields=` que ya pedía el nombre de la cuenta.
  const cuentas = estado.fase === 'ok' ? estado.data.cuentas : null
  const monedaDe = useCallback(
    (cuentaId: string) => cuentas?.find((x) => x.id === cuentaId)?.moneda || 'ARS',
    [cuentas],
  )
  const cuentaDe = useCallback(
    (cuentaId: string) => cuentas?.find((x) => x.id === cuentaId)?.nombre || '',
    [cuentas],
  )

  const palanca: Palanca = { acciones: accion.acciones, conjuntos, monedaDe, cuentaDe }

  return {
    dias, setDias, estado, diagPorLinea, diag, lineaAbierta, abrirLinea, marca, visibles,
    correccion, corrigiendo, cerrarCorreccion: useCallback(() => setCorrigiendo(null), []), corregir,
    funnel, avisos, palanca, accion, diagDeLaMarca, campañasDeLaMarca, recargarTodo,
  }
}

export type Funnel = {
  ideas: Idea[]
  overrides: OverrideEtapa[]
  lineas: AsignacionLinea[]
  puede: PoderesIdeas
  caido: string | null
  cargando: boolean
  recargar: () => void
}

/**
 * Las ideas y las correcciones de etapa, que viven en la base del monitor y no en Meta.
 *
 * Su falla **no tumba nada**: si la tabla todavía no está migrada en esta marca, el diagnóstico
 * sigue siendo válido (clasificación automática) y lo único que se pierde es el tablero. Es la
 * misma decisión que toma el calendario con el renglón «Etapas armadas».
 */
function useFunnel(marca: string, visibles: readonly Marca[]): Funnel {
  const [nonce, setNonce] = useState(0)
  const [d, setD] = useState<{
    key: string
    ideas: Idea[]
    overrides: OverrideEtapa[]
    lineas: AsignacionLinea[]
    puede: PoderesIdeas
    caido: string | null
  } | null>(null)

  // Las correcciones de etapa viven en la base de CADA marca (`meta_ads_etapa` tiene columna
  // `store`), pero la grilla muestra las tres líneas juntas: leyendo sólo la base de la marca del
  // header, la fila de la otra saldría con la clasificación automática y el número de la grilla no
  // coincidiría con el del detalle. Por eso se leen todas las marcas visibles y se juntan — los
  // `campaign_id` son únicos en Meta, así que no hay riesgo de que se pisen.
  const otras = visibles.filter((m) => m !== marca)
  const keyOtras = otras.join(',')
  const key = `${marca}|${keyOtras}|${nonce}`
  useEffect(() => {
    let vivo = true
    const k = `${marca}|${keyOtras}|${nonce}`
    const extra = keyOtras ? keyOtras.split(',') : []
    Promise.all([
      leerIdeas(marca as Parameters<typeof leerIdeas>[0]),
      // Si la otra marca falla (tabla sin migrar, permiso raro), se pierden SUS overrides y nada
      // más: el diagnóstico de la marca en la que estás parado no se cae por eso.
      ...extra.map((m) => leerIdeas(m as Parameters<typeof leerIdeas>[0]).catch(() => null)),
    ])
      .then(([mia, ...resto]) => {
        if (!vivo) return
        const overrides = [...mia.overrides, ...resto.flatMap((x) => x?.overrides ?? [])]
        setD({ key: k, ideas: mia.ideas, overrides, lineas: mia.lineas, puede: mia.puede, caido: null })
      })
      .catch((e) => {
        if (vivo) {
          setD({
            key: k,
            ideas: [], overrides: [], lineas: [], puede: { pautar: false, admin: false },
            caido: e instanceof Error ? e.message : 'no se pudieron leer',
          })
        }
      })
    return () => { vivo = false }
  }, [marca, keyOtras, nonce])

  const listo = d && d.key === key
  return {
    ideas: listo ? d.ideas : SIN_IDEAS,
    overrides: listo ? d.overrides : SIN_OVERRIDES,
    lineas: listo ? d.lineas : SIN_LINEAS,
    puede: listo ? d.puede : SIN_PODERES,
    caido: listo ? d.caido : null,
    cargando: !listo,
    recargar: useCallback(() => setNonce((n) => n + 1), []),
  }
}

/** Constantes de módulo: si fueran literales, cambiarían de identidad en cada render y los
 *  `useMemo` que dependen de ellas se recalcularían siempre. */
const SIN_IDEAS: Idea[] = []
const SIN_OVERRIDES: OverrideEtapa[] = []
const SIN_LINEAS: AsignacionLinea[] = []
const SIN_PODERES: PoderesIdeas = { pautar: false, admin: false }

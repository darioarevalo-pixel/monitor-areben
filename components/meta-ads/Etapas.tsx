'use client'

/**
 * Etapas de la pauta — a QUIÉN le está hablando la plata.
 *
 * ⚠️ No confundir con el bloque "Del clic a la compra" del Resumen: ese es el embudo transaccional
 * (qué pasa con quien YA hizo clic). Esto es otra cosa y por eso no comparte ni una palabra en el
 * título: son las tres etapas de la pauta (TOFU/MOFU/BOFU), que dicen si le estás hablando a gente
 * que no te conoce, a la que te está considerando, o a la que está por comprar.
 *
 * # Para quién es esta pantalla
 *
 * **No es para el que compra medios: es para el que tiene que craneаr los creativos.** La pauta la
 * arma Bruno; lo que faltaba era que el equipo de marketing viera qué estadios están corriendo y
 * cuáles están vacíos, para pensar las piezas del que falta. De ahí las tres decisiones de diseño
 * que parecen cosméticas y no lo son:
 *
 *  1. **Un solo veredicto arriba, en una frase, sin jerga.** No un tablero de números para
 *     interpretar. Si hay que leer tres tarjetas y sacar la conclusión, no se saca.
 *  2. **La etapa vacía se DIBUJA vacía** (borde punteado, sin relleno). El hueco tiene que verse,
 *     no leerse.
 *  3. **Las siglas aparecen una sola vez**, chiquitas, al pie del popover de ayuda.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSesion } from '@/components/SesionProvider'
import { BotonAvisos, PanelAvisos, useAvisos, type Avisos } from '@/components/meta-ads/Avisos'
import { PanelConjuntos, useConjuntos, type Conjuntos } from '@/components/meta-ads/Conjuntos'
import {
  BotonesAccion, ModalPresupuesto, useAccionMeta, type Acciones, type ObjetoMeta,
} from '@/components/meta-ads/ConfirmAccion'
import { TableroIdeas } from '@/components/meta-ads/TableroIdeas'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { hoyIso, laQueAprieta, proximas, type EntradaCalendario } from '@/lib/calendario'
import { leerCalendario } from '@/lib/calendario/persistencia'
import { traerEtapas } from '@/lib/meta-ads/cliente'
import { aMonto, permiteAccion, type ClaveAccion } from '@/lib/meta-ads/acciones'
import {
  diagnosticar, estaAlAire, ETAPAS, ETIQUETA_ETAPA, mapaOverrides, overrideViejo, RESUMEN_ETAPA,
  rotuloObjetivo, UMBRALES_ETAPA,
} from '@/lib/meta-ads/etapas'
import {
  asignarLinea, clasificarCampaña, desasignarLinea, desclasificarCampaña, leerIdeas, SUB_PAUTAR,
  type Idea, type OverrideEtapa, type PoderesIdeas,
} from '@/lib/meta-ads/ideas'
import { baseDeLinea, ETIQUETA_LINEA, LINEAS, lineasDeMarca } from '@/lib/meta-ads/lineas'
import type {
  AsignacionLinea, CampañaEtapa, CampañaSinLinea, Diagnostico, Etapa, LineaPauta, ResumenEtapa,
  RespuestaEtapas,
} from '@/lib/meta-ads/tipos'
import type { Marca } from '@/lib/nav.datos'
import { esAdmin, marcasConAcceso, puedeSub } from '@/lib/permisos'
import {
  Button, Card, EmptyState, Field, Input, Modal, Notice, SectionCard, Select, StatusPill,
  TBody, TableWrap, Td, Th, THead, Tr, useToast,
  color, font, radius, space, weight, type Tone,
} from '@/components/ui'

type Cargable<T> = { fase: 'cargando' } | { fase: 'error'; motivo: string } | { fase: 'ok'; data: T }

/** Lo que hace falta para corregir la etapa —y la marca— de una campaña desde la tabla. */
type Correccion = {
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

/** Por qué una campaña que figura activa igual no ofrece botones. Ver `estaAlAire`. */
const INERTE = 'Figura activa pero no entregó nada en la ventana: suele ser una publicación de Instagram promocionada, que Meta deja ACTIVE para siempre.'

const nf = new Intl.NumberFormat('es-AR')
const money = (v: number) => `$ ${nf.format(Math.round(v || 0))}`
const pct = (p: number) => `${Math.round((p || 0) * 100)}%`

/** El tono de cada estado. Es el mismo mapa que usa el borde, el texto y el semáforo del veredicto. */
const TONO: Record<ResumenEtapa['estado'], Tone> = { ok: 'success', floja: 'warning', vacia: 'danger' }

export function Etapas() {
  const { marca, perfil } = useSesion()
  const toast = useToast()
  const [dias, setDias] = useState(UMBRALES_ETAPA.dias)
  const [r, setR] = useState<{ key: string; e: Cargable<RespuestaEtapas> } | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<CampañaEtapa | null>(null)
  /**
   * Qué línea está abierta abajo de la grilla. Arranca en la marca del header —que es donde la
   * persona ya estaba parada— y de ahí en más la manda la grilla. **No filtra la grilla**: las tres
   * líneas se ven siempre, porque el hueco de la que no estás mirando es justamente el que nadie ve.
   *
   * La marca viaja adentro de lo elegido y se compara al renderizar, en vez de resetearse con un
   * efecto: cambiar de marca arriba tiene que volver al default de la marca nueva, y un efecto que
   * lo corrige después deja un render intermedio mostrando la línea de la marca anterior.
   */
  const [elegida, setElegida] = useState<{ marca: string; linea: LineaPauta } | null>(null)
  const lineaAbierta: LineaPauta = elegida && elegida.marca === marca
    ? elegida.linea
    : (marca === 'zattia' ? 'zattia' : 'bdi')
  const abrirLinea = useCallback((l: LineaPauta) => setElegida({ marca, linea: l }), [marca])

  // Ya no viaja la marca: el censo es el mismo para las tres líneas (una sola cuenta publicitaria)
  // y el servidor devuelve sólo las que este perfil puede ver.
  //
  // `pedido` es lo que hace recargable a este censo: pedirlo de nuevo tiene que ser un cambio de
  // DEPENDENCIA del efecto, no un borrado del resultado. Vaciar `r` deja la pantalla en «cargando»
  // sin que salga ningún fetch —el efecto sólo miraba `dias`—, y eso es exactamente lo que dejaba
  // el panel colgado después de asignar una campaña.
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

  const estado: Cargable<RespuestaEtapas> = !r || r.key !== key ? { fase: 'cargando' } : r.e
  // Los avisos de cada campaña, a demanda. Cuelgan de `dias` porque su gasto se lee al lado del de
  // la campaña y con otra ventana no cerrarían.
  const avisos = useAvisos(dias)
  const fechas = useFechas(marca)
  const fecha = useMemo(() => laQueAprieta(fechas), [fechas])
  const visibles = useMemo(() => marcasConAcceso(perfil, 'meta-ads', ['bdi', 'zattia']), [perfil])
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

  // Un diagnóstico POR LÍNEA, todos con las correcciones a mano puestas: sin esto, el override se
  // guarda en la base y la pantalla sigue mostrando la clasificación automática, que es peor que
  // no tener override (alguien lo corrigió y no pasó nada).
  //
  // Se calculan acá arriba y no adentro de `Contenido` porque la grilla y el tablero de abajo
  // necesitan los mismos: la etapa que el veredicto está pidiendo es la que viene preelegida al
  // anotar una idea.
  const diagPorLinea = useMemo(() => {
    const e = !r || r.key !== key ? null : r.e
    if (!e || e.fase !== 'ok') return null
    const out: Partial<Record<LineaPauta, Diagnostico>> = {}
    for (const l of LINEAS) {
      const suyas = e.data.lineas[l]
      if (suyas) out[l] = diagnosticar(suyas, { overrides, marca: ETIQUETA_LINEA[l] })
    }
    return out
  }, [r, key, overrides])

  const diag = diagPorLinea?.[lineaAbierta] ?? null
  // El tablero de ideas es de la MARCA, no de la línea: Stunned no tiene tablero propio y sus ideas
  // se anotan en el de Zattia, que es de donde cuelga (ver `lineas.core.js`).
  const diagDeLaMarca = diagPorLinea?.[marca as LineaPauta] ?? null
  const campañasDeLaMarca = useMemo(
    () => lineasDeMarca(marca as Marca).flatMap((l) => diagPorLinea?.[l]?.etapas.flatMap((e) => e.alAire) ?? []),
    [diagPorLinea, marca],
  )

  async function corregir(c: CampañaEtapa, etapa: Etapa, motivo: string) {
    try {
      await clasificarCampaña(marca, {
        campaignId: c.id, etapa, cuentaId: c.cuentaId, objetivo: c.objetivo, nombre: c.nombre, motivo,
      })
      setCorrigiendo(null)
      toast.ok(`Ahora cuenta como «${ETIQUETA_ETAPA[etapa]}».`)
      funnel.recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo corregir la etapa.')
    }
  }

  async function volverAuto(c: CampañaEtapa) {
    try {
      await desclasificarCampaña(marca, c.id)
      toast.ok('Vuelve a clasificarse por su objetivo en Meta.')
      funnel.recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo volver a la clasificación automática.')
    }
  }

  /** Recargar las dos cosas: asignar mueve campañas de línea y eso cambia todos los diagnósticos. */
  const recargarFunnel = funnel.recargar
  const recargarTodo = useCallback(() => {
    recargarFunnel()
    setPedido((p) => p + 1)
  }, [recargarFunnel])

  // Se pregunta por la marca de la LÍNEA, no por la de la sesión: alguien parado en BDI que también
  // pautea Zattia puede asignarle una campaña a Zattia sin cambiar de marca arriba. Es la misma
  // función que usa el servidor (`lib/permisos.core.js`), importada, no copiada.
  const puedeAsignarEn = useCallback((linea: LineaPauta) => {
    const base = baseDeLinea(linea)
    return !!base && (esAdmin(perfil) || puedeSub(perfil, base, 'meta-ads', SUB_PAUTAR))
  }, [perfil])

  async function asignar(c: CampañaEtapa, linea: LineaPauta) {
    try {
      await asignarLinea(marca as Marca, {
        campaignId: c.id, linea, cuentaId: c.cuentaId, objetivo: c.objetivo, nombre: c.nombre,
      })
      toast.ok(`«${c.nombre}» ahora cuenta como ${ETIQUETA_LINEA[linea]}.`)
      recargarTodo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo asignar la marca.')
    }
  }

  async function desasignar(c: CampañaEtapa) {
    try {
      await desasignarLinea(marca as Marca, c.id)
      toast.ok('Vuelve a quedar sin marca: su plata no la cuenta nadie.')
      recargarTodo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo sacar la marca.')
    }
  }

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
  // Los conjuntos de una campaña, a demanda al desplegar la fila. Van acá arriba y no adentro de la
  // tabla porque después de accionar sobre uno hay que volver a pedirlos.
  const conjuntos = useConjuntos(dias)
  const [presu, setPresu] = useState<{ o: ObjetoMeta; diarioCrudo: number } | null>(null)

  // Recargar el censo Y los conjuntos abiertos de esa campaña: Meta devuelve el valor releído del
  // objeto tocado, pero los subtotales por etapa, el diagnóstico y el reparto por marca salen del
  // censo. Parchear una fila a mano dejaría todo lo demás mintiendo.
  const recargarTrasAccion = useCallback(() => {
    setPedido((p) => p + 1)
    for (const id of conjuntos.abiertas) conjuntos.recargar(id)
  }, [conjuntos])

  const { enCurso, mandar, cambiarEstado } = useAccionMeta(recargarTrasAccion)

  // La moneda de la cuenta que corre cada campaña. **No es un detalle**: Meta maneja los
  // presupuestos en la unidad MENOR de la moneda, así que sin esto no se pueden ni mostrar ni
  // escribir. Viene del censo, en el mismo `?fields=` que ya pedía el nombre de la cuenta.
  const monedaDe = useCallback(
    (cuentaId: string) => {
      const e = !r || r.key !== key ? null : r.e
      const c = e && e.fase === 'ok' ? e.data.cuentas.find((x) => x.id === cuentaId) : null
      return c?.moneda || 'ARS'
    },
    [r, key],
  )

  // El permiso se pregunta por la LÍNEA de cada campaña, no por la marca de la sesión: en una misma
  // tabla puede haber una campaña de BDI que esta persona acciona y una de Zattia que no. Es la
  // misma función que usa el servidor para contestar 403, importada, no copiada.
  const acciones: Acciones = useMemo(() => ({
    puede: (accion: ClaveAccion, linea: LineaPauta | null) => !!linea && permiteAccion(perfil, accion, linea).ok,
    enCurso,
    onEstado: (o: ObjetoMeta, estadoActual: string | null) => { void cambiarEstado(o, estadoActual) },
    onPresupuesto: (o: ObjetoMeta, diarioCrudo: number) => setPresu({ o, diarioCrudo }),
  }), [perfil, enCurso, cambiarEstado])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <label style={{ fontSize: font.base, color: color.ink2, display: 'flex', alignItems: 'center', gap: space[1.5] }}>
          Mirando los últimos:
          <select
            className="mo-input"
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: radius.md, fontSize: font.base, cursor: 'pointer' }}
          >
            <option value={UMBRALES_ETAPA.dias}>{UMBRALES_ETAPA.dias} días</option>
            <option value={UMBRALES_ETAPA.diasAmplio}>{UMBRALES_ETAPA.diasAmplio} días</option>
          </select>
        </label>
        <InfoPopover titulo="Por qué la ventana no es la del Resumen">
          <p>
            Acá la ventana es <b>fija</b> y no sigue al selector de la pestaña Resumen. Si se pudiera
            poner en &quot;Hoy&quot;, a las 9 de la mañana todas las etapas darían cero y la pantalla
            avisaría de un agujero que no existe.
          </p>
          <p>
            Una campaña cuenta como <b>al aire</b> si está activa <i>y</i> gastó en la ventana. Una
            campaña activa cuyos conjuntos están todos pausados figura activa en Meta y no entrega
            nada: contarla taparía justo lo que esta pantalla existe para mostrar.
          </p>
        </InfoPopover>
      </div>

      {estado.fase === 'cargando' && <Card style={{ color: color.mut2 }}>Leyendo las campañas de Meta…</Card>}

      {estado.fase === 'error' && (
        <Notice tone="danger">
          No se pudieron traer las campañas: {estado.motivo}
          <div style={{ fontSize: font.sm, marginTop: space[1] }}>
            Si dice «Meta Ads no configurado», falta <code>META_ADS_TOKEN</code> en el servidor.
          </div>
        </Notice>
      )}

      {estado.fase === 'ok' && (
        <Contenido
          d={estado.data}
          diagPorLinea={diagPorLinea}
          diag={diag}
          lineaAbierta={lineaAbierta}
          onAbrir={abrirLinea}
          fecha={fecha}
          correccion={correccion}
          avisos={avisos}
          palanca={{ acciones, conjuntos, monedaDe }}
        />
      )}

      {presu && (
        <ModalPresupuesto
          o={presu.o}
          diarioCrudo={presu.diarioCrudo}
          guardando={enCurso === presu.o.id}
          onCerrar={() => setPresu(null)}
          onGuardar={async (nuevoCrudo, idem) => {
            // `aMonto` y no un `/100`: el factor depende de la moneda de la cuenta y hardcodearlo es
            // la trampa número uno de esta tanda.
            const monto = money(aMonto(nuevoCrudo, presu.o.moneda))
            const hecho = await mandar(presu.o, 'presupuesto', { daily_budget: nuevoCrudo }, idem, `Presupuesto diario en ${monto}.`)
            if (hecho) setPresu(null)
          }}
        />
      )}

      {/* El tablero va SIEMPRE, gane o pierda el diagnóstico. Se lee por `api/datos.js`, que no
          habla con Meta: si el token vence justo cuando marketing tiene que craneаr las piezas, el
          lugar donde se anotan no se puede haber caído con él. Es el motivo por el que las ideas
          tienen su propio endpoint (`api/_meta-funnel.js`) y no viven en `api/meta-ads.js`. */}
      <TableroIdeas
        marca={marca}
        ideas={funnel.ideas}
        puede={funnel.puede}
        quien={perfil?.name ?? null}
        cargando={funnel.cargando}
        caido={funnel.caido}
        recargar={funnel.recargar}
        campañas={campañasDeLaMarca}
        sugerida={diagDeLaMarca?.veredicto.etapa ?? null}
        fechas={fechas}
      />

      {corrigiendo && (
        <ModalCorregir
          c={corrigiendo}
          override={porCampaña[corrigiendo.id] || null}
          onCerrar={() => setCorrigiendo(null)}
          onCorregir={(etapa, motivo) => corregir(corrigiendo, etapa, motivo)}
        />
      )}
    </div>
  )
}

/**
 * Las ideas y las correcciones de etapa, que viven en la base del monitor y no en Meta.
 *
 * Su falla **no tumba nada**: si la tabla todavía no está migrada en esta marca, el diagnóstico
 * sigue siendo válido (clasificación automática) y lo único que se pierde es el tablero. Es la
 * misma decisión que toma el calendario con el renglón "Etapas armadas".
 */
function useFunnel(marca: string, visibles: readonly Marca[]) {
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
    ideas: listo ? d.ideas : [],
    overrides: listo ? d.overrides : EMPTY_OVERRIDES,
    lineas: listo ? d.lineas : EMPTY_LINEAS,
    puede: listo ? d.puede : SIN_PODERES,
    caido: listo ? d.caido : null,
    cargando: !listo,
    recargar: useCallback(() => setNonce((n) => n + 1), []),
  }
}

/** Constantes de módulo: si fueran literales, cambiarían de identidad en cada render y los
 *  `useMemo` que dependen de ellas se recalcularían siempre. */
const EMPTY_OVERRIDES: OverrideEtapa[] = []
const EMPTY_LINEAS: AsignacionLinea[] = []
const SIN_PODERES: PoderesIdeas = { pautar: false, admin: false }

/**
 * Las fechas que se vienen, del calendario editorial.
 *
 * Son lo que convierte el diagnóstico en un pedido: "no hay pauta de la segunda etapa" es un dato,
 * "no hay pauta de la segunda etapa **y el Día de la Madre es en 34 días**" es una tarea. De la
 * lista salen las dos cosas: la que aprieta, para el veredicto, y el desplegable de "para qué
 * fecha" al anotar una idea. Se pide aparte y en silencio — si el calendario falla, esta pantalla
 * tiene que seguir andando igual, porque el diagnóstico se sostiene solo.
 */
function useFechas(marca: string): EntradaCalendario[] {
  const [d, setD] = useState<{ key: string; fechas: EntradaCalendario[] } | null>(null)
  useEffect(() => {
    let vivo = true
    const hoy = hoyIso()
    leerCalendario(marca as Parameters<typeof leerCalendario>[0])
      .then((cal) => {
        if (!vivo) return
        // `decisiones` no es opcional acá: `laQueAprieta()` sólo devuelve fechas que el equipo
        // eligió jugar, así que sin ellas el veredicto se queda mudo para siempre.
        setD({ key: marca, fechas: proximas(hoy, 90, { fijadas: cal.fijadas, hitos: cal.hitos, decisiones: cal.decisiones }) })
      })
      .catch(() => { if (vivo) setD({ key: marca, fechas: [] }) })
    return () => { vivo = false }
  }, [marca])
  return d && d.key === marca ? d.fechas : SIN_FECHAS
}

const SIN_FECHAS: EntradaCalendario[] = []

/**
 * Lo que hace falta para accionar desde la tabla. Va junto y no como tres props sueltas porque las
 * tres viajan siempre a la misma profundidad y las tres son inútiles por separado.
 */
type Palanca = {
  acciones: Acciones
  conjuntos: Conjuntos
  /** La moneda de la cuenta que corre cada campaña: define la unidad menor con la que Meta escribe. */
  monedaDe: (cuentaId: string) => string
}

function Contenido({ d, diagPorLinea, diag, lineaAbierta, onAbrir, fecha, correccion, avisos, palanca }: {
  d: RespuestaEtapas
  /** Ya vienen calculados de arriba, con los overrides puestos: el tablero necesita los mismos. */
  diagPorLinea: Partial<Record<LineaPauta, Diagnostico>> | null
  diag: Diagnostico | null
  lineaAbierta: LineaPauta
  onAbrir: (l: LineaPauta) => void
  fecha: EntradaCalendario | null
  correccion: Correccion
  avisos: Avisos
  palanca: Palanca
}) {
  const pendientes = d.sinAsignar
  return (
    <>
      {/* Campañas que Meta devolvió y de las que no sabemos de quién es la plata. Ruidoso a
          propósito: es preferible admitir que falta un dato antes que atribuirle a una marca plata
          que no es suya. Va ARRIBA de la grilla porque, mientras haya pendientes, los números de
          abajo están incompletos y hay que saberlo antes de leerlos. */}
      {pendientes.length > 0 && <PendientesDeLinea campañas={pendientes} correccion={correccion} />}

      {diagPorLinea && (
        <GrillaLineas diagPorLinea={diagPorLinea} abierta={lineaAbierta} onAbrir={onAbrir} />
      )}

      {!diag ? (
        <EmptyState
          title={`No tenés permiso para ver ${ETIQUETA_LINEA[lineaAbierta]}`}
          hint="Elegí una de las líneas de la grilla de arriba."
          dashed
        />
      ) : (
        <>
          <Veredicto d={diag} fecha={fecha} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: space[3] }}>
            {diag.etapas.map((e) => <TarjetaEtapa key={e.etapa} e={e} gastoTotal={diag.gastoTotal} />)}
          </div>
          <Pautas diag={diag} correccion={correccion} avisos={avisos} palanca={palanca} />
        </>
      )}
    </>
  )
}

/**
 * Las tres líneas × las tres etapas, un número por celda. **Es el pedido de creativos en una sola
 * mirada.**
 *
 * Por qué esto y no un selector de línea: la pantalla existe para que el hueco se vea, y un hueco
 * que hay que ir a buscar no se ve. Con las tres al lado, "Stunned no tiene nada en ninguna etapa"
 * salta sin tocar nada. Por qué esto y no las tres fichas completas apiladas: serían nueve tarjetas
 * grandes, tres veredictos y tres tablas, y volvería a haber que leer para sacar la conclusión.
 *
 * La celda vacía va **punteada**, igual que la tarjeta vacía de abajo: el cero se dibuja, no se lee.
 */
function GrillaLineas({ diagPorLinea, abierta, onAbrir }: {
  diagPorLinea: Partial<Record<LineaPauta, Diagnostico>>
  abierta: LineaPauta
  onAbrir: (l: LineaPauta) => void
}) {
  const lineas = LINEAS.filter((l) => diagPorLinea[l])
  if (lineas.length === 0) return null

  return (
    <SectionCard
      title="Dónde está el hueco"
      subtitle="Cuántas pautas hay al aire en cada etapa, por marca. Tocá una fila para ver el detalle abajo."
    >
      <TableWrap>
        <THead>
          <Tr>
            <Th>Marca</Th>
            {ETAPAS.map((e) => <Th key={e} align="right">{ETIQUETA_ETAPA[e]}</Th>)}
          </Tr>
        </THead>
        <TBody>
          {lineas.map((l) => {
            const d = diagPorLinea[l] as Diagnostico
            const esta = l === abierta
            return (
              <Tr key={l} onClick={() => onAbrir(l)} style={{ cursor: 'pointer', background: esta ? color.brandBg : undefined }}>
                <Td strong>
                  {esta ? '▸ ' : ''}{ETIQUETA_LINEA[l]}
                </Td>
                {d.etapas.map((e) => (
                  <Td key={e.etapa} align="right">
                    <span
                      style={{
                        display: 'inline-block', minWidth: 34, padding: '2px 8px',
                        borderRadius: radius.md, fontWeight: weight.semibold,
                        border: e.alAire.length === 0 ? `1px dashed ${color.dangerBorder}` : '1px solid transparent',
                        color: e.alAire.length === 0 ? color.dangerInk : color.ink,
                      }}
                    >
                      {e.alAire.length}
                    </span>
                  </Td>
                ))}
              </Tr>
            )
          })}
        </TBody>
      </TableWrap>
    </SectionCard>
  )
}

/**
 * Las campañas que todavía no tienen marca.
 *
 * ⚠️ **Su plata no la cuenta nadie.** Mientras haya campañas CON GASTO acá, todos los números de la
 * grilla están incompletos — y eso es a propósito: la versión anterior atribuía por cuenta
 * publicitaria y, como las tres marcas se pautean desde la misma cuenta, cualquier atribución
 * automática le regalaba a una la plata de las otras dos. Un número incompleto que se sabe
 * incompleto es mejor que uno completo que miente.
 *
 * 🔑 **El ámbar se lo gana el gasto, no el estado.** `tuvoActividad` es `ACTIVE` **y** gasto > 0, la
 * misma regla que «al aire». Con `ACTIVE` solo, las publicaciones de Instagram promocionadas —Meta
 * le arma una campaña a cada posteo y quedan activas para siempre— llenaban el cartel de filas de
 * $0: 26 tapando las 5 que se llevaban toda la plata. Las demás caen al plegable, donde se pueden
 * asignar igual si alguien quiere; y si alguna vuelve a gastar, sube sola al cartel.
 *
 * 🔴 **Sin ninguna con gasto NO hay cartel ámbar.** El reclamo es por la plata que no está entrando
 * a ningún diagnóstico; sin plata pendiente no hay nada que reclamar y un ámbar permanente sobre las
 * dormidas enseña a ignorar el ámbar. Queda el plegable solo, en tono neutro.
 */
function PendientesDeLinea({ campañas, correccion }: { campañas: CampañaSinLinea[]; correccion: Correccion }) {
  const [verTodas, setVerTodas] = useState(false)
  const activas = campañas.filter((c) => c.tuvoActividad)
  const dormidas = campañas.filter((c) => !c.tuvoActividad)

  const plegable = dormidas.length > 0 && (
    <Plegable
      abierto={verTodas}
      onToggle={() => setVerTodas((v) => !v)}
      titulo={`${dormidas.length} sin gasto en la ventana`}
      ayuda="Pausadas, o activas pero sin entregar nada —las publicaciones promocionadas quedan así—. No suman ni restan a ningún diagnóstico, así que asignarlas es opcional. Si alguna vuelve a gastar, aparece arriba sola."
    >
      <ListaPendientes campañas={dormidas} correccion={correccion} />
    </Plegable>
  )

  if (activas.length === 0) {
    return plegable ? <Card style={{ padding: space[3] }}>{plegable}</Card> : null
  }

  return (
    <Notice tone="warning">
      <div style={{ fontWeight: weight.semibold }}>
        {activas.length === 1
          ? 'Hay 1 campaña gastando y sin marca asignada'
          : `Hay ${activas.length} campañas gastando y sin marca asignada`}
      </div>
      <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.5 }}>
        Su plata no entra en ningún diagnóstico. Las tres marcas se pautean desde la misma cuenta
        publicitaria, así que la marca <b>no se puede deducir</b>: si se adivinara por el nombre de la
        cuenta, una marca cargaría con la pauta de las otras dos y el número se vería perfectamente
        razonable estando mal.
      </div>

      <ListaPendientes campañas={activas} correccion={correccion} />

      {plegable}
    </Notice>
  )
}

function ListaPendientes({ campañas, correccion }: { campañas: CampañaSinLinea[]; correccion: Correccion }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginTop: space[3] }}>
      {campañas.map((c) => (
        <div
          key={c.id}
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[2],
            justifyContent: 'space-between',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: font.sm, fontWeight: weight.semibold }}>{c.nombre}</div>
            <div style={{ fontSize: font.xs, color: color.mut2 }}>
              {rotuloObjetivo(c.objetivo)} · {money(c.spend)} · <code>{c.cuentaId}</code>
            </div>
          </div>
          <BotonesDeLinea c={c} sugerida={c.sugerida} correccion={correccion} />
        </div>
      ))}
    </div>
  )
}

/**
 * Los tres botones de marca.
 *
 * La sugerencia sale del nombre de la campaña y **sólo se destaca**: prellena la mirada, no la
 * decisión. Sigue haciendo falta el click, y ante un nombre ambiguo no se sugiere nada. Es la misma
 * regla del calendario — el cálculo propone, la persona confirma — y acá pesa el doble, porque lo
 * que se está decidiendo es de quién es la plata.
 */
function BotonesDeLinea({ c, sugerida, correccion }: {
  c: CampañaEtapa
  sugerida: LineaPauta | null
  correccion: Correccion
}) {
  return (
    <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
      {LINEAS.map((l) => {
        const puede = correccion.puedeAsignarEn(l)
        return (
          <Button
            key={l}
            size="sm"
            variant={l === sugerida ? 'soft' : 'ghost'}
            disabled={!puede}
            title={puede ? undefined : `No tenés permiso para pautar en ${ETIQUETA_LINEA[l]}`}
            onClick={() => correccion.onAsignar(c, l)}
          >
            {ETIQUETA_LINEA[l]}
            {l === sugerida ? ' ·' : ''}
          </Button>
        )
      })}
    </div>
  )
}

/** El pedido, en una frase. Es el único bloque que la gente tiene que leer sí o sí. */
function Veredicto({ d, fecha }: { d: Diagnostico; fecha: EntradaCalendario | null }) {
  const v = d.veredicto
  const tone: Tone = v.clase === 'vacia' ? 'danger' : v.clase === 'floja' ? 'warning' : v.clase === 'ok' ? 'success' : 'neutral'
  // La fecha se suma sólo cuando hay un hueco que llenar. Con las tres etapas cubiertas, "y el Día
  // de la Madre es en 34 días" no pide nada y sería una frase decorativa más.
  const suma = fecha && (v.clase === 'vacia' || v.clase === 'floja')
  return (
    <Notice tone={tone} style={{ alignItems: 'center' }}>
      <div style={{ fontSize: font.lg, fontWeight: weight.bold, lineHeight: 1.35 }}>{v.titulo}</div>
      <div style={{ fontSize: font.base, marginTop: space[1.5], lineHeight: 1.5 }}>
        {v.detalle}
        {suma && (
          <>
            {' '}
            <b>
              Y {fecha.titulo} es en {fecha.faltan} {fecha.faltan === 1 ? 'día' : 'días'}
              {/* Sólo si alguien puso una fecha de arranque y ya pasó. `fecha` de por sí ya es una
                  que el equipo decidió jugar — `laQueAprieta()` no devuelve otras. */}
              {fecha.arrancarEn !== null && fecha.arrancarEn <= 0 ? ': ya habría que estar produciendo' : ''}.
            </b>{' '}
            <Link href="/calendario" style={{ color: 'inherit' }}>Ver el calendario</Link>
          </>
        )}
      </div>
    </Notice>
  )
}

function TarjetaEtapa({ e, gastoTotal }: { e: ResumenEtapa; gastoTotal: number }) {
  const etapa = e.etapa as Etapa
  const vacia = e.estado === 'vacia'
  const t = TONO[e.estado]
  const ayuda = RESUMEN_ETAPA[etapa]

  return (
    <div
      style={{
        // La vacía se dibuja como un hueco: punteado y sin fondo. Es la diferencia entre leer que
        // falta algo y verlo faltar.
        border: vacia ? `2px dashed ${color.dangerBorder}` : `1px solid ${color.line}`,
        background: vacia ? 'transparent' : color.surface,
        borderRadius: radius.xl,
        padding: space[4],
        display: 'flex',
        flexDirection: 'column',
        gap: space[2],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.md, fontWeight: weight.bold, color: color.ink }}>{ETIQUETA_ETAPA[etapa]}</span>
        <InfoPopover titulo={ETIQUETA_ETAPA[etapa]}>
          <p><b>A quién le habla:</b> {ayuda.aQuien}</p>
          <p><b>Qué creativo pide:</b> {ayuda.queCreativo}</p>
          <p><b>Qué NO va:</b> {ayuda.queNoVa}</p>
          <p><b>Cómo sabés si funciona:</b> {ayuda.comoSabes}</p>
          <p style={{ color: color.mut2, fontSize: font.xs }}>En la jerga: {ayuda.jerga}</p>
        </InfoPopover>
      </div>

      <div style={{ fontSize: font['2xl'], fontWeight: weight.heavy, color: vacia ? color.dangerInk : color.ink, lineHeight: 1.1 }}>
        {vacia ? 'Nada al aire' : `${e.alAire.length} ${e.alAire.length === 1 ? 'pauta' : 'pautas'}`}
      </div>

      <div style={{ fontSize: font.sm, color: color.mut }}>
        {money(e.spend)} · {pct(e.parte)} del gasto
      </div>

      {/* Barra de participación. Sin librería: es una sola proporción y no vale un chart. */}
      <div style={{ height: 6, borderRadius: radius.pill, background: color.bg2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.round(e.parte * 100))}%`, height: '100%', background: gastoTotal ? color.brandSolid : 'transparent' }} />
      </div>

      <div style={{ display: 'flex', gap: space[1.5], flexWrap: 'wrap', alignItems: 'center' }}>
        <StatusPill tone={t} label={e.estado === 'ok' ? 'Cubierta' : e.estado === 'floja' ? 'Floja' : 'Vacía'} />
        {e.sinEntrega.length > 0 && (
          <span style={{ fontSize: font.xs, color: color.mut2 }} title="Activas en Meta pero sin gasto en la ventana">
            {e.sinEntrega.length} activa{e.sinEntrega.length === 1 ? '' : 's'} sin entrega
          </span>
        )}
      </div>

      {/* El gasto no cambia el veredicto (eso lo decide la cantidad), pero acá sí hace falta: es el
          caso de la pauta que existe con $500 y figura como si el hueco estuviera cubierto. */}
      {e.gastoFlaco && (
        <div style={{ fontSize: font.xs, color: color.warningInk, lineHeight: 1.4 }}>
          Hay pauta, pero se lleva el {pct(e.parte)} de la plata: existe más en el papel que en la calle.
        </div>
      )}
    </div>
  )
}

function Pautas({ diag, correccion, avisos, palanca }: {
  diag: Diagnostico
  correccion: Correccion
  avisos: Avisos
  palanca: Palanca
}) {
  const [verSinEntrega, setVerSinEntrega] = useState(false)
  const [verSinClasificar, setVerSinClasificar] = useState(false)
  const [verPausadas, setVerPausadas] = useState(false)
  const sinEntrega = diag.etapas.flatMap((e) => e.sinEntrega)
  // Las pausadas van juntas y no repartidas por etapa: apagadas no arman ningún embudo, y separarlas
  // en tres grupos de una fila cada uno haría parecer que sí.
  const pausadas = diag.etapas.flatMap((e) => e.pausadas)

  return (
    <SectionCard
      title="Las pautas al aire"
      subtitle="Agrupadas por la etapa que les corresponde según su objetivo en Meta. Tocá el nombre de una campaña para ver con qué avisos está hablando. La etapa es del PÚBLICO, no del objetivo: cuando el objetivo miente, se corrige a mano y la corrección manda."
    >
      {diag.etapas.map((e) => (
        <div key={e.etapa} style={{ marginBottom: space[5] }}>
          <div style={{ fontSize: font.sm, fontWeight: weight.semibold, color: color.mut, marginBottom: space[2] }}>
            {ETIQUETA_ETAPA[e.etapa]}
          </div>
          {e.alAire.length === 0 ? (
            <div style={{ fontSize: font.base, color: color.mut2, fontStyle: 'italic' }}>Ninguna.</div>
          ) : (
            <TablaCampañas filas={e.alAire} correccion={correccion} avisos={avisos} palanca={palanca} />
          )}
        </div>
      ))}

      {sinEntrega.length > 0 && (
        <Plegable
          abierto={verSinEntrega}
          onToggle={() => setVerSinEntrega((v) => !v)}
          titulo={`${sinEntrega.length} activa${sinEntrega.length === 1 ? '' : 's'} sin entrega`}
          ayuda="Están en ACTIVE pero no gastaron en la ventana: suele ser presupuesto en cero o todos los conjuntos pausados."
        >
          <TablaCampañas filas={sinEntrega} correccion={correccion} avisos={avisos} palanca={palanca} />
        </Plegable>
      )}

      {/* 🔴 Sin este plegable, una campaña pausada NO aparecía en ninguna parte de la pantalla: no
          está al aire, no es «activa sin entrega» y tiene marca asignada, así que tampoco caía en el
          cartel de pendientes. Era invisible — y de yapa era el motivo de que «Reactivar» fuese código
          muerto a nivel campaña: el botón estaba, pero su fila nunca se dibujaba. */}
      {pausadas.length > 0 && (
        <Plegable
          abierto={verPausadas}
          onToggle={() => setVerPausadas((v) => !v)}
          titulo={`${pausadas.length} pausada${pausadas.length === 1 ? '' : 's'}`}
          ayuda="No están entregando porque alguien las apagó. Se listan para poder mirarlas y volver a prenderlas; no cuentan para el diagnóstico, que mira la pauta al aire. El gasto que muestran es el que hicieron en la ventana antes de apagarse."
        >
          <TablaCampañas filas={pausadas} correccion={correccion} avisos={avisos} palanca={palanca} />
        </Plegable>
      )}

      {diag.sinClasificar.length > 0 && (
        <Plegable
          abierto={verSinClasificar}
          onToggle={() => setVerSinClasificar((v) => !v)}
          titulo={`${diag.sinClasificar.length} sin clasificar`}
          ayuda="Su objetivo en Meta no cae en ninguna etapa conocida, así que no se reparten a ninguna: asignarlas por descarte inventaría el diagnóstico. Corregirlas a mano las devuelve al reparto."
        >
          <TablaCampañas filas={diag.sinClasificar} correccion={correccion} avisos={avisos} palanca={palanca} />
        </Plegable>
      )}
    </SectionCard>
  )
}

/**
 * La tabla de campañas de una etapa. **El nombre de la campaña despliega sus avisos** (ver
 * `components/meta-ads/Avisos.tsx`): un nombre de campaña no se parece en nada al aviso, y esta
 * pantalla existe para que alguien piense la pieza que falta mirando las que ya salieron.
 */
function TablaCampañas({ filas, correccion, avisos, palanca }: {
  filas: CampañaEtapa[]
  correccion: Correccion
  avisos: Avisos
  palanca: Palanca
}) {
  // La columna de correcciones aparece si hay algo que mostrar o alguien que pueda tocarla. Quien
  // no puede corregir tampoco tiene por qué cargar con una columna vacía.
  const hayOverride = filas.some((c) => correccion.porCampaña[c.id])
  const columna = correccion.puedePautar || hayOverride
  // Ídem con las acciones: se pregunta por la LÍNEA de cada campaña de esta tabla, no por la marca
  // de la sesión. Si esta persona no puede accionar en ninguna de las que ve, la columna no va.
  const hayAcciones = filas.some((c) => {
    const linea = correccion.lineaPorCampaña[c.id]?.linea ?? null
    return palanca.acciones.puede('estado', linea) || palanca.acciones.puede('presupuesto', linea)
  })
  const anchoTotal = 5 + (columna ? 2 : 0) + (hayAcciones ? 1 : 0)

  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Campaña</Th>
          <Th>Objetivo en Meta</Th>
          <Th align="right">Diario</Th>
          <Th align="right">Gasto</Th>
          <Th align="right">Compras</Th>
          <Th>Estado</Th>
          {columna && <Th>Etapa</Th>}
          {columna && <Th>Marca</Th>}
          {hayAcciones && <Th>Acciones</Th>}
        </Tr>
      </THead>
      <TBody>
        {filas.map((c) => {
          const abierta = avisos.abiertas.has(c.id)
          const conjuntosAbiertos = palanca.conjuntos.abiertas.has(c.id)
          const linea = correccion.lineaPorCampaña[c.id]?.linea ?? null
          const moneda = palanca.monedaDe(c.cuentaId)
          const objeto: ObjetoMeta = { nivel: 'campania', id: c.id, nombre: c.nombre, linea, moneda }
          const diarioCrudo = c.diarioCrudo ?? 0
          return (
            <Fragment key={c.id}>
              <Tr>
                <Td wrap strong>
                  <BotonAvisos nombre={c.nombre} abierta={abierta} onToggle={() => avisos.alternar(c.id)} />
                </Td>
                <Td>{rotuloObjetivo(c.objetivo)}</Td>
                <Td align="right"><CeldaDiario c={c} moneda={moneda} /></Td>
                <Td align="right">{money(c.spend)}</Td>
                <Td align="right">{c.purchases ? nf.format(c.purchases) : '—'}</Td>
                <Td><EstadoPill s={c.estado} /></Td>
                {columna && <Td><CeldaEtapa c={c} correccion={correccion} /></Td>}
                {columna && <Td><CeldaLinea c={c} correccion={correccion} /></Td>}
                {hayAcciones && (
                  <Td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], alignItems: 'flex-start' }}>
                      <BotonesAccion
                        objeto={objeto}
                        estado={c.estado}
                        diarioCrudo={diarioCrudo}
                        // Sin diario propio, el presupuesto vive en los conjuntos: el botón de acá
                        // no tendría qué tocar y el de la fila de cada conjunto sí.
                        sinPresupuesto={diarioCrudo <= 0}
                        // 🔴 `estaAlAire` IMPORTADA (`ACTIVE` **y** gasto > 0), no un `||`. Con un
                        // `||`, las 171 publicaciones de Instagram promocionadas —que Meta deja
                        // ACTIVE para siempre y hace meses que no entregan— se llenarían de botones
                        // y taparían las cinco campañas que se llevan la plata.
                        inerte={estaAlAire(c) ? null : INERTE}
                        acciones={palanca.acciones}
                      />
                      <Button size="sm" variant="ghost" onClick={() => palanca.conjuntos.alternar(c.id)}>
                        {conjuntosAbiertos ? '▾ Conjuntos' : '▸ Conjuntos'}
                      </Button>
                    </div>
                  </Td>
                )}
              </Tr>
              {abierta && (
                <Tr>
                  <Td colSpan={anchoTotal} wrap style={{ padding: 0, background: color.bg2 }}>
                    <PanelAvisos estado={avisos.dato(c.id)} />
                  </Td>
                </Tr>
              )}
              {conjuntosAbiertos && (
                <Tr>
                  <Td colSpan={anchoTotal} wrap style={{ padding: 0, background: color.bg2 }}>
                    <PanelConjuntos
                      estado={palanca.conjuntos.dato(c.id)}
                      moneda={moneda}
                      linea={linea}
                      acciones={palanca.acciones}
                    />
                  </Td>
                </Tr>
              )}
            </Fragment>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

/**
 * El presupuesto diario de la campaña.
 *
 * Tres estados distintos que **no** son intercambiables, y por eso ninguno se dibuja como «$0»:
 *  - un diario propio ⇒ la campaña es CBO y reparte sola entre sus conjuntos;
 *  - un presupuesto total (lifetime) ⇒ se muestra y no se edita desde acá;
 *  - nada ⇒ el presupuesto vive en los conjuntos, y ahí se toca.
 */
function CeldaDiario({ c, moneda }: { c: CampañaEtapa; moneda: string }) {
  if (c.diarioCrudo) {
    return (
      <span title="Presupuesto a nivel campaña: Meta lo reparte solo entre los conjuntos">
        {money(aMonto(c.diarioCrudo, moneda))}
      </span>
    )
  }
  if (c.totalCrudo) {
    return (
      <span style={{ color: color.mut2, fontSize: font.xs }} title="Presupuesto total: se muestra pero no se edita desde acá">
        total {money(aMonto(c.totalCrudo, moneda))}
      </span>
    )
  }
  return <span style={{ color: color.mut2, fontSize: font.xs }} title="El presupuesto está en los conjuntos">en conjuntos</span>
}

/**
 * La celda de la corrección manual. Tiene tres estados y ninguno es decorativo:
 *
 *  - sin corregir → el botón para corregirla (solo para quien pautea);
 *  - corregida → dice a qué etapa y quién la puso, con la vuelta a la automática al lado;
 *  - corregida **y el objetivo cambió después** → ámbar. El override sigue mandando, pero el juicio
 *    se hizo sobre otra campaña de la que hoy es, y eso hay que poder verlo.
 */
function CeldaEtapa({ c, correccion }: { c: CampañaEtapa; correccion: Correccion }) {
  const o = correccion.porCampaña[c.id]

  if (!o) {
    if (!correccion.puedePautar) return <span style={{ color: color.mut2 }}>automática</span>
    return (
      <Button size="sm" variant="ghost" onClick={() => correccion.onCorregir(c)}>Corregir</Button>
    )
  }

  const vieja = overrideViejo(o, c)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], alignItems: 'flex-start' }}>
      <StatusPill tone={vieja ? 'warning' : 'brand'} label={`a mano: ${ETIQUETA_ETAPA[o.etapa]}`} />
      <span style={{ fontSize: font.xs, color: color.mut2 }} title={o.motivo || undefined}>
        la corrigió {o.por}
      </span>
      {vieja && (
        <span style={{ fontSize: font.xs, color: color.warningInk, lineHeight: 1.4 }}>
          Le cambiaron el objetivo desde entonces (era {rotuloObjetivo(o.objetivo)}): conviene revisarla.
        </span>
      )}
      {correccion.puedePautar && (
        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" onClick={() => correccion.onCorregir(c)}>Cambiar</Button>
          <Button size="sm" variant="ghost" onClick={() => correccion.onVolverAuto(c)}>Volver a la automática</Button>
        </div>
      )}
    </div>
  )
}

/**
 * Corregir la etapa de una campaña.
 *
 * El modal explica **por qué** existe esta corrección, y no por prolijidad: el que la usa tiene que
 * saber que no está arreglando un error del monitor sino aportando lo único que la API no dice —a
 * qué público le está hablando esa campaña—. Si se lee como "el sistema clasificó mal", se corrige
 * una vez y no se vuelve a mirar.
 */
function ModalCorregir({ c, override, onCerrar, onCorregir }: {
  c: CampañaEtapa
  override: OverrideEtapa | null
  onCerrar: () => void
  onCorregir: (etapa: Etapa, motivo: string) => void
}) {
  const [etapa, setEtapa] = useState<Etapa>((override?.etapa as Etapa) || (c.etapaAuto === 'sin-clasificar' ? 'mofu' : c.etapaAuto))
  const [motivo, setMotivo] = useState(override?.motivo || '')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo="Corregir la etapa de la campaña"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" onClick={() => onCorregir(etapa, motivo.trim())}>Guardar la corrección</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.5 }}>
          <b>{c.nombre}</b>
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[0.5] }}>
            Objetivo en Meta: {rotuloObjetivo(c.objetivo)} · hoy cuenta como{' '}
            {ETIQUETA_ETAPA[c.etapaAuto]}
          </div>
        </div>

        <Field label="A qué etapa va de verdad" width={260}>
          <Select value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa)}>
            {ETAPAS.map((x) => <option key={x} value={x}>{ETIQUETA_ETAPA[x]}</option>)}
          </Select>
        </Field>

        <Field label="Por qué" hint="Opcional, pero es lo que le da sentido a la corrección dentro de seis meses.">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Está apuntada a quienes ya vieron el video" />
        </Field>

        <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.5 }}>
          La etapa es una propiedad del <b>público</b>, no del objetivo de la campaña: una de ventas
          apuntada a gente que nunca te vio es primera etapa disfrazada de tercera, y con lo que la
          API devuelve no hay forma de distinguirlo. Esta corrección es ese dato, y pisa a la
          automática hasta que alguien la saque.
        </div>
      </div>
    </Modal>
  )
}

function EstadoPill({ s }: { s: string | null }) {
  if (!s) return <span style={{ color: color.mut2 }}>—</span>
  if (s === 'ACTIVE') return <StatusPill tone="success" label="Activa" />
  if (s.includes('PAUSED')) return <StatusPill tone="neutral" label="Pausada" />
  if (s === 'WITH_ISSUES' || s === 'DISAPPROVED') return <StatusPill tone="danger" label="Con problemas" />
  return <StatusPill tone="neutral" label={s.toLowerCase().replace(/_/g, ' ')} />
}

function Plegable({ abierto, onToggle, titulo, ayuda, children }: {
  abierto: boolean
  onToggle: () => void
  titulo: string
  ayuda: string
  children: React.ReactNode
}) {
  return (
    <div style={{ borderTop: `1px solid ${color.line}`, paddingTop: space[3], marginTop: space[3] }}>
      <button
        onClick={onToggle}
        style={{
          height: 'auto', // `.shell-content button` fija la altura de un control; este es de dos renglones.
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          textAlign: 'left', color: color.ink2, fontSize: font.base, fontWeight: weight.semibold,
        }}
      >
        {abierto ? '▾' : '▸'} {titulo}
      </button>
      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[1], lineHeight: 1.4 }}>{ayuda}</div>
      {abierto && <div style={{ marginTop: space[3] }}>{children}</div>}
    </div>
  )
}

/**
 * La marca de una campaña ya asignada, desde la tabla de pautas. Hermana de `CeldaEtapa`.
 *
 * Reasignar es mover plata de una marca a otra, así que dice **quién** la asignó y desde cuándo. El
 * servidor además exige permiso en las dos puntas: no alcanza con poder pautar en la marca a la que
 * se la querés dar.
 */
function CeldaLinea({ c, correccion }: { c: CampañaEtapa; correccion: Correccion }) {
  const a = correccion.lineaPorCampaña[c.id]
  if (!a) return <span style={{ color: color.mut2 }}>sin marca</span>

  const renombrada = !!a.nombre && a.nombre !== c.nombre
  const puede = correccion.puedeAsignarEn(a.linea)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], alignItems: 'flex-start' }}>
      <StatusPill tone={renombrada ? 'warning' : 'brand'} label={ETIQUETA_LINEA[a.linea]} />
      <span style={{ fontSize: font.xs, color: color.mut2 }}>la asignó {a.por}</span>
      {renombrada && (
        <span style={{ fontSize: font.xs, color: color.warningInk, lineHeight: 1.4 }}>
          La renombraron desde entonces (era «{a.nombre}»): conviene confirmar que sigue siendo de esta marca.
        </span>
      )}
      {puede && (
        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
          <BotonesDeLinea c={c} sugerida={null} correccion={correccion} />
          <Button size="sm" variant="ghost" onClick={() => correccion.onDesasignar(c)}>Sacarle la marca</Button>
        </div>
      )}
    </div>
  )
}

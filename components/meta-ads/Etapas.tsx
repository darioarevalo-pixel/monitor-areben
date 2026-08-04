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

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSesion } from '@/components/SesionProvider'
import { TableroIdeas } from '@/components/meta-ads/TableroIdeas'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { hoyIso, laQueAprieta, proximas, type EntradaCalendario } from '@/lib/calendario'
import { leerCalendario } from '@/lib/calendario/persistencia'
import { traerEtapas } from '@/lib/meta-ads/cliente'
import {
  diagnosticar, ETAPAS, ETIQUETA_ETAPA, mapaOverrides, overrideViejo, RESUMEN_ETAPA, rotuloObjetivo,
  UMBRALES_ETAPA,
} from '@/lib/meta-ads/etapas'
import {
  clasificarCampaña, desclasificarCampaña, leerIdeas,
  type Idea, type OverrideEtapa, type PoderesIdeas,
} from '@/lib/meta-ads/ideas'
import type { CampañaEtapa, Diagnostico, Etapa, ResumenEtapa, RespuestaEtapas } from '@/lib/meta-ads/tipos'
import {
  Button, Card, CopyButton, EmptyState, Field, Input, Modal, Notice, SectionCard, Select, StatusPill,
  TBody, TableWrap, Td, Th, THead, Tr, useToast,
  color, font, radius, space, weight, type Tone,
} from '@/components/ui'

type Cargable<T> = { fase: 'cargando' } | { fase: 'error'; motivo: string } | { fase: 'ok'; data: T }

/** Lo que hace falta para corregir la etapa de una campaña desde la tabla. */
type Correccion = {
  /** Las correcciones vigentes, por campaña. Vacío mientras no las lea nadie. */
  porCampaña: Record<string, OverrideEtapa>
  puedePautar: boolean
  onCorregir: (c: CampañaEtapa) => void
  onVolverAuto: (c: CampañaEtapa) => void
}

const nf = new Intl.NumberFormat('es-AR')
const money = (v: number) => `$ ${nf.format(Math.round(v || 0))}`
const pct = (p: number) => `${Math.round((p || 0) * 100)}%`

/** El tono de cada estado. Es el mismo mapa que usa el borde, el texto y el semáforo del veredicto. */
const TONO: Record<ResumenEtapa['estado'], Tone> = { ok: 'success', floja: 'warning', vacia: 'danger' }

export function Etapas() {
  const { marca, perfil } = useSesion()
  const toast = useToast()
  const marcaLabel = marca === 'zattia' ? 'Zattia' : 'BDI'
  const [dias, setDias] = useState(UMBRALES_ETAPA.dias)
  const [r, setR] = useState<{ key: string; e: Cargable<RespuestaEtapas> } | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<CampañaEtapa | null>(null)

  const key = `${marca}|${dias}`
  useEffect(() => {
    let vivo = true
    traerEtapas(marca, dias).then((res) => {
      if (!vivo) return
      setR({ key: `${marca}|${dias}`, e: res.ok ? { fase: 'ok', data: res.dato } : { fase: 'error', motivo: res.motivo } })
    })
    return () => { vivo = false }
  }, [marca, dias])

  const estado: Cargable<RespuestaEtapas> = !r || r.key !== key ? { fase: 'cargando' } : r.e
  const fechas = useFechas(marca)
  const fecha = useMemo(() => laQueAprieta(fechas), [fechas])
  const funnel = useFunnel(marca)

  const overrides = useMemo(() => mapaOverrides(funnel.overrides), [funnel.overrides])
  const porCampaña = useMemo(
    () => Object.fromEntries(funnel.overrides.map((o) => [o.campaign_id, o])) as Record<string, OverrideEtapa>,
    [funnel.overrides],
  )

  // El diagnóstico se recalcula con las correcciones a mano puestas: sin esto, el override se
  // guarda en la base y la pantalla sigue mostrando la clasificación automática, que es peor que
  // no tener override (alguien lo corrigió y no pasó nada).
  //
  // Se calcula acá arriba y no adentro de `Contenido` porque el tablero de abajo necesita el mismo:
  // la etapa que el veredicto está pidiendo es la que viene preelegida al anotar una idea.
  const diag = useMemo(() => {
    const e = !r || r.key !== key ? null : r.e
    if (!e || e.fase !== 'ok' || e.data.cuentas.length === 0) return null
    return diagnosticar(e.data.campañas, { overrides, marca: marcaLabel })
  }, [r, key, overrides, marcaLabel])

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

  const correccion: Correccion = {
    porCampaña,
    puedePautar: funnel.puede.pautar || funnel.puede.admin,
    onCorregir: setCorrigiendo,
    onVolverAuto: volverAuto,
  }

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
        <Contenido d={estado.data} diag={diag} marcaLabel={marcaLabel} fecha={fecha} correccion={correccion} />
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
        campañas={diag ? diag.etapas.flatMap((e) => e.alAire) : []}
        sugerida={diag?.veredicto.etapa ?? null}
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
function useFunnel(marca: string) {
  const [nonce, setNonce] = useState(0)
  const [d, setD] = useState<{
    key: string
    ideas: Idea[]
    overrides: OverrideEtapa[]
    puede: PoderesIdeas
    caido: string | null
  } | null>(null)

  const key = `${marca}|${nonce}`
  useEffect(() => {
    let vivo = true
    leerIdeas(marca as Parameters<typeof leerIdeas>[0])
      .then((res) => {
        if (vivo) setD({ key: `${marca}|${nonce}`, ...res, caido: null })
      })
      .catch((e) => {
        if (vivo) {
          setD({
            key: `${marca}|${nonce}`,
            ideas: [], overrides: [], puede: { pautar: false, admin: false },
            caido: e instanceof Error ? e.message : 'no se pudieron leer',
          })
        }
      })
    return () => { vivo = false }
  }, [marca, nonce])

  const listo = d && d.key === key
  return {
    ideas: listo ? d.ideas : [],
    overrides: listo ? d.overrides : EMPTY_OVERRIDES,
    puede: listo ? d.puede : SIN_PODERES,
    caido: listo ? d.caido : null,
    cargando: !listo,
    recargar: useCallback(() => setNonce((n) => n + 1), []),
  }
}

/** Constantes de módulo: si fueran literales, cambiarían de identidad en cada render y los
 *  `useMemo` que dependen de ellas se recalcularían siempre. */
const EMPTY_OVERRIDES: OverrideEtapa[] = []
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
        setD({ key: marca, fechas: proximas(hoy, 90, { fijadas: cal.fijadas, hitos: cal.hitos }) })
      })
      .catch(() => { if (vivo) setD({ key: marca, fechas: [] }) })
    return () => { vivo = false }
  }, [marca])
  return d && d.key === marca ? d.fechas : SIN_FECHAS
}

const SIN_FECHAS: EntradaCalendario[] = []

function Contenido({ d, diag, marcaLabel, fecha, correccion }: {
  d: RespuestaEtapas
  /** Ya viene calculado de arriba, con los overrides puestos: el tablero necesita el mismo. */
  diag: Diagnostico | null
  marcaLabel: string
  fecha: EntradaCalendario | null
  correccion: Correccion
}) {
  return (
    <>
      {/* Cuentas que Meta devolvió pero que no sabemos de quién son. Ruidoso a propósito: es
          preferible admitir que falta un dato antes que atribuirle a una marca plata que no es suya. */}
      {d.sinMarca.length > 0 && <AvisoSinMarca cuentas={d.sinMarca} />}

      {!diag ? (
        <EmptyState
          title={`No hay ninguna cuenta publicitaria asignada a ${marcaLabel}`}
          hint="Sin la asignación de cuentas no se puede armar el diagnóstico por marca. Ver el aviso de arriba."
          dashed
        />
      ) : (
        <>
          <Veredicto d={diag} fecha={fecha} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: space[3] }}>
            {diag.etapas.map((e) => <TarjetaEtapa key={e.etapa} e={e} gastoTotal={diag.gastoTotal} />)}
          </div>
          <Pautas diag={diag} correccion={correccion} />
        </>
      )}
    </>
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
              {fecha.arrancarEn <= 0 ? ': ya habría que estar produciendo' : ''}.
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

function Pautas({ diag, correccion }: { diag: Diagnostico; correccion: Correccion }) {
  const [verSinEntrega, setVerSinEntrega] = useState(false)
  const [verSinClasificar, setVerSinClasificar] = useState(false)
  const sinEntrega = diag.etapas.flatMap((e) => e.sinEntrega)

  return (
    <SectionCard
      title="Las pautas al aire"
      subtitle="Agrupadas por la etapa que les corresponde según su objetivo en Meta. La etapa es del PÚBLICO, no del objetivo: cuando el objetivo miente, se corrige a mano y la corrección manda."
    >
      {diag.etapas.map((e) => (
        <div key={e.etapa} style={{ marginBottom: space[5] }}>
          <div style={{ fontSize: font.sm, fontWeight: weight.semibold, color: color.mut, marginBottom: space[2] }}>
            {ETIQUETA_ETAPA[e.etapa]}
          </div>
          {e.alAire.length === 0 ? (
            <div style={{ fontSize: font.base, color: color.mut2, fontStyle: 'italic' }}>Ninguna.</div>
          ) : (
            <TablaCampañas filas={e.alAire} correccion={correccion} />
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
          <TablaCampañas filas={sinEntrega} correccion={correccion} />
        </Plegable>
      )}

      {diag.sinClasificar.length > 0 && (
        <Plegable
          abierto={verSinClasificar}
          onToggle={() => setVerSinClasificar((v) => !v)}
          titulo={`${diag.sinClasificar.length} sin clasificar`}
          ayuda="Su objetivo en Meta no cae en ninguna etapa conocida, así que no se reparten a ninguna: asignarlas por descarte inventaría el diagnóstico. Corregirlas a mano las devuelve al reparto."
        >
          <TablaCampañas filas={diag.sinClasificar} correccion={correccion} />
        </Plegable>
      )}
    </SectionCard>
  )
}

function TablaCampañas({ filas, correccion }: { filas: CampañaEtapa[]; correccion: Correccion }) {
  // La columna de correcciones aparece si hay algo que mostrar o alguien que pueda tocarla. Quien
  // no puede corregir tampoco tiene por qué cargar con una columna vacía.
  const hayOverride = filas.some((c) => correccion.porCampaña[c.id])
  const columna = correccion.puedePautar || hayOverride

  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Campaña</Th>
          <Th>Objetivo en Meta</Th>
          <Th align="right">Gasto</Th>
          <Th align="right">Compras</Th>
          <Th>Estado</Th>
          {columna && <Th>Etapa</Th>}
        </Tr>
      </THead>
      <TBody>
        {filas.map((c) => (
          <Tr key={c.id}>
            <Td wrap strong>{c.nombre}</Td>
            <Td>{rotuloObjetivo(c.objetivo)}</Td>
            <Td align="right">{money(c.spend)}</Td>
            <Td align="right">{c.purchases ? nf.format(c.purchases) : '—'}</Td>
            <Td><EstadoPill s={c.estado} /></Td>
            {columna && <Td><CeldaEtapa c={c} correccion={correccion} /></Td>}
          </Tr>
        ))}
      </TBody>
    </TableWrap>
  )
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
 * El día 1 esto sale con TODAS las cuentas, porque `MARCA_POR_CUENTA` arranca vacío: los ids solo
 * se pueden leer con el token de producción. Es un estado visible y de una sola vez — se copian los
 * ids de acá, se cargan en `lib/meta-ads/etapas.core.js` y el aviso desaparece.
 */
function AvisoSinMarca({ cuentas }: { cuentas: { id: string; nombre: string }[] }) {
  return (
    <Notice tone="warning">
      <div style={{ fontWeight: weight.semibold }}>
        {cuentas.length === 1 ? 'Hay una cuenta publicitaria sin marca asignada' : `Hay ${cuentas.length} cuentas publicitarias sin marca asignada`}
      </div>
      <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.5 }}>
        Su plata no entra en este diagnóstico. Para asignarlas hay que cargar el id en{' '}
        <code>MARCA_POR_CUENTA</code> (<code>lib/meta-ads/etapas.core.js</code>) — no se adivinan por
        el nombre a propósito: adivinar mal atribuye la pauta de una marca a la otra y el número se
        ve razonable estando mal.
      </div>
      <ul style={{ margin: `${space[2]}px 0 0`, paddingLeft: 18, fontSize: font.sm }}>
        {cuentas.map((c) => (
          <li key={c.id} style={{ marginBottom: 2 }}>
            {c.nombre} — <code>{c.id}</code> <CopyButton getText={() => c.id} label="Copiar id" />
          </li>
        ))}
      </ul>
    </Notice>
  )
}

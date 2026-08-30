'use client'

/**
 * Embudo de la pauta — a QUIÉN le está hablando la plata.
 *
 * ⚠️ No confundir con el bloque «Del clic a la compra» de Rendimiento: ese es el embudo
 * transaccional (qué pasa con quien YA hizo clic). Esto es otra cosa y por eso no comparte ni una
 * palabra en el título: son las tres etapas de la pauta (TOFU/MOFU/BOFU), que dicen si le estás
 * hablando a gente que no te conoce, a la que te está considerando, o a la que está por comprar.
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
 *
 * El censo, los diagnósticos y las correcciones salen de `useCampanias()`: los mismos que usan el
 * Panel, las Campañas y las Ideas. Ver ahí por qué.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CorreccionAbierta } from '@/components/meta-ads/ModalCorregir'
import { VentanaEtapas } from '@/components/meta-ads/VentanaEtapas'
import { ModalesDeAccion } from '@/components/meta-ads/acciones'
import { TablaCampanias } from '@/components/meta-ads/campanias/TablaCampanias'
import { BotonesDeLinea } from '@/components/meta-ads/campanias/celdas'
import { DeDondeSale } from '@/components/meta-ads/campanias/DeDondeSale'
import { useCampanias, type Campanias, type Correccion } from '@/components/meta-ads/useCampanias'
import { useFechas } from '@/components/meta-ads/useFechas'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { laQueAprieta, type EntradaCalendario } from '@/lib/calendario'
import { plata, pctUno } from '@/lib/meta-ads/formato'
import { ETAPAS, ETIQUETA_ETAPA, RESUMEN_ETAPA, rotuloObjetivo, SIGLA_ETAPA } from '@/lib/meta-ads/etapas'
import { ETIQUETA_LINEA, LINEAS } from '@/lib/meta-ads/lineas'
import type {
  CampañaSinLinea, Diagnostico, Etapa, LineaPauta, ResumenEtapa,
} from '@/lib/meta-ads/tipos'
import {
  Card, EmptyState, Notice, Plegable, SectionCard, StatusPill, TBody, TableWrap, Td, Th, THead, Tr,
  color, font, radius, space, weight, type Tone,
} from '@/components/ui'

/** El tono de cada estado. Es el mismo mapa que usa el borde, el texto y el semáforo del veredicto. */
const TONO: Record<ResumenEtapa['estado'], Tone> = { ok: 'success', floja: 'warning', vacia: 'danger' }

export function Embudo() {
  const m = useCampanias()
  const fechas = useFechas(m.marca)
  const fecha = useMemo(() => laQueAprieta(fechas), [fechas])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <VentanaEtapas dias={m.dias} setDias={m.setDias} />

      {m.estado.fase === 'cargando' && <Card style={{ color: color.mut2 }}>Leyendo las campañas de Meta…</Card>}

      {m.estado.fase === 'error' && (
        <Notice tone="danger">
          No se pudieron traer las campañas: {m.estado.motivo}
          <div style={{ fontSize: font.sm, marginTop: space[1] }}>
            ⚠️ Desde el 30-ago un token vencido ya ⛔ no llega acá: cae a la foto diaria y lo dice
            arriba. Si igual estás viendo esto, tampoco se pudo leer la foto.
          </div>
        </Notice>
      )}

      {m.estado.fase === 'ok' && <DeDondeSale d={m.estado.data} />}

      {m.estado.fase === 'ok' && <Contenido m={m} sinLinea={m.estado.data.sinAsignar} fecha={fecha} />}

      <ModalesDeAccion m={m.accion.modales} />

      <CorreccionAbierta m={m} />
    </div>
  )
}

function Contenido({ m, sinLinea, fecha }: {
  m: Campanias
  sinLinea: CampañaSinLinea[]
  fecha: EntradaCalendario | null
}) {
  return (
    <>
      {/* Campañas que Meta devolvió y de las que no sabemos de quién es la plata. Ruidoso a
          propósito: es preferible admitir que falta un dato antes que atribuirle a una marca plata
          que no es suya. Va ARRIBA de la grilla porque, mientras haya pendientes, los números de
          abajo están incompletos y hay que saberlo antes de leerlos. */}
      {sinLinea.length > 0 && <PendientesDeLinea campañas={sinLinea} correccion={m.correccion} />}

      {m.diagPorLinea && (
        <GrillaLineas diagPorLinea={m.diagPorLinea} abierta={m.lineaAbierta} onAbrir={m.abrirLinea} />
      )}

      {!m.diag ? (
        <EmptyState
          title={`No tenés permiso para ver ${ETIQUETA_LINEA[m.lineaAbierta]}`}
          hint="Elegí una de las líneas de la grilla de arriba."
          dashed
        />
      ) : (
        <>
          <Veredicto d={m.diag} fecha={fecha} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: space[3] }}>
            {m.diag.etapas.map((e) => <TarjetaEtapa key={e.etapa} e={e} gastoTotal={(m.diag as Diagnostico).gastoTotal} />)}
          </div>
          <Pautas m={m} diag={m.diag} />
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
 * que hay que ir a buscar no se ve. Con las tres al lado, «Stunned no tiene nada en ninguna etapa»
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
            {/* 🔑 El nombre manda y la sigla va al lado, chiquita: sin ella la traducción la hacía
                Bruno en la cabeza cada vez. Ver `SIGLA_ETAPA`. */}
            {ETAPAS.map((e) => (
              <Th key={e} align="right">
                {ETIQUETA_ETAPA[e]}
                {SIGLA_ETAPA[e] && <span style={{ color: color.mut2, fontWeight: weight.normal }}> · {SIGLA_ETAPA[e]}</span>}
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {lineas.map((l) => {
            const d = diagPorLinea[l] as Diagnostico
            const esta = l === abierta
            return (
              <Tr key={l} onClick={() => onAbrir(l)} style={{ cursor: 'pointer', background: esta ? color.brandBg : undefined }}>
                <Td strong>{esta ? '▸ ' : ''}{ETIQUETA_LINEA[l]}</Td>
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
 * $0: 26 tapando las 5 que se llevaban toda la plata.
 *
 * 🔴 **Sin ninguna con gasto NO hay cartel ámbar.** El reclamo es por la plata que no está entrando
 * a ningún diagnóstico; un ámbar permanente sobre las dormidas enseña a ignorar el ámbar.
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
              {rotuloObjetivo(c.objetivo)} · {plata(c.spend)} · <code>{c.cuentaId}</code>
            </div>
          </div>
          <BotonesDeLinea c={c} sugerida={c.sugerida} correccion={correccion} />
        </div>
      ))}
    </div>
  )
}

/** El pedido, en una frase. Es el único bloque que la gente tiene que leer sí o sí. */
function Veredicto({ d, fecha }: { d: Diagnostico; fecha: EntradaCalendario | null }) {
  const v = d.veredicto
  const tone: Tone = v.clase === 'vacia' ? 'danger' : v.clase === 'floja' ? 'warning' : v.clase === 'ok' ? 'success' : 'neutral'
  // La fecha se suma sólo cuando hay un hueco que llenar. Con las tres etapas cubiertas, «y el Día
  // de la Madre es en 34 días» no pide nada y sería una frase decorativa más.
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
        {SIGLA_ETAPA[etapa] && (
          <span style={{ fontSize: font.xs, color: color.mut2, fontWeight: weight.medium }}>{SIGLA_ETAPA[etapa]}</span>
        )}
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
        {plata(e.spend)} · {pctUno(e.parte)} del gasto
      </div>

      {/* Barra de participación. Sin librería: es una sola proporción y no vale un chart. */}
      <div style={{ height: 6, borderRadius: radius.pill, background: color.bg2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.round(e.parte * 100))}%`, height: '100%', background: gastoTotal ? color.brandSolid : 'transparent' }} />
      </div>

      <div style={{ display: 'flex', gap: space[1.5], flexWrap: 'wrap', alignItems: 'center' }}>
        <StatusPill tone={TONO[e.estado]} label={e.estado === 'ok' ? 'Cubierta' : e.estado === 'floja' ? 'Floja' : 'Vacía'} />
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
          Hay pauta, pero se lleva el {pctUno(e.parte)} de la plata: existe más en el papel que en la calle.
        </div>
      )}
    </div>
  )
}

/** Las campañas de la línea abierta, agrupadas por la etapa que les corresponde. */
function Pautas({ m, diag }: { m: Campanias; diag: Diagnostico }) {
  const [verSinEntrega, setVerSinEntrega] = useState(false)
  const [verSinClasificar, setVerSinClasificar] = useState(false)
  const [verPausadas, setVerPausadas] = useState(false)
  const sinEntrega = diag.etapas.flatMap((e) => e.sinEntrega)
  // Las pausadas van juntas y no repartidas por etapa: apagadas no arman ningún embudo, y separarlas
  // en tres grupos de una fila cada uno haría parecer que sí.
  const pausadas = diag.etapas.flatMap((e) => e.pausadas)
  const tabla = { correccion: m.correccion, avisos: m.avisos, palanca: m.palanca }

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
            <TablaCampanias filas={e.alAire} {...tabla} />
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
          <TablaCampanias filas={sinEntrega} {...tabla} />
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
          <TablaCampanias filas={pausadas} {...tabla} />
        </Plegable>
      )}

      {diag.sinClasificar.length > 0 && (
        <Plegable
          abierto={verSinClasificar}
          onToggle={() => setVerSinClasificar((v) => !v)}
          titulo={`${diag.sinClasificar.length} sin clasificar`}
          ayuda="Su objetivo en Meta no cae en ninguna etapa conocida, así que no se reparten a ninguna: asignarlas por descarte inventaría el diagnóstico. Corregirlas a mano las devuelve al reparto."
        >
          <TablaCampanias filas={diag.sinClasificar} {...tabla} />
        </Plegable>
      )}
    </SectionCard>
  )
}

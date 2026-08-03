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

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { traerEtapas } from '@/lib/meta-ads/cliente'
import { diagnosticar, ETIQUETA_ETAPA, RESUMEN_ETAPA, rotuloObjetivo, UMBRALES_ETAPA } from '@/lib/meta-ads/etapas'
import type { CampañaEtapa, Diagnostico, Etapa, ResumenEtapa, RespuestaEtapas } from '@/lib/meta-ads/tipos'
import {
  Card, CopyButton, EmptyState, Notice, SectionCard, StatusPill, TBody, TableWrap, Td, Th, THead, Tr,
  color, font, radius, space, weight, type Tone,
} from '@/components/ui'

type Cargable<T> = { fase: 'cargando' } | { fase: 'error'; motivo: string } | { fase: 'ok'; data: T }

const nf = new Intl.NumberFormat('es-AR')
const money = (v: number) => `$ ${nf.format(Math.round(v || 0))}`
const pct = (p: number) => `${Math.round((p || 0) * 100)}%`

/** El tono de cada estado. Es el mismo mapa que usa el borde, el texto y el semáforo del veredicto. */
const TONO: Record<ResumenEtapa['estado'], Tone> = { ok: 'success', floja: 'warning', vacia: 'danger' }

export function Etapas() {
  const { marca } = useSesion()
  const marcaLabel = marca === 'zattia' ? 'Zattia' : 'BDI'
  const [dias, setDias] = useState(UMBRALES_ETAPA.dias)
  const [r, setR] = useState<{ key: string; e: Cargable<RespuestaEtapas> } | null>(null)

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

      {estado.fase === 'ok' && <Contenido d={estado.data} marcaLabel={marcaLabel} />}
    </div>
  )
}

function Contenido({ d, marcaLabel }: { d: RespuestaEtapas; marcaLabel: string }) {
  // Sin overrides todavía: los trae la tanda del tablero de ideas. Hasta entonces la clasificación
  // es la automática y las correcciones se piden mirando "sin clasificar".
  const diag = diagnosticar(d.campañas, { marca: marcaLabel })

  return (
    <>
      {/* Cuentas que Meta devolvió pero que no sabemos de quién son. Ruidoso a propósito: es
          preferible admitir que falta un dato antes que atribuirle a una marca plata que no es suya. */}
      {d.sinMarca.length > 0 && <AvisoSinMarca cuentas={d.sinMarca} />}

      {d.cuentas.length === 0 ? (
        <EmptyState
          title={`No hay ninguna cuenta publicitaria asignada a ${marcaLabel}`}
          hint="Sin la asignación de cuentas no se puede armar el diagnóstico por marca. Ver el aviso de arriba."
          dashed
        />
      ) : (
        <>
          <Veredicto d={diag} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: space[3] }}>
            {diag.etapas.map((e) => <TarjetaEtapa key={e.etapa} e={e} gastoTotal={diag.gastoTotal} />)}
          </div>
          <Pautas diag={diag} />
        </>
      )}
    </>
  )
}

/** El pedido, en una frase. Es el único bloque que la gente tiene que leer sí o sí. */
function Veredicto({ d }: { d: Diagnostico }) {
  const v = d.veredicto
  const tone: Tone = v.clase === 'vacia' ? 'danger' : v.clase === 'floja' ? 'warning' : v.clase === 'ok' ? 'success' : 'neutral'
  return (
    <Notice tone={tone} style={{ alignItems: 'center' }}>
      <div style={{ fontSize: font.lg, fontWeight: weight.bold, lineHeight: 1.35 }}>{v.titulo}</div>
      <div style={{ fontSize: font.base, marginTop: space[1.5], lineHeight: 1.5 }}>{v.detalle}</div>
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

function Pautas({ diag }: { diag: Diagnostico }) {
  const [verSinEntrega, setVerSinEntrega] = useState(false)
  const [verSinClasificar, setVerSinClasificar] = useState(false)
  const sinEntrega = diag.etapas.flatMap((e) => e.sinEntrega)

  return (
    <SectionCard title="Las pautas al aire" subtitle="Agrupadas por la etapa que les corresponde según su objetivo en Meta.">
      {diag.etapas.map((e) => (
        <div key={e.etapa} style={{ marginBottom: space[5] }}>
          <div style={{ fontSize: font.sm, fontWeight: weight.semibold, color: color.mut, marginBottom: space[2] }}>
            {ETIQUETA_ETAPA[e.etapa]}
          </div>
          {e.alAire.length === 0 ? (
            <div style={{ fontSize: font.base, color: color.mut2, fontStyle: 'italic' }}>Ninguna.</div>
          ) : (
            <TablaCampañas filas={e.alAire} />
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
          <TablaCampañas filas={sinEntrega} />
        </Plegable>
      )}

      {diag.sinClasificar.length > 0 && (
        <Plegable
          abierto={verSinClasificar}
          onToggle={() => setVerSinClasificar((v) => !v)}
          titulo={`${diag.sinClasificar.length} sin clasificar`}
          ayuda="Su objetivo en Meta no cae en ninguna etapa conocida, así que no se reparten a ninguna: asignarlas por descarte inventaría el diagnóstico."
        >
          <TablaCampañas filas={diag.sinClasificar} />
        </Plegable>
      )}
    </SectionCard>
  )
}

function TablaCampañas({ filas }: { filas: CampañaEtapa[] }) {
  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Campaña</Th>
          <Th>Objetivo en Meta</Th>
          <Th align="right">Gasto</Th>
          <Th align="right">Compras</Th>
          <Th>Estado</Th>
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
          </Tr>
        ))}
      </TBody>
    </TableWrap>
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

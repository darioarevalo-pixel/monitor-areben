'use client'

/**
 * Panel — la entrada de la sección: **qué está pasando y qué hay que decidir.**
 *
 * # Por qué la sección ya no abre en Rendimiento
 *
 * Meta nació como un tablero de lectura y por eso el punto de entrada era un reporte. Pero nadie
 * entra a Meta a mirar un CTR: entra a ver si algo se rompió, si falta pauta en algún lado, o a
 * tocar un presupuesto. Un reporte como portada obliga a saber de antemano a qué subsección ir.
 *
 * 🔑 **Y encima es más rápido.** El Panel se arma con `?recurso=etapas` (1,7 s medido en prod el
 * 8-ago-2026); Rendimiento pide el detalle de una cuenta, que tarda ~10 s y arranca en la cuenta
 * que Meta devuelve primera. Abrir en cero durante diez segundos enseña que la sección no anda.
 *
 * # Lo que NO está acá, a propósito
 *
 * Ni «Planes en curso» ni «Empezar (Crear · Duplicar · Escalar)»: el motor de planes es la tanda
 * siguiente. Un bloque vacío prometiendo algo que no existe es peor que no tenerlo — es la misma
 * regla del ámbar permanente.
 */

import Link from 'next/link'
import { useCampanias, type Campanias } from '@/components/meta-ads/useCampanias'
import { VentanaEtapas } from '@/components/meta-ads/VentanaEtapas'
import { plata } from '@/lib/meta-ads/formato'
import { ETIQUETA_ETAPA } from '@/lib/meta-ads/etapas'
import { ETIQUETA_LINEA, LINEAS } from '@/lib/meta-ads/lineas'
import type { Diagnostico, LineaPauta } from '@/lib/meta-ads/tipos'
import {
  Card, EmptyState, Notice, SectionCard, StatusPill, TBody, TableWrap, Td, Th, THead, Tr,
  color, font, radius, space, weight,
} from '@/components/ui'

export function Panel() {
  const m = useCampanias()
  const d = m.diagPorLinea

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <VentanaEtapas dias={m.dias} setDias={m.setDias} />

      {m.estado.fase === 'cargando' && <Card style={{ color: color.mut2 }}>Leyendo las campañas de Meta…</Card>}

      {m.estado.fase === 'error' && (
        <Notice tone="danger">
          No se pudieron traer las campañas: {m.estado.motivo}
          <div style={{ fontSize: font.sm, marginTop: space[1] }}>
            Si dice «Meta Ads no configurado», falta <code>META_ADS_TOKEN</code> en el servidor. El{' '}
            <Link href="/meta-ads/registro">Registro</Link> y las <Link href="/meta-ads/ideas">Ideas</Link>{' '}
            andan igual: no hablan con Meta.
          </div>
        </Notice>
      )}

      {m.estado.fase === 'ok' && d && (
        <>
          <QueDecidir
            m={m}
            diagPorLinea={d}
            sinMarcaConGasto={m.estado.data.sinAsignar.filter((c) => c.tuvoActividad).length}
          />
          <AlAire diagPorLinea={d} />
        </>
      )}
    </div>
  )
}

/**
 * **Lo que pide una decisión, arriba de todo.**
 *
 * Cada renglón nombra el problema, dice cuántos son y linkea al lugar donde se arregla. Si no hay
 * nada que decidir, se dice explícito: un bloque que sólo aparece con malas noticias deja sin saber
 * si el silencio es «está todo bien» o «no se miró».
 */
function QueDecidir({ m, diagPorLinea, sinMarcaConGasto }: {
  m: Campanias
  diagPorLinea: Partial<Record<LineaPauta, Diagnostico>>
  sinMarcaConGasto: number
}) {
  const huecos = LINEAS.flatMap((l) => {
    const d = diagPorLinea[l]
    if (!d) return []
    const vacias = d.etapas.filter((e) => e.alAire.length === 0)
    return vacias.length ? [{ linea: l, etapas: vacias.map((e) => ETIQUETA_ETAPA[e.etapa]) }] : []
  })
  const listas = m.funnel.ideas.filter((i) => i.estado === 'lista').length
  const nada = sinMarcaConGasto === 0 && huecos.length === 0 && listas === 0

  return (
    <SectionCard title="Qué hay que decidir" subtitle="Lo que está esperando a que alguien haga algo.">
      {nada ? (
        <div style={{ fontSize: font.base, color: color.mut, lineHeight: 1.5 }}>
          Nada pendiente: toda la plata está atribuida, las tres etapas tienen pauta al aire en cada
          marca y no hay ideas listas esperando salir.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {/* 🔴 Va primero porque es el único que hace que los demás números estén MAL: mientras haya
              plata sin marca, ningún diagnóstico de abajo está completo. */}
          {sinMarcaConGasto > 0 && (
            <Renglon
              tono="warning"
              titulo={sinMarcaConGasto === 1
                ? '1 campaña está gastando sin marca asignada'
                : `${sinMarcaConGasto} campañas están gastando sin marca asignada`}
              detalle="Su plata no entra en ningún diagnóstico, así que todos los números de abajo están incompletos. Y sin marca no se las puede accionar, ni siendo admin."
              href="/meta-ads/embudo"
              accion="Asignarles marca"
            />
          )}

          {huecos.map((h) => (
            <Renglon
              key={h.linea}
              tono="danger"
              titulo={`${ETIQUETA_LINEA[h.linea]} no tiene nada al aire en ${h.etapas.join(' ni ')}`}
              detalle="Hace falta pensar la pieza de esa etapa. La idea se anota en el tablero y ya sale con la etapa preelegida."
              href="/meta-ads/embudo"
              accion="Ver el embudo"
            />
          ))}

          {listas > 0 && (
            <Renglon
              tono="brand"
              titulo={listas === 1 ? '1 idea está lista para pautear' : `${listas} ideas están listas para pautear`}
              detalle="La pieza ya está producida y espera que alguien la ponga al aire."
              href="/meta-ads/ideas"
              accion="Ver el tablero"
            />
          )}
        </div>
      )}
    </SectionCard>
  )
}

function Renglon({ tono, titulo, detalle, href, accion }: {
  tono: 'warning' | 'danger' | 'brand'
  titulo: string
  detalle: string
  href: string
  accion: string
}) {
  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'center',
        justifyContent: 'space-between',
        border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[3],
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], flexWrap: 'wrap' }}>
          <StatusPill tone={tono} label={tono === 'danger' ? 'Hueco' : tono === 'warning' ? 'Sin atribuir' : 'Para salir'} />
          <span style={{ fontSize: font.base, fontWeight: weight.semibold }}>{titulo}</span>
        </div>
        <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[1], lineHeight: 1.45 }}>{detalle}</div>
      </div>
      <Link href={href} style={{ fontSize: font.sm, fontWeight: weight.semibold, color: color.brandSolid }}>
        {accion} →
      </Link>
    </div>
  )
}

/** Qué está entregando ahora mismo, por marca. Es la foto que contesta «¿está todo prendido?». */
function AlAire({ diagPorLinea }: { diagPorLinea: Partial<Record<LineaPauta, Diagnostico>> }) {
  const lineas = LINEAS.filter((l) => diagPorLinea[l])
  if (lineas.length === 0) {
    return <EmptyState title="No hay ninguna línea que puedas ver" hint="Es un tema de permisos, no de Meta." dashed />
  }

  return (
    <SectionCard
      title="Al aire ahora"
      subtitle="Lo que está entregando en la ventana elegida. «Al aire» es activa Y con gasto: una campaña activa cuyos conjuntos están todos pausados no entrega nada."
    >
      <TableWrap>
        <THead>
          <Tr>
            <Th>Marca</Th>
            <Th align="right">Al aire</Th>
            <Th align="right">Gasto</Th>
            <Th align="right">Pausadas</Th>
            <Th>Cómo viene</Th>
          </Tr>
        </THead>
        <TBody>
          {lineas.map((l) => {
            const d = diagPorLinea[l] as Diagnostico
            const alAire = d.etapas.reduce((n, e) => n + e.alAire.length, 0)
            const pausadas = d.etapas.reduce((n, e) => n + e.pausadas.length, 0)
            const v = d.veredicto
            const tone = v.clase === 'vacia' ? 'danger' : v.clase === 'floja' ? 'warning' : v.clase === 'ok' ? 'success' : 'neutral'
            return (
              <Tr key={l}>
                <Td strong>
                  <Link href={`/meta-ads/campanias?linea=${l}`} style={{ color: 'inherit' }}>{ETIQUETA_LINEA[l]}</Link>
                </Td>
                <Td align="right">{alAire}</Td>
                <Td align="right">{plata(d.gastoTotal)}</Td>
                <Td align="right">{pausadas || '—'}</Td>
                <Td wrap><StatusPill tone={tone} label={v.titulo} /></Td>
              </Tr>
            )
          })}
        </TBody>
      </TableWrap>
    </SectionCard>
  )
}

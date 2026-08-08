'use client'

/**
 * Los conjuntos de una campaña, desplegados debajo de su fila en `/meta-ads/etapas`.
 *
 * # Por qué hacía falta una lectura nueva
 *
 * **No había ni un dato de conjunto en todo el sistema.** Ni el censo de etapas ni el detalle de
 * cuenta traen adsets, y el conjunto es justo donde vive el presupuesto cuando la campaña no es CBO.
 * Sin esto, la palanca de escala sólo podía tocar campañas.
 *
 * # La pregunta que sólo se contesta mirando al padre
 *
 * Si la campaña tiene presupuesto propio (lo que Meta llama «presupuesto de la campaña», CBO), lo
 * reparte sola entre sus conjuntos y el de cada conjunto **no se puede tocar**. Eso no se ve mirando
 * el conjunto: hay que mirar la campaña. El endpoint la mira una vez y lo contesta en `cbo`, y acá
 * eso se convierte en un cartel que dice dónde tocarlo, en vez de un botón que Meta va a rechazar.
 *
 * A demanda al desplegar la fila, igual que los avisos y por el mismo motivo: el censo lista más de
 * 170 campañas.
 */

import { useCallback, useRef, useState } from 'react'
import { traerConjuntos } from '@/lib/meta-ads/cliente'
import { aMonto } from '@/lib/meta-ads/acciones'
import type { ConjuntoMeta, LineaPauta, RespuestaConjuntos } from '@/lib/meta-ads/tipos'
import type { Acciones } from '@/components/meta-ads/ConfirmAccion'
import { BotonesAccion } from '@/components/meta-ads/ConfirmAccion'
import {
  Notice, TBody, TableWrap, Td, Th, THead, Tr, StatusPill, color, font, space,
} from '@/components/ui'

type Cargable<T> = { fase: 'cargando' } | { fase: 'error'; motivo: string } | { fase: 'ok'; data: T }

export type Conjuntos = {
  abiertas: ReadonlySet<string>
  alternar: (campaignId: string) => void
  dato: (campaignId: string) => Cargable<RespuestaConjuntos> | null
  /** Vuelve a pedir los conjuntos de una campaña. Lo llama quien accionó sobre uno. */
  recargar: (campaignId: string) => void
}

const nf = new Intl.NumberFormat('es-AR')
const money = (v: number, moneda: string) => {
  const cur = /^[A-Z]{3}$/.test(moneda) ? moneda : 'ARS'
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)
  } catch {
    return `${cur} ${nf.format(Math.round(v))}`
  }
}

const VACIO: ReadonlySet<string> = new Set()

/**
 * El estado de los desplegables y su caché.
 *
 * La caché lleva `dias` en la clave en vez de vaciarse cuando cambia la ventana — mismo motivo que
 * en `Avisos.tsx`: vaciarla habría que hacerlo en un efecto, y un efecto que corrige el estado
 * después de renderizar deja un cuadro intermedio con los números de la otra ventana.
 */
export function useConjuntos(dias: number): Conjuntos {
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(VACIO)
  const [cache, setCache] = useState<Record<string, Cargable<RespuestaConjuntos>>>({})
  const pedidas = useRef<Set<string>>(new Set())

  const pedir = useCallback((campaignId: string) => {
    const clave = `${dias}|${campaignId}`
    pedidas.current.add(clave)
    setCache((m) => ({ ...m, [clave]: { fase: 'cargando' } }))
    traerConjuntos(campaignId, dias).then((res) => {
      setCache((m) => ({
        ...m,
        [clave]: res.ok ? { fase: 'ok', data: res.dato } : { fase: 'error', motivo: res.motivo },
      }))
    })
  }, [dias])

  const alternar = useCallback((campaignId: string) => {
    setAbiertas((s) => {
      const n = new Set(s)
      if (n.has(campaignId)) n.delete(campaignId)
      else n.add(campaignId)
      return n
    })
    if (!pedidas.current.has(`${dias}|${campaignId}`)) pedir(campaignId)
  }, [dias, pedir])

  const dato = useCallback((campaignId: string) => cache[`${dias}|${campaignId}`] ?? null, [cache, dias])

  return { abiertas, alternar, dato, recargar: pedir }
}

export function PanelConjuntos({ estado, moneda, linea, acciones }: {
  estado: Cargable<RespuestaConjuntos> | null
  moneda: string
  /** La línea de la campaña de la que cuelgan. Es contra ella que se pregunta el permiso. */
  linea: LineaPauta | null
  acciones: Acciones
}) {
  if (!estado || estado.fase === 'cargando') {
    return <div style={{ color: color.mut2, fontSize: font.sm, padding: space[3] }}>Trayendo los conjuntos…</div>
  }
  if (estado.fase === 'error') {
    return <Notice tone="warning" style={{ margin: space[2] }}>No se pudieron traer los conjuntos: {estado.motivo}</Notice>
  }

  const { conjuntos, cbo, campania } = estado.data
  if (conjuntos.length === 0) {
    return (
      <div style={{ color: color.mut2, fontSize: font.sm, padding: space[3], fontStyle: 'italic' }}>
        Esta campaña no tiene conjuntos.
      </div>
    )
  }

  return (
    <div style={{ padding: space[3], display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {cbo && (
        <Notice tone="neutral">
          El presupuesto está <b>a nivel campaña</b> ({money(aMonto(campania.diarioCrudo, moneda), moneda)} por día):
          Meta lo reparte solo entre estos conjuntos y el de cada uno no se puede tocar. Para cambiarlo,
          usá el botón de la fila de la campaña.
        </Notice>
      )}
      <TableWrap>
        <THead>
          <Tr>
            <Th>Conjunto</Th>
            <Th>Optimiza para</Th>
            <Th align="right">Diario</Th>
            <Th align="right">Gasto</Th>
            <Th align="right">Compras</Th>
            <Th>Estado</Th>
            <Th>Acciones</Th>
          </Tr>
        </THead>
        <TBody>
          {conjuntos.map((c) => (
            <FilaConjunto key={c.id} c={c} campania={campania.id} moneda={moneda} linea={linea} cbo={cbo} acciones={acciones} />
          ))}
        </TBody>
      </TableWrap>
    </div>
  )
}

function FilaConjunto({ c, campania, moneda, linea, cbo, acciones }: {
  c: ConjuntoMeta
  /** La campaña de la que cuelga: es por campaña que se pregunta si sus creativos se pueden copiar. */
  campania: string
  moneda: string
  linea: LineaPauta | null
  cbo: boolean
  acciones: Acciones
}) {
  const objeto = { nivel: 'conjunto' as const, id: c.id, nombre: c.nombre, linea, moneda, campania }
  return (
    <Tr>
      <Td wrap strong>{c.nombre}</Td>
      <Td>
        <span style={{ fontSize: font.xs, color: color.mut }}>
          {c.objetivo ? c.objetivo.toLowerCase().replace(/_/g, ' ') : '—'}
        </span>
      </Td>
      <Td align="right">
        {/* Un conjunto adentro de una campaña con presupuesto propio no tiene diario suyo: decir
            «$0» sería mentir. Se dice de dónde sale. */}
        {cbo ? <span style={{ color: color.mut2, fontSize: font.xs }}>de la campaña</span>
          : c.diarioCrudo ? money(aMonto(c.diarioCrudo, moneda), moneda)
            : c.totalCrudo ? <span style={{ color: color.mut2, fontSize: font.xs }} title="Presupuesto total: se muestra pero no se edita desde acá">total {money(aMonto(c.totalCrudo, moneda), moneda)}</span>
              : '—'}
      </Td>
      <Td align="right">{money(c.spend, moneda)}</Td>
      <Td align="right">{c.purchases ? nf.format(c.purchases) : '—'}</Td>
      <Td><EstadoConjunto s={c.estado} configurado={c.configurado} /></Td>
      <Td>
        <BotonesAccion
          objeto={objeto}
          // 🔑 **El botón se decide con el estado CONFIGURADO, no con el efectivo.** Un conjunto
          // `status: 'ACTIVE'` dentro de una campaña pausada figura `CAMPAIGN_PAUSED`, y con el
          // efectivo el botón ofrecía «Reactivar» —una escritura que no cambia nada y contesta que
          // sí—. Y una copia recién nacida figura `IN_PROCESS` con `status: 'PAUSED'`. Lo que se
          // acciona es el estado de ESTE objeto.
          estado={c.configurado ?? c.estado}
          diarioCrudo={c.diarioCrudo}
          // CBO manda: el botón de presupuesto no se dibuja, porque no hay nada que tocar acá.
          sinPresupuesto={cbo}
          acciones={acciones}
        />
      </Td>
    </Tr>
  )
}

/**
 * El estado de un conjunto: el efectivo manda, salvo cuando no dice nada del conjunto.
 *
 * 🔴 **`IN_PROCESS` era la trampa.** Una copia recién creada viene con `effective_status:
 * 'IN_PROCESS'` y `status: 'PAUSED'`, y la tabla mostraba «in process»: un estado que no está en
 * ninguna parte de la cabeza de quien mira, justo arriba de un botón que decía «Reactivar». Ahora se
 * muestra lo que el conjunto ES (pausado) y al lado, chiquito, que Meta lo está terminando de armar.
 */
function EstadoConjunto({ s, configurado }: { s: string | null; configurado?: string | null }) {
  if (s === 'IN_PROCESS' && configurado) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1], flexWrap: 'wrap' }}>
        <Pastilla s={configurado} />
        <span style={{ fontSize: font.xs, color: color.mut2 }} title="Meta está terminando de armarlo (pasa con las copias recién hechas)">
          en proceso
        </span>
      </span>
    )
  }
  return <Pastilla s={s} />
}

function Pastilla({ s }: { s: string | null }) {
  if (!s) return <span style={{ color: color.mut2 }}>—</span>
  if (s === 'ACTIVE') return <StatusPill tone="success" label="Activo" />
  if (s.includes('PAUSED')) return <StatusPill tone="neutral" label="Pausado" />
  if (s === 'WITH_ISSUES' || s === 'DISAPPROVED') return <StatusPill tone="danger" label="Con problemas" />
  return <StatusPill tone="neutral" label={s.toLowerCase().replace(/_/g, ' ')} />
}

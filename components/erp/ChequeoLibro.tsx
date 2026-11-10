'use client'

/**
 * ERP › Stock › Diferencias › «Chequeo del libro» (Bruno 10-nov: «ver contenciones nocturnas para chequeo correcto de los
 * movimientos»). Las MISMAS reglas que corre cada noche el motor («Reglas del libro»), corridas EN VIVO contra la base de la
 * marca: cada regla con su estado, cuántas filas la rompen y las primeras. Sólo lee. Sólo Admin (`reglas-libro`).
 * Servidor: `api/_erp-chequeo-libro.js`; núcleo `lib/erp/chequeo-libro.core.js`.
 * 🔑 La base de Zattia es también la de Stunned: las reglas son de la BASE (la fila dice de qué línea es).
 */

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import type { AlContar } from './ListasJuntas'
import { Button, Notice, color, font, space } from '@/components/ui'
import { ChipEstado, TileResumen } from '@/components/ui/PiezasLista'
import { leerChequeoDelLibro, type ChequeoDelLibro, type MarcaErp, type ReglaDelLibro } from '@/lib/erp/cliente'

const ESTADO = {
  falla: ['danger', 'Error'],
  aviso: ['warning', 'Para mirar'],
  omitida: ['neutral', 'Sin revisar'],
  ok: ['success', 'Bien'],
} as const
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })

function Regla({ r }: { r: ReglaDelLibro }) {
  const [abierta, setAbierta] = useState(r.estado === 'falla')
  const conFilas = r.ejemplos.length > 0
  return (
    <div data-regla={r.id} style={{ display: 'flex', flexDirection: 'column', gap: space[2], padding: `${space[3]}px 0`, borderTop: `1px solid ${color.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <span style={{ flex: '0 0 auto' }}><ChipEstado mapa={ESTADO} k={r.estado} /></span>
        <span style={{ flex: '1 1 260px', color: color.ink }}>{r.titulo}</span>
        <span style={{ flex: '0 0 auto', fontVariantNumeric: 'tabular-nums', color: r.total ? color.ink : color.mut }}>{r.estado === 'omitida' ? '—' : `${r.total.toLocaleString('es-AR')} ${r.total === 1 ? 'fila' : 'filas'}`}</span>
        {conFilas && <Button size="sm" variant="ghost" onClick={() => setAbierta((x) => !x)}>{abierta ? 'Ocultar' : 'Ver las primeras'}</Button>}
      </div>
      {r.porque && <span style={{ fontSize: font.sm, color: color.mut }}>No se pudo revisar: {r.porque}.</span>}
      {abierta && conFilas && (
        <ul style={{ margin: 0, paddingLeft: space[5], display: 'flex', flexDirection: 'column', gap: 2, fontSize: font.sm, color: color.ink2 }}>
          {r.ejemplos.map((e, i) => <li key={i}><b style={{ fontWeight: 600 }}>{e.ref}</b>{e.detalle ? ` · ${e.detalle}` : ''}</li>)}
          {r.total > r.ejemplos.length && <li style={{ listStyle: 'none', color: color.mut }}>y {(r.total - r.ejemplos.length).toLocaleString('es-AR')} más</li>}
        </ul>
      )}
    </div>
  )
}

export function ChequeoLibro({ alContar }: { alContar?: AlContar }) {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const [datos, setDatos] = useState<ChequeoDelLibro | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const pedido = `${marca}|${vuelta}`
  const [leido, setLeido] = useState<string | null>(null)
  const revisando = leido !== pedido

  useEffect(() => {
    let vivo = true
    leerChequeoDelLibro(marca)
      .then((d) => { if (vivo) { setDatos(d); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron revisar los movimientos de stock.'))
      .finally(() => vivo && setLeido(pedido))
    return () => { vivo = false }
  }, [marca, pedido])

  useEffect(() => { alContar?.(revisando || !datos ? null : datos.cuenta.falla + datos.cuenta.aviso) }, [alContar, revisando, datos])

  const c = datos?.cuenta
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: color.mut, fontSize: font.sm, flex: '1 1 320px' }}>
          Las mismas reglas que se revisan cada noche, sobre todos los movimientos de stock{marca === 'zattia' ? ' de Zattia y Stunned' : ' de BDI'}. Un error hay que arreglarlo; «Para mirar» es una pista (mientras siga Gestión Nube, un stock negativo es esperable).
        </p>
        <Button variant="outline" disabled={revisando} onClick={() => setVuelta((n) => n + 1)}>{revisando ? 'Revisando…' : 'Revisar ahora'}</Button>
      </div>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {c && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <TileResumen oscuro titulo="Errores" valor={c.falla.toLocaleString('es-AR')} nota={c.falla ? 'para arreglar' : 'ninguno'} />
          <TileResumen tono={c.aviso ? 'revisar' : 'bien'} titulo="Para mirar" valor={c.aviso.toLocaleString('es-AR')} />
          <TileResumen tono="bien" titulo="Bien" valor={c.ok.toLocaleString('es-AR')} nota={`de ${datos!.reglas.length} reglas`} />
          {c.omitida > 0 && <TileResumen titulo="Sin revisar" valor={c.omitida.toLocaleString('es-AR')} />}
        </div>
      )}
      {datos && <span style={{ fontSize: font.sm, color: color.mut }}>Revisado a las {hora(datos.revisadoEn)}.</span>}
      {datos && <div>{datos.reglas.map((r) => <Regla key={r.id} r={r} />)}</div>}
    </div>
  )
}

'use client'

/**
 * Historial de la reposición armada con el lector (Darío, 12-oct-2026): un renglón por armado y, al
 * abrirlo, qué pasó con cada prenda. Arriba, lo que más veces no se encontró: la señal de un stock mal
 * cargado (el sistema dice que hay y en el estante no).
 *
 * Sólo lee (`api/_repo-armado.js?action=historial`). Los descartados no se muestran.
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import { estadoRenglon, leerHistorial, masNoEncontradas, noEncontradas, resumenArmado, talle, type Armado, type EstadoRenglon } from '@/lib/reposicion/armado'
import type { LineaZ } from '@/lib/reposicion/porVentas'
import { Badge, Button, EmptyState, Esqueleto, Notice, TBody, THead, TableWrap, Td, Th, Tr, color, font, space } from '@/components/ui'

const fechaCorta = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })
const hora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—')
function duracion(desde: string, hasta: string | null): string {
  if (!hasta) return '—'
  const min = Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

const ESTADO: Record<Armado['estado'], { txt: string; tone: 'success' | 'brand' | 'danger' | 'neutral' }> = {
  transferido: { txt: 'Transferida', tone: 'success' },
  en_curso: { txt: 'En curso', tone: 'brand' },
  transfiriendo: { txt: 'Sin confirmar', tone: 'danger' },
  revisar: { txt: 'Sin confirmar', tone: 'danger' },
  cancelado: { txt: 'Descartada', tone: 'neutral' },
}

const RESULTADO: Record<EstadoRenglon, { txt: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  completa: { txt: 'Completa', tone: 'success' },
  parcial: { txt: 'Parcial', tone: 'warning' },
  'no-estaba': { txt: 'No encontrada', tone: 'danger' },
  rechazada: { txt: 'Rechazada', tone: 'danger' },
  despues: { txt: 'Pendiente', tone: 'neutral' },
  'sin-respuesta': { txt: '—', tone: 'neutral' },
}

export function HistorialArmados({ linea }: { linea: LineaZ }) {
  const [armados, setArmados] = useState<Armado[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const a = await leerHistorial(linea)
        if (vivo) {
          setArmados(a)
          setError(null)
        }
      } catch (e) {
        if (vivo) setError((e as Error).message)
      }
    })()
    return () => {
      vivo = false
    }
  }, [linea])

  const repetidas = useMemo(() => masNoEncontradas(armados || []), [armados])

  if (error) return <Notice tone="danger" icon="⚠">No se pudo cargar el historial: {error}</Notice>
  if (!armados) return <Esqueleto forma="tabla" filas={6} />
  if (!armados.length) return <EmptyState icon="📦" title="No hay reposiciones armadas con el lector" hint="Cada armado finalizado queda registrado acá." dashed />

  return (
    <>
      {repetidas.length > 0 && (
        <div style={{ marginBottom: space[4] }}>
          <h3 style={{ fontSize: font.md, margin: `0 0 ${space[2]}px`, color: color.ink }}>Más veces no encontradas</h3>
          <TableWrap>
            <THead>
              <Tr>
                <Th width={150}>SKU</Th>
                <Th>Producto</Th>
                <Th width={130}>Variante</Th>
                <Th align="center" width={80}>Veces</Th>
                <Th align="center" width={90}>Unidades</Th>
              </Tr>
            </THead>
            <TBody>
              {repetidas.map((r) => (
                <Tr key={r.vid}>
                  <Td style={{ fontSize: font.sm, color: color.mut }}>{r.sku || '—'}</Td>
                  <Td wrap>{r.name}</Td>
                  <Td>{talle(r.size) || 'Única'}</Td>
                  <Td align="center" style={{ fontWeight: 700, color: r.veces > 1 ? color.danger : color.ink2 }}>
                    {r.veces}
                  </Td>
                  <Td align="center">{r.unidades}</Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>
        </div>
      )}

      <TableWrap>
        <THead>
          <Tr>
            <Th width={110}>Fecha</Th>
            <Th width={110}>Tipo</Th>
            <Th>Preparó</Th>
            <Th align="center" width={110}>Horario</Th>
            <Th align="center" width={80}>Duración</Th>
            <Th align="center" width={80}>Pedidas</Th>
            <Th align="center" width={90}>Escaneadas</Th>
            <Th align="center" width={110}>No encontradas</Th>
            <Th align="center" width={110}>Transferencia</Th>
            <Th width={120}>Estado</Th>
            <Th width={80} />
          </Tr>
        </THead>
        <TBody>
          {armados.map((a) => {
            const r = resumenArmado(a.pedido, a.escaneos || {})
            const ne = noEncontradas(a)
            const e = ESTADO[a.estado]
            const ver = abierto === a.id
            return (
              <Fragment key={a.id}>
                <Tr>
                  <Td>{fechaCorta(a.fecha)}</Td>
                  <Td>{a.sentido === 'devolver' ? 'Devolución' : 'Reposición'}</Td>
                  <Td>{a.persona || '—'}</Td>
                  <Td align="center" style={{ color: color.mut }}>
                    {hora(a.creado_en)} – {hora(a.cerrado_en)}
                  </Td>
                  <Td align="center" style={{ color: color.mut }}>
                    {duracion(a.creado_en, a.cerrado_en)}
                  </Td>
                  <Td align="center">{r.pedidas}</Td>
                  <Td align="center" style={{ fontWeight: 700 }}>
                    {r.escaneadas}
                  </Td>
                  <Td align="center" style={{ fontWeight: ne ? 700 : undefined, color: ne ? color.danger : color.mut2 }}>
                    {ne}
                  </Td>
                  <Td align="center" style={{ color: color.mut }}>
                    {(a.transfer?.tandas?.length ?? 0) > 1 ? a.transfer!.tandas!.map((t) => t.transfer_id).join(', ') : (a.transfer?.transfer_id ?? '—')}
                  </Td>
                  <Td>
                    <Badge tone={e.tone}>{e.txt}</Badge>
                  </Td>
                  <Td align="right">
                    <Button size="sm" variant="ghost" onClick={() => setAbierto(ver ? null : a.id)} aria-label={`${ver ? 'Ocultar' : 'Ver'} el detalle del ${fechaCorta(a.fecha)}`}>
                      {ver ? 'Ocultar' : 'Ver'}
                    </Button>
                  </Td>
                </Tr>
                {ver && (
                  <Tr>
                    <Td colSpan={11} style={{ background: color.bg2, padding: space[3] }}>
                      <Detalle a={a} />
                    </Td>
                  </Tr>
                )}
              </Fragment>
            )
          })}
        </TBody>
      </TableWrap>
    </>
  )
}

function Detalle({ a }: { a: Armado }) {
  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th width={150}>SKU</Th>
          <Th>Producto</Th>
          <Th width={130}>Variante</Th>
          <Th align="center" width={80}>Pedido</Th>
          <Th align="center" width={90}>Escaneado</Th>
          <Th width={140}>Resultado</Th>
        </Tr>
      </THead>
      <TBody>
        {a.pedido.map((l) => {
          const res = RESULTADO[estadoRenglon(a, l)]
          return (
            <Tr key={l.vid}>
              <Td style={{ fontSize: font.sm, color: color.mut }}>{l.sku || '—'}</Td>
              <Td wrap>{l.name}</Td>
              <Td>{talle(l.size) || 'Única'}</Td>
              <Td align="center">{l.cant}</Td>
              <Td align="center" style={{ fontWeight: 700 }}>
                {a.escaneos?.[l.vid] || 0}
              </Td>
              <Td>{res.txt === '—' ? <span style={{ color: color.mut2 }}>—</span> : <Badge tone={res.tone}>{res.txt}</Badge>}</Td>
            </Tr>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

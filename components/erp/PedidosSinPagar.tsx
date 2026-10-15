'use client'

/**
 * ERP › Pedidos sin pagar (`pantallas.md` #8): los pedidos de Tienda Nube abiertos y sin pagar, que tienen la
 * prenda RETENIDA (Bruno, 12-oct: el stock se aparta cuando entra el pedido). Del más viejo al más nuevo, para
 * cobrarlos (en Cobranzas) o cancelarlos (en el admin de TN). Sólo lectura; TN se lee cada 2 h.
 */

import { useEffect, useState } from 'react'
import { Badge, Button, EmptyState, MoneyText, Notice, SectionCard, TableWrap, TBody, Td, Th, THead, Tr, Tabs, space } from '@/components/ui'
import { leerPedidosSinPagar, type MarcaErp, type PedidoSinPagar } from '@/lib/erp/cliente'
import { NOMBRE_MEDIO_TN } from '@/lib/erp/pedidos-tn.core.js'

const MARCAS: Array<{ key: MarcaErp; label: string }> = [{ key: 'zattia', label: 'Zattia y Stunned' }, { key: 'bdi', label: 'BDI' }]
const NOMBRE_TIENDA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
const cuando = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}
/** Desde cuántos días un pedido sin pagar se marca como viejo (a cobrar o cancelar ya). */
const VIEJO_DIAS = 3

export function PedidosSinPagar() {
  const [marca, setMarca] = useState<MarcaErp>('zattia')
  const [vuelta, setVuelta] = useState(0)
  const [datos, setDatos] = useState<{ pedidos: PedidoSinPagar[]; porTienda: Record<string, { pedidos: number; unidades: number; total: number }>; leidaEn: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pedido = `${marca}|${vuelta}`
  const [leido, setLeido] = useState<string | null>(null)
  const cargando = leido !== pedido

  useEffect(() => {
    let vivo = true
    leerPedidosSinPagar(marca)
      .then((d) => { if (vivo) { setDatos(d); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer los pedidos sin pagar.'))
      .finally(() => vivo && setLeido(pedido))
    return () => { vivo = false }
  }, [marca, pedido])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="Pedidos sin pagar" subtitle="Los pedidos de Tienda Nube abiertos que todavía no se cobraron: tienen la prenda retenida. Cobralos en Cobranzas o cancelalos en Tienda Nube.">
        <Tabs items={MARCAS} value={marca} onChange={(k) => { setMarca(k as MarcaErp); setDatos(null) }} />
        {datos && (
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[3], alignItems: 'center' }}>
            {Object.entries(datos.porTienda).map(([t, x]) => (
              <Badge key={t} tone="neutral">{NOMBRE_TIENDA[t] ?? t}: {x.pedidos} pedidos · {x.unidades} prendas · <MoneyText value={x.total} /></Badge>
            ))}
            {datos.leidaEn && <span style={{ fontSize: 12 }}>Tienda Nube leída el {cuando(datos.leidaEn)}.</span>}
            <span style={{ flex: 1 }} />
            <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>Volver a leer</Button>
          </div>
        )}
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {cargando && !datos && <EmptyState title="Leyendo los pedidos…" />}

      {datos && (
        <SectionCard title={`${datos.pedidos.length} sin pagar`}>
          {!datos.pedidos.length ? <EmptyState title="No hay pedidos sin pagar." /> : (
            <TableWrap>
              <table>
                <THead>
                  <Tr><Th>Pedido</Th><Th>Entró</Th><Th>Medio</Th><Th>Prendas</Th><Th style={{ textAlign: 'right' }}>Total</Th><Th /></Tr>
                </THead>
                <TBody>
                  {datos.pedidos.map((p) => (
                    <Tr key={`${p.tienda}/${p.tnId}`}>
                      <Td>#{p.numero}{p.tienda !== marca && <> <Badge tone="neutral">{NOMBRE_TIENDA[p.tienda] ?? p.tienda}</Badge></>}</Td>
                      <Td>{cuando(p.creadaEn)}{p.dias >= VIEJO_DIAS && <> <Badge tone="warning">hace {p.dias} días</Badge></>}</Td>
                      <Td>{(p.medio && NOMBRE_MEDIO_TN[p.medio as keyof typeof NOMBRE_MEDIO_TN]) || p.gateway || '—'}</Td>
                      <Td>{p.prendas.map((x) => `${x.cantidad > 1 ? `${x.cantidad} × ` : ''}${x.nombre ?? x.sku ?? '¿?'}`).join(' · ')}</Td>
                      <Td style={{ textAlign: 'right' }}><MoneyText value={p.total} /></Td>
                      <Td>{p.link && <a href={p.link} target="_blank" rel="noreferrer">Abrir en Tienda Nube</a>}</Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableWrap>
          )}
        </SectionCard>
      )}
    </div>
  )
}

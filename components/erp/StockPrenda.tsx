'use client'

/**
 * ERP › Stock. Lo que dice el LIBRO de stock de una prenda, por depósito, al lado de lo que dice GN;
 * y cada movimiento que la tocó (venta, transferencia, conteo, anulación) con el saldo después.
 * GN ⛔ tiene historial: ésta es la pantalla que lo reemplaza. Sólo lectura.
 *
 * El libro se escribe una vez por día (la corrida de las 13:00) ⇒ lo de hoy puede no estar todavía;
 * GN es el espejo de `inventario`, de la última sincronización.
 */

import { useEffect, useState } from 'react'
import {
  Badge, Button, EmptyState, Input, Notice, SectionCard, TableWrap, TBody, Td, Th, THead, Tr, Tabs, space,
} from '@/components/ui'
import { buscarPrendas, leerStockDePrenda, type MarcaErp, type PrendaEncontrada, type StockDePrenda } from '@/lib/erp/cliente'
import { NOMBRE_DEPOSITO, NOMBRE_ORIGEN, NOMBRE_TIPO } from '@/lib/erp/stock.core.js'

const MARCAS: Array<{ key: MarcaErp; label: string }> = [{ key: 'zattia', label: 'Zattia' }, { key: 'bdi', label: 'BDI' }]
const nombreDe = (mapa: Record<string, string>, k: string) => mapa[k] ?? k
const cuando = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}
const conSigno = (n: number) => (n > 0 ? `+${n}` : String(n))

/** La prenda que pide abrir otra pestaña (Diferencias): cada pedido nuevo es un objeto nuevo. */
export type PrendaPedida = { marca: MarcaErp; producto: string; talle: string }

export function StockPrenda({ pedida = null }: { pedida?: PrendaPedida | null } = {}) {
  const [marca, setMarca] = useState<MarcaErp>(pedida?.marca ?? 'zattia')
  const [texto, setTexto] = useState('')
  const [encontradas, setEncontradas] = useState<PrendaEncontrada[] | null>(null)
  const [cortado, setCortado] = useState(false)
  const [ficha, setFicha] = useState<StockDePrenda | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(!!pedida)

  async function buscar() {
    setTrabajando(true)
    setFicha(null)
    try {
      const r = await buscarPrendas(marca, texto)
      setEncontradas(r.variantes)
      setCortado(r.cortado)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar.')
    } finally {
      setTrabajando(false)
    }
  }

  async function abrir(p: PrendaEncontrada) {
    setTrabajando(true)
    try {
      setFicha(await leerStockDePrenda(marca, p.producto, p.talle))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el stock de la prenda.')
    } finally {
      setTrabajando(false)
    }
  }

  // La prenda pedida desde otra pestaña: `Erp` monta esta pestaña de nuevo (key) ⇒ arranca con su marca y cargando.
  useEffect(() => {
    if (!pedida) return
    let vivo = true
    leerStockDePrenda(pedida.marca, pedida.producto, pedida.talle)
      .then((f) => { if (vivo) { setFicha(f); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo leer el stock de la prenda.'))
      .finally(() => vivo && setTrabajando(false))
    return () => { vivo = false }
  }, [pedida])

  // Otra marca: lo de antes se limpia en el MISMO cambio.
  function cambiarMarca(k: string) {
    setMarca(k as MarcaErp)
    setEncontradas(null)
    setFicha(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="Stock de una prenda" subtitle="Lo que dice el libro de stock por depósito, al lado de GN, y cada movimiento. El libro se actualiza una vez por día.">
        <Tabs items={MARCAS} value={marca} onChange={cambiarMarca} />
        <form
          onSubmit={(e) => { e.preventDefault(); void buscar() }}
          style={{ display: 'flex', gap: space[2], marginTop: space[3], flexWrap: 'wrap' }}
        >
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="SKU, código de barras o nombre" aria-label="Buscar prenda" style={{ flex: '1 1 240px' }} />
          <Button type="submit" disabled={trabajando || texto.trim().length < 3}>Buscar</Button>
        </form>
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      {encontradas && !ficha && (
        <SectionCard title="Prendas" subtitle={cortado ? 'Se muestran las primeras 60: afiná la búsqueda.' : undefined}>
          {!encontradas.length ? <EmptyState title="No hay prendas con ese SKU, código o nombre." /> : (
            <TableWrap>
              <table>
                <THead><Tr><Th>Prenda</Th><Th>Talle</Th><Th>SKU</Th><Th style={{ textAlign: 'right' }}>En GN</Th></Tr></THead>
                <TBody>
                  {encontradas.map((p) => (
                    <Tr key={`${p.producto}/${p.talle}`} onClick={() => void abrir(p)} style={{ cursor: 'pointer' }}>
                      <Td>{p.nombre}</Td><Td>{p.talleNombre}</Td><Td>{p.sku}</Td><Td style={{ textAlign: 'right' }}>{p.gn}</Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableWrap>
          )}
        </SectionCard>
      )}

      {ficha && (
        <>
          <SectionCard
            title={`${ficha.prenda.nombre ?? 'Prenda'} · ${ficha.prenda.talleNombre ?? ''}`}
            subtitle={`SKU ${ficha.prenda.sku ?? '—'} · código ${ficha.prenda.barcode ?? '—'}`}
          >
            <div style={{ marginBottom: space[3] }}>
              <Button variant="outline" onClick={() => setFicha(null)}>Volver a la búsqueda</Button>
            </div>
            {ficha.sinDeposito.length > 0 && (
              <Notice tone="warning">GN tiene stock en depósitos que el libro no conoce: {ficha.sinDeposito.join(', ')}.</Notice>
            )}
            <TableWrap>
              <table>
                <THead><Tr><Th>Depósito</Th><Th style={{ textAlign: 'right' }}>Libro</Th><Th style={{ textAlign: 'right' }}>GN</Th><Th style={{ textAlign: 'right' }}>Diferencia</Th></Tr></THead>
                <TBody>
                  {ficha.depositos.map((d) => (
                    <Tr key={d.deposito}>
                      <Td>{nombreDe(NOMBRE_DEPOSITO, d.deposito)}</Td>
                      <Td style={{ textAlign: 'right' }}>{d.libro}</Td>
                      <Td style={{ textAlign: 'right' }}>{d.gn ?? '—'}</Td>
                      <Td style={{ textAlign: 'right' }}>
                        {d.diferencia == null ? '—' : d.diferencia === 0 ? <Badge tone="success">Cierra</Badge> : <Badge tone="warning">{conSigno(d.diferencia)}</Badge>}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableWrap>
          </SectionCard>

          <SectionCard title="Movimientos" subtitle="El más nuevo arriba. Una anulación o una corrección es otro movimiento: el libro no se edita.">
            {!ficha.historial.length ? <EmptyState title="El libro todavía no tiene movimientos de esta prenda." /> : (
              <TableWrap>
                <table>
                  <THead><Tr><Th>Cuándo</Th><Th>Qué</Th><Th>De dónde</Th><Th>Depósito</Th><Th style={{ textAlign: 'right' }}>Cantidad</Th><Th style={{ textAlign: 'right' }}>Saldo</Th><Th>Referencia</Th></Tr></THead>
                  <TBody>
                    {ficha.historial.map((m) => (
                      <Tr key={m.id}>
                        <Td>{cuando(m.ocurrido_en)}</Td>
                        <Td>{nombreDe(NOMBRE_TIPO, m.tipo)}</Td>
                        <Td>{nombreDe(NOMBRE_ORIGEN, m.origen)}</Td>
                        <Td>{nombreDe(NOMBRE_DEPOSITO, m.deposito)}</Td>
                        <Td style={{ textAlign: 'right' }}>{conSigno(m.cantidad)}</Td>
                        <Td style={{ textAlign: 'right' }}>{m.saldo}</Td>
                        <Td style={{ fontSize: 12, opacity: 0.75 }}>{m.origen_ref}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </table>
              </TableWrap>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}

'use client'

/**
 * ERP › Precios. El precio de un producto en cada lista (local, online, mayorista) y su costo, como los tiene el ERP,
 * con de dónde salió cada uno (la copia de GN, cargado en el ERP, Tienda Nube) y su historial; al lado, lo que dicen
 * GN y Tienda Nube. Sólo lectura: cargar un precio o un costo espera a las funciones del motor (contrato §13).
 *
 * 🔑 Mientras GN vive el ERP COPIA precio y costo de GN cada 2 h: la ficha avisa donde Tienda Nube dice otra cosa,
 * que es lo que hay que resolver antes de cortar (Bruno, 14-oct: el precio del local sale de TN o de una lista propia;
 * el costo, de la importación de TN).
 */

import { useState } from 'react'
import {
  Button, EmptyState, Input, MoneyText, Notice, SectionCard, TableWrap, TBody, Td, Th, THead, Tr, Tabs, space,
} from '@/components/ui'
import { buscarPrendas, leerPrecioDeProducto, type MarcaErp, type PrecioDeProducto } from '@/lib/erp/cliente'
import { NOMBRE_FUENTE } from '@/lib/erp/precio.core.js'

const MARCAS: Array<{ key: MarcaErp; label: string }> = [{ key: 'zattia', label: 'Zattia' }, { key: 'bdi', label: 'BDI' }]
const FUENTE: Record<string, string> = NOMBRE_FUENTE
const cuando = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}
const plata = (n: number | null | undefined) => (n == null ? '—' : <MoneyText value={n} />)
/** Una lectura de TN de más de un día ya puede no ser lo que dice la tienda. */
const VIEJA_MS = 24 * 3600_000

type Encontrado = { producto: string; nombre: string | null; skus: string[] }

export function PreciosProducto() {
  const [marca, setMarca] = useState<MarcaErp>('zattia')
  const [texto, setTexto] = useState('')
  const [encontrados, setEncontrados] = useState<Encontrado[] | null>(null)
  const [ficha, setFicha] = useState<PrecioDeProducto | null>(null)
  const [tnVieja, setTnVieja] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  async function correr(fn: () => Promise<void>, fallo: string) {
    setTrabajando(true)
    try {
      await fn()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : fallo)
    } finally {
      setTrabajando(false)
    }
  }

  // La búsqueda de Stock trae variantes: acá se agrupan por producto (precio y costo son del producto).
  const buscar = () => correr(async () => {
    setFicha(null)
    const r = await buscarPrendas(marca, texto)
    const porProducto = new Map<string, Encontrado>()
    for (const v of r.variantes) {
      const p = porProducto.get(v.producto) || { producto: v.producto, nombre: v.nombre, skus: [] }
      if (v.sku && !p.skus.includes(v.sku)) p.skus.push(v.sku)
      porProducto.set(v.producto, p)
    }
    setEncontrados([...porProducto.values()])
  }, 'No se pudo buscar.')

  const abrir = (producto: string) => correr(async () => {
    const f = await leerPrecioDeProducto(marca, producto)
    setFicha(f)
    setTnVieja(f.tnLeidaEn ? Date.now() - Date.parse(f.tnLeidaEn) > VIEJA_MS : false)
  }, 'No se pudo leer el precio.')

  function cambiarMarca(k: string) {
    setMarca(k as MarcaErp)
    setEncontrados(null)
    setFicha(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="Precio y costo de un producto" subtitle="Lo que tiene el ERP por lista y el costo, de dónde salió cada uno, y al lado GN y Tienda Nube.">
        <Tabs items={MARCAS} value={marca} onChange={cambiarMarca} />
        <form onSubmit={(e) => { e.preventDefault(); void buscar() }} style={{ display: 'flex', gap: space[2], marginTop: space[3], flexWrap: 'wrap' }}>
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="SKU, código de barras o nombre" aria-label="Buscar producto" style={{ flex: '1 1 240px' }} />
          <Button type="submit" disabled={trabajando || texto.trim().length < 3}>Buscar</Button>
        </form>
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      {encontrados && !ficha && (
        <SectionCard title="Productos">
          {!encontrados.length ? <EmptyState title="No hay productos con ese SKU, código o nombre." /> : (
            <TableWrap>
              <table>
                <THead><Tr><Th>Producto</Th><Th>SKU</Th></Tr></THead>
                <TBody>
                  {encontrados.map((p) => (
                    <Tr key={p.producto} onClick={() => void abrir(p.producto)} style={{ cursor: 'pointer' }}>
                      <Td>{p.nombre}</Td><Td>{p.skus.slice(0, 3).join(' · ')}{p.skus.length > 3 && ` y ${p.skus.length - 3} más`}</Td>
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
          <SectionCard title={ficha.nombre ?? `Producto ${ficha.producto}`} subtitle={`Producto ${ficha.producto} · ${ficha.skus} SKU`}>
            <div style={{ marginBottom: space[3] }}>
              <Button variant="outline" onClick={() => setFicha(null)}>Volver a la búsqueda</Button>
            </div>
            {ficha.avisos.map((a) => <Notice key={a} tone="warning">{a}</Notice>)}
            <TableWrap>
              <table>
                <THead><Tr><Th>Lista</Th><Th style={{ textAlign: 'right' }}>ERP</Th><Th>De dónde</Th><Th>Desde</Th><Th style={{ textAlign: 'right' }}>GN</Th><Th style={{ textAlign: 'right' }}>Tienda Nube</Th></Tr></THead>
                <TBody>
                  {ficha.listas.map((l) => (
                    <Tr key={l.lista}>
                      <Td>{l.nombre}</Td>
                      <Td style={{ textAlign: 'right' }}>{plata(l.precio)}</Td>
                      <Td>{l.fuente ? FUENTE[l.fuente] ?? l.fuente : 'Sin precio'}</Td>
                      <Td>{cuando(l.desde)}</Td>
                      <Td style={{ textAlign: 'right' }}>{plata(l.lista === 'local' ? ficha.gn?.precio : l.lista === 'mayorista' ? ficha.gn?.mayorista : null)}</Td>
                      <Td style={{ textAlign: 'right' }}>{l.lista === 'online' || l.lista === 'local' ? plata(ficha.tn?.precio) : '—'}{l.lista === 'online' && ficha.tn?.promocional != null && <> (oferta {plata(ficha.tn.promocional)})</>}</Td>
                    </Tr>
                  ))}
                  <Tr>
                    <Td><strong>Costo</strong>{ficha.costo?.proveedor && ` · ${ficha.costo.proveedor}`}</Td>
                    <Td style={{ textAlign: 'right' }}><strong>{plata(ficha.costo?.costo)}</strong></Td>
                    <Td>{ficha.costo ? FUENTE[ficha.costo.fuente] ?? ficha.costo.fuente : 'Sin costo'}</Td>
                    <Td>{cuando(ficha.costo?.desde ?? null)}</Td>
                    <Td style={{ textAlign: 'right' }}>{plata(ficha.gn?.costo)}</Td>
                    <Td style={{ textAlign: 'right' }}>{plata(ficha.tn?.costo)}</Td>
                  </Tr>
                </TBody>
              </table>
            </TableWrap>
            <p style={{ marginTop: space[2], fontSize: 13, opacity: 0.75 }}>
              Tienda Nube: lo que se leyó el {cuando(ficha.tnLeidaEn)}{tnVieja && ' (hace más de un día: puede haber cambiado)'}.
              Cargar un precio o un costo en el ERP todavía no se puede desde acá.
            </p>
          </SectionCard>

          <SectionCard title="Historial" subtitle="El más nuevo arriba. Un precio o un costo nuevo es otra fila: lo anterior ⛔ se edita.">
            {!ficha.historial.length ? <EmptyState title="Todavía no hay precios ni costos de este producto en el ERP." /> : (
              <TableWrap>
                <table>
                  <THead><Tr><Th>Desde</Th><Th>Qué</Th><Th style={{ textAlign: 'right' }}>Valor</Th><Th>De dónde</Th><Th>Quién</Th><Th>Motivo</Th></Tr></THead>
                  <TBody>
                    {ficha.historial.map((h, i) => (
                      <Tr key={`${h.que}-${h.lista}-${h.desde}-${i}`}>
                        <Td>{cuando(h.desde)}</Td>
                        <Td>{h.que === 'costo' ? 'Costo' : `Precio ${ficha.listas.find((l) => l.lista === h.lista)?.nombre ?? h.lista}`}</Td>
                        <Td style={{ textAlign: 'right' }}>{plata(h.valor)}</Td>
                        <Td>{FUENTE[h.fuente] ?? h.fuente}</Td>
                        <Td>{h.usuario}</Td>
                        <Td>{h.motivo ?? '—'}</Td>
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

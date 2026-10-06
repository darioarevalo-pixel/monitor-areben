'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useCaducadosData } from '@/components/caducados/useCaducadosData'
import { generarReporteCaducados } from '@/components/caducados/reporteCaducados'
import { candidatos, coincide, depositosOrdenados, diasDesde, pendientesTn, type TnProductoCad } from '@/lib/caducados'
import { traerAudit } from '@/lib/tn-audit'
import { dispararSyncStock } from '@/lib/sync-gn'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  Badge,
  BuscarInput,
  Button,
  EmptyState,
  Esqueleto,
  NumberField,
  Notice,
  Tabs,
  TBody,
  THead,
  TableWrap,
  Td,
  Th,
  Tr,
  color,
  font,
  space,
  useToast,
} from '@/components/ui'

/**
 * "🗑️ Productos caducados" (key `caducados`, BDI + Zattia).
 *
 * Candidatos a depurar: sin stock en ningún depósito y última venta hace más de N días.
 * Read-only —no elimina nada: la baja se hace a mano en TN y GN—; el botón de GN solo
 * dispara el sync. La lógica pura vive en `lib/caducados.ts`.
 *
 * 🔑 **Dos pestañas, una por sistema** (5-oct-2026): «Tienda Nube» lista los caducados que siguen
 * en la tienda —activos o no en GN— y «Gestión Nube» los que siguen activos en GN. Cada una mira
 * sólo lo suyo para que el orden de la limpieza no importe. Los 30 días por defecto son el plazo
 * máximo de cambio: antes de eso un producto puede volver.
 *
 * Rediseño jul-2026 (patrón Listado): la advertencia de "verificá físicamente antes de
 * eliminar" era gris de 11px abajo del contador, cuando es lo más importante de la
 * pantalla —acá se decide dar de baja un producto—; ahora es un aviso con tono. El
 * criterio (días sin venta) y las dos acciones van al header, y el stock por depósito se
 * lee como una lista de etiquetas en vez de un renglón corrido.
 */
type Pestana = 'tn' | 'gn'

export function Caducados() {
  const { marca } = useSesion()
  const { datos: cad, cargando, recargar } = useCaducadosData(marca)
  const toast = useToast()

  const [tab, setTab] = useState<Pestana>('tn')
  const [dias, setDias] = useState(30)
  const [buscar, setBuscar] = useState('')
  const [syncLabel, setSyncLabel] = useState<string | null>(null)
  const [tn, setTn] = useState<{ marca: string; filas: TnProductoCad[] } | null>(null)
  const [tnError, setTnError] = useState<string | null>(null)

  // La tienda entera con variantes (para el stock en TN y los códigos). Comparte caché con Tienda Nube.
  useEffect(() => {
    let vivo = true
    traerAudit<TnProductoCad>(marca, { variantes: true })
      .then((filas) => vivo && setTn({ marca, filas }))
      .catch((e) => vivo && setTnError((e as Error).message))
    return () => {
      vivo = false
    }
  }, [marca])

  const corte = Math.max(1, dias)
  // Caducados sobre TODOS los productos de GN, activos o no. Cada pestaña recorta lo suyo.
  const todos = useMemo(
    () => (cad ? candidatos(cad.productosGn, cad.stock, cad.ultimaVenta, corte, new Date()) : []),
    [cad, corte],
  )
  const activos = useMemo(() => new Set((cad?.productosGn ?? []).filter((p) => p.active).map((p) => p.id)), [cad])
  const gn = useMemo(() => todos.filter((c) => activos.has(c.id) && coincide(buscar, c.name, c.cat)), [todos, activos, buscar])
  const tnRes = useMemo(
    () => (cad && tn && tn.marca === marca ? pendientesTn(tn.filas, cad.productosGn, todos, cad.skus, cad.stock, cad.ultimaVenta) : null),
    [cad, tn, marca, todos],
  )
  const tnFilas = useMemo(() => (tnRes?.filas ?? []).filter((f) => coincide(buscar, f.nombre, f.cat)), [tnRes, buscar])
  const depositos = useMemo(() => (cad ? depositosOrdenados(cad.stock) : []), [cad])

  async function traerStockGN() {
    if (syncLabel) return
    setSyncLabel('Pidiendo stock a GN…')
    try {
      const done = await dispararSyncStock(marca, setSyncLabel)
      setSyncLabel('Recargando…')
      await recargar()
      if (!done) toast.aviso('La sincronización con GN tardó más de lo normal. Te muestro lo último disponible.')
      else toast.ok('Stock actualizado')
    } catch (e) {
      toast.error('No se pudo actualizar: ' + (e as Error).message)
    } finally {
      setSyncLabel(null)
    }
  }

  const conStockTn = tnFilas.filter((f) => (f.stockTn ?? 0) > 0).length

  return (
    <>
      <HeaderAcciones>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.sm, color: color.mut }}>
          Días sin venta
          <NumberField value={dias} onChange={(n) => setDias(n || 30)} min={1} width={80} />
        </label>
        <Button variant="outline" onClick={() => void traerStockGN()} loading={!!syncLabel} title="Trae el stock más nuevo de GN para verificar que estos productos están realmente en 0">
          {syncLabel || 'Cargar stock de GN'}
        </Button>
        {tab === 'gn' && (
          <Button variant="solid" tone="brand" onClick={() => void generarReporteCaducados(gn, marca, corte, new Date())} disabled={!gn.length}>
            Exportar lista
          </Button>
        )}
      </HeaderAcciones>

      <Tabs
        style={{ marginBottom: space[3] }}
        value={tab}
        onChange={(k) => setTab(k as Pestana)}
        items={[
          { key: 'tn', label: 'Tienda Nube', badge: tnRes ? tnFilas.length || undefined : undefined, hint: 'Caducados que siguen cargados en la tienda' },
          { key: 'gn', label: 'Gestión Nube', badge: cad ? gn.length || undefined : undefined, hint: 'Caducados que siguen activos en Gestión Nube' },
        ]}
      />

      <div style={{ maxWidth: 360, marginBottom: space[3] }}>
        <BuscarInput value={buscar} onChange={setBuscar} placeholder="Filtrar por palabra o categoría (ej: top)" />
      </div>

      {cargando ? (
        <Esqueleto forma="tabla" filas={8} />
      ) : tab === 'tn' ? (
        tnError ? (
          <Notice tone="danger" icon="⚠">No se pudo leer la tienda: {tnError}</Notice>
        ) : !tnRes ? (
          <Esqueleto forma="tabla" filas={8} />
        ) : tnFilas.length === 0 ? (
          <EmptyState icon="🎉" title="No queda ningún caducado en la tienda" hint={buscar ? 'Con este filtro no hay pendientes.' : `Nada sin stock y sin vender por más de ${corte} días sigue en Tienda Nube.`} dashed />
        ) : (
          <>
            <p style={{ fontSize: font.base, color: color.ink2, marginBottom: space[3] }}>
              <b>{tnFilas.length}</b> {tnFilas.length === 1 ? 'producto sigue' : 'productos siguen'} en Tienda Nube sin stock y sin vender hace más de <b>{corte}</b> días.
            </p>
            <Notice tone="warning" icon="⚠" style={{ marginBottom: space[3] }}>
              Eliminar en Tienda Nube no tiene vuelta atrás. Por ahora se hace a mano desde el panel de la tienda.
              {conStockTn > 0 && (
                <>
                  {' '}<b>{conStockTn}</b> {conStockTn === 1 ? 'tiene' : 'tienen'} stock en la tienda: revisalos antes.
                </>
              )}
              {tnRes.gemelos > 0 && (
                <>
                  {' '}No se muestran <b>{tnRes.gemelos}</b> que comparten nombre con un producto vigente de GN: esa publicación es del vigente.
                </>
              )}
            </Notice>
            <TableWrap maxHeight={620}>
              <THead>
                <Tr>
                  <Th>Producto</Th>
                  <Th>En la tienda</Th>
                  <Th>Última venta</Th>
                  <Th>En Gestión Nube</Th>
                </Tr>
              </THead>
              <TBody>
                {tnFilas.map((f) => (
                  <Tr key={f.tnId}>
                    <Td strong style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.nombre}
                      <div style={{ fontSize: font.xs, color: color.mut2, fontWeight: 400 }}>{f.cat}</div>
                    </Td>
                    <Td tall>
                      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                        {f.visible ? <Badge tone="danger">Visible</Badge> : <Badge>Oculto</Badge>}
                        {(f.stockTn ?? 0) > 0 && <Badge tone="warning">Stock {f.stockTn}</Badge>}
                      </span>
                    </Td>
                    <Td>
                      <span style={{ color: color.warningInk, fontWeight: 600 }}>{f.last}</span>{' '}
                      <span style={{ color: color.mut2 }}>({diasDesde(f.last, new Date())}d)</span>
                    </Td>
                    <Td style={{ color: color.mut }}>
                      {f.gn.some((g) => g.active) ? 'Activo' : 'Desactivado'}
                      {f.gn.length > 1 && <span style={{ color: color.mut2 }}> · {f.gn.length} productos</span>}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          </>
        )
      ) : gn.length === 0 ? (
        <EmptyState icon="🎉" title="No queda ningún caducado activo en Gestión Nube" hint={buscar ? 'Con este filtro no hay pendientes.' : `Nada quedó sin stock y sin vender por más de ${corte} días.`} dashed />
      ) : (
        <>
          <p style={{ fontSize: font.base, color: color.ink2, marginBottom: space[3] }}>
            <b>{gn.length}</b> {gn.length === 1 ? 'producto sigue activo' : 'productos siguen activos'} en Gestión Nube sin stock y sin vender hace más de{' '}
            <b>{corte}</b> días.
          </p>

          <Notice tone="warning" icon="⚠" style={{ marginBottom: space[3] }}>
            Verificá físicamente que no quede ninguna unidad antes de desactivar. Se hace a mano en <b>Gestión Nube</b> (GN no permite hacerlo por API).
          </Notice>

          <TableWrap maxHeight={620}>
            <THead>
              <Tr>
                <Th>Producto</Th>
                <Th>Categoría</Th>
                <Th>Última venta</Th>
                <Th>Stock por depósito</Th>
              </Tr>
            </THead>
            <TBody>
              {gn.map((c) => (
                <Tr key={c.id}>
                  <Td strong style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.name}
                  </Td>
                  <Td style={{ color: color.mut }}>{c.cat}</Td>
                  <Td>
                    <span style={{ color: color.warningInk, fontWeight: 600 }}>{c.last}</span>{' '}
                    <span style={{ color: color.mut2 }}>({diasDesde(c.last, new Date())}d)</span>
                  </Td>
                  <Td tall>
                    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                      {depositos.map((s) => (
                        <span
                          key={s}
                          style={{ fontSize: font.xs, color: color.mut, background: color.bg2, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}
                        >
                          {s} <b style={{ color: color.ink2 }}>{c.stores[s] || 0}</b>
                        </span>
                      ))}
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>
        </>
      )}
    </>
  )
}

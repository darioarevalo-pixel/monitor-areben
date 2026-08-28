'use client'

import { useMemo, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { useCaducadosData } from '@/components/caducados/useCaducadosData'
import { generarReporteCaducados } from '@/components/caducados/reporteCaducados'
import { candidatos, depositosOrdenados, diasDesde } from '@/lib/caducados'
import { dispararSyncStock } from '@/lib/sync-gn'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  Button,
  EmptyState,
  Esqueleto,
  NumberField,
  Notice,
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
 * Read-only —no borra nada: la baja se hace a mano en TN y GN—; el botón de GN solo
 * dispara el sync. La lógica pura vive en `lib/caducados.ts`.
 *
 * Rediseño jul-2026 (patrón Listado): la advertencia de "verificá físicamente antes de
 * eliminar" era gris de 11px abajo del contador, cuando es lo más importante de la
 * pantalla —acá se decide dar de baja un producto—; ahora es un aviso con tono. El
 * criterio (días sin venta) y las dos acciones van al header, y el stock por depósito se
 * lee como una lista de etiquetas en vez de un renglón corrido.
 */
export function Caducados() {
  const { datos } = useDatosMonitor()
  const { marca } = useSesion()
  const { datos: cad, cargando, recargar } = useCaducadosData(marca)
  const toast = useToast()

  const [dias, setDias] = useState(30)
  const [syncLabel, setSyncLabel] = useState<string | null>(null)

  const productos = useMemo(() => datos?.allProductos ?? [], [datos])
  const cands = useMemo(
    () => (cad ? candidatos(productos, cad.stock, cad.ultimaVenta, Math.max(1, dias), new Date()) : []),
    [productos, cad, dias],
  )
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

  return (
    <>
      <HeaderAcciones>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.sm, color: color.mut }}>
          Días sin venta
          <NumberField value={dias} onChange={(n) => setDias(n || 30)} min={1} width={80} />
        </label>
        <Button variant="outline" onClick={() => void traerStockGN()} loading={!!syncLabel} title="Trae el stock más nuevo de GN para verificar que estos productos están realmente en 0">
          {syncLabel || 'Traer stock de GN'}
        </Button>
        <Button variant="solid" tone="brand" onClick={() => void generarReporteCaducados(cands, marca, Math.max(1, dias), new Date())} disabled={!cands.length}>
          Exportar lista
        </Button>
      </HeaderAcciones>

      {cargando ? (
        <Esqueleto forma="tabla" filas={8} />
      ) : cands.length === 0 ? (
        <EmptyState icon="🎉" title="No hay productos para depurar con este criterio" hint={`Nada quedó sin stock y sin vender por más de ${Math.max(1, dias)} días.`} dashed />
      ) : (
        <>
          <p style={{ fontSize: font.base, color: color.ink2, marginBottom: space[3] }}>
            <b>{cands.length}</b> {cands.length === 1 ? 'producto caducado' : 'productos caducados'}: sin stock y con la última venta hace más de{' '}
            <b>{Math.max(1, dias)}</b> días.
          </p>

          <Notice tone="warning" icon="⚠" style={{ marginBottom: space[3] }}>
            Verificá físicamente que no quede ninguna unidad antes de eliminar. La baja se hace a mano en <b>TiendaNube</b> y en <b>Gestión Nube</b> (GN no permite eliminar por API).
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
              {cands.map((c) => (
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

'use client'

import { useMemo, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { useCaducadosData } from '@/components/caducados/useCaducadosData'
import { generarReporteCaducados } from '@/components/caducados/reporteCaducados'
import { candidatos, depositosOrdenados, diasDesde } from '@/lib/caducados'
import { dispararSyncStock } from '@/lib/sync-gn'

/**
 * "🗑️ Productos caducados" (key `caducados`, BDI + Zattia) en Next — Tanda A #10.
 *
 * Port de cadInit/cadRender/cadExportPDF (index.html:12409-12475): candidatos a
 * depurar (sin stock en ningún depósito + última venta hace más de N días), con
 * fetches propios (stock por depósito + ventas ~2 años). Read-only: no borra nada
 * (la baja se hace a mano en TN y GN). El botón "Traer stock de GN" sólo dispara el
 * sync. Lógica pura en `lib/caducados.ts`. Flip directo.
 */
export function Caducados() {
  const { datos } = useDatosMonitor()
  const { marca } = useSesion()
  const { datos: cad, cargando, recargar } = useCaducadosData(marca)

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
    setSyncLabel('⏳ Pidiendo stock a GN…')
    try {
      const done = await dispararSyncStock(marca, setSyncLabel)
      setSyncLabel('↻ Recargando…')
      await recargar()
      if (!done) alert('La sincronización con GN tardó más de lo normal. Te muestro lo último disponible.')
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setSyncLabel(null)
    }
  }

  async function exportar() {
    await generarReporteCaducados(cands, marca, Math.max(1, dias), new Date())
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 5 }}>
            Días sin venta:
            <input type="number" min={1} value={dias} onChange={(e) => setDias(parseInt(e.target.value) || 30)} style={{ width: 60, textAlign: 'center' }} />
          </label>
          <button className="btn-sm" onClick={traerStockGN} disabled={!!syncLabel} title="Traé el stock más nuevo de GN para verificar que estos productos están realmente en 0" style={{ background: '#378ADD', color: '#fff' }}>
            {syncLabel || '🔄 Traer stock de GN'}
          </button>
          <button className="btn-sm" onClick={exportar} disabled={!cands.length} style={{ background: '#16A34A', color: '#fff' }}>📄 Exportar lista</button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {cargando ? (
          <div style={{ padding: 20, color: '#9CA3AF' }}>Cargando…</div>
        ) : (
          <>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <b>{cands.length}</b> producto(s) caducado(s): sin stock y última venta hace más de <b>{Math.max(1, dias)}</b> días.
            </div>
            {cands.length === 0 ? (
              <div style={{ color: '#16A34A', padding: 10 }}>No hay productos para depurar con este criterio 🎉</div>
            ) : (
              <>
                <div style={{ fontSize: 11.5, color: '#9CA3AF', marginBottom: 8 }}>
                  ⚠️ Verificá físicamente que no quede ninguna unidad antes de eliminar. La baja se hace a mano en <b>TiendaNube</b> y en <b>Gestión Nube</b> (GN no permite borrar por API).
                </div>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'hidden', overflowX: 'auto' }}>
                  <table style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '34%' }} />
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '26%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Categoría</th>
                        <th>Última venta</th>
                        <th>Stock por depósito</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cands.map((c) => (
                        <tr key={c.id}>
                          <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                          <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6B7280' }}>{c.cat}</td>
                          <td style={{ color: '#B45309' }}>
                            {c.last} <span style={{ color: '#9CA3AF' }}>({diasDesde(c.last, new Date())}d)</span>
                          </td>
                          <td style={{ fontSize: 11.5, color: '#6B7280' }}>
                            {depositos.map((s, i) => (
                              <span key={s}>
                                {i > 0 ? ' · ' : ''}
                                {s}: <b style={{ color: '#16A34A' }}>{c.stores[s] || 0}</b>
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

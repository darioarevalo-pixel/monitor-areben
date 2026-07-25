'use client'

import { useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { aplicarCategorias, recalcularCategorias } from '@/lib/tncat/cliente'
import type { CatRecalc } from '@/lib/tncat/tipos'
import { Button, color, space, useConfirmar } from '@/components/ui'

/**
 * Categorías por modelo (card 1, BDI). Mantiene cada producto en las categorías de
 * los modelos CON stock y saca las de los SIN stock. El server calcula el diff; el
 * cliente lo muestra y lo aplica en la tienda EN VIVO. Port de tncatCargar/Render/Aplicar.
 */
export function CategoriasCard({ marca }: { marca: Marca }) {
  const { confirmar, avisar } = useConfirmar()
  const [data, setData] = useState<CatRecalc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<React.ReactNode>(null)

  const recalcular = async () => {
    setResultado(null)
    setError(null)
    setData(null)
    try {
      const j = await recalcularCategorias(marca)
      if (j.error) setError(j.error)
      else setData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const j = await recalcularCategorias(marca)
        if (!vivo) return
        if (j.error) setError(j.error)
        else setData(j)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const aplicar = async () => {
    if (!data || !data.total_con_cambios) {
      await avisar('No hay cambios para aplicar: recalculá primero.')
      return
    }
    const ok = await confirmar({
      titulo: 'Aplicar los cambios en TiendaNube',
      tono: 'warning',
      ok: 'Aplicar en la tienda',
      mensaje: `Se agregan ${data.total_agregados} categorías y se quitan ${data.total_quitados}, en ${data.total_con_cambios} productos. Modifica tu tienda EN VIVO.`,
    })
    if (!ok) return
    setAplicando(true)
    setResultado('Aplicando cambios en TiendaNube… (no cierres esta pestaña)')
    try {
      const j = await aplicarCategorias(marca)
      if (j.error) {
        setResultado(<span style={{ color: color.danger }}>Error: {j.error}</span>)
      } else if (j.errores && j.errores.length) {
        const faltaWrite = /write_products|Forbidden|403/.test(JSON.stringify(j.errores))
        setResultado(
          <span>
            <span style={{ color: color.warning }}>Aplicados: {j.aplicados}. Con {j.errores.length} errores.</span>
            {faltaWrite ? <><br /><b style={{ color: color.danger }}>⚠️ Falta activar el token de escritura en Vercel (TIENDANUBE_TOKEN). Avisame y lo vemos.</b></> : null}
          </span>,
        )
      } else {
        setResultado(<span style={{ color: color.success }}>✅ Listo: {j.aplicados} productos actualizados en TiendaNube.</span>)
        setTimeout(recalcular, 1500)
      }
    } catch (e) {
      setResultado(<span style={{ color: color.danger }}>Error: {e instanceof Error ? e.message : String(e)}</span>)
    } finally {
      setAplicando(false)
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Categorías por modelo</div>
          <div style={{ fontSize: 12, color: color.mut2, marginTop: 2 }}>
            Mantiene cada producto en las categorías de los modelos que <b>tienen stock</b>, y saca las de los modelos <b>sin stock</b>. Así el cliente ve solo lo disponible para su celular.
          </div>
        </div>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={recalcular}>
            Recalcular
          </Button>
          <Button variant="solid" tone="brand" onClick={aplicar} loading={aplicando}>
            Aplicar cambios ahora
          </Button>
        </div>
      </div>

      <div style={{ fontSize: 13, color: color.ink2, margin: '10px 0' }}>
        {resultado ? (
          resultado
        ) : error ? (
          <span style={{ color: color.danger }}>Error: {error}</span>
        ) : !data ? (
          'Calculando cambios… (puede tardar unos segundos)'
        ) : (
          <>
            <b>{data.total_con_cambios}</b> productos con cambios · <span style={{ color: color.success }}>+{data.total_agregados} categorías</span> · <span style={{ color: color.danger }}>−{data.total_quitados} categorías</span>{' '}
            <span style={{ color: color.mut2 }}>· {data.total_productos} productos revisados · datos en vivo</span>
          </>
        )}
      </div>

      <div style={{ maxHeight: 560, overflowY: 'auto' }}>
        {data && (data.detalle?.length ? (
          data.detalle.map((d, i) => (
            <div key={i} style={{ padding: '8px 4px', borderBottom: `1px solid ${color.bg2}` }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{d.nombre}</div>
              {d.agregar.length ? <div style={{ fontSize: 12, color: color.success }}>➕ {d.agregar.join(', ')}</div> : null}
              {d.quitar.length ? <div style={{ fontSize: 12, color: color.danger }}>➖ {d.quitar.join(', ')}</div> : null}
            </div>
          ))
        ) : (
          <div style={{ color: color.success, padding: 14, textAlign: 'center' }}>Todo al día ✅ No hay cambios para hacer.</div>
        ))}
      </div>
    </div>
  )
}

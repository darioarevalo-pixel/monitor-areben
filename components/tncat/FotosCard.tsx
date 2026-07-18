'use client'

import { useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { auditVariantes, vincularColor } from '@/lib/tncat/cliente'
import { coloresConFoto, filtrar, sinFoto, sinVincular } from '@/lib/tncat/fchk'
import type { FiltroFchk, ProductoFchk } from '@/lib/tncat/tipos'

const MAX = 150

/**
 * Revisar fotos por variante (card 3, fchk). Encuentra productos donde una foto se
 * cargó pero no quedó pegada al color, o que no tienen ninguna. Tocá una foto del
 * producto para vincularla al color (ESCRIBE en TN). Port de fchk*.
 */
export function FotosCard({ marca }: { marca: Marca }) {
  const [data, setData] = useState<ProductoFchk[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState<FiltroFchk>('problema')
  const [busqueda, setBusqueda] = useState('')

  const cargar = async (refrescar = false) => {
    setCargando(true)
    try {
      setData(await auditVariantes(marca, refrescar))
    } catch {
      setData([])
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      try {
        const d = await auditVariantes(marca)
        if (vivo) setData(d)
      } catch {
        if (vivo) setData([])
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const nSinVinc = data.filter(sinVincular).length
  const nSinFoto = data.filter(sinFoto).length
  const lista = filtrar(data, filtro, busqueda)

  const onVincular = async (prodId: string | number, imageId: string | number, color: string) => {
    const p = data.find((x) => x.id === prodId)
    if (!p) return
    try {
      const j = await vincularColor(marca, prodId, imageId, color)
      if (j.ok && (j.variantesObjetivo ?? 0) > 0 && (j.variantesAsignadas ?? 0) >= (j.variantesObjetivo ?? 0)) {
        // Refleja el vínculo en memoria (como el legacy) sin re-pegar al server.
        const src = (p.imagenes || []).find((im) => im.id === imageId)?.src ?? null
        setData((prev) =>
          prev.map((x) =>
            x.id !== prodId
              ? x
              : {
                  ...x,
                  variantes: (x.variantes || []).map((v) => (v.color === color ? { ...v, image_url: src } : v)),
                  variantes_con_foto: (x.variantes || []).filter((v) => v.image_url || v.color === color).length,
                },
          ),
        )
      } else {
        alert('No se pudo vincular: ' + (j.error || ((j.variantesObjetivo ?? 0) === 0 ? `el color "${color}" no coincide con ninguna variante en TN` : `vinculó ${j.variantesAsignadas}/${j.variantesObjetivo}`)))
      }
    } catch {
      alert('Error de conexión al vincular.')
    }
  }

  const btn = (k: FiltroFchk, t: string) => (
    <button
      onClick={() => setFiltro(k)}
      style={{ border: `1px solid ${filtro === k ? '#378ADD' : '#D1D5DB'}`, background: filtro === k ? '#378ADD' : '#fff', color: filtro === k ? '#fff' : '#374151', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
    >
      {t}
    </button>
  )

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>🔎 Revisar fotos por variante</div>
        <button className="btn-sm" onClick={() => cargar(true)} title="Volvé a traer el estado real desde TiendaNube" style={{ background: '#fff', border: '1px solid #D1D5DB', marginLeft: 'auto' }}>
          🔄 Actualizar
        </button>
      </div>
      <div style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 12px' }}>
        Encontrá los productos donde una foto se cargó pero <b>no quedó pegada al color</b>, o que no tienen ninguna foto. Tocá una foto del producto para vincularla al color.
      </div>

      {cargando ? (
        <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando estado de fotos…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            {btn('problema', 'Todos con problema')}
            {btn('sinvincular', `Sin vincular al color (${nSinVinc})`)}
            {btn('sinfoto', `Sin ninguna foto (${nSinFoto})`)}
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔎 Buscar producto…" style={{ flex: 1, minWidth: 180, padding: '7px 9px', border: '1px solid #D1D5DB', borderRadius: 7 }} />
          </div>
          {lista.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontSize: 13, padding: 16, textAlign: 'center' }}>✅ No hay productos con problema en este filtro.</div>
          ) : (
            <>
              {lista.slice(0, MAX).map((p) => (
                <ProductoFila key={p.id} p={p} onVincular={onVincular} />
              ))}
              {lista.length > MAX ? <div style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', padding: 8 }}>Mostrando {MAX} de {lista.length}. Afiná con el buscador.</div> : null}
            </>
          )}
        </>
      )}
    </div>
  )
}

function ProductoFila({ p, onVincular }: { p: ProductoFchk; onVincular: (prodId: string | number, imageId: string | number, color: string) => void }) {
  if (sinFoto(p)) {
    return (
      <div style={{ border: '1px solid #FED7AA', background: '#FFF7ED', borderRadius: 9, padding: '10px 12px', marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>
          {p.name} <span style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>sin ninguna foto</span>
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3 }}>
          Subí las fotos en <b>📷 Carga de imágenes</b> (arriba). Acá no hay nada para vincular todavía.
        </div>
      </div>
    )
  }
  const colores = coloresConFoto(p)
  const conFoto = colores.filter((c) => c.foto).length
  const nSin = colores.length - conFoto
  const imgs = p.imagenes || []
  return (
    <div style={{ border: `1px solid ${nSin ? '#FCA5A5' : '#E5E7EB'}`, background: nSin ? '#FEF2F2' : '#fff', borderRadius: 9, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ fontWeight: 600 }}>
        {p.name} <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 400 }}>· {conFoto}/{colores.length} colores con foto{nSin ? ` · ${nSin} sin vincular` : ''}</span>
      </div>
      <div style={{ marginTop: 4 }}>
        {colores.map(({ color, foto }) =>
          foto ? (
            <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: '1px solid #F1F5F9' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto} alt={color} style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 6, border: '2px solid #16A34A', flex: '0 0 auto' }} />
              <div style={{ fontSize: 13 }}>
                <b>{color}</b> <span style={{ color: '#16A34A' }}>✓ con foto</span>
              </div>
            </div>
          ) : (
            <div key={color} style={{ padding: '5px 0', borderTop: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 13 }}>
                <b>{color}</b> <span style={{ color: '#DC2626' }}>⚠ sin foto</span> <span style={{ color: '#9CA3AF', fontSize: 11 }}>— tocá una foto para vincularla:</span>
              </div>
              {imgs.length ? (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                  {imgs.map((im) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={im.id}
                      src={im.src}
                      onClick={() => onVincular(p.id, im.id, color)}
                      title={`Vincular esta foto a ${color}`}
                      alt=""
                      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '2px solid #D1D5DB', cursor: 'pointer', flex: '0 0 auto' }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ),
        )}
      </div>
    </div>
  )
}

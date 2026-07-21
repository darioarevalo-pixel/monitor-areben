'use client'

import { useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { auditVariantes, desvincularColor, vincularColor } from '@/lib/tncat/cliente'
import { coloresConFoto, filtrar, sinFoto, sinVincular } from '@/lib/tncat/fchk'
import type { FiltroFchk, ProductoFchk } from '@/lib/tncat/tipos'

const MAX = 150

/** Acción pendiente de confirmar en el modal (con preview grande). Nada escribe hasta Aceptar. */
type Accion = {
  tipo: 'vincular' | 'quitar'
  prodId: string | number
  color: string
  src: string | null // foto a mostrar en grande (candidata a vincular, o la actual a quitar)
  imageId?: string | number // solo en 'vincular'
  pending?: boolean
  error?: string
}

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
  const [accion, setAccion] = useState<Accion | null>(null)

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

  // Abren el modal de confirmación (con preview grande). NO escriben todavía.
  const pedirVincular = (prodId: string | number, imageId: string | number, color: string, src: string | null) =>
    setAccion({ tipo: 'vincular', prodId, imageId, color, src })
  const pedirQuitar = (prodId: string | number, color: string, src: string | null) =>
    setAccion({ tipo: 'quitar', prodId, color, src })

  // Confirmación del modal: recién acá se escribe en TiendaNube.
  const ejecutar = async () => {
    if (!accion || accion.pending) return
    const { tipo, prodId, color, imageId } = accion
    setAccion((a) => (a ? { ...a, pending: true, error: undefined } : a))
    try {
      const j =
        tipo === 'vincular'
          ? await vincularColor(marca, prodId, imageId as string | number, color)
          : await desvincularColor(marca, prodId, color)
      const hechas = tipo === 'vincular' ? j.variantesAsignadas : j.variantesDesasignadas
      if (j.ok && (j.variantesObjetivo ?? 0) > 0 && (hechas ?? 0) >= (j.variantesObjetivo ?? 0)) {
        // Refleja el cambio en memoria sin re-pegar al server. En 'quitar' la foto pasa a null.
        const nuevaFoto = tipo === 'vincular' ? accion.src : null
        setData((prev) =>
          prev.map((x) =>
            x.id !== prodId
              ? x
              : {
                  ...x,
                  variantes: (x.variantes || []).map((v) => (v.color === color ? { ...v, image_url: nuevaFoto } : v)),
                  variantes_con_foto: (x.variantes || []).filter((v) => (v.color === color ? nuevaFoto : v.image_url)).length,
                },
          ),
        )
        setAccion(null)
      } else {
        const detalle = j.error || ((j.variantesObjetivo ?? 0) === 0 ? `el color "${color}" no coincide con ninguna variante en TN` : `${tipo === 'vincular' ? 'vinculó' : 'quitó'} ${hechas ?? 0}/${j.variantesObjetivo}`)
        setAccion((a) => (a ? { ...a, pending: false, error: detalle } : a))
      }
    } catch {
      setAccion((a) => (a ? { ...a, pending: false, error: 'Error de conexión.' } : a))
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
        Encontrá los productos donde una foto se cargó pero <b>no quedó pegada al color</b>, o que no tienen ninguna foto. Tocá una foto para verla en grande y confirmar el cambio.
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
                <ProductoFila key={p.id} p={p} onPedirVincular={pedirVincular} onPedirQuitar={pedirQuitar} />
              ))}
              {lista.length > MAX ? <div style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', padding: 8 }}>Mostrando {MAX} de {lista.length}. Afiná con el buscador.</div> : null}
            </>
          )}
        </>
      )}

      {accion && <ModalConfirmar accion={accion} onCancelar={() => setAccion(null)} onAceptar={ejecutar} />}
    </div>
  )
}

/** Modal de confirmación con la foto en grande. Nada se escribe hasta Aceptar. */
function ModalConfirmar({ accion, onCancelar, onAceptar }: { accion: Accion; onCancelar: () => void; onAceptar: () => void }) {
  const quitar = accion.tipo === 'quitar'
  return (
    <div
      onClick={accion.pending ? undefined : onCancelar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 18, maxWidth: 460, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,.3)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          {quitar ? 'Quitar foto del color ' : 'Vincular foto al color '}
          <span style={{ color: '#378ADD' }}>{accion.color}</span>
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>
          {quitar ? 'La variante vuelve a quedar sin foto en TiendaNube.' : 'Se escribe en TiendaNube en vivo.'}
        </div>
        {accion.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={accion.src} alt="" style={{ display: 'block', width: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 10, background: '#F3F4F6', border: '1px solid #E5E7EB' }} />
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', background: '#F3F4F6', borderRadius: 10 }}>Sin vista previa</div>
        )}
        {accion.error ? <div style={{ color: '#DC2626', fontSize: 12, marginTop: 10 }}>No se pudo: {accion.error}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn-sm" onClick={onCancelar} disabled={accion.pending} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
            Cancelar
          </button>
          <button
            className="btn-sm"
            onClick={onAceptar}
            disabled={accion.pending}
            style={{ background: accion.pending ? '#93C5FD' : quitar ? '#DC2626' : '#378ADD', color: '#fff', border: 'none' }}
          >
            {accion.pending ? 'Guardando…' : quitar ? 'Quitar foto' : 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductoFila({
  p,
  onPedirVincular,
  onPedirQuitar,
}: {
  p: ProductoFchk
  onPedirVincular: (prodId: string | number, imageId: string | number, color: string, src: string | null) => void
  onPedirQuitar: (prodId: string | number, color: string, src: string | null) => void
}) {
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
              <img
                src={foto}
                alt={color}
                onClick={() => onPedirQuitar(p.id, color, foto)}
                title={`Ver en grande / quitar la foto de ${color}`}
                style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 6, border: '2px solid #16A34A', flex: '0 0 auto', cursor: 'zoom-in' }}
              />
              <div style={{ fontSize: 13 }}>
                <b>{color}</b> <span style={{ color: '#16A34A' }}>✓ con foto</span>
              </div>
              <button
                onClick={() => onPedirQuitar(p.id, color, foto)}
                title={`Quitar la foto de ${color}`}
                style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
              >
                Quitar foto
              </button>
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
                      onClick={() => onPedirVincular(p.id, im.id, color, im.src)}
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

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { bustAudit, publicar, subirImagen, traerProductosImg, vincularColor } from '@/lib/tncat/cliente'
import { colorPorNombre, findProd, matchByFilename } from '@/lib/tncat/matching'
import type { FotoImg, GrupoImg, ProductoImg } from '@/lib/tncat/tipos'

/**
 * Carga de imágenes a TN (card 2). Un bloque por producto con varias fotos: se
 * arrastran/pegan/eligen, se auto-asignan por nombre de archivo (producto + color),
 * se ordenan y se sube todo (la 1ª de cada color asigna la variante; el resto va a
 * galería). "Subir y publicar" además hace visibles los productos. Port de tnImg*.
 *
 * ⚠️ Subir/publicar/revincular ESCRIBEN en la tienda online en vivo.
 */
export function ImagenesCard({ marca }: { marca: Marca }) {
  const [productos, setProductos] = useState<ProductoImg[]>([])
  const [grupos, setGrupos] = useState<GrupoImg[]>([])
  const [activo, setActivo] = useState<number | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [publicando, setPublicando] = useState(false)
  const [recargando, setRecargando] = useState(false)
  const [info, setInfo] = useState<React.ReactNode>('')
  const [preview, setPreview] = useState<string | null>(null)

  const seqRef = useRef(0)
  const nextId = () => ++seqRef.current
  const dragRef = useRef<{ gid: number; fid: number } | null>(null)
  // Refs para leer estado fresco en handlers async (subida) sin re-crear callbacks.
  const gruposRef = useRef<GrupoImg[]>([])
  const activoRef = useRef<number | null>(null)
  const productosRef = useRef<ProductoImg[]>([])
  useEffect(() => { gruposRef.current = grupos }, [grupos])
  useEffect(() => { activoRef.current = activo }, [activo])
  useEffect(() => { productosRef.current = productos }, [productos])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      // Al cambiar de marca, reset (los productos y grupos son de esa cuenta).
      setProductos([])
      setGrupos([])
      setActivo(null)
      try {
        const ps = await traerProductosImg(marca)
        if (vivo) setProductos(ps)
      } catch {
        /* queda vacío */
      }
    })()
    return () => { vivo = false }
  }, [marca])

  // Actualiza la url (thumbnail) de una foto cuando el FileReader termina.
  const setFotoUrl = useCallback((gid: number, fid: number, url: string) => {
    setGrupos((prev) => prev.map((g) => (g.id !== gid ? g : { ...g, fotos: g.fotos.map((f) => (f.id === fid ? { ...f, url } : f)) })))
  }, [])

  // Aplica un patch a una foto (subida/imageId/aviso). Antes de subirTodo por el orden de declaración.
  const actualizarFoto = useCallback((gid: number, fid: number, patch: Partial<FotoImg>) => {
    setGrupos((prev) => prev.map((g) => (g.id !== gid ? g : { ...g, fotos: g.fotos.map((f) => (f.id === fid ? { ...f, ...patch } : f)) })))
  }, [])

  const leerThumb = useCallback((gid: number, fid: number, file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const src = e.target?.result
      if (typeof src === 'string') setFotoUrl(gid, fid, src)
    }
    reader.readAsDataURL(file)
  }, [setFotoUrl])

  // ── Carga masiva con auto-asignación por nombre de archivo (tnImgAutoCargar) ──
  const autoCargar = useCallback(
    (files: FileList | File[]) => {
      const ps = productosRef.current
      const nuevos: { gid: number; fid: number; file: File }[] = []
      setGrupos((prev) => {
        const grupos = prev.map((g) => ({ ...g, fotos: [...g.fotos] }))
        ;[...files].forEach((f) => {
          if (!/^image\//.test(f.type)) return
          const prod = matchByFilename(ps, f.name)
          const color = colorPorNombre(prod, f.name)
          let g = prod ? grupos.find((x) => x.productId === prod.id) : undefined
          if (!g) {
            g = { id: nextId(), productId: prod ? prod.id : null, fotos: [] }
            grupos.push(g)
          }
          const fid = nextId()
          g.fotos.push({ id: fid, file: f, url: null, subida: false, fn: f.name, color })
          nuevos.push({ gid: g.id, fid, file: f })
        })
        const limpios = grupos.filter((g) => g.fotos.length || g.productId)
        const sinAsignar = limpios.find((g) => !g.productId)
        setActivo((sinAsignar || limpios[limpios.length - 1])?.id ?? null)
        return limpios
      })
      nuevos.forEach((n) => leerThumb(n.gid, n.fid, n.file))
    },
    [leerThumb],
  )

  // Fotos a un grupo puntual (tnImgGrupoFotos): auto-color si el producto tiene colores.
  const grupoFotos = useCallback(
    (gid: number, files: FileList | File[]) => {
      const nuevos: { gid: number; fid: number; file: File }[] = []
      setGrupos((prev) =>
        prev.map((g) => {
          if (g.id !== gid) return g
          const prod = g.productId ? productosRef.current.find((p) => p.id === g.productId) ?? null : null
          const fotos = [...g.fotos]
          ;[...files].forEach((f) => {
            if (!/^image\//.test(f.type)) return
            const fid = nextId()
            fotos.push({ id: fid, file: f, url: null, subida: false, fn: f.name, color: colorPorNombre(prod, f.name) })
            nuevos.push({ gid, fid, file: f })
          })
          return { ...g, fotos }
        }),
      )
      nuevos.forEach((n) => leerThumb(n.gid, n.fid, n.file))
    },
    [leerThumb],
  )

  // Pegar (Cmd/Ctrl+V) en el grupo activo.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const gid = activoRef.current
      if (!gid) return
      const dt = e.clipboardData
      if (!dt) return
      const files: File[] = []
      for (const it of dt.items || []) {
        if (it.kind === 'file') {
          const f = it.getAsFile()
          if (f && /^image\//.test(f.type)) files.push(f)
        }
      }
      if (!files.length && dt.files) for (const f of dt.files) if (/^image\//.test(f.type)) files.push(f)
      if (files.length) {
        e.preventDefault()
        grupoFotos(gid, files)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [grupoFotos])

  const setProd = (gid: number, txt: string) => {
    const p = findProd(productosRef.current, txt)
    setGrupos((prev) => prev.map((g) => (g.id === gid ? { ...g, productId: p ? p.id : null } : g)))
  }
  const setColor = (gid: number, fid: number, color: string) =>
    setGrupos((prev) => prev.map((g) => (g.id !== gid ? g : { ...g, fotos: g.fotos.map((f) => (f.id === fid ? { ...f, color } : f)) })))
  const setPortada = (gid: number, fid: number) => setGrupos((prev) => prev.map((g) => (g.id === gid ? { ...g, portadaId: fid } : g)))
  const quitarFoto = (gid: number, fid: number) => setGrupos((prev) => prev.map((g) => (g.id === gid ? { ...g, fotos: g.fotos.filter((f) => f.id !== fid) } : g)))
  const quitarGrupo = (gid: number) => setGrupos((prev) => prev.filter((g) => g.id !== gid))
  const agregarGrupo = () => {
    const id = nextId()
    setGrupos((prev) => [...prev, { id, productId: null, fotos: [] }])
    setActivo(id)
  }

  const onDrop = (gid: number, fid: number) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d || d.gid !== gid || d.fid === fid) return
    setGrupos((prev) =>
      prev.map((g) => {
        if (g.id !== gid) return g
        const from = g.fotos.findIndex((f) => f.id === d.fid)
        const to = g.fotos.findIndex((f) => f.id === fid)
        if (from < 0 || to < 0 || from === to) return g
        const fotos = [...g.fotos]
        const [m] = fotos.splice(from, 1)
        fotos.splice(to, 0, m)
        return { ...g, fotos }
      }),
    )
  }

  const recargarProductos = async () => {
    setRecargando(true)
    try {
      const ps = await traerProductosImg(marca, true)
      setProductos(ps)
      // Reintentar el match de los grupos sin producto.
      setGrupos((prev) =>
        prev.map((g) => {
          if (g.productId || !g.fotos.length) return g
          const p = matchByFilename(ps, g.fotos[0].fn)
          return p ? { ...g, productId: p.id } : g
        }),
      )
    } catch {
      /* nada */
    } finally {
      setRecargando(false)
    }
  }

  // ── Subir todo (tnImgSubirTodo): secuencial, la portada primero por producto ──
  const subirTodo = useCallback(async (): Promise<{ ok: number; err: number }> => {
    const gs = gruposRef.current.filter((g) => g.productId && g.fotos.some((f) => f.url && !f.subida))
    if (!gs.length) {
      const haySinProd = gruposRef.current.some((g) => !g.productId && g.fotos.length)
      alert(haySinProd ? 'Falta elegir el PRODUCTO en cada bloque: el buscador tiene que quedar en VERDE. Escribí y tocá el producto de la lista.' : 'Agregá un producto y al menos una foto.')
      return { ok: 0, err: 0 }
    }
    setSubiendo(true)
    const total = gs.reduce((s, g) => s + g.fotos.filter((f) => f.url && !f.subida).length, 0)
    let ok = 0
    let err = 0
    let sinVincular = 0
    const errMsgs: string[] = []
    for (const g of gs) {
      const colorUsado = new Set<string>()
      const orden = g.fotos.filter((f) => f.url && !f.subida).sort((a, b) => (b.id === g.portadaId ? 1 : 0) - (a.id === g.portadaId ? 1 : 0))
      for (const ft of orden) {
        setInfo(`Subiendo ${ok + err + 1} de ${total}…`)
        try {
          const body: { product_id: string | number; image: string; filename: string; color?: string } = { product_id: g.productId!, image: ft.url!, filename: ft.file.name }
          if (ft.color && !colorUsado.has(ft.color)) {
            body.color = ft.color
            colorUsado.add(ft.color)
          }
          const j = await subirImagen(marca, body)
          if (j.ok) {
            ok++
            let aviso: string | null = null
            if (body.color) {
              if (!j.variantesObjetivo) { aviso = `El color "${body.color}" no coincide con ninguna variante en TN`; sinVincular++ }
              else if ((j.variantesAsignadas ?? 0) < j.variantesObjetivo) { aviso = `Se vinculó ${j.variantesAsignadas}/${j.variantesObjetivo} — tocá Revincular`; sinVincular++ }
            }
            actualizarFoto(g.id, ft.id, { subida: true, imageId: j.image_id, avisoColor: aviso })
          } else {
            err++
            errMsgs.push(j.error || 'error')
          }
        } catch (e) {
          err++
          errMsgs.push(e instanceof Error ? e.message : String(e))
        }
      }
    }
    setSubiendo(false)
    setInfo(
      <>
        <span style={{ color: '#16A34A' }}>✅ {ok} subidas</span>
        {sinVincular ? <span style={{ color: '#D97706' }}> · ⚠ {sinVincular} sin vincular color (tocá 🔗 Revincular)</span> : null}
        {err ? <span style={{ color: '#DC2626' }}> · {err} con error: {[...new Set(errMsgs)].slice(0, 2).join(' / ')}</span> : null}
      </>,
    )
    if (ok) bustAudit(marca)
    return { ok, err }
  }, [marca, actualizarFoto])

  const revincular = async (gid: number, fid: number) => {
    const g = gruposRef.current.find((x) => x.id === gid)
    const ft = g?.fotos.find((f) => f.id === fid)
    if (!g || !ft || !ft.imageId || !ft.color) return
    setInfo('Revinculando color…')
    try {
      const j = await vincularColor(marca, g.productId!, ft.imageId, ft.color)
      if (j.ok && (j.variantesObjetivo ?? 0) > 0 && (j.variantesAsignadas ?? 0) >= (j.variantesObjetivo ?? 0)) {
        actualizarFoto(gid, fid, { avisoColor: null })
        setInfo(<span style={{ color: '#16A34A' }}>✅ Color vinculado.</span>)
      } else {
        const aviso = j.variantesObjetivo ? `Se vinculó ${j.variantesAsignadas}/${j.variantesObjetivo}` : `El color "${ft.color}" no coincide con ninguna variante`
        actualizarFoto(gid, fid, { avisoColor: aviso })
        setInfo(<span style={{ color: '#D97706' }}>⚠ {aviso}</span>)
      }
    } catch {
      setInfo('Error al revincular.')
    }
  }

  const subirYPublicar = async () => {
    const hayPend = gruposRef.current.some((g) => g.productId && g.fotos.some((f) => f.url && !f.subida))
    if (hayPend) await subirTodo()
    const ids = [...new Set(gruposRef.current.filter((g) => g.productId).map((g) => g.productId!))]
    if (!ids.length) {
      alert('No hay productos asignados para publicar (el buscador de cada bloque tiene que estar en verde).')
      return
    }
    if (!confirm(`Se van a PUBLICAR (hacer visibles en la tienda) ${ids.length} producto(s) en TiendaNube. ¿Confirmás?`)) return
    setPublicando(true)
    try {
      const d = await publicar(marca, ids)
      if (d.ok) {
        setInfo(<><span style={{ color: '#16A34A' }}>✅ {d.publicados} producto(s) publicado(s) en TiendaNube</span>{d.errores && d.errores.length ? <span style={{ color: '#DC2626' }}> · {d.errores.length} con error</span> : null}</>)
        bustAudit(marca)
      } else {
        alert('Error al publicar: ' + (d.error || 'desconocido'))
      }
    } catch (e) {
      alert('Error al publicar: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setPublicando(false)
    }
  }

  const subibles = grupos.reduce((s, g) => s + (g.productId ? g.fotos.filter((f) => f.url && !f.subida).length : 0), 0)
  const totalFotos = grupos.reduce((s, g) => s + g.fotos.length, 0)
  const sinAsig = grupos.filter((g) => !g.productId).reduce((s, g) => s + g.fotos.length, 0)

  return (
    <div className="card">
      <div style={{ fontSize: 16, fontWeight: 700 }}>📷 Carga de imágenes</div>
      <div style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 12px' }}>
        Agregá un producto y soltale <b>todas sus fotos</b> juntas. Repetí por cada producto (o por color). Después subís todo de una.
      </div>

      <label
        onDragOver={(e) => { e.preventDefault() }}
        onDrop={(e) => { e.preventDefault(); autoCargar(e.dataTransfer.files) }}
        style={{ display: 'block', border: '2px dashed #378ADD', borderRadius: 10, padding: 20, textAlign: 'center', background: '#EFF6FF', cursor: 'pointer', marginBottom: 12, color: '#185fa5', fontSize: 13, fontWeight: 600 }}
      >
        📂 Soltá acá TODAS las fotos (o tocá para elegir) — se asignan solas por el <b>nombre del archivo</b>
        <input type="file" multiple accept="image/*" onChange={(e) => { autoCargar(e.target.files || []); e.currentTarget.value = '' }} style={{ display: 'none' }} />
      </label>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="btn-sm" onClick={() => subirTodo()} disabled={subibles === 0 || subiendo} style={{ background: '#16A34A', color: '#fff' }}>⬆️ Subir todo a TN</button>
        <button className="btn-sm" onClick={subirYPublicar} disabled={publicando || subiendo} title="Sube las fotos pendientes y además PUBLICA (hace visibles) los productos en TiendaNube" style={{ background: '#7C3AED', color: '#fff' }}>🌐 Subir y publicar</button>
        <button className="btn-sm" onClick={agregarGrupo}>+ Agregar producto a mano</button>
        <button className="btn-sm" onClick={recargarProductos} disabled={recargando} title="Volvé a traer la lista de productos desde TiendaNube (usalo si importaste productos nuevos y no los reconoce)" style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
          {recargando ? '⏳ Cargando…' : '🔄 Recargar productos de TN'}
        </button>
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>
          {totalFotos ? (
            <>
              {grupos.filter((g) => g.productId).length} productos · {totalFotos} fotos
              {sinAsig ? <b style={{ color: '#D97706' }}> · {sinAsig} sin reconocer (asignalas a mano)</b> : <span style={{ color: '#16A34A' }}> · todas reconocidas ✓</span>}
            </>
          ) : null}{' '}
          {info}
        </span>
      </div>

      <div>
        {grupos.map((g) => {
          const prod = g.productId ? productos.find((p) => p.id === g.productId) ?? null : null
          const esActivo = g.id === activo
          const tieneColores = !!(prod && prod.colores && prod.colores.length)
          const portadaId = g.fotos.some((f) => f.id === g.portadaId) ? g.portadaId : g.fotos[0]?.id
          return (
            <div key={g.id} style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <input
                  key={String(g.productId)}
                  list="tnimg-prods"
                  placeholder="Buscar producto…"
                  defaultValue={prod ? prod.name : ''}
                  onBlur={(e) => setProd(g.id, e.target.value)}
                  style={{ flex: 1, minWidth: 200, padding: '7px 10px', border: `1px solid ${prod ? '#16A34A' : '#D1D5DB'}`, borderRadius: 8, fontSize: 13, fontWeight: 600 }}
                />
                {prod ? <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600, whiteSpace: 'nowrap' }}>✓ vinculado</span> : <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600, whiteSpace: 'nowrap' }}>⚠️ sin producto</span>}
                {tieneColores ? <span style={{ fontSize: 11, color: '#9CA3AF' }}>↓ elegí el color de cada foto</span> : null}
                <button onClick={() => quitarGrupo(g.id)} title="Quitar este producto" style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
              <div
                onClick={() => setActivo(g.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); grupoFotos(g.id, e.dataTransfer.files) } }}
                style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', border: `1.5px ${esActivo ? 'solid #378ADD' : 'dashed #CBD5E1'}`, borderRadius: 8, padding: 10, background: esActivo ? '#EFF6FF' : '#FAFAFA', cursor: 'pointer' }}
              >
                {g.fotos.map((ft) => {
                  const esPortada = ft.id === portadaId
                  return (
                    <div key={ft.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
                      <div draggable onDragStart={() => (dragRef.current = { gid: g.id, fid: ft.id })} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.stopPropagation(); onDrop(g.id, ft.id) }} style={{ position: 'relative' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ft.url || ''} onClick={(e) => { e.stopPropagation(); if (ft.url) setPreview(ft.url) }} title="Tocá para verla grande · arrastrá para ordenar" alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 7, background: '#F3F4F6', border: `2px solid ${esPortada ? '#F59E0B' : ft.subida ? '#16A34A' : '#E5E7EB'}`, cursor: 'zoom-in' }} />
                        <button onClick={(e) => { e.stopPropagation(); setPortada(g.id, ft.id) }} title={esPortada ? 'Es la portada' : 'Marcar como portada'} style={{ position: 'absolute', top: -7, left: -7, background: esPortada ? '#F59E0B' : '#fff', color: esPortada ? '#fff' : '#CBD5E1', border: `1px solid ${esPortada ? '#F59E0B' : '#D1D5DB'}`, borderRadius: '50%', width: 18, height: 18, padding: 0, fontSize: 11, cursor: 'pointer', lineHeight: '16px', textAlign: 'center' }}>★</button>
                        {ft.subida ? (
                          <span style={{ position: 'absolute', top: -6, right: -6, background: '#16A34A', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); quitarFoto(g.id, ft.id) }} style={{ position: 'absolute', top: -6, right: -6, background: '#DC2626', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, padding: 0, fontSize: 12, cursor: 'pointer', lineHeight: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                        )}
                      </div>
                      <div title={ft.fn} style={{ fontSize: 9, color: '#9CA3AF', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2, textAlign: 'center' }}>{ft.fn}</div>
                      {tieneColores && (
                        <select onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} value={ft.color} onChange={(e) => setColor(g.id, ft.id, e.target.value)} title="Color de esta foto" style={{ marginTop: 3, width: 72, padding: 3, border: `1px solid ${ft.color ? '#378ADD' : '#D1D5DB'}`, borderRadius: 6, fontSize: 11 }}>
                          <option value="">galería</option>
                          {prod!.colores!.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      )}
                      {ft.avisoColor ? (
                        <button onClick={(e) => { e.stopPropagation(); revincular(g.id, ft.id) }} title={ft.avisoColor} style={{ fontSize: 10, marginTop: 3, border: '1px solid #F59E0B', background: '#FFFBEB', color: '#92400E', borderRadius: 5, padding: '1px 6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>🔗 Revincular</button>
                      ) : null}
                    </div>
                  )
                })}
                <label onClick={(e) => e.stopPropagation()} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 60, height: 60, border: '1px solid #CBD5E1', borderRadius: 7, color: '#6B7280', fontSize: 11, background: '#fff' }}>
                  + fotos
                  <input type="file" accept="image/*" multiple onChange={(e) => { grupoFotos(g.id, e.target.files || []); e.currentTarget.value = '' }} style={{ display: 'none' }} />
                </label>
                <span style={{ fontSize: 12, color: esActivo ? '#378ADD' : '#9CA3AF' }}>{esActivo ? '📋 Pegá acá (Cmd/Ctrl+V), arrastrá o tocá "+ fotos"' : g.fotos.length ? '' : 'Tocá acá para pegar/arrastrar fotos'}</span>
              </div>
            </div>
          )
        })}
      </div>

      <datalist id="tnimg-prods">
        {productos.map((p) => (
          <option key={p.id} value={`${p.name}${p.sku ? ' (' + p.sku + ')' : ''}`} />
        ))}
      </datalist>

      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" style={{ maxWidth: '92%', maxHeight: '92%', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,.5)' }} />
        </div>
      )}
    </div>
  )
}

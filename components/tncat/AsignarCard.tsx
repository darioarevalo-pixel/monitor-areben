'use client'

import { useEffect, useRef, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { aplicarAsignarLote, previsualizarAsignar, traerCategorias } from '@/lib/tncat/cliente'
import { nombresDeFilas } from '@/lib/tncat/excel'
import { tomarPuenteAsignar } from '@/lib/tncat/puente'
import type { AsigMatched, AsigPreview, Categoria } from '@/lib/tncat/tipos'
import { Card, color as paleta, useConfirmar, useToast } from '@/components/ui'

const CHUNK = 20

/**
 * «WINTER SALE › TOPS Y BODIES» en vez de «TOPS Y BODIES» a secas.
 *
 * 🔑 **Sin la ruta, dos categorías con el mismo nombre son indistinguibles y se elige a ciegas** —
 * y pasa de verdad: en Zattia `JEANS` está duplicada, y las subcategorías de un sale se llaman igual
 * que las globales. Mostrar la jerarquía es lo que permite que las del sale se llamen `TOPS Y
 * BODIES` a secas, que es como tienen que verse en la tienda: ya cuelgan de «Winter Sale», así que
 * un prefijo «SALE ·» le repite al cliente dónde está parado.
 *
 * Sube hasta la raíz, con tope por si un `parent` quedara apuntando en círculo.
 */
function rutaDe(c: Categoria, todas: Categoria[]): string {
  const partes = [c.name]
  let actual = c
  for (let i = 0; i < 5 && actual.parent; i++) {
    const madre = todas.find((x) => String(x.id) === String(actual.parent))
    if (!madre) break
    partes.unshift(madre.name)
    actual = madre
  }
  return partes.join(' › ')
}

/**
 * Asignar categoría por Excel (card 4, Zattia). Subís un Excel con nombres de
 * producto (columna A), se previsualiza el cruce contra TN y, al confirmar, se le
 * AGREGA la categoría a los que matcheen (sin borrar las que ya tengan). El cruce y
 * la escritura los hace el server. Port de tncatAsig*.
 */
export function AsignarCard({ marca }: { marca: Marca }) {
  const { confirmar } = useConfirmar()
  const toast = useToast()
  const [categorias, setCategorias] = useState<Categoria[] | null>(null)
  const [catId, setCatId] = useState('')
  // Puente desde Comisiones: la lista de precios de sale manda sus nombres ya cargados, sin
  // pasar por el Excel. Se toma UNA vez al montar (`tomar` consume) y en el inicializador,
  // no en un efecto, para que el doble montaje de StrictMode no se lo lleve puesto.
  const [dePuente] = useState<string[] | null>(() => tomarPuenteAsignar())
  const [nombres, setNombres] = useState<string[]>(dePuente ?? [])
  const [info, setInfo] = useState(dePuente?.length ? `${dePuente.length} producto(s) traídos de la lista de sale` : '')
  const caja = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<AsigPreview | null>(null)
  const [prevMsg, setPrevMsg] = useState<React.ReactNode>(null)
  const [matched, setMatched] = useState<AsigMatched[]>([])
  const [catName, setCatName] = useState('')
  /**
   * Sacar en vez de agregar. Es el mismo flujo al revés y por eso vive acá y no en una card aparte:
   * elegir categoría, cruzar por nombre y escribir en la tienda es idéntico; lo único que cambia es
   * si la categoría entra o sale de la lista del producto.
   *
   * Hace falta para las subcategorías temporales de un sale (`SALE · TOPS Y BODIES`…): cuando la
   * campaña termina hay que sacárselas a 260 productos, y borrar la categoría en Tienda Nube no es
   * lo mismo ni se puede hacer de a uno.
   */
  const [sacar, setSacar] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<React.ReactNode>(null)
  const [progreso, setProgreso] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const cats = await traerCategorias(marca)
        if (vivo) setCategorias(cats)
      } catch {
        if (vivo) setCategorias([])
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const onArchivo = async (file: File | undefined) => {
    if (!file) return
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][]
      const nn = nombresDeFilas(rows)
      setNombres(nn)
      setInfo(`${nn.length} nombre(s) cargado(s) de "${file.name}"`)
      await previsualizar(catId, nn)
    } catch (err) {
      toast.error('No pude leer el Excel: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  // `sacarAhora` viaja por parámetro y no se lee del estado: el switch llama a previsualizar en el
  // mismo tick en que lo cambia, y ahí `sacar` todavía tiene el valor viejo.
  const previsualizar = async (categoriaId: string, nn: string[], sacarAhora = sacar) => {
    setResultado(null)
    if (!nn.length) {
      setPreview(null)
      setPrevMsg(null)
      return
    }
    if (!categoriaId) {
      setPreview(null)
      setPrevMsg(<div style={{ fontSize: 13, color: paleta.warningInk, background: paleta.warningBg, border: `1px solid ${paleta.warningBorder}`, borderRadius: 8, padding: 10 }}>Elegí una categoría para previsualizar.</div>)
      return
    }
    setPrevMsg(<div style={{ color: paleta.mut2, fontSize: 13, padding: 8 }}>Cruzando con TiendaNube…</div>)
    try {
      const d = await previsualizarAsignar(marca, categoriaId, nn, sacarAhora)
      if (!d.ok) {
        setPreview(null)
        setPrevMsg(<div style={{ color: paleta.danger, fontSize: 13 }}>Error: {d.error || 'desconocido'}</div>)
        return
      }
      setMatched(d.matched || [])
      setCatName(d.categoria || '')
      setPreview(d)
      setPrevMsg(null)
    } catch (e) {
      setPreview(null)
      setPrevMsg(<div style={{ color: paleta.danger, fontSize: 13 }}>Error: {e instanceof Error ? e.message : String(e)}</div>)
    }
  }

  const onCat = (id: string) => {
    setCatId(id)
    previsualizar(id, nombres)
  }

  // Si los nombres vinieron de Comisiones, la card puede quedar abajo del fondo (arriba está
  // Explorar categoría): se trae a la vista y se previsualiza, que con la categoría todavía
  // sin elegir es lo que muestra el "Elegí una categoría" — el único paso que falta.
  useEffect(() => {
    if (!dePuente?.length) return
    caja.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    previsualizar('', dePuente)
    // Corre una sola vez al montar: `dePuente` ya viene consumido y no vuelve a cambiar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const aplicar = async () => {
    if (!matched.length) return
    const huerfanos = preview?.quedanSinCategoria || []
    const ok = await confirmar({
      titulo: sacar ? 'Sacar la categoría' : 'Asignar la categoría',
      tono: sacar ? 'danger' : 'warning',
      ok: sacar ? `Sacársela a ${matched.length}` : `Asignar a ${matched.length}`,
      mensaje: sacar
        // El aviso de los huérfanos va en el diálogo y no en un cartel al costado: es lo último que
        // se lee antes de escribir en la tienda EN VIVO, y un producto sin categoría deja de estar
        // en la navegación.
        ? `Se le saca "${catName}" a ${matched.length} ${matched.length === 1 ? 'producto' : 'productos'} en la tienda EN VIVO.${huerfanos.length ? ` ⚠️ ${huerfanos.length} ${huerfanos.length === 1 ? 'quedaría' : 'quedarían'} SIN NINGUNA categoría (${huerfanos.slice(0, 3).join(', ')}${huerfanos.length > 3 ? '…' : ''}): a la tienda dejan de aparecer en el menú, se llega sólo por buscador.` : ''}`
        : `Se agrega "${catName}" a ${matched.length} ${matched.length === 1 ? 'producto' : 'productos'} en la tienda EN VIVO.`,
    })
    if (!ok) return
    setAplicando(true)
    setPreview(null)
    const total = matched.length
    let aplicados = 0
    const errores: { nombre?: string; msg?: string; status?: string }[] = []
    setProgreso(0)
    try {
      for (let i = 0; i < total; i += CHUNK) {
        const lote = matched.slice(i, i + CHUNK)
        const d = await aplicarAsignarLote(marca, lote)
        if (d.ok) {
          aplicados += d.aplicados || 0
          if (d.errores) errores.push(...d.errores)
        } else {
          errores.push({ nombre: `(lote ${i / CHUNK + 1})`, msg: d.error || 'error' })
        }
        setProgreso(Math.round((Math.min(i + CHUNK, total) / total) * 100))
      }
      setProgreso(null)
      setResultado(
        <div>
          <div style={{ background: paleta.successBg, border: `1px solid ${paleta.successBorder}`, borderRadius: 10, padding: 12, marginTop: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: paleta.successInk }}>Listo</div>
            <div style={{ fontSize: 13, color: paleta.successInk, marginTop: 3 }}>
              Se agregó <b>{catName}</b> a <b>{aplicados}</b> producto(s).{errores.length ? ` ${errores.length} con error.` : ''}
            </div>
          </div>
          {errores.length ? (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12.5, color: paleta.dangerInk, fontWeight: 600 }}>Errores ({errores.length})</summary>
              <div style={{ fontSize: 12, color: paleta.ink2, maxHeight: 180, overflow: 'auto', marginTop: 4, paddingLeft: 6 }}>
                {errores.map((e, i) => (
                  <div key={i}>{(e.nombre || '') + ': ' + (e.msg || e.status || '')}</div>
                ))}
              </div>
            </details>
          ) : null}
        </div>,
      )
      setMatched([])
    } catch (e) {
      setProgreso(null)
      setResultado(<div style={{ color: paleta.danger, fontSize: 13 }}>Error: {e instanceof Error ? e.message : String(e)} — aplicados {aplicados}/{total}.</div>)
    } finally {
      setAplicando(false)
    }
  }

  const lista = (titulo: string, color: string, arr: string[]) =>
    arr.length ? (
      <details style={{ marginTop: 6 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, color, fontWeight: 600 }}>{titulo} ({arr.length})</summary>
        <div style={{ fontSize: 12, color: paleta.ink2, maxHeight: 180, overflow: 'auto', marginTop: 4, paddingLeft: 6 }}>
          {arr.map((n, i) => (
            <div key={i}>{n}</div>
          ))}
        </div>
      </details>
    ) : null

  return (
    <Card ref={caja}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{sacar ? 'Sacar categoría' : 'Asignar categoría'} (Excel)</div>
      <div style={{ fontSize: 12, color: paleta.mut2, margin: '2px 0 12px', maxWidth: 680 }}>
        Elegí una categoría y subí un Excel con los <b>nombres de producto</b> en una columna (A1 = encabezado, de A2 para abajo los nombres). Te muestro la previsualización y, al confirmar, {sacar
          ? <>se le <b>saca</b> esa categoría a los que la tengan — las demás no se tocan.</>
          : <>se le <b>agrega</b> esa categoría a los que matcheen — sin borrar las que ya tengan.</>}
      </div>
      {/*
        El switch va arriba de todo y cambia el título de la card: es lo que decide si se agrega o
        se quita, y descubrirlo recién en el diálogo de confirmación sería tarde. Cambiarlo vuelve a
        cruzar, porque el «matchean / ya la tenían» se da vuelta entero.
      */}
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={sacar}
          onChange={(e) => { setSacar(e.target.checked); setResultado(null); void previsualizar(catId, nombres, e.target.checked) }}
        />
        Sacar la categoría en vez de agregarla
        <span style={{ color: paleta.mut2 }}>— para cuando termina un sale y hay que quitar sus subcategorías</span>
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select value={catId} onChange={(e) => onCat(e.target.value)} style={{ padding: '7px 10px', border: `1px solid ${paleta.line2}`, borderRadius: 8, fontSize: 13, minWidth: 220 }}>
          {categorias === null ? (
            <option value="">Cargando categorías…</option>
          ) : (
            <>
              <option value="">— Elegí una categoría —</option>
              {categorias.map((c) => (
                <option key={c.id} value={String(c.id)}>{rutaDe(c, categorias)}</option>
              ))}
            </>
          )}
        </select>
        <label className="btn-sm" style={{ background: paleta.brandSolid, color: '#fff', cursor: 'pointer' }}>
          📁 Subir Excel
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { onArchivo(e.target.files?.[0]); e.currentTarget.value = '' }} style={{ display: 'none' }} />
        </label>
        <span style={{ fontSize: 12, color: paleta.mut2 }}>{info}</span>
      </div>

      <div>
        {resultado}
        {progreso !== null && (
          <div style={{ margin: '8px 0' }}>
            <div style={{ background: paleta.line, borderRadius: 8, height: 14, overflow: 'hidden' }}>
              <div style={{ background: paleta.success, height: '100%', width: `${progreso}%`, transition: 'width .2s' }} />
            </div>
            <div style={{ fontSize: 12, color: paleta.ink2, marginTop: 4 }}>Aplicando en TiendaNube… {progreso}%</div>
          </div>
        )}
        {prevMsg}
        {preview && !resultado && progreso === null && (
          <div>
            <div style={{ fontSize: 13, margin: '6px 0' }}>
              Categoría: <b>{preview.categoria}</b> · <b>{matched.length}</b> {sacar ? 'se la van a perder' : 'se van a asignar'} de {preview.total} nombre(s).
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
              <span style={{ background: paleta.successBg, color: paleta.successInk, borderRadius: 14, padding: '3px 10px' }}>✓ Matchean: {matched.length}</span>
              <span style={{ background: paleta.bg2, color: paleta.mut, borderRadius: 14, padding: '3px 10px' }}>{sacar ? 'No la tenían' : 'Ya la tenían'}: {preview.yaTenian.length}</span>
              <span style={{ background: paleta.dangerBg, color: paleta.dangerInk, borderRadius: 14, padding: '3px 10px' }}>No encontrados: {preview.noEncontrados.length}</span>
              {/* Sólo al sacar, y sólo si hay: un producto sin categoría sale del menú de la tienda. */}
              {!!preview.quedanSinCategoria?.length && (
                <span style={{ background: paleta.warningBg, color: paleta.warningInk, borderRadius: 14, padding: '3px 10px' }}>
                  ⚠️ Quedan sin ninguna categoría: {preview.quedanSinCategoria.length}
                </span>
              )}
            </div>
            {lista(sacar ? '✓ Se les va a sacar' : '✓ Se van a asignar', paleta.successInk, matched.map((m) => m.nombre))}
            {!!preview.quedanSinCategoria?.length && lista('⚠️ Quedan sin ninguna categoría (salen del menú de la tienda)', paleta.warningInk, preview.quedanSinCategoria)}
            {lista(sacar ? 'No tenían la categoría' : 'Ya tenían la categoría', paleta.mut, preview.yaTenian)}
            {lista('No encontrados en TiendaNube (revisá el nombre)', paleta.dangerInk, preview.noEncontrados)}
          </div>
        )}
      </div>

      {matched.length > 0 && !resultado && progreso === null && (
        <div style={{ marginTop: 12 }}>
          <button className="btn-sm" onClick={aplicar} disabled={aplicando} style={{ background: sacar ? paleta.danger : paleta.success, color: '#fff' }}>
            {sacar ? 'Sacar en TiendaNube' : 'Aplicar en TiendaNube'}
          </button>
        </div>
      )}
    </Card>
  )
}

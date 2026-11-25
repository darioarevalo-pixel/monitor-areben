'use client'

/**
 * ERP › Productos › Vincular: qué variante del ERP es cada variante de Tienda Nube (motor sql/076).
 *
 * 🔑 Bruno, 3-nov: la vinculación ⛔ es por SKU. Dos variantes de TN sobre una del ERP es válido y llevan el mismo stock si sólo cambia
 * el modelo (iPhone 17 Pro y 18 Pro); con colores distintos ⛔ se guarda (lo frena el motor y acá se muestra su texto).
 * Desde el corte nadie más vincula: el próximo iPhone se resuelve en esta pantalla.
 */

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Field, Input, Modal, Notice, color, font, space } from '@/components/ui'
import { ListaTrabajo, type ColumnaLista } from '@/components/ui/ListaTrabajo'
import { BuscadorLista, ChipEstado, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { buscarVariantesVinculo, leerVinculos, ponerVinculo, type FilaVinculo, type MarcaErp, type VariantesDeVinculo, type VariantePorVincular } from '@/lib/erp/cliente'
import { normal } from '@/lib/erp/stock-lista.core.js'
import { useTiendaErp } from '@/lib/erp/linea-erp'

const BASE: ColumnaLista[] = [
  { key: 'producto', titulo: 'Producto en Tienda Nube', ancho: 'minmax(220px, 1.6fr)', movil: 'titulo' },
  { key: 'variante', titulo: 'Variante', ancho: 'minmax(150px, 1fr)', movil: 'chico' },
  { key: 'sku', titulo: 'SKU', ancho: '120px', movil: 'oculta' },
  { key: 'estado', titulo: 'Estado', ancho: '84px', movil: 'chico' },
  { key: 'stock', titulo: 'Stock', ancho: '64px', derecha: true, movil: 'dato' },
]
const COLUMNAS: Record<string, ColumnaLista[]> = {
  sin_par: BASE,
  trabados: [...BASE, { key: 'grupo', titulo: 'Vinculadas a', ancho: 'minmax(200px, 1.2fr)', movil: 'chico' }],
  elegidas: [...BASE.filter((c) => c.key !== 'stock'), { key: 'grupo', titulo: 'Vinculada a', ancho: 'minmax(200px, 1.2fr)', movil: 'chico' }, { key: 'por', titulo: 'Responsable', ancho: '120px', movil: 'oculta' }, { key: 'cuando', titulo: 'Fecha', ancho: '104px', movil: 'chico' }],
}
const VISTAS = [['sin_par', 'Sin vincular'] as const, ['trabados', 'Repetidas'] as const, ['elegidas', 'Vinculadas'] as const]

type Fila = FilaVinculo & { grupo?: string | null; product_id?: number; usuario?: string | null; actualizado_en?: string }

const nombreVariante = (f: FilaVinculo) => f.valores.join(' / ') || '—'
/** Primero lo que se vende: lo publicado y con stock. */
const ordenadas = <T extends FilaVinculo>(xs: T[]) => [...xs].sort((a, b) => Number(b.publicado) - Number(a.publicado) || (b.stock ?? 0) - (a.stock ?? 0) || a.producto.localeCompare(b.producto, 'es'))

export function VincularTN() {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const tienda = useTiendaErp()
  const [datos, setDatos] = useState<VariantesDeVinculo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [vista, setVista] = useState('sin_par')
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState<Fila | null>(null)
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<VariantePorVincular[] | null>(null)
  const [elegida, setElegida] = useState<VariantePorVincular | null>(null)
  const [errorModal, setErrorModal] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    let vivo = true
    leerVinculos(marca, tienda).then((r) => { if (vivo) setDatos(r) })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer los vínculos.'))
    return () => { vivo = false }
  }, [marca, tienda])

  // El buscador pregunta al servidor: el catálogo entero ⛔ viaja a la pantalla.
  useEffect(() => {
    if (!abierta) return
    let vivo = true
    const t = texto.trim()
    const reloj = setTimeout(() => {
      if (!t) { setResultados([]); return }
      buscarVariantesVinculo(marca, tienda, t).then((r) => { if (vivo) setResultados(r.variantes) })
        .catch((e) => vivo && setErrorModal(e instanceof Error ? e.message : 'No se pudo buscar.'))
    }, 250)
    return () => { vivo = false; clearTimeout(reloj) }
  }, [abierta, texto, marca, tienda])

  const filasDe: Record<string, Fila[]> = {
    sin_par: ordenadas(datos?.sin_par ?? []),
    trabados: (datos?.trabados ?? []).flatMap((g) => ordenadas(g.variantes).map((v) => ({ ...v, grupo: g.nombre }))),
    elegidas: (datos?.elegidas ?? []).map((e) => ({ ...e, grupo: e.nombre })),
  }
  const t = normal(q)
  const filtrar = (xs: Fila[]) => (t ? xs.filter((f) => normal(`${f.producto} ${nombreVariante(f)} ${f.sku ?? ''} ${f.grupo ?? ''}`).includes(t)) : xs)
  const conteo = { sin_par: filtrar(filasDe.sin_par).length, trabados: filtrar(filasDe.trabados).length, elegidas: filtrar(filasDe.elegidas).length }
  const filas = filtrar(filasDe[vista])

  function abrir(f: Fila) {
    setAbierta(f); setTexto(f.producto); setResultados(null); setElegida(null); setErrorModal(null); setHecho(null)
  }

  async function guardar() {
    if (!abierta || !elegida) return
    setTrabajando(true); setErrorModal(null)
    try {
      const r = await ponerVinculo({ marca, tienda, variant_id: abierta.variant_id, product_id: elegida.product_id, size_id: elegida.size_id })
      const otras = r.vinculadas - 1
      setHecho(`Vinculada: ${abierta.producto} ${nombreVariante(abierta)} → ${elegida.producto} · ${elegida.talle}${otras > 0 ? ` (y ${otras} más)` : ''}.`)
      setAbierta(null)
      setDatos(await leerVinculos(marca, tienda))
      setError(null)
    } catch (e) {
      // 🔴 Queda en la ventana: lo que frena (colores) lo tiene que leer quien está eligiendo.
      setErrorModal(e instanceof Error ? e.message : 'No se pudo guardar el vínculo.')
    } finally {
      setTrabajando(false)
    }
  }

  const celda = (f: Fila, k: string): React.ReactNode => {
    if (k === 'producto') return <b style={{ color: color.ink }}>{f.producto}</b>
    if (k === 'variante') return <span style={{ color: color.ink2 }}>{nombreVariante(f)}</span>
    if (k === 'sku') return f.sku ? <span style={{ color: color.mut }}>{f.sku}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'estado') return <span style={{ color: f.publicado ? color.ink2 : color.mut2 }}>{f.publicado ? 'Publicada' : 'Oculta'}</span>
    if (k === 'stock') return f.stock == null ? <span style={{ color: color.mut2 }} title="Tienda Nube no controla el stock de esta variante">—</span> : <span>{f.stock}</span>
    if (k === 'grupo') return <span style={{ color: f.grupo ? color.ink2 : color.mut2 }}>{f.grupo ?? 'No está en Areben Gestión'}</span>
    if (k === 'por') return <span style={{ color: color.mut }}>{f.usuario ?? '—'}</span>
    if (k === 'cuando') return <span style={{ color: color.mut }}>{f.actualizado_en ? cuandoCorto(f.actualizado_en) : '—'}</span>
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {vista === 'trabados' && <p style={{ margin: 0, color: color.mut }}>No reciben stock hasta resolverlas.</p>}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho}</Notice>}
      {!datos && !error && <EmptyState title="Leyendo…" />}
      {datos && (
        <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
          <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={setVista} />
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
            <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en los vínculos" placeholder="Producto, variante o SKU" />
          </div>
          <ListaTrabajo
            columnas={COLUMNAS[vista]} filas={filas} claveDe={(f) => String(f.variant_id)} celda={celda}
            activa={abierta ? String(abierta.variant_id) : null} onAbrir={abrir} etiquetaFila={(f) => `vincular ${f.producto} ${nombreVariante(f)}`}
            vacio={<div style={{ padding: space[6] }}><EmptyState title={q ? `Ninguna variante coincide con «${q.trim()}».` : 'Sin variantes.'} /></div>}
          />
          <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
            Una variante nueva de Tienda Nube tarda hasta 2 horas en aparecer.
          </div>
        </div>
      )}

      {abierta && (
        <Modal
          abierto onCerrar={() => setAbierta(null)} titulo="Vincular variante" ancho="ancho"
          pie={(
            <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setAbierta(null)} disabled={trabajando}>Cancelar</Button>
              <Button variant="solid" tone="brand" onClick={guardar} disabled={trabajando || !elegida}>Vincular</Button>
            </div>
          )}
        >
          {/* Darío 20-nov: arriba la variante de Tienda Nube, como el encabezado de la venta. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], alignItems: 'flex-start', marginBottom: space[4] }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: font.sm, color: color.mut }}>En Tienda Nube</div>
              <div style={{ fontSize: 20, fontWeight: 700, overflowWrap: 'anywhere' }}>{abierta.producto} · {nombreVariante(abierta)}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <ChipEstado mapa={{ p: ['success', 'Publicada'], o: ['neutral', 'Oculta'] }} k={abierta.publicado ? 'p' : 'o'} />
                {abierta.sku && <span style={{ fontSize: font.sm, color: color.mut, alignSelf: 'center' }}>{abierta.sku}</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
              <div style={{ fontSize: font.sm, color: color.mut }}>Stock</div>
              <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{abierta.stock ?? '—'}</div>
            </div>
          </div>
          {vista !== 'sin_par' && (
            <div style={{ marginBottom: space[3], padding: '10px 12px', borderRadius: 9, background: color.bg, border: `1px solid ${color.line}` }}>
              <span style={{ color: color.mut }}>Vinculada a</span> <b>{abierta.grupo ?? 'No está en Areben Gestión'}</b>
            </div>
          )}
          {errorModal && <div style={{ marginBottom: space[3] }}><Notice tone="danger" onClose={() => setErrorModal(null)}>{errorModal}</Notice></div>}
          <Field label="Buscar en Areben Gestión">
            <Input value={texto} onChange={(e) => { setTexto(e.target.value); setElegida(null) }} placeholder="Nombre, variante o SKU" autoFocus />
          </Field>
          <div role="listbox" aria-label="Variantes de Areben Gestión" style={{ marginTop: space[3], maxHeight: 320, overflowY: 'auto', border: `1px solid ${color.line}`, borderRadius: 10 }}>
            {!!resultados?.length && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) 140px', gap: space[3], padding: '8px 12px', fontSize: font.sm, color: color.mut, borderBottom: `1px solid ${color.line}`, position: 'sticky', top: 0, background: color.surface }}>
                <span>Producto</span><span>Variante</span><span>SKU</span>
              </div>
            )}
            {resultados === null && <div style={{ padding: space[3], color: color.mut }}>Buscando…</div>}
            {resultados?.length === 0 && <div style={{ padding: space[3], color: color.mut }}>{texto.trim() ? `Ningún producto coincide con «${texto.trim()}».` : null}</div>}
            {resultados?.map((v) => {
              const on = elegida?.product_id === v.product_id && elegida?.size_id === v.size_id
              return (
                <button
                  key={`${v.product_id}:${v.size_id}`} type="button" role="option" aria-selected={on} onClick={() => setElegida(v)}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) 140px', gap: space[3], width: '100%', height: 'auto', padding: '9px 12px', border: 'none', borderBottom: `1px solid ${color.bg2}`, boxShadow: on ? 'inset 3px 0 0 var(--mo-brand, #4f46e5)' : 'none', background: on ? 'var(--mo-brand-bg, #eef2ff)' : 'transparent', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: color.ink }}
                >
                  <span style={{ fontWeight: on ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.producto}</span>
                  <span>{v.talle}</span>
                  <span style={{ color: color.mut, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.sku ?? '—'}</span>
                </button>
              )
            })}
          </div>
        </Modal>
      )}
    </div>
  )
}

'use client'

import { useMemo, useRef, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { dispararSyncStock } from '@/lib/sync-gn'
import { generarReporteExhib } from '@/lib/exhib/pdf'
import { contarSinMarcar, exhibId, faltantes, filtrarPorCat, tnAdminUrl, agruparPDF } from '@/lib/exhib/core'
import type { ExhibItem } from '@/lib/exhib/tipos'
import { useExhib, type ResultadoMarca } from './useExhib'

type Fase = 'config' | 'scan' | 'triage'

/**
 * "👕 Chequeo de exhibición" (key `exhib`) en Next — Tanda C (bajo riesgo).
 *
 * Port de exhibInit/…/exhibGenerarPDF (index.html:7564-7945): recorrer el Local con
 * el lector físico confirmando que cada variante con stock está colgada; triage de
 * faltantes + reporte PDF + registro de categorías a corregir en TN. Read-only sobre
 * Supabase/TN; solo escribe localStorage (MISMAS claves del iframe → sin migración).
 * NO escribe stock ni GN → flip directo. La cámara ZXing del legacy era código muerto
 * (sin `<video>` ni llamador) → se porta el flujo de lector físico. Rollback: SOMBRAS.
 */
export function Exhib() {
  const { datos } = useDatosMonitor()
  const { marca, perfil } = useSesion()
  const productos = useMemo(() => datos?.allProductos ?? [], [datos])
  const ex = useExhib(marca, productos)

  const [fase, setFase] = useState<Fase>('config')
  const [persona, setPersona] = useState('')
  const [catSel, setCatSel] = useState('')
  const [syncLabel, setSyncLabel] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fb, setFb] = useState<ResultadoMarca | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  // Nombre por defecto: el usuario logueado (salvo "local").
  const personaVal = persona || (perfil && perfil.name !== 'local' ? perfil.name : '')

  const lista = useMemo(() => filtrarPorCat(ex.items, catSel), [ex.items, catSel])
  const hechos = useMemo(() => lista.filter((it) => ex.estados[exhibId(it)] === 'exhibido').length, [lista, ex.estados])
  const pendientes = useMemo(() => faltantes(lista, ex.estados), [lista, ex.estados])
  const faltas = pendientes // en triage son lo mismo (los no 'exhibido')
  const sinMarcar = useMemo(() => contarSinMarcar(faltas, ex.estados), [faltas, ex.estados])
  const enCurso = Object.keys(ex.estados).length

  function foco() {
    setTimeout(() => scanRef.current?.focus(), 150)
  }
  function iniciar() {
    setFase('scan')
    setFb(null)
    foco()
  }
  function marcar(code: string) {
    const c = code.trim()
    if (!c) return
    setFb(ex.marcarPorCodigo(c, catSel))
  }
  function vaAca(pid: string) {
    ex.marcarErrorCat(pid, catSel)
    setFb(null)
  }
  function terminar() {
    setFase('triage')
  }
  function reiniciar() {
    if ((Object.keys(ex.estados).length || Object.keys(ex.errores).length) && !confirm('¿Borrar el chequeo en curso y empezar de cero?')) return
    ex.reiniciar()
    setFase('config')
  }

  async function traerGN() {
    if (syncLabel) return
    setSyncLabel('⏳ Pidiendo a GN…')
    try {
      const done = await dispararSyncStock(marca, setSyncLabel)
      setSyncLabel('↻ Recargando…')
      await ex.recargar()
      if (!done) alert('La sincronización con GN está tardando más de lo normal. Te muestro lo último disponible.')
    } catch (e) {
      alert('Error al actualizar: ' + (e as Error).message)
    } finally {
      setSyncLabel(null)
    }
  }

  async function generarPDF() {
    const grupos = agruparPDF(lista, ex.estados)
    if (grupos['sin-marcar'].length && !confirm(`Tenés ${grupos['sin-marcar'].length} faltante(s) SIN cargar estado.\n\nLo ideal es marcar cada uno (Solucionado / Una sola unidad / No se encuentra) antes de terminar.\n\n¿Generar el reporte igual?`)) return
    await generarReporteExhib({ lista, persona: personaVal || '(sin nombre)', catLabel: catSel || 'Todas las categorías', estados: ex.estados, errores: ex.errores, marca })
  }

  return (
    <>
      {/* ── Config ── */}
      {fase === 'config' && (
        <div className="card">
          <div style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px', margin: '0 0 14px' }}>
            {ex.errorMsg ? <span style={{ color: '#DC2626' }}>Error cargando inventario: {ex.errorMsg}</span> : ex.cargando ? 'Cargando inventario…' : <>📅 <b>{ex.items.length}</b> variantes con stock en Local. Datos del último sync diario (pueden tener unas horas) — conviene chequear en momentos de baja venta.</>}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#374151' }}>
              Persona
              <br />
              <input value={personaVal} onChange={(e) => setPersona(e.target.value)} style={{ width: 200, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 13, color: '#374151' }}>
              Categoría a recorrer
              <br />
              <select value={catSel} onChange={(e) => setCatSel(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, minWidth: 200, marginTop: 4 }}>
                <option value="">Todas las categorías</option>
                {ex.cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
            Vas a chequear <b>{lista.length}</b> variantes{catSel ? ' de esta categoría' : ''}. Cada una debería estar colgada en el local.
          </div>
          <button className="btn-sm" onClick={iniciar} disabled={ex.cargando || !lista.length} style={{ background: '#378ADD', color: '#fff' }}>▶️ Iniciar recorrido</button>
          <button className="btn-sm" onClick={traerGN} disabled={!!syncLabel} title="Trae lo más nuevo de GN (stock y productos recién llegados) y recarga la lista (~2-4 min)" style={{ background: '#fff', border: '1px solid #D1D5DB', marginLeft: 6 }}>{syncLabel || '🔄 Traer de GN'}</button>
          {enCurso > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#6B7280' }}>Hay un chequeo en curso con <b>{enCurso}</b> ítems marcados. <button className="btn-sm" onClick={iniciar} style={{ marginLeft: 6 }}>Retomar</button></div>
          )}
        </div>
      )}

      {/* ── Scan ── */}
      {fase === 'scan' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{hechos} / {lista.length} escaneados</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-sm" onClick={terminar} style={{ background: '#16A34A', color: '#fff' }}>✓ Terminar recorrido</button>
              <button className="btn-sm" onClick={() => setFase('config')}>Cancelar</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
            <input ref={scanRef} type="text" onKeyDown={(e) => { if (e.key === 'Enter') { marcar((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' } }} placeholder="código de barras" autoComplete="off" autoCapitalize="off" spellCheck={false} style={{ width: 260, padding: '11px 12px', fontSize: 16, border: '2px solid #378ADD', borderRadius: 10, textAlign: 'center' }} />
            <button className="btn-sm" onClick={() => { if (scanRef.current) { marcar(scanRef.current.value); scanRef.current.value = ''; scanRef.current.focus() } }} style={{ background: '#378ADD', color: '#fff' }}>Marcar</button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 14, minHeight: 22, margin: '10px 0 14px', fontWeight: 600 }}>
            {fb?.tipo === 'no-encontrado' && <span style={{ color: '#DC2626' }}>✗ Ese código no está en la lista ({fb.code})</span>}
            {fb?.tipo === 'ok' && <span style={{ color: '#16A34A' }}>✓ {fb.it.name} · {fb.it.size}</span>}
            {fb?.tipo === 'cruce' && (
              <div style={{ color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 10px', textAlign: 'left', maxWidth: 480, margin: '0 auto' }}>
                <div style={{ fontWeight: 700 }}>⚠ &quot;{fb.it.name}&quot; no es de «{fb.catSel}»</div>
                <div style={{ fontSize: 12, margin: '2px 0 8px' }}>En TN figura en «{fb.it.cat}». ¿Qué hacés?</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => vaAca(fb.it.productId)} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid #2563EB', background: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Va acá → corregir TN</button>
                  <button onClick={() => setFb(null)} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#fff', color: '#374151', cursor: 'pointer' }}>Es de «{fb.it.cat}», mal colgado</button>
                </div>
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Pendientes de escanear ({pendientes.length})</div>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {pendientes.length ? pendientes.map((it) => <Fila key={exhibId(it)} it={it} onPreview={setPreview} />) : <div style={{ color: '#16A34A', padding: 14, textAlign: 'center' }}>¡Todo escaneado! 🎉 Tocá &quot;Terminar recorrido&quot;.</div>}
          </div>
        </div>
      )}

      {/* ── Triage ── */}
      {fase === 'triage' && (
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Faltantes: marcá qué pasó con cada uno</div>
          {Object.keys(ex.errores).length > 0 && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 9, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#92400E', marginBottom: 6 }}>⚠ Categorías a corregir en TN ({Object.keys(ex.errores).length})</div>
              {Object.entries(ex.errores).map(([pid, e]) => {
                const url = tnAdminUrl(e.tnId, marca)
                return (
                  <div key={pid} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '6px 2px', borderBottom: '1px solid #FDE68A' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{e.name}</div>
                      <div style={{ fontSize: 11.5, color: '#92400E' }}>SKU: {e.sku || '—'} · TN: «{e.catTN}» → debería: «{e.catCorrecta}»</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 'none' }}>
                      {url && <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'none', fontSize: 12, whiteSpace: 'nowrap' }}>Editar en TN ↗</a>}
                      <button onClick={() => ex.quitarError(pid)} style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #D1D5DB', background: '#fff', borderRadius: 6, cursor: 'pointer', color: '#6B7280' }}>quitar</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ maxHeight: 460, overflowY: 'auto', marginBottom: 10 }}>
            {faltas.length ? faltas.map((it) => <Fila key={exhibId(it)} it={it} triage estado={ex.estados[exhibId(it)]} onEstado={ex.setEstado} onPreview={setPreview} />) : <div style={{ color: '#16A34A', padding: 14, textAlign: 'center' }}>No quedaron faltantes: todo escaneado/exhibido ✅</div>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, minHeight: 18 }}>
            {sinMarcar ? <span style={{ color: '#D97706' }}>⚠️ Te faltan marcar <b>{sinMarcar}</b> de {faltas.length} faltantes antes de generar el reporte.</span> : faltas.length ? <span style={{ color: '#16A34A' }}>✓ Todos los faltantes tienen estado. Listo para el reporte.</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-sm" onClick={generarPDF} style={{ background: '#DC2626', color: '#fff' }}>📄 Generar reporte PDF</button>
            <button className="btn-sm" onClick={() => { setFase('scan'); foco() }}>← Volver a escanear</button>
            <button className="btn-sm" onClick={reiniciar}>Reiniciar chequeo</button>
          </div>
        </div>
      )}

      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 20, cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" style={{ maxWidth: '96%', maxHeight: '96%', borderRadius: 8 }} />
        </div>
      )}
    </>
  )
}

function Fila({ it, triage, estado, onEstado, onPreview }: { it: ExhibItem; triage?: boolean; estado?: string; onEstado?: (id: string, e: 'solucionado' | 'una-unidad' | 'no-encuentra') => void; onPreview: (u: string) => void }) {
  const id = exhibId(it)
  const btn = (est: 'solucionado' | 'una-unidad' | 'no-encuentra', txt: string, col: string) => (
    <button onClick={() => onEstado?.(id, est)} style={{ fontSize: 11, padding: '4px 7px', borderRadius: 6, border: `1px solid ${estado === est ? col : '#D1D5DB'}`, background: estado === est ? col : '#fff', color: estado === est ? '#fff' : '#374151', cursor: 'pointer' }}>{txt}</button>
  )
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 4px', borderBottom: '1px solid #F3F4F6' }}>
      {it.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={it.img} loading="lazy" onClick={() => onPreview(it.img!)} title="Tocá para verla grande" alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 6, background: '#F3F4F6', flex: 'none', cursor: 'zoom-in' }} />
      ) : (
        <div style={{ width: 46, height: 46, borderRadius: 6, background: '#F3F4F6', flex: 'none' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{it.name} · {it.size}</div>
        <div style={{ fontSize: 11, color: '#6B7280' }}>SKU: {it.sku || '—'} · Local: {it.qty}</div>
      </div>
      {triage && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 'none' }}>
          {btn('solucionado', 'Solucionado', '#2563EB')}
          {btn('una-unidad', 'Una sola unidad', '#D97706')}
          {btn('no-encuentra', 'No se encuentra', '#DC2626')}
        </div>
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { dispararSyncStock } from '@/lib/sync-gn'
import { cargarUbicaciones, guardarObservacion } from '@/lib/ubicaciones/cliente'
import { cambiosPendientes, filtrar, ubiValido, valorMostrado } from '@/lib/ubicaciones/core'
import type { UbiProducto } from '@/lib/ubicaciones/tipos'

const pendKey = (marca: string) => 'monitor_ubi_pend_' + marca
const espera = (ms: number) => new Promise((res) => setTimeout(res, ms))

/**
 * Ubicaciones (Depósito Minorista, BDI). Carga la ubicación física (NN-N) de cada
 * producto, se guarda en la observación de GN de TODAS sus variantes. Lo tipeado se
 * persiste en localStorage (no se pierde si se refresca antes de Guardar). "Reparar"
 * empareja los productos con variantes desparejas pero con un NN-N dominante. Port
 * de la sección ubicaciones* (index.html:14393-14554).
 */
export function Ubicaciones() {
  const { marca } = useSesion()
  const [data, setData] = useState<UbiProducto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cambios, setCambios] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [soloSin, setSoloSin] = useState(false)
  const [soloRep, setSoloRep] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [reparando, setReparando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [progreso, setProgreso] = useState('')
  const [syncLabel, setSyncLabel] = useState('')
  const [msg, setMsg] = useState('')
  const [tick, setTick] = useState(0)

  const marcaRef = useRef(marca)
  useEffect(() => { marcaRef.current = marca }, [marca])

  const persistirCambios = useCallback((c: Record<string, string>) => {
    try {
      localStorage.setItem(pendKey(marcaRef.current), JSON.stringify(c))
    } catch {
      /* localStorage lleno / bloqueado: no crítico */
    }
  }, [])

  const recargar = () => setTick((t) => t + 1)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setData(null)
      setError(null)
      // Restaurar lo tipeado y no guardado (red de seguridad si se cerró la pestaña).
      let pend: Record<string, string> = {}
      try {
        pend = JSON.parse(localStorage.getItem(pendKey(marca)) || '{}') || {}
      } catch {
        pend = {}
      }
      setCambios(pend)
      try {
        const d = await cargarUbicaciones(marca)
        if (vivo) setData(d)
      } catch (e) {
        if (vivo) {
          setData([])
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    })()
    return () => { vivo = false }
  }, [marca, tick])

  const setUbi = (pid: number | string, val: string) => {
    setCambios((prev) => {
      const next = { ...prev, [String(pid)]: val }
      persistirCambios(next)
      return next
    })
  }

  const flashMsg = (t: string) => {
    setMsg(t)
    setTimeout(() => setMsg(''), 8000)
  }

  const guardar = async () => {
    if (!data) return
    const { validos, invalidos } = cambiosPendientes(data, cambios)
    if (invalidos.length) {
      if (!confirm(`${invalidos.length} producto(s) tienen formato inválido (debe ser número-número, ej: 11-1) y se van a OMITIR.\n\n¿Guardar los ${validos.length} válido(s)?`)) return
    }
    if (!validos.length) {
      alert(invalidos.length ? 'No hay cambios válidos para guardar (revisá el formato número-número, ej: 11-1).' : 'No hay cambios para guardar.')
      return
    }
    if (!invalidos.length && !confirm(`Vas a escribir la ubicación en GN (Deposito Minorista) de ${validos.length} producto(s). ¿Confirmás?`)) return

    setGuardando(true)
    let ok = 0
    let err = 0
    let primerError = ''
    const exitosos: { pid: string; valor: string }[] = []
    for (let i = 0; i < validos.length; i++) {
      const p = validos[i]
      setProgreso(`⏳ ${i + 1}/${validos.length}`)
      const valor = (cambios[String(p.product_id)] || '').trim()
      const r = await guardarObservacion(p.product_id, cambios[String(p.product_id)])
      if (r.ok) {
        ok++
        exitosos.push({ pid: String(p.product_id), valor: valor.slice(0, 20) })
      } else {
        err++
        if (!primerError) primerError = r.error || 'desconocido'
      }
      await espera(250) // pausa entre productos (no saturar GN)
    }
    // Aplicar los éxitos: actual = valor guardado, y sacar de cambios (+ persistir).
    const okPids = new Set(exitosos.map((e) => e.pid))
    const valorPorPid = new Map(exitosos.map((e) => [e.pid, e.valor]))
    setData((prev) => (prev ? prev.map((p) => (okPids.has(String(p.product_id)) ? { ...p, actual: valorPorPid.get(String(p.product_id))! } : p)) : prev))
    setCambios((prev) => {
      const next = { ...prev }
      okPids.forEach((pid) => delete next[pid])
      persistirCambios(next)
      return next
    })
    setGuardando(false)
    setProgreso('')
    flashMsg(`✓ ${ok} guardado${ok === 1 ? '' : 's'}` + (err ? ` · ${err} con error` : ''))
    if (err) alert(`Se guardaron ${ok} y ${err} dieron error.\nMotivo del primero: ${primerError}\n\nLos que fallaron siguen cargados acá — apretá "Guardar cambios" de nuevo para reintentar solo esos.`)
  }

  const reparar = async () => {
    if (!data) return
    const aReparar = data.filter((p) => p.reparable)
    const soloViejo = data.filter((p) => p.malFormato && !p.reparable)
    if (!aReparar.length) {
      alert(soloViejo.length ? `No hay productos auto-reparables.\n\nHay ${soloViejo.length} con formato viejo (sin NN-N): cargales la ubicación a mano (filtro "Solo a reparar").` : 'No hay variantes desparejas para reparar 🎉')
      return
    }
    if (!confirm(`Voy a pisar TODAS las variantes con su ubicación correcta en ${aReparar.length} producto(s) que quedaron desparejos.\n\n` + (soloViejo.length ? `(${soloViejo.length} con formato viejo NO se tocan: cargalos a mano.)\n\n` : '') + '¿Confirmás?')) return

    setReparando(true)
    let ok = 0
    let err = 0
    let primerError = ''
    for (let i = 0; i < aReparar.length; i++) {
      const p = aReparar[i]
      setProgreso(`⏳ ${i + 1}/${aReparar.length}`)
      const r = await guardarObservacion(p.product_id, p.actual)
      if (r.ok) ok++
      else {
        err++
        if (!primerError) primerError = r.error || 'desconocido'
      }
      await espera(300)
    }
    setReparando(false)
    setProgreso('')
    flashMsg(`✓ ${ok} reparado${ok === 1 ? '' : 's'}` + (err ? ` · ${err} con error` : ''))
    recargar() // recargar para reflejar el estado real
    if (err) alert(`Se repararon ${ok} y ${err} dieron error.\nMotivo del primero: ${primerError}\n\nVolvé a apretar "Reparar" para reintentar los que falten.`)
    else alert(`Listo: ${ok} producto(s) reparado(s). Ojo: la lista se recarga con los datos del último sync; si querés verlo al instante tocá "🔄 Traer de GN".`)
  }

  const traerGN = async () => {
    if (sincronizando) return
    setSincronizando(true)
    try {
      const done = await dispararSyncStock(marca, setSyncLabel)
      recargar()
      if (!done) alert('La sincronización con GN tardó más de lo normal. Te muestro lo último disponible.')
    } catch (e) {
      alert('Error: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSincronizando(false)
      setSyncLabel('')
    }
  }

  const ocupado = guardando || reparando || sincronizando
  const lista = data ? filtrar(data, q, soloSin, soloRep, cambios) : []

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#16A34A' }}>{msg || progreso || syncLabel}</span>
          <button className="btn-sm" onClick={recargar} disabled={ocupado} title="Volver a leer la lista">↻ Actualizar lista</button>
          <button className="btn-sm" onClick={traerGN} disabled={ocupado} title="Traé productos/stock nuevos de GN y recargá la lista" style={{ background: '#378ADD', color: '#fff' }}>
            {sincronizando ? '⏳ Trayendo…' : '🔄 Traer de GN'}
          </button>
          <button className="btn-sm" onClick={reparar} disabled={ocupado} title="Pisa todas las variantes con la ubicación correcta (NN-N) en los productos con variantes desparejas" style={{ background: '#B45309', color: '#fff' }}>
            {reparando ? progreso || '⏳ Reparando…' : '🔧 Reparar'}
          </button>
          <button className="btn-sm" onClick={guardar} disabled={ocupado} style={{ background: '#0F766E', color: '#fff' }}>
            {guardando ? progreso || '⏳ Guardando…' : '💾 Guardar cambios'}
          </button>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 10 }}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o SKU..." />
        <label style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} title="Sin ubicación cargada o con formato viejo (hay que cargarla a mano)">
          <input type="checkbox" checked={soloSin} onChange={(e) => setSoloSin(e.target.checked)} /> Solo sin ubicación
        </label>
        <label style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} title="Productos con variantes desparejas que se arreglan solos con 🔧 Reparar">
          <input type="checkbox" checked={soloRep} onChange={(e) => setSoloRep(e.target.checked)} /> Solo a reparar
        </label>
        <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>{data ? `${lista.length} producto${lista.length === 1 ? '' : 's'}` : ''}</span>
      </div>

      <div style={{ overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>SKU</th>
              <th style={{ width: 170 }}>Ubicación</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: '#9CA3AF' }}>{error ? `Error: ${error}` : 'Cargando…'}</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: '#9CA3AF' }}>Sin productos</td></tr>
            ) : (
              lista.map((p) => {
                const val = valorMostrado(p, cambios)
                const c = cambios[String(p.product_id)]
                const changed = c != null && c !== p.actual
                const borde = changed ? '#0F766E' : ubiValido(val) ? '#D1D5DB' : '#DC2626'
                return (
                  <tr key={String(p.product_id)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {p.reparable ? (
                        <div style={{ fontSize: 11, color: '#B45309' }}>⚠ variantes desparejas: {p.valores.join(', ')} · se reparan a <b>{p.actual}</b></div>
                      ) : p.malFormato ? (
                        <div style={{ fontSize: 11, color: '#B45309' }}>⚠ formato viejo ({p.valores.join(', ')}) — cargá la ubicación nueva</div>
                      ) : null}
                    </td>
                    <td style={{ color: '#6B7280' }}>{p.sku}</td>
                    <td>
                      <input
                        type="text"
                        maxLength={20}
                        value={val}
                        onChange={(e) => setUbi(p.product_id, e.target.value)}
                        placeholder="ej: 11-1"
                        title="Formato: número-número (ej. 11-1)"
                        style={{ width: 150, padding: '5px 7px', border: `1px solid ${borde}`, borderRadius: 6, background: changed ? '#ECFDF5' : undefined }}
                      />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

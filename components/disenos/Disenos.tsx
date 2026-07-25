'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { imgAThumb } from '@/lib/imagenes'
import { aplicarTally, contarPorEstado, ordenar, sanearImportado, tallyVotos } from '@/lib/disenos/core'
import { crearRonda, subirImagen, traerBoletas, VOT_PAGE } from '@/lib/disenos/cliente'
import { reporteDecisiones, reporteGaleria, reporteLimpio } from '@/lib/disenos/pdf'
import { DB_ESTADOS, type Diseno, type EstadoDiseno, type OrdenDiseno } from '@/lib/disenos/tipos'
import { borrarDiseno, guardarDisenos, leerDisenos, leerLocales, localesParaImportar } from '@/lib/disenos/persistencia'
import { useSesion } from '@/components/SesionProvider'
import { Button, Notice, color, space, useConfirmar, useToast } from '@/components/ui'
let seq = 0
const newId = () => 'd' + Date.now() + '_' + seq++

export function Disenos() {
  const { confirmar, avisar } = useConfirmar()
  const toast = useToast()
  const { marca } = useSesion()
  // Lo que quedó en ESTE navegador y todavía no está arriba: se ofrece subirlo una vez.
  const [porImportar, setPorImportar] = useState<Diseno[]>([])
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [disenos, setDisenos] = useState<Diseno[]>([])
  const [view, setView] = useState<'kanban' | 'galeria'>('kanban')
  const [orden, setOrden] = useState<OrdenDiseno>('carga')
  const [galFiltro, setGalFiltro] = useState<'todos' | EstadoDiseno>('todos')
  const [vot, setVot] = useState<{ id: string; createdAt: number } | null>(null)
  const [hidratado, setHidratado] = useState(false)

  const [preview, setPreview] = useState<string | null>(null)
  const [votOpen, setVotOpen] = useState(false)
  const [votStatus, setVotStatus] = useState('')
  const [repChooser, setRepChooser] = useState(false)
  const [quickOn, setQuickOn] = useState(false)
  const [quickIndex, setQuickIndex] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // El tablero se lee de la BASE (es compartido). Lo del navegador solo se mira para
  // ofrecer subir lo que haya quedado de la época en que se guardaba local.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      let d: Diseno[] = []
      try {
        d = await leerDisenos(marca)
        if (vivo) setPorImportar(localesParaImportar(leerLocales(), d))
      } catch (e) {
        if (vivo) setErrorCarga(e instanceof Error ? e.message : String(e))
      }
      if (!vivo) return
      setDisenos(d)
      try {
        setView((localStorage.getItem('monitor_db_view') as 'kanban' | 'galeria') || 'kanban')
        setOrden((localStorage.getItem('monitor_db_orden') as OrdenDiseno) || 'carga')
        setVot(JSON.parse(localStorage.getItem('monitor_db_votsession') || 'null'))
      } catch {
        /* defaults */
      }
      setHidratado(true)
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  /**
   * Persistir en la base: SOLO lo que cambió.
   *
   * Se compara contra lo último guardado en vez de mandar el tablero entero (que con las
   * fotos embebidas son megas por vuelta) y así dos personas trabajando a la vez no se
   * pisan: cada una escribe sus diseños. Los borrados se mandan aparte.
   */
  const ultimo = useRef<Map<string, string>>(new Map())
  useEffect(() => {
    if (!hidratado) return
    const previo = ultimo.current
    const ahora = new Map(disenos.map((d) => [String(d.id), JSON.stringify(d)]))
    const cambiados = disenos.filter((d) => previo.get(String(d.id)) !== ahora.get(String(d.id)))
    const borrados = [...previo.keys()].filter((id) => !ahora.has(id))
    ultimo.current = ahora
    if (!cambiados.length && !borrados.length) return
    void (async () => {
      try {
        await guardarDisenos(marca, cambiados)
        for (const id of borrados) await borrarDiseno(marca, id)
      } catch (e) {
        toast.error('No se pudo guardar el tablero: ' + (e instanceof Error ? e.message : String(e)))
      }
    })()
  }, [disenos, hidratado, marca, toast])
  useEffect(() => {
    if (hidratado) try { localStorage.setItem('monitor_db_view', view) } catch {}
  }, [view, hidratado])
  useEffect(() => {
    if (hidratado) try { localStorage.setItem('monitor_db_orden', orden) } catch {}
  }, [orden, hidratado])
  useEffect(() => {
    if (hidratado) try { localStorage.setItem('monitor_db_votsession', JSON.stringify(vot)) } catch {}
  }, [vot, hidratado])

  // ── Acciones sobre diseños ──
  const setCampo = (id: string, campo: 'name' | 'nota', val: string) => setDisenos((ds) => ds.map((d) => (d.id === id ? { ...d, [campo]: val } : d)))
  const votar = (id: string, tipo: 'up' | 'down') => setDisenos((ds) => ds.map((d) => (d.id === id ? { ...d, [tipo]: d[tipo] + 1 } : d)))
  const setEstado = (id: string, estado: EstadoDiseno) => setDisenos((ds) => ds.map((d) => (d.id === id ? { ...d, estado } : d)))
  const quitar = async (id: string) => {
    const ok = await confirmar({ titulo: 'Quitar del tablero', tono: 'danger', ok: 'Quitar', mensaje: 'Se saca este diseño del tablero compartido, para todo el equipo.' })
    if (!ok) return
    setDisenos((ds) => ds.filter((d) => d.id !== id))
  }
  const cargar = (files: FileList | null) => {
    const arr = [...(files || [])].filter((f) => /^image\//.test(f.type))
    arr.forEach((f) => imgAThumb(f, (url) => setDisenos((ds) => [...ds, { id: newId(), name: f.name.replace(/\.[a-z0-9]+$/i, ''), url, nota: '', up: 0, down: 0, estado: 'revisar' }]), 600))
  }
  const limpiar = async () => {
    if (!disenos.length) return
    const ok = await confirmar({
      titulo: 'Vaciar el tablero',
      tono: 'danger',
      ok: `Borrar los ${disenos.length}`,
      mensaje: `Se borran los ${disenos.length} diseños y todos sus votos, para todo el equipo. No se puede deshacer.`,
    })
    if (!ok) return
    setDisenos([])
  }
  const reiniciarVotos = async () => {
    if (!disenos.length) return
    const ok = await confirmar({
      titulo: 'Reiniciar los votos',
      tono: 'warning',
      ok: 'Poner en 0',
      mensaje: 'Los votos 👍/👎 de todos los diseños vuelven a 0. Los diseños quedan.',
    })
    if (!ok) return
    setDisenos((ds) => ds.map((d) => ({ ...d, up: 0, down: 0 })))
  }
  const exportar = async () => {
    if (!disenos.length) return avisar('No hay diseños para exportar.')
    const blob = new Blob([JSON.stringify(disenos)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tablero-disenos-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  const importar = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      let data: unknown
      void (async () => {
        try {
          data = JSON.parse(e.target?.result as string)
        } catch {
          await avisar('El archivo no es válido: no es un respaldo del tablero.')
          return
        }
        const limpio = sanearImportado(data, newId)
        if (!limpio.length) {
          await avisar('El archivo no contiene diseños válidos.')
          return
        }
        if (disenos.length) {
          const ok = await confirmar({
            titulo: 'Reemplazar el tablero',
            tono: 'danger',
            ok: `Reemplazar por ${limpio.length}`,
            mensaje: `El tablero actual tiene ${disenos.length} ${disenos.length === 1 ? 'diseño' : 'diseños'} y se reemplaza por los ${limpio.length} del archivo. Es para todo el equipo.`,
          })
          if (!ok) return
        }
        setDisenos(limpio)
        toast.ok(`${limpio.length} ${limpio.length === 1 ? 'diseño importado' : 'diseños importados'}`)
      })()
    }
    reader.readAsText(file)
  }

  // ── Votación online ──
  const crearVot = async () => {
    if (!disenos.length) return avisar('Cargá diseños primero.')
    if (vot) {
      const ok = await confirmar({
        titulo: 'Crear una ronda nueva',
        tono: 'warning',
        ok: 'Crear ronda nueva',
        mensaje: 'El link anterior deja de sumar votos. Si hay gente votando ahora, esos votos se pierden.',
      })
      if (!ok) return
    }
    setVotStatus('Creando ronda…')
    try {
      const id = await crearRonda(disenos.map((d) => ({ id: d.id, name: d.name })))
      setVot({ id, createdAt: Date.now() })
      for (let i = 0; i < disenos.length; i++) {
        setVotStatus(`Subiendo imágenes… ${i + 1}/${disenos.length}`)
        await subirImagen(id, disenos[i].id, disenos[i].url)
      }
      setVotStatus('✓ Link listo. Compartilo con tu equipo. Cuando voten, tocá "Traer votos".')
    } catch (e) {
      setVotStatus('Error: ' + (e as Error).message)
    }
  }
  const traerVot = async () => {
    if (!vot) return
    setVotStatus('Trayendo votos…')
    try {
      const ballots = await traerBoletas(vot.id)
      setDisenos((ds) => aplicarTally(ds, tallyVotos(ballots)))
      const quienes = ballots.map((b) => b.name || '?').join(', ') || '—'
      setVotStatus(`✓ ${ballots.length} persona(s) votaron: ${quienes}. Los votos del tablero se actualizaron.`)
    } catch (e) {
      setVotStatus('Error: ' + (e as Error).message)
    }
  }

  // ── Revisión rápida ──
  const cola = disenos.filter((d) => d.estado === 'revisar')
  const clasificar = (est: EstadoDiseno) => {
    const d = cola[quickIndex]
    if (!d) return
    setEstado(d.id, est)
    setQuickIndex((i) => Math.min(i, Math.max(0, cola.length - 2)))
  }
  const saltar = () => {
    if (cola.length < 2) return
    setQuickIndex((i) => (i + 1) % cola.length)
  }
  const abrirQuick = async () => {
    if (!disenos.length) return avisar('Cargá diseños primero.')
    if (!cola.length) return avisar('No queda ningún diseño "por revisar".')
    setQuickIndex(0)
    setQuickOn(true)
  }
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!quickOn) return
      if (e.key === 'Escape') return setQuickOn(false)
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === '1') clasificar('rechazado')
      else if (e.key === '2') clasificar('duda')
      else if (e.key === '3') clasificar('confirmado')
      else if (e.key === ' ') { e.preventDefault(); saltar() }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quickOn, cola.length, quickIndex],
  )
  useEffect(() => {
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onKey])

  const genLimpio = async (filtro: EstadoDiseno | 'todos') => {
    setRepChooser(false)
    if (!(await reporteLimpio(disenos, orden, filtro))) toast.aviso('No hay diseños en esa categoría.')
  }

  return (
    <div className="card">
      {errorCarga && (
        <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>
          No se pudo leer el tablero compartido: {errorCarga}. Lo que cargues ahora podría no guardarse — recargá antes de seguir.
        </Notice>
      )}

      {/* El tablero pasó a ser compartido: lo que quedó en este navegador de la época en que
          se guardaba local se ofrece subir una vez. No se borra nada del navegador. */}
      {porImportar.length > 0 && (
        <div style={{ background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 9, padding: '9px 13px', fontSize: 13, color: color.warningInk, marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            El tablero ahora es <b>compartido</b>. En esta computadora {porImportar.length === 1 ? 'quedó 1 diseño' : `quedaron ${porImportar.length} diseños`} que
            todavía no están arriba.
          </span>
          <button
            className="btn-sm"
            style={{ background: color.warningInk, color: '#fff', border: 'none', marginLeft: 'auto' }}
            onClick={() => {
              setDisenos((prev) => [...porImportar, ...prev])
              setPorImportar([])
            }}
          >
            ⬆ Subirlos
          </button>
          <button className="btn-sm" style={{ background: '#fff', border: `1px solid ${color.line2}` }} onClick={() => setPorImportar([])}>
            Ahora no
          </button>
        </div>
      )}

      {/* Jerarquía: cargar imágenes es lo que se hace todos los días; el resto son
          herramientas. Vaciar el tablero —que borra para TODO el equipo— queda separada
          y en rojo, no como un botón más de la fila. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', marginBottom: space[3] }}>
        <Button variant="solid" tone="brand" onClick={() => fileRef.current?.click()}>
          Cargar imágenes
        </Button>
        <Button variant="outline" onClick={() => void abrirQuick()}>
          Revisión rápida
        </Button>
        <Button variant="outline" onClick={() => reporteDecisiones(disenos)} disabled={!disenos.length}>
          Reporte PDF
        </Button>
        <Button variant="outline" onClick={() => reporteGaleria(disenos, orden)} disabled={!disenos.length}>
          Galería PDF
        </Button>
        <Button variant="outline" onClick={() => (disenos.length ? setRepChooser(true) : void avisar('Cargá diseños primero.'))}>
          Solo diseños
        </Button>
        <Button variant="outline" onClick={() => (disenos.length ? setVotOpen(true) : void avisar('Cargá diseños primero.'))}>
          Votación online
        </Button>
        <Button variant="ghost" onClick={() => void exportar()}>
          Exportar
        </Button>
        <Button variant="ghost" onClick={() => importRef.current?.click()}>
          Importar
        </Button>
        <Button variant="ghost" onClick={() => void reiniciarVotos()} disabled={!disenos.length}>
          Reiniciar votos
        </Button>
        <Button variant="ghost" tone="danger" onClick={() => void limpiar()} disabled={!disenos.length} style={{ marginLeft: 'auto' }}>
          Vaciar tablero
        </Button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { cargar(e.target.files); e.target.value = '' }} />
        <input ref={importRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => { importar(e.target.files?.[0]); e.target.value = '' }} />
      </div>

      <div onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = color.brandBg }} onDragLeave={(e) => (e.currentTarget.style.background = '')} onDrop={(e) => { e.preventDefault(); e.currentTarget.style.background = ''; cargar(e.dataTransfer.files) }} onClick={() => fileRef.current?.click()} style={{ marginTop: 12, border: `2px dashed ${color.mut2}`, borderRadius: 10, padding: 14, textAlign: 'center', color: color.mut2, fontSize: 13, cursor: 'pointer' }}>Arrastrá acá las imágenes de los diseños, o tocá para elegirlas 📥</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '12px 0 4px' }}>
        <div style={{ fontSize: 13, color: color.ink2 }}>
          {disenos.length
            ? <><b>{disenos.length}</b> diseños · ✅ {contarPorEstado(disenos, 'confirmado')} · 🤔 {contarPorEstado(disenos, 'duda')} · ❌ {contarPorEstado(disenos, 'rechazado')} · 🕓 {contarPorEstado(disenos, 'revisar')} por revisar</>
            : 'Todavía no cargaste diseños. Soltá las imágenes arriba para empezar. 👆'}
        </div>
        <div style={{ display: 'flex', gap: 6, flex: 'none', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={orden} onChange={(e) => setOrden(e.target.value as OrdenDiseno)} style={{ padding: '6px 8px', fontSize: 12, border: `1px solid ${color.line2}`, borderRadius: 8, cursor: 'pointer' }}>
            <option value="carga">↕ Orden de carga</option>
            <option value="tildes">👍 Top tildes</option>
            <option value="cruces">👎 Top cruces</option>
            <option value="saldo">⚖️ Mejor saldo (👍−👎)</option>
          </select>
          <button onClick={() => setView('kanban')} style={viewBtn(view === 'kanban')}>🗂️ Columnas</button>
          <button onClick={() => setView('galeria')} style={viewBtn(view === 'galeria')}>🖼️ Galería</button>
        </div>
      </div>

      {view === 'galeria' ? (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px' }}>
            <Chip active={galFiltro === 'todos'} onClick={() => setGalFiltro('todos')}>📋 Todas ({disenos.length})</Chip>
            {DB_ESTADOS.map((e) => <Chip key={e.k} active={galFiltro === e.k} onClick={() => setGalFiltro(e.k)}>{e.ico} {e.lbl} ({contarPorEstado(disenos, e.k)})</Chip>)}
          </div>
          {(() => {
            const items = ordenar(galFiltro === 'todos' ? disenos : disenos.filter((d) => d.estado === galFiltro), orden)
            return items.length
              ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>{items.map((d) => <CardGal key={d.id} d={d} onPreview={setPreview} onVoto={votar} onEstado={setEstado} onQuitar={quitar} />)}</div>
              : <div style={{ textAlign: 'center', color: color.mut2, padding: 30 }}>No hay diseños en este filtro.</div>
          })()}
        </>
      ) : (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 6 }}>
          {DB_ESTADOS.map((e) => {
            const items = ordenar(disenos.filter((d) => d.estado === e.k), orden)
            return (
              <div key={e.k} style={{ flex: '1 1 0', minWidth: 210, background: e.bg, border: `1px solid ${color.line}`, borderRadius: 11, padding: 9 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: e.color, marginBottom: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>{e.ico} {e.lbl}</span><span style={{ background: '#fff', border: `1px solid ${color.line}`, borderRadius: 10, padding: '0 7px', fontSize: 11, color: color.ink2 }}>{items.length}</span></div>
                {items.length ? items.map((d) => <Card key={d.id} d={d} onPreview={setPreview} onCampo={setCampo} onVoto={votar} onEstado={setEstado} onQuitar={quitar} />) : <div style={{ fontSize: 11, color: color.mut2, textAlign: 'center', padding: '14px 0' }}>—</div>}
              </div>
            )
          })}
        </div>
      )}

      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 20, cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" style={{ maxWidth: '95%', maxHeight: '95%', borderRadius: 8 }} />
        </div>
      )}

      {repChooser && (
        <Modal onClose={() => setRepChooser(false)} maxWidth={380}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}><div style={{ fontSize: 15, fontWeight: 700 }}>🖼️ Solo diseños</div><button onClick={() => setRepChooser(false)} style={cerrarBtn}>✕</button></div>
          <div style={{ fontSize: 12, color: color.mut, marginBottom: 14 }}>¿Qué diseños querés en el reporte? (solo las imágenes, sin votos)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['confirmado', 'duda', 'rechazado'] as EstadoDiseno[]).map((k) => <button key={k} onClick={() => genLimpio(k)} style={choiceBtn}>{DB_ESTADOS.find((e) => e.k === k)!.ico} {DB_ESTADOS.find((e) => e.k === k)!.lbl} ({contarPorEstado(disenos, k)})</button>)}
            <button onClick={() => genLimpio('todos')} style={choiceBtn}>📋 Todos ({disenos.length})</button>
          </div>
        </Modal>
      )}

      {votOpen && (
        <Modal onClose={() => setVotOpen(false)} maxWidth={480}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><div style={{ fontSize: 16, fontWeight: 700 }}>🌐 Votación online</div><button onClick={() => setVotOpen(false)} style={cerrarBtn}>✕</button></div>
          {!vot ? (
            <>
              <div style={{ fontSize: 13, color: color.ink2, lineHeight: 1.5 }}>Generá un link para que tu equipo vote los <b>{disenos.length}</b> diseños desde el celular. Los votos se juntan acá.</div>
              <button onClick={crearVot} style={{ marginTop: 14, background: color.brandSolid, color: '#fff', width: '100%', padding: 11, borderRadius: 9, fontWeight: 600, cursor: 'pointer', border: 'none' }}>🔗 Crear link de votación</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: color.ink2, marginBottom: 8 }}>Compartí este link con tu equipo:</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input readOnly value={`${VOT_PAGE}?id=${vot.id}`} onClick={(e) => e.currentTarget.select()} style={{ flex: 1, fontSize: 12, padding: 9, border: `1px solid ${color.line2}`, borderRadius: 8 }} />
                <button onClick={() => { navigator.clipboard?.writeText(`${VOT_PAGE}?id=${vot.id}`).then(() => setVotStatus('✓ Link copiado.'), () => setVotStatus('Copialo manualmente.')) }} style={{ background: color.ink, color: '#fff', padding: '0 14px', borderRadius: 8, cursor: 'pointer', border: 'none' }}>Copiar</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={traerVot} style={{ flex: 1, background: color.success, color: '#fff', padding: 11, borderRadius: 9, fontWeight: 600, cursor: 'pointer', border: 'none' }}>📥 Traer votos</button>
                <a href={`${VOT_PAGE}?id=${vot.id}`} target="_blank" rel="noopener noreferrer" style={{ flex: 'none', background: '#fff', border: `1px solid ${color.line2}`, color: color.ink2, padding: '11px 14px', borderRadius: 9, textDecoration: 'none' }}>Ver página</a>
              </div>
              <button onClick={crearVot} style={{ marginTop: 8, background: '#fff', border: `1px solid ${color.line}`, color: color.mut, width: '100%', padding: 8, borderRadius: 9, fontSize: 12, cursor: 'pointer' }}>Crear ronda nueva (reemplaza el link)</button>
            </>
          )}
          <div style={{ fontSize: 12, color: color.mut, marginTop: 12, minHeight: 16, lineHeight: 1.4 }}>{votStatus}</div>
        </Modal>
      )}

      {quickOn && <QuickModal disenos={disenos} cola={cola} index={quickIndex} onClose={() => setQuickOn(false)} onClasificar={clasificar} onSaltar={saltar} onCampo={setCampo} />}
    </div>
  )
}

function Card({ d, onPreview, onCampo, onVoto, onEstado, onQuitar }: { d: Diseno; onPreview: (u: string) => void; onCampo: (id: string, c: 'name' | 'nota', v: string) => void; onVoto: (id: string, t: 'up' | 'down') => void; onEstado: (id: string, e: EstadoDiseno) => void; onQuitar: (id: string) => void }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${color.line}`, borderRadius: 9, padding: 8, marginBottom: 9, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.url} alt="" onClick={() => onPreview(d.url)} style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', background: color.bg2 }} />
      <input defaultValue={d.name} onChange={(e) => onCampo(d.id, 'name', e.target.value)} placeholder="Nombre del diseño" style={{ width: '100%', fontSize: 12, fontWeight: 600, border: 'none', borderBottom: `1px solid ${color.bg2}`, margin: '6px 0 4px', padding: '2px 0', boxSizing: 'border-box' }} />
      <textarea defaultValue={d.nota} onChange={(e) => onCampo(d.id, 'nota', e.target.value)} placeholder="Pros / contras / notas…" style={{ width: '100%', fontSize: 11, color: color.ink2, border: `1px solid ${color.line}`, borderRadius: 6, padding: 5, minHeight: 42, resize: 'vertical', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
        <button onClick={() => onVoto(d.id, 'up')} style={{ flex: 1, padding: '4px 0', fontSize: 12, border: `1px solid ${color.successBorder}`, background: color.successBg, borderRadius: 6, cursor: 'pointer' }}>👍 {d.up}</button>
        <button onClick={() => onVoto(d.id, 'down')} style={{ flex: 1, padding: '4px 0', fontSize: 12, border: `1px solid ${color.dangerBorder}`, background: color.dangerBg, borderRadius: 6, cursor: 'pointer' }}>👎 {d.down}</button>
        <button onClick={() => onQuitar(d.id)} title="Quitar" style={{ padding: '4px 7px', fontSize: 12, border: `1px solid ${color.line}`, background: '#fff', borderRadius: 6, cursor: 'pointer' }}>🗑</button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>{DB_ESTADOS.map((e) => <button key={e.k} onClick={() => onEstado(d.id, e.k)} title={`Mover a ${e.lbl}`} style={{ flex: 1, padding: '3px 0', fontSize: 13, border: `1px solid ${d.estado === e.k ? e.color : color.line}`, background: d.estado === e.k ? e.color : '#fff', borderRadius: 6, cursor: 'pointer' }}>{e.ico}</button>)}</div>
    </div>
  )
}

function CardGal({ d, onPreview, onVoto, onEstado, onQuitar }: { d: Diseno; onPreview: (u: string) => void; onVoto: (id: string, t: 'up' | 'down') => void; onEstado: (id: string, e: EstadoDiseno) => void; onQuitar: (id: string) => void }) {
  const e = DB_ESTADOS.find((x) => x.k === d.estado) || DB_ESTADOS[0]
  return (
    <div style={{ border: `1px solid ${color.line}`, borderTop: `4px solid ${e.color}`, borderRadius: 9, overflow: 'hidden', background: '#fff' }}>
      <div style={{ position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.url} alt="" onClick={() => onPreview(d.url)} style={{ width: '100%', height: 140, objectFit: 'cover', cursor: 'zoom-in', background: color.bg2, display: 'block' }} />
        <button onClick={(ev) => { ev.stopPropagation(); onQuitar(d.id) }} title="Eliminar" style={{ position: 'absolute', top: 5, right: 5, width: 24, height: 24, padding: 0, border: 'none', borderRadius: '50%', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 13, lineHeight: 1, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ padding: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.name}>{d.name || '—'}</div>
        <div style={{ display: 'flex', gap: 5, margin: '4px 0' }}>
          <button onClick={() => onVoto(d.id, 'up')} style={{ flex: 1, padding: '3px 0', fontSize: 11, border: `1px solid ${color.successBorder}`, background: color.successBg, borderRadius: 5, cursor: 'pointer' }}>👍 {d.up}</button>
          <button onClick={() => onVoto(d.id, 'down')} style={{ flex: 1, padding: '3px 0', fontSize: 11, border: `1px solid ${color.dangerBorder}`, background: color.dangerBg, borderRadius: 5, cursor: 'pointer' }}>👎 {d.down}</button>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>{DB_ESTADOS.map((s) => <button key={s.k} onClick={() => onEstado(d.id, s.k)} title={s.lbl} style={{ flex: 1, padding: '2px 0', fontSize: 12, border: `1px solid ${d.estado === s.k ? s.color : color.line}`, background: d.estado === s.k ? s.color : '#fff', borderRadius: 5, cursor: 'pointer' }}>{s.ico}</button>)}</div>
      </div>
    </div>
  )
}

function QuickModal({ disenos, cola, index, onClose, onClasificar, onSaltar, onCampo }: { disenos: Diseno[]; cola: Diseno[]; index: number; onClose: () => void; onClasificar: (e: EstadoDiseno) => void; onSaltar: () => void; onCampo: (id: string, c: 'name' | 'nota', v: string) => void }) {
  const total = disenos.length
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2900, padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        {!cola.length ? (
          <div style={{ background: '#fff', borderRadius: 14, textAlign: 'center', padding: '34px 22px' }}>
            <div style={{ fontSize: 42 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 700, margin: '10px 0 4px' }}>¡Revisaste los {total} diseños!</div>
            <div style={{ color: color.mut, fontSize: 13, marginBottom: 18 }}>No queda ninguno por revisar.</div>
            <button onClick={onClose} style={{ background: '#111', color: '#fff', padding: '10px 22px', borderRadius: 9, cursor: 'pointer', border: 'none' }}>Ver el tablero</button>
          </div>
        ) : (() => {
          const d = cola[Math.min(index, cola.length - 1)]
          return (
            <div style={{ background: '#fff', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: color.mut }}>Faltan <b style={{ color: color.brand }}>{cola.length}</b> por revisar · {total - cola.length}/{total} clasificados</div>
                <button onClick={onClose} style={cerrarBtn}>✕</button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.url} alt="" style={{ width: '100%', maxHeight: '48vh', objectFit: 'contain', borderRadius: 10, background: color.bg }} />
              <input defaultValue={d.name} key={d.id + 'n'} onChange={(e) => onCampo(d.id, 'name', e.target.value)} placeholder="Nombre del diseño" style={{ width: '100%', fontSize: 14, fontWeight: 600, textAlign: 'center', border: 'none', borderBottom: `1px solid ${color.bg2}`, margin: '10px 0', padding: 5, boxSizing: 'border-box' }} />
              <textarea defaultValue={d.nota} key={d.id + 't'} onChange={(e) => onCampo(d.id, 'nota', e.target.value)} placeholder="Nota rápida (opcional)…" style={{ width: '100%', fontSize: 12, border: `1px solid ${color.line}`, borderRadius: 8, padding: 6, minHeight: 32, resize: 'vertical', boxSizing: 'border-box', marginBottom: 11 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onClasificar('rechazado')} style={quickBtn(color.dangerBg, color.danger, color.dangerBorder)}>❌ Rechazar<div style={{ fontSize: 10, fontWeight: 400, opacity: 0.65 }}>tecla 1</div></button>
                <button onClick={() => onClasificar('duda')} style={quickBtn(color.warningBg, color.warning, color.warningBorder)}>🤔 Duda<div style={{ fontSize: 10, fontWeight: 400, opacity: 0.65 }}>tecla 2</div></button>
                <button onClick={() => onClasificar('confirmado')} style={quickBtn(color.successBg, color.success, color.successBorder)}>✅ Confirmar<div style={{ fontSize: 10, fontWeight: 400, opacity: 0.65 }}>tecla 3</div></button>
              </div>
              <button onClick={onSaltar} style={{ width: '100%', marginTop: 8, background: '#fff', color: color.mut, border: `1px solid ${color.line}`, padding: '8px 0', borderRadius: 10, cursor: 'pointer', fontSize: 13 }}>Saltar por ahora → <span style={{ opacity: 0.6 }}>(barra espaciadora)</span></button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function Modal({ children, onClose, maxWidth }: { children: React.ReactNode; onClose: () => void; maxWidth: number }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2950, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, maxWidth, width: '100%', padding: 18 }}>{children}</div>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ padding: '4px 10px', borderRadius: 14, border: `1px solid ${active ? color.brandSolid : color.line}`, background: active ? color.brandBg : '#fff', color: active ? color.brand : color.ink2, fontSize: 12, cursor: 'pointer' }}>{children}</button>
}

function viewBtn(on: boolean): CSSProperties {
  return { padding: '6px 12px', fontSize: 13, borderRadius: 8, cursor: 'pointer', background: on ? color.ink : '#fff', color: on ? '#fff' : color.ink2, border: `1px solid ${on ? color.ink : color.line}` }
}
function quickBtn(bg: string, col: string, bd: string): CSSProperties {
  return { flex: 1, background: bg, color: col, border: `1px solid ${bd}`, padding: '11px 0', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }
}
const cerrarBtn: CSSProperties = { border: 'none', background: color.bg2, borderRadius: 8, padding: '5px 11px', cursor: 'pointer' }
const choiceBtn: CSSProperties = { width: '100%', textAlign: 'left', padding: '11px 14px', border: `1px solid ${color.line}`, borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 14 }

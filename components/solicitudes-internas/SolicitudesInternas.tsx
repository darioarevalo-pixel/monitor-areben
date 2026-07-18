'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { guardarAdminPass, leerAdminPass } from '@/lib/sesion'
import { construirMapaBc } from '@/lib/sesionfotos/escaneo'
import { useSolicitudesInternas, type ResultadoCrear } from './useSolicitudesInternas'
import {
  aprobar as aprobarSol,
  cerrar as cerrarSol,
  escanearDevolucion,
  filtrarHistorial,
  pendientes as pendientesDe,
  puedeDevolver,
  rechazar as rechazarSol,
  unidades,
  type FiltroSI,
} from '@/lib/solicitudes-internas/core'
import {
  draftVacio,
  escanearDraft,
  expandirProductos,
  pidsQueMatchean,
  procesarDraft,
  quitarProd,
  setVarQty,
  toggleVar,
  totalDraft,
  type SIDraft,
} from '@/lib/solicitudes-internas/draft'
import { SI_MOTIVOS, type EstadoSI, type Origen, type SolicitudInterna, type TipoSol } from '@/lib/solicitudes-internas/tipos'
import type { Producto, Variante } from '@/lib/etl/tipos'

type Persistir = (mutar: (l: SolicitudInterna[]) => SolicitudInterna[]) => Promise<boolean>
type CrearVentasDe = (s: SolicitudInterna, cred: { user: string; pass: string }) => Promise<ResultadoCrear>

const nuevoId = () => 'si' + Date.now() + '_' + Math.floor(Math.random() * 100000)
const hoyISO = () => new Date().toISOString().slice(0, 10)

/** Contraseña del Monitor para las ventas: cacheada por el login, o se pide una vez. Port de _getAdminPass. */
function obtenerPass(): string {
  let p = leerAdminPass()
  if (!p) {
    p = (prompt('Ingresá tu contraseña del Monitor (te la pido una sola vez):') || '').trim()
    if (p) guardarAdminPass(p)
  }
  return p
}

export function SolicitudesInternas() {
  const { marca } = useSesion()
  const si = useSolicitudesInternas(marca)
  const { datos } = useDatosMonitor()
  const mapaBc = useMemo(() => construirMapaBc(datos?.allVariantes ?? []), [datos])
  const catalogoListo = !!datos

  if (si.error && !si.data) {
    return (
      <div style={{ padding: 16, color: '#B91C1C', fontSize: 13 }}>
        No se pudo leer el historial de Solicitudes internas: {si.error}
      </div>
    )
  }
  if (!si.data) return <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>

  return (
    <div className="card">
      <div style={{ marginTop: 0 }}>
        <Contenido
          key={marca}
          data={si.data}
          prioridad={si.prioridad}
          persistir={si.persistir}
          crearVentasDe={si.crearVentasDe}
          cerrarAnuladas={si.cerrarAnuladas}
          mapaBc={mapaBc}
          catalogoListo={catalogoListo}
          variantes={datos?.allVariantes ?? []}
          productos={datos?.allProductos ?? []}
        />
      </div>
    </div>
  )
}

function Contenido({
  data,
  prioridad,
  persistir,
  crearVentasDe,
  cerrarAnuladas,
  mapaBc,
  catalogoListo,
  variantes,
  productos,
}: {
  data: SolicitudInterna[]
  prioridad: Origen
  persistir: Persistir
  crearVentasDe: CrearVentasDe
  cerrarAnuladas: () => Promise<number>
  mapaBc: Record<string, string>
  catalogoListo: boolean
  variantes: Variante[]
  productos: Producto[]
}) {
  const { marca, perfil } = useSesion()
  const usuario = perfil?.name || ''
  const esAprobador = esAdmin(perfil) || puedeSub(perfil, marca, 'solicitudes-internas', 'aprobar')

  const [draft, setDraft] = useState<SIDraft | null>(null)
  const [viendo, setViendo] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroSI>('activas')
  const [busqueda, setBusqueda] = useState('')
  const [chequeando, setChequeando] = useState(false)

  const solViendo = viendo ? data.find((s) => s.id === viendo) ?? null : null

  // Al abrir: cierra los retornables cuya venta ya se anuló en GN (como siAbrir → siChequearAnulaciones auto).
  const autoChequeado = useRef(false)
  useEffect(() => {
    if (autoChequeado.current) return
    autoChequeado.current = true
    void cerrarAnuladas()
  }, [cerrarAnuladas])

  // ── Acciones ──
  const onProcesar = async () => {
    if (!draft) return
    const sol = procesarDraft(draft, prioridad, { id: nuevoId(), fecha: hoyISO(), creado: Date.now(), creadoPor: usuario })
    if (!sol) {
      alert('Escaneá o tildá al menos un producto.')
      return
    }
    const ok = await persistir((l) => [sol, ...l])
    if (ok) {
      setDraft(null)
      setViendo(sol.id)
    }
  }

  const onAprobar = (s: SolicitudInterna) => {
    if (!esAprobador) return alert('No tenés permiso para aprobar.')
    void persistir((l) => l.map((x) => (x.id === s.id ? aprobarSol(x, usuario, hoyISO()) : x)))
  }
  const onRechazar = (s: SolicitudInterna) => {
    if (!esAprobador) return alert('No tenés permiso para aprobar.')
    const motivo = (prompt('Motivo del rechazo (opcional):') || '').trim()
    void persistir((l) => l.map((x) => (x.id === s.id ? rechazarSol(x, motivo, usuario, hoyISO()) : x)))
  }
  const onCerrar = (s: SolicitudInterna) => {
    if (!confirm('¿Marcar como cerrada (archivar)? Sale de la lista de activas.')) return
    void persistir((l) => l.map((x) => (x.id === s.id ? cerrarSol(x) : x)))
  }
  const onBorrar = (s: SolicitudInterna) => {
    if (!confirm('¿Eliminar esta solicitud del historial?')) return
    void persistir((l) => l.filter((x) => x.id !== s.id))
    if (viendo === s.id) setViendo(null)
  }

  const onCrearVenta = async (s: SolicitudInterna) => {
    if (!['zattia', 'bdi'].includes(marca)) return alert('Crear ventas en GN es solo para Zattia y BDI.')
    if (s.estado === 'pendiente') return alert('La solicitud tiene que estar aprobada antes de crear la venta.')
    if (s.ventas && !confirm('Esta solicitud ya tiene venta creada. ¿Crear de nuevo? (puede duplicar)')) return
    const pass = obtenerPass()
    if (!pass) return alert('Necesito tu contraseña para crear la venta.')
    const r = await crearVentasDe(s, { user: usuario, pass })
    if (r.tipo === 'no-leido') return alert('No se pudo leer el historial; recargá y probá de nuevo.')
    if (r.tipo === 'ya-tenia') return alert('La solicitud ya tenía venta creada en GN (se evitó el duplicado).')
    if (r.errores.length) alert('No se pudieron crear todas las ventas:\n' + r.errores.join('\n'))
  }

  const onVerificarAnulaciones = async () => {
    setChequeando(true)
    const n = await cerrarAnuladas()
    setChequeando(false)
    alert(n ? `✅ ${n} solicitud(es) cerrada(s) — venta anulada en GN.` : 'Todavía ninguna venta fue anulada en GN.')
  }

  // ── Vistas ──
  if (draft) {
    return (
      <DraftView
        draft={draft}
        setDraft={setDraft}
        mapaBc={mapaBc}
        catalogoListo={catalogoListo}
        variantes={variantes}
        productos={productos}
        total={totalDraft(draft)}
        onProcesar={onProcesar}
        onCancelar={() => setDraft(null)}
      />
    )
  }

  if (solViendo) {
    return (
      <DetalleView
        s={solViendo}
        marca={marca}
        esAprobador={esAprobador}
        mapaBc={mapaBc}
        catalogoListo={catalogoListo}
        persistir={persistir}
        onVolver={() => setViendo(null)}
        onAprobar={onAprobar}
        onRechazar={onRechazar}
        onCerrar={onCerrar}
        onCrearVenta={onCrearVenta}
      />
    )
  }

  const pend = pendientesDe(data)
  const lista = filtrarHistorial(data, filtro, busqueda)
  const hayRetornablesConVenta = data.some((s) => s.tipo === 'retornable' && s.estado !== 'cerrada' && s.ventas && (s.ventas.deposito || s.ventas.local))

  return (
    <div>
      {esAprobador && pend.length > 0 && (
        <div style={{ border: '1px solid #FBBF24', background: '#FFFBEB', borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: '#92400E', marginBottom: 6 }}>
            ⏳ {pend.length} solicitud(es) esperando tu aprobación
          </div>
          {pend.map((s) => (
            <div key={s.id} style={{ borderTop: '1px solid #FDE68A', padding: '8px 0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 600 }}>
                  {s.motivo} <span style={{ color: '#9CA3AF', fontWeight: 400, fontSize: 12 }}>· {s.creadoPor || '—'} · {s.fecha}</span>
                </div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>
                  {unidades(s)} u. · {s.items.length} variantes{s.descripcion ? ` · ${s.descripcion}` : ''} ·{' '}
                  <a onClick={() => setViendo(s.id)} style={{ color: '#2563EB', cursor: 'pointer' }}>ver detalle</a>
                </div>
              </div>
              <button onClick={() => onAprobar(s)} style={btnAprobar}>✅ Aprobar</button>
              <button onClick={() => onRechazar(s)} style={btnRechazar}>✖ Rechazar</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <button className="btn-primary" onClick={() => setDraft(draftVacio(SI_MOTIVOS[0], prioridad))}>+ Nueva solicitud</button>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔎 Buscar motivo, quién pidió…"
          style={{ flex: 1, minWidth: 180, padding: '7px 9px', border: '1px solid #D1D5DB', borderRadius: 7 }}
        />
        {hayRetornablesConVenta && (
          <button
            className="btn-sm"
            onClick={onVerificarAnulaciones}
            title="Consulta en GN si las ventas de los retornables ya se anularon y cierra esas solicitudes"
            style={{ background: '#fff', border: '1px solid #D1D5DB', whiteSpace: 'nowrap' }}
          >
            🔄 Verificar anulaciones
          </button>
        )}
        {chequeando && <span style={{ fontSize: 12, color: '#9CA3AF' }}>⏳ verificando…</span>}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {(['activas', 'pendientes', 'todas'] as FiltroSI[]).map((f) => (
          <button key={f} onClick={() => setFiltro(f)} style={filtroBtn(filtro === f)}>
            {f === 'activas' ? 'Activas' : f === 'pendientes' ? 'Pendientes' : 'Todas'}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: 16, textAlign: 'center' }}>
          No hay solicitudes en este filtro. Tocá &quot;+ Nueva solicitud&quot;.
        </div>
      ) : (
        lista.map((s) => (
          <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid #E5E7EB', borderRadius: 9, padding: '9px 11px', marginBottom: 7, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180, cursor: 'pointer' }} onClick={() => setViendo(s.id)}>
              <div style={{ fontWeight: 600 }}>
                {s.motivo} <BadgeTipo tipo={s.tipo} /> <BadgeEstado estado={s.estado} />
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                {s.fecha} · {s.creadoPor || '—'} · {unidades(s)} u.{s.descripcion ? ` · ${s.descripcion}` : ''}
              </div>
            </div>
            <button className="btn-sm" onClick={() => setViendo(s.id)} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>Ver</button>
            <button onClick={() => onBorrar(s)} title="Eliminar" style={{ border: 'none', background: 'none', color: '#CBD5E1', cursor: 'pointer', fontSize: 15 }}>🗑</button>
          </div>
        ))
      )}
    </div>
  )
}

// ── Borrador ──
function DraftView({
  draft,
  setDraft,
  mapaBc,
  catalogoListo,
  variantes,
  productos,
  total,
  onProcesar,
  onCancelar,
}: {
  draft: SIDraft
  setDraft: (d: SIDraft) => void
  mapaBc: Record<string, string>
  catalogoListo: boolean
  variantes: Variante[]
  productos: Producto[]
  total: number
  onProcesar: () => void
  onCancelar: () => void
}) {
  const [fb, setFb] = useState<{ ok: boolean; msg: string } | null>(null)

  const onScan = (code: string) => {
    const { draft: nd, resultado } = escanearDraft(draft, code, mapaBc, variantes, productos)
    setDraft(nd)
    if (resultado.tipo === 'no-encontrado') setFb({ ok: false, msg: `✗ No encontré ningún producto con el código "${resultado.code}".` })
    else setFb({ ok: true, msg: `✓ ${resultado.nombre} · ${resultado.size} (x${resultado.qty}) → ${resultado.origen === 'local' ? '🏪 Local' : '📦 Depósito'}` })
  }

  const onAgregarBuscar = () => {
    const q = (prompt('Buscar producto por nombre o SKU:') || '').trim()
    if (!q) return
    const pids = pidsQueMatchean(variantes, q)
    if (!pids.length) return alert('No encontré productos con stock para "' + q + '".')
    setDraft(expandirProductos(draft, pids, variantes, productos))
  }

  const tipoBtn = (t: TipoSol, txt: string) => (
    <button onClick={() => setDraft({ ...draft, tipo: t })} style={toggleBtn(draft.tipo === t)}>{txt}</button>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: '#374151' }}>
          Motivo{' '}
          <select value={draft.motivo} onChange={(e) => setDraft({ ...draft, motivo: e.target.value })} style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 7 }}>
            {SI_MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 12, color: '#374151' }}>Tipo:</span> {tipoBtn('retornable', '🔁 Retornable')} {tipoBtn('consumo', '🔥 Consumo')}
      </div>

      {draft.tipo === 'consumo' && (
        <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
          🔥 Consumo: no vuelve y necesita <b>aprobación</b> de un gerente/admin antes de retirarse.
        </div>
      )}

      <input
        value={draft.descripcion}
        onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })}
        placeholder="¿Para qué? (ej. molde falda otoño / video reel funda)"
        style={{ width: '100%', padding: '7px 9px', border: '1px solid #D1D5DB', borderRadius: 7, marginBottom: 10, boxSizing: 'border-box' }}
      />

      <div style={{ border: '1px solid #C7D2FE', background: '#EEF2FF', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>⚡ Cargar por escáner</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#374151' }}>Sacando de:</span>
          <button onClick={() => setDraft({ ...draft, origen: 'deposito' })} style={toggleBtn(draft.origen === 'deposito')}>📦 Depósito</button>
          <button onClick={() => setDraft({ ...draft, origen: 'local' })} style={toggleBtn(draft.origen === 'local')}>🏪 Local</button>
        </div>
        <ScanInput
          disabled={!catalogoListo}
          placeholder={catalogoListo ? '🔫 Escaneá el código de barras…' : 'Cargando catálogo…'}
          onScan={onScan}
        />
        {fb && <div style={{ fontSize: 13, marginTop: 8, color: fb.ok ? '#16A34A' : '#DC2626' }}>{fb.msg}</div>}
      </div>

      <div style={{ marginBottom: 10 }}>
        <button className="btn-sm" onClick={onAgregarBuscar} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>+ Agregar producto (buscar)</button>
      </div>

      {draft.prods.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: '8px 0' }}>Escaneá o agregá productos.</div>
      ) : (
        draft.prods.map((p) => (
          <div key={p.pid} style={{ border: '1px solid #E5E7EB', borderRadius: 9, padding: '9px 11px', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
              <button onClick={() => setDraft(quitarProd(draft, p.pid))} title="Quitar" style={{ border: 'none', background: 'none', color: '#CBD5E1', cursor: 'pointer', fontSize: 15 }}>×</button>
            </div>
            <div style={{ marginTop: 4 }}>
              {p.variantes.map((v) => (
                <label key={v.vid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', fontSize: 13, borderTop: '1px solid #F1F5F9', cursor: 'pointer', fontWeight: v.sel ? 600 : 400 }}>
                  <input type="checkbox" checked={v.sel} onChange={(e) => setDraft(toggleVar(draft, p.pid, v.vid, e.target.checked))} style={{ flex: '0 0 auto' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {v.size}
                    {v.origenManual ? <span style={{ fontSize: 11 }}> {v.origenManual === 'local' ? '🏪' : '📦'}</span> : null}{' '}
                    <span style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 400 }}>(stock {v.local + v.deposito}{v.sku ? ` · ${v.sku}` : ''})</span>
                  </span>
                  {v.sel && (
                    <input
                      type="number"
                      min={1}
                      value={v.qty}
                      onChange={(e) => setDraft(setVarQty(draft, p.pid, v.vid, e.target.value))}
                      style={{ width: 56, textAlign: 'center', border: '1px solid #E5E7EB', borderRadius: 6, padding: '3px 4px', flex: '0 0 auto' }}
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        ))
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={onProcesar}>✓ Crear solicitud ({total} u.)</button>
        <button className="btn-sm" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Detalle ──
function DetalleView({
  s,
  marca,
  esAprobador,
  mapaBc,
  catalogoListo,
  persistir,
  onVolver,
  onAprobar,
  onRechazar,
  onCerrar,
  onCrearVenta,
}: {
  s: SolicitudInterna
  marca: string
  esAprobador: boolean
  mapaBc: Record<string, string>
  catalogoListo: boolean
  persistir: Persistir
  onVolver: () => void
  onAprobar: (s: SolicitudInterna) => void
  onRechazar: (s: SolicitudInterna) => void
  onCerrar: (s: SolicitudInterna) => void
  onCrearVenta: (s: SolicitudInterna) => void
}) {
  const [fb, setFb] = useState<{ origen: Origen; ok: boolean; msg: string } | null>(null)
  const dep = s.items.filter((i) => i.origen === 'deposito')
  const loc = s.items.filter((i) => i.origen === 'local')
  const dev = s.devuelto || {}
  const conf = (vid: string, qty: number) => Math.min(dev[vid] || 0, qty)
  const devolver = puedeDevolver(s)

  const onScan = (origen: Origen, code: string) => {
    const { resultado } = escanearDevolucion(s, origen, code, mapaBc)
    if (resultado.tipo === 'no-encontrado') {
      setFb({ origen, ok: false, msg: `✗ "${resultado.code}" no está en esta lista.` })
      return
    }
    if (resultado.tipo === 'ya-completo') {
      setFb({ origen, ok: false, msg: `⚠ ${resultado.nombre} · ${resultado.variante} ya estaba completo (${resultado.qty}).` })
      return
    }
    setFb({ origen, ok: true, msg: `✓ ${resultado.nombre} · ${resultado.variante} (${resultado.done}/${resultado.qty})` })
    void persistir((l) => l.map((x) => (x.id === s.id ? escanearDevolucion(x, origen, code, mapaBc).sol : x)))
  }

  const grupo = (titulo: string, arr: typeof dep, origen: Origen) => {
    if (!arr.length) return null
    if (!devolver) {
      return (
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{titulo}</div>
          <TablaItems arr={arr} render={(i) => <td style={tdRight}>{i.qty}</td>} headUlt="Cant." />
        </div>
      )
    }
    const totQ = arr.reduce((a, i) => a + i.qty, 0)
    const confTot = arr.reduce((a, i) => a + conf(i.vid, i.qty), 0)
    const completo = confTot >= totQ
    const f = fb && fb.origen === origen ? fb : null
    return (
      <div style={{ border: `1px solid ${completo ? '#A7F3D0' : '#E5E7EB'}`, borderRadius: 9, padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ fontWeight: 700 }}>
          {titulo} <span style={{ color: '#9CA3AF', fontWeight: 500, fontSize: 12 }}>({confTot}/{totQ} devueltos)</span>
          {completo ? <span style={{ color: '#16A34A', fontWeight: 700 }}> ✓ completo</span> : null}
        </div>
        <div style={{ margin: '8px 0' }}>
          <ScanInput disabled={!catalogoListo} placeholder={catalogoListo ? '🔫 Escaneá lo que vuelve…' : 'Cargando catálogo…'} onScan={(v) => onScan(origen, v)} />
        </div>
        {f && <div style={{ fontSize: 13, marginBottom: 6, color: f.ok ? '#16A34A' : f.msg.startsWith('⚠') ? '#D97706' : '#DC2626' }}>{f.msg}</div>}
        <TablaItems
          arr={arr}
          headUlt="Devuelto/Ped."
          rowBg={(i) => (conf(i.vid, i.qty) >= i.qty ? '#F0FDF4' : undefined)}
          nombrePref={(i) => (conf(i.vid, i.qty) >= i.qty ? '✅ ' : '⬜ ')}
          render={(i) => <td style={tdRight}>{conf(i.vid, i.qty)}/{i.qty}</td>}
        />
      </div>
    )
  }

  const ventasHtml = s.ventas ? (
    <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 9, padding: '9px 12px', marginBottom: 10, fontSize: 13 }}>
      ✅ Venta en GN:{' '}
      {(['deposito', 'local'] as Origen[]).filter((o) => s.ventas![o]).map((o) => (
        <span key={o}>{o === 'deposito' ? '📦' : '🏪'} N° <b>{String(s.ventas![o]!.number || s.ventas![o]!.id || '?')}</b>{' '}</span>
      ))}
      {s.tipo === 'consumo'
        ? <span style={{ color: '#991B1B' }}>· baja definitiva (no se anula)</span>
        : <span style={{ color: '#9CA3AF', fontSize: 11 }}>· cuando vuelva todo, anulá la venta en GN y se cierra sola</span>}
    </div>
  ) : s.estado === 'aprobada' && ['zattia', 'bdi'].includes(marca) ? (
    <div style={{ marginBottom: 10 }}>
      <button className="btn-primary" onClick={() => onCrearVenta(s)}>🧾 Crear venta en GN (descontar stock)</button>
    </div>
  ) : s.estado === 'pendiente' ? (
    <div style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 10 }}>Esperando aprobación para poder crear la venta.</div>
  ) : null

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <button className="btn-sm" onClick={onVolver} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>← Volver</button>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{s.motivo}</div> <BadgeTipo tipo={s.tipo} /> <BadgeEstado estado={s.estado} />
        <span style={{ color: '#9CA3AF', fontSize: 12, marginLeft: 'auto' }}>{s.fecha} · {s.creadoPor || '—'}</span>
      </div>

      {s.descripcion && <div style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>{s.descripcion}</div>}

      {s.estado === 'rechazada' && (
        <div style={{ fontSize: 12, color: '#991B1B', background: '#FEE2E2', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
          ✖ Rechazada por {s.aprobadoPor || '—'}{s.rechazadoMotivo ? ` — "${s.rechazadoMotivo}"` : ''}
        </div>
      )}
      {s.aprobadoPor && s.estado !== 'rechazada' && s.estado !== 'pendiente' && (
        <div style={{ fontSize: 12, color: '#065F46', marginBottom: 10 }}>
          ✅ Aprobada por {s.aprobadoPor}{s.aprobadoFecha ? ` · ${s.aprobadoFecha}` : ''}
        </div>
      )}

      {s.estado === 'pendiente' && esAprobador && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button onClick={() => onAprobar(s)} style={btnAprobarGrande}>✅ Aprobar</button>
          <button onClick={() => onRechazar(s)} style={btnRechazarGrande}>✖ Rechazar</button>
        </div>
      )}

      {s.estado !== 'pendiente' && s.estado !== 'rechazada' && ventasHtml}

      {s.tipo === 'consumo' && s.estado === 'retirada' && (
        <div style={{ marginBottom: 10 }}>
          <button className="btn-sm" onClick={() => onCerrar(s)} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>✓ Cerrar (archivar)</button>{' '}
          <span style={{ color: '#9CA3AF', fontSize: 12 }}>Ya está descontado; archivala para sacarla de &quot;Activas&quot;.</span>
        </div>
      )}

      {grupo('📦 Depósito', dep, 'deposito')}
      {grupo('🏪 Local', loc, 'local')}
    </div>
  )
}

// ── Piezas compartidas ──
function TablaItems({
  arr,
  render,
  headUlt,
  rowBg,
  nombrePref,
}: {
  arr: SolicitudInterna['items']
  render: (i: SolicitudInterna['items'][number]) => ReactNode
  headUlt: string
  rowBg?: (i: SolicitudInterna['items'][number]) => string | undefined
  nombrePref?: (i: SolicitudInterna['items'][number]) => string
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left' }}>
          <th style={th}>Producto</th>
          <th style={th}>Variante</th>
          <th style={th}>SKU</th>
          <th style={{ ...th, textAlign: 'right' }}>{headUlt}</th>
        </tr>
      </thead>
      <tbody>
        {arr.map((i) => (
          <tr key={i.vid} style={{ background: rowBg?.(i) }}>
            <td style={td}>{nombrePref?.(i) || ''}{i.nombre}</td>
            <td style={td}>{i.variante}</td>
            <td style={{ ...td, color: '#6B7280' }}>{i.sku || '—'}</td>
            {render(i)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BadgeEstado({ estado }: { estado: EstadoSI }) {
  const m: Record<EstadoSI, [string, string, string]> = {
    pendiente: ['#92400E', '#FEF3C7', '⏳ Pendiente'],
    aprobada: ['#1D4ED8', '#DBEAFE', 'Aprobada'],
    retirada: ['#065F46', '#D1FAE5', 'Retirada'],
    devuelta: ['#065F46', '#D1FAE5', 'Devuelta'],
    cerrada: ['#374151', '#E5E7EB', '✅ Cerrada'],
    rechazada: ['#991B1B', '#FEE2E2', '✖ Rechazada'],
  }
  const [c, b, t] = m[estado] || m.aprobada
  return <span style={{ background: b, color: c, borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{t}</span>
}

function BadgeTipo({ tipo }: { tipo: TipoSol }) {
  return tipo === 'consumo' ? (
    <span style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>🔥 Consumo</span>
  ) : (
    <span style={{ background: '#D1FAE5', color: '#065F46', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>🔁 Retornable</span>
  )
}

/** Input de escaneo: al Enter dispara onScan con el valor y limpia el campo. */
function ScanInput({ disabled, placeholder, onScan }: { disabled: boolean; placeholder: string; onScan: (v: string) => void }) {
  return (
    <input
      disabled={disabled}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          const v = e.currentTarget.value
          e.currentTarget.value = ''
          onScan(v)
        }
      }}
      style={{ width: '100%', maxWidth: 340, padding: '9px 12px', border: `2px solid ${disabled ? '#E5E7EB' : '#378ADD'}`, borderRadius: 8, fontSize: 15, boxSizing: 'border-box', background: disabled ? '#F9FAFB' : '#fff' }}
    />
  )
}

// ── Estilos ──
const th: CSSProperties = { padding: '3px 6px' }
const td: CSSProperties = { padding: '3px 6px', borderTop: '1px solid #F1F5F9' }
const tdRight: CSSProperties = { padding: '3px 6px', borderTop: '1px solid #F1F5F9', textAlign: 'right', fontWeight: 600 }

function toggleBtn(active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? '#378ADD' : '#D1D5DB'}`,
    background: active ? '#378ADD' : '#fff',
    color: active ? '#fff' : '#374151',
    borderRadius: 8,
    padding: '5px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  }
}
function filtroBtn(active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? '#378ADD' : '#D1D5DB'}`,
    background: active ? '#378ADD' : '#fff',
    color: active ? '#fff' : '#374151',
    borderRadius: 8,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  }
}
const btnAprobar: CSSProperties = { border: '1px solid #A7F3D0', background: '#ECFDF5', color: '#065F46', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnRechazar: CSSProperties = { border: '1px solid #FCA5A5', background: '#fff', color: '#DC2626', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }
const btnAprobarGrande: CSSProperties = { ...btnAprobar, padding: '8px 16px' }
const btnRechazarGrande: CSSProperties = { ...btnRechazar, padding: '8px 14px' }

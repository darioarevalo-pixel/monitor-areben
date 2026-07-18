'use client'

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { useCupones } from './useCupones'
import { crearCupon, descuento, dias, filtrar, mensajeRecordatorio } from '@/lib/cupones/core'
import type { Cupon, EstadoCupon, FiltroCupon } from '@/lib/cupones/tipos'

const hoyISO = () => new Date().toISOString().slice(0, 10)
const nuevoId = () => 'c' + Date.now() + '_' + Math.floor(Math.random() * 100000)

const BADGES: Record<EstadoCupon, [string, string, string]> = {
  vigente: ['#065F46', '#D1FAE5', 'Vigente'],
  porvencer: ['#92400E', '#FEF3C7', 'Por vencer'],
  vencido: ['#991B1B', '#FEE2E2', 'Vencido'],
  usado: ['#374151', '#E5E7EB', 'Usado'],
  anulado: ['#6B7280', '#F3F4F6', 'Anulado'],
}

export function Cupones() {
  const { marca, perfil } = useSesion()
  const usuario = perfil?.name || ''
  const puedeCrear = puedeSub(perfil, marca, 'cupones', 'crear') // puedeSub ya devuelve true para admin
  const admin = esAdmin(perfil)
  const cup = useCupones(marca)

  const [form, setForm] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroCupon>('vigentes')

  const hoy = hoyISO()
  const data = useMemo(() => cup.data ?? [], [cup.data])
  const lista = useMemo(() => filtrar(data, filtro, busqueda, hoy), [data, filtro, busqueda, hoy])
  const porVencerN = useMemo(() => data.filter((c) => filtrar([c], 'porvencer', '', hoy).length).length, [data, hoy])

  const onCrear = async (datos: Parameters<typeof crearCupon>[0]) => {
    const r = crearCupon(datos, { id: nuevoId(), hoy, usuario })
    if (!r.ok) {
      alert(r.error)
      return
    }
    const ok = await cup.persistir((l) => [r.cupon, ...l])
    if (ok) setForm(false)
  }
  const mutar = (id: string, fn: (c: Cupon) => Cupon) => cup.persistir((l) => l.map((c) => (c.id === id ? fn(c) : c)))
  const onMarcarUsado = (id: string) => void mutar(id, (c) => ({ ...c, usado: true, usadoFecha: hoy }))
  const onDesmarcarUsado = (id: string) => void mutar(id, (c) => ({ ...c, usado: false, usadoFecha: '' }))
  const onAnular = (id: string) => {
    if (!puedeCrear || !confirm('¿Anular este cupón?')) return
    void mutar(id, (c) => ({ ...c, anulado: true }))
  }
  const onReactivar = (id: string) => {
    if (!puedeCrear) return
    void mutar(id, (c) => ({ ...c, anulado: false }))
  }
  const onBorrar = (id: string) => {
    if (!admin) {
      alert('Solo un administrador puede borrar cupones.')
      return
    }
    if (!confirm('¿Borrar este cupón de la lista?')) return
    void cup.persistir((l) => l.filter((c) => c.id !== id))
  }
  const onRecordar = async (c: Cupon) => {
    try {
      await navigator.clipboard.writeText(mensajeRecordatorio(c))
      alert('📋 Mensaje copiado. Pegalo en WhatsApp.')
    } catch {
      prompt('Copiá el mensaje:', mensajeRecordatorio(c))
    }
  }

  return (
    <div className="card">
      <div style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          {puedeCrear ? (
            <button className="btn-primary" onClick={() => setForm((v) => !v)}>➕ Generar cupón</button>
          ) : (
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>Buscá el cupón del cliente y confirmá el uso. (Generar cupones: solo con permiso.)</span>
          )}
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="🔎 Buscar por nombre o código…"
            style={{ flex: 1, minWidth: 200, padding: '7px 9px', border: '1px solid #D1D5DB', borderRadius: 7 }}
          />
        </div>

        {form && puedeCrear && <FormNuevo usuario={usuario} onCrear={onCrear} onCancelar={() => setForm(false)} />}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <FiltroBtn f="vigentes" actual={filtro} onClick={setFiltro}>Vigentes</FiltroBtn>
          <FiltroBtn f="porvencer" actual={filtro} onClick={setFiltro}>Por vencer{porVencerN ? ` (${porVencerN})` : ''}</FiltroBtn>
          <FiltroBtn f="usados" actual={filtro} onClick={setFiltro}>Usados</FiltroBtn>
          <FiltroBtn f="vencidos" actual={filtro} onClick={setFiltro}>Vencidos</FiltroBtn>
          <FiltroBtn f="todos" actual={filtro} onClick={setFiltro}>Todos</FiltroBtn>
        </div>

        {lista.length ? (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left', background: '#F9FAFB' }}>
                  <th style={th}>Cliente</th>
                  <th style={th}>Descuento</th>
                  <th style={th}>Vence</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Motivo / código</th>
                  <th style={th}>Generó</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {lista.map(({ c, e }) => {
                  const venceTxt = c.vence ? c.vence.split('-').reverse().join('/') : '—'
                  const d = dias(c.vence, hoy)
                  return (
                    <tr key={c.id} style={{ background: e === 'porvencer' ? '#FFFBEB' : undefined }}>
                      <td style={{ ...td, fontWeight: 600 }}>
                        {c.nombre}
                        {c.telefono && <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 400 }}>{c.telefono}</div>}
                      </td>
                      <td style={{ ...td, fontWeight: 700 }}>
                        {descuento(c)}
                        {(+(c.minimo || 0) > 0) && <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 400 }}>desde ${Math.round(+(c.minimo || 0)).toLocaleString('es-AR')}</div>}
                      </td>
                      <td style={td}>
                        {venceTxt}
                        {e === 'porvencer' && d != null && <div style={{ fontSize: 11, color: '#B45309' }}>{d <= 0 ? 'vence hoy' : `en ${d}d`}</div>}
                      </td>
                      <td style={td}><Badge e={e} /></td>
                      <td style={{ ...td, color: '#6B7280' }}>
                        {c.motivo || '—'}
                        {c.codigo && <span style={{ color: '#9CA3AF' }}> · {c.codigo}</span>}
                        {!c.unSoloUso && <span style={{ color: '#9CA3AF' }}> · reutilizable</span>}
                      </td>
                      <td style={{ ...td, color: '#9CA3AF', fontSize: 11 }}>{c.creadoPor || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          {c.unSoloUso && (e === 'vigente' || e === 'porvencer') && (
                            <button onClick={() => onMarcarUsado(c.id)} title="Marcar como usado" style={btnUsado}>✔ Usado</button>
                          )}
                          {e === 'usado' && (
                            <button onClick={() => onDesmarcarUsado(c.id)} title="Deshacer usado" style={btnGris}>↺</button>
                          )}
                          {(e === 'porvencer' || e === 'vigente') && (
                            <button onClick={() => onRecordar(c)} title="Copiar recordatorio para WhatsApp" style={btnGris}>📋 Recordar</button>
                          )}
                          {puedeCrear && (c.anulado
                            ? <button onClick={() => onReactivar(c.id)} title="Reactivar" style={btnGris}>Reactivar</button>
                            : <button onClick={() => onAnular(c.id)} title="Anular" style={{ border: 'none', background: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 13 }}>✕</button>)}
                          {admin && (
                            <button onClick={() => onBorrar(c.id)} title="Borrar (solo admin)" style={{ border: 'none', background: 'none', color: '#CBD5E1', cursor: 'pointer', fontSize: 14 }}>🗑</button>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: '#9CA3AF', fontSize: 13, padding: 16, textAlign: 'center' }}>
            No hay cupones en este filtro. Tocá &quot;➕ Generar cupón&quot; para crear uno.
          </div>
        )}
      </div>
    </div>
  )
}

function FormNuevo({ usuario, onCrear, onCancelar }: { usuario: string; onCrear: (d: Parameters<typeof crearCupon>[0]) => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [tipo, setTipo] = useState('porcentaje')
  const [valor, setValor] = useState('')
  const [vence, setVence] = useState('')
  const [minimo, setMinimo] = useState('')
  const [codigo, setCodigo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [por, setPor] = useState(usuario)
  const [unSoloUso, setUnSoloUso] = useState(true)

  return (
    <div style={{ border: '1px solid #C7D2FE', background: '#EEF2FF', borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Nuevo cupón</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
        <label style={lbl}>Nombre y apellido *<input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Ana Pérez" style={inp} /></label>
        <label style={lbl}>Teléfono (opcional)<input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Para recordarle" style={inp} /></label>
        <label style={lbl}>Descuento *
          <span style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ padding: 6, border: '1px solid #D1D5DB', borderRadius: 6 }}>
              <option value="porcentaje">%</option>
              <option value="monto">$</option>
            </select>
            <input value={valor} onChange={(e) => setValor(e.target.value)} type="number" min={1} placeholder="15" style={{ flex: 1, minWidth: 0, padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, boxSizing: 'border-box' }} />
          </span>
        </label>
        <label style={lbl}>Vale hasta *<input value={vence} onChange={(e) => setVence(e.target.value)} type="date" style={inp} /></label>
        <label style={lbl}>Compra mínima (opcional)<input value={minimo} onChange={(e) => setMinimo(e.target.value)} type="number" min={0} placeholder="0" style={inp} /></label>
        <label style={lbl}>Código (opcional)<input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej: ANA15" style={inp} /></label>
        <label style={lbl}>Motivo (opcional)<input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Reactivación, cumpleaños…" style={inp} /></label>
        <label style={lbl}>Generado por<input value={por} onChange={(e) => setPor(e.target.value)} style={inp} /></label>
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 8 }}>
        <input type="checkbox" checked={unSoloUso} onChange={(e) => setUnSoloUso(e.target.checked)} /> Un solo uso (se marca como usado al aplicarlo)
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn-primary" onClick={() => onCrear({ nombre, telefono, tipo, valor, codigo, minimo, motivo, unSoloUso, vence, creadoPor: por })}>✓ Guardar cupón</button>
        <button className="btn-sm" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

function Badge({ e }: { e: EstadoCupon }) {
  const [col, bg, txt] = BADGES[e] || BADGES.vigente
  return <span style={{ background: bg, color: col, borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{txt}</span>
}

function FiltroBtn({ f, actual, onClick, children }: { f: FiltroCupon; actual: FiltroCupon; onClick: (f: FiltroCupon) => void; children: ReactNode }) {
  const on = actual === f
  return (
    <button
      onClick={() => onClick(f)}
      style={{ border: `1px solid ${on ? '#378ADD' : '#D1D5DB'}`, background: on ? '#378ADD' : '#fff', color: on ? '#fff' : '#374151', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
    >
      {children}
    </button>
  )
}

const th: CSSProperties = { padding: '6px 8px' }
const td: CSSProperties = { padding: '6px 8px', borderTop: '1px solid #F1F5F9' }
const lbl: CSSProperties = { fontSize: 12, color: '#374151' }
const inp: CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, marginTop: 2, boxSizing: 'border-box' }
const btnUsado: CSSProperties = { border: '1px solid #A7F3D0', background: '#ECFDF5', color: '#065F46', borderRadius: 6, padding: '2px 8px', fontSize: 12, cursor: 'pointer' }
const btnGris: CSSProperties = { border: '1px solid #D1D5DB', background: '#fff', color: '#6B7280', borderRadius: 6, padding: '2px 8px', fontSize: 12, cursor: 'pointer' }

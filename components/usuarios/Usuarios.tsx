'use client'

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, FUNCIONES, type Funcion } from '@/lib/permisos'
import { guardarAdminPass, guardarConfigAdmin, leerAdminPass, traerConfigAdmin } from '@/lib/sesion'
import { PERM_CAT, type Marca } from '@/lib/nav'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { normalizar, nuevoUsuario, tienePermiso, toggleFuncion, togglePerm, validar } from '@/lib/usuarios/core'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'

/** Contraseña de admin: cacheada por el login, o se pide una vez. */
function obtenerPass(): string {
  let p = leerAdminPass()
  if (!p) {
    p = (prompt('Ingresá tu contraseña de administrador (te la pido una sola vez):') || '').trim()
    if (p) guardarAdminPass(p)
  }
  return p
}

type Estado = { msg: string; color: string } | null

/**
 * Gestión de usuarios y permisos (solo admin). Port de la sección usuarios* del
 * legacy (index.html:9417-9512). Pide la config COMPLETA (admin-gated), la edita en
 * una copia local, y guarda todo junto. La lógica (toggle padre/sub, validación) va
 * en lib/usuarios/core.
 */
export function Usuarios() {
  const { perfil } = useSesion()
  const admin = esAdmin(perfil)
  const [users, setUsers] = useState<UsuarioConfig[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Estado>(null)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setUsers(null)
      setError(null)
      const r = await traerConfigAdmin<UsuarioConfig>(perfil?.name || '', obtenerPass())
      if (!vivo) return
      if (r.ok) setUsers(r.users.map(normalizar))
      else {
        if (r.prohibido) guardarAdminPass('')
        setError(r.error)
      }
    })()
    return () => {
      vivo = false
    }
  }, [perfil, tick])

  if (!admin) return <div style={{ padding: 16, color: '#9CA3AF' }}>Solo un administrador puede gestionar usuarios.</div>

  const mut = (i: number, fn: (u: UsuarioConfig) => UsuarioConfig) => setUsers((prev) => (prev ? prev.map((u, j) => (j === i ? fn(u) : u)) : prev))
  const onCampo = (i: number, campo: 'name' | 'pass', val: string) => mut(i, (u) => ({ ...u, [campo]: val }))
  const onAdmin = (i: number, val: boolean) => mut(i, (u) => ({ ...u, admin: val }))
  const onCuenta = (i: number, val: string) => mut(i, (u) => ({ ...u, cuenta: (val || null) as Marca | null }))
  const onPerm = (i: number, brand: Marca, key: string, val: boolean) => mut(i, (u) => togglePerm(u, brand, key, val))
  const onFuncion = (i: number, f: Funcion, val: boolean) => mut(i, (u) => toggleFuncion(u, f, val))
  const agregar = () =>
    setUsers((prev) => {
      const next = [...(prev || []), nuevoUsuario()]
      setAbierto(next.length - 1)
      return next
    })
  const eliminar = (i: number) => {
    if (!users || !confirm(`¿Eliminar al usuario "${users[i].name || '(sin nombre)'}"?`)) return
    setUsers((prev) => (prev ? prev.filter((_, j) => j !== i) : prev))
    setAbierto(null)
  }

  const guardar = async () => {
    if (!users) return
    const err = validar(users)
    if (err) {
      setStatus({ msg: '⚠️ ' + err, color: '#DC2626' })
      return
    }
    setGuardando(true)
    setStatus({ msg: 'Guardando…', color: '#6B7280' })
    const r = await guardarConfigAdmin(perfil?.name || '', obtenerPass(), users)
    setGuardando(false)
    if (r.ok) setStatus({ msg: '✓ Guardado. Los cambios ya aplican para todos.', color: '#16A34A' })
    else {
      if (r.prohibido) guardarAdminPass('')
      setStatus({ msg: 'Error: ' + r.error, color: '#DC2626' })
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button className="btn-sm" onClick={agregar} style={{ background: '#378ADD', color: '#fff' }}>+ Usuario</button>
        <button className="btn-sm" onClick={guardar} disabled={guardando || !users} style={{ background: '#16A34A', color: '#fff' }}>💾 Guardar cambios</button>
        <button className="btn-sm" onClick={() => setTick((t) => t + 1)} style={{ background: '#fff', border: '1px solid #D1D5DB' }} title="Volver a leer la configuración">↻ Recargar</button>
        {status && <span style={{ fontSize: 12, color: status.color }}>{status.msg}</span>}
      </div>

      {!users ? (
        <div style={{ padding: 16, color: error ? '#DC2626' : '#9CA3AF' }}>
          {error ? `No se pudo leer la configuración: ${error}` : 'Cargando configuración…'}
        </div>
      ) : (
        users.map((u, i) => (
          <UsuarioCard
            key={i}
            u={u}
            i={i}
            abierto={abierto === i}
            onToggleOpen={() => setAbierto((a) => (a === i ? null : i))}
            onCampo={onCampo}
            onAdmin={onAdmin}
            onCuenta={onCuenta}
            onPerm={onPerm}
            onFuncion={onFuncion}
            onEliminar={() => eliminar(i)}
          />
        ))
      )}
    </div>
  )
}

function UsuarioCard({
  u,
  i,
  abierto,
  onToggleOpen,
  onCampo,
  onAdmin,
  onCuenta,
  onPerm,
  onFuncion,
  onEliminar,
}: {
  u: UsuarioConfig
  i: number
  abierto: boolean
  onToggleOpen: () => void
  onCampo: (i: number, campo: 'name' | 'pass', val: string) => void
  onAdmin: (i: number, val: boolean) => void
  onCuenta: (i: number, val: string) => void
  onPerm: (i: number, brand: Marca, key: string, val: boolean) => void
  onFuncion: (i: number, f: Funcion, val: boolean) => void
  onEliminar: () => void
}) {
  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, marginBottom: 8 }}>
      <div onClick={onToggleOpen} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 12px' }}>
        <div>
          <b>{u.name || '(nuevo usuario)'}</b>{' '}
          {u.admin && <span style={{ fontSize: 11, background: '#111827', color: '#fff', borderRadius: 10, padding: '1px 7px' }}>admin</span>}{' '}
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{u.cuenta ? '· solo ' + u.cuenta : '· BDI + Zattia'}</span>
        </div>
        <span style={{ color: '#9CA3AF' }}>{abierto ? '▴' : '▾'}</span>
      </div>

      {abierto && (
        <div style={{ padding: '0 12px 12px' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', margin: '6px 0 14px' }}>
            <label style={{ fontSize: 12, color: '#6B7280' }}>
              Usuario
              <input value={u.name} onChange={(e) => onCampo(i, 'name', e.target.value)} style={campoInput} />
            </label>
            <label style={{ fontSize: 12, color: '#6B7280' }}>
              Contraseña
              <input value={u.pass} onChange={(e) => onCampo(i, 'pass', e.target.value)} style={campoInput} />
            </label>
            <label style={{ fontSize: 12, color: '#6B7280' }}>
              Marca
              <select value={u.cuenta || ''} onChange={(e) => onCuenta(i, e.target.value)} style={campoInput}>
                <option value="">BDI + Zattia</option>
                <option value="bdi">Solo BDI</option>
                <option value="zattia">Solo Zattia</option>
              </select>
            </label>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="checkbox" checked={u.admin} onChange={(e) => onAdmin(i, e.target.checked)} /> Administrador (ve todo)
            </label>
          </div>

          {/* Funciones (rol de flujo de trabajo): definen qué parte de las Solicitudes ve cada uno. */}
          <div style={{ margin: '0 0 14px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, color: '#6B7280', marginBottom: 5 }}>
              Función
              <InfoPopover titulo="Función del usuario">
                Rol de flujo de trabajo (además de los permisos). Define qué parte de una Solicitud ve cada uno:
                Local ve lo de retirar en local, Depósito lo de preparar, Marketing la solicitud completa, Dirección
                todo (su Inicio no arranca con las fotos para armar). Un usuario puede tener varias.
              </InfoPopover>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {FUNCIONES.map((f) => (
                <label key={f.key} style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }} title={f.info}>
                  <input type="checkbox" checked={!!u.funcion?.includes(f.key)} onChange={(e) => onFuncion(i, f.key, e.target.checked)} /> {f.label}
                </label>
              ))}
            </div>
          </div>

          {u.admin ? (
            <div style={{ fontSize: 12, color: '#6B7280', padding: '8px 0' }}>Es administrador: ve todas las secciones de las dos marcas y puede gestionar usuarios.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#9CA3AF', fontSize: 11 }}>
                  <th style={{ textAlign: 'left' }}>Sección</th>
                  <th style={{ width: 60 }}>BDI</th>
                  <th style={{ width: 60 }}>Zattia</th>
                </tr>
              </thead>
              <tbody>
                {PERM_CAT.map((sec) => (
                  <FilaPermiso key={sec.key} u={u} i={i} label={sec.label} info={sec.info} claveKey={sec.key} brands={sec.brands} onPerm={onPerm}>
                    {(sec.subs || []).map((sub) => (
                      <FilaPermiso
                        key={sec.key + '.' + sub.key}
                        u={u}
                        i={i}
                        label={'↳ ' + sub.label}
                        info={sub.info}
                        claveKey={sec.key + '.' + sub.key}
                        brands={sub.brands || sec.brands}
                        sub
                        onPerm={onPerm}
                      />
                    ))}
                  </FilaPermiso>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 12 }}>
            <button className="btn-sm" onClick={onEliminar} style={{ background: '#fff', color: '#DC2626', border: '1px solid #FCA5A5', fontSize: 12 }}>🗑 Eliminar usuario</button>
          </div>
        </div>
      )}
    </div>
  )
}

function FilaPermiso({
  u,
  i,
  label,
  info,
  claveKey,
  brands,
  sub,
  onPerm,
  children,
}: {
  u: UsuarioConfig
  i: number
  label: string
  info?: string
  claveKey: string
  brands: Marca[]
  sub?: boolean
  onPerm: (i: number, brand: Marca, key: string, val: boolean) => void
  children?: React.ReactNode
}) {
  const celda = (brand: Marca) =>
    brands.includes(brand) ? (
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={tienePermiso(u, brand, claveKey)} disabled={u.admin} onChange={(e) => onPerm(i, brand, claveKey, e.target.checked)} />
      </td>
    ) : (
      <td style={{ textAlign: 'center', color: '#D1D5DB' }}>—</td>
    )
  return (
    <>
      <tr style={sub ? { color: '#6B7280' } : { borderTop: '1px solid #F1F5F9' }}>
        <td style={{ padding: sub ? '3px 4px 3px 22px' : '5px 4px', fontSize: sub ? 12 : 13 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {label}
            {info && <InfoPopover titulo={label.replace(/^↳ /, '')}>{info}</InfoPopover>}
          </span>
        </td>
        {celda('bdi')}
        {celda('zattia')}
      </tr>
      {children}
    </>
  )
}

const campoInput: React.CSSProperties = { display: 'block', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 7, marginTop: 3 }

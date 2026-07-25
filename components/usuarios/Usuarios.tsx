'use client'

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, funcionQueDa, FUNCIONES, type Funcion } from '@/lib/permisos'
import { guardarAdminPass, guardarConfigAdmin, leerAdminPass, traerConfigAdmin } from '@/lib/sesion'
import { NAV_CATS, PERM_CAT, type Marca } from '@/lib/nav'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { copiarPermisos, normalizar, nuevoUsuario, origenPermiso, tienePermiso, toggleFuncion, togglePerm, validar } from '@/lib/usuarios/core'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'
import { useConfirmar } from '@/components/ui'

/**
 * Las secciones agrupadas por ÁREA, en el orden del menú. La lista plana de 35 filas
 * sin jerarquía era el reclamo concreto: no se sabía a qué sector correspondía cada
 * permiso, así que dar de alta a alguien era ir tildando de memoria.
 */
const AREAS = NAV_CATS.map((c) => ({
  id: c.id,
  label: c.label,
  secciones: PERM_CAT.filter((p) => p.area === c.id),
})).filter((a) => a.secciones.length > 0)

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
  const { confirmar } = useConfirmar()
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
  const onPermArea = (i: number, brand: Marca, keys: string[], val: boolean) =>
    mut(i, (u) => keys.reduce((acc, k) => togglePerm(acc, brand, k, val), u))
  const onCopiar = (i: number, origen: Marca, destino: Marca) => mut(i, (u) => copiarPermisos(u, origen, destino))
  const onFuncion = (i: number, f: Funcion, val: boolean) => mut(i, (u) => toggleFuncion(u, f, val))
  const agregar = () =>
    setUsers((prev) => {
      const next = [...(prev || []), nuevoUsuario()]
      setAbierto(next.length - 1)
      return next
    })
  const eliminar = async (i: number) => {
    if (!users) return
    const ok = await confirmar({
      titulo: 'Eliminar el usuario',
      tono: 'danger',
      ok: 'Eliminar',
      mensaje: `"${users[i].name || '(sin nombre)'}" pierde el acceso al monitor. Si está trabajando ahora, se le corta.`,
    })
    if (!ok) return
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

      {/* Config aparece dentro de las dos marcas, pero la lista de usuarios es UNA sola:
          el endpoint no recibe marca. Lo que sí es por marca son los permisos de cada uno. */}
      <div style={{ fontSize: 12, color: '#6B7280', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 11px', marginBottom: 12 }}>
        Esta configuración es <b>única para las dos marcas</b>: entres desde BDI o desde Zattia, editás la misma
        lista de usuarios. Lo que se define por marca son los permisos de cada uno (las columnas BDI y Zattia).
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
            onPermArea={onPermArea}
            onCopiar={onCopiar}
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
  onPermArea,
  onCopiar,
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
  onPermArea: (i: number, brand: Marca, keys: string[], val: boolean) => void
  onCopiar: (i: number, origen: Marca, destino: Marca) => void
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
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#6B7280' }}>Permisos por marca</span>
                <InfoPopover titulo="Permisos, funciones y excepciones">
                  Lo que trae puesto la <b>función</b> aparece tildado y en gris: no hace falta marcarlo, y una
                  sección nueva de esa área la hereda sola. Si destildás algo que viene por función, queda como
                  <b> excepción</b> (en rojo) para esa persona y esa marca. Los sub-permisos (aplicar un ajuste,
                  crear cupones) nunca vienen por función: se tildan siempre a mano.
                </InfoPopover>
                <button className="btn-sm" onClick={() => onCopiar(i, 'bdi', 'zattia')} style={{ background: '#fff', border: '1px solid #D1D5DB', marginLeft: 'auto' }}>
                  Copiar BDI → Zattia
                </button>
                <button className="btn-sm" onClick={() => onCopiar(i, 'zattia', 'bdi')} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
                  Copiar Zattia → BDI
                </button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: '#9CA3AF', fontSize: 11 }}>
                    <th style={{ textAlign: 'left' }}>Sección</th>
                    <th style={{ width: 60 }}>BDI</th>
                    <th style={{ width: 60 }}>Zattia</th>
                  </tr>
                </thead>
                <tbody>
                  {AREAS.map((area) => (
                    <Area key={area.id} area={area} u={u} i={i} onPerm={onPerm} onPermArea={onPermArea} />
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div style={{ marginTop: 12 }}>
            <button className="btn-sm" onClick={onEliminar} style={{ background: '#fff', color: '#DC2626', border: '1px solid #FCA5A5', fontSize: 12 }}>🗑 Eliminar usuario</button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Un área del menú con sus secciones. El tilde del encabezado marca/desmarca el área
 * entera para esa marca — el alta de alguien pasa de 35 clics a uno por sector.
 */
function Area({
  area,
  u,
  i,
  onPerm,
  onPermArea,
}: {
  area: (typeof AREAS)[number]
  u: UsuarioConfig
  i: number
  onPerm: (i: number, brand: Marca, key: string, val: boolean) => void
  onPermArea: (i: number, brand: Marca, keys: string[], val: boolean) => void
}) {
  const celdaArea = (brand: Marca) => {
    const keys = area.secciones.filter((s) => s.brands.includes(brand)).map((s) => s.key)
    if (!keys.length) return <td key={brand} style={{ textAlign: 'center', color: '#D1D5DB' }}>—</td>
    const todas = keys.every((k) => tienePermiso(u, brand, k))
    return (
      <td key={brand} style={{ textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={todas}
          title={todas ? `Sacarle todo ${area.label}` : `Darle todo ${area.label}`}
          onChange={(e) => onPermArea(i, brand, keys, e.target.checked)}
        />
      </td>
    )
  }
  return (
    <>
      <tr style={{ background: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
        <td style={{ padding: '6px 4px', fontSize: 12, fontWeight: 700, color: '#374151' }}>{area.label}</td>
        {celdaArea('bdi')}
        {celdaArea('zattia')}
      </tr>
      {area.secciones.map((sec) => (
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
    </>
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
  const celda = (brand: Marca) => {
    if (!brands.includes(brand)) return <td key={brand} style={{ textAlign: 'center', color: '#D1D5DB' }}>—</td>
    const origen = origenPermiso(u, brand, claveKey)
    const f = origen === 'funcion' ? funcionQueDa(u, claveKey) : null
    const titulo =
      origen === 'funcion'
        ? `Lo trae la función ${FUNCIONES.find((x) => x.key === f)?.label ?? f}. Destildalo para hacerle una excepción.`
        : origen === 'excluido'
          ? `Su función se lo daría, pero se lo quitaron para ${brand === 'bdi' ? 'BDI' : 'Zattia'}.`
          : undefined
    return (
      <td key={brand} style={{ textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={tienePermiso(u, brand, claveKey)}
          disabled={u.admin}
          title={titulo}
          onChange={(e) => onPerm(i, brand, claveKey, e.target.checked)}
          style={origen === 'funcion' ? { accentColor: '#9CA3AF' } : origen === 'excluido' ? { outline: '1.5px solid #FCA5A5', borderRadius: 3 } : undefined}
        />
      </td>
    )
  }
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

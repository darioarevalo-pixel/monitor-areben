'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esDeMarca, labelDe, NAV_CATS, type Marca } from '@/lib/nav'
import { esAdmin, puedeCambiarMarca, puedeVer } from '@/lib/permisos'
import { CUENTAS } from '@/lib/cuentas'

/** Labels de las keys que no están en PERM_CAT (ver KEYS_SIN_PERMISO). */
const LABELS_EXTRA: Record<string, string> = {
  inicio: '🏠 Inicio',
  usuarios: '👤 Usuarios',
}

function label(key: string): string {
  return LABELS_EXTRA[key] ?? labelDe(key)
}

export function Sidebar({ activa }: { activa: string }) {
  const { perfil, marca, setMarca, salir } = useSesion()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [menuMarca, setMenuMarca] = useState(false)

  if (!perfil) return null

  // Mismo criterio que aplicarVisibilidadTabs + renderNav del legacy: una sección
  // se ve si es de esta marca Y el perfil tiene permiso.
  const cats = NAV_CATS.map((cat) => {
    if (cat.adminOnly && !esAdmin(perfil)) return null
    const keys = cat.keys.filter((k) => {
      if (!esDeMarca(k, marca)) return false
      if (k === 'usuarios') return esAdmin(perfil)
      if (k === 'inicio') return true
      return puedeVer(perfil, marca, k)
    })
    return keys.length ? { ...cat, keys } : null
  }).filter((c): c is NonNullable<typeof c> => c !== null)

  const grupoActivo = cats.find((c) => c.keys.includes(activa))?.id ?? null

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        Monitor<span>AREBEN SRL</span>
      </div>

      {puedeCambiarMarca(perfil) ? (
        <div className="empresa-switcher">
          <button className="empresa-btn" onClick={() => setMenuMarca((v) => !v)}>
            <span style={{ fontWeight: 600 }}>{CUENTAS[marca].nombre}</span>
            <span style={{ opacity: 0.6, marginLeft: 'auto' }}>▾</span>
          </button>
          <div className={`empresa-menu${menuMarca ? ' open' : ''}`}>
            <div
              style={{
                fontSize: 10,
                color: '#9CA3AF',
                textTransform: 'uppercase',
                letterSpacing: '.04em',
                padding: '4px 10px 6px',
              }}
            >
              Cambiar marca
            </div>
            {(Object.keys(CUENTAS) as Marca[]).map((k) => (
              <button
                key={k}
                className={`empresa-opt${marca === k ? ' active' : ''}`}
                onClick={() => {
                  setMarca(k)
                  setMenuMarca(false)
                }}
              >
                {CUENTAS[k].nombre}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="empresa-fija">{CUENTAS[marca].nombre}</div>
      )}

      <nav className="side-nav">
        <div className="nav-bar">
          {cats.map((cat) => {
            const open = (abierto ?? grupoActivo) === cat.id
            return (
              <div key={cat.id} className={`nav-group${open ? ' open' : ''}`}>
                <button
                  className={`nav-cat${cat.keys.includes(activa) ? ' active' : ''}`}
                  onClick={() => setAbierto(open ? '' : cat.id)}
                >
                  {cat.label}
                  <span className="nav-caret">▾</span>
                </button>
                <div className="nav-menu">
                  {cat.keys.map((k) => (
                    <Link
                      key={k}
                      href={`/${k}`}
                      className={`nav-opt${k === activa ? ' active' : ''}${
                        cat.accent === 'marketing' ? ' nav-accent-mkt' : ''
                      }`}
                    >
                      {label(k)}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </nav>

      <div className="sidebar-foot">
        <div className="user-foot">
          <span className="side-user">{perfil.name}</span>
          <button
            className="side-salir"
            onClick={() => {
              if (confirm('¿Cerrar sesión?')) salir()
            }}
          >
            Salir
          </button>
        </div>
      </div>
    </aside>
  )
}

'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esDeMarca, grupoParaSeccion, keysDeCat, labelConEmoji, NAV_CATS, type Marca, type NavGrupo } from '@/lib/nav'
import { esAdmin, puedeCambiarMarca, puedeVer } from '@/lib/permisos'
import { CUENTAS } from '@/lib/cuentas'

/** Label del menú (con emoji): LABELS_EXTRA (inicio/usuarios) o el de PERM_CAT. */
function label(key: string): string {
  return labelConEmoji(key)
}

/** Grupos homónimos con un solo destino: se muestran como ítem directo (sin doble clic). */
const APLANAR = new Set(['inicio', 'clientes'])

export function Sidebar({ activa }: { activa: string }) {
  const { perfil, marca, setMarca, salir } = useSesion()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [menuMarca, setMenuMarca] = useState(false)

  if (!perfil) return null

  // Mismo criterio que aplicarVisibilidadTabs + renderNav del legacy: una sección
  // se ve si es de esta marca Y el perfil tiene permiso.
  const visible = (k: string) => {
    if (!esDeMarca(k, marca)) return false
    if (k === 'usuarios') return esAdmin(perfil)
    if (k === 'inicio') return true
    return puedeVer(perfil, marca, k)
  }

  // Una sección que cuelga de varios sectores (`solicitudes`) se muestra UNA sola vez, en
  // el grupo que le corresponde a esta persona (ver `grupoParaSeccion`). Sin esto, quien ve
  // todo la encontraba repetida en cuatro grupos y al abrirla se marcaban los cuatro.
  const gruposDe = (k: string) => NAV_CATS.filter((c) => keysDeCat(c).includes(k)).map((c) => c.id)
  const duenio = (k: string) => grupoParaSeccion(k, gruposDe(k), perfil.funcion ?? [])
  const visibleEn = (k: string, catId: string) => visible(k) && duenio(k) === catId

  // Un subgrupo (2º nivel, ej. Local > Actividades) se filtra igual que el grupo y
  // desaparece entero si no queda ninguna sección visible adentro.
  const cats = NAV_CATS.map((cat) => {
    if (cat.adminOnly && !esAdmin(perfil)) return null
    const keys = cat.keys.filter((k) => visibleEn(k, cat.id))
    const grupos = (cat.grupos ?? [])
      .map((g) => ({ ...g, keys: g.keys.filter((k) => visibleEn(k, cat.id)) }))
      .filter((g) => g.keys.length > 0)
    return keys.length || grupos.length ? { ...cat, keys, grupos } : null
  }).filter((c): c is NonNullable<typeof c> => c !== null)

  const tieneActiva = (c: (typeof cats)[number]) =>
    c.keys.includes(activa) || c.grupos.some((g) => g.keys.includes(activa))
  const grupoActivo = cats.find(tieneActiva)?.id ?? null

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
            // Grupo de un solo destino homónimo: un ítem que navega directo, sin expand.
            if (APLANAR.has(cat.id) && cat.keys.length === 1) {
              const k = cat.keys[0]
              return (
                <div key={cat.id} className="nav-group">
                  <Link
                    href={`/${k}`}
                    className={`nav-cat${k === activa ? ' active' : ''}`}
                  >
                    {cat.label}
                  </Link>
                </div>
              )
            }
            const open = (abierto ?? grupoActivo) === cat.id
            const opt = (k: string) => (
              <Link
                key={k}
                href={`/${k}`}
                className={`nav-opt${k === activa ? ' active' : ''}${
                  cat.accent === 'marketing' ? ' nav-accent-mkt' : ''
                }`}
              >
                {cat.labels?.[k] ?? label(k)}
              </Link>
            )
            return (
              <div key={cat.id} className={`nav-group${open ? ' open' : ''}`}>
                <button
                  className={`nav-cat${tieneActiva(cat) ? ' active' : ''}`}
                  onClick={() => setAbierto(open ? '' : cat.id)}
                >
                  {cat.label}
                  <span className="nav-caret">▾</span>
                </button>
                <div className="nav-menu">
                  {cat.keys.map(opt)}
                  {cat.grupos.map((g) => (
                    <Subgrupo key={g.id} grupo={g} activa={activa}>
                      {g.keys.map(opt)}
                    </Subgrupo>
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

/**
 * Un subgrupo del menú (3er nivel). Arranca CERRADO salvo que la sección activa esté
 * adentro: existe justamente para sacar de la vista lo esporádico —los conteos, el
 * chequeo de exhibición— sin esconderlo. El estado es local al subgrupo, así abrir uno
 * no cierra al otro.
 */
function Subgrupo({ grupo, activa, children }: { grupo: NavGrupo; activa: string; children: React.ReactNode }) {
  const tieneActiva = grupo.keys.includes(activa)
  const [abierto, setAbierto] = useState<boolean | null>(null)
  const open = abierto ?? tieneActiva

  return (
    <div className={`nav-sub${open ? ' open' : ''}`}>
      <button className="nav-sub-cat" onClick={() => setAbierto(!open)}>
        {grupo.label}
        <span className="nav-caret">▾</span>
      </button>
      <div className="nav-sub-menu">{children}</div>
    </div>
  )
}

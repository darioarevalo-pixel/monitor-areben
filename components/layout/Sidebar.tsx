'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esDeMarca, labelConEmoji, NAV_CATS, type Marca, type NavGrupo, type NavItem } from '@/lib/nav'
import { esAdmin, puedeCambiarMarca, puedeSub, puedeVer } from '@/lib/permisos'
import { CUENTAS } from '@/lib/cuentas'

/** Label del menú (con emoji): LABELS_EXTRA (inicio/usuarios) o el de PERM_CAT. */
function label(key: string): string {
  return labelConEmoji(key)
}

/**
 * ¿Esta entrada de subárea es la que se está viendo? Se compara contra la ruta completa
 * (`/tncat/visibilidad`), no solo la sección: si no, las cuatro herramientas de Tienda Nube
 * se marcarían activas a la vez, que es el mismo error que tuvimos con Solicitudes.
 */
function rutaActiva(it: NavItem, activa: string, sub?: string | null): boolean {
  return it.ruta === `/${activa}${sub ? `/${sub}` : ''}`
}

/** Grupos homónimos con un solo destino: se muestran como ítem directo (sin doble clic). */
const APLANAR = new Set(['inicio', 'clientes'])

export function Sidebar({ activa, sub }: { activa: string; sub?: string | null }) {
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

  // Un subgrupo (2º nivel, ej. Local > Actividades) se filtra igual que el grupo y
  // desaparece entero si no queda ninguna sección visible adentro.
  const cats = NAV_CATS.map((cat) => {
    if (cat.adminOnly && !esAdmin(perfil)) return null
    const keys = cat.keys.filter(visible)
    const grupos = (cat.grupos ?? [])
      .map((g) => ({
        ...g,
        keys: g.keys.filter(visible),
        items: (g.items ?? []).filter((it) => {
          if (!visible(it.key)) return false
          if (!it.sub) return true
          // La herramienta se ve si tiene alguno de sus sub-permisos (Categorías por modelo
          // es de BDI y la asignación por Excel de Zattia: la entrada es la misma).
          const subs = Array.isArray(it.sub) ? it.sub : [it.sub]
          return esAdmin(perfil) || subs.some((s) => puedeSub(perfil, marca, it.key, s))
        }),
      }))
      .filter((g) => g.keys.length > 0 || g.items.length > 0)
    return keys.length || grupos.length ? { ...cat, keys, grupos } : null
  }).filter((c): c is NonNullable<typeof c> => c !== null)

  const contieneActiva = (c: (typeof cats)[number]) =>
    c.keys.includes(activa) || c.grupos.some((g) => g.keys.includes(activa) || g.items.some((it) => it.key === activa))

  /**
   * UN grupo activo, no todos los que contengan la sección.
   *
   * `solicitudes` cuelga de cuatro sectores a propósito —cada uno la llama a su manera— y
   * eso hacía que al abrirla se pintaran los cuatro en azul a la vez. El resaltado sigue al
   * grupo que la persona tiene ABIERTO; si no abrió ninguno, al primero que la contiene.
   */
  const grupoActivo = (() => {
    const abiertoConActiva = cats.find((c) => c.id === abierto && contieneActiva(c))
    return (abiertoConActiva ?? cats.find(contieneActiva))?.id ?? null
  })()

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
                  className={`nav-cat${grupoActivo === cat.id ? ' active' : ''}`}
                  onClick={() => setAbierto(open ? '' : cat.id)}
                >
                  {cat.label}
                  <span className="nav-caret">▾</span>
                </button>
                <div className="nav-menu">
                  {cat.keys.map(opt)}
                  {cat.grupos.map((g) => (
                    <Subgrupo key={g.id} grupo={g} activa={activa} sub={sub}>
                      {g.keys.map(opt)}
                      {(g.items ?? []).map((it) => (
                        <Link
                          key={it.ruta + it.label}
                          href={it.ruta}
                          className={`nav-opt${rutaActiva(it, activa, sub) ? ' active' : ''}${cat.accent === 'marketing' ? ' nav-accent-mkt' : ''}`}
                        >
                          {it.label}
                        </Link>
                      ))}
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
function Subgrupo({ grupo, activa, sub, children }: { grupo: NavGrupo; activa: string; sub?: string | null; children: React.ReactNode }) {
  const tieneActiva = grupo.keys.includes(activa) || (grupo.items ?? []).some((it) => rutaActiva(it, activa, sub))
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

'use client'

import { useParams, useRouter } from 'next/navigation'
import { createElement, useEffect } from 'react'
import { LoginScreen } from '@/components/LoginScreen'
import { Sidebar } from '@/components/layout/Sidebar'
import { SeccionHeader } from '@/components/layout/SeccionHeader'
import { useSesion } from '@/components/SesionProvider'
import { componenteDe } from '@/components/secciones/registro'
import { esDeMarca, esKeyValida } from '@/lib/nav'
import { esAdmin, puedeVer } from '@/lib/permisos'

/** Sección por defecto: la misma que abre el legacy hoy (_currentTabId, index.html:6525). */
const DEFAULT_TAB = 'productos'
/**
 * Rescate cuando la sección no está permitida (o el default `productos` no lo ve este
 * usuario). `inicio` no requiere permiso (KEYS_SIN_PERMISO) → visible para todos, así
 * que nunca cae en blanco. Antes el guard `key !== DEFAULT_TAB` dejaba a un usuario sin
 * `productos` (p.ej. función Local) en una página en blanco: caía en el default, que no
 * podía ver, y no redirigía por ser el default.
 */
const FALLBACK_TAB = 'inicio'

export default function Seccion() {
  const params = useParams()
  const router = useRouter()
  const { perfil, marca, cargando } = useSesion()

  const partes = params.seccion
  const key = Array.isArray(partes) ? partes[0] : (partes ?? DEFAULT_TAB)

  // Si la sección no existe para esta marca o no hay permiso, al default.
  // Mismo criterio que aplicarVisibilidadTabs del legacy.
  const permitida =
    !!perfil &&
    esKeyValida(key) &&
    esDeMarca(key, marca) &&
    (key === 'usuarios' ? esAdmin(perfil) : key === 'inicio' || puedeVer(perfil, marca, key))

  useEffect(() => {
    if (!cargando && perfil && !permitida && key !== FALLBACK_TAB) router.replace(`/${FALLBACK_TAB}`)
  }, [cargando, perfil, permitida, key, router])

  if (cargando) return <div className="login-screen" />
  if (!perfil) return <LoginScreen />
  if (!permitida) return <div className="login-screen" />

  // createElement y no <Seccion />: la regla "Cannot create components during
  // render" no puede saber que `componenteDe` devuelve una referencia estable de
  // un objeto de módulo y no un componente nuevo por render. Acá no hay ambigüedad.
  //
  // Hasta jul-2026, una key sin componente caía al iframe legacy. Cerrado el
  // strangler, el legacy ya no existe: una key válida SIEMPRE tiene componente, así
  // que un `null` acá es un bug de registro (key en el nav sin línea en SECCIONES) y
  // se dice, en vez de quedar en blanco. El test `registro` lo cubre.
  const seccion = componenteDe(key)

  return (
    <div className="shell">
      <Sidebar activa={key} sub={Array.isArray(partes) ? partes[1] : null} />
      <div className="shell-main">
        <div className="shell-content">
          <div className="seccion-pad">
            {seccion ? (
              <>
                <SeccionHeader seccion={key} />
                {createElement(seccion)}
              </>
            ) : (
              <div className="card" style={{ color: '#B45309' }}>
                La sección <b>{key}</b> está en el menú pero no tiene pantalla asociada. Avisá que
                falta registrarla.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

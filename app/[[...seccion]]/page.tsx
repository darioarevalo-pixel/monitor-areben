'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createElement, useEffect, useState } from 'react'
import { useAvisosPoll } from '@/components/layout/useAvisosPoll'
import { LoginScreen } from '@/components/LoginScreen'
import { Sidebar } from '@/components/layout/Sidebar'
import { SeccionHeader } from '@/components/layout/SeccionHeader'
import { AccionesProvider } from '@/components/layout/acciones'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/Confirm'
import { useSesion } from '@/components/SesionProvider'
import { componenteDe } from '@/components/secciones/registro'
import { esDeMarca, esKeyValida, tituloDesde } from '@/lib/nav'
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
  // De qué sector se entró. Una sección puede colgar de varios (Solicitudes cuelga de
  // cuatro) y el encabezado tiene que decir el correcto, no el primero de la lista.
  const grupo = useSearchParams().get('g')
  const { perfil, marca, cargando } = useSesion()
  // Cajón del sidebar en móvil. Vive acá porque lo abren dos lugares (el botón de la
  // topbar y la tapa oscura) y lo cierra un tercero (navegar a una sección).
  const [menuAbierto, setMenuAbierto] = useState(false)

  // El refresco de avisos vive acá y no en una sección: el contador del sidebar tiene que
  // encenderse estés donde estés. Se llama antes de cualquier return temprano (regla de hooks).
  useAvisosPoll()

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
    <ToastProvider>
      <ConfirmProvider>
        <div className="shell">
          <Sidebar
            activa={key}
            sub={Array.isArray(partes) ? partes[1] : null}
            grupoUrl={grupo}
            abierto={menuAbierto}
            onNavegar={() => setMenuAbierto(false)}
          />
          {menuAbierto && <div className="sidebar-tapa" onClick={() => setMenuAbierto(false)} />}
          <div className="shell-main">
            {/* Topbar: solo existe abajo de 900px (la regla vive en globals.css). Es la
                puerta al menú cuando el sidebar se convirtió en cajón. */}
            <div className="shell-topbar">
              <button className="shell-burger" onClick={() => setMenuAbierto(true)} aria-label="Abrir el menú">
                ☰
              </button>
              <span className="shell-topbar-marca">Monitor</span>
              <span className="shell-topbar-seccion">· {tituloDesde(key, grupo)}</span>
            </div>
            <div className="shell-content">
              <div className="seccion-pad">
                {seccion ? (
                  <AccionesProvider>
                    <SeccionHeader seccion={key} grupo={grupo} />
                    {createElement(seccion)}
                  </AccionesProvider>
                ) : (
                  <div className="mo-card" style={{ padding: 20, color: 'var(--mo-warning)' }}>
                    La sección <b>{key}</b> está en el menú pero no tiene pantalla asociada. Avisá que
                    falta registrarla.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}

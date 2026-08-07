'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createElement, useEffect, useState } from 'react'
import { useAvisosPoll } from '@/components/layout/useAvisosPoll'
import { LoginScreen } from '@/components/LoginScreen'
import { ReclamoPublico } from '@/components/reclamos/ReclamoPublico'
import { CanjePortal } from '@/components/canjes/CanjePortal'
import { LegalPublico } from '@/components/legal/LegalPublico'
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

  /**
   * Los links públicos (`/reclamo/<token>` para el cliente, `/canje/<token>` para la creadora) NO
   * son secciones del monitor: no están en el nav, no tienen permiso y los abre gente sin cuenta.
   * Hay que sacarlos del camino ANTES del guard de secciones y también del efecto que redirige — si
   * no, a cualquiera con sesión abierta el shell lo manda a Inicio antes de que llegue a verlos.
   *
   * `/legal/<pagina>` va por el mismo camino, y por un motivo más fuerte todavía: las páginas
   * legales las tiene que poder abrir un revisor de Meta **sin cuenta**, y una política de
   * privacidad detrás de un login no es una política de privacidad.
   */
  const esPortalCliente = key === 'reclamo' || key === 'canje' || key === 'legal'

  // Si la sección no existe para esta marca o no hay permiso, al default.
  // Mismo criterio que aplicarVisibilidadTabs del legacy.
  const permitida =
    !!perfil &&
    esKeyValida(key) &&
    esDeMarca(key, marca) &&
    (key === 'usuarios' ? esAdmin(perfil) : key === 'inicio' || puedeVer(perfil, marca, key))

  useEffect(() => {
    if (esPortalCliente) return
    if (!cargando && perfil && !permitida && key !== FALLBACK_TAB) router.replace(`/${FALLBACK_TAB}`)
  }, [cargando, perfil, permitida, key, router, esPortalCliente])

  // Va acá adentro y NO como ruta propia de Next porque cada ruta es una función serverless y el
  // proyecto está en el tope del plan Hobby (pasarse frena todos los deploys en silencio). Sale
  // antes del gate de login a propósito: se defiende con el token, no con la sesión.
  if (esPortalCliente) {
    const token = Array.isArray(partes) ? partes[1] ?? null : null
    if (key === 'legal') return <LegalPublico pagina={token} />
    return key === 'canje' ? <CanjePortal token={token} /> : <ReclamoPublico token={token} />
  }

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

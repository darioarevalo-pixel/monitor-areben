'use client'

import { useParams, useRouter } from 'next/navigation'
import { createElement, useEffect } from 'react'
import { LegacyFrame } from '@/components/legacy/LegacyFrame'
import { LoginScreen } from '@/components/LoginScreen'
import { Sidebar } from '@/components/layout/Sidebar'
import { SeccionHeader } from '@/components/layout/SeccionHeader'
import { useSesion } from '@/components/SesionProvider'
import { componenteDe, componenteSombraDe } from '@/components/secciones/registro'
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

  // Estar en el registro ES el interruptor del strangler: si la sección tiene
  // componente, la sirve el shell; si no, sigue viniendo del legacy embebido.
  //
  // `/<seccion>/next` es la ruta sombra: sirve la versión Next de una sección que
  // todavía NO es el default, para poder abrir las dos y compararlas con los
  // mismos datos. El guard de arriba usa partes[0], así que la sombra no lo toca.
  //
  // Es una sub-ruta y no `?next=1` porque esta página es 'use client' y
  // useSearchParams rompe el prerender del build en Next 16 si no está bajo
  // <Suspense>. La sombra es el mecanismo de seguridad de todo el Paso 6: si no
  // compila, la presión es flipear antes de tiempo.
  //
  // createElement y no <Seccion />: la regla "Cannot create components during
  // render" no puede saber que `componenteDe` devuelve una referencia estable de
  // un objeto de módulo y no un componente nuevo por render. Acá no hay ambigüedad.
  const sombra = Array.isArray(partes) && partes[1] === 'next'
  const seccion = sombra ? componenteSombraDe(key) : componenteDe(key)

  return (
    <div className="shell">
      <Sidebar activa={key} />
      <div className="shell-main">
        <div className="shell-content">
          {/* Las secciones flipeadas van con aire uniforme (.seccion-pad); el iframe
              legacy queda full-bleed porque ya trae su propio padding interno. */}
          {seccion ? (
            <div className="seccion-pad">
              <SeccionHeader seccion={key} />
              {createElement(seccion)}
            </div>
          ) : (
            <LegacyFrame tab={key} marca={marca} />
          )}
        </div>
      </div>
    </div>
  )
}

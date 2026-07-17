'use client'

import { useParams, useRouter } from 'next/navigation'
import { createElement, useEffect } from 'react'
import { LegacyFrame } from '@/components/legacy/LegacyFrame'
import { LoginScreen } from '@/components/LoginScreen'
import { Sidebar } from '@/components/layout/Sidebar'
import { useSesion } from '@/components/SesionProvider'
import { componenteDe } from '@/components/secciones/registro'
import { esDeMarca, esKeyValida } from '@/lib/nav'
import { esAdmin, puedeVer } from '@/lib/permisos'

/** Sección por defecto: la misma que abre el legacy hoy (_currentTabId, index.html:6525). */
const DEFAULT_TAB = 'productos'

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
    if (!cargando && perfil && !permitida && key !== DEFAULT_TAB) router.replace(`/${DEFAULT_TAB}`)
  }, [cargando, perfil, permitida, key, router])

  if (cargando) return <div className="login-screen" />
  if (!perfil) return <LoginScreen />
  if (!permitida) return <div className="login-screen" />

  // Estar en el registro ES el interruptor del strangler: si la sección tiene
  // componente, la sirve el shell; si no, sigue viniendo del legacy embebido.
  //
  // createElement y no <Seccion />: la regla "Cannot create components during
  // render" no puede saber que `componenteDe` devuelve una referencia estable de
  // un objeto de módulo y no un componente nuevo por render. Acá no hay ambigüedad.
  const seccion = componenteDe(key)

  return (
    <div className="shell">
      <Sidebar activa={key} />
      <div className="shell-main">
        <div className="shell-content">
          {seccion ? createElement(seccion) : <LegacyFrame tab={key} marca={marca} />}
        </div>
      </div>
    </div>
  )
}

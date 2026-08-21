'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createElement, useEffect, useState } from 'react'
import { useAvisosPoll } from '@/components/layout/useAvisosPoll'
import { LoginScreen } from '@/components/LoginScreen'
import { ReclamoPublico } from '@/components/reclamos/ReclamoPublico'
import { CanjePortal } from '@/components/canjes/CanjePortal'
import { VotacionPortal } from '@/components/disenos/VotacionPortal'
import { LegalPublico } from '@/components/legal/LegalPublico'
import { PortalCadete } from '@/components/envios/PortalCadete'
import { Sidebar } from '@/components/layout/Sidebar'
import { SeccionHeader } from '@/components/layout/SeccionHeader'
import { CartelNovedad } from '@/components/novedades/CartelNovedad'
import { Guia } from '@/components/ui/Guia'
import { AccionesProvider } from '@/components/layout/acciones'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/Confirm'
import { useSesion } from '@/components/SesionProvider'
import { componenteDe } from '@/components/secciones/registro'
import { esDeMarca, esKeyValida, KEYS_CROSS_MARCA, tituloDesde } from '@/lib/nav'
import { esAdmin, marcasConAcceso, puedeVer } from '@/lib/permisos'

/**
 * Sección por defecto. **Es Inicio, y es una decisión de producto, no una herencia.**
 *
 * Era `productos`, que es lo que abría el legacy (`_currentTabId`, index.html:6525). Con eso, el
 * único que entraba a Inicio a propósito era quien NO podía ver productos: Local y Depósito caían
 * ahí de rebote, por el `FALLBACK_TAB`. O sea que la pantalla que resume el día de cada uno era la
 * que nadie abría, y la tabla de productos —que no le habla a casi ningún rol— era la casa.
 */
const DEFAULT_TAB = 'inicio'
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
  /**
   * `/cadete/<token>` es el tercero, y el único que abre alguien que trabaja con nosotros: la hoja
   * del día en el celular, para marcar entregado y cobrado desde la puerta. No es la pantalla
   * interna de Envíos —ésa tiene la cuenta corriente y deja borrar— y por eso no puede ser la misma
   * ruta. Se defiende con token + PIN. Ver `api/_cadete.js`.
   */
  /**
   * `/votacion/<token>` es el cuarto, y el más interno de todos: el equipo puntúa los diseños del
   * tablero de Compras desde el celular. Igual va por acá y no detrás del login, porque vota gente
   * que no tiene por qué tener cuenta en el Monitor, y pedirle que se loguee para poner cinco
   * estrellas es garantizar que no vote. Se defiende con el token. Ver `api/_disenos-votacion.js`.
   */
  const esPortalCliente = key === 'reclamo' || key === 'canje' || key === 'legal' || key === 'cadete' || key === 'votacion'

  // Si la sección no existe para esta marca o no hay permiso, al default.
  // Mismo criterio que aplicarVisibilidadTabs del legacy.
  //
  // ⚠️ La rama de `KEYS_CROSS_MARCA` no es una excepción de permisos, es de EJE: son secciones donde
  // la marca del sidebar no decide qué se ve (Meta Ads: una cuenta publicitaria trae dos marcas).
  // Preguntarles `puedeVer(…, marca, …)` rebotaba a Inicio a quien tiene la sección en la otra marca,
  // sin que adentro hubiera nada que dependiera de esa marca. El corte fino lo hace el servidor.
  const permitida =
    !!perfil &&
    esKeyValida(key) &&
    esDeMarca(key, marca) &&
    (key === 'usuarios'
      ? esAdmin(perfil)
      : key === 'inicio'
        || (KEYS_CROSS_MARCA.has(key)
          ? marcasConAcceso(perfil, key, ['bdi', 'zattia']).length > 0
          : puedeVer(perfil, marca, key)))

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
    if (key === 'cadete') return <PortalCadete token={token} />
    if (key === 'votacion') return <VotacionPortal token={token} />
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
          {/*
            Va acá y no adentro de una sección: una novedad importante tiene que aparecer estés
            donde estés. Y va DESPUÉS del gate de login y fuera de `AccionesProvider` —el portal de
            acciones es del encabezado de la sección, y esto no pertenece a ninguna—. Los portales
            públicos (`/reclamo/<token>`, `/canje/<token>`) salen del componente mucho antes, así
            que un cliente nunca lo puede llegar a ver.
          */}
          <CartelNovedad />
          {/*
            El tour de «Cómo se usa». Va acá por el mismo motivo que el cartel: no pertenece a
            ninguna sección, y montarlo adentro de una lo desmontaría en cada re-render de ella.
            Los PASOS los registra cada sección en `store/useGuia` (así viajan en su chunk); esto es
            sólo el dibujo, y sin pasos registrados no pinta nada.
          */}
          <Guia />
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

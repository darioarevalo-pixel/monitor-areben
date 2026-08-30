'use client'

import dynamic from 'next/dynamic'
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
import { esDeMarca, esKeyValida, keyDeRuta, KEYS_CROSS_MARCA, tituloDesde } from '@/lib/nav'
import { esAdmin, marcasConAcceso, puedeVer, puedeVerAlguna } from '@/lib/permisos'
import { Cargando } from '@/components/secciones/Cargando'

/**
 * El panel de WhatsApp: la ruta que la extensión de Chrome mete en un iframe al costado del chat.
 *
 * Va con `dynamic` y no con un import estático como los portales públicos porque arrastra el
 * dominio del CRM entero (`lib/crm/*`): estático, lo bajaría también el que entra a Inicio.
 * ⚠️ El 2º argumento va como objeto literal inline — Turbopack lo exige en build.
 */
const PanelWhatsApp = dynamic(() => import('@/components/panel/PanelWhatsApp').then((m) => m.PanelWhatsApp), { loading: Cargando })

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
  /**
   * De qué tienda es el link del alta pública (`/reclamo?m=bdi`). **Lo lee la ruta y ⛔ no el
   * componente** para que la pantalla se pueda montar en un test sin router de Next — el mismo
   * motivo por el que el token viaja como prop.
   *
   * ⚠️ Si ⛔ no viene (o viene una que ⛔ no es del alta), la pantalla le pregunta a la persona en
   * vez de suponer: suponer BDI le contestaría «no encontramos ese pedido» a todo Zattia.
   */
  const marcaDelLink = useSearchParams().get('m')
  const { perfil, marca, cargando } = useSesion()
  // Cajón del sidebar en móvil. Vive acá porque lo abren dos lugares (el botón de la
  // topbar y la tapa oscura) y lo cierra un tercero (navegar a una sección).
  const [menuAbierto, setMenuAbierto] = useState(false)

  const partes = params.seccion
  const key = Array.isArray(partes) ? partes[0] : (partes ?? DEFAULT_TAB)

  // El refresco de avisos vive acá y no en una sección: el contador del sidebar tiene que
  // encenderse estés donde estés. Se llama antes de cualquier return temprano (regla de hooks), y
  // por eso la `key` se resuelve arriba de todo.
  //
  // Apagado en el panel de WhatsApp, que no dibuja sidebar: su iframe se recarga en cada cambio de
  // chat, así que serían tres pedidos por cambio (más un intervalo cada 3 minutos) para encender un
  // contador que esa pantalla no muestra.
  useAvisosPoll(key !== 'panel')

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
   * interna de Envíos —ésa tiene la cuenta corriente y deja eliminar— y por eso no puede ser la misma
   * ruta. Se defiende con token + PIN. Ver `api/_cadete.js`.
   */
  /**
   * `/votacion/<token>` es el cuarto, y el más interno de todos: el equipo puntúa los diseños del
   * tablero de Compras desde el celular. Igual va por acá y no detrás del login, porque vota gente
   * que no tiene por qué tener cuenta en el Monitor, y pedirle que se loguee para poner cinco
   * estrellas es garantizar que no vote. Se defiende con el token. Ver `api/_disenos-votacion.js`.
   */
  const esPortalCliente = key === 'reclamo' || key === 'canje' || key === 'legal' || key === 'cadete' || key === 'votacion'

  /**
   * `/panel/<telefono>` es el quinto camino que no es una sección, y el único que **sí** pide
   * sesión: es el CRM visto de a un cliente, adentro de un iframe que la extensión de Chrome pega
   * al costado de WhatsApp Web. No está en el nav —no se entra a mano— y por eso no tiene entrada
   * propia en `PERM_CAT`: se defiende con el permiso de **Clientes**, el mismo que la sección y el
   * mismo que exige `api/_crm.js` del otro lado. Un permiso nuevo para la misma información sería
   * una segunda puerta a la misma habitación, y la que se olvida de cerrar es siempre la segunda.
   */
  const esPanel = key === 'panel'

  // Si la sección no existe para esta marca o no hay permiso, al default.
  // Mismo criterio que aplicarVisibilidadTabs del legacy.
  //
  // ⚠️ La rama de `KEYS_CROSS_MARCA` no es una excepción de permisos, es de EJE: son secciones donde
  // la marca del sidebar no decide qué se ve (Meta Ads: una cuenta publicitaria trae dos marcas).
  // Preguntarles `puedeVer(…, marca, …)` rebotaba a Inicio a quien tiene la sección en la otra marca,
  // sin que adentro hubiera nada que dependiera de esa marca. El corte fino lo hace el servidor.
  //
  // 🔴 **El permiso se pregunta por la ruta ENTERA, no por el primer tramo.** Hay dos entradas del
  // menú que viven adentro de la pantalla de Tienda Nube y tienen permiso propio:
  // `/tncat/descripciones` es `gen-talles` y `/tncat/redaccion` es `gen-desc`. Preguntando por
  // `partes[0]` el guard pedía `tncat` —que ninguna de las dos necesita— y rebotaba a Inicio a
  // quien SÍ tenía el permiso de la entrada que estaba clickeando, sin decirle nada. Medido el
  // 27-ago-2026: tres cuentas del local tenían `gen-talles` desde el día uno y la Tabla de talles
  // nunca les abrió. `keyDeRuta` devuelve `null` para todo lo que no es una entrada del menú, así
  // que el resto sigue resolviéndose por el primer tramo, como siempre.
  const keyPermiso = keyDeRuta(partes) ?? key
  const permitida =
    !!perfil &&
    esKeyValida(keyPermiso) &&
    esDeMarca(keyPermiso, marca) &&
    (keyPermiso === 'usuarios'
      ? esAdmin(perfil)
      : keyPermiso === 'inicio'
        || (KEYS_CROSS_MARCA.has(keyPermiso)
          ? marcasConAcceso(perfil, keyPermiso, ['bdi', 'zattia']).length > 0
          : puedeVer(perfil, marca, keyPermiso)))

  useEffect(() => {
    if (esPortalCliente || esPanel) return
    if (!cargando && perfil && !permitida && key !== FALLBACK_TAB) router.replace(`/${FALLBACK_TAB}`)
  }, [cargando, perfil, permitida, key, router, esPortalCliente, esPanel])

  // Va acá adentro y NO como ruta propia de Next porque cada ruta es una función serverless y el
  // proyecto está en el tope del plan Hobby (pasarse frena todos los deploys en silencio). Sale
  // antes del gate de login a propósito: se defiende con el token, no con la sesión.
  if (esPortalCliente) {
    const token = Array.isArray(partes) ? partes[1] ?? null : null
    if (key === 'legal') return <LegalPublico pagina={token} />
    if (key === 'cadete') return <PortalCadete token={token} />
    if (key === 'votacion') return <VotacionPortal token={token} />
    // ⚠️ `/reclamo` **sin token** ⛔ no es un link vencido: es el alta pública, que se abre adentro
    // de `ReclamoPublico` (y sigue en la misma pantalla apenas la fila existe).
    return key === 'canje' ? <CanjePortal token={token} /> : <ReclamoPublico token={token} tienda={marcaDelLink} />
  }

  if (cargando) return <div className="login-screen" />
  if (!perfil) return <LoginScreen />

  /**
   * El panel sale ACÁ: después del login y antes del shell.
   *
   * Sin sidebar, sin encabezado y sin el cartel de novedades — mide 360 px de ancho adentro de
   * WhatsApp y ahí el chrome del monitor no es contexto, es la mitad de la pantalla. El gate es
   * `puedeVerAlguna` y no `puedeVer` pelado para que coincida exactamente con el de `api/_crm.js`:
   * si fueran distintos, la cuenta fija vería el panel vacío o al revés.
   */
  if (esPanel) {
    if (!puedeVerAlguna(perfil, 'bdi', ['clientes'])) {
      return <div style={{ padding: 16, fontSize: 13 }}>Tu usuario no tiene acceso a Clientes.</div>
    }
    return <PanelWhatsApp tel={Array.isArray(partes) ? (partes[1] ?? null) : null} />
  }

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

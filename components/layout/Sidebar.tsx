'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useAvisos } from '@/store/useAvisos'
import { useAgenda } from '@/store/useAgenda'
import { contarSinLeer, useSistema } from '@/store/useSistema'
import { contarSinTildar, hoyIso } from '@/lib/agenda'
import { comoLeLlamamos } from '@/lib/inicio/core'
import { esDeMarca, estaEnVariosGrupos, iconoDe, KEYS_CROSS_MARCA, labelDeMenu, NAV_CATS, sectorVisible, type Marca, type NavGrupo, type NavItem } from '@/lib/nav'
import { esAdmin, marcasConAcceso, puedeCambiarMarca, puedeSub, puedeVer } from '@/lib/permisos'
import { CUENTAS } from '@/lib/cuentas'
import { useConfirmar } from '@/components/ui/Confirm'
import { color } from '@/components/ui/tokens'
import { Icono, hayIcono, type NombreIcono } from '@/components/ui/Icono'
import { NuestrasApps } from '@/components/layout/NuestrasApps'

/** Label del menú: LABELS_EXTRA (inicio/usuarios) o el de PERM_CAT. */
function label(key: string): string {
  return labelDeMenu(key)
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
// `sistema` está acá pero la condición mira además que el grupo tenga UNA sola key: hoy es
// Novedades y se dibuja como una entrada suelta; el día que se le sume Manuales pasa a ser un
// grupo desplegable solo, sin tocar esta línea.
const APLANAR = new Set(['inicio', 'clientes', 'sistema', 'agenda'])

export function Sidebar({
  activa,
  sub,
  grupoUrl,
  abierto: cajonAbierto,
  onNavegar,
}: {
  activa: string
  sub?: string | null
  /** El grupo del que se entró (`?g=`), para no marcar el sector equivocado. */
  grupoUrl?: string | null
  /** Solo en móvil: el sidebar es un cajón y esto dice si está afuera. */
  abierto?: boolean
  /** Se llama al elegir una sección, para que el cajón se cierre solo. */
  onNavegar?: () => void
}) {
  const { perfil, marca, setMarca, salir } = useSesion()
  // Lo único que el menú lee de los datos. El refresco lo hace el shell (useAvisosPoll), no acá.
  const nuevos = useAvisos((st) => st.nuevos)
  /**
   * 🔑 **El número de «Decidir» sale del MISMO store que ya alimenta Inicio**, ⛔ no de una consulta
   * nueva ni de un criterio nuevo: son los avisos de tipo `hallazgo`, que `avisosDeHallazgo` ya
   * derivó filtrando por las líneas que esta persona puede ver.
   *
   * ⚠️ Cuenta **todas las líneas visibles**, mientras que el renglón de Rendimiento cuenta **la del
   * eje**. Por eso ese renglón nombra la línea («3 de BDI para decidir →») y éste no: dicho así los
   * dos pueden dar números distintos sin que ninguno mienta. Sin el nombre serían dos contadores
   * sobre lo mismo, que es el defecto que `contarParaDecidir` existe para evitar entre la pantalla
   * y el mail de las 07:50.
   */
  const paraDecidir = useAvisos((st) => st.avisos.filter((a) => a.tipo === 'hallazgo').length)
  const sinLeerN = useSistema((st) => contarSinLeer(st))
  const itemsAgenda = useAgenda((st) => st.items)
  const hechosAgenda = useAgenda((st) => st.hechos)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [menuMarca, setMenuMarca] = useState(false)
  const { confirmar } = useConfirmar()

  if (!perfil) return null

  // El día lo pone el navegador, no el servidor: en UTC, a las 21:00 de acá el badge se apagaría
  // solo tres horas antes de tiempo.
  const sinTildar = contarSinTildar(itemsAgenda, hechosAgenda, hoyIso(), { marca })

  // Mismo criterio que aplicarVisibilidadTabs + renderNav del legacy: una sección
  // se ve si es de esta marca Y el perfil tiene permiso.
  const visible = (k: string) => {
    if (!esDeMarca(k, marca)) return false
    if (k === 'usuarios') return esAdmin(perfil)
    if (k === 'inicio') return true
    // Las secciones cuyo eje no es la marca del sidebar (Meta Ads) se ven si se tienen en ALGUNA
    // marca: adentro no hay nada que dependa de la de arriba. Mismo criterio que el guard de
    // `page.tsx`, y tiene que ser el mismo — si no, el link se esconde y la URL igual entra.
    if (KEYS_CROSS_MARCA.has(k)) return marcasConAcceso(perfil, k, ['bdi', 'zattia']).length > 0
    return puedeVer(perfil, marca, k)
  }

  // Un subgrupo (2º nivel, ej. Local > Actividades) se filtra igual que el grupo y
  // desaparece entero si no queda ninguna sección visible adentro.
  // Una entrada de subárea se ve si se ve su sección y, cuando pide sub-permisos, si tiene alguno.
  // Vale igual para las de un subgrupo y para las que cuelgan derecho de la categoría (Meta).
  const itemVisible = (it: NavItem) => {
    if (!visible(it.key)) return false
    if (!it.sub) return true
    // La herramienta se ve si tiene alguno de sus sub-permisos (Categorías por modelo
    // es de BDI y la asignación por Excel de Zattia: la entrada es la misma).
    // ⛔ Sin `esAdmin(perfil) ||` adelante, a propósito: `puedeSub` ya le dice que sí al admin —y
    // desde el 3-sep-2026 le dice que NO cuando hay una excepción puesta sobre ese sub. Con el
    // atajo, un administrador que se sacó las dos herramientas de una entrada la seguía viendo en
    // el menú y entraba a una pantalla sin nada para hacer.
    const subs = Array.isArray(it.sub) ? it.sub : [it.sub]
    return subs.some((s) => puedeSub(perfil, marca, it.key, s))
  }

  const cats = NAV_CATS.map((cat) => {
    if (cat.adminOnly && !esAdmin(perfil)) return null
    // 🔴 La arrow explícita no es cosmética: `Array.filter` le pasa el ÍNDICE como 2º argumento,
    // así que extender `visible(k, catId?)` en vez de envolverlo le metería un número donde va el
    // id del grupo y el bug sería mudo. `sectorVisible` es no-op en 44 de las 45 secciones.
    const deEsteSector = (k: string) => visible(k) && sectorVisible(perfil, k, cat.id)
    const keys = cat.keys.filter(deEsteSector)
    const items = (cat.items ?? []).filter((it) => itemVisible(it) && sectorVisible(perfil, it.key, cat.id))
    const grupos = (cat.grupos ?? [])
      .map((g) => ({
        ...g,
        keys: g.keys.filter(deEsteSector),
        items: (g.items ?? []).filter((it) => itemVisible(it) && sectorVisible(perfil, it.key, cat.id)),
      }))
      .filter((g) => g.keys.length > 0 || g.items.length > 0)
    // 🔴 `items` va en la condición: una categoría que es un módulo (Meta) no tiene keys sueltas ni
    // subgrupos, así que sin esto desaparecería entera del menú para todo el mundo.
    return keys.length || items.length || grupos.length ? { ...cat, keys, items, grupos } : null
  }).filter((c): c is NonNullable<typeof c> => c !== null)

  const contieneActiva = (c: (typeof cats)[number]) =>
    c.keys.includes(activa)
    || c.items.some((it) => it.key === activa)
    || c.grupos.some((g) => g.keys.includes(activa) || g.items.some((it) => it.key === activa))

  /**
   * UN grupo activo, no todos los que contengan la sección.
   *
   * `solicitudes` cuelga de cuatro sectores a propósito —cada uno la llama a su manera— y
   * eso hacía que al abrirla se pintaran los cuatro en azul a la vez. El resaltado sigue al
   * grupo que la persona tiene ABIERTO; si no abrió ninguno, al primero que la contiene.
   */
  const grupoActivo = (() => {
    // 1º el grupo del que se entró (viaja en `?g=`), 2º el que la persona tiene abierto,
    // y recién ahí el primero que la contenga. Sin el paso 1, entrar a Solicitudes desde
    // Depósito pintaba Local, que es el primero de la lista.
    const delLink = grupoUrl ? cats.find((c) => c.id === grupoUrl && contieneActiva(c)) : null
    const abiertoConActiva = cats.find((c) => c.id === abierto && contieneActiva(c))
    return (delLink ?? abiertoConActiva ?? cats.find(contieneActiva))?.id ?? null
  })()

  return (
    <aside className={`sidebar${cajonAbierto ? ' abierto' : ''}`}>
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
                color: color.mut2,
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
                    href={estaEnVariosGrupos(k) ? `/${k}?g=${cat.id}` : `/${k}`}
                    className={`nav-cat${k === activa ? ' active' : ''}`}
                    onClick={onNavegar}
                  >
                    {hayIcono(cat.icono) && <Icono nombre={cat.icono} />}
                    {cat.label}
                    {/* El contador de avisos cuelga de Inicio, que es adonde llevan todos. */}
                    {k === 'inicio' && nuevos > 0 && (
                      <span className="nav-badge" title={`${nuevos} ${nuevos === 1 ? 'aviso nuevo' : 'avisos nuevos'}`}>
                        {nuevos > 99 ? '99+' : nuevos}
                      </span>
                    )}
                    {/*
                      El de novedades es OTRO contador y cuelga de Novedades, que es adonde lleva el
                      clic. No se junta con el de avisos: aquél se deriva y se marca visto en el
                      navegador; éste es una fila en el servidor, por usuario. En un mismo número
                      bajarían por dos reglas distintas.
                    */}
                    {k === 'novedades' && sinLeerN > 0 && (
                      <span className="nav-badge" title={`${sinLeerN} ${sinLeerN === 1 ? 'novedad sin leer' : 'novedades sin leer'}`}>
                        {sinLeerN > 99 ? '99+' : sinLeerN}
                      </span>
                    )}
                    {/*
                      Y el tercero, el de la agenda: **sólo pendientes de hoy sin tildar**, ni promos
                      ni avisos. Un número que aparece todos los días y no se puede apagar deja de
                      leerse en una semana; éste se apaga tildando, que es el trabajo real.

                      Sale de `contarSinTildar`, la misma función que dibuja la lista de Hoy y el
                      bloque de Inicio: un contador con criterio propio marcaría un 1 que no se
                      corresponde con ninguna fila de ninguna pantalla.
                    */}
                    {k === 'agenda' && sinTildar > 0 && (
                      <span className="nav-badge" title={`${sinTildar} ${sinTildar === 1 ? 'pendiente de hoy sin tildar' : 'pendientes de hoy sin tildar'}`}>
                        {sinTildar > 99 ? '99+' : sinTildar}
                      </span>
                    )}
                  </Link>
                </div>
              )
            }
            const open = (abierto ?? grupoActivo) === cat.id
            const opt = (k: string) => (
              <Link
                key={k}
                // `?g=` solo donde hace falta: una sección que cuelga de varios sectores
                // necesita decir de cuál se entró, o el encabezado muestra siempre el
                // mismo (y era el de otro sector).
                href={estaEnVariosGrupos(k) ? `/${k}?g=${cat.id}` : `/${k}`}
                className={`nav-opt${k === activa ? ' active' : ''}${
                  cat.accent === 'marketing' ? ' nav-accent-mkt' : ''
                }`}
                onClick={onNavegar}
              >
                {hayIcono(iconoDe(k)) && <Icono nombre={iconoDe(k) as NombreIcono} size={15} />}
                {cat.labels?.[k] ?? label(k)}
              </Link>
            )
            // Una entrada de subárea. Es la misma pinta cuelgue de la categoría (Meta) o de un
            // subgrupo (Tienda Nube): una sola función para que no se despeguen.
            const optItem = (it: NavItem) => (
              <Link
                key={it.ruta + it.label}
                href={it.ruta}
                className={`nav-opt${rutaActiva(it, activa, sub) ? ' active' : ''}${cat.accent === 'marketing' ? ' nav-accent-mkt' : ''}`}
                onClick={onNavegar}
              >
                {hayIcono(it.icono) && <Icono nombre={it.icono} size={15} />}
                {it.label}
                {/* El cuarto contador, y el único que cuelga de una entrada de subárea. Mismo
                    criterio que los otros tres: se apaga ACCIONANDO, que es el trabajo real. */}
                {it.ruta === '/meta-ads/decidir' && paraDecidir > 0 && (
                  <span className="nav-badge" title={`${paraDecidir} ${paraDecidir === 1 ? 'cosa para decidir' : 'cosas para decidir'} en la pauta`}>
                    {paraDecidir > 99 ? '99+' : paraDecidir}
                  </span>
                )}
              </Link>
            )
            return (
              <div key={cat.id} className={`nav-group${open ? ' open' : ''}`}>
                <button
                  className={`nav-cat${grupoActivo === cat.id ? ' active' : ''}`}
                  onClick={() => setAbierto(open ? '' : cat.id)}
                >
                  {hayIcono(cat.icono) && <Icono nombre={cat.icono} />}
                  {cat.label}
                  <span className="nav-caret">▾</span>
                </button>
                <div className="nav-menu">
                  {cat.keys.map(opt)}
                  {cat.items.map(optItem)}
                  {cat.grupos.map((g) => (
                    <Subgrupo key={g.id} grupo={g} activa={activa} sub={sub}>
                      {g.keys.map(opt)}
                      {(g.items ?? []).map(optItem)}
                    </Subgrupo>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </nav>

      <div className="sidebar-foot">
        <NuestrasApps onNavegar={onNavegar} />
        <div className="user-foot">
          <span className="side-user">
            {/* La inicial identifica de un vistazo con quién está abierta la sesión: en el
                local se comparte la máquina y eso importa.

                Por `comoLeLlamamos` y no por `perfil.name` directo, para decir el mismo nombre que
                el saludo de Inicio: leer "Hola, Mari" arriba y "mariana.local" al pie es la misma
                sesión contada de dos formas. Las cuentas de puesto no tienen apodo y siguen
                mostrando el usuario, que es lo correcto: ahí no hay una persona a la que nombrar. */}
            <span className="side-avatar" aria-hidden>
              {(comoLeLlamamos(perfil) || '?').charAt(0)}
            </span>
            <span className="side-user-nombre">{comoLeLlamamos(perfil)}</span>
          </span>
          <button
            className="side-salir"
            onClick={() => {
              void (async () => {
                if (await confirmar({ titulo: 'Cerrar sesión', mensaje: `¿Cerrás la sesión de ${comoLeLlamamos(perfil)}?`, ok: 'Cerrar sesión' })) salir()
              })()
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
  // Se abre si la sección activa está adentro, y eso se pregunta por KEY, no por ruta exacta: una
  // subsección con nombre viejo que todavía funciona por alias (`/meta-ads/etapas`) no matchea
  // ninguna ruta del menú, y el grupo se veía CERRADO — o sea que el bookmark de siempre parecía
  // haber perdido la sección del menú. La ruta exacta sigue decidiendo cuál entrada se resalta.
  const tieneActiva = grupo.keys.includes(activa)
    || (grupo.items ?? []).some((it) => it.key === activa || rutaActiva(it, activa, sub))
  const [abierto, setAbierto] = useState<boolean | null>(null)
  const open = abierto ?? tieneActiva

  return (
    <div className={`nav-sub${open ? ' open' : ''}`}>
      <button className="nav-sub-cat" onClick={() => setAbierto(!open)}>
        {hayIcono(grupo.icono) && <Icono nombre={grupo.icono} size={14} />}
        {grupo.label}
        <span className="nav-caret">▾</span>
      </button>
      <div className="nav-sub-menu">{children}</div>
    </div>
  )
}

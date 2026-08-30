'use client'

/**
 * **Organización** — de quién es cada cosa, sin fecha.
 *
 * Es la contracara de la Agenda, y la frontera entre las dos es la única línea que hay que tener
 * clara para no volver a mezclarlas:
 *
 * | | contesta | qué la dispara |
 * | --- | --- | --- |
 * | **Agenda** | ¿qué me toca hoy? | un día del calendario, o un hecho (los moldes) |
 * | **Organización** | ¿de quién es esto? | que aparezca algo y nadie sepa de quién es |
 *
 * # Por qué esto no podía vivir en la Agenda
 *
 * Todo ítem de la Agenda exige una `regla` de las cinco, y `cumplimiento()` emite TODA ocurrencia
 * que esa regla genere: una responsabilidad permanente ahí queda roja para siempre, o hay que
 * inventarle un día. Y medido el 30-ago-2026, la Agenda tampoco DESCRIBE el reparto — **Camila
 * Budek tiene 0 rutinas propias** y trabaja igual, porque su trabajo dispara por hecho y vive en
 * los moldes. Quien lea la Agenda como «quién responde de qué» concluye que ella no responde por
 * nada, que es falso.
 *
 * # Cuatro vistas, y cada una contesta OTRA pregunta
 *
 * 🔑 Lo primero que salió mal fue esto: las cuatro mostraban la misma lista de tres maneras, todas
 * agrupadas por clase, todas con el mismo peso visual. *«Todo muy plano, todo lineal»* (Bruno,
 * 30-ago). Ahora cada una tiene su forma **porque tiene su pregunta**:
 *
 * | vista | contesta | forma |
 * | --- | --- | --- |
 * | Organigrama | ¿quién cuelga de quién? | árbol con codos, y el conteo de cada uno |
 * | Por sector | ¿cómo se reparte? | **matriz**: personas en columnas, clases en filas |
 * | Por persona | ¿de qué responde? | ficha a dos columnas, con sus rutinas arriba |
 * | Sin dueño | ¿qué no es de nadie? | por sector, lo más viejo primero |
 *
 * ⛔ **Y `organizacion` NO está en `KEYS_PARA_TODOS`**: está en obra y hoy la ven sólo los admin
 * (pedido de Bruno, 30-ago). Se abre al equipo con una línea en `lib/permisos.core.js`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Organigrama } from './Organigrama'
import { MatrizSector } from './MatrizSector'
import { FichaPersona } from './FichaPersona'
import { SinDueno } from './SinDueno'
import { EditorResp } from './EditorResp'
import { useSistema } from '@/store/useSistema'
import { leerAgenda } from '@/lib/agenda/cliente'
import type { ItemAgenda } from '@/lib/agenda/tipos'
import { borrarResp, leerOrganizacion, nuevoIdResp } from '@/lib/organizacion/cliente'
import {
  NUEVA, arbol, deLaPersona, delSector, grises,
  type Nodo, type NodoConHijos, type Responsabilidad,
} from '@/lib/organizacion/tipos'
import { FUNCIONES, type Funcion } from '@/lib/permisos'
import { traerEquipo, type Companero } from '@/lib/usuarios/equipo'
import {
  Badge, Button, EmptyState, Esqueleto, Notice, SectionCard, Tabs,
  space, useConfirmar, useFiltroUrl, useToast,
} from '@/components/ui'

type Pestana = 'organigrama' | 'sector' | 'persona' | 'grises'

export function Organizacion() {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const { manuales, cargado: sistemaCargado, cargar: cargarSistema } = useSistema()

  const [nodos, setNodos] = useState<Nodo[]>([])
  const [resp, setResp] = useState<Responsabilidad[]>([])
  const [puede, setPuede] = useState({ editar: false })
  const [equipo, setEquipo] = useState<Companero[] | null>(null)
  /**
   * Las rutinas de la Agenda. ⚠️ **No se guardan acá ni se copian**: se leen del mismo GET que ve
   * todo el equipo y se filtran por destino. Duplicar el dato es lo que hace que una de las dos
   * fuentes mienta el día que alguien edita la otra.
   */
  const [rutinas, setRutinas] = useState<ItemAgenda[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<Responsabilidad | null>(null)

  const [pestana, setPestana] = useFiltroUrl<Pestana>('ver', 'organigrama')
  const [quien, setQuien] = useFiltroUrl<string>('quien', '')
  const [sector, setSector] = useFiltroUrl<Funcion>('sector', 'marketing')

  // ⚠️ Todos los `setState` van adentro de un callback de la promesa, ninguno en el cuerpo: un
  // `setState` sincrónico dentro de un efecto encadena renders y lo corta el lint. Por eso
  // `cargando` arranca en `true` en vez de prenderse acá — y al refrescar después de editar no
  // hace falta el esqueleto, porque la lista ya está dibujada.
  const recargar = useCallback(() => leerOrganizacion()
    .then((d) => {
      setNodos(d.nodos)
      setResp(d.resp)
      setPuede(d.puede)
      setError(null)
    })
    .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo leer la organización.'))
    .finally(() => setCargando(false)), [])

  useEffect(() => { void recargar() }, [recargar])
  useEffect(() => { if (!sistemaCargado) void cargarSistema() }, [sistemaCargado, cargarSistema])
  useEffect(() => { void traerEquipo().then(setEquipo) }, [])
  // La Agenda se pide una sola vez y aparte: la ficha se puede leer entera sin ella, así que un
  // fallo suyo deja el renglón de rutinas mudo y ⛔ no rompe la pantalla.
  useEffect(() => { leerAgenda().then((d) => setRutinas(d.items)).catch(() => setRutinas([])) }, [])

  const arbolNodos = useMemo(() => arbol(nodos), [nodos])
  const losGrises = useMemo(() => grises(resp), [resp])

  const apodoDe = useCallback((name: string) => equipo?.find((c) => c.name === name)?.apodo || name, [equipo])
  const cuantasDe = useCallback((persona: string) => deLaPersona(resp, persona).length, [resp])
  /** La nota del organigrama es el oficio de la persona: «producción audiovisual». */
  const rolDe = useCallback((persona: string) => nodos.find((n) => n.persona === persona)?.nota || null, [nodos])

  /**
   * Las personas de un sector, para las columnas de la matriz.
   *
   * 🔑 **Primero las que TIENEN ese sector en su función del padrón, después el resto.** Sin esto,
   * el recorrido del organigrama ponía a **Bruno primero en marketing** —cuelga más arriba— y las
   * tres del sector quedaban corridas a la derecha. La matriz es del sector: las de afuera que
   * igual tienen renglones ahí (dirección) van al final, ⛔ pero no se esconden.
   * El orden adentro de cada grupo lo sigue dando el organigrama.
   */
  const personasDe = useCallback((s: Funcion) => {
    const enOrden: string[] = []
    const caminar = (ns: NodoConHijos[]) => ns.forEach((n) => { if (n.persona) enOrden.push(n.persona); caminar(n.hijos) })
    caminar(arbolNodos)
    const conFilas = new Set(delSector(resp, s).map((f) => f.persona).filter((p): p is string => !!p))
    // Las que el organigrama no ubicó tampoco se esconden: son trabajo con dueña que nadie colgó.
    const todas = [...enOrden.filter((p) => conFilas.has(p)), ...[...conFilas].filter((p) => !enOrden.includes(p))]
    const esDelSector = (p: string) => !!equipo?.find((c) => c.name === p)?.funcion.includes(s)
    return [...todas.filter(esDelSector), ...todas.filter((p) => !esDelSector(p))]
  }, [arbolNodos, resp, equipo])

  /** Las personas con ficha, para los botones de «Por persona». */
  const conFicha = useMemo(() => {
    const vistas = new Set<string>()
    for (const s of FUNCIONES) for (const p of personasDe(s.key)) vistas.add(p)
    return [...vistas]
  }, [personasDe])

  const sectoresConAlgo = useMemo(() => FUNCIONES.filter((f) => resp.some((r) => r.sector === f.key)), [resp])

  async function eliminar(r: Responsabilidad) {
    const ok = await confirmar({
      titulo: 'Eliminar esta responsabilidad',
      mensaje: `«${r.titulo}». Si lo que pasó es que ya no es de nadie, es mejor sacarle la persona y dejarla como gris: así se sigue viendo que falta.`,
      ok: 'Eliminar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarResp(r.id)
      toast.ok('Eliminada.')
      await recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  const abrirFicha = (p: string) => { setQuien(p); setPestana('persona') }

  const items = [
    { key: 'organigrama', label: 'Organigrama' },
    { key: 'sector', label: 'Por sector' },
    { key: 'persona', label: 'Por persona' },
    { key: 'grises', label: 'Sin dueño', badge: losGrises.length ? <Badge tone="warning">{losGrises.length}</Badge> : undefined },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {puede.editar && (
        <HeaderAcciones>
          <Button size="sm" onClick={() => setEditando({ ...NUEVA, id: nuevoIdResp(), sector })}>+ Responsabilidad</Button>
        </HeaderAcciones>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <Tabs items={items} value={pestana} onChange={(k) => setPestana(k as Pestana)} />

      {cargando && !resp.length ? <Esqueleto filas={6} /> : (
        <>
          {pestana === 'organigrama' && (
            <SectionCard title="Quién cuelga de quién" subtitle="El número es cuántas responsabilidades tiene escritas. Apretá un nombre para abrir su ficha.">
              {arbolNodos.length === 0 ? (
                <EmptyState title="El organigrama todavía no está cargado." hint="Se carga con scripts/organizacion-marketing.mjs, desde organigrama.md." />
              ) : (
                <Organigrama nodos={arbolNodos} cuantasDe={cuantasDe} onPersona={abrirFicha} />
              )}
            </SectionCard>
          )}

          {pestana === 'sector' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                {FUNCIONES.map((f) => {
                  const cuantas = resp.filter((r) => r.sector === f.key && r.activo !== false).length
                  return (
                    <Button key={f.key} size="sm" variant={f.key === sector ? 'soft' : 'ghost'} onClick={() => setSector(f.key)}>
                      {f.label} {cuantas > 0 && <span style={{ opacity: 0.7 }}>· {cuantas}</span>}
                    </Button>
                  )
                })}
              </div>

              {!sectoresConAlgo.some((f) => f.key === sector) ? (
                <EmptyState
                  title="Este sector todavía no está escrito."
                  hint="Marketing entró primero. Administración tiene su manual escrito y es la que sigue."
                  action={puede.editar ? <Button size="sm" onClick={() => setEditando({ ...NUEVA, id: nuevoIdResp(), sector })}>Escribir la primera</Button> : undefined}
                />
              ) : (
                <MatrizSector
                  filas={delSector(resp, sector)}
                  personas={personasDe(sector)}
                  apodoDe={apodoDe}
                  puedeEditar={puede.editar}
                  onEditar={setEditando}
                  onPersona={abrirFicha}
                />
              )}
            </div>
          )}

          {pestana === 'persona' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                {conFicha.map((p) => (
                  <Button key={p} size="sm" variant={p === quien ? 'soft' : 'ghost'} onClick={() => setQuien(p === quien ? '' : p)}>
                    {apodoDe(p)} <span style={{ opacity: 0.7 }}>· {cuantasDe(p)}</span>
                  </Button>
                ))}
              </div>
              {!quien ? (
                <EmptyState title="Elegí a alguien." hint="La ficha dice de qué responde, qué entrega, qué decide sola, qué publica y qué NO es suyo." />
              ) : (
                <SectionCard>
                  <FichaPersona
                    persona={quien}
                    apodo={apodoDe(quien)}
                    rol={rolDe(quien)}
                    filas={deLaPersona(resp, quien)}
                    manuales={manuales}
                    rutinas={rutinas}
                    puedeEditar={puede.editar}
                    onEditar={setEditando}
                    onEliminar={eliminar}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {pestana === 'grises' && (
            <SinDueno
              filas={resp}
              manuales={manuales}
              puedeEditar={puede.editar}
              onEditar={setEditando}
              onEliminar={eliminar}
              onNuevo={() => setEditando({ ...NUEVA, id: nuevoIdResp(), sector })}
            />
          )}
        </>
      )}

      {editando && (
        <EditorResp
          resp={editando}
          equipo={equipo}
          manuales={manuales}
          onCerrar={() => setEditando(null)}
          onGuardado={async () => { setEditando(null); await recargar() }}
        />
      )}
    </div>
  )
}

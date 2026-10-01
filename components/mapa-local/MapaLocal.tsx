'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Button, KpiCard, Notice, Plegable, SectionCard, Tabs, color, font, space, useToast } from '@/components/ui'
import { alertas as alertasDe, capacidadTotal, cuelga, estabilizar, estadoDeModulo, movimientos, resumenPorTipo, ubicar, type EstadoModulo } from '@/lib/mapa-local/core'
import { hojaDeModulo, imprimirHojas } from '@/lib/mapa-local/hoja'
import { guardarMapa } from '@/lib/mapa-local/cliente'
import { MAPA_INICIAL } from '@/lib/mapa-local/inicial'
import { proponerArmado } from '@/lib/mapa-local/proponer'
import type { MapaLocal as Mapa, ModoCupo, Modulo, Pared as TipoPared } from '@/lib/mapa-local/tipos'
import { QueSeCuelga } from '@/components/que-se-cuelga/QueSeCuelga'
import { useMapaLocalDatos } from './useMapaLocalDatos'
import { Plano } from './Plano'
import { Pared } from './Pared'
import { Detalle } from './Detalle'
import { Mover } from './Mover'
import { Prendas } from './Prendas'
import { TablaTipos } from './TablaTipos'

/**
 * Mapa del local (Zattia): los percheros del salón, qué va en cada barra y cuánto entra.
 *
 * 🔑 **El armado se guarda; dónde cae cada prenda, ⛔ no.** Cada prenda con stock en el Local cae
 * sola en su barra por su tipo y su línea (`ubicar`), con el stock del espejo de hoy. Así lo que entra
 * nuevo ya tiene lugar y lo que pasa a sale se muda solo, sin que nadie ubique nada a mano.
 *
 * 🔴 **Lo que no entra se dice, ⛔ no se cuelga de más.** Es la decisión que el local venía tomando sin
 * verla: medido el 30-sep-2026, ~640 prendas contra ~300 perchas cómodas.
 *
 * 🔑 **Dos cupos: cómodo y al tope.** El tope es lo que Bruno midió apretado (38 blusas por barra,
 * sin que se deslicen). La pantalla se mira en uno de los dos modos; el cupo puesto a mano en una
 * barra vale para los dos.
 */

const PAREDES: { key: TipoPared; label: string }[] = [
  { key: 'der', label: 'Pared derecha' },
  { key: 'izq', label: 'Pared izquierda' },
  { key: 'isla', label: 'Isla' },
]

/**
 * Dos vistas, una sección (misma key y mismo permiso): **«Percheros»** (`/mapa-local`, el plano y las
 * barras) y **«Qué se cuelga»** (`/mapa-local/que-se-cuelga`, la temporada y qué queda afuera).
 * Pedido de Bruno (1-oct-2026): la vista principal sigue siendo la de los percheros.
 */
export function MapaLocal() {
  const params = useParams()
  const partes = params.seccion
  const vista = Array.isArray(partes) ? partes[1] : null
  return vista === 'que-se-cuelga' ? <QueSeCuelga /> : <Percheros />
}

function Percheros() {
  const toast = useToast()
  const { marca, hoy, prendas, sinCruzarTn, guardado, setGuardado, base, editar, sinTabla, cargando, error } = useMapaLocalDatos(MAPA_INICIAL)
  // Lo editado; `null` = sin tocar, y entonces se ve el guardado (o el inicial mientras carga).
  const [editado, setEditado] = useState<Mapa | null>(null)
  const mapa = editado ?? guardado?.mapa ?? MAPA_INICIAL
  const setMapa = (cambio: Mapa | ((m: Mapa) => Mapa)) => setEditado((ant) => (typeof cambio === 'function' ? cambio(ant ?? guardado?.mapa ?? MAPA_INICIAL) : cambio))
  const [guardando, setGuardando] = useState(false)
  const [modo, setModo] = useState<ModoCupo>('comodo')
  const [pared, setPared] = useState<TipoPared>('der')
  const [elegido, setElegido] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<Record<string, boolean>>({})

  // Con un cambio de armado, la ubicación se reacomoda para mover lo menos posible (ver `estabilizar`).
  // 🔑 Sin un mapa guardado no hay «antes»: el armado inicial no es lo que está colgado.
  const previa = useMemo(() => (base ? ubicar(prendas, base, modo, hoy) : null), [prendas, base, modo, hoy])
  const u = useMemo(() => {
    const cruda = ubicar(prendas, mapa, modo, hoy)
    return previa ? estabilizar(cruda, previa, mapa, modo) : cruda
  }, [prendas, mapa, modo, previa, hoy])
  const movs = useMemo(() => (previa ? movimientos(previa, u) : []), [previa, u])
  const filas = useMemo(() => resumenPorTipo(prendas, mapa, u), [prendas, mapa, u])
  const avisos = useMemo(() => alertasDe(mapa), [mapa])
  const graves = useMemo(() => new Set(avisos.filter((a) => a.grave).map((a) => a.codigo)), [avisos])
  const estados = useMemo(() => Object.fromEntries(mapa.modulos.map((m) => [m.codigo, estadoDeModulo(mapa, m, u, modo).estado])) as Record<string, EstadoModulo>, [mapa, u, modo])
  const colgables = useMemo(() => prendas.filter((p) => cuelga(mapa, p.tipo)).length, [prendas, mapa])
  const capacidad = useMemo(() => capacidadTotal(mapa, 'comodo'), [mapa])
  const capacidadTope = useMemo(() => capacidadTotal(mapa, 'tope'), [mapa])
  const tiposSinTope = useMemo(() => new Set(prendas.filter((p) => cuelga(mapa, p.tipo) && mapa.tipos.find((t) => t.tipo === p.tipo)?.topePorM == null).map((p) => p.tipo)).size, [prendas, mapa])
  const cambiado = !!guardado && JSON.stringify(guardado.mapa) !== JSON.stringify(mapa)

  const opcionesTipo = useMemo(() => {
    const n = new Map<string, number>()
    for (const p of prendas) n.set(p.tipo, (n.get(p.tipo) || 0) + 1)
    const tipos = new Set([...mapa.tipos.filter((t) => t.cuelga).map((t) => t.tipo), ...[...n.keys()].filter((t) => cuelga(mapa, t))])
    return [...tipos].sort((a, b) => (n.get(b) || 0) - (n.get(a) || 0) || a.localeCompare(b)).map((t) => ({ key: t, label: t, n: n.get(t) || 0 }))
  }, [prendas, mapa])

  const moduloElegido = mapa.modulos.find((m) => m.codigo === elegido) || null
  const cambiarModulo = (m: Modulo) => setMapa((ant) => ({ ...ant, modulos: ant.modulos.map((x) => (x.codigo === m.codigo ? m : x)) }))

  function proponer() {
    const p = proponerArmado(prendas, mapa, modo, hoy)
    setMapa(p.mapa)
    toast.ok(`Armado propuesto con el stock de hoy: ${p.modulos.nc} módulos de colección y ${p.modulos.sale} de sale. Revisalo antes de guardar.`)
  }

  /** Las hojas de los módulos pedidos; sin pedir, las de los que toca «Mover», o todas si no hay cambio. */
  async function imprimir(codigos?: string[]) {
    const tocados = new Set(movs.flatMap((m) => [m.de, m.a]).filter((id): id is string => !!id).map((id) => id.slice(0, id.lastIndexOf('-'))))
    const lista = [...mapa.modulos]
      .sort((a, b) => a.orden - b.orden)
      .filter((m) => (codigos ? codigos.includes(m.codigo) : !movs.length || tocados.has(m.codigo)))
    if (!lista.length) return toast.error('No hay módulos para imprimir.')
    const cual = guardado?.en && !cambiado ? 'mapa guardado' : 'mapa sin guardar'
    const cuando = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })
    await imprimirHojas(
      lista.map((m) => hojaDeModulo(mapa, m, u, movs.length ? movs : null, modo)),
      `Mapa del local · Zattia · ${cual} · stock del ${cuando}`,
    )
  }

  async function guardar() {
    if (!guardado) return
    setGuardando(true)
    try {
      const r = await guardarMapa(mapa, guardado.en)
      setGuardado({ mapa, en: r.actualizadoEn, por: r.actualizadoPor })
      toast.ok('Mapa guardado.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  if (marca !== 'zattia') return <Notice tone="warning">El mapa del local es de Zattia. Cambiá de marca arriba para verlo.</Notice>
  if (error) return <Notice tone="danger">{error}</Notice>

  const deLaPared = mapa.modulos.filter((m) => m.pared === pared)
  const toggle = (k: string) => setAbierto((a) => ({ ...a, [k]: !a[k] }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
      <HeaderAcciones>
        <Button variant="outline" onClick={() => void imprimir()} disabled={cargando || !prendas.length}>
          {movs.length ? 'Imprimir las hojas de lo que cambia' : 'Imprimir las hojas'}
        </Button>
        {editar && (
          <>
          <Button variant="outline" onClick={proponer} disabled={cargando || !prendas.length}>
            Proponer con el stock de hoy
          </Button>
          {cambiado && (
            <Button variant="outline" onClick={() => guardado && setMapa(guardado.mapa)}>
              Descartar los cambios
            </Button>
          )}
          <Button variant="solid" tone="brand" onClick={() => void guardar()} loading={guardando} disabled={!cambiado || sinTabla}>
            Guardar el mapa
          </Button>
          </>
        )}
      </HeaderAcciones>

      {cargando ? (
        <Notice>Cargando el mapa y el stock del Local…</Notice>
      ) : (
        <>
          {sinTabla && editar && <Notice tone="warning">Todavía falta crear la tabla del mapa en la base: podés probar cambios, pero no guardarlos.</Notice>}
          {!guardado?.en && <Notice tone="brand">Este es el armado propuesto: todavía nadie lo guardó. Corregilo módulo por módulo y guardalo.</Notice>}
          {sinCruzarTn && <Notice tone="warning">Todavía se está cargando el catálogo: hasta que termine, ninguna prenda sabe si está en sale.</Notice>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: space[3] }}>
            <KpiCard label="Prendas para colgar" value={colgables} sub="una por producto y color con stock en el Local" />
            <KpiCard label="Perchas cómodas" value={capacidad} sub="lo que entra sin apretar, sumando todas las barras" />
            <KpiCard label="Perchas al tope" value={capacidadTope} sub={tiposSinTope ? `apretadas · ${tiposSinTope} tipos sin tope medido cuentan como cómodo` : 'apretadas, sin que se deslicen'} />
            <KpiCard label={modo === 'tope' ? 'No entran ni al tope' : 'No entran'} value={u.noEntran.length} tone={u.noEntran.length ? 'danger' : 'success'} sub="tienen barra, pero está llena: van al depósito" />
            <KpiCard label="Sin lugar" value={u.sinLugar.length} tone={u.sinLugar.length ? 'warning' : 'success'} sub="ninguna barra acepta su tipo y línea" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
            <span style={{ fontSize: font.sm, color: color.mut }}>Contar las barras</span>
            <Tabs items={[{ key: 'comodo', label: 'Cómodas' }, { key: 'tope', label: 'Al tope' }]} value={modo} onChange={(k) => setModo(k as ModoCupo)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 340px) minmax(0, 1fr)', gap: space[5], alignItems: 'start' }} className="mapa-local-grid">
            <SectionCard title="El local desde arriba" subtitle="Tocá un módulo para ver qué va ahí">
              <Plano
                modulos={mapa.modulos}
                estados={estados}
                graves={graves}
                elegido={elegido}
                onElegir={(c, p) => {
                  setElegido(c)
                  setPared(p)
                }}
              />
              <Leyenda />
            </SectionCard>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], minWidth: 0 }}>
              <SectionCard title="De frente" subtitle="Cada barra a su altura real y cada prenda con su largo">
                <Tabs items={PAREDES.map((p) => ({ key: p.key, label: p.label }))} value={pared} onChange={(k) => setPared(k as TipoPared)} />
                <div style={{ marginTop: space[3] }}>
                  <Pared mapa={mapa} modo={modo} modulos={deLaPared} u={u} graves={graves} elegido={elegido} onElegir={setElegido} />
                </div>
              </SectionCard>
              {moduloElegido ? (
                <Detalle
                  mapa={mapa}
                  modo={modo}
                  modulo={moduloElegido}
                  u={u}
                  alertas={avisos.filter((a) => a.codigo === moduloElegido.codigo)}
                  opcionesTipo={opcionesTipo}
                  editar={editar}
                  onCambiar={cambiarModulo}
                  onImprimir={() => void imprimir([moduloElegido.codigo])}
                />
              ) : (
                <Notice>Tocá un módulo en el plano o en la pared para ver sus barras y lo que va en cada una.</Notice>
              )}
            </div>
          </div>

          {base && (
            <Plegable
              abierto={!!abierto.mover}
              onToggle={() => toggle('mover')}
              titulo={`Mover (${movs.length})`}
              ayuda="Lo que cambia de lugar entre el mapa guardado al abrir esta pantalla y el que estás viendo, con el stock de hoy. Se mueve lo menos posible."
            >
              <Mover movs={movs} />
            </Plegable>
          )}
          <Plegable abierto={!!abierto.noEntran} onToggle={() => toggle('noEntran')} titulo={`No entran (${u.noEntran.length})`} ayuda="Tienen una barra de su tipo y línea, pero ya está llena. Primero quedan afuera las que no vendieron en 30 días; lo que está fuera de temporada ni siquiera pide lugar.">
            <div style={{ fontSize: font.sm, marginBottom: space[3] }}>
              <Link href="/mapa-local/que-se-cuelga">Ver qué se cuelga y qué duerme por temporada →</Link>
            </div>
            <Prendas prendas={u.noEntran} vacio="Entra todo." />
          </Plegable>
          <Plegable abierto={!!abierto.sinLugar} onToggle={() => toggle('sinLugar')} titulo={`Sin lugar (${u.sinLugar.length})`} ayuda="Ninguna barra acepta su tipo y su línea. Hay que sumarlo a alguna barra o marcar el tipo como que no se cuelga.">
            <Prendas prendas={u.sinLugar} vacio="Todas tienen una barra de su tipo." />
          </Plegable>
          <Plegable abierto={!!abierto.tipos} onToggle={() => toggle('tipos')} titulo="Por tipo de prenda" ayuda="Cuántas hay de cada tipo, cuántas entran, y el largo y las perchas por metro —cómodas y al tope— con que se calcula el cupo.">
            <TablaTipos mapa={mapa} filas={filas} editar={editar} onCambiar={(tipos) => setMapa((m) => ({ ...m, tipos }))} />
          </Plegable>

          <div style={{ fontSize: font.xs, color: color.mut }}>
            {guardado?.en ? `Guardado por ${guardado.por || '—'} el ${new Date(guardado.en).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}. ` : ''}
            El stock es el del espejo de Gestión Nube (se actualiza una vez por día y con «Cargar de GN»).
          </div>
        </>
      )}
      <style>{'@media (max-width: 760px) { .mapa-local-grid { grid-template-columns: minmax(0, 1fr) !important; } }'}</style>
    </div>
  )
}

function Leyenda() {
  const item = (fondo: string, borde: string, texto: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: fondo, border: `1.5px solid ${borde}` }} />
      {texto}
    </span>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[3], marginTop: space[3], fontSize: font.xs, color: color.mut }}>
      {item(color.successBg, color.successBorder, 'Entra cómodo')}
      {item(color.warningBg, color.warningBorder, 'Lleno')}
      {item(color.dangerBg, color.danger, 'Lleno y sobran prendas')}
      {item(color.brand, color.brand, 'Colección')}
      {item(color.warning, color.warning, 'Sale')}
    </div>
  )
}

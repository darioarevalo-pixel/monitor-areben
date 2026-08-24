'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { useLinea } from '@/components/fundas/useDatosMonitor'
import { ponerAltaSolicitud, ponerVerSolicitud } from '@/lib/sesionfotos/puente'
import type { Disparador } from '@/lib/solicitudes/disparador'
import type { TipoSol } from '@/lib/sesionfotos/tipos'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Badge, BuscarInput, Button, Card, Chips, EmptyState, Esqueleto, FilterBar, MarcaChip, color, font, space, useFiltroUrl } from '@/components/ui'
import { useAvisos } from '@/store/useAvisos'
import { NuevaSolicitud } from './NuevaSolicitud'
import { presetPorMotivo } from './preset'
import { ordenarResumenes, puedePedir, veTodo, type GrupoEstado, type ResumenSolicitud } from '@/lib/solicitudes/overview'

const FILTROS: { k: GrupoEstado | 'todas'; label: string }[] = [
  { k: 'todas', label: 'Todas' },
  { k: 'pendiente', label: 'Pendientes' },
  { k: 'enproceso', label: 'En proceso' },
  { k: 'conventagn', label: 'Con venta GN' },
  { k: 'devuelta', label: 'Devueltas' },
  { k: 'cerrada', label: 'Cerradas' },
]

const horaCorta = (creado: number, fecha: string) => {
  if (!creado) return fecha || ''
  const d = new Date(creado)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Solicitudes (vista unificada, solo lectura). Lee los dos KV (sesionfotos +
 * solicitudesinternas) de las marcas que el usuario ve, los muestra juntos con su
 * estado, y filtra por función (Local/Depósito solo su origen). Para gestionar, entra
 * a la sección correspondiente.
 */
export function Solicitudes() {
  const { perfil, marca, setMarca } = useSesion()
  const { setLinea } = useLinea()
  const router = useRouter()
  const [filtro, setFiltro] = useFiltroUrl<GrupoEstado | 'todas'>('f', 'todas')
  const [busqueda, setBusqueda] = useFiltroUrl<string>('q', '')

  const [pidiendo, setPidiendo] = useState(false)

  // El refresco lo hace el shell una sola vez para toda la app (`useAvisosPoll`): antes esta
  // pantalla y el Inicio tenían cada una su propio setInterval de 3 minutos pidiendo lo mismo.
  const resumenes = useAvisos((st) => st.resumenes)
  const cargando = useAvisos((st) => st.cargando)
  const recargar = useAvisos((st) => st.cargar)
  const cargar = useCallback(async () => { await recargar(perfil, marca) }, [recargar, perfil, marca])
  // Memoizado porque de acá cuelgan los contadores de los chips (useMemo): sin esto sería un
  // array nuevo por render y el compilador no puede sostener esa memoización.
  const datos = useMemo(() => (resumenes.length || !cargando ? ordenarResumenes(resumenes) : null), [resumenes, cargando])

  const q = busqueda.trim().toLowerCase()
  const lista = (datos || []).filter(
    (r) => (filtro === 'todas' || r.grupo === filtro) && (!q || r.titulo.toLowerCase().includes(q) || r.subtitulo.toLowerCase().includes(q) || (r.creadoPor || '').toLowerCase().includes(q)),
  )

  // Los chips llevan el contador: la pregunta de esta pantalla es "cuántas hay en cada
  // estado", y antes había que filtrar uno por uno para saberlo.
  const cuentaPorGrupo = useMemo(() => {
    const base = datos ?? []
    const m: Record<string, number> = { todas: base.length }
    FILTROS.forEach((f) => {
      if (f.k !== 'todas') m[f.k] = base.filter((r) => r.grupo === f.k).length
    })
    return m
  }, [datos])

  const ver = (r: ResumenSolicitud) => {
    if (marca !== r.marca) setMarca(r.marca)
    // ⚠️ La línea también, y por eso el resumen la trae: Sesión de fotos abre en la pestaña de la
    // línea, y sin esto una solicitud de Stunned abriría la pantalla en Zattia — donde no está.
    setLinea(r.linea)
    if (r.seccion === 'sesion-fotos') ponerVerSolicitud(r.id)
    router.push(r.seccion === 'sesion-fotos' ? '/sesion-fotos' : '/solicitudes-internas')
  }

  const sector = !veTodo(perfil)
  const puedeCrear = puedePedir(perfil)

  /**
   * El alta: se eligen motivo y destino acá y se navega a la pantalla del cajón que
   * corresponde, con el borrador ya abierto y configurado (puente `ponerAltaSolicitud`).
   * El usuario no ve "secciones": pide una solicitud y sigue.
   */
  const crear = (a: { motivo: string; tipo: TipoSol; disparador: Disparador | null }) => {
    setPidiendo(false)
    ponerAltaSolicitud(a)
    router.push(presetPorMotivo(a.motivo).kind === 'sesionfotos' ? '/sesion-fotos' : '/solicitudes-internas')
  }

  return (
    <>
      <HeaderAcciones>
        <InfoPopover titulo="Solicitudes">
          Todas las solicitudes de productos: cada una tiene un <b>motivo</b> (para qué sale — sesión de fotos,
          video, muestra…) y un <b>destino</b> (si vuelve a la venta o se consume).{' '}
          {sector
            ? 'Ves lo que tiene productos de tu sector, en la marca en la que estás parado, para prepararlo y entregarlo.'
            : 'Ves las de todas tus marcas.'}{' '}
          Para preparar, crear la venta en GN o devolver, entrá con “Ver”.
        </InfoPopover>
        <Button variant="outline" onClick={() => void cargar()}>
          Actualizar
        </Button>
        {puedeCrear && (
          <Button variant="solid" tone="brand" onClick={() => setPidiendo(true)}>
            + Nueva solicitud
          </Button>
        )}
      </HeaderAcciones>

      {pidiendo && <NuevaSolicitud onCancelar={() => setPidiendo(false)} onOk={crear} />}

      <FilterBar>
        <BuscarInput value={busqueda} onChange={setBusqueda} placeholder="Buscar solicitud, producto o quién la pidió…" />
        <Chips<GrupoEstado | 'todas'>
          value={filtro}
          onChange={setFiltro}
          opciones={FILTROS.map((f) => ({ key: f.k, label: f.label, n: cuentaPorGrupo[f.k] }))}
        />
      </FilterBar>

      {datos === null ? (
        <Esqueleto forma="tabla" filas={6} />
      ) : lista.length === 0 ? (
        <EmptyState icon="✅" title="No hay solicitudes en este filtro" dashed />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {lista.map((r) => (
            <Card
              key={`${r.seccion}-${r.marca}-${r.id}`}
              interactive
              padding={3}
              onClick={() => ver(r)}
              style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', cursor: 'pointer' }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <MarcaChip marca={r.linea} />
                  <span style={{ fontWeight: 600, color: color.ink }}>{r.titulo}</span>
                  <span style={{ fontSize: font.xs, fontWeight: 700, color: r.color, background: r.bg, borderRadius: 6, padding: '1px 7px' }}>{r.estadoLabel}</span>
                  {r.estadoTag ? (
                    <Badge tone="danger" subtle>
                      ⚠ {r.estadoTag}
                    </Badge>
                  ) : null}
                </div>
                <div style={{ fontSize: font.sm, color: color.mut, marginTop: 3 }}>
                  {r.subtitulo} · {r.unidades} u.
                  {sector ? ` (local ${r.uLocal} · dep ${r.uDeposito})` : ''} · creada por {r.creadoPor || '—'} · {horaCorta(r.creado, r.fecha)}
                </div>
              </div>
              <span aria-hidden style={{ color: color.mut2, fontSize: font.lg }}>
                ›
              </span>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

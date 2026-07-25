'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub, puedeVer } from '@/lib/permisos'
import { leerCajon } from '@/lib/solicitudes/cajon'
import { ponerVerSolicitud } from '@/lib/sesionfotos/puente'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'

import { filtrarPorFuncion, ordenarResumenes, resumenFoto, resumenInterna, type ResumenSolicitud } from '@/lib/solicitudes/overview'
import { horaLabel, marcasVisibles, modoInicio, origenesDe, pendientesDeTrabajo, tituloPendientes } from '@/lib/inicio/core'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Button, Card, EmptyState, Esqueleto, MarcaChip, Notice, color, font, space } from '@/components/ui'

const POLL_MS = 180000 // refresco automático cada 3 min (como el legacy)

/**
 * Inicio: lo que hay que hacer hoy, según la función de cada uno.
 *
 * Lee los DOS cajones de solicitudes (sesión de fotos + internas): con el modelo nuevo
 * —una solicitud con motivo y destino— mirar uno solo mostraba la mitad del trabajo.
 * Y arranca con las ACCIONES, no con una lista: el local entra al monitor a cargar una
 * falla o un cambio, y tenerlos primero evita el paseo por el menú. Cada botón aparece
 * solo si esa persona puede hacerlo.
 *
 * Rediseño jul-2026 (patrón Tablero): las acciones del día se separan visualmente de la
 * lista de pendientes (antes eran una fila de botones idénticos pegada a la lista, sin
 * jerarquía: "+ Falla" se veía igual que "Post-venta"). Las dos que se usan con el
 * cliente delante quedan grandes y llenas; el resto, secundarias. Cada pendiente es una
 * fila clickeable entera, que en el teléfono se apila en vez de desbordarse.
 */
export function Inicio() {
  const { perfil, marca, setMarca } = useSesion()
  const router = useRouter()
  const [pend, setPend] = useState<ResumenSolicitud[] | null>(null)
  const [aprobaciones, setAprobaciones] = useState(0)

  const admin = esAdmin(perfil)
  const ve = (k: string) => admin || puedeVer(perfil, marca, k)

  const cargar = useCallback(async () => {
    // `esAprobador` se calcula acá adentro y no afuera: como dependencia del useCallback,
    // el React Compiler no puede garantizar que no cambie entre renders y desactiva la
    // memoización de todo el componente (error `preserve-manual-memoization`).
    const esAprobador =
      esAdmin(perfil) || puedeSub(perfil, marca, 'solicitudes-internas', 'aprobar') || puedeSub(perfil, marca, 'solicitudes', 'aprobar')
    const marcas = marcasVisibles(perfil, marca)
    const partes = await Promise.all(
      marcas.map(async (m) => {
        const [f, i] = await Promise.all([leerCajon<Solicitud>('sesionfotos', m), leerCajon<SolicitudInterna>('solicitudesinternas', m)])
        return [...(f.ok ? f.dato.map((s) => resumenFoto(s, m)) : []), ...(i.ok ? i.dato.map((s) => resumenInterna(s, m)) : [])]
      }),
    )
    const todas = filtrarPorFuncion(partes.flat(), perfil)
    setPend(ordenarResumenes(pendientesDeTrabajo(todas)))
    // Lo que espera MI aprobación (consumos): solo tiene sentido mostrarlo al aprobador.
    setAprobaciones(esAprobador ? todas.filter((r) => r.estadoLabel === 'Pendiente de aprobar').length : 0)
  }, [perfil, marca])

  useEffect(() => {
    // El IIFE async evita el set-state-in-effect (cargar es async y hace setState).
    void (async () => {
      await cargar()
    })()
    const t = setInterval(() => void cargar(), POLL_MS)
    return () => clearInterval(t)
  }, [cargar])

  const ver = (r: ResumenSolicitud) => {
    if (marca !== r.marca) setMarca(r.marca)
    if (r.seccion === 'sesion-fotos') ponerVerSolicitud(r.id)
    router.push(r.seccion === 'sesion-fotos' ? '/sesion-fotos' : '/solicitudes-internas')
  }

  const modo = modoInicio(perfil)
  const origenes = origenesDe(perfil)

  // Las acciones del día, por permiso. El orden es el de uso real: primero lo que se hace
  // con el cliente delante (falla, cambio), después lo de la trastienda.
  const acciones: { label: string; ruta: string; destacado?: boolean }[] = [
    ve('postventa-local') && { label: 'Cargar falla', ruta: '/postventa-local', destacado: true },
    ve('cambios-local') && { label: 'Cargar cambio', ruta: '/cambios-local', destacado: true },
    ve('postventa-deposito') && { label: 'Falla (depósito)', ruta: '/postventa-deposito' },
    ve('reposicion') && { label: '🔁 Reposición', ruta: '/reposicion' },
    ve('postventa') && { label: '🧾 Post-venta', ruta: '/postventa' },
    ve('solicitudes') && { label: '📋 Solicitudes', ruta: '/solicitudes' },
  ].filter((a): a is { label: string; ruta: string; destacado?: boolean } => !!a)

  return (
    <>
      <HeaderAcciones>
        <Button variant="outline" onClick={() => void cargar()} title="Volver a leer las solicitudes">
          🔄 Actualizar
        </Button>
      </HeaderAcciones>

      {aprobaciones > 0 && (
        <Notice tone="warning" icon="⏳" style={{ marginBottom: space[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
            <span>
              {aprobaciones === 1
                ? 'Hay 1 solicitud de consumo esperando tu aprobación.'
                : `Hay ${aprobaciones} solicitudes de consumo esperando tu aprobación.`}
            </span>
            <Button size="sm" variant="outline" tone="warning" onClick={() => router.push('/solicitudes')}>
              Ver
            </Button>
          </div>
        </Notice>
      )}

      {acciones.length > 0 && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginBottom: space[6] }}>
          {acciones.map((a) => (
            <Button
              key={a.ruta}
              size={a.destacado ? 'lg' : 'md'}
              variant={a.destacado ? 'solid' : 'outline'}
              tone={a.destacado ? 'brand' : 'neutral'}
              iconLeft={a.destacado ? '+' : undefined}
              onClick={() => router.push(a.ruta)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}

      {modo === 'gerencial' ? (
        // Dirección/Admin: el frente no es la lista de tareas, sino el panel de decisiones.
        <Card>
          <div style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: 6 }}>👋 Hola{perfil?.name ? `, ${perfil.name}` : ''}</div>
          <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', fontSize: font.base, color: color.mut }}>
            <span>📋 {pend === null ? '…' : pend.length === 1 ? '1 solicitud en curso' : `${pend.length} solicitudes en curso`}.</span>
            <Button size="sm" variant="outline" onClick={() => router.push('/solicitudes')}>
              Ver solicitudes
            </Button>
            <Button size="sm" variant="outline" onClick={() => router.push('/gerencial')}>
              🎯 Panel gerencial
            </Button>
          </div>
        </Card>
      ) : (
        <section>
          <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: space[3] }}>
            {tituloPendientes(origenes)}
            {pend && pend.length ? <span style={{ color: color.mut, fontWeight: 600 }}> ({pend.length})</span> : ''}
          </h2>

          {pend === null ? (
            <Esqueleto forma="tabla" filas={4} />
          ) : pend.length === 0 ? (
            <EmptyState
              icon="✅"
              title={origenes.length ? 'No tenés nada pendiente en tu sector' : 'Todo al día'}
              hint={origenes.length ? undefined : 'No hay solicitudes en curso.'}
              dashed
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pend.map((r) => (
                <Card
                  key={`${r.seccion}-${r.marca}-${r.id}`}
                  interactive
                  padding={3}
                  onClick={() => ver(r)}
                  style={{ cursor: 'pointer', display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <MarcaChip marca={r.marca} />
                      <span style={{ fontWeight: 600, color: color.ink }}>{r.titulo}</span>
                      <span style={{ fontSize: font.xs, fontWeight: 700, color: r.color, background: r.bg, borderRadius: 6, padding: '1px 7px' }}>{r.estadoLabel}</span>
                    </div>
                    <div style={{ fontSize: font.sm, color: color.mut2, marginTop: 3 }}>
                      {r.subtitulo} · {unidadesDe(r, origenes)} · creada por {r.creadoPor || '—'} · {horaLabel(r.creado, r.fecha)}
                    </div>
                  </div>
                  <span aria-hidden style={{ color: color.mut2, fontSize: font.lg }}>
                    ›
                  </span>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}

/** Las unidades que le tocan a este usuario: en un sector, solo las de su origen. */
function unidadesDe(r: ResumenSolicitud, origenes: ReturnType<typeof origenesDe>): string {
  const n = origenes.length ? origenes.reduce((a, o) => a + (o === 'local' ? r.uLocal : r.uDeposito), 0) : r.unidades
  const sufijo = origenes.length ? ' en tu sector' : ''
  return `${n} ${n === 1 ? 'unidad' : 'unidades'}${sufijo}`
}

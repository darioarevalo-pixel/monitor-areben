'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub, puedeVer } from '@/lib/permisos'
import { leerCajon } from '@/lib/solicitudes/cajon'
import { ponerVerSolicitud } from '@/lib/sesionfotos/puente'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { Marca } from '@/lib/nav'
import { filtrarPorFuncion, ordenarResumenes, resumenFoto, resumenInterna, type ResumenSolicitud } from '@/lib/solicitudes/overview'
import { horaLabel, marcasVisibles, modoInicio, origenesDe, pendientesDeTrabajo, tituloPendientes } from '@/lib/inicio/core'

const POLL_MS = 180000 // refresco automático cada 3 min (como el legacy)

/**
 * Inicio: lo que hay que hacer hoy, según la función de cada uno.
 *
 * Dos cambios de fondo respecto de la versión anterior:
 *
 * 1. **Lee las solicitudes de los dos cajones**, no solo el de sesión de fotos. Con el
 *    modelo nuevo (una solicitud con motivo y destino) mirar un solo cajón mostraba la
 *    mitad del trabajo: quien pedía productos para un video no aparecía por ningún lado.
 * 2. **Arranca con las acciones**, no con una lista. El local entra al monitor a cargar una
 *    falla o un cambio; tenerlos como primer elemento evita el paseo por el menú. Cada
 *    botón aparece solo si esa persona puede hacerlo.
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
    ve('postventa-local') && { label: '+ Falla', ruta: '/postventa-local', destacado: true },
    ve('cambios-local') && { label: '+ Cambio', ruta: '/cambios-local', destacado: true },
    ve('postventa-deposito') && { label: '+ Falla (depósito)', ruta: '/postventa-deposito' },
    ve('reposicion') && { label: '🔁 Reposición', ruta: '/reposicion' },
    ve('postventa') && { label: '🧾 Post-venta', ruta: '/postventa' },
    ve('solicitudes') && { label: '📋 Solicitudes', ruta: '/solicitudes' },
  ].filter((a): a is { label: string; ruta: string; destacado?: boolean } => !!a)

  return (
    <div className="card">
      {aprobaciones > 0 && (
        <div
          onClick={() => router.push('/solicitudes')}
          style={{ background: '#FFFBEB', border: '1px solid #FBBF24', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400E', cursor: 'pointer', marginBottom: 14 }}
        >
          ⏳ {aprobaciones === 1 ? 'Hay 1 solicitud de consumo esperando tu aprobación' : `Hay ${aprobaciones} solicitudes de consumo esperando tu aprobación`}.{' '}
          <span style={{ color: '#2563EB', textDecoration: 'underline' }}>Ver</span>
        </div>
      )}

      {acciones.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {acciones.map((a) => (
            <button
              key={a.ruta}
              onClick={() => router.push(a.ruta)}
              style={
                a.destacado
                  ? { fontSize: 14, fontWeight: 700, padding: '10px 18px', borderRadius: 10, border: '1px solid #D97706', background: '#FFFBEB', color: '#B45309', cursor: 'pointer' }
                  : { fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 10, border: '1px solid #D1D5DB', background: '#fff', color: '#374151', cursor: 'pointer' }
              }
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {modo === 'gerencial' ? (
        // Dirección/Admin: el frente no es la lista de tareas, sino el panel de decisiones.
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>👋 Inicio</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: '#6B7280' }}>
            <span>
              📋 {pend === null ? '…' : pend.length === 1 ? '1 solicitud en curso' : `${pend.length} solicitudes en curso`}.
            </span>
            <button className="btn-sm" onClick={() => router.push('/solicitudes')} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
              Ver solicitudes
            </button>
            <button className="btn-sm" onClick={() => router.push('/gerencial')} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
              🎯 Panel gerencial
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {tituloPendientes(origenes)}
              {pend && pend.length ? ` (${pend.length})` : ''}
            </div>
            <button className="btn-sm" onClick={() => void cargar()} style={{ background: '#fff', border: '1px solid #D1D5DB', marginLeft: 'auto' }}>
              🔄 Actualizar
            </button>
          </div>

          {pend === null ? (
            <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>
          ) : pend.length === 0 ? (
            <div style={{ color: '#059669', fontSize: 14, padding: '14px 4px' }}>
              {origenes.length ? '✅ No tenés nada pendiente en tu sector.' : '✅ Todo al día — no hay solicitudes en curso.'}
            </div>
          ) : (
            pend.map((r) => (
              <div key={`${r.seccion}-${r.marca}-${r.id}`} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid #E5E7EB', borderRadius: 9, padding: '9px 11px', marginBottom: 7, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180, cursor: 'pointer' }} onClick={() => ver(r)}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <MarcaChip marca={r.marca} />
                    <span style={{ fontWeight: 600 }}>{r.titulo}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: r.color, background: r.bg, borderRadius: 6, padding: '1px 7px' }}>{r.estadoLabel}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                    {r.subtitulo} · {unidadesDe(r, origenes)} · creada por {r.creadoPor || '—'} · {horaLabel(r.creado, r.fecha)}
                  </div>
                </div>
                <button className="btn-sm" onClick={() => ver(r)} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
                  Ver
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** Las unidades que le tocan a este usuario: en un sector, solo las de su origen. */
function unidadesDe(r: ResumenSolicitud, origenes: ReturnType<typeof origenesDe>): string {
  const n = origenes.length ? origenes.reduce((a, o) => a + (o === 'local' ? r.uLocal : r.uDeposito), 0) : r.unidades
  const sufijo = origenes.length ? ' en tu sector' : ''
  return `${n} ${n === 1 ? 'unidad' : 'unidades'}${sufijo}`
}

function MarcaChip({ marca }: { marca: Marca }) {
  return marca === 'zattia' ? (
    <span style={{ background: '#EDE9FE', color: '#5B21B6', borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>Zattia</span>
  ) : (
    <span style={{ background: '#DBEAFE', color: '#1E40AF', borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>BDI</span>
  )
}

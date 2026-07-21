'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { CUENTAS } from '@/lib/cuentas'
import { leerLista } from '@/lib/kv/cliente'
import { ponerVerSolicitud } from '@/lib/sesionfotos/puente'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import { InfoPopover } from '@/components/ui/InfoPopover'
import type { Marca } from '@/lib/nav'
import { filtrarPorFuncion, ordenarResumenes, resumenFoto, resumenInterna, veTodo, type GrupoEstado, type ResumenSolicitud } from '@/lib/solicitudes/overview'

const POLL_MS = 180000

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
  const router = useRouter()
  const [datos, setDatos] = useState<ResumenSolicitud[] | null>(null)
  const [filtro, setFiltro] = useState<GrupoEstado | 'todas'>('todas')
  const [busqueda, setBusqueda] = useState('')

  const marcas = useMemo<Marca[]>(() => (perfil?.cuenta ? [perfil.cuenta] : (Object.keys(CUENTAS) as Marca[])), [perfil])

  const cargar = useCallback(async () => {
    const partes = await Promise.all(
      marcas.map(async (m) => {
        const [f, i] = await Promise.all([leerLista<Solicitud>('sesionfotos', m), leerLista<SolicitudInterna>('solicitudesinternas', m)])
        const rf = f.ok ? f.dato.map((s) => resumenFoto(s, m)) : []
        const ri = i.ok ? i.dato.map((s) => resumenInterna(s, m)) : []
        return [...rf, ...ri]
      }),
    )
    setDatos(ordenarResumenes(filtrarPorFuncion(partes.flat(), perfil)))
  }, [marcas, perfil])

  useEffect(() => {
    void (async () => {
      await cargar()
    })()
    const t = setInterval(() => void cargar(), POLL_MS)
    return () => clearInterval(t)
  }, [cargar])

  const q = busqueda.trim().toLowerCase()
  const lista = (datos || []).filter(
    (r) => (filtro === 'todas' || r.grupo === filtro) && (!q || r.titulo.toLowerCase().includes(q) || r.subtitulo.toLowerCase().includes(q) || (r.creadoPor || '').toLowerCase().includes(q)),
  )

  const ver = (r: ResumenSolicitud) => {
    if (marca !== r.marca) setMarca(r.marca)
    if (r.seccion === 'sesion-fotos') ponerVerSolicitud(r.id)
    router.push(r.seccion === 'sesion-fotos' ? '/sesion-fotos' : '/solicitudes-internas')
  }

  const sector = !veTodo(perfil)

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>📋 Solicitudes</div>
        <InfoPopover titulo="Solicitudes (vista unificada)">
          Estado de todas las solicitudes —Sesión de fotos e internas— de las marcas que ves. {sector ? 'Ves solo lo que tiene productos de tu sector.' : 'Ves todas.'} Es
          solo lectura: para preparar, crear venta GN, devolver, etc., entrá a la solicitud (botón “Ver”).
        </InfoPopover>
        <button className="btn-sm" onClick={() => void cargar()} style={{ background: '#fff', border: '1px solid #D1D5DB', marginLeft: 'auto' }}>
          🔄 Actualizar
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        {FILTROS.map((f) => (
          <button
            key={f.k}
            onClick={() => setFiltro(f.k)}
            style={{ border: `1px solid ${filtro === f.k ? '#378ADD' : '#D1D5DB'}`, background: filtro === f.k ? '#378ADD' : '#fff', color: filtro === f.k ? '#fff' : '#374151', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
          >
            {f.label}
          </button>
        ))}
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔎 Buscar…" style={{ flex: 1, minWidth: 160, padding: '7px 9px', border: '1px solid #D1D5DB', borderRadius: 7 }} />
      </div>

      {datos === null ? (
        <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando solicitudes…</div>
      ) : lista.length === 0 ? (
        <div style={{ color: '#059669', fontSize: 14, padding: '14px 4px' }}>✅ No hay solicitudes en este filtro.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {lista.map((r) => (
            <div key={`${r.seccion}-${r.marca}-${r.id}`} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid #E5E7EB', borderRadius: 9, padding: '9px 11px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200, cursor: 'pointer' }} onClick={() => ver(r)}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <MarcaChip marca={r.marca} />
                  <span style={{ fontWeight: 600 }}>{r.titulo}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: r.color, background: r.bg, borderRadius: 6, padding: '1px 7px' }}>{r.estadoLabel}</span>
                  {r.estadoTag ? <span style={{ fontSize: 11, fontWeight: 700, color: '#B91C1C', background: '#FEF2F2', borderRadius: 6, padding: '1px 7px' }}>⚠ {r.estadoTag}</span> : null}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                  {r.subtitulo} · {r.unidades} u.
                  {sector ? ` (local ${r.uLocal} · dep ${r.uDeposito})` : ''} · creada por {r.creadoPor || '—'} · {horaCorta(r.creado, r.fecha)}
                </div>
              </div>
              <button className="btn-sm" onClick={() => ver(r)} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
                Ver
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MarcaChip({ marca }: { marca: Marca }) {
  return marca === 'zattia' ? (
    <span style={{ background: '#EDE9FE', color: '#5B21B6', borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>Zattia</span>
  ) : (
    <span style={{ background: '#DBEAFE', color: '#1E40AF', borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>BDI</span>
  )
}

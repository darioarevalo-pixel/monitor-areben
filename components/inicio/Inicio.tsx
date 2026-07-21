'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { leerLista } from '@/lib/kv/cliente'
import { ponerVerSolicitud } from '@/lib/sesionfotos/puente'
import { contarPendientes } from '@/lib/solicitudes-internas/core'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { Marca } from '@/lib/nav'
import { filtrarPorOrigen, horaLabel, marcasVisibles, modoInicio, ordenar, origenesDe, pendientesDeMarca, type PendienteFoto } from '@/lib/inicio/core'

const POLL_MS = 180000 // refresco automático cada 3 min (como el legacy)

/**
 * Inicio (novedades del día). Port de la sección inicio* (index.html:9713-9784):
 * lista las solicitudes de Sesión de fotos PENDIENTES de armar de todas las marcas
 * que el usuario ve, y desde cada una abre esa solicitud (cambiando de marca si hace
 * falta) vía el puente `ponerVerSolicitud`. Además, al aprobador de solicitudes
 * internas le muestra un aviso de cuántas tiene para aprobar.
 */
export function Inicio() {
  const { perfil, marca, setMarca } = useSesion()
  const router = useRouter()
  const [pend, setPend] = useState<PendienteFoto[] | null>(null)
  const [avisoSI, setAvisoSI] = useState(0)

  const esAprobador = esAdmin(perfil) || puedeSub(perfil, marca, 'solicitudes-internas', 'aprobar')

  const cargar = useCallback(async () => {
    const marcas = marcasVisibles(perfil)
    const results = await Promise.all(marcas.map((m) => leerLista<Solicitud>('sesionfotos', m)))
    setPend(ordenar(results.flatMap((r, i) => (r.ok ? pendientesDeMarca(r.dato, marcas[i]) : []))))
    // Aviso de solicitudes internas para aprobar (marca actual).
    if (esAprobador) {
      const r = await leerLista<SolicitudInterna>('solicitudesinternas', marca)
      setAvisoSI(r.ok ? contarPendientes(r.dato) : 0)
    } else {
      setAvisoSI(0)
    }
  }, [perfil, marca, esAprobador])

  useEffect(() => {
    // El IIFE async evita el set-state-in-effect (cargar es async y hace setState).
    void (async () => {
      await cargar()
    })()
    const t = setInterval(() => void cargar(), POLL_MS)
    return () => clearInterval(t)
  }, [cargar])

  const ver = (p: PendienteFoto) => {
    ponerVerSolicitud(p.id)
    if (marca !== p.marca) setMarca(p.marca)
    router.push('/sesion-fotos')
  }

  const modo = modoInicio(perfil)
  const origenes = origenesDe(perfil)
  // En modo sector: solo lo pendiente de MI origen (retirar en local / preparar en depósito).
  const lista = pend === null ? null : modo === 'sector' ? filtrarPorOrigen(pend, origenes) : pend
  // Unidades relevantes por fila: en sector, solo las de mi origen; si no, el total.
  const uDe = (p: PendienteFoto) => (modo === 'sector' ? origenes.reduce((a, o) => a + (o === 'local' ? p.uLocal : p.uDeposito), 0) : p.unidades)

  const soloLocal = origenes.length === 1 && origenes[0] === 'local'
  const soloDep = origenes.length === 1 && origenes[0] === 'deposito'
  const tituloSector = soloLocal ? '🏪 Pendiente de retirar en local' : soloDep ? '📦 Pendiente de preparar en depósito' : '📋 Tus tareas pendientes'
  const titulo = modo === 'sector' ? tituloSector : '📸 Solicitudes de fotos para armar'
  const vacioMsg = modo === 'sector' ? '✅ No tenés nada pendiente en tu sector.' : '✅ Todo al día — no hay solicitudes de fotos pendientes de armar.'

  return (
    <div className="card">
      {avisoSI > 0 && (
        <div
          onClick={() => router.push('/solicitudes-internas')}
          style={{ background: '#FFFBEB', border: '1px solid #FBBF24', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400E', cursor: 'pointer' }}
        >
          ⏳ Tenés <b>{avisoSI}</b> solicitud(es) interna(s) para aprobar. <span style={{ color: '#2563EB', textDecoration: 'underline' }}>Ver</span>
        </div>
      )}

      {modo === 'gerencial' ? (
        // Dirección/Admin: el frente NO son las fotos para armar; solo un resumen discreto.
        <div style={{ marginTop: avisoSI > 0 ? 14 : 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>👋 Inicio</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: '#6B7280' }}>
            <span>
              📸 {pend === null ? '…' : pend.length} solicitud(es) de fotos pendientes de armar.
            </span>
            <button className="btn-sm" onClick={() => router.push('/sesion-fotos')} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
              Ver Sesión de fotos
            </button>
            <button className="btn-sm" onClick={() => router.push('/gerencial')} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
              🎯 Panel gerencial
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: avisoSI > 0 ? 14 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {titulo}{lista && lista.length ? ` (${lista.length})` : ''}
            </div>
            <button className="btn-sm" onClick={() => void cargar()} style={{ background: '#fff', border: '1px solid #D1D5DB', marginLeft: 'auto' }}>
              🔄 Actualizar
            </button>
          </div>

          {lista === null ? (
            <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>
          ) : lista.length === 0 ? (
            <div style={{ color: '#059669', fontSize: 14, padding: '14px 4px' }}>{vacioMsg}</div>
          ) : (
            lista.map((p) => (
              <div key={`${p.marca}-${p.id}`} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid #E5E7EB', borderRadius: 9, padding: '9px 11px', marginBottom: 7, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180, cursor: 'pointer' }} onClick={() => ver(p)}>
                  <div style={{ fontWeight: 600 }}>
                    <MarcaChip marca={p.marca} /> {p.descripcion || '(sin descripción)'}
                  </div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {uDe(p)} u.{modo === 'sector' ? ' en tu sector' : ''} · creada por {p.creadoPor || '—'} · {horaLabel(p.creado, p.fecha)}
                  </div>
                </div>
                <button className="btn-sm" onClick={() => ver(p)} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
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

function MarcaChip({ marca }: { marca: Marca }) {
  return marca === 'zattia' ? (
    <span style={{ background: '#EDE9FE', color: '#5B21B6', borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>Zattia</span>
  ) : (
    <span style={{ background: '#DBEAFE', color: '#1E40AF', borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>BDI</span>
  )
}

'use client'

/**
 * «Ayuda / problemas» (Bruno, 12-oct): un botón fijo abajo a la derecha, en todo el monitor, para dejar
 * registrado algo que falta mejorar o un problema que pasó. La sección y la URL se guardan solas; el
 * autor, el servidor (de la sesión). Un admin ve la lista en el mismo botón y los marca resueltos.
 * En el POS va abajo a la IZQUIERDA: a la derecha está «Continuar al cobro».
 */
import { useEffect, useState } from 'react'

import { Badge, Button, Field, Modal, Notice, color, font, radius, space, weight } from '@/components/ui'
import { crearReporte, leerReportes, marcarReporte, type Reporte, type TipoReporte } from '@/lib/reportes/cliente'

const fechaCorta = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })

export function BotonReportes({ seccion, admin, lado = 'derecha' }: { seccion: string | null; admin: boolean; lado?: 'derecha' | 'izquierda' }) {
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<TipoReporte>('problema')
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ tono: 'success' | 'danger'; texto: string } | null>(null)
  const [lista, setLista] = useState<Reporte[] | null>(null)
  const [errLista, setErrLista] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || !admin) return
    let vivo = true
    leerReportes()
      .then((r) => vivo && setLista(r))
      .catch((e) => vivo && setErrLista((e as Error).message))
    return () => {
      vivo = false
    }
  }, [abierto, admin])

  async function guardar() {
    setGuardando(true)
    setMsg(null)
    try {
      await crearReporte({ tipo, texto, seccion, url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null })
      setTexto('')
      setMsg({ tono: 'success', texto: 'Guardado. Queda registrado para revisarlo.' })
      if (admin) setLista(await leerReportes())
    } catch (e) {
      setMsg({ tono: 'danger', texto: (e as Error).message })
    } finally {
      setGuardando(false)
    }
  }

  async function marcar(r: Reporte) {
    try {
      const { reporte } = await marcarReporte(r.id, r.estado === 'abierto' ? 'resuelto' : 'abierto')
      setLista((l) => (l ?? []).map((x) => (x.id === reporte.id ? reporte : x)))
    } catch (e) {
      setErrLista((e as Error).message)
    }
  }

  const abiertos = (lista ?? []).filter((r) => r.estado === 'abierto')
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAbierto(true)
          setMsg(null)
        }}
        title="Reportar un problema o proponer una mejora"
        style={{
          position: 'fixed',
          bottom: 16,
          [lado === 'derecha' ? 'right' : 'left']: 16,
          // Debajo de las ventanas (`.mo-backdrop`, z 200): en el celular tapaba el botón de guardar de
          // «Nueva tarea» (Darío, 20-oct). Con una ventana abierta queda atrás del velo, como el resto.
          zIndex: 150,
          height: 'auto',
          padding: `${space[2]}px ${space[3]}px`,
          borderRadius: radius.pill,
          border: `1px solid ${color.line2}`,
          background: color.surface,
          color: color.ink2,
          fontSize: font.sm,
          fontWeight: weight.semibold,
          boxShadow: '0 2px 8px rgba(0,0,0,.12)',
          cursor: 'pointer',
        }}
      >
        Reportar un problema
      </button>
      {abierto && (
        <Modal abierto onCerrar={() => setAbierto(false)} titulo="Reportar un problema" ancho={admin ? 'xl' : undefined}>
          <div style={{ display: 'grid', gap: space[3] }}>
            <div style={{ display: 'flex', gap: space[2] }}>
              {(['problema', 'falta'] as const).map((t) => (
                <Button key={t} size="sm" variant={tipo === t ? 'solid' : 'outline'} tone={tipo === t ? 'brand' : 'neutral'} onClick={() => setTipo(t)} aria-pressed={tipo === t}>
                  {t === 'problema' ? 'Algo no funciona' : 'Propuesta de mejora'}
                </Button>
              ))}
            </div>
            <Field label={tipo === 'problema' ? '¿Qué pasó? Contá qué estabas haciendo.' : '¿Qué mejorarías?'}>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={5}
                maxLength={4000}
                style={{ width: '100%', resize: 'vertical', padding: space[2], border: `1px solid ${color.line2}`, borderRadius: radius.md, font: 'inherit', fontSize: font.base }}
                data-foco
              />
            </Field>
            <span style={{ fontSize: font.sm, color: color.mut }}>Se guarda con tu usuario y la pantalla en la que estás.</span>
            <div>
              <Button tone="brand" variant="solid" loading={guardando} disabled={!texto.trim()} onClick={guardar}>
                Guardar
              </Button>
            </div>
            {msg && <Notice tone={msg.tono}>{msg.texto}</Notice>}
            {admin && (
              <div style={{ display: 'grid', gap: space[1.5], borderTop: `1px solid ${color.line}`, paddingTop: space[3] }}>
                <b style={{ fontSize: font.base }}>Reportes{lista ? ` · ${abiertos.length} ${abiertos.length === 1 ? 'abierto' : 'abiertos'}` : ''}</b>
                {errLista && <Notice tone="danger">{errLista}</Notice>}
                {!lista && !errLista && <span style={{ fontSize: font.sm, color: color.mut }}>Leyendo…</span>}
                {lista && lista.length === 0 && <span style={{ fontSize: font.sm, color: color.mut }}>Reportes: ninguno.</span>}
                {(lista ?? []).map((r) => (
                  <div key={r.id} style={{ display: 'grid', gap: space[0.5], padding: space[2], border: `1px solid ${color.line}`, borderRadius: radius.md, opacity: r.estado === 'resuelto' ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm }}>
                      <Badge tone={r.tipo === 'problema' ? 'danger' : 'warning'}>{r.tipo === 'problema' ? 'Problema' : 'Mejora'}</Badge>
                      <b>{r.autor}</b>
                      <span style={{ color: color.mut }}>{fechaCorta(r.creado_en)}</span>
                      {r.seccion && <span style={{ color: color.mut }}>· {r.seccion}</span>}
                      <span style={{ flex: 1 }} />
                      <Button size="sm" variant="ghost" onClick={() => marcar(r)}>
                        {r.estado === 'abierto' ? 'Marcar resuelto' : 'Reabrir'}
                      </Button>
                    </div>
                    <span style={{ whiteSpace: 'pre-wrap', fontSize: font.base }}>{r.texto}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

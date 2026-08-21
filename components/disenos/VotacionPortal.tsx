'use client'

/**
 * Lo que ve quien abre el link de votación de diseños, en el celular. Sin login.
 *
 * Vive dentro del catch-all (`app/[[...seccion]]/page.tsx`, key `votacion`) y no en una ruta propia
 * de Next porque una ruta nueva sería una función serverless más y el proyecto está en el tope del
 * plan Hobby: pasarse frena TODOS los deploys en silencio.
 *
 * Es interno —lo abre el equipo, el link se pasa por WhatsApp—, pero está **abierto a internet**:
 * lo que se muestra sale de `paraElVotante` en `lib/disenos/votacion.core.js`, que deja pasar tres
 * campos y ninguno más. La nota del tablero ("Pros / contras") no llega hasta acá.
 *
 * Tres decisiones, todas para que la persona termine:
 *   - **Se guarda solo**, con un respiro de 600 ms. Nada de un botón "Enviar" al final: si se corta
 *     a la mitad, lo que puntuó quedó.
 *   - **Puede volver y corregir.** El `votanteId` vive en el navegador del que vota y la boleta se
 *     pisa entera, así que el mismo link reabre lo que ya había puesto.
 *   - **El nombre va primero y es obligatorio**: el punto de la ronda es saber quién dijo qué.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { guardarBoleta, leerVotacion, type VistaDelVotante } from '@/lib/disenos/votacion'

/** Espejo de `MAX_PUNTAJE` en `lib/disenos/votacion.core.js`. Si cambia allá, cambia acá. */
const MAX = 5
const KEY_VOTANTE = 'monitor_votante_id'
const KEY_NOMBRE = 'monitor_votante_nombre'

/** Id de dispositivo. No identifica a nadie: sólo permite volver al link y corregir el voto. */
function votanteId(): string {
  try {
    let v = localStorage.getItem(KEY_VOTANTE)
    if (!v) {
      v = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      localStorage.setItem(KEY_VOTANTE, v)
    }
    return v
  } catch {
    // Navegador con el almacenamiento bloqueado: vota igual, pero no va a poder corregir después.
    return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  }
}

export function VotacionPortal({ token }: { token: string | null }) {
  const [vista, setVista] = useState<VistaDelVotante | null>(null)
  const [cargando, setCargando] = useState(true)
  const [noExiste, setNoExiste] = useState(false)
  const [nombre, setNombre] = useState('')
  const [puntajes, setPuntajes] = useState<Record<string, number>>({})
  const [estado, setEstado] = useState('')
  const [zoom, setZoom] = useState<string | null>(null)
  const yo = useRef<string>('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nombreRef = useRef<HTMLInputElement>(null)

  // El setState va dentro del await y no en el cuerpo del effect: el linter del repo rechaza el
  // setState síncrono ahí. Mismo patrón que `ReclamoPublico`.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!token) { if (vivo) { setNoExiste(true); setCargando(false) } return }
      yo.current = votanteId()
      try {
        const d = await leerVotacion(token, yo.current)
        if (!vivo) return
        if (!d) { setNoExiste(true); return }
        setVista(d.votacion)
        // Lo que ya había votado gana sobre el nombre guardado en este navegador: es lo que el
        // equipo va a ver en la planilla, y tiene que coincidir con lo que ya está adentro.
        if (d.miBoleta) {
          setPuntajes(d.miBoleta.puntajes || {})
          if (d.miBoleta.nombre) setNombre(d.miBoleta.nombre)
          else setNombre(localStorage.getItem(KEY_NOMBRE) || '')
        } else {
          try { setNombre(localStorage.getItem(KEY_NOMBRE) || '') } catch { /* sin storage */ }
        }
      } catch {
        if (vivo) setEstado('No se pudo conectar. Probá de nuevo en un minuto.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [token])

  const guardar = useCallback((nom: string, pts: Record<string, number>) => {
    if (!token) return
    if (timer.current) clearTimeout(timer.current)
    setEstado('Guardando…')
    timer.current = setTimeout(() => {
      void (async () => {
        try {
          await guardarBoleta(token, yo.current, nom, pts)
          setEstado('✓ Guardado. Podés seguir cambiando tus puntajes.')
        } catch (e) {
          setEstado('⚠️ ' + (e as Error).message)
        }
      })()
    }, 600)
  }, [token])

  const puntuar = (id: string, n: number) => {
    if (!nombre.trim()) {
      nombreRef.current?.focus()
      setEstado('👆 Primero poné tu nombre arriba.')
      return
    }
    // El siguiente estado se calcula ACÁ y no adentro del actualizador de `setPuntajes`: React
    // puede llamar a un actualizador más de una vez, y disparar el guardado desde adentro haría
    // salir dos POST por cada toque de estrella.
    const sig = { ...puntajes }
    // Tocar la misma estrella otra vez despunta: es la única forma de deshacerse de un voto puesto
    // sin querer, y en el celular pasa.
    if (sig[id] === n) delete sig[id]
    else sig[id] = n
    setPuntajes(sig)
    guardar(nombre.trim(), sig)
  }

  // Estilos propios y no el kit del Monitor: esto lo abre alguien en un teléfono y no tiene que
  // parecerse a un panel de administración. Mismo criterio que `ReclamoPublico`.
  const caja: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: 16, fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1c1c1e' }

  if (cargando) return <div style={caja}>Cargando…</div>

  if (noExiste) {
    return (
      <div style={{ ...caja, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Este link ya no está disponible</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
          Puede que la votación se haya cerrado o que el link haya vencido. Pedí uno nuevo al equipo.
        </p>
      </div>
    )
  }

  const items = vista?.disenos || []
  const hechos = items.filter((d) => puntajes[d.id]).length

  return (
    <div style={{ background: '#F3F4F6', minHeight: '100dvh', paddingBottom: 70 }}>
      <header style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '12px 16px', zIndex: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{vista?.titulo || 'Votación de diseños'}</div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
          {items.length} {items.length === 1 ? 'diseño' : 'diseños'} · puntuaste {hechos}
        </div>
      </header>

      <div style={caja}>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <label htmlFor="nombre" style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Tu nombre <span style={{ fontWeight: 400, color: '#6B7280' }}>(para saber quién votó)</span>
          </label>
          <input
            id="nombre"
            ref={nombreRef}
            type="text"
            value={nombre}
            autoComplete="name"
            placeholder="Ej: Sofía"
            maxLength={60}
            onChange={(e) => {
              setNombre(e.target.value)
              try { localStorage.setItem(KEY_NOMBRE, e.target.value) } catch { /* sin storage */ }
              if (Object.keys(puntajes).length) guardar(e.target.value.trim(), puntajes)
            }}
            style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: '1px solid #D1D5DB', borderRadius: 9, boxSizing: 'border-box' }}
          />
        </div>

        {!items.length ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#6B7280' }}>Esta votación no tiene diseños.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
            {items.map((d) => (
              <div key={d.id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.url}
                  alt={d.name}
                  onClick={() => setZoom(d.url)}
                  style={{ width: '100%', height: 150, objectFit: 'cover', background: '#F3F4F6', display: 'block', cursor: 'zoom-in' }}
                />
                <div style={{ fontSize: 12, fontWeight: 600, padding: '7px 8px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.name}>
                  {d.name || '—'}
                </div>
                <div style={{ display: 'flex', gap: 2, padding: '0 6px 9px' }}>
                  {Array.from({ length: MAX }, (_, i) => i + 1).map((n) => {
                    const puesto = (puntajes[d.id] || 0) >= n
                    return (
                      <button
                        key={n}
                        onClick={() => puntuar(d.id, n)}
                        aria-label={`${n} de ${MAX} a ${d.name || 'este diseño'}`}
                        aria-pressed={puntajes[d.id] === n}
                        style={{
                          flex: 1, padding: '8px 0', fontSize: 18, lineHeight: 1, border: 'none',
                          background: 'transparent', cursor: 'pointer',
                          filter: puesto ? 'none' : 'grayscale(1)', opacity: puesto ? 1 : 0.35,
                        }}
                      >
                        ★
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', borderTop: '1px solid #E5E7EB', padding: '10px 16px', textAlign: 'center', fontSize: 13, color: '#374151' }}>
        {estado || 'Tocá las estrellas: 1 es "no me gusta" y 5 es "me encanta". Se guarda solo.'}
      </div>

      {zoom && (
        <div
          onClick={() => setZoom(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50, cursor: 'zoom-out' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" style={{ maxWidth: '96%', maxHeight: '96%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}

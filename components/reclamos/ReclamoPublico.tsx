'use client'

/**
 * Lo que ve el CLIENTE cuando abre el link que le mandamos por WhatsApp. Sin login, en el
 * celular, probablemente con poca señal y menos paciencia.
 *
 * Vive dentro del catch-all (`app/[[...seccion]]/page.tsx`, key `reclamo`) y no en una ruta
 * propia de Next porque una ruta nueva sería una función serverless más y el proyecto está en el
 * tope del plan Hobby: pasarse frena TODOS los deploys en silencio.
 *
 * Tres decisiones de diseño, todas por la misma razón —que la persona termine—:
 *   - **Las fotos se suben de a una, apenas se eligen.** Nada de "elegir todo y después enviar":
 *     si se corta a la mitad, lo que ya subió quedó.
 *   - **Se reducen en el teléfono antes de subir** (`imgAThumb`): una foto de celular son varios
 *     MB y con datos móviles eso es medio minuto y a veces un fallo.
 *   - **El texto es opcional.** Lo que necesitamos para decidir es la foto.
 */

import { useEffect, useRef, useState } from 'react'
import { imgAThumb } from '@/lib/imagenes'

const API = '/api/postventa?recurso=reclamo'
/** Suficiente para ver una falla, y liviano para subir con datos móviles. */
const LADO_MAX = 1400

type Vista = {
  numero: string
  orden: string | null
  estado: string
  productos: { producto: string; variante?: string | null; cantidad: number | string }[]
  fotos: string[]
  relato: string
  puedeSubir: boolean
}

export function ReclamoPublico({ token }: { token: string | null }) {
  const [vista, setVista] = useState<Vista | null>(null)
  const [cargando, setCargando] = useState(true)
  const [noExiste, setNoExiste] = useState(false)
  const [relato, setRelato] = useState('')
  const [subiendo, setSubiendo] = useState(0)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // El setState va dentro del await y no en el cuerpo del effect: el linter del repo rechaza el
  // setState síncrono ahí (dispara renders en cascada). Mismo patrón que el resto de las secciones.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!token) { if (vivo) { setNoExiste(true); setCargando(false) } return }
      try {
        const r = await fetch(`${API}&token=${encodeURIComponent(token)}&nc=${Date.now()}`)
        const d = r.ok ? await r.json().catch(() => null) : null
        if (!vivo) return
        if (!d?.ok) { setNoExiste(true); return }
        setVista(d.reclamo as Vista)
        setRelato((d.reclamo as Vista).relato || '')
      } catch {
        if (vivo) setError('No se pudo conectar. Probá de nuevo en un minuto.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [token])

  const subir = (files: FileList | null) => {
    const arr = [...(files || [])].filter((f) => /^image\//.test(f.type))
    if (!arr.length) return
    setError(null)
    for (const f of arr) {
      setSubiendo((n) => n + 1)
      imgAThumb(
        f,
        async (dataUrl) => {
          try {
            const r = await fetch(API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, accion: 'foto', dataUrl }),
            })
            const d = await r.json().catch(() => ({}))
            if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo subir la foto.')
            setVista((v) => (v ? { ...v, fotos: [...v.fotos, d.url], puedeSubir: d.restantes > 0 } : v))
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setSubiendo((n) => n - 1)
          }
        },
        LADO_MAX,
        (msg) => { setError(msg); setSubiendo((n) => n - 1) },
      )
    }
  }

  const enviar = async () => {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, accion: 'enviar', relato }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo enviar.')
      setEnviado(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // Estilos propios y no el kit del Monitor: esto lo abre alguien de afuera, en un teléfono, y no
  // tiene que parecerse a un panel de administración.
  const caja: React.CSSProperties = { maxWidth: 520, margin: '0 auto', padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1c1c1e' }

  if (cargando) return <div style={caja}>Cargando…</div>

  if (noExiste) {
    return (
      <div style={{ ...caja, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Este link ya no está disponible</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
          Puede que haya vencido o que tu reclamo ya esté resuelto. Escribinos y te pasamos uno nuevo.
        </p>
      </div>
    )
  }

  if (enviado) {
    return (
      <div style={{ ...caja, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>¡Listo, gracias!</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
          Ya lo estamos revisando. Te escribimos por WhatsApp con la respuesta.
        </p>
      </div>
    )
  }

  return (
    <div style={caja}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Contanos qué pasó</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
        Reclamo {vista?.numero}{vista?.orden ? ` · pedido #${vista.orden}` : ''}
      </p>

      {!!vista?.productos.length && (
        <div style={{ background: '#f5f5f7', borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Sobre estos productos</div>
          {vista.productos.map((p, i) => (
            <div key={i} style={{ fontSize: 15 }}>
              {p.cantidad} × {p.producto}{p.variante ? ` (${p.variante})` : ''}
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 16, marginBottom: 6 }}>Fotos</h2>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 10 }}>
        Sacale una foto donde se vea el problema. Es lo que más nos ayuda a resolverlo rápido.
      </p>

      {!!vista?.fotos.length && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {vista.fotos.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8 }} />
          ))}
        </div>
      )}

      {/**
        * 🔴 **Sin `capture`, y no es un olvido.** `capture="environment"` no es una preferencia: es
        * una orden al sistema operativo de abrir la CÁMARA y saltear el selector. En Android eso
        * deja a la persona sin galería, y la foto de la falla casi nunca se saca en el momento en
        * que abre el link — ya la tenía sacada, o se la mandó otro por WhatsApp desde otro
        * teléfono. Reportado el 27-ago-2026: *«no se podía adjuntar fotos desde otro celular, solo
        * abre la cámara»*.
        *
        * Sin el atributo, los dos caminos siguen ahí: iOS ofrece «Fototeca / Sacar foto / Elegir
        * archivo» y Android el selector con la cámara adentro. Sacarlo no quita la cámara: agrega
        * la galería.
        */}
      <input
        ref={fileRef} type="file" accept="image/*" multiple
        style={{ display: 'none' }} onChange={(e) => { subir(e.target.files); e.target.value = '' }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={!vista?.puedeSubir || subiendo > 0}
        style={{
          width: '100%', padding: '14px', fontSize: 16, borderRadius: 10, cursor: 'pointer',
          border: '1px dashed #9ca3af', background: '#fff', color: '#1c1c1e',
        }}
      >
        {subiendo > 0 ? `Subiendo ${subiendo}…` : vista?.puedeSubir ? '📷 Agregar una foto' : 'Ya subiste el máximo de fotos'}
      </button>

      <h2 style={{ fontSize: 16, margin: '24px 0 6px' }}>¿Qué le pasa? <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 14 }}>(opcional)</span></h2>
      <textarea
        value={relato} onChange={(e) => setRelato(e.target.value)} rows={4} maxLength={2000}
        placeholder="Contanos con tus palabras…"
        style={{ width: '100%', padding: 12, fontSize: 16, borderRadius: 10, border: '1px solid #d1d5db', fontFamily: 'inherit', resize: 'vertical' }}
      />

      {error && (
        <div style={{ background: '#fef2f2', color: '#991b1b', padding: 12, borderRadius: 10, marginTop: 12, fontSize: 14 }}>{error}</div>
      )}

      <button
        onClick={() => void enviar()}
        disabled={subiendo > 0 || !vista?.fotos.length}
        style={{
          width: '100%', padding: '15px', fontSize: 16, fontWeight: 600, borderRadius: 10, marginTop: 20,
          border: 'none', cursor: subiendo > 0 || !vista?.fotos.length ? 'not-allowed' : 'pointer',
          background: subiendo > 0 || !vista?.fotos.length ? '#d1d5db' : '#4f46e5', color: '#fff',
        }}
      >
        Enviar
      </button>
      {!vista?.fotos.length && (
        <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginTop: 8 }}>
          Subí al menos una foto para poder enviar.
        </p>
      )}
    </div>
  )
}

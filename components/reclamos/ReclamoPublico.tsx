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
/**
 * Del kit, y es la única excepción a «estilos propios» de esta pantalla: una foto a pantalla
 * completa sobre fondo negro no se parece a un panel de administración, así que la razón de no usar
 * el kit acá no aplica. Se importa **derecho y no por el barrel** (`@/components/ui`), que
 * arrastraría el kit entero al chunk de una pantalla que se abre con datos móviles.
 *
 * `.mo-lightbox` vive en `components/ui/kit.css`, que carga el layout raíz ⇒ también está acá.
 */
import { Lightbox } from '@/components/ui/Lightbox'
import { AltaPublica } from './AltaPublica'

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
  /**
   * 🔴 **Si este caso tiene una foto que pedir**, derivado del motivo por el servidor
   * (`pideFotosAlCliente`). ⛔ No es el motivo: el cliente ⛔ no ve nuestra taxonomía.
   *
   * ⚠️ **Opcional a propósito.** Entre el deploy de la pantalla y el de la función serverless hay
   * minutos en que el GET todavía ⛔ no lo manda, y `undefined` tiene que valer **exige** —lo que
   * esta pantalla hizo siempre—: el default seguro es pedir la foto, ⛔ no dejar enviar sin nada.
   */
  pideFotos?: boolean
}

export function ReclamoPublico({ token, tienda = null }: { token: string | null; tienda?: string | null }) {
  /**
   * 🔑 **El token del reclamo que se acaba de crear desde el alta pública.** Sin link todavía: la
   * fila nació hace un segundo del otro lado de esta misma pantalla.
   *
   * Va como estado y ⛔ no como una navegación a `/reclamo/<token>` porque el ④ del alta —subir la
   * foto— es **el toque siguiente**: mandar a la persona a otra URL en el medio es el momento en
   * que se pierde la mitad de la gente, y el link le llega igual por WhatsApp.
   */
  const [tokenNuevo, setTokenNuevo] = useState<string | null>(null)
  const elToken = token || tokenNuevo
  const [vista, setVista] = useState<Vista | null>(null)
  const [cargando, setCargando] = useState(true)
  const [noExiste, setNoExiste] = useState(false)
  const [relato, setRelato] = useState('')
  const [subiendo, setSubiendo] = useState(0)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  /** La foto que se está mirando entera, o `null`. Ver la tira de miniaturas más abajo. */
  const [ampliada, setAmpliada] = useState<string | null>(null)

  // El setState va dentro del await y no en el cuerpo del effect: el linter del repo rechaza el
  // setState síncrono ahí (dispara renders en cascada). Mismo patrón que el resto de las secciones.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      // Sin token ⛔ no hay nada que pedir **y ⛔ no es un link roto**: es `/reclamo` pelado, o sea
      // el alta pública, que se dibuja más abajo. Marcar `noExiste` acá era lo que hacía que la
      // puerta nueva contestara «este link ya no está disponible».
      if (!elToken) { if (vivo) setCargando(false); return }
      try {
        const r = await fetch(`${API}&token=${encodeURIComponent(elToken)}&nc=${Date.now()}`)
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
  }, [elToken])

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
              body: JSON.stringify({ token: elToken, accion: 'foto', dataUrl }),
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
        body: JSON.stringify({ token: elToken, accion: 'enviar', relato }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo enviar.')
      setEnviado(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  /**
   * 🔴 **¿Este caso tiene una foto que pedir?** Lo contesta el servidor desde el motivo, y hasta el
   * 30-ago-2026 esta pantalla ⛔ no lo preguntaba: **exigía una foto siempre**. En «todavía no me
   * llegó» y en una demora ⛔ no hay nada que fotografiar ⇒ el botón de enviar ⛔ nunca se prendía y
   * el reclamo se quedaba en `borrador` para siempre. Con el alta pública eso dejó de ser
   * hipotético: «Todavía no me llegó» es **una de las cinco opciones**.
   *
   * ⚠️ `undefined` vale **exige**: ver el ⚠️ de `Vista.pideFotos`.
   */
  const exigeFoto = vista?.pideFotos !== false
  /** Lo que traba el envío: una foto subiéndose, o la foto que este caso sí necesita. */
  const trabado = subiendo > 0 || (exigeFoto && !vista?.fotos.length)

  // Estilos propios y no el kit del Monitor: esto lo abre alguien de afuera, en un teléfono, y no
  // tiene que parecerse a un panel de administración.
  const caja: React.CSSProperties = { maxWidth: 520, margin: '0 auto', padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1c1c1e' }

  /**
   * 🔴 **`/reclamo` pelado ⛔ no es un link roto: es la puerta de entrada.** Sale acá —después de
   * todos los hooks, por la regla de React— y antes de cualquier pantalla del portal, porque hasta
   * que la fila no existe ⛔ no hay reclamo que mostrar.
   */
  if (!elToken) {
    return <AltaPublica tienda={tienda} onCreado={(t) => { setCargando(true); setTokenNuevo(t) }} />
  }

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
        {exigeFoto
          ? 'Sacale una foto donde se vea el problema. Es lo que más nos ayuda a resolverlo rápido.'
          : 'Si tenés algo para mostrarnos, sumalo. Para este caso no hace falta.'}
      </p>

      {/* Las que ya subió. Se tocan para verlas enteras: el recorte de 84 px alcanza para contarlas,
          no para que la persona confirme que se ve lo que quiso mostrar — que es lo único que puede
          revisar antes de mandar, porque después el link no vuelve a abrir. */}
      {!!vista?.fotos.length && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {vista.fotos.map((u, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setAmpliada(u)}
              aria-label={`Ver la foto ${i + 1} de ${vista.fotos.length} más grande`}
              style={{
                padding: 0, height: 'auto', lineHeight: 0, cursor: 'zoom-in',
                border: 'none', borderRadius: 8, background: 'none', overflow: 'hidden',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" style={{ width: 84, height: 84, objectFit: 'cover', display: 'block' }} />
            </button>
          ))}
        </div>
      )}
      <Lightbox src={ampliada} alt="La foto que subiste" onCerrar={() => setAmpliada(null)} />

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
        disabled={trabado}
        style={{
          width: '100%', padding: '15px', fontSize: 16, fontWeight: 600, borderRadius: 10, marginTop: 20,
          border: 'none', cursor: trabado ? 'not-allowed' : 'pointer',
          background: trabado ? '#d1d5db' : '#4f46e5', color: '#fff',
        }}
      >
        Enviar
      </button>
      {exigeFoto && !vista?.fotos.length && (
        <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginTop: 8 }}>
          Subí al menos una foto para poder enviar.
        </p>
      )}
    </div>
  )
}

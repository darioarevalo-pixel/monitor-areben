'use client'

/**
 * Lo que ve la CREADORA cuando abre el link que le mandamos por WhatsApp. Sin login, en el celular,
 * entre otras cosas, y con la paciencia justa.
 *
 * Vive dentro del catch-all (`app/[[...seccion]]/page.tsx`, key `canje`) y no en una ruta propia de
 * Next porque una ruta nueva sería una función serverless más y el proyecto está en el tope del plan
 * Hobby: pasarse frena TODOS los deploys en silencio. Mismo criterio que `ReclamoPublico`.
 *
 * Tres decisiones, todas por la misma razón —que termine—:
 *   - **Ocho campos y nada más.** No elige productos (eso se habla por mensaje) ni carga el
 *     cumplimiento. Cada campo de más es gente que abandona a la mitad.
 *   - **Abre prellenado** con lo que ya está en su ficha. A partir del segundo canje sólo tiene que
 *     leer y confirmar, y el mensaje de WhatsApp se lo dice (`mensajeLinkDatos`).
 *   - **Se guarda todo junto, una vez.** Al revés que las fotos de un reclamo, acá no hay nada que
 *     se pierda si se corta: es un formulario corto y el botón está siempre a la vista.
 *
 * Lo que se edita se escribe en la **persona**, no en el canje: la dirección se muda una vez cada
 * tres años y sirve para todas las marcas. El canje sólo se queda con la marca de tiempo
 * (`datos_confirmados_at`), que es lo que distingue "nunca lo miró" de "lo miró y estaba bien".
 */

import { useEffect, useState } from 'react'

const API = '/api/postventa?recurso=canje'

type Datos = {
  nombre: string | null
  apellido: string | null
  telefono: string | null
  email: string | null
  dni: string | null
  calle: string | null
  numero: string | null
  piso: string | null
  depto: string | null
  cp: string | null
  localidad: string | null
  provincia: string | null
  direccion_nota: string | null
  talles?: { remera: string | null; pantalon: string | null; calzado: string | null }
  modelo_celular?: string | null
}

type Vista = {
  numero: string
  marca: string
  pide: 'talles' | 'modelo_celular'
  despachado: boolean
  confirmadoAt: string | null
  driveUrl: string | null
  datos: Datos
}

/** Los estilos son propios y no el kit del Monitor: esto lo abre alguien de afuera, en un teléfono. */
const caja: React.CSSProperties = {
  maxWidth: 520, margin: '0 auto', padding: 20,
  fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1c1c1e',
}
const label: React.CSSProperties = { display: 'block', fontSize: 14, color: '#374151', marginBottom: 4 }
const input: React.CSSProperties = {
  width: '100%', padding: 12, fontSize: 16, borderRadius: 10,
  border: '1px solid #d1d5db', fontFamily: 'inherit', background: '#fff', color: '#1c1c1e',
}
const bloque: React.CSSProperties = { marginBottom: 14 }
const fila: React.CSSProperties = { display: 'flex', gap: 10 }

function Campo({
  titulo, valor, onChange, placeholder, tipo, opcional, ancho,
}: {
  titulo: string
  valor: string
  onChange: (v: string) => void
  placeholder?: string
  tipo?: string
  opcional?: boolean
  ancho?: number
}) {
  return (
    <div style={{ ...bloque, flex: ancho ?? 1 }}>
      <label style={label}>
        {titulo}
        {opcional && <span style={{ color: '#9ca3af' }}> (opcional)</span>}
      </label>
      <input
        style={input}
        value={valor}
        type={tipo || 'text'}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function CanjePortal({ token }: { token: string | null }) {
  const [vista, setVista] = useState<Vista | null>(null)
  const [cargando, setCargando] = useState(true)
  const [noExiste, setNoExiste] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})

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
        const v = d.canje as Vista
        setVista(v)
        setForm({
          nombre: v.datos.nombre || '',
          apellido: v.datos.apellido || '',
          telefono: v.datos.telefono || '',
          email: v.datos.email || '',
          dni: v.datos.dni || '',
          calle: v.datos.calle || '',
          numero: v.datos.numero || '',
          piso: v.datos.piso || '',
          depto: v.datos.depto || '',
          cp: v.datos.cp || '',
          localidad: v.datos.localidad || '',
          provincia: v.datos.provincia || '',
          direccion_nota: v.datos.direccion_nota || '',
          remera: v.datos.talles?.remera || '',
          pantalon: v.datos.talles?.pantalon || '',
          calzado: v.datos.talles?.calzado || '',
          modelo_celular: v.datos.modelo_celular || '',
        })
      } catch {
        if (vivo) setError('No se pudo conectar. Probá de nuevo en un minuto.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [token])

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const guardar = async () => {
    if (!vista) return
    setGuardando(true)
    setError(null)
    try {
      const datos: Record<string, unknown> = {
        nombre: form.nombre, apellido: form.apellido, telefono: form.telefono, email: form.email,
        dni: form.dni, calle: form.calle, numero: form.numero, piso: form.piso, depto: form.depto,
        cp: form.cp, localidad: form.localidad, provincia: form.provincia,
        direccion_nota: form.direccion_nota,
      }
      // Sólo el dato que esta marca pide. Mandar el otro sería pisarle en la ficha algo que este
      // formulario ni siquiera le mostró.
      if (vista.pide === 'talles') {
        datos.talles = { remera: form.remera, pantalon: form.pantalon, calzado: form.calzado }
      } else {
        datos.modelo_celular = form.modelo_celular
      }

      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, accion: 'guardar', datos }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo guardar.')
      setGuardado(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return <div style={caja}>Cargando…</div>

  if (noExiste) {
    return (
      <div style={{ ...caja, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Este link ya no está disponible</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
          Puede que haya vencido o que la acción ya esté cerrada. Escribinos y te pasamos uno nuevo.
        </p>
      </div>
    )
  }

  if (guardado) {
    return (
      <div style={{ ...caja, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>¡Listo, gracias!</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
          Ya tenemos tus datos. Preparamos el pedido y te avisamos por acá cuando salga.
        </p>
      </div>
    )
  }

  // Ya despachado: los datos no cambian nada, y dejarla editarlos sería hacerle creer que el pedido
  // cambia de rumbo. Se le dice, en vez de un link que no anda.
  if (vista?.despachado) {
    return (
      <div style={{ ...caja, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Tu pedido ya salió</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
          Los datos quedaron como estaban. Si algo no coincide, escribinos y lo vemos.
        </p>
      </div>
    )
  }

  const yaConfirmo = !!vista?.confirmadoAt

  return (
    <div style={caja}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>
        {yaConfirmo ? 'Tus datos' : `¡Hola! Somos ${vista?.marca}`}
      </h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
        {yaConfirmo
          ? 'Ya nos los pasaste. Si cambió algo, editalo y volvé a confirmar.'
          : 'Necesitamos estos datos para mandarte el pedido. Son dos minutos.'}
      </p>

      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Cómo contactarte</h2>
      <div style={fila}>
        <Campo titulo="Nombre" valor={form.nombre} onChange={set('nombre')} />
        <Campo titulo="Apellido" valor={form.apellido} onChange={set('apellido')} />
      </div>
      <Campo titulo="Teléfono" valor={form.telefono} onChange={set('telefono')} tipo="tel" placeholder="11 5555 5555" />
      <Campo titulo="Email" valor={form.email} onChange={set('email')} tipo="email" opcional />
      <Campo titulo="DNI" valor={form.dni} onChange={set('dni')} tipo="tel" placeholder="Lo pide el correo para entregarte" />

      <h2 style={{ fontSize: 16, margin: '24px 0 10px' }}>A dónde te lo mandamos</h2>
      <div style={fila}>
        <Campo titulo="Calle" valor={form.calle} onChange={set('calle')} ancho={2} />
        <Campo titulo="Altura" valor={form.numero} onChange={set('numero')} />
      </div>
      <div style={fila}>
        <Campo titulo="Piso" valor={form.piso} onChange={set('piso')} opcional />
        <Campo titulo="Depto" valor={form.depto} onChange={set('depto')} opcional />
        <Campo titulo="Código postal" valor={form.cp} onChange={set('cp')} />
      </div>
      <div style={fila}>
        <Campo titulo="Localidad" valor={form.localidad} onChange={set('localidad')} />
        <Campo titulo="Provincia" valor={form.provincia} onChange={set('provincia')} />
      </div>
      <Campo
        titulo="Alguna referencia"
        valor={form.direccion_nota}
        onChange={set('direccion_nota')}
        placeholder="Entre calles, portero, horarios…"
        opcional
      />

      {vista?.pide === 'talles' ? (
        <>
          <h2 style={{ fontSize: 16, margin: '24px 0 4px' }}>Tus talles</h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 10 }}>
            Completá los que uses. Con uno alcanza.
          </p>
          <div style={fila}>
            <Campo titulo="Remera" valor={form.remera} onChange={set('remera')} placeholder="M" />
            <Campo titulo="Pantalón" valor={form.pantalon} onChange={set('pantalon')} placeholder="38" />
            <Campo titulo="Calzado" valor={form.calzado} onChange={set('calzado')} placeholder="39" />
          </div>
        </>
      ) : (
        <>
          <h2 style={{ fontSize: 16, margin: '24px 0 4px' }}>Tu celular</h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 10 }}>
            El modelo exacto, así la funda te calza.
          </p>
          <Campo
            titulo="Modelo"
            valor={form.modelo_celular}
            onChange={set('modelo_celular')}
            placeholder="iPhone 13 Pro, Samsung S23…"
          />
        </>
      )}

      {vista?.driveUrl && (
        <div style={{ background: '#f5f5f7', borderRadius: 10, padding: 14, marginTop: 20, fontSize: 14, lineHeight: 1.5 }}>
          Cuando tengas el contenido, dejanos las fotos y los videos{' '}
          <a href={vista.driveUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5' }}>
            en esta carpeta
          </a>. No hace falta ahora.
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', color: '#991b1b', padding: 12, borderRadius: 10, marginTop: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      <button
        onClick={() => void guardar()}
        disabled={guardando}
        style={{
          width: '100%', padding: '15px', fontSize: 16, fontWeight: 600, borderRadius: 10, marginTop: 20,
          border: 'none', cursor: guardando ? 'not-allowed' : 'pointer',
          background: guardando ? '#d1d5db' : '#4f46e5', color: '#fff',
        }}
      >
        {guardando ? 'Guardando…' : yaConfirmo ? 'Confirmar' : 'Enviar mis datos'}
      </button>
    </div>
  )
}

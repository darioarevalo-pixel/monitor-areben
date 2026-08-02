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
 *   - **Lo mínimo y nada más.** Los datos son ocho campos; no carga el cumplimiento ni ve un solo
 *     número de los nuestros. Cada campo de más es gente que abandona a la mitad.
 *   - **Abre prellenado** con lo que ya está en su ficha. A partir del segundo canje sólo tiene que
 *     leer y confirmar, y el mensaje de WhatsApp se lo dice (`mensajeLinkDatos`).
 *   - **Se guarda todo junto, una vez.** Al revés que las fotos de un reclamo, acá no hay nada que
 *     se pierda si se corta: es un formulario corto y el botón está siempre a la vista.
 *
 * **La vitrina (tanda 2).** Si el canje tiene una colgada, antes de los datos elige productos: la
 * grilla de fotos, las opciones de cada uno tal como las tiene la tienda, y arriba cuánto le queda.
 * Va primero porque es la parte que engancha, y la dirección después, que es el trámite. Los dos
 * pasos se mandan **en un solo request**: si fueran dos, abandonar en el medio le dejaría la
 * elección cerrada y la dirección sin cargar.
 *
 * ⚠️ El tope se dibuja acá pero **lo hace cumplir el servidor**, con la lista real. Lo de esta
 * pantalla es para que no llegue hasta el error.
 *
 * Lo que se edita se escribe en la **persona**, no en el canje: la dirección se muda una vez cada
 * tres años y sirve para todas las marcas. El canje sólo se queda con las marcas de tiempo
 * (`datos_confirmados_at`, `seleccion_cerrada_at`), que son lo que distingue "nunca lo miró" de "lo
 * miró y estaba bien".
 */

import { useEffect, useMemo, useState } from 'react'
import { FotoTn } from '@/components/tncat/FotoTn'

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

/** Una variante, como la manda la tienda: `['iPhone 12']`, `['Negro', 'XS']`. */
type Opcion = { id: string; valores: string[]; foto: string | null }

type ProductoVitrina = {
  id: number
  nombre: string
  foto: string | null
  /** Sólo cuando el acuerdo es por monto: en modo unidades no viaja ni un peso. */
  pvp?: number | null
  opciones: Opcion[]
}

type Vitrina = {
  titulo: string
  /** `false` = ya eligió, o el pedido ya se está preparando. Se muestra en lectura. */
  abierta: boolean
  modo: 'unidades' | 'monto'
  tope: number | null
  /** Lo ya consumido del tope, contando lo que el equipo le haya cargado. */
  usado: number
  items: ProductoVitrina[]
}

type Elegido = { nombre: string; variante: string; cantidad: number; pvp?: number | null }

type Vista = {
  numero: string
  marca: string
  pide: 'talles' | 'modelo_celular'
  despachado: boolean
  confirmadoAt: string | null
  driveUrl: string | null
  datos: Datos
  vitrina: Vitrina | null
  elegidos: Elegido[]
}

/** Lo que arma en el carrito. Se manda así: el resto lo pone el servidor desde la vitrina. */
type Eleccion = { item_id: number; opcion_id: string; cantidad: number }

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
/** El − del carrito. 34 px porque abajo de eso el dedo no le pega. */
const contador: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 999, border: '1px solid #d1d5db',
  background: '#fff', color: '#1c1c1e', fontSize: 18, lineHeight: 1, cursor: 'pointer',
}

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
  /** `elegir` sólo existe si hay vitrina abierta; si no, el link es el de siempre. */
  const [paso, setPaso] = useState<'elegir' | 'datos'>('datos')
  const [carrito, setCarrito] = useState<Eleccion[]>([])
  /** Qué producto tiene las opciones desplegadas. Uno por vez: es una pantalla de teléfono. */
  const [abierto, setAbierto] = useState<number | null>(null)

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
        // Arranca eligiendo sólo si hay algo que elegir. Sin vitrina —o ya cerrada— el link es
        // exactamente el de antes: un formulario de datos y un botón.
        if (v.vitrina?.abierta && v.vitrina.items.length) setPaso('elegir')
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

  const vitrina = vista?.vitrina || null
  /** Sólo se manda `elecciones` si de verdad estaba eligiendo: si no, el guardado es el de siempre. */
  const eligiendo = !!vitrina?.abierta && vitrina.items.length > 0

  const porItem = useMemo(
    () => new Map((vitrina?.items || []).map((i) => [i.id, i])),
    [vitrina],
  )

  /**
   * Cuánto le queda. Es el mismo cálculo que hace el servidor con `seVaDelTope`, adelantado acá
   * para que no llegue hasta el error: en unidades cuenta bultos, en monto cuenta plata, y en los
   * dos casos parte de lo que el servidor ya dio por consumido.
   */
  const usado = useMemo(() => {
    if (!vitrina) return 0
    const propio = carrito.reduce((a, e) => {
      if (vitrina.modo === 'unidades') return a + e.cantidad
      return a + (Number(porItem.get(e.item_id)?.pvp) || 0) * e.cantidad
    }, 0)
    return vitrina.usado + propio
  }, [vitrina, carrito, porItem])

  const restante = vitrina?.tope == null ? null : vitrina.tope - usado

  /** ¿Entra uno más de este producto? En monto depende del precio; en unidades, de que quede lugar. */
  const entra = (item: ProductoVitrina) => {
    if (restante == null) return true
    if (vitrina?.modo === 'unidades') return restante >= 1
    return restante >= (Number(item.pvp) || 0)
  }

  const sumar = (item: ProductoVitrina, opcion: Opcion) => {
    if (!entra(item)) return
    setCarrito((c) => {
      // Otra igual suma cantidad en vez de agregar un renglón: puede llevarse tres de lo mismo.
      const i = c.findIndex((e) => e.item_id === item.id && e.opcion_id === opcion.id)
      if (i < 0) return [...c, { item_id: item.id, opcion_id: opcion.id, cantidad: 1 }]
      return c.map((e, n) => (n === i ? { ...e, cantidad: e.cantidad + 1 } : e))
    })
    setAbierto(null)
  }

  const restar = (e: Eleccion) => setCarrito((c) => c
    .map((x) => (x.item_id === e.item_id && x.opcion_id === e.opcion_id ? { ...x, cantidad: x.cantidad - 1 } : x))
    .filter((x) => x.cantidad > 0))

  const nombreDeLaOpcion = (e: Eleccion) => {
    const item = porItem.get(e.item_id)
    const o = item?.opciones.find((x) => x.id === e.opcion_id)
    return (o?.valores || []).filter(Boolean).join(' · ')
  }

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
        // Los productos y los datos van juntos, en un solo request: dos llamadas dejarían la
        // elección cerrada y la dirección sin cargar si abandona en el medio.
        body: JSON.stringify({ token, accion: 'guardar', datos, ...(eligiendo ? { elecciones: carrito } : {}) }),
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
          {eligiendo
            // Se lo decimos acá y no antes: avisarle que no va a poder cambiar mientras elige la
            // frena, y lo que hace falta es que elija.
            ? 'Ya tenemos tu pedido y tus datos. Lo preparamos y te avisamos por acá cuando salga. Si necesitás cambiar algo, escribinos.'
            : 'Ya tenemos tus datos. Preparamos el pedido y te avisamos por acá cuando salga.'}
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

  // ── Paso 1: elegir ────────────────────────────────────────────────────────────
  // Va antes de los datos porque es la parte que engancha. El botón de abajo no manda nada: la
  // pasa al formulario, y recién ahí se guarda todo junto.
  if (paso === 'elegir' && vitrina) {
    const plata = vitrina.modo === 'monto'
    return (
      <div style={caja}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>¡Hola! Somos {vista?.marca}</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
          Elegí lo que más te guste. Después te pedimos la dirección y listo.
        </p>

        {/* Cuánto le queda, siempre a la vista: es la única regla que tiene que entender. */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 2, background: '#eef2ff', color: '#3730a3',
          borderRadius: 10, padding: '10px 14px', fontSize: 15, fontWeight: 600, marginBottom: 16,
        }}
        >
          {vitrina.tope == null
            ? 'Elegí lo que quieras'
            : plata
              ? `Te quedan $${Math.max(0, restante ?? 0).toLocaleString('es-AR')} de $${vitrina.tope.toLocaleString('es-AR')}`
              : `Te ${(restante ?? 0) === 1 ? 'queda' : 'quedan'} ${Math.max(0, restante ?? 0)} de ${vitrina.tope}`}
        </div>

        {carrito.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Lo que elegiste</h2>
            {carrito.map((e) => (
              <div
                key={`${e.item_id}-${e.opcion_id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}
              >
                <div style={{ flex: 1, fontSize: 14, lineHeight: 1.35 }}>
                  {porItem.get(e.item_id)?.nombre}
                  <div style={{ color: '#6b7280', fontSize: 13 }}>{nombreDeLaOpcion(e)}</div>
                </div>
                <button onClick={() => restar(e)} style={contador} aria-label="Sacar uno">−</button>
                <span style={{ minWidth: 18, textAlign: 'center', fontSize: 15 }}>{e.cantidad}</span>
              </div>
            ))}
          </div>
        )}

        <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>{vitrina.titulo || 'Para elegir'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {vitrina.items.map((item) => {
            const lleno = !entra(item)
            return (
              <div key={item.id} style={{ opacity: lleno ? 0.45 : 1 }}>
                <button
                  onClick={() => setAbierto(abierto === item.id ? null : item.id)}
                  disabled={lleno}
                  style={{
                    width: '100%', border: `1px solid ${abierto === item.id ? '#4f46e5' : '#e5e7eb'}`,
                    background: '#fff', borderRadius: 12, padding: 6, textAlign: 'left',
                    cursor: lleno ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ aspectRatio: '1 / 1', background: '#f5f5f7', borderRadius: 8, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                    {item.foto
                      ? <FotoTn src={item.foto} alt={item.nombre} ancho={150} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: '#9ca3af', fontSize: 12 }}>sin foto</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.3, color: '#1c1c1e' }}>{item.nombre}</div>
                  {plata && item.pvp != null && (
                    <div style={{ fontSize: 13, color: '#6b7280' }}>${Number(item.pvp).toLocaleString('es-AR')}</div>
                  )}
                </button>

                {/* Las opciones, con la palabra que usa la tienda. No dice "modelo" ni "color":
                    los ejes cambian producto por producto y ponerle nombre sería mentira la mitad
                    de las veces. */}
                {abierto === item.id && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {item.opciones.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => sumar(item, o)}
                        style={{
                          border: '1px solid #d1d5db', background: '#fff', borderRadius: 999,
                          padding: '7px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                          color: '#1c1c1e',
                        }}
                      >
                        {o.valores.filter(Boolean).join(' · ') || 'Elegir'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={() => setPaso('datos')}
          disabled={!carrito.length}
          style={{
            width: '100%', padding: 15, fontSize: 16, fontWeight: 600, borderRadius: 10, marginTop: 24,
            border: 'none', cursor: carrito.length ? 'pointer' : 'not-allowed',
            background: carrito.length ? '#4f46e5' : '#d1d5db', color: '#fff',
          }}
        >
          {carrito.length ? 'Seguir' : 'Elegí al menos uno'}
        </button>
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

      {/* Lo que eligió, arriba de todo: es la razón por la que está llenando esto. Si ya lo mandó
          (`vista.elegidos`) se muestra igual, en lectura — al mandar se cierra. */}
      {(carrito.length > 0 || (vista?.elegidos || []).length > 0) && (
        <div style={{ background: '#f5f5f7', borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <strong style={{ fontSize: 15 }}>Tu pedido</strong>
            {eligiendo && (
              <button
                onClick={() => setPaso('elegir')}
                style={{ border: 'none', background: 'none', color: '#4f46e5', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                Cambiar
              </button>
            )}
          </div>
          {(carrito.length
            ? carrito.map((e) => ({
              clave: `${e.item_id}-${e.opcion_id}`,
              nombre: porItem.get(e.item_id)?.nombre || '',
              variante: nombreDeLaOpcion(e),
              cantidad: e.cantidad,
            }))
            : (vista?.elegidos || []).map((e, n) => ({
              clave: `${n}-${e.nombre}`, nombre: e.nombre, variante: e.variante, cantidad: e.cantidad,
            }))
          ).map((e) => (
            <div key={e.clave} style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
              {e.cantidad > 1 ? `${e.cantidad}× ` : ''}{e.nombre}
              {e.variante ? <span style={{ color: '#6b7280' }}> · {e.variante}</span> : null}
            </div>
          ))}
        </div>
      )}

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
        {guardando ? 'Guardando…' : eligiendo ? 'Confirmar mi pedido' : yaConfirmo ? 'Confirmar' : 'Enviar mis datos'}
      </button>
    </div>
  )
}

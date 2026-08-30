'use client'

/**
 * **El alta pública: el cliente abre su propio reclamo, sin login y sin que nadie lo cargue.**
 *
 * Es la pantalla del §2 del plan, y lo último que le faltaba a la puerta que ya existe del lado del
 * servidor (`accion: 'alta'` en `api/_reclamo.js`). Hasta que existió esto, la puerta estaba
 * abierta y ⛔ no la podía usar nadie.
 *
 * # 🔑 ⛔ No es un formulario: es la orden
 *
 * El nombre y los productos ⛔ no se tipean —salen de la venta— y por eso son **cuatro toques y una
 * foto, sin un solo campo de texto obligatorio**:
 *
 *   ① pedido #____ + el mail con el que compraste   → se cruza contra Tienda Nube
 *   ② «Hola Victoria, éste es tu pedido #21033»      → toca el/los producto(s)
 *   ③ ¿qué pasó?  (cinco opciones en criollo)
 *   ④ subí unas fotos                                → eso ya es el portal, que ya existía
 *
 * El ④ ⛔ no está acá **a propósito**: apenas la fila existe, el que sigue es el portal del cliente
 * (`ReclamoPublico`), que es el mismo que se abre desde el link de WhatsApp. Una segunda pantalla
 * de fotos sería una segunda regla de cuántas entran y de cuándo se puede enviar.
 *
 * # 🔴 Lo que esta pantalla NO decide, y es lo que la vuelve segura
 *
 * Acá se muestra la orden, pero **la llave vuelve a girar del lado del servidor**, en el mismo
 * pedido que crea la fila: lo que viaja al alta son **el mail y los ÍNDICES** de lo que la persona
 * tocó, ⛔ nunca los productos. Si mandara los productos, verificar el mail ⛔ no serviría de nada
 * —cualquiera postearía un reclamo de un artículo que nunca compró—. Ver el 🔴 de `ordenVerificada`
 * en `api/_reclamo.js`: **hacer la verificación en el navegador es no hacerla**.
 *
 * Y el **escenario** ⛔ no lo toca el cliente, ni el **motivo**: las cinco opciones son familias, y
 * con cuál de la familia entra lo decide `motivoDeAlta` del lado de adentro.
 *
 * # ⚠️ Un «no» ⛔ no explica por qué
 *
 * Las cuatro razones por las que el pedido puede no aparecer —no existe, no trae mail, el mail ⛔ no
 * coincide, el otro repo se cayó— se ven **idénticas**, y el cartel es el mismo que contesta el
 * servidor. Distinguirlas convierte esto en un oráculo de *«¿existe la orden N?»* sobre una
 * numeración correlativa.
 *
 * ⚠️ **Estilos propios y ⛔ no el kit del Monitor**, igual que el portal: esto lo abre alguien de
 * afuera, en un teléfono, y ⛔ no tiene que parecerse a un panel de administración.
 */

import { useState } from 'react'
import {
  API_ORDEN_VERIFICADA, OPCIONES_PUBLICAS, TIENDAS_DEL_ALTA, esTiendaDelAlta, fotosEnElAlta,
} from '@/lib/reclamos/alta-publica.core.js'
import { preseleccionDelAlta } from '@/lib/reclamos/tipos'

const API = '/api/postventa?recurso=reclamo'

/**
 * El cartel de que el pedido ⛔ no apareció. **Uno solo para las cuatro razones**, y es el mismo
 * texto que contesta el servidor cuando la llave no gira. Ver el ⚠️ del encabezado.
 */
const NO_APARECE = 'No encontramos ese pedido con ese mail.'

type ProductoDeLaOrden = { name?: string | null; sku?: string | null; quantity?: number | string | null }
type OrdenVerificada = { number?: number | string | null; cliente?: string | null; products?: ProductoDeLaOrden[] }

type Props = {
  /** La tienda que dice el link (`?m=bdi`). `null` ⇒ se le pregunta a la persona. */
  tienda: string | null
  /** Se llama con el token del reclamo recién creado: de ahí sigue el portal, que es el ④. */
  onCreado: (token: string) => void
}

export function AltaPublica({ tienda, onCreado }: Props) {
  /** La tienda del link manda; si ⛔ no vino una válida, la elige la persona (primer paso). */
  const [store, setStore] = useState<string | null>(esTiendaDelAlta(tienda) ? tienda : null)
  const [orden, setOrden] = useState('')
  const [mail, setMail] = useState('')
  const [verificada, setVerificada] = useState<OrdenVerificada | null>(null)
  const [tocados, setTocados] = useState<number[]>([])
  const [buscando, setBuscando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** El link del reclamo que YA estaba abierto por este pedido. Ver `yaExistia` más abajo. */
  const [yaExistia, setYaExistia] = useState<string | null>(null)

  const productos = Array.isArray(verificada?.products) ? verificada!.products! : []

  /**
   * ① **La llave.** Se le pide la orden al otro repo con el mail en el **body** —⛔ nunca en la
   * query string, que viaja al log de acceso y al historial del navegador—, y lo que vuelve es la
   * orden recortada: qué compró y nada más.
   *
   * ⚠️ Esto es para MOSTRAR. Lo que autoriza la creación es la misma llave girando de nuevo del
   * lado del servidor, y por eso el mail se guarda en el estado: hay que volver a mandarlo.
   */
  const buscarElPedido = async () => {
    setError(null)
    setBuscando(true)
    try {
      const url = `${API_ORDEN_VERIFICADA}?orden=${encodeURIComponent(orden.trim())}&store=${encodeURIComponent(store || '')}`
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mail: mail.trim() }),
      })
      const d = r.ok ? await r.json().catch(() => null) : null
      // 🔴 El `!r.ok` va con el cuerpo: un 404 con un JSON válido adentro ⛔ no es una orden. Es el
      // mismo mutante que sobrevivió en el servidor —un cuerpo que parece bueno con un código que
      // no lo es— y acá se paga igual de caro.
      if (!d?.ok || !d.orden) { setError(NO_APARECE); return }
      const orden0 = d.orden as OrdenVerificada
      setVerificada(orden0)
      // Con un solo producto ⛔ no hay nada que elegir; con dos, el default sería decidir por la
      // persona. La regla ya existe y es la misma que usa el alta de adentro.
      setTocados(preseleccionDelAlta(Array.isArray(orden0.products) ? orden0.products.length : 0))
    } catch {
      setError('No se pudo conectar. Probá de nuevo en un minuto.')
    } finally {
      setBuscando(false)
    }
  }

  /**
   * ③ **Elegir qué pasó crea el reclamo.** ⛔ No hay un botón «enviar» aparte: la opción **es** el
   * último toque, y lo que sigue es el portal pidiendo la foto.
   */
  const crear = async (opcion: string) => {
    setError(null)
    setCreando(true)
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recurso: 'reclamo', accion: 'alta',
          store, orden: orden.trim(), mail: mail.trim(), opcion,
          // 🔴 ÍNDICES, ⛔ no productos. Ver el 🔴 del encabezado.
          productos: tocados,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok || !d.token) { setError(d.error || NO_APARECE); return }
      // ⚠️ **Ya tenía uno abierto por este pedido**: el servidor devuelve **ese** token en vez de
      // crear un segundo expediente. Seguir derecho al portal sería mostrarle otro reclamo —con
      // otros productos y otro motivo— como si fuera el que acaba de cargar. Se lo decimos.
      if (d.yaExistia) { setYaExistia(String(d.token)); return }
      onCreado(String(d.token))
    } catch {
      setError('No se pudo conectar. Probá de nuevo en un minuto.')
    } finally {
      setCreando(false)
    }
  }

  const caja: React.CSSProperties = { maxWidth: 520, margin: '0 auto', padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1c1c1e' }
  const campo: React.CSSProperties = { width: '100%', padding: 12, fontSize: 16, borderRadius: 10, border: '1px solid #d1d5db', fontFamily: 'inherit', marginBottom: 12 }
  const principal = (activo: boolean): React.CSSProperties => ({
    width: '100%', padding: '15px', fontSize: 16, fontWeight: 600, borderRadius: 10, marginTop: 8,
    border: 'none', cursor: activo ? 'pointer' : 'not-allowed',
    background: activo ? '#4f46e5' : '#d1d5db', color: '#fff',
  })
  const tarjeta: React.CSSProperties = {
    width: '100%', textAlign: 'left', padding: 14, marginBottom: 10, borderRadius: 10,
    border: '1px solid #d1d5db', background: '#fff', color: '#1c1c1e', cursor: 'pointer', fontFamily: 'inherit',
  }

  const elError = error && (
    <div style={{ background: '#fef2f2', color: '#991b1b', padding: 12, borderRadius: 10, marginTop: 12, fontSize: 14 }}>{error}</div>
  )

  // Ya tenía un reclamo abierto por este pedido: es el mismo caso, ⛔ no uno nuevo.
  if (yaExistia) {
    return (
      <div style={{ ...caja, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Ya tenés un reclamo abierto por este pedido</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.5, marginBottom: 20 }}>
          Lo estamos viendo. Podés sumarle fotos o contarnos más ahí mismo.
        </p>
        <button onClick={() => onCreado(yaExistia)} style={principal(true)}>Ver mi reclamo</button>
      </div>
    )
  }

  // ⓪ De qué tienda es. Sólo aparece si el link ⛔ no lo dijo.
  if (!store) {
    return (
      <div style={caja}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>¿Dónde compraste?</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>Para buscar tu pedido.</p>
        {TIENDAS_DEL_ALTA.map((t: { clave: string; label: string }) => (
          <button key={t.clave} onClick={() => setStore(t.clave)} style={{ ...tarjeta, fontSize: 17, fontWeight: 600 }}>
            {t.label}
          </button>
        ))}
      </div>
    )
  }

  // ① El pedido y el mail.
  if (!verificada) {
    const listo = /^\d{1,12}$/.test(orden.trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.trim())
    return (
      <div style={caja}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Buscá tu pedido</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
          Con eso lo encontramos: no hace falta que nos cuentes qué compraste.
        </p>
        <label htmlFor="alta-orden" style={{ fontSize: 14, display: 'block', marginBottom: 6 }}>Número de pedido</label>
        <input
          id="alta-orden" value={orden} onChange={(e) => setOrden(e.target.value)}
          inputMode="numeric" autoComplete="off" placeholder="21033" style={campo}
        />
        <label htmlFor="alta-mail" style={{ fontSize: 14, display: 'block', marginBottom: 6 }}>El mail con el que compraste</label>
        <input
          id="alta-mail" value={mail} onChange={(e) => setMail(e.target.value)}
          type="email" inputMode="email" autoComplete="email" placeholder="vos@mail.com" style={campo}
        />
        {elError}
        <button onClick={() => void buscarElPedido()} disabled={!listo || buscando} style={principal(listo && !buscando)}>
          {buscando ? 'Buscando…' : 'Buscar mi pedido'}
        </button>
      </div>
    )
  }

  // ② Los productos: se tocan los que tienen el problema.
  const hola = verificada.cliente ? `Hola ${String(verificada.cliente).split(' ')[0]}, ` : ''

  return (
    <div style={caja}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>
        {hola}éste es tu pedido {verificada.number ? `#${verificada.number}` : ''}
      </h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
        Tocá el producto que tuvo el problema.
      </p>

      {productos.map((p, i) => {
        const elegido = tocados.includes(i)
        return (
          <button
            key={i}
            onClick={() => setTocados((t) => (t.includes(i) ? t.filter((x) => x !== i) : t.concat([i])))}
            aria-pressed={elegido}
            style={{
              ...tarjeta,
              border: elegido ? '2px solid #4f46e5' : '1px solid #d1d5db',
              background: elegido ? '#eef2ff' : '#fff',
            }}
          >
            <span style={{ marginRight: 8 }}>{elegido ? '✅' : '⬜️'}</span>
            {p.quantity ?? 1} × {p.name || 'Sin nombre'}
          </button>
        )
      })}

      {/* ③ Qué pasó. Aparece recién con algo tocado: elegir el problema de ningún producto ⛔ no es
          una pregunta que se pueda contestar. */}
      {!!tocados.length && (
        <>
          <h2 style={{ fontSize: 18, margin: '24px 0 6px' }}>¿Qué pasó?</h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 12 }}>
            Elegí lo que más se parezca. Después lo vemos nosotros.
          </p>
          {OPCIONES_PUBLICAS.map((o: { clave: string; label: string; ayuda: string }) => (
            <button key={o.clave} onClick={() => void crear(o.clave)} disabled={creando} style={tarjeta}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{o.label}</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{o.ayuda}</div>
              {/* La foto se pide en el portal, un toque después. Decirlo acá es no sorprender a
                  quien eligió el caso que la exige — y sale de la misma regla que la exige. */}
              {fotosEnElAlta(o.clave) === 'exige' && (
                <div style={{ fontSize: 13, color: '#4f46e5', marginTop: 4 }}>Te vamos a pedir una foto.</div>
              )}
            </button>
          ))}
        </>
      )}

      {elError}

      <button
        onClick={() => { setVerificada(null); setTocados([]); setError(null) }}
        style={{ ...tarjeta, textAlign: 'center', marginTop: 16, color: '#6b7280' }}
      >
        Buscar otro pedido
      </button>
    </div>
  )
}

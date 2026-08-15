'use client'

/**
 * La hoja del día, en el celular del cadete (`/cadete/<token>`).
 *
 * 🔑 **No es la pantalla de Envíos, y no puede serlo.** La interna muestra la cuenta corriente, deja
 * borrar filas y trae la orden de Tienda Nube completa. Acá hay tres cosas: a dónde ir, cuánto
 * cobrar, y dos botones para decir qué pasó.
 *
 * Estilos propios y no el kit del Monitor, igual que `ReclamoPublico` y `CanjePortal`: esto se abre
 * arriba de una moto, con una mano, con sol en la pantalla. Los botones son grandes, el nombre y la
 * dirección grandes, y el monto a cobrar es lo único en negrita.
 *
 * 🔑 **La sesión es el `localStorage` del teléfono.** Guarda token y PIN y los manda en cada pedido;
 * el servidor valida los dos siempre. No hay estado de sesión del otro lado, así que revocar es
 * rotar el token — que es lo que se hace el 1º de cada mes.
 */

import { useCallback, useEffect, useState } from 'react'

type EnvioDelCadete = {
  id: string
  marca: string
  orden: string | null
  cliente: string | null
  direccion: string
  piso: string | null
  localidad: string | null
  anotacion: string | null
  telefono: string | null
  turno: string | null
  estado: string
  estadoTexto: string
  aCobrar: number
  envioSaldado: boolean
  cobrado: boolean | null
}

const LLAVE = 'cadete.pin'
const API = '/api/postventa?recurso=cadete'

const caja: React.CSSProperties = {
  maxWidth: 520,
  margin: '0 auto',
  padding: 16,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#1c1c1e',
}
// 16px de fuente en los campos: menos que eso y iOS hace zoom solo al enfocar, y la pantalla queda
// corrida justo cuando hay que tipear con una mano.
const campo: React.CSSProperties = { width: '100%', padding: 14, fontSize: 16, borderRadius: 10, border: '1px solid #d1d1d6', boxSizing: 'border-box' }
const boton = (fondo: string): React.CSSProperties => ({
  width: '100%',
  padding: 14,
  fontSize: 16,
  fontWeight: 600,
  color: '#fff',
  background: fondo,
  border: 0,
  borderRadius: 10,
  cursor: 'pointer',
})

const plata = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

export function PortalCadete({ token }: { token: string | null }) {
  const [pin, setPin] = useState('')
  const [envios, setEnvios] = useState<EnvioDelCadete[]>([])
  const [fecha, setFecha] = useState<string | null>(null)
  const [estado, setEstado] = useState<'pidiendo-pin' | 'cargando' | 'listo' | 'muerto'>('cargando')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const traer = useCallback(
    async (elPin: string) => {
      if (!token) return setEstado('muerto')
      setError(null)
      try {
        const r = await fetch(`${API}&token=${encodeURIComponent(token)}&pin=${encodeURIComponent(elPin)}&nc=${Date.now()}`)
        const d = await r.json().catch(() => null)
        // 🔑 El 404 es el link: no existe, o venció. No se distingue a propósito, así que acá
        // tampoco se inventa un motivo — se dice lo único que la persona puede hacer.
        if (r.status === 404) return setEstado('muerto')
        if (r.status === 401) {
          // El PIN guardado dejó de servir (lo rotaron): se borra, o el teléfono queda en un loop.
          window.localStorage.removeItem(LLAVE)
          setEstado('pidiendo-pin')
          return setError(elPin ? 'PIN incorrecto.' : null)
        }
        if (r.status === 429) {
          setEstado('pidiendo-pin')
          return setError('Demasiados intentos. Esperá unos minutos.')
        }
        if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo cargar la hoja.')
        window.localStorage.setItem(LLAVE, elPin)
        setPin(elPin)
        setEnvios(d.envios || [])
        setFecha(d.fecha || null)
        setEstado('listo')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo cargar la hoja.')
        setEstado('pidiendo-pin')
      }
    },
    [token],
  )

  // La sesión guardada en el teléfono. Va adentro de una IIFE, como el resto del repo: llamar a
  // `setState` derecho en el cuerpo de un efecto encadena renders y el lint lo rechaza.
  useEffect(() => {
    void (async () => {
      const guardado = typeof window === 'undefined' ? null : window.localStorage.getItem(LLAVE)
      if (guardado) await traer(guardado)
      else setEstado('pidiendo-pin')
    })()
  }, [traer])

  async function marcar(e: EnvioDelCadete, accion: string) {
    setOcupado(e.id + accion)
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recurso: 'cadete', token, pin, id: e.id, accion }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo guardar.')
      await traer(pin)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setOcupado(null)
    }
  }

  if (estado === 'cargando') return <div style={caja} />

  if (estado === 'muerto') {
    return (
      <div style={caja}>
        <h1 style={{ fontSize: 20 }}>Este link ya no sirve</h1>
        <p style={{ color: '#636366' }}>Pedí el link nuevo en el local. Se cambia a principio de cada mes.</p>
      </div>
    )
  }

  if (estado === 'pidiendo-pin') {
    return (
      <div style={caja}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Envíos del día</h1>
        <p style={{ color: '#636366', marginTop: 0 }}>Poné el PIN que te pasaron.</p>
        <form
          onSubmit={(ev) => {
            ev.preventDefault()
            void traer(pin)
          }}
        >
          {/* `inputMode` numérico: en el celular abre el teclado de números directo. */}
          <input
            style={campo}
            value={pin}
            onChange={(ev) => setPin(ev.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="PIN"
            aria-label="PIN"
          />
          {error ? <p style={{ color: '#d92d20' }}>{error}</p> : null}
          <button type="submit" style={{ ...boton('#4f46e5'), marginTop: 12 }}>
            Entrar
          </button>
        </form>
      </div>
    )
  }

  const pendientes = envios.filter((e) => e.estado !== 'entregado' && e.estado !== 'no_entregado')
  const cerrados = envios.filter((e) => e.estado === 'entregado' || e.estado === 'no_entregado')

  return (
    <div style={caja}>
      <h1 style={{ fontSize: 20, marginBottom: 2 }}>Envíos del día</h1>
      <p style={{ color: '#636366', marginTop: 0, fontSize: 14 }}>
        {fecha} · {pendientes.length} por entregar
      </p>
      {error ? <p style={{ color: '#d92d20' }}>{error}</p> : null}

      {!envios.length ? <p style={{ color: '#636366' }}>Hoy no hay envíos cargados.</p> : null}

      {pendientes.map((e) => (
        <Tarjeta key={e.id} envio={e} ocupado={ocupado} onMarcar={marcar} />
      ))}

      {/* Los cerrados quedan abajo y apagados: sirven para confirmar que no falta ninguno, pero no
          tienen que competir por la atención con los que todavía hay que llevar. */}
      {cerrados.length ? (
        <>
          <h2 style={{ fontSize: 15, color: '#636366', marginTop: 28 }}>Ya cerrados</h2>
          {cerrados.map((e) => (
            <Tarjeta key={e.id} envio={e} ocupado={ocupado} onMarcar={marcar} apagado />
          ))}
        </>
      ) : null}
    </div>
  )
}

/**
 * Un envío: a dónde ir, cuánto cobrar, y qué pasó.
 *
 * 🔑 **El monto es lo único en negrita grande, y «PAGADO» no es «$0».** Un cero se lee como un
 * precio; el ticket impreso resuelve lo mismo con un rectángulo negro, y acá con el fondo verde.
 */
function Tarjeta({
  envio,
  ocupado,
  onMarcar,
  apagado,
}: {
  envio: EnvioDelCadete
  ocupado: string | null
  onMarcar: (e: EnvioDelCadete, accion: string) => Promise<void>
  apagado?: boolean
}) {
  const cerrado = envio.estado === 'entregado' || envio.estado === 'no_entregado'
  const tel = String(envio.telefono || '').replace(/[^\d+]/g, '')
  const donde = [envio.direccion, envio.piso, envio.localidad].filter(Boolean).join(' · ')
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([envio.direccion, envio.localidad, 'Rosario'].filter(Boolean).join(', '))}`

  return (
    <div
      style={{
        border: '1px solid #d1d1d6',
        borderRadius: 12,
        padding: 14,
        marginTop: 12,
        opacity: apagado ? 0.6 : 1,
        background: '#fff',
      }}
    >
      <div style={{ fontSize: 12, color: '#8e8e93', textTransform: 'uppercase' }}>
        {envio.marca} {envio.orden ? `· #${envio.orden}` : ''} {envio.turno ? `· ${envio.turno}` : ''}
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, marginTop: 2 }}>{envio.cliente || 'Sin nombre'}</div>
      <div style={{ fontSize: 16, marginTop: 2 }}>{donde}</div>
      {envio.anotacion ? <div style={{ fontSize: 14, color: '#636366', marginTop: 4 }}>{envio.anotacion}</div> : null}

      {/* La plata, con el mismo criterio que el papel: o un monto, o la palabra. */}
      <div
        style={{
          marginTop: 10,
          padding: '10px 12px',
          borderRadius: 8,
          background: envio.aCobrar === 0 ? '#e8f5ee' : '#fff7e6',
          fontSize: envio.aCobrar === 0 ? 16 : 22,
          fontWeight: 700,
        }}
      >
        {envio.aCobrar === 0 ? 'PAGADO · no cobrar nada' : `COBRAR ${plata(envio.aCobrar)}`}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <a href={mapa} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textDecoration: 'none' }}>
          <span style={{ ...boton('#636366'), display: 'block', textAlign: 'center', boxSizing: 'border-box' }}>Mapa</span>
        </a>
        {tel ? (
          <a href={`tel:${tel}`} style={{ flex: 1, textDecoration: 'none' }}>
            <span style={{ ...boton('#636366'), display: 'block', textAlign: 'center', boxSizing: 'border-box' }}>Llamar</span>
          </a>
        ) : null}
      </div>

      {!cerrado ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={boton('#079455')} disabled={!!ocupado} onClick={() => void onMarcar(envio, 'entregado')}>
              {ocupado === envio.id + 'entregado' ? '…' : 'Entregado'}
            </button>
            <button style={boton('#d92d20')} disabled={!!ocupado} onClick={() => void onMarcar(envio, 'no_entregado')}>
              {ocupado === envio.id + 'no_entregado' ? '…' : 'No entregado'}
            </button>
          </div>
          {/* 🔑 Cobrar y entregar son DOS hechos. Se puede entregar sin cobrar —la clienta no tenía
              el efectivo— y esa diferencia es la que después no cierra en la rendición si no se
              anota. Sólo aparece cuando hay algo que cobrar. */}
          {envio.aCobrar > 0 ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button
                style={{ ...boton(envio.cobrado === true ? '#079455' : '#e5e5ea'), color: envio.cobrado === true ? '#fff' : '#1c1c1e' }}
                disabled={!!ocupado}
                onClick={() => void onMarcar(envio, 'cobrado')}
              >
                Cobré
              </button>
              <button
                style={{ ...boton(envio.cobrado === false ? '#d92d20' : '#e5e5ea'), color: envio.cobrado === false ? '#fff' : '#1c1c1e' }}
                disabled={!!ocupado}
                onClick={() => void onMarcar(envio, 'no_cobrado')}
              >
                No cobré
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div style={{ marginTop: 10, fontSize: 14, color: '#636366' }}>
          {envio.estadoTexto}
          {envio.cobrado === true ? ' · cobrado' : envio.cobrado === false ? ' · sin cobrar' : ''}
        </div>
      )}
    </div>
  )
}

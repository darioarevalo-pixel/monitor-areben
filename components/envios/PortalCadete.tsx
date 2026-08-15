'use client'

/**
 * La hoja del día, en el celular del cadete (`/cadete/<token>`).
 *
 * 🔑 **No es la pantalla de Envíos, y no puede serlo.** La interna muestra la cuenta corriente, deja
 * borrar filas y trae la orden de Tienda Nube completa. Acá hay tres cosas: a dónde ir, cuánto
 * cobrar, y qué pasó en la puerta.
 *
 * 🔑 **Tiene la estética del Monitor aunque el link sea de afuera.** No importa componentes del kit
 * —esto se baja con datos del teléfono, arriba de una moto— pero sí sus **tokens**, que ya viajan en
 * el CSS global (`app/tokens.css`): los mismos índigo, grises, verdes y rojos, la misma tipografía y
 * los mismos radios. Se ve parte del sistema sin pagar el bundle de la app.
 *
 * 🔑 **Los íconos son los trazos del kit, no emojis.** Un emoji trae su color puesto: adentro de un
 * botón verde el 📞 sigue siendo gris y no se puede teñir. `Icono` dibuja con `currentColor`, así
 * que hereda el color del botón que lo contiene.
 *
 * 🔑 **La sesión es el `localStorage` del teléfono.** Guarda el PIN y lo manda en cada pedido; el
 * servidor valida token y PIN siempre. No hay estado de sesión del otro lado, así que revocar es
 * rotar el token — que es lo que se hace el 1º de cada mes.
 *
 * 🔑 **Se ven los días que vienen, pero no se tocan.** Sirve para organizarse, y por eso esas
 * tarjetas salen **sin dirección ni teléfono** (el servidor no los manda: `paraElCadeteFuturo`). Los
 * dos tipos de acá son el espejo de esas dos formas, y están separados a propósito: con campos
 * opcionales, dibujar la tarjeta completa con datos flacos imprimiría `undefined` en la dirección.
 */

import { useCallback, useEffect, useState } from 'react'
import { Icono } from '@/components/ui/Icono'
import { diasNavegables, diaVecino } from '@/lib/envios/portal.core.js'
// Una sola función, y de un archivo sin dependencias. 🔴 El teléfono argentino necesita el `9` que
// no viene en el dato: sin eso, `wa.me` abre un chat con un número que no existe. Reimplementarlo
// acá sería la tercera copia de una regla que ya nos mordió una vez.
import { normalizeArgPhone } from '@/lib/crm/core'

/** Un envío de un día que todavía no llegó: para saber qué viene, no para ir a la puerta. */
type EnvioQueViene = {
  marca: string
  cliente: string | null
  localidad: string | null
  turno: string | null
  estado: string
  estadoTexto: string
  aCobrar: number
  envioSaldado: boolean
}

/** Un envío del día que se está repartiendo. Lo mismo, más con qué llegar y con qué escribir. */
type EnvioDelCadete = EnvioQueViene & {
  id: string
  orden: string | null
  direccion: string
  piso: string | null
  anotacion: string | null
  telefono: string | null
  cobrado: boolean | null
}

type DiaConEnvios = { fecha: string; cuantos: number; rotulo: string }

/**
 * La hoja que se está mirando. Es una unión y no un objeto con `envios` y un booleano al lado: así
 * el compilador no deja pintar los botones sobre un día que el servidor mandó recortado.
 */
type Hoja =
  | { editable: true; fecha: string; rotulo: string; envios: EnvioDelCadete[] }
  | { editable: false; fecha: string; rotulo: string; envios: EnvioQueViene[] }

const LLAVE = 'cadete.pin'
const API = '/api/postventa?recurso=cadete'

// ── El kit, en la versión que entra en un teléfono ───────────────────────────────────────────
//
// Los valores salen de `app/tokens.css` y de `components/ui/tokens.ts` (radius, space, font), que
// es lo que hace que esto se vea del mismo sistema que el Monitor.

const caja: React.CSSProperties = {
  maxWidth: 520,
  margin: '0 auto',
  padding: 16,
  paddingBottom: 40,
  fontFamily: 'var(--mo-font)',
  color: 'var(--mo-ink)',
  background: 'var(--mo-canvas)',
  minHeight: '100vh',
  boxSizing: 'border-box',
}

// 16px de fuente en los campos: menos que eso y iOS hace zoom solo al enfocar, y la pantalla queda
// corrida justo cuando hay que tipear con una mano.
const campo: React.CSSProperties = {
  width: '100%',
  padding: 14,
  fontSize: 16,
  fontFamily: 'inherit',
  borderRadius: 10,
  border: '1px solid var(--mo-line)',
  background: 'var(--mo-surface)',
  color: 'inherit',
  boxSizing: 'border-box',
}

/**
 * Los botones, en tres pesos.
 *
 * 🔑 **La jerarquía es el diseño acá.** Lo que se hace en casi todas las puertas —entregué, cobré—
 * son dos botones grandes y llenos; lo que pasa a veces —no entregué, no me pagó— tiene que estar a
 * mano pero no puede competir por el pulgar con lo otro. Con los cuatro iguales, el error de un
 * toque cuesta lo mismo que el acierto.
 */
const boton = (tono: 'brand' | 'success' | 'danger' | 'neutral', peso: 'lleno' | 'suave' | 'ghost'): React.CSSProperties => {
  const solido =
    tono === 'success' ? 'var(--mo-success)' : tono === 'danger' ? 'var(--mo-danger)' : tono === 'brand' ? 'var(--mo-brand-solid)' : 'var(--mo-ink2)'
  const tinta = tono === 'success' ? 'var(--mo-success-ink)' : tono === 'danger' ? 'var(--mo-danger-ink)' : tono === 'brand' ? 'var(--mo-brand)' : 'var(--mo-ink2)'
  const fondo = tono === 'success' ? 'var(--mo-success-bg)' : tono === 'danger' ? 'var(--mo-danger-bg)' : tono === 'brand' ? 'var(--mo-brand-bg)' : 'var(--mo-bg2)'
  const borde = tono === 'success' ? 'var(--mo-success-border)' : tono === 'danger' ? 'var(--mo-danger-border)' : tono === 'brand' ? 'var(--mo-brand-border)' : 'var(--mo-line)'
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    padding: peso === 'lleno' ? '14px 12px' : '9px 10px',
    fontSize: peso === 'lleno' ? 16 : 13,
    fontWeight: peso === 'lleno' ? 600 : 500,
    fontFamily: 'inherit',
    lineHeight: 1.1,
    color: peso === 'lleno' ? '#fff' : tinta,
    background: peso === 'lleno' ? solido : peso === 'suave' ? fondo : 'transparent',
    border: peso === 'ghost' ? '1px solid var(--mo-line)' : peso === 'suave' ? `1px solid ${borde}` : 0,
    borderRadius: 10,
    cursor: 'pointer',
    boxSizing: 'border-box',
  }
}

const plata = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

const abierto = (e: { estado: string }) => e.estado !== 'entregado' && e.estado !== 'no_entregado'

export function PortalCadete({ token }: { token: string | null }) {
  const [pin, setPin] = useState('')
  const [hoja, setHoja] = useState<Hoja | null>(null)
  const [hoy, setHoy] = useState<string | null>(null)
  const [proximos, setProximos] = useState<DiaConEnvios[]>([])
  const [estado, setEstado] = useState<'pidiendo-pin' | 'cargando' | 'listo' | 'muerto'>('cargando')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const traer = useCallback(
    async (elPin: string, dia?: string) => {
      if (!token) return setEstado('muerto')
      setError(null)
      try {
        // Sin `dia`, el pedido va pelado y contesta el día de hoy —el de Argentina, calculado en el
        // servidor—. Es lo que hace que el link a secas sirva sin que el teléfono sepa qué día es.
        const conDia = dia ? `&fecha=${encodeURIComponent(dia)}` : ''
        const r = await fetch(`${API}&token=${encodeURIComponent(token)}&pin=${encodeURIComponent(elPin)}${conDia}&nc=${Date.now()}`)
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
        const comun = { fecha: String(d.fecha || ''), rotulo: String(d.rotulo || '') }
        setHoja(d.editable ? { editable: true, ...comun, envios: d.envios || [] } : { editable: false, ...comun, envios: d.envios || [] })
        setHoy(d.hoy || null)
        setProximos(d.proximos || [])
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
        // 🔑 La fecha viaja: sin ella, a las 00:30 —mirando todavía la hoja de ayer— el servidor
        // buscaría el envío en el día de hoy y contestaría que no es de ahí.
        body: JSON.stringify({ recurso: 'cadete', token, pin, id: e.id, accion, fecha: hoja?.fecha }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo guardar.')
      await traer(pin, hoja?.fecha)
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
        <Encabezado />
        <Tarjetón>
          <h2 style={{ fontSize: 17, margin: 0 }}>Este link ya no sirve</h2>
          <p style={{ color: 'var(--mo-mut)', marginBottom: 0 }}>Pedí el link nuevo en el local. Se cambia a principio de cada mes.</p>
        </Tarjetón>
      </div>
    )
  }

  if (estado === 'pidiendo-pin' || !hoja) {
    return (
      <div style={caja}>
        <Encabezado />
        <Tarjetón>
          <p style={{ color: 'var(--mo-mut)', marginTop: 0 }}>Poné el PIN que te pasaron.</p>
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
            {error ? <p style={{ color: 'var(--mo-danger-ink)' }}>{error}</p> : null}
            <div style={{ marginTop: 12 }}>
              <button type="submit" style={boton('brand', 'lleno')}>
                Entrar
              </button>
            </div>
          </form>
        </Tarjetón>
      </div>
    )
  }

  const dias = diasNavegables(proximos, hoy || hoja.fecha) as DiaConEnvios[]
  const anterior = diaVecino(dias, hoja.fecha, -1)
  const siguiente = diaVecino(dias, hoja.fecha, 1)
  const porEntregar = hoja.envios.filter(abierto).length

  return (
    <div style={caja}>
      <Encabezado />

      {/* 🔑 El día, con flechas: es el mismo gesto que la hoja interna. Las flechas saltan al día
          **con envíos** anterior y siguiente, no al día calendario — los días sin reparto son
          pantallas siempre vacías y pasar por ellas de a un toque es lo que hace que nadie navegue.
          Hoy está siempre en el camino aunque esté vacío, para poder volver. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Flecha hacia="anterior" a={anterior} onIr={(f) => void traer(pin, f)} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{hoja.rotulo || hoja.fecha}</div>
          <div style={{ fontSize: 13, color: 'var(--mo-mut)' }}>
            {!hoja.envios.length ? 'sin envíos' : hoja.editable ? `${porEntregar} por entregar` : `${hoja.envios.length} ${hoja.envios.length === 1 ? 'envío' : 'envíos'}`}
          </div>
        </div>
        <Flecha hacia="siguiente" a={siguiente} onIr={(f) => void traer(pin, f)} />
      </div>

      {error ? (
        <div style={{ background: 'var(--mo-danger-bg)', border: '1px solid var(--mo-danger-border)', color: 'var(--mo-danger-ink)', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 14 }}>
          {error}
        </div>
      ) : null}

      {!hoja.envios.length ? (
        <Tarjetón>
          <p style={{ color: 'var(--mo-mut)', margin: 0 }}>Ese día no hay envíos cargados.</p>
        </Tarjetón>
      ) : null}

      {/* 🔑 Un día que no se puede tocar se dibuja con la tarjeta flaca, que es la única forma que
          existe para los datos que mandó el servidor: no hay dirección ni teléfono que pintar. */}
      {!hoja.editable ? (
        <>
          {hoja.envios.length ? (
            <p style={{ color: 'var(--mo-mut)', fontSize: 13, marginTop: 0 }}>
              Esto es para que sepas qué viene. La dirección y el teléfono aparecen el día del reparto.
            </p>
          ) : null}
          {hoja.envios.map((e, i) => (
            <TarjetaQueViene key={`${hoja.fecha}-${i}`} envio={e} />
          ))}
        </>
      ) : (
        <>
          {hoja.envios.filter(abierto).map((e) => (
            <Tarjeta key={e.id} envio={e} ocupado={ocupado} onMarcar={marcar} />
          ))}

          {/* Los cerrados quedan abajo y apagados: sirven para confirmar que no falta ninguno, pero
              no tienen que competir por la atención con los que todavía hay que llevar. */}
          {hoja.envios.some((e) => !abierto(e)) ? (
            <>
              <h2 style={{ fontSize: 14, color: 'var(--mo-mut)', marginTop: 28, marginBottom: 0, textTransform: 'uppercase', letterSpacing: 0.4 }}>Ya cerrados</h2>
              {hoja.envios
                .filter((e) => !abierto(e))
                .map((e) => (
                  <Tarjeta key={e.id} envio={e} ocupado={ocupado} onMarcar={marcar} apagado />
                ))}
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

/** La marca del Monitor arriba de todo: esto es del local, aunque se abra desde un link suelto. */
function Encabezado() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 14px' }}>
      <span style={{ display: 'inline-flex', color: 'var(--mo-brand)' }}>
        <Icono nombre="envios" size={22} />
      </span>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>Envíos del día</div>
        <div style={{ fontSize: 12, color: 'var(--mo-mut)', letterSpacing: 0.6, textTransform: 'uppercase' }}>Areben</div>
      </div>
    </div>
  )
}

/** Una flecha del selector de día. Apagada en la punta: no da la vuelta ni lleva a un día vacío. */
function Flecha({ hacia, a, onIr }: { hacia: 'anterior' | 'siguiente'; a: string | null; onIr: (f: string) => void }) {
  const puede = !!a
  return (
    <button
      type="button"
      disabled={!puede}
      onClick={() => a && onIr(a)}
      aria-label={hacia === 'anterior' ? 'El día anterior' : 'El día siguiente'}
      style={{
        width: 42,
        height: 42,
        flex: '0 0 auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        border: '1px solid var(--mo-line)',
        background: 'var(--mo-surface)',
        color: puede ? 'var(--mo-ink2)' : 'var(--mo-mut2)',
        opacity: puede ? 1 : 0.45,
        cursor: puede ? 'pointer' : 'default',
        fontSize: 18,
        lineHeight: 1,
      }}
    >
      {hacia === 'anterior' ? '←' : '→'}
    </button>
  )
}

/** El marco de una tarjeta, igual en las dos formas. */
function Tarjetón({ apagado, children }: { apagado?: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid var(--mo-line)',
        borderRadius: 12,
        padding: 14,
        marginTop: 12,
        opacity: apagado ? 0.6 : 1,
        background: 'var(--mo-surface)',
        boxShadow: 'var(--mo-sh-sm)',
      }}
    >
      {children}
    </div>
  )
}

/** El chip de la marca, con los colores que ya tiene cada una en el Monitor. */
function Marca({ marca }: { marca: string }) {
  const m = marca === 'zattia' ? 'zattia' : 'bdi'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        color: `var(--mo-marca-${m}-fg)`,
        background: `var(--mo-marca-${m}-bg)`,
      }}
    >
      {m === 'bdi' ? 'BDI' : 'Zattia'}
    </span>
  )
}

/**
 * La plata, con el mismo criterio que el papel: o un monto, o la palabra.
 *
 * 🔑 **«PAGADO» no es «$0».** Un cero se lee como un precio; el ticket impreso resuelve lo mismo con
 * un rectángulo negro, y acá con el fondo verde.
 */
function Plata({ aCobrar, chico }: { aCobrar: number; chico?: boolean }) {
  const pago = aCobrar === 0
  return (
    <div
      style={{
        marginTop: 10,
        padding: '10px 12px',
        borderRadius: 10,
        background: pago ? 'var(--mo-success-bg)' : 'var(--mo-warning-bg)',
        border: `1px solid ${pago ? 'var(--mo-success-border)' : 'var(--mo-warning-border)'}`,
        color: pago ? 'var(--mo-success-ink)' : 'var(--mo-warning-ink)',
        fontSize: pago ? 15 : chico ? 18 : 22,
        fontWeight: 700,
      }}
    >
      {pago ? 'PAGADO · no cobrar nada' : `COBRAR ${plata(aCobrar)}`}
    </div>
  )
}

/**
 * Un envío que todavía no salió: cuántos son, de qué marca y para qué zona.
 *
 * 🔴 **No tiene con qué llegar a la puerta, y no es un descuido**: el servidor no manda dirección ni
 * teléfono de los días que no llegaron, así que un link filtrado se lleva una lista de nombres y
 * barrios de la semana, no una semana de direcciones.
 */
function TarjetaQueViene({ envio }: { envio: EnvioQueViene }) {
  return (
    <Tarjetón>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Marca marca={envio.marca} />
        {envio.turno ? <span style={{ fontSize: 12, color: 'var(--mo-mut)' }}>{envio.turno}</span> : null}
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 6 }}>{envio.cliente || 'Sin nombre'}</div>
      <div style={{ fontSize: 15, marginTop: 2, color: 'var(--mo-mut)' }}>{envio.localidad || 'Sin localidad'}</div>
      <Plata aCobrar={envio.aCobrar} chico />
    </Tarjetón>
  )
}

/**
 * Un envío del día: a dónde ir, cómo avisar, cuánto cobrar, y qué pasó.
 *
 * 🔑 **WhatsApp primero**: es como el cadete avisa que está llegando. Llamar queda al lado porque a
 * veces no contestan el mensaje, y el mapa tercero porque se toca una vez por puerta.
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
  const cerrado = !abierto(envio)
  const wa = normalizeArgPhone(envio.telefono)
  const tel = String(envio.telefono || '').replace(/[^\d+]/g, '')
  const donde = [envio.direccion, envio.piso, envio.localidad].filter(Boolean).join(' · ')
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([envio.direccion, envio.localidad, 'Rosario'].filter(Boolean).join(', '))}`
  const trabajando = (accion: string) => ocupado === envio.id + accion

  return (
    <Tarjetón apagado={apagado}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Marca marca={envio.marca} />
        {envio.orden ? <span style={{ fontSize: 12, color: 'var(--mo-mut)' }}>#{envio.orden}</span> : null}
        {envio.turno ? <span style={{ fontSize: 12, color: 'var(--mo-mut)' }}>· {envio.turno}</span> : null}
      </div>

      <div style={{ fontSize: 19, fontWeight: 700, marginTop: 6 }}>{envio.cliente || 'Sin nombre'}</div>
      <div style={{ fontSize: 16, marginTop: 2 }}>{donde}</div>
      {envio.anotacion ? <div style={{ fontSize: 14, color: 'var(--mo-mut)', marginTop: 4 }}>{envio.anotacion}</div> : null}

      <Plata aCobrar={envio.aCobrar} />

      {/* Contacto y mapa: llevan a otra app, así que van en el peso del medio — nunca compiten con
          los dos botones que escriben. */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {wa ? (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textDecoration: 'none' }}>
            <span style={boton('success', 'suave')}>
              <Icono nombre="whatsapp" size={16} /> WhatsApp
            </span>
          </a>
        ) : null}
        {tel ? (
          <a href={`tel:${tel}`} style={{ flex: 1, textDecoration: 'none' }}>
            <span style={boton('neutral', 'suave')}>
              <Icono nombre="telefono" size={16} /> Llamar
            </span>
          </a>
        ) : null}
        <a href={mapa} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textDecoration: 'none' }}>
          <span style={boton('neutral', 'suave')}>Mapa</span>
        </a>
      </div>

      {/* ── Lo que se escribe ─────────────────────────────────────────────────────────────────
          🔑 Dos pesos, y ésa es toda la idea: **entregado** y **cobrado** son lo que pasa en casi
          todas las puertas y van llenos y grandes; **no entregado** y **no cobré** son lo que pasa a
          veces, tienen que estar a mano, y no pueden competir por el pulgar con los otros dos. */}
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {!cerrado ? (
          <button style={boton('success', 'lleno')} disabled={!!ocupado} onClick={() => void onMarcar(envio, 'entregado')}>
            <Icono nombre="check" size={18} /> {trabajando('entregado') ? 'Guardando…' : 'Marcar entregado'}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--mo-mut)' }}>
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 12,
                color: envio.estado === 'entregado' ? 'var(--mo-success-ink)' : 'var(--mo-danger-ink)',
                background: envio.estado === 'entregado' ? 'var(--mo-success-bg)' : 'var(--mo-danger-bg)',
              }}
            >
              {envio.estadoTexto}
            </span>
          </div>
        )}

        {/* 🔑 El cobro sigue disponible aunque el paquete ya esté cerrado: se entrega y recién
            después se cuenta la plata, y sin esto «entregado» tapaba la única forma de decir que en
            esa puerta no se cobró. */}
        {envio.aCobrar > 0 ? (
          <button
            style={envio.cobrado === true ? boton('success', 'suave') : boton('brand', 'lleno')}
            disabled={!!ocupado}
            onClick={() => void onMarcar(envio, 'cobrado')}
          >
            <Icono nombre="check" size={18} />
            {trabajando('cobrado') ? 'Guardando…' : envio.cobrado === true ? 'Cobrado ✓' : 'Marcar cobrado'}
          </button>
        ) : null}

        <div style={{ display: 'flex', gap: 8 }}>
          {!cerrado || envio.estado === 'entregado' ? (
            <button style={boton('danger', 'ghost')} disabled={!!ocupado} onClick={() => void onMarcar(envio, 'no_entregado')}>
              {trabajando('no_entregado') ? '…' : 'No entregado'}
            </button>
          ) : null}
          {envio.aCobrar > 0 ? (
            <button
              style={{ ...boton('danger', 'ghost'), ...(envio.cobrado === false ? { color: 'var(--mo-danger-ink)', borderColor: 'var(--mo-danger-border)', background: 'var(--mo-danger-bg)' } : null) }}
              disabled={!!ocupado}
              onClick={() => void onMarcar(envio, 'no_cobrado')}
            >
              {trabajando('no_cobrado') ? '…' : envio.cobrado === false ? 'No cobré ✓' : 'No cobré'}
            </button>
          ) : null}
        </div>
      </div>
    </Tarjetón>
  )
}

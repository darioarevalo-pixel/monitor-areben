'use client'

/**
 * "Pagos" — la tercera pestaña del panel de WhatsApp, al lado de Cliente y Hoy.
 *
 * # Qué contesta, y por qué es una pestaña y no un recuadro
 *
 * El paralelo con "Hoy" es exacto: **"Hoy" dice a quién hablarle; "Pagos" dice quién debe y qué
 * prometió.** Es la agenda del día, pero de cobranza.
 *
 * Hasta el 3-sep-2026 esto vivía como un bloque chico adentro de la ficha del cliente, y ahí estaba
 * de más y de menos a la vez (Darío, mirándolo en uso):
 *
 * - **De menos**, porque lo trataba como un dato de contexto de ESE cliente cuando en realidad es
 *   una lista de trabajo que cruza a todos: quién debe, qué prometió, qué falta confirmar. Metido
 *   en la ficha, para saber qué había pendiente había que ir cliente por cliente.
 * - **De más**, porque competía con lo que la ficha contesta, que es "¿qué le vendo a esta
 *   persona?".
 *
 * # 🔑 Las dos listas están separadas a propósito
 *
 * Ver `colaDeCobranza` en `lib/compromisos/core.ts`: un "dice que transfirió" espera trabajo
 * NUESTRO (mirar el banco y confirmarlo) y un "prometido" espera al cliente. Son dos tareas de dos
 * personas distintas, y mezcladas la que uno puede resolver hoy queda escondida entre las que no.
 *
 * # Lo que sí es de este cliente sigue acá arriba
 *
 * Anotar una promesa nueva necesita saber quién va a transferir, y eso se decide hablando. Por eso
 * el formulario está arriba de todo y usa el cliente del chat abierto: no se vuelve a escribir a
 * quién, ya está identificado. Sin chat abierto la pestaña sigue sirviendo —la lista de trabajo es
 * lo que más se mira— y en lugar del formulario dice qué falta para poder anotar.
 *
 * # ⚠️ Las dos trampas ya pagadas del panel (ver `Aislado.tsx`)
 *
 * 1. Va envuelto en `Aislado` del lado del que la llama. La app no tiene ningún `ErrorBoundary`:
 *    un error acá adentro desmontaría también la ficha.
 * 2. **No se consulta nada al abrir un chat.** Los hooks viven adentro de este componente, que se
 *    monta recién cuando alguien toca la pestaña. Cambiar de chat con la pestaña cerrada no cuesta
 *    ni una consulta.
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui'
import { color, font, radius, space } from '@/components/ui/tokens'
import { useAcreedores } from '@/components/acreedores/useAcreedores'
import { useCompromisos } from '@/components/acreedores/useCompromisos'
import { NuevaPromesa, type QuienPaga } from './NuevaPromesa'
import { cambiarEstado, confirmarCompromiso, vincularCompromiso } from '@/lib/compromisos/cliente'
import { colaDeCobranza, diasPara, sinVincular, type Compromiso } from '@/lib/compromisos/core'
import { hoyISO } from '@/lib/crm/seguimiento'

const plata = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

/** De a cuántas cerradas se muestran. No es una lista de trabajo: es para mirar atrás un rato. */
const CERRADAS = 10

/** La fecha prometida, en el idioma en que se piensa la cobranza. */
function cuando(fecha: string | null, hoy: string): { txt: string; tarde: boolean } {
  const d = diasPara(fecha, hoy)
  if (d === null) return { txt: 'sin fecha', tarde: false }
  if (d === 0) return { txt: 'lo prometió para hoy', tarde: false }
  if (d < 0) return { txt: `vencida hace ${-d} ${-d === 1 ? 'día' : 'días'}`, tarde: true }
  return { txt: `para dentro de ${d} ${d === 1 ? 'día' : 'días'}`, tarde: false }
}

function Bloque({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg,
        padding: `${space[2]}px ${space[3]}px ${space[3]}px`, margin: `0 ${space[2]}px ${space[2]}px`,
      }}
    >
      {titulo && (
        <div style={{ fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, color: color.mut2, textTransform: 'uppercase', marginBottom: 6 }}>
          {titulo}
        </div>
      )}
      {children}
    </section>
  )
}

function Titulo({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ padding: `${space[2]}px ${space[3]}px 4px` }}>
      <div style={{ fontSize: font.sm, fontWeight: 700, color: color.ink }}>{children}</div>
      {sub && <div style={{ fontSize: font.xs, color: color.mut2 }}>{sub}</div>}
    </div>
  )
}

/** Un botón de acción de una fila. Chico, en línea, y nunca dos veces el mismo verbo. */
function Accion({ children, onClick, tono }: {
  children: React.ReactNode
  onClick: () => void
  tono?: 'fuerte' | 'suave'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 'auto', padding: '3px 9px', borderRadius: 999, fontSize: font.xs, fontWeight: 700,
        cursor: 'pointer', whiteSpace: 'nowrap',
        border: `1px solid ${tono === 'fuerte' ? color.brandBorder : color.line2}`,
        background: tono === 'fuerte' ? color.brandBg : 'transparent',
        color: tono === 'fuerte' ? color.brand : color.mut,
      }}
    >
      {children}
    </button>
  )
}

/**
 * Confirmar, en la misma fila y no en un modal.
 *
 * 🔑 **Pregunta cuánto entró y qué día, y las dos preguntas son necesarias.** El monto porque el
 * cliente muchas veces manda menos de lo prometido (y entonces el servidor cierra ésta por lo que
 * entró y abre una nueva por el resto); la fecha porque **el cierre de mes del dashboard imputa
 * por ella**, y "hoy" no es necesariamente el día en que transfirió.
 */
function Confirmar({ c, onListo, onCancelar }: {
  c: Compromiso
  onListo: (monto: number, fecha: string) => Promise<void>
  onCancelar: () => void
}) {
  const [monto, setMonto] = useState(String(c.monto))
  const [fecha, setFecha] = useState(hoyISO())
  const [yendo, setYendo] = useState(false)
  const n = Number(String(monto).replace(/\./g, '').replace(',', '.'))
  const falta = Math.max(0, Math.round((Number(c.monto) - n) * 100) / 100)

  const input: React.CSSProperties = {
    minWidth: 0, padding: '6px 8px', fontSize: font.sm, border: `1px solid ${color.line2}`,
    borderRadius: radius.md, background: color.bg, color: color.ink,
  }

  return (
    <div style={{ marginTop: 6, padding: space[2], background: color.bg2, borderRadius: radius.md }}>
      <div style={{ fontSize: font.xs, color: color.mut, marginBottom: 6 }}>
        Esto <b>escribe el pago en el dashboard</b>: baja la deuda con {c.acreedor_nombre}.
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal"
          aria-label="¿Cuánto entró?" style={{ ...input, flex: '1 1 110px' }} />
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
          aria-label="¿Qué día transfirió?" style={{ ...input, flex: '1 1 130px' }} />
      </div>
      {falta > 0 && (
        <div style={{ fontSize: font.xs, color: color.mut, marginTop: 6 }}>
          Entró {plata(falta)} menos de lo prometido. Ésta se cierra por lo que entró y queda una
          nueva por {plata(falta)} para poder seguir reclamándolo.
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <Button size="sm" disabled={!Number.isFinite(n) || n <= 0 || yendo}
          onClick={async () => { setYendo(true); try { await onListo(n, fecha) } finally { setYendo(false) } }}>
          {yendo ? 'Registrando…' : 'Sí, entró'}
        </Button>
        <Accion onClick={onCancelar}>Ahora no</Accion>
      </div>
    </div>
  )
}

function Fila({ c, hoy, puede, abierta, onConfirmarAbrir, onConfirmar, onEstado, onIrAlCliente }: {
  c: Compromiso
  hoy: string
  puede: { prometer: boolean; confirmar: boolean }
  abierta: boolean
  onConfirmarAbrir: (id: string | null) => void
  onConfirmar: (c: Compromiso, monto: number, fecha: string) => Promise<void>
  onEstado: (c: Compromiso, estado: 'prometido' | 'transferido' | 'cancelado') => void
  onIrAlCliente: ((c: Compromiso) => void) | null
}) {
  const fecha = cuando(c.fecha_prometida, hoy)
  const idCliente = Number(c.cliente_id)
  // Con teléfono se puede abrir el chat; con id, la ficha. Sin ninguno de los dos, es texto.
  const puedeIr = !!onIrAlCliente && (!!c.cliente_telefono || (Number.isFinite(idCliente) && idCliente > 0))

  return (
    <div style={{ borderTop: `1px solid ${color.line2}`, padding: `${space[2]}px ${space[3]}px` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: font.md, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>
          {plata(Number(c.monto))}
        </span>
        <span style={{ fontSize: font.sm, color: color.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {puedeIr ? (
            <button type="button" onClick={() => onIrAlCliente(c)}
              title={c.cliente_telefono ? 'Abrir su chat' : 'Ver su ficha'}
              style={{ height: 'auto', padding: 0, background: 'none', border: 0, font: 'inherit', color: color.brand, cursor: 'pointer', textDecoration: 'underline' }}>
              {c.cliente_nombre}
            </button>
          ) : c.cliente_nombre}
        </span>
      </div>
      {/* Que todavía no esté en el ERP se dice: es lo que explica por qué esa promesa no cruza con
          ninguna deuda, y es un pendiente de carga, no un error. */}
      {!c.cliente_id && (
        <div style={{ fontSize: font.xs, color: color.warningInk }}>todavía no está cargado en el sistema</div>
      )}
      <div style={{ fontSize: font.xs, color: fecha.tarde ? color.dangerInk : color.mut2, marginTop: 2 }}>
        para {c.acreedor_nombre}
        {c.cuenta_alias ? ` · ${c.cuenta_alias}` : ''} · {fecha.txt}
      </div>
      {c.titular_real && c.titular_real !== c.cliente_nombre && (
        <div style={{ fontSize: font.xs, color: color.mut }}>transfiere {c.titular_real}</div>
      )}
      {c.viene_de && <div style={{ fontSize: font.xs, color: color.mut }}>es el resto de una anterior</div>}

      {abierta ? (
        <Confirmar c={c} onCancelar={() => onConfirmarAbrir(null)}
          onListo={(monto, f) => onConfirmar(c, monto, f)} />
      ) : (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {puede.confirmar && <Accion tono="fuerte" onClick={() => onConfirmarAbrir(c.id)}>Ya entró</Accion>}
          {puede.prometer && c.estado === 'prometido' && (
            <Accion onClick={() => onEstado(c, 'transferido')}>Dice que transfirió</Accion>
          )}
          {puede.prometer && c.estado === 'transferido' && (
            <Accion onClick={() => onEstado(c, 'prometido')}>No era</Accion>
          )}
          {puede.prometer && <Accion onClick={() => onEstado(c, 'cancelado')}>Se cayó</Accion>}
        </div>
      )}
    </div>
  )
}

export function Pagos({ cliente, buscandoCliente, onIrAlCliente }: {
  /**
   * Quién está del otro lado del chat: el cliente de Gestión Nube, o alguien que compró y todavía
   * no se cargó (ver `QuienPaga`). `null` sólo cuando no hay ningún chat abierto.
   */
  cliente: QuienPaga | null
  /**
   * Hay un chat abierto pero la ficha todavía está cargando. Sin esto la pestaña diría "abrí el
   * chat de un cliente" con el chat abierto — un cartel que manda a hacer lo que ya está hecho.
   */
  buscandoCliente?: boolean
  /** Saltar de una fila a esa persona: su chat si hay teléfono, su ficha si no. */
  onIrAlCliente: ((c: Compromiso) => void) | null
}) {
  const deudas = useAcreedores()
  const promesas = useCompromisos()
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [verCerradas, setVerCerradas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<string | null>(null)
  const [hoy] = useState(() => hoyISO())

  const cola = useMemo(() => colaDeCobranza(promesas.compromisos), [promesas.compromisos])
  const puede = promesas.puede
  // Las promesas de ESTE número que se anotaron antes de que el cliente existiera en Gestión Nube.
  const porVincular = useMemo(
    () => (puede.prometer && cliente?.tipo === 'erp' ? sinVincular(promesas.compromisos, cliente.telefono) : []),
    [promesas.compromisos, cliente, puede.prometer],
  )

  async function correr(fn: () => Promise<string>) {
    setError(null)
    try {
      const txt = await fn()
      setListo(txt)
      promesas.recargar()
      // El saldo del acreedor lo calcula el dashboard: al confirmar bajó de verdad, y si no se
      // relee, la próxima promesa se ofrecería contra un número viejo.
      deudas.recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    }
  }

  if (promesas.cargando) {
    return <div style={{ padding: space[3], fontSize: font.sm, color: color.mut2 }}>Buscando las promesas de pago…</div>
  }

  if (!puede.ver) {
    return (
      <div style={{ padding: space[3], fontSize: font.sm, color: color.mut2 }}>
        Tu usuario no tiene habilitadas las promesas de pago. Se activa en Usuarios.
      </div>
    )
  }

  const lista = (titulo: string, sub: string, filas: Compromiso[]) =>
    filas.length > 0 && (
      <>
        <Titulo sub={sub}>{titulo} · {filas.length}</Titulo>
        {filas.map((c) => (
          <Fila
            key={c.id}
            c={c}
            hoy={hoy}
            puede={puede}
            abierta={confirmando === c.id}
            onConfirmarAbrir={setConfirmando}
            onEstado={(x, estado) => correr(async () => {
              await cambiarEstado(x.id, estado)
              return estado === 'cancelado'
                ? `Listo: la promesa de ${plata(Number(x.monto))} quedó como caída.`
                : estado === 'transferido'
                  ? 'Anotado: dice que ya transfirió. Falta confirmarlo.'
                  : 'Vuelve a quedar como prometida.'
            })}
            onConfirmar={async (x, monto, fecha) => {
              await correr(async () => {
                const r = await confirmarCompromiso(x.id, monto, fecha)
                setConfirmando(null)
                return r.nueva
                  ? `Listo: ${plata(monto)} registrados en el dashboard. Como entró menos, quedó una promesa nueva por ${plata(Number(r.nueva.monto))}.`
                  : `Listo: ${plata(monto)} registrados en el dashboard.`
              })
            }}
            onIrAlCliente={onIrAlCliente}
          />
        ))}
      </>
    )

  return (
    <div>
      {promesas.error && (
        <div style={{ margin: space[2], fontSize: font.xs, color: color.dangerInk, background: color.dangerBg, border: `1px solid ${color.dangerBorder}`, borderRadius: radius.sm, padding: '6px 8px' }}>
          {promesas.error}
        </div>
      )}
      {deudas.error && (
        <div style={{ margin: space[2], fontSize: font.xs, color: color.mut, background: color.bg2, border: `1px solid ${color.line2}`, borderRadius: radius.sm, padding: '6px 8px' }}>
          No se pudo leer a quién le debemos, así que no se puede anotar una promesa nueva. La lista
          de abajo anda igual.
        </div>
      )}

      {/*
        🔑 **El reenganche, en el único momento en que el dato existe.**
        Se anotó la cobranza de alguien que todavía no estaba en Gestión Nube, y ahora el panel
        abrió su ficha de verdad: es acá donde se sabe que esas dos personas son la misma. Si no se
        ofrece en este momento, la promesa queda para siempre con un nombre escrito a mano que no
        cruza con ninguna deuda — y nadie va a ir a buscarla.
      */}
      {porVincular.length > 0 && cliente?.tipo === 'erp' && (
        <Bloque titulo="Se anotó antes de que estuviera cargado">
          <div style={{ fontSize: font.sm, color: color.mut2, marginBottom: 8 }}>
            Con este número hay {porVincular.length === 1 ? 'una promesa anotada' : `${porVincular.length} promesas anotadas`}{' '}
            a nombre de <b style={{ color: color.ink }}>{porVincular.map((c) => c.cliente_nombre).join(', ')}</b>,
            de cuando todavía no estaba en el sistema. ¿Es {cliente.nombre || `#${cliente.id}`}?
          </div>
          <Button
            size="sm"
            onClick={() => correr(async () => {
              for (const c of porVincular) {
                await vincularCompromiso(c.id, { id: String(cliente.id), nombre: cliente.nombre })
              }
              return porVincular.length === 1
                ? `Listo: la promesa quedó a nombre de ${cliente.nombre}.`
                : `Listo: las ${porVincular.length} promesas quedaron a nombre de ${cliente.nombre}.`
            })}
          >
            Sí, es {cliente.nombre || 'este cliente'}
          </Button>
        </Bloque>
      )}

      {/* Anotar. Arriba de todo porque es lo que se hace CON el cliente adelante. */}
      <Bloque titulo="Que le pague a un acreedor">
        {cliente ? (
          <NuevaPromesa
            cliente={cliente}
            acreedores={deudas.acreedores}
            compromisos={promesas.compromisos}
            puede={puede}
            cargando={deudas.cargando}
            onCreado={(txt) => { setListo(txt); promesas.recargar() }}
          />
        ) : buscandoCliente ? (
          <div style={{ fontSize: font.sm, color: color.mut2 }}>Buscando de quién es el chat…</div>
        ) : (
          <div style={{ fontSize: font.sm, color: color.mut2 }}>
            Abrí el chat de un cliente y volvé acá para anotarle una promesa. Abajo está igual todo
            lo que se prometió.
          </div>
        )}
      </Bloque>

      {error && (
        <div style={{ margin: `0 ${space[2]}px ${space[2]}px`, fontSize: font.xs, color: color.dangerInk }}>{error}</div>
      )}
      {listo && (
        <div style={{ margin: `0 ${space[2]}px ${space[2]}px`, fontSize: font.xs, color: color.successInk }}>{listo}</div>
      )}

      {cola.totalAbierto === 0 ? (
        <div style={{ padding: `0 ${space[3]}px ${space[3]}px`, fontSize: font.sm, color: color.mut }}>
          No hay ninguna transferencia esperando.
        </div>
      ) : (
        <div style={{ padding: `0 ${space[3]}px ${space[2]}px`, fontSize: font.xs, color: color.mut2 }}>
          Hay <b style={{ color: color.ink }}>{plata(cola.totalAbierto)}</b> prometidos y sin entrar.
        </div>
      )}

      {lista('Falta confirmar', 'Dicen que ya transfirieron. Mirá el banco y confirmalo.', cola.porConfirmar)}
      {lista('Esperando que transfieran', 'Se lo pedimos y todavía no llegó. Lo vencido primero.', cola.esperando)}

      {cola.cerradas.length > 0 && (
        <>
          <div style={{ height: 8, background: color.bg2, borderTop: `1px solid ${color.line2}`, borderBottom: `1px solid ${color.line2}`, marginTop: space[3] }} />
          {verCerradas ? (
            <>
              <Titulo sub="Las que ya entraron o se cayeron. Lo último, arriba.">Cerradas · {cola.cerradas.length}</Titulo>
              {cola.cerradas.slice(0, CERRADAS).map((c) => (
                <div key={c.id} style={{ borderTop: `1px solid ${color.line2}`, padding: `6px ${space[3]}px`, fontSize: font.sm, color: color.mut }}>
                  <b style={{ color: c.estado === 'confirmado' ? color.successInk : color.mut2 }}>
                    {c.estado === 'confirmado' ? 'entró' : 'se cayó'}
                  </b>{' '}
                  {plata(Number(c.estado === 'confirmado' ? (c.monto_confirmado ?? c.monto) : c.monto))} ·{' '}
                  {c.cliente_nombre} → {c.acreedor_nombre}
                </div>
              ))}
              {cola.cerradas.length > CERRADAS && (
                <div style={{ padding: `6px ${space[3]}px`, fontSize: font.xs, color: color.mut2 }}>
                  Se muestran las {CERRADAS} últimas. El resto está en Dirección → “A quién le debemos”.
                </div>
              )}
            </>
          ) : (
            <button type="button" onClick={() => setVerCerradas(true)}
              style={{ display: 'block', width: '100%', height: 'auto', padding: space[2], background: 'none', border: 0, cursor: 'pointer', fontSize: font.xs, fontWeight: 700, color: color.brand }}>
              Ver las {cola.cerradas.length} que ya se cerraron
            </button>
          )}
        </>
      )}
    </div>
  )
}

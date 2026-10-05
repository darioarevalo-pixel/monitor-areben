'use client'

/**
 * La pantalla de la clienta (`/pos/cliente`, rediseño fase 3 = V1): del otro lado del mostrador ve su
 * compra en vivo y deja el mail para el ticket. Es otra ventana del MISMO equipo que el POS (un segundo
 * monitor o una tablet espejada): lee lo que el POS publica en `localStorage` y ⛔ calcula nada. El
 * porqué, en `lib/caja/pantalla-cliente.ts`.
 */

import { useEffect, useState } from 'react'
import { leerConfig } from '@/lib/caja/cliente'
import { plata, type LogoTicket } from '@/lib/caja/ticket'
import { CLAVE_MAIL, CLAVE_VISTA, enmascarar, leerVista, mailValido, type VistaCliente } from '@/lib/caja/pantalla-cliente'
import { MARCA_CAJA } from '@/lib/caja/marca'
import { Foto } from '@/components/caja/partes'
import { Icono, color, font, radius, space, weight } from '@/components/ui'

const DOMINIOS = ['@gmail.com', '@hotmail.com', '@yahoo.com.ar', '.com']

/** Lee lo que publica el POS, y se entera de cada cambio (el evento `storage` llega de la OTRA ventana). */
export function useVistaCliente(): VistaCliente {
  const [vista, setVista] = useState<VistaCliente>({ estado: 'vacio' })
  useEffect(() => {
    const leer = () => {
      try {
        setVista(leerVista(localStorage.getItem(CLAVE_VISTA)))
      } catch {
        /* sin localStorage: queda la bienvenida */
      }
    }
    leer()
    const oir = (e: StorageEvent) => {
      if (e.key === CLAVE_VISTA) setVista(leerVista(e.newValue))
    }
    window.addEventListener('storage', oir)
    return () => window.removeEventListener('storage', oir)
  }, [])
  return vista
}

function devolverMail(email: string, no = false) {
  try {
    localStorage.setItem(CLAVE_MAIL, JSON.stringify({ email, no, en: Date.now() }))
  } catch {
    /* sin localStorage: el mail lo pide la cajera */
  }
}

/** La cabecera con la marca: el logo del ticket si hay, si no la inicial. */
export function CabeceraMarca({ logo, derecha }: { logo: LogoTicket | null; derecha: string }) {
  return (
    <header style={{ flex: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[3], padding: `${space[4]}px ${space[6]}px`, borderBottom: `1px solid ${color.line}`, color: color.mut, fontSize: font.lg }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[2] + 2, fontWeight: weight.heavy, color: MARCA_CAJA.acento, fontSize: font['2xl'] }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo.src} alt={MARCA_CAJA.nombre} style={{ height: 40 }} />
        ) : (
          <>
            <b style={{ width: 40, height: 40, borderRadius: radius.lg, background: MARCA_CAJA.acento, color: color.surface, display: 'grid', placeItems: 'center' }}>{MARCA_CAJA.nombre[0]}</b>
            {MARCA_CAJA.nombre}
          </>
        )}
      </span>
      <span>{derecha}</span>
    </header>
  )
}

/** El logo del ticket: lo único de la configuración que usa esta pantalla. */
export function useLogo() {
  const [logo, setLogo] = useState<LogoTicket | null>(null)
  useEffect(() => {
    leerConfig()
      .then((c) => setLogo(c.ticket_logo ?? null))
      .catch(() => {})
  }, [])
  return logo
}

export function CajaCliente() {
  const vista = useVistaCliente()
  const logo = useLogo()
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: color.surface, color: color.ink }}>
      <CabeceraMarca logo={logo} derecha={vista.estado === 'compra' ? 'Tu compra' : ''} />
      <main style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {vista.estado === 'vacio' && <Bienvenida />}
        {vista.estado === 'gracias' && <Gracias numero={vista.numero} email={vista.email} />}
        {vista.estado === 'compra' && <Compra v={vista} />}
      </main>
    </div>
  )
}

function Bienvenida() {
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      <div style={{ padding: 'clamp(24px, 5vw, 64px)', display: 'grid', alignContent: 'center', gap: space[3] }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(30px, 4.2vw, 56px)', lineHeight: 1.05, letterSpacing: '-0.03em', textWrap: 'balance' }}>¡Hola! Te damos la bienvenida a {MARCA_CAJA.nombre}</h1>
        <p style={{ margin: 0, fontSize: 'clamp(16px, 1.6vw, 22px)', color: color.mut }}>Cuando empecemos tu compra, la vas a ver acá.</p>
      </div>
      <div aria-hidden style={{ minHeight: 220, background: `linear-gradient(150deg, ${MARCA_CAJA.acentoBg}, ${MARCA_CAJA.acento})` }} />
    </div>
  )
}

function Gracias({ numero, email }: { numero: number | null; email: string | null }) {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', alignContent: 'center', textAlign: 'center', gap: space[3], padding: space[8] }}>
      <Tilde />
      <h1 style={{ margin: 0, fontSize: 'clamp(30px, 4.4vw, 58px)', letterSpacing: '-0.03em' }}>¡Gracias por tu compra!</h1>
      <p style={{ margin: 0, color: color.mut, fontSize: 'clamp(16px, 1.7vw, 22px)' }}>
        {numero ? `Venta #${numero}` : ''}
        {numero && email ? ' · ' : ''}
        {email ? `el ticket te llega a ${enmascarar(email)}` : ''}
      </p>
    </div>
  )
}

function Tilde() {
  return (
    <div style={{ width: 88, height: 88, borderRadius: '50%', background: MARCA_CAJA.acentoBg, color: MARCA_CAJA.acento, display: 'grid', placeItems: 'center' }}>
      <Icono nombre="check" size={44} />
    </div>
  )
}

function Compra({ v }: { v: Extract<VistaCliente, { estado: 'compra' }> }) {
  const par: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: space[3], color: color.ink2 }
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', minHeight: 0 }}>
      <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: 'clamp(16px, 2.4vw, 32px)', gap: space[3] }}>
        <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2vw, 26px)' }}>
          Tu compra · {v.prendas} {v.prendas === 1 ? 'prenda' : 'prendas'}
        </h2>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {v.renglones.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: space[3], alignItems: 'center', padding: `${space[2] + 2}px 0`, borderBottom: `1px solid ${color.bg2}` }}>
              <Foto src={r.foto} ancho={64} proporcion="1" />
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: font.xl }}>{r.nombre}</strong>
                <span style={{ color: color.mut, fontSize: font.lg }}>
                  {r.talle}
                  {r.cantidad > 1 ? ` · ×${r.cantidad}` : ''}
                </span>
              </div>
              <div style={{ textAlign: 'right', fontWeight: weight.bold, fontSize: font.xl, fontVariantNumeric: 'tabular-nums' }}>
                {r.importe < r.lista && <s style={{ display: 'block', fontWeight: weight.medium, color: color.mut2, fontSize: font.md }}>{plata(r.lista)}</s>}
                {plata(r.importe)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${color.line}`, paddingTop: space[3], display: 'grid', gap: space[1.5], fontSize: font.xl, fontVariantNumeric: 'tabular-nums' }}>
          <div style={par}>
            <span>Subtotal</span>
            <span>{plata(v.subtotal)}</span>
          </div>
          {v.descuentoVenta > 0 && (
            <div style={{ ...par, color: color.successInk }}>
              <span>Descuento</span>
              <span>−{plata(v.descuentoVenta)}</span>
            </div>
          )}
          {v.descuentoMedio > 0 && (
            <div style={{ ...par, color: color.successInk }}>
              <span>Descuento {v.medio ? v.medio.toLowerCase() : 'por forma de pago'}</span>
              <span>−{plata(v.descuentoMedio)}</span>
            </div>
          )}
          {v.redondeo !== 0 && (
            <div style={par}>
              <span>{v.redondeo > 0 ? 'Recargo por redondeo' : 'Redondeo'}</span>
              <span>
                {v.redondeo > 0 ? '+' : '−'}
                {plata(Math.abs(v.redondeo))}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space[1] }}>
            <span style={{ fontWeight: weight.heavy }}>Total</span>
            <strong style={{ fontSize: 'clamp(36px, 5.4vw, 72px)', letterSpacing: '-0.03em', lineHeight: 1 }}>{plata(v.total)}</strong>
          </div>
          {v.medio && (
            <div style={{ ...par, background: MARCA_CAJA.acentoBg, color: MARCA_CAJA.acento, borderRadius: radius.lg, padding: `${space[2]}px ${space[3]}px`, fontWeight: weight.semibold, alignItems: 'baseline' }}>
              <span>Pagás con {v.medio.toLowerCase()}</span>
              <strong>{plata(v.total)}</strong>
            </div>
          )}
        </div>
      </section>
      <aside style={{ background: color.bg, borderLeft: `1px solid ${color.line}`, padding: 'clamp(16px, 2.4vw, 32px)', display: 'grid', alignContent: 'center' }}>
        <PedirMail email={v.email} />
      </aside>
    </div>
  )
}

/** El ticket por mail: lo que escribe la clienta va al campo «Mail para el ticket» del POS. */
export function PedirMail({ email }: { email: string }) {
  const [borrador, setBorrador] = useState('')
  const [estado, setEstado] = useState<'pedir' | 'no' | 'corregir'>('pedir')
  const [error, setError] = useState<string | null>(null)
  const grande: React.CSSProperties = { height: 56, borderRadius: radius.xl, fontWeight: weight.bold, fontSize: font.xl, cursor: 'pointer' }
  const link: React.CSSProperties = { height: 'auto', background: 'none', border: 'none', padding: 0, color: MARCA_CAJA.acento, fontWeight: weight.bold, fontSize: font.lg, cursor: 'pointer', justifySelf: 'start' }

  // Con un mail ya puesto en el POS (lo escribió ella o la cajera): listo, salvo que quiera corregirlo.
  if (mailValido(email) && estado !== 'corregir') {
    return (
      <div style={{ display: 'grid', gap: space[2], justifyItems: 'center', textAlign: 'center' }}>
        <Tilde />
        <h3 style={{ margin: 0, fontSize: font['2xl'] }}>¡Listo!</h3>
        <p style={{ margin: 0, color: color.mut, fontSize: font.lg }}>
          Te llega a <b style={{ color: color.ink }}>{enmascarar(email)}</b>
        </p>
        <button
          style={{ ...link, justifySelf: 'center' }}
          onClick={() => {
            setBorrador(email)
            setEstado('corregir')
          }}
        >
          Corregir
        </button>
      </div>
    )
  }
  if (estado === 'no') {
    return (
      <div style={{ display: 'grid', gap: space[2] }}>
        <h3 style={{ margin: 0, fontSize: font['2xl'] }}>Sin problema</h3>
        <p style={{ margin: 0, color: color.mut, fontSize: font.lg }}>Si cambiás de idea, avisanos en la caja.</p>
        <button style={link} onClick={() => setEstado('pedir')}>
          Quiero el ticket por mail
        </button>
      </div>
    )
  }
  const enviar = () => {
    const m = borrador.trim()
    if (!mailValido(m)) return setError('Revisá el mail: falta algo.')
    setError(null)
    setEstado('pedir')
    devolverMail(m)
  }
  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <h3 style={{ margin: 0, fontSize: font['2xl'] }}>¿Te mandamos el ticket por mail?</h3>
      <p style={{ margin: 0, color: color.mut, fontSize: font.lg }}>Así lo tenés a mano para un cambio.</p>
      <input
        type="email"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        placeholder="tu@mail.com"
        aria-label="Tu mail"
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && enviar()}
        style={{ height: 56, border: `1.5px solid ${color.line2}`, borderRadius: radius.xl, padding: `0 ${space[4]}px`, fontSize: font.xl + 2, background: color.surface, width: '100%' }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2] }}>
        {DOMINIOS.map((d) => (
          <button
            key={d}
            onClick={() => setBorrador((b) => (b.includes('@') && d.startsWith('@') ? b.split('@')[0] + d : b + d))}
            style={{ height: 40, padding: `0 ${space[3]}px`, borderRadius: radius.pill, border: `1px solid ${color.line2}`, background: color.surface, fontWeight: weight.semibold, fontSize: font.md, cursor: 'pointer' }}
          >
            {d}
          </button>
        ))}
      </div>
      {error && <p style={{ margin: 0, color: color.dangerInk, fontSize: font.md }}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2] }}>
        <button
          style={{ ...grande, border: `1.5px solid ${color.line2}`, background: color.surface, color: color.ink2 }}
          onClick={() => {
            setEstado('no')
            devolverMail('', true)
          }}
        >
          No, gracias
        </button>
        <button style={{ ...grande, border: 'none', background: MARCA_CAJA.acento, color: color.surface }} onClick={enviar}>
          Enviar
        </button>
      </div>
    </div>
  )
}

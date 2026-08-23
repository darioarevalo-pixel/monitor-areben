'use client'

import { useCallback, useEffect, useState } from 'react'
import { color, font, radius, space } from '@/components/ui/tokens'
import { TEMP_UI } from '@/components/crm/temperatura'
import { traerAgenda, type FilaAgenda } from '@/lib/crm/panel'
import type { MapaSeguimiento } from '@/lib/crm/tipos'

/**
 * "Hoy" — la lista del día adentro del panel de WhatsApp.
 *
 * **El problema que cierra.** El panel sabía todo del chat abierto y nada de a quién había que
 * abrir: para eso había que ir al monitor, elegir un nombre, buscarlo en WhatsApp y volver. Con
 * esto el circuito se cierra de un lado solo — tocás un nombre, se abre su chat, aparece su ficha,
 * registrás cómo te fue y seguís.
 *
 * 🔑 **No baja el CRM.** Quiénes entran lo decide el KV (`lib/crm/lista-dia.ts`); el nombre, el
 * teléfono y el total se piden de los ~90 que quedaron (`action:'lista'`). La sección baja 27.990
 * ventas para armar su tabla: eso, al costado del chat y rearmándose todo el tiempo, es inviable.
 *
 * ⚠️ **Abrir el chat lo hace la EXTENSIÓN, no esta pantalla.** Acá adentro corre el monitor dentro
 * de un iframe del panel de Chrome: no puede tocar la pestaña de WhatsApp. Le manda el teléfono al
 * contenedor por `postMessage` y la extensión navega. Si el panel se abriera fuera de la extensión
 * (una pestaña normal del monitor), el mensaje no lo escucha nadie y el clic no hace nada — por eso
 * hay un cartel abajo diciéndolo.
 */

const fmtMonto = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

/** Hace cuánto vence, en el idioma en que se piensa la lista. */
function cuando(dias: number | null): string {
  if (dias === null) return 'nunca contactado'
  if (dias === 0) return 'vence hoy'
  if (dias < 0) return `vencido hace ${-dias} ${-dias === 1 ? 'día' : 'días'}`
  return `en ${dias} días`
}

function Fila({ f, onAbrir }: { f: FilaAgenda; onAbrir: (tel: string) => void }) {
  const t = TEMP_UI[f.temperatura]
  const sinTel = !f.telefono
  return (
    <button
      type="button"
      disabled={sinTel}
      onClick={() => onAbrir(f.telefono)}
      title={sinTel ? 'No tiene teléfono cargado, así que no puedo abrir el chat' : 'Abrir el chat'}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'none',
        border: 0,
        borderTop: `1px solid ${color.line2}`,
        padding: `${space[2]}px ${space[3]}px`,
        cursor: sinTel ? 'default' : 'pointer',
        opacity: sinTel ? 0.55 : 1,
        font: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: font.sm, fontWeight: 700, color: color.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {f.nombre}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, border: `1px solid ${t.bd}`, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>
          {t.txt}
        </span>
      </div>
      <div style={{ fontSize: font.xs, color: f.dias !== null && f.dias < 0 ? color.dangerInk : color.mut2 }}>
        {cuando(f.dias)}
        {sinTel && ' · sin teléfono'}
      </div>
      {f.nota && (
        <div style={{ fontSize: font.xs, color: color.mut, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          “{f.nota}”
        </div>
      )}
    </button>
  )
}

function Titulo({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ padding: `${space[3]}px ${space[3]}px ${space[2]}px` }}>
      <div style={{ fontSize: font.sm, fontWeight: 700, color: color.ink }}>{children}</div>
      {sub && <div style={{ fontSize: font.xs, color: color.mut2 }}>{sub}</div>}
    </div>
  )
}

export function AgendaDelDia({
  crmSeg,
  today,
  onAbrirChat,
  puedeAbrirChat,
}: {
  crmSeg: MapaSeguimiento
  today: Date
  onAbrirChat: (tel: string) => void
  puedeAbrirChat: boolean
}) {
  const [estado, setEstado] = useState<{ t: 'cargando' } | { t: 'error'; motivo: string } | { t: 'ok'; lista: FilaAgenda[]; frios: FilaAgenda[] }>({ t: 'cargando' })

  const pedir = useCallback(async () => {
    const r = await traerAgenda(crmSeg, today)
    return r.ok ? ({ t: 'ok', lista: r.lista, frios: r.frios } as const) : ({ t: 'error', motivo: r.motivo } as const)
  }, [crmSeg, today])

  // Se recarga cuando cambia el mapa de seguimiento: al registrar un contacto en la ficha, el que
  // se acaba de atender tiene que salir de la lista sin que haya que refrescar nada.
  //
  // ⚠️ El estado se toca DESPUÉS del await, nunca en el cuerpo del efecto: un setState sincrónico
  // acá encadena renders (y el lint del repo lo rechaza).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const e = await pedir()
      if (vivo) setEstado(e)
    })()
    return () => {
      vivo = false
    }
  }, [pedir])

  const reintentar = () => {
    setEstado({ t: 'cargando' })
    pedir().then(setEstado)
  }

  if (estado.t === 'cargando') return <div style={{ padding: space[3], fontSize: font.xs, color: color.mut2 }}>Cargando la lista…</div>

  if (estado.t === 'error')
    return (
      <div style={{ padding: space[3] }}>
        <div style={{ fontSize: font.xs, color: color.dangerInk, background: color.dangerBg, border: `1px solid ${color.dangerBorder}`, borderRadius: radius.sm, padding: '6px 8px' }}>
          No pude traer la lista. {estado.motivo}
        </div>
        <button type="button" onClick={reintentar} style={{ marginTop: 8, fontSize: font.xs, color: color.brand, background: 'none', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
          Probar de nuevo
        </button>
      </div>
    )

  const { lista, frios } = estado
  if (!lista.length && !frios.length)
    return (
      <div style={{ padding: space[3], fontSize: font.sm, color: color.mut }}>
        No hay nadie para contactar hoy. Cuando venza el próximo, aparece acá.
      </div>
    )

  return (
    <div>
      {!puedeAbrirChat && (
        <div style={{ margin: space[3], fontSize: font.xs, color: color.mut, background: color.bg2, border: `1px solid ${color.line2}`, borderRadius: radius.sm, padding: '6px 8px' }}>
          Estás viendo esta lista fuera de WhatsApp, así que tocar un nombre no abre nada. Adentro
          del panel de la extensión sí.
        </div>
      )}

      <Titulo sub="Tibios y calientes que ya vencen. Del más atrasado al menos.">
        Para contactar · {lista.length}
      </Titulo>
      {lista.map((f) => (
        <Fila key={f.id} f={f} onAbrir={onAbrirChat} />
      ))}
      {!lista.length && (
        <div style={{ padding: `0 ${space[3]}px ${space[2]}px`, fontSize: font.xs, color: color.mut2 }}>
          Nada pendiente. Terminaste la lista del día.
        </div>
      )}

      {frios.length > 0 && (
        <>
          <div style={{ height: 8, background: color.bg2, borderTop: `1px solid ${color.line2}`, borderBottom: `1px solid ${color.line2}`, marginTop: space[3] }} />
          <Titulo sub={`La segunda etapa. Primero el que más compró: ${fmtMonto(frios[0].total)} el primero.`}>
            🧊 Recuperar · {frios.length}
          </Titulo>
          {frios.map((f) => (
            <Fila key={f.id} f={f} onAbrir={onAbrirChat} />
          ))}
        </>
      )}
    </div>
  )
}

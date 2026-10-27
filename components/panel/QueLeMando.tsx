'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { color, font, radius, space } from '@/components/ui/tokens'
import { addDiasISO, diaHabil } from '@/lib/crm/core'
import { hoyISO } from '@/lib/crm/seguimiento'
import { normalizarBanco } from '@/lib/crm/mensajes'
import { guardarBanco, leerBanco } from '@/lib/kv/cliente'
import {
  conNovedad,
  novedadDelBanco,
  resultado,
  siguientePregunta,
  type LoQueSabe,
  type Perfil,
  type Respuestas,
} from '@/lib/crm/que-le-mando'

/**
 * «✉️ Qué le mando», adentro de la barra fija «Próximo contacto» de la ficha (Darío, 27-oct-2026,
 * sobre la maqueta https://claude.ai/artifact/6VkmywsnrCxyYXFaChAyoT). Abre una hoja que sube
 * sobre la ficha: unas pocas preguntas → el mensaje que sigue + cuándo volver a escribirle.
 * Las reglas son de `lib/crm/que-le-mando.ts`; acá sólo se dibuja y se guarda.
 *
 * 🔑 **«Escribir en WhatsApp» ⛔ nunca manda**: le pide a la extensión que ponga el texto en el
 * cuadro del chat (y lo deja copiado por si la extensión es vieja o el chat no es el de esta ficha).
 * El saludo lo escribe Darío.
 */

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
function cae(dias: number): string {
  const iso = diaHabil(addDiasISO(hoyISO(), dias))
  const d = new Date(iso + 'T00:00:00')
  return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

type Escrito = 'escrito' | 'otro-chat' | 'copiado' | 'nada'

let nPedido = 0
/**
 * Le pide a la extensión que ponga el texto en el cuadro del chat abierto, si es el de alguno de
 * estos teléfonos. Antes lo copia: si la extensión no contesta (una vieja, o el panel abierto en
 * una pestaña común), queda para pegar.
 */
async function escribirEnWhatsApp(texto: string, tels: string[]): Promise<Escrito> {
  let copiado = false
  try {
    await navigator.clipboard.writeText(texto)
    copiado = true
  } catch {}
  const pedido = ++nPedido
  const r = await new Promise<{ ok: boolean; motivo?: string } | null>((resolver) => {
    const fin = setTimeout(() => {
      window.removeEventListener('message', alMensaje)
      resolver(null)
    }, 2500)
    function alMensaje(e: MessageEvent) {
      const d = e.data
      if (e.source !== window.parent || !d || d.fuente !== 'bdi-crm-panel' || d.tipo !== 'escribir-en-chat-resultado' || d.pedido !== pedido) return
      clearTimeout(fin)
      window.removeEventListener('message', alMensaje)
      resolver({ ok: !!d.ok, motivo: d.motivo })
    }
    window.addEventListener('message', alMensaje)
    try {
      window.parent.postMessage({ fuente: 'bdi-crm-panel', tipo: 'escribir-en-chat', texto, tels: tels.filter(Boolean), pedido }, '*')
    } catch {}
  })
  if (r?.ok) return 'escrito'
  if (r?.motivo === 'otro-chat') return 'otro-chat'
  return copiado ? 'copiado' : 'nada'
}

const AVISO_ESCRITO: Record<Escrito, [string, boolean]> = {
  escrito: ['Listo, está en el cuadro del chat. Mandalo vos', false],
  'otro-chat': ['Ese no es su chat: abrilo primero. Igual quedó copiado', true],
  copiado: ['Copiado: pegalo en el chat', false],
  nada: ['No pude ponerlo en el chat', true],
}

type Props = {
  sabe: Omit<LoQueSabe, 'novedad'>
  /** Los teléfonos de esta ficha: la extensión escribe sólo si el chat abierto es uno de ellos. */
  tels: string[]
  onPerfil: (p: Perfil | null) => void
  onAgendar: (dias: number) => void
  decir: (txt: string, mal?: boolean) => void
}

/**
 * El botón a todo el ancho de la barra + la hoja. La hoja va por portal al `body`: la barra es
 * `sticky` con su propio `zIndex`, y adentro de ella la hoja quedaría debajo de lo que la tape.
 */
export function QueLeMando(props: Props) {
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <BotonQueLeMando onAbrir={() => setAbierta(true)} />
      {abierta && typeof document !== 'undefined' && createPortal(<HojaQueLeMando {...props} onCerrar={() => setAbierta(false)} />, document.body)}
    </>
  )
}

function BotonQueLeMando({ onAbrir }: { onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      style={{
        width: '100%',
        height: 34,
        marginTop: 8,
        border: `1px solid ${color.brandSolid}`,
        borderRadius: radius.md,
        background: color.brandSolid,
        color: color.sideActiveInk,
        fontSize: font.base,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      ✉️ Qué le mando
    </button>
  )
}

/** La novedad de la semana: la lee al abrir la hoja; se cambia desde acá o desde «Mensajes» del CRM. */
function useNovedad() {
  const [novedad, setNovedad] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    leerBanco('bdi').then((r) => {
      if (vivo && r.ok) setNovedad(novedadDelBanco(normalizarBanco(r.dato)))
      else if (vivo) setNovedad('')
    })
    return () => {
      vivo = false
    }
  }, [])
  /** Relee justo antes de escribir: el banco también se edita desde el CRM. */
  const guardar = async (texto: string): Promise<boolean> => {
    const r = await leerBanco('bdi')
    if (!r.ok) return false
    const w = await guardarBanco({ store: 'bdi', banco: conNovedad(normalizarBanco(r.dato), texto), cargado: true })
    if (w.ok) setNovedad(texto.trim())
    return w.ok
  }
  return { novedad, guardar }
}

/** Se monta al abrir y se desmonta al cerrar: cada vez arranca de cero. */
function HojaQueLeMando({ onCerrar, sabe, tels, onPerfil, onAgendar, decir }: Props & { onCerrar: () => void }) {
  const [r, setR] = useState<Respuestas>({})
  const [hist, setHist] = useState<Respuestas[]>([])
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')
  const { novedad, guardar } = useNovedad()
  const cuerpo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cuerpo.current?.scrollTo?.({ top: 0 })
  }, [r])

  const completo: LoQueSabe = { ...sabe, novedad: novedad || '' }
  const p = siguientePregunta(completo, r)
  const res = p ? null : resultado(completo, r)

  const responder = (campo: keyof Respuestas, valor: string) => {
    setHist((h) => [...h, r])
    setR((x) => ({ ...x, [campo]: valor }))
    if (campo === 'perfil') onPerfil(valor as Perfil)
  }
  const volver = () => {
    setR(hist[hist.length - 1] || {})
    setHist((h) => h.slice(0, -1))
  }

  const chip = (txt: string, auto: boolean, onClick?: () => void) => (
    <span
      key={txt}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        fontSize: font.xs,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: radius.pill,
        border: `1px solid ${auto ? color.successBorder : color.line}`,
        background: auto ? color.successBg : color.bg2,
        color: auto ? color.successInk : color.ink2,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {txt}
    </span>
  )

  const sabidos = [
    chip(sabe.esCliente ? '✓ Ya compró' : '✓ Nunca compró', true),
    sabe.enComunidad != null && chip(sabe.enComunidad ? '✓ En la comunidad' : '✓ No está en la comunidad', true),
    !sabe.esCliente &&
      sabe.perfil &&
      chip(`✓ ${sabe.perfil === 'local' ? 'Local' : 'Emprendedor'} · cambiar`, true, () => {
        onPerfil(null)
        setR(({ perfil: _p, ...x }) => x)
      }),
    !r.tiempo &&
      sabe.diasDesdeContacto != null &&
      sabe.diasDesdeContacto < 60 &&
      chip(`✓ Le escribiste ${sabe.diasDesdeContacto === 0 ? 'hoy' : `hace ${sabe.diasDesdeContacto} ${sabe.diasDesdeContacto === 1 ? 'día' : 'días'}`}`, true),
    r.dijo && chip(r.dijo === 'si' ? 'Dijo que compraba' : 'No dijo que compraba', false),
    r.perfil && chip(r.perfil === 'local' ? 'Local' : 'Emprendedor', false),
    r.tiempo && chip(r.tiempo === 'corto' ? 'Menos de 2 meses' : 'Más de 2 meses', false),
  ].filter(Boolean)

  const boton = (verde: boolean): React.CSSProperties => ({
    flex: 1,
    minWidth: 0,
    height: 'auto',
    minHeight: 34,
    padding: '6px 8px',
    borderRadius: radius.md,
    border: `1px solid ${verde ? '#1ebe5d' : color.brandSolid}`,
    background: verde ? '#1ebe5d' : color.brandSolid,
    color: '#fff',
    fontSize: font.sm,
    fontWeight: 700,
    cursor: 'pointer',
  })

  return (
    <div role="dialog" aria-label="Qué le mando" style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <div onClick={onCerrar} style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.45)' }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '86%',
          display: 'flex',
          flexDirection: 'column',
          background: color.surface,
          borderRadius: '14px 14px 0 0',
          boxShadow: '0 -10px 30px rgba(16, 24, 40, 0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px 8px', borderBottom: `1px solid ${color.line}` }}>
          <b style={{ fontSize: font.lg, color: color.ink }}>Qué le mando</b>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ height: 'auto', background: 'none', border: 0, fontSize: 20, lineHeight: 1, color: color.mut, cursor: 'pointer', padding: '2px 6px' }}>
            ×
          </button>
        </div>

        <div ref={cuerpo} style={{ padding: `${space[3]}px 14px 14px`, overflowY: 'auto', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{sabidos}</div>

          {novedad === null ? (
            <div style={{ fontSize: font.sm, color: color.mut }}>Cargando…</div>
          ) : p ? (
            <>
              <p style={{ fontSize: font.md, fontWeight: 700, margin: 0, color: color.ink }}>{p.texto}</p>
              <div style={{ display: 'grid', gap: 6 }}>
                {p.opciones.map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => responder(p.campo, o.valor)}
                    style={{
                      height: 'auto',
                      textAlign: 'left',
                      background: color.surface,
                      color: color.ink,
                      border: `1px solid ${color.line2}`,
                      borderRadius: radius.md,
                      padding: '8px 10px',
                      fontSize: font.base,
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'grid',
                      gap: 1,
                    }}
                  >
                    {o.texto}
                    {o.detalle && <small style={{ color: color.mut, fontWeight: 400, fontSize: 11.5 }}>{o.detalle}</small>}
                  </button>
                ))}
              </div>
            </>
          ) : res ? (
            <>
              <span style={{ justifySelf: 'start', fontSize: font.sm, fontWeight: 700, color: color.brand, background: color.brandBg, border: `1px solid ${color.brandBorder}`, borderRadius: radius.sm, padding: '3px 8px' }}>
                {res.situacion}
              </span>
              {res.mensajes.length > 0 && <p style={{ fontSize: font.sm, color: color.mut, margin: 0 }}>Debajo de tu saludo:</p>}
              {res.mensajes.map((m) => (
                <div key={m.texto} style={{ display: 'grid', gap: 6 }}>
                  {m.etiqueta && <span style={{ fontSize: font.sm, fontWeight: 600, color: color.ink2 }}>{m.etiqueta}</span>}
                  <div style={{ fontSize: font.base, lineHeight: 1.45, background: color.bg, border: `1px solid ${color.line}`, borderRadius: radius.md, padding: '8px 10px', whiteSpace: 'pre-wrap', color: color.ink }}>
                    {m.texto}
                  </div>
                  <button type="button" style={boton(true)} onClick={async () => decir(...AVISO_ESCRITO[await escribirEnWhatsApp(m.texto, tels)])}>
                    Escribir en WhatsApp
                  </button>
                </div>
              ))}
              {res.nota && <p style={{ fontSize: font.sm, color: color.ink2, margin: 0 }}>{res.nota}</p>}
              {res.agendar.length > 0 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {res.agendar.map((a) => (
                    <button
                      key={a.dias}
                      type="button"
                      style={boton(false)}
                      onClick={() => {
                        onAgendar(a.dias)
                        onCerrar()
                      }}
                    >
                      Agendar {cae(a.dias)}
                      {a.etiqueta && <span style={{ display: 'block', fontWeight: 500, fontSize: font.xs, opacity: 0.85 }}>{a.etiqueta}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {hist.length > 0 && (
            <button type="button" onClick={volver} style={{ height: 'auto', justifySelf: 'start', background: 'none', border: 0, color: color.mut, fontSize: font.sm, fontWeight: 500, cursor: 'pointer', padding: 0 }}>
              ← Volver
            </button>
          )}

          {novedad !== null && (
            <div style={{ borderTop: `1px solid ${color.line}`, paddingTop: 8, display: 'grid', gap: 6 }}>
              {editando ? (
                <>
                  <span style={{ fontSize: font.sm, fontWeight: 600, color: color.ink2 }}>Novedad de la semana</span>
                  <textarea
                    value={borrador}
                    onChange={(e) => setBorrador(e.target.value)}
                    rows={3}
                    placeholder="Nos entraron diseños nuevos de fundas, ya estan en la tienda!"
                    style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: `1px solid ${color.line2}`, borderRadius: radius.md, padding: '6px 8px', fontSize: font.base, fontFamily: 'inherit', color: color.ink, background: color.surface }}
                  />
                  <span style={{ fontSize: font.xs, color: color.mut }}>Solo la novedad, sin pregunta: la pregunta se agrega sola.</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      style={boton(false)}
                      onClick={async () => {
                        const ok = await guardar(borrador)
                        decir(ok ? 'Novedad guardada' : 'No se pudo guardar la novedad', !ok)
                        if (ok) setEditando(false)
                      }}
                    >
                      Guardar
                    </button>
                    <button type="button" onClick={() => setEditando(false)} style={{ ...boton(false), background: color.surface, color: color.ink2, border: `1px solid ${color.line2}` }}>
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setBorrador(novedad)
                    setEditando(true)
                  }}
                  style={{ height: 'auto', textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: font.sm, color: color.mut }}
                >
                  <b style={{ color: color.ink2 }}>Novedad de la semana:</b> {novedad || 'sin cargar'} · <u>cambiar</u>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

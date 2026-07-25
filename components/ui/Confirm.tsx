'use client'

/**
 * Confirm — reemplazo de `confirm()`, `alert()` y `prompt()` del navegador.
 *
 * Por qué: en el monitor había **180 diálogos nativos** repartidos en 43 archivos
 * (confirm ×55, alert ×107, prompt ×18). Son lo que más rompía la sensación de producto
 * —se ven como una alerta del sistema operativo, no como la app— y encima bloquean el
 * hilo del navegador.
 *
 * La firma se eligió para que reemplazarlos sea mecánico y no haya que repensar cada
 * rama de código:
 *
 *   if (!confirm(t)) return          →   if (!(await confirmar(t))) return
 *   alert(t)                        →   await avisar(t)
 *   const x = prompt(t, def)        →   const x = await pedirTexto(t, def)
 *
 * Y donde el mensaje merece más que un texto (qué se va a escribir en GN, cuántos
 * registros), `confirmar` acepta opciones: título, detalle, tono y el texto del botón.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { color, font } from '@/components/ui/tokens'
import type { Tone } from '@/components/ui/tokens'

export type ConfirmarOpts = {
  titulo?: string
  /** Cuerpo del diálogo. Puede ser JSX: el detalle de lo que se va a hacer. */
  mensaje: React.ReactNode
  /** Texto del botón que confirma. Que diga QUÉ hace ("Guardar 12"), no "OK". */
  ok?: string
  cancelar?: string
  /** `danger` para lo que borra o pisa datos; `warning` para lo irreversible pero normal. */
  tono?: Tone
}

type Pedido =
  | { clase: 'confirmar'; opts: ConfirmarOpts; resolver: (v: boolean) => void }
  | { clase: 'avisar'; opts: ConfirmarOpts; resolver: (v: boolean) => void }
  | { clase: 'texto'; opts: ConfirmarOpts & { valor: string; placeholder?: string }; resolver: (v: string | null) => void }

type Api = {
  confirmar: (o: string | ConfirmarOpts) => Promise<boolean>
  avisar: (o: string | ConfirmarOpts) => Promise<boolean>
  pedirTexto: (mensaje: string, valorInicial?: string, opts?: { titulo?: string; placeholder?: string; ok?: string }) => Promise<string | null>
}

const Ctx = createContext<Api | null>(null)

const normalizar = (o: string | ConfirmarOpts): ConfirmarOpts => (typeof o === 'string' ? { mensaje: o } : o)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [texto, setTexto] = useState('')

  const api = useMemo<Api>(
    () => ({
      confirmar: (o) => new Promise<boolean>((resolver) => setPedido({ clase: 'confirmar', opts: normalizar(o), resolver })),
      avisar: (o) => new Promise<boolean>((resolver) => setPedido({ clase: 'avisar', opts: normalizar(o), resolver })),
      pedirTexto: (mensaje, valorInicial = '', opts) =>
        new Promise<string | null>((resolver) => {
          setTexto(valorInicial)
          setPedido({ clase: 'texto', opts: { mensaje, valor: valorInicial, ...opts }, resolver })
        }),
    }),
    [],
  )

  const cerrar = useCallback(
    (ok: boolean) => {
      if (!pedido) return
      if (pedido.clase === 'texto') pedido.resolver(ok ? texto : null)
      else pedido.resolver(ok)
      setPedido(null)
    },
    [pedido, texto],
  )

  const o = pedido?.opts
  const tono: Tone = o?.tono ?? 'brand'
  const soloAviso = pedido?.clase === 'avisar'

  return (
    <Ctx.Provider value={api}>
      {children}
      <Modal
        abierto={!!pedido}
        onCerrar={() => cerrar(false)}
        titulo={o?.titulo ?? (soloAviso ? 'Aviso' : '¿Confirmás?')}
        cerrarConFondo={pedido?.clase !== 'texto'}
        pie={
          <>
            {!soloAviso && (
              <Button variant="outline" onClick={() => cerrar(false)}>
                {o?.cancelar ?? 'Cancelar'}
              </Button>
            )}
            <Button variant="solid" tone={tono} onClick={() => cerrar(true)} data-foco>
              {o?.ok ?? (soloAviso ? 'Entendido' : 'Confirmar')}
            </Button>
          </>
        }
      >
        {/* Los mensajes viejos venían de `confirm()` con \n: se respetan los saltos. */}
        <div style={{ whiteSpace: 'pre-wrap' }}>{o?.mensaje}</div>
        {pedido?.clase === 'texto' && (
          <input
            className="mo-input"
            data-foco
            value={texto}
            placeholder={pedido.opts.placeholder}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cerrar(true)}
            style={{ marginTop: 12 }}
          />
        )}
      </Modal>
    </Ctx.Provider>
  )
}

/**
 * Los tres diálogos. Fuera de un ConfirmProvider caen al diálogo nativo en vez de
 * explotar: así una sección a medio migrar nunca queda sin poder preguntar.
 */
export function useConfirmar(): Api {
  const api = useContext(Ctx)
  return (
    api ?? {
      confirmar: async (o) => window.confirm(textoPlano(normalizar(o))),
      avisar: async (o) => {
        window.alert(textoPlano(normalizar(o)))
        return true
      },
      pedirTexto: async (m, v = '') => window.prompt(m, v),
    }
  )
}

function textoPlano(o: ConfirmarOpts): string {
  const cuerpo = typeof o.mensaje === 'string' ? o.mensaje : ''
  return o.titulo ? `${o.titulo}\n\n${cuerpo}` : cuerpo
}

/** Renglón de detalle dentro de un diálogo (ej. "Productos a escribir: 12"). */
export function ConfirmDetalle({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: font.sm, padding: '5px 0', borderTop: `1px solid ${color.line}` }}>
      <span style={{ color: color.mut }}>{label}</span>
      <span style={{ color: color.ink, fontWeight: 600 }}>{valor}</span>
    </div>
  )
}

'use client'

/**
 * ERP › Stock › Diferencias › Con Tienda Nube y Mercado Libre: el BOTÓN «Enviar el stock a Tienda Nube» y los últimos envíos
 * (Bruno 27-oct: la diferencia es INFORMATIVA; cuando el ERP esté arriba, el ERP manda el stock a todos lados).
 * Servidor: `api/_erp-empuje-stock.js`; motor: `lib/tn/pedido-stock.mjs` (avisa el trabajo `stock-tn:<tienda>` de la cola).
 *
 * 🔑 Es la tienda ENTERA, ⛔ una variante (`reglas-vigentes.md` :12 y :94). Hasta el corte de esa tienda (`STOCK_TN_MANDA`,
 * Vercel de `areben-erp`) el motor sólo CALCULA y guarda qué cambiaría: la pantalla lo dice («Sin enviar») y ⛔ lo pinta de
 * éxito. El monitor ⛔ sabe si la llave está prendida: lo dice el último envío (`seco`).
 * 🔴 Cuántas cambiarían lo dice el MOTOR (el último cálculo), ⛔ el «No coinciden» de la lista: ése cuenta también las que sólo
 * difieren de GN, y compara el ERP de AHORA contra lo que leyó el último envío.
 * Lo corre la cola en el minuto ⇒ mientras haya uno en cola o corriendo, la lista se vuelve a leer sola, también si una lectura
 * falla (Bruno 2-nov: un «Load failed» dejaba el botón en «Enviando…» con el envío ya terminado). Al terminar avisa `alTerminar`:
 * ese envío actualizó lo leído de Tienda Nube, y la lista de arriba tiene que volver a leerlo.
 */

import { useEffect, useRef, useState } from 'react'
import { Button, Notice, color, font, space, useConfirmar } from '@/components/ui'
import type { Tone } from '@/components/ui/tokens'
import { ChipEstado, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerEmpujesStock, mandarStockATN, type EmpujeStock, type TiendaErp } from '@/lib/erp/cliente'

const TIENDA: Record<TiendaErp, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
/** Cada cuánto se vuelve a leer mientras uno espera (la cola corre cada minuto). */
const RELEER_MS = 10_000
const n = (x: number) => x.toLocaleString('es-AR')

/** Quién lo pidió, en palabras: el botón guarda `boton:<nombre>`; el resto lo avisó el ERP solo. */
export function quienPidio(origen: string | null): string {
  if (origen?.startsWith('boton:')) return origen.slice(6)
  return 'Automático'
}

/** El estado de un envío: [tono, rótulo, detalle]. */
export function estadoDeEnvio(e: EmpujeStock): [Tone, string, string] {
  if (e.estado === 'pendiente') return ['neutral', 'En cola', '']
  if (e.estado === 'corriendo') return ['info', 'Enviando…', '']
  if (e.estado === 'fallado') return ['danger', 'No se pudo', e.error ?? 'Volvé a intentar.']
  if (e.estado === 'abandonado') return ['neutral', 'Reemplazado', '']
  const cambios = e.cambios ?? 0
  const detalle = cambios ? `${n(cambios)} variantes distintas (${n(e.unidades ?? 0)} u)` : 'Todo coincidía'
  if (e.seco) return ['warning', 'De prueba', detalle]
  const quedan = e.quedan ? ` · faltan ${n(e.quedan)}` : ''
  return ['success', 'Enviado', `${n(e.escritos ?? 0)} variantes cambiadas en Tienda Nube${quedan}.`]
}

export function EnviarStockTN({ tienda, alTerminar }: { tienda: TiendaErp; alTerminar?: () => void }) {
  const { confirmar } = useConfirmar()
  const [envios, setEnvios] = useState<{ de: TiendaErp; lista: EmpujeStock[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pidiendo, setPidiendo] = useState(false)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vivo = true
    leerEmpujesStock(tienda)
      .then((d) => { if (vivo) { setEnvios({ de: tienda, lista: d.empujes }); setError(null) } })
      .catch(() => { if (vivo) setError('No se pudieron leer los envíos de stock.') })
    return () => { vivo = false }
  }, [tienda, vuelta])

  const lista = envios?.de === tienda ? envios.lista : null
  const esperando = !!lista?.some((e) => e.estado === 'pendiente' || e.estado === 'corriendo')
  useEffect(() => {
    if (!esperando) return
    const t = setTimeout(() => setVuelta((v) => v + 1), RELEER_MS)
    return () => clearTimeout(t)
    // `vuelta`: cada lectura, buena o mala, arma la siguiente. Con sólo `lista`, una que falla ⛔ la cambia y se corta la cadena.
  }, [esperando, lista, vuelta])

  const estabaEsperando = useRef(false)
  useEffect(() => {
    if (estabaEsperando.current && !esperando) alTerminar?.()
    estabaEsperando.current = esperando
  }, [esperando, alTerminar])

  const nombre = TIENDA[tienda]
  // El último que terminó dice si la llave de esa tienda está prendida (el monitor ⛔ la ve).
  const ultimo = lista?.find((e) => e.estado === 'hecho')
  const deVerdad = ultimo ? ultimo.seco === false : false

  const enviar = async () => {
    const ok = await confirmar({
      titulo: `¿Enviar el stock a Tienda Nube de ${nombre}?`,
      mensaje: (
        <>
          <p>Toda la tienda{ultimo?.cambios != null ? <>: <b>{n(ultimo.cambios)} variantes distintas</b></> : null}.</p>
          <p>{deVerdad ? 'Si cambia más del 15 %, se frena.' : `${nombre}: de prueba, no toca la tienda.`}</p>
        </>
      ),
      ok: 'Enviar',
    })
    if (!ok) return
    setPidiendo(true)
    setError(null)
    try {
      await mandarStockATN(tienda)
      setVuelta((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo pedir el envío de stock.')
    } finally {
      setPidiendo(false)
    }
  }

  return (
    <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <div style={{ fontWeight: 700, color: color.ink }}>Enviar el stock a Tienda Nube · {nombre}</div>
          <div style={{ fontSize: font.sm, color: color.mut }}>{deVerdad ? 'Se envía solo con cada cambio.' : `${nombre}: de prueba, no toca la tienda.`}</div>
        </div>
        <Button disabled={pidiendo || esperando} onClick={() => void enviar()}>
          {pidiendo ? 'Enviando…' : esperando ? 'Enviando…' : 'Enviar el stock a Tienda Nube'}
        </Button>
      </div>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {lista && (lista.length ? (
        <div role="list" aria-label="Últimos envíos de stock" style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${color.bg2}` }}>
          {lista.map((e) => {
            const [tono, rotulo, detalle] = estadoDeEnvio(e)
            return (
              <div role="listitem" key={e.id} style={{ display: 'flex', gap: space[3], alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${color.bg2}`, fontSize: font.sm, flexWrap: 'wrap' }}>
                <span style={{ width: 84, color: color.ink2 }}>{cuandoCorto(e.terminadoEn ?? e.pedidoEn)}</span>
                <span style={{ width: 110 }}><ChipEstado mapa={{ x: [tono, rotulo] }} k="x" /></span>
                <span style={{ flex: '1 1 240px', minWidth: 0, color: color.ink }}>{detalle}</span>
                <span style={{ color: color.mut }}>{quienPidio(e.pedidoPor)}</span>
              </div>
            )
          })}
        </div>
      ) : <div style={{ fontSize: font.sm, color: color.mut }}>Sin envíos.</div>)}
    </div>
  )
}

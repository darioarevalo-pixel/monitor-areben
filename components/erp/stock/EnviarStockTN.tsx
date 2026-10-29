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
 * difieren de GN, y la lista lee TN de la foto de cada 2 h (28-oct: Stunned 43 en la lista contra 18 del motor).
 * Lo corre la cola en el minuto ⇒ mientras haya uno en cola o corriendo, la lista se vuelve a leer sola.
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
  return 'el ERP, solo (cambió el stock)'
}

/** El estado de un envío: [tono, rótulo, detalle]. */
export function estadoDeEnvio(e: EmpujeStock): [Tone, string, string] {
  if (e.estado === 'pendiente') return ['neutral', 'En cola', 'Se envía en el próximo minuto.']
  if (e.estado === 'corriendo') return ['info', 'Enviando', 'Leyendo Tienda Nube y comparando con el ERP.']
  if (e.estado === 'fallado') return ['danger', 'No se pudo', e.error ?? 'El envío falló: avisá.']
  if (e.estado === 'abandonado') return ['neutral', 'Reemplazado', 'Lo cubrió otro envío posterior.']
  const cambios = e.cambios ?? 0
  const detalle = cambios ? `${n(cambios)} variantes distintas (${n(e.unidades ?? 0)} u)` : 'Todo coincidía'
  if (e.seco) return ['warning', 'Sin enviar', `${detalle}: todavía manda Gestión Nube, no se tocó la tienda.`]
  const quedan = e.quedan ? ` · quedan ${n(e.quedan)} para la vuelta siguiente` : ''
  return ['success', 'Enviado', `${n(e.escritos ?? 0)} variantes cambiadas en Tienda Nube${quedan}.`]
}

/** `onEnvios`: la lista que leyó, para que Diferencias diga si su foto de TN es anterior al último envío. */
export function EnviarStockTN({ tienda, onEnvios }: { tienda: TiendaErp; onEnvios?: (lista: EmpujeStock[]) => void }) {
  const { confirmar } = useConfirmar()
  const [envios, setEnvios] = useState<{ de: TiendaErp; lista: EmpujeStock[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pidiendo, setPidiendo] = useState(false)
  const [vuelta, setVuelta] = useState(0)
  // En un ref: el padre la pasa como flecha nueva en cada render y ⛔ tiene que volver a disparar la lectura.
  const avisar = useRef(onEnvios)
  useEffect(() => { avisar.current = onEnvios })

  useEffect(() => {
    let vivo = true
    leerEmpujesStock(tienda)
      .then((d) => { if (vivo) { setEnvios({ de: tienda, lista: d.empujes }); avisar.current?.(d.empujes) } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron leer los envíos de stock.') })
    return () => { vivo = false }
  }, [tienda, vuelta])

  const lista = envios?.de === tienda ? envios.lista : null
  const esperando = !!lista?.some((e) => e.estado === 'pendiente' || e.estado === 'corriendo')
  useEffect(() => {
    if (!esperando) return
    const t = setTimeout(() => setVuelta((v) => v + 1), RELEER_MS)
    return () => clearTimeout(t)
  }, [esperando, lista])

  const nombre = TIENDA[tienda]
  // El último que terminó dice si la llave de esa tienda está prendida (el monitor ⛔ la ve).
  const ultimo = lista?.find((e) => e.estado === 'hecho')
  const deVerdad = ultimo ? ultimo.seco === false : false

  const enviar = async () => {
    const ok = await confirmar({
      titulo: `Enviar el stock a Tienda Nube de ${nombre}`,
      mensaje: (
        <>
          <p>Se iguala <b>toda la tienda {nombre}</b> al stock del ERP. No se puede elegir un solo producto.{ultimo?.cambios != null ? <> El último cálculo ({cuandoCorto(ultimo.terminadoEn)}) dio <b>{n(ultimo.cambios)} variantes distintas</b>.</> : null}</p>
          <p>{deVerdad
            ? <><b>Cambia el stock de la tienda de verdad.</b> Si el ERP quisiera cambiar de golpe más del 15 % de la tienda, frena y no toca nada.</>
            : <>Hasta el corte de {nombre} manda Gestión Nube: el ERP <b>sólo calcula</b> qué cambiaría y no toca la tienda.</>}</p>
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
          <div style={{ fontSize: font.sm, color: color.mut }}>
            El ERP le pone a cada variante de la tienda su stock (sus depósitos, menos lo apartado por pedidos sin pagar). Va la tienda entera.
            {' '}{deVerdad ? 'Además se envía solo cada vez que cambia el stock del ERP.' : `Hasta el corte de ${nombre} es una prueba: calcula y no toca la tienda.`}
          </div>
        </div>
        <Button disabled={pidiendo || esperando} onClick={() => void enviar()}>
          {pidiendo ? 'Pidiendo…' : esperando ? 'Enviando…' : 'Enviar el stock a Tienda Nube'}
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
      ) : <div style={{ fontSize: font.sm, color: color.mut }}>Todavía no hubo envíos de stock a esta tienda.</div>)}
    </div>
  )
}

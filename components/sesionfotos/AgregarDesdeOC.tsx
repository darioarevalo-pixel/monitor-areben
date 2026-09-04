'use client'

import { useState } from 'react'
import { Button, Select, color } from '@/components/ui'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { itemsBancoDesdeOC, type ExcluidoOC } from '@/lib/sesionfotos/banco-oc'
import type { ItemBanco } from '@/lib/sesionfotos/banco'
import { MOTIVO_EXCLUIDO_LABEL, porMotivo } from '@/lib/tncat/a-sesion-fotos'
import { leerRecepcion, leerRecepciones } from '@/lib/recepciones/cliente'
import { fechaDeIngreso } from '@/lib/recepciones/core'
import type { Recepcion } from '@/lib/recepciones/core'
import { baseDeLinea } from '@/lib/lineas.core.js'
import type { Variante } from '@/lib/etl/tipos'

/**
 * **Agregar al banco lo que entró por una orden de compra** — Fase 4 del octavo (4-sep-2026).
 *
 * Es la puerta que el pedido de Bruno necesitaba: *«si el producto de la OC que ingresó no alcanza
 * para armar outfits, se procede a pedir una solicitud a local»*. Sin esto, la orden se copiaba a
 * mano — y una importación de 130 renglones no la copia nadie.
 *
 * ## 🔑 Lee la sección que ya existe, y ⛔ no estrena permiso
 *
 * Las órdenes salen de `/api/datos?recurso=recepciones`, el mismo endpoint de «Lo que entró». Eso
 * tiene una consecuencia que la pantalla **dice en vez de esconder**: quien ⛔ no tiene esa sección
 * recibe un 403, y acá se lee «no tenés acceso a Lo que entró» — ⛔ no «no hay órdenes», que sería
 * mentirle a alguien que después va a preguntar por qué su OC no aparece.
 *
 * ## ⚠️ Las órdenes son de la MARCA, y la sesión puede ser de una línea
 *
 * Una sesión de Stunned mira las órdenes de Zattia (`baseDeLinea`), porque las recepciones ⛔ no
 * conocen las líneas. Lo que ⛔ no cruce contra el catálogo de la línea sale nombrado como «no
 * cruza»: medido el 4-sep, **ninguna orden trajo nunca un SKU de Stunned** (0 de 819), así que ⛔ no
 * se inventa un motivo para un caso que hoy ⛔ no existe.
 */
export function AgregarDesdeOC({
  linea,
  variantes,
  huerfanas,
  onAgregar,
}: {
  /** La línea de la sesión. Las órdenes se piden por su MARCA. */
  linea: string
  /** El catálogo vivo: las mismas variantes que va a expandir el pedido. */
  variantes: Variante[]
  /** Las que existen en el espejo pero cuyo producto ⛔ no está en GN. Separan «cargalo» de «mapealo». */
  huerfanas: Variante[]
  /** Suma los candidatos al banco. Devuelve cuántos entraron de verdad (el banco ⛔ no duplica). */
  onAgregar: (items: ItemBanco[]) => number
}) {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocs, setOcs] = useState<Recepcion[] | null>(null)
  const [elegida, setElegida] = useState('')
  const [parte, setParte] = useState<{ entraron: number; repetidos: number; excluidos: ExcluidoOC[]; label: string } | null>(null)

  const store = baseDeLinea(linea)

  const abrir = async () => {
    setAbierto(true)
    if (ocs || cargando || !store) return
    setCargando(true)
    setError(null)
    try {
      // 90 días: una sesión se hace sobre lo que acaba de entrar. La lista entera son 500 órdenes
      // y elegir en un desplegable de 500 ⛔ no es elegir.
      const { recepciones } = await leerRecepciones(store, 90)
      setOcs(recepciones)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer las órdenes.')
    } finally {
      setCargando(false)
    }
  }

  const agregar = async () => {
    if (!elegida || !store || cargando) return
    setCargando(true)
    setError(null)
    setParte(null)
    try {
      const { lineas } = await leerRecepcion(store, elegida)
      const label = ocs?.find((o) => o.id === elegida)?.oc_label || elegida
      // 🔴 `lineas` trae `en_gn`/`producto_id` —la foto de cuando llegó la orden— y el cruce ⛔ no
      // los mira: `LineaOC` sólo acepta el recruce en vivo. Ver `lib/sesionfotos/banco-oc.ts`.
      const { items, excluidos } = itemsBancoDesdeOC(lineas, variantes, {
        huerfanas,
        ocRef: elegida,
        ocLabel: label,
      })
      const entraron = onAgregar(items)
      setParte({ entraron, repetidos: items.length - entraron, excluidos, label })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la orden.')
    } finally {
      setCargando(false)
    }
  }

  if (!store) return null

  const vacio = cargando && !ocs
    ? 'Cargando órdenes…'
    : error
      ? '⛔ No se pudieron leer las órdenes'
      : ocs?.length
        ? 'Elegí una orden…'
        : 'Sin órdenes en los últimos 90 días'

  if (!abierto) {
    return (
      <Button size="sm" variant="ghost" onClick={abrir}>
        Agregar desde una orden recibida
      </Button>
    )
  }

  return (
    <div style={{ border: `1px dashed ${color.brandBorder}`, borderRadius: 7, padding: '6px 8px', marginTop: 6, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          Agregar desde una orden recibida{' '}
          <InfoPopover titulo="Lo que entró, sobre la mesa">
            Trae al banco los renglones de una orden de compra ya recibida, cruzándolos con Gestión
            Nube por SKU y, si no, por código de barras. Agregarlos ⛔ no los pide ni los separa del
            stock: quedan como candidatos, para armar los outfits y recién después pedir lo que falte
            al local. Lo que ⛔ no cruza o ya ⛔ no tiene stock se lista con su motivo.
          </InfoPopover>
        </span>
        <Select value={elegida} onChange={(e) => setElegida(e.target.value)} disabled={cargando || !ocs?.length} style={{ fontSize: 12, maxWidth: 280 }}>
          {/* 🔴 Cuatro estados, ⛔ no dos. «Sin órdenes» sobre una lectura que FALLÓ es la mentira
              que manda a buscar una OC que sí existe: la lista vacía ⛔ no puede hablar por el
              error, y el error ⛔ no puede hablar por una ventana sin órdenes. */}
          <option value="">{vacio}</option>
          {(ocs || []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.oc_label || o.id} · {fechaDeIngreso(o)} · {o.lineas} renglones
            </option>
          ))}
        </Select>
        <Button size="sm" variant="outline" disabled={!elegida || cargando} onClick={agregar}>
          {cargando && ocs ? 'Agregando…' : 'Agregar al banco'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>
          Cerrar
        </Button>
      </div>

      {error ? (
        <div style={{ fontSize: 11, color: color.dangerInk, marginTop: 5 }}>
          {error}
          {/* El 403 del endpoint es una frase entera del servidor; acá sólo se le suma dónde se
              arregla, que es lo que el que la lee necesita saber. */}
          {/no tenés acceso|No tenés acceso/.test(error) ? ' Se destraba dándole la sección «Lo que entró» a este usuario, en Configuración.' : ''}
        </div>
      ) : null}

      {parte ? (
        <div style={{ fontSize: 11, marginTop: 5, color: color.ink2 }}>
          <b>{parte.label}</b>: {parte.entraron === 1 ? '1 prenda al banco' : `${parte.entraron} prendas al banco`}
          {parte.repetidos ? ` · ${parte.repetidos} ya estaban` : ''}
          {/* 🔴 Lo que ⛔ no entró se nombra con su causa. Sin este renglón, la orden entraría corta
              y el que la trajo leería el número de arriba como si fuera la orden entera. */}
          {parte.excluidos.length ? (
            <div style={{ color: color.warningInk, marginTop: 2 }}>
              {parte.excluidos.length === 1 ? '1 renglón ⛔ no entró' : `${parte.excluidos.length} renglones ⛔ no entraron`}:{' '}
              {porMotivo(parte.excluidos)
                .map((m) => `${m.n} ${MOTIVO_EXCLUIDO_LABEL[m.motivo]}`)
                .join(' · ')}
              .
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

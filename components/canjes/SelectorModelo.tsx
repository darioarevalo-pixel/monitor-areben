'use client'

/**
 * Qué celular tiene, elegido **contra el stock real**.
 *
 * Ya se cayeron dos canjes por acordar con alguien que tenía un celular viejo del que no había
 * fundas. El modelo era texto libre y nadie lo cruzaba con nada. Acá el desplegable lista sólo los
 * modelos **de los que hay**, con cuántas fundas, y si el suyo no está lo dice en rojo antes de que
 * el canje se cierre.
 *
 * Va para los DOS caminos —envío y retiro en el local— porque el problema es el mismo: si no hay
 * funda para ese celular, no hay canje, se mande por correo o se entregue en el mostrador. Lo que
 * cambia es qué número mirar, y por eso se muestran los dos (total y lo que está en el local).
 *
 * Lee el espejo de Supabase igual que `BuscarArticuloGN`, no el ETL: esta pantalla no lo carga y
 * traerlo entero (14,7 MB) para contestar una pregunta de una línea no se paga.
 */

import { useCallback, useEffect, useState } from 'react'
import { CUENTAS } from '@/lib/cuentas'
import { fetchAll } from '@/lib/supabase/rest'
import { fundasPorModelo, stockDelModelo, type FilaInventario, type StockDeModelo } from '@/lib/canjes/modelos'
import { Field, Input, Notice, Select, color, font, space } from '@/components/ui'

export function SelectorModelo({
  valor, onGuardar, disabled, paraElLocal,
}: {
  /** El modelo que ya tiene cargado en su ficha. */
  valor: string | null | undefined
  /** Se llama con el modelo elegido (o `null` para borrarlo). Guarda en la persona. */
  onGuardar: (modelo: string | null) => Promise<void>
  disabled?: boolean
  /** Si el canje es de retiro: entonces el número que manda es el del local, no el total. */
  paraElLocal?: boolean
}) {
  const [modelos, setModelos] = useState<StockDeModelo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [otro, setOtro] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        // Sólo variantes de iPhone con stock: acota 6.896 filas a ~2.700 y son las únicas que
        // pueden formar parte de la respuesta. `fetchAll` pagina de a 1000.
        const filas = await fetchAll<FilaInventario>(
          CUENTAS.bdi,
          'inventario',
          'select=size_name,store_name,available_quantity&size_name=ilike.iphone*&available_quantity=gt.0',
        )
        if (vivo) { setModelos(fundasPorModelo(filas)); setError(false) }
      } catch {
        // 🔴 Si la lectura falla NO se puede decir "no tenemos": sería el mismo cartel rojo que
        // cuando de verdad no hay, y ahí se cae un canje que se podía hacer.
        if (vivo) setError(true)
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [])

  const hay = stockDelModelo(modelos, valor)
  const enLista = !!hay
  // "Otro": o eligió esa opción a mano, o lo que tiene cargado no está entre los que hay.
  const [modoOtro, setModoOtro] = useState(false)
  const mostrandoOtro = modoOtro || (!!valor && !enLista)

  const guardar = useCallback(async (m: string | null) => {
    setGuardando(true)
    try {
      await onGuardar(m)
    } finally {
      setGuardando(false)
    }
  }, [onGuardar])

  const bloqueado = !!disabled || guardando || cargando

  return (
    <>
      <div style={{ maxWidth: 380 }}>
        <Field
          label="Qué celular tiene"
          hint={cargando ? 'Buscando de qué modelos hay fundas…' : 'Sólo los modelos de los que hay stock. Si el suyo no está, elegí “Otro”.'}
        >
          <Select
            value={mostrandoOtro ? '__otro' : (valor || '')}
            disabled={bloqueado}
            onChange={(e) => {
              const v = e.target.value
              if (v === '__otro') { setModoOtro(true); setOtro(valor || ''); return }
              setModoOtro(false)
              void guardar(v || null)
            }}
          >
            <option value="">— Preguntale y elegí —</option>
            {modelos.map((m) => (
              <option key={m.modelo} value={m.modelo}>
                {m.modelo} — {paraElLocal ? `${m.local} en el local` : `${m.total} fundas`}
              </option>
            ))}
            <option value="__otro">Otro modelo…</option>
          </Select>
        </Field>

        {mostrandoOtro && (
          <div style={{ marginTop: space[2] }}>
            <Input
              value={otro || valor || ''}
              disabled={bloqueado}
              placeholder="iPhone X"
              onChange={(e) => setOtro(e.target.value)}
              onBlur={() => void guardar(otro.trim() || null)}
              onKeyDown={(e) => { if (e.key === 'Enter') void guardar(otro.trim() || null) }}
            />
          </div>
        )}
      </div>

      <div style={{ marginTop: space[3] }}>
        {error ? (
          <Notice tone="warning">
            No se pudo leer el stock, así que <b>no sabemos</b> si hay fundas para ese modelo.
            Recargá antes de cerrar el canje — esto no es lo mismo que “no hay”.
          </Notice>
        ) : !valor ? (
          <span style={{ color: color.mut, fontSize: font.sm }}>
            Preguntale qué celular tiene antes de cerrar el canje: es lo que dice si le podemos dar
            una funda.
          </span>
        ) : hay ? (
          <Notice tone="success">
            Hay <b>{paraElLocal ? hay.local : hay.total}</b>{' '}
            {(paraElLocal ? hay.local : hay.total) === 1 ? 'funda' : 'fundas'} para {hay.modelo}
            {paraElLocal
              ? ` en el local${hay.total !== hay.local ? ` (${hay.total} contando el depósito)` : ''}.`
              : `${hay.local ? ` — ${hay.local} en el local.` : ' (ninguna en el local).'}`}
          </Notice>
        ) : (
          <Notice tone="danger">
            <b>No tenemos fundas para {valor}.</b> Antes de cerrar el canje, fijate si le sirve otra
            cosa o dejalo para cuando entren — es lo que hizo que se cayeran dos.
          </Notice>
        )}
      </div>
    </>
  )
}

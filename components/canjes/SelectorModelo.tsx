'use client'

/**
 * Qué celular tiene, elegido **contra lo que de verdad le podemos dar**.
 *
 * Ya se cayeron dos canjes por acordar con alguien que tenía un celular viejo del que no había
 * fundas. El modelo era texto libre y nadie lo cruzaba con nada. Acá el desplegable lista sólo los
 * modelos que existen para ESE canje, y si el suyo no está lo dice en rojo antes de cerrarlo.
 *
 * 🔑 **"Lo que le podemos dar" no es siempre lo mismo**, y por eso el cartel dice de dónde sale:
 *
 *  - **Retiro en el local** → el stock del LOCAL. El mostrador carga con el buscador de Gestión
 *    Nube; la vitrina no interviene aunque esté colgada.
 *  - **Envío con vitrina** → la VITRINA. Ella elige de ahí y de ningún otro lado: contestar con el
 *    stock general sería el mismo error que el texto libre, con más números encima.
 *  - **Envío sin vitrina** → el stock total de GN, que es de donde carga el equipo.
 *
 * El stock se lee del espejo de Supabase igual que `BuscarArticuloGN`, no del ETL: esta pantalla no
 * lo carga y traerlo entero (14,7 MB) para contestar una línea no se paga. Con vitrina no se lee
 * nada: los productos ya vienen congelados en el canje.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CUENTAS } from '@/lib/cuentas'
import { fetchAll } from '@/lib/supabase/rest'
import {
  deDondeElige, fundasPorModelo, modeloEnLaVitrina, modelosDeLaVitrina, stockDelModelo,
  type FilaInventario, type ItemDeVitrina, type StockDeModelo,
} from '@/lib/canjes/modelos'
import { Field, Input, Notice, Select, color, font, space } from '@/components/ui'

export function SelectorModelo({
  valor, onGuardar, disabled, retiroLocal, vitrina,
}: {
  /** El modelo que ya tiene cargado en su ficha. */
  valor: string | null | undefined
  /** Se llama con el modelo elegido (o `null` para borrarlo). Guarda en la persona. */
  onGuardar: (modelo: string | null) => Promise<void>
  disabled?: boolean
  retiroLocal?: boolean
  /** Los productos de la vitrina colgada, si hay una. `null` = el equipo carga de Gestión Nube. */
  vitrina: { nombre: string; items: ItemDeVitrina[] } | null
}) {
  const deLaVitrina = useMemo(
    () => (vitrina ? modelosDeLaVitrina(vitrina.items) : []),
    [vitrina],
  )
  // Una vitrina de ropa (o con un solo modelo) no factea por modelo: ahí no hay nada que contestar
  // desde ella y la pregunta vuelve al stock. `modelosDeLaVitrina` devuelve `[]` en ese caso.
  const fuente = deDondeElige(!!retiroLocal, deLaVitrina.length > 0)

  const [deGN, setDeGN] = useState<StockDeModelo[]>([])
  // Se DERIVA en vez de setearse: con vitrina no hay nada que esperar, y apagarlo desde adentro del
  // efecto es un setState sincrónico que el lint frena (y que encadena renders).
  const [cargandoGN, setCargandoGN] = useState(true)
  const cargando = fuente !== 'vitrina' && cargandoGN
  const [error, setError] = useState(false)
  const [otro, setOtro] = useState('')
  const [modoOtro, setModoOtro] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (fuente === 'vitrina') return
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
        if (vivo) { setDeGN(fundasPorModelo(filas)); setError(false) }
      } catch {
        // 🔴 Si la lectura falla NO se puede decir "no tenemos": sería el mismo cartel rojo que
        // cuando de verdad no hay, y ahí se cae un canje que se podía hacer.
        if (vivo) setError(true)
      } finally {
        if (vivo) setCargandoGN(false)
      }
    })()
    return () => { vivo = false }
  }, [fuente])

  const lista = fuente === 'vitrina' ? deLaVitrina : deGN
  const hay = fuente === 'vitrina' ? modeloEnLaVitrina(lista, valor) : stockDelModelo(lista, valor)
  const mostrandoOtro = modoOtro || (!!valor && !hay)

  const guardar = useCallback(async (m: string | null) => {
    setGuardando(true)
    try {
      await onGuardar(m)
    } finally {
      setGuardando(false)
    }
  }, [onGuardar])

  const bloqueado = !!disabled || guardando || cargando
  /** Cuántos hay de ese modelo, según lo que corresponda mirar. */
  const cuantos = hay ? (fuente === 'local' ? hay.local : hay.total) : 0

  return (
    <>
      <div style={{ maxWidth: 400 }}>
        <Field
          label="Qué celular tiene"
          hint={
            cargando ? 'Buscando de qué modelos hay…'
              : fuente === 'vitrina' ? `Los modelos que ofrece la vitrina “${vitrina?.nombre}”, que es de donde elige.`
                : fuente === 'local' ? 'Los modelos que hay en el local, que es de donde se lo entregan.'
                  : 'Los modelos de los que hay stock. Si el suyo no está, elegí “Otro”.'
          }
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
            {lista.map((m) => (
              <option key={m.modelo} value={m.modelo}>
                {m.modelo} — {fuente === 'vitrina'
                  ? `${m.total} ${m.total === 1 ? 'producto' : 'productos'}`
                  : fuente === 'local' ? `${m.local} en el local` : `${m.total} fundas`}
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
          <Notice tone={cuantos > 0 ? 'success' : 'warning'}>
            {fuente === 'vitrina' ? (
              <>
                La vitrina <b>{vitrina?.nombre}</b> le ofrece <b>{cuantos}</b>{' '}
                {cuantos === 1 ? 'producto' : 'productos'} para {hay.modelo}.
              </>
            ) : fuente === 'local' ? (
              <>
                Hay <b>{hay.local}</b> {hay.local === 1 ? 'funda' : 'fundas'} para {hay.modelo}{' '}
                <b>en el local</b>
                {hay.total !== hay.local ? ` (${hay.total} contando el depósito).` : '.'}
              </>
            ) : (
              <>
                Hay <b>{hay.total}</b> {hay.total === 1 ? 'funda' : 'fundas'} para {hay.modelo}
                {hay.local ? ` — ${hay.local} en el local.` : ' (ninguna en el local).'}
              </>
            )}
          </Notice>
        ) : (
          <Notice tone="danger">
            {fuente === 'vitrina' ? (
              <>
                <b>La vitrina “{vitrina?.nombre}” no tiene nada para {valor}.</b> Ella elige de ahí,
                así que con esta vitrina el canje no se puede cumplir: colgale otra o sacásela.
              </>
            ) : fuente === 'local' ? (
              <><b>No hay fundas para {valor} en el local.</b> Fijate si le sirve otra cosa, o si
              conviene mandárselo desde el depósito en vez de que lo retire.</>
            ) : (
              <><b>No tenemos fundas para {valor}.</b> Antes de cerrar el canje, fijate si le sirve
              otra cosa o dejalo para cuando entren — es lo que hizo que se cayeran dos.</>
            )}
          </Notice>
        )}
      </div>
    </>
  )
}

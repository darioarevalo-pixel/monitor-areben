'use client'

/**
 * "Mandar a liquidación (N)" — el puente desde Análisis → Por producto.
 *
 * Es donde nace una campaña. Hasta ahora la selección de allá terminaba en un PDF y en un
 * `useState` que se perdía al recargar; acá los productos entran a una campaña guardada, con **la
 * foto de sus números congelada** en este momento (costo, precio, stock, ventas). Ver el docblock
 * de `FotoDelMomento`.
 *
 * Vive en `components/liquidacion/` y no adentro de `ProductosTable.tsx` a propósito: ese archivo
 * es del repo compartido con Darío y ya tiene 400 líneas de tabla. Desde allá entra una línea.
 */

import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { asegurarTnPromo } from '@/components/productos/useTnImages'
import { armarItemDesdeProducto, nuevoIdLiquidacion, type Liquidacion as Campania } from '@/lib/liquidacion'
import { crearCampania, leerCampanias, sumarItems } from '@/lib/liquidacion/persistencia'
import type { Producto } from '@/lib/etl/tipos'
import { imagenDe, matchTn } from '@/lib/tn'
import {
  Button, Field, Input, Modal, Notice, Select, useToast, color, font, space,
} from '@/components/ui'

export function MandarALiquidacion({ seleccion, onListo }: { seleccion: Producto[]; onListo: () => void }) {
  const { marca } = useSesion()
  const toast = useToast()

  const [abierto, setAbierto] = useState(false)
  const [campanias, setCampanias] = useState<Campania[] | null>(null)
  const [elegida, setElegida] = useState<string>('')
  const [nombreNueva, setNombreNueva] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mandando, setMandando] = useState(false)

  // Las campañas se piden al abrir el diálogo, no al montar la tabla: la mayoría de las veces que
  // alguien está en "Por producto" no va a mandar nada a liquidación, y sería un request por visita.
  async function abrir() {
    setAbierto(true)
    setError(null)
    setCampanias(null)
    try {
      const d = await leerCampanias(marca)
      // Las cerradas no se ofrecen: sumarle productos a una campaña que ya terminó es casi siempre
      // haberse equivocado de campaña, y la aplicada tampoco (sus precios ya están escritos).
      const abiertas = d.campanias.filter((c) => c.estado === 'borrador' || c.estado === 'en_curso')
      setCampanias(abiertas)
      setElegida(abiertas[0]?.id || 'nueva')
    } catch (e) {
      setCampanias([])
      setElegida('nueva')
      setError(e instanceof Error ? e.message : 'No se pudieron leer las campañas.')
    }
  }

  async function mandar() {
    if (mandando) return
    const esNueva = elegida === 'nueva'
    if (esNueva && !nombreNueva.trim()) return
    setMandando(true)
    setError(null)
    try {
      // El índice de TN da la foto y el precio promocional que ya esté cargado. Se pide acá y no
      // antes porque puede tardar: si falla, la campaña se arma igual sin fotos — que falte una
      // miniatura no puede frenar el trabajo.
      const promoIdx = await asegurarTnPromo(marca).catch(() => null)

      const items = seleccion.map((p) => {
        const tn = promoIdx ? matchTn(p, promoIdx) : null
        return armarItemDesdeProducto(p, {
          imagen: promoIdx ? imagenDe(p, promoIdx) : null,
          promo: tn?.promo_price ?? null,
        })
      })

      const liqId = esNueva
        ? (await crearCampania(marca, { id: nuevoIdLiquidacion(), nombre: nombreNueva.trim() })).id
        : elegida

      const r = await sumarItems(marca, liqId, items)
      setAbierto(false)
      setNombreNueva('')
      onListo()
      toast.ok(
        r.yaEstaban
          ? `Entraron ${r.sumados} ${r.sumados === 1 ? 'producto' : 'productos'}. ${r.yaEstaban} ya ${r.yaEstaban === 1 ? 'estaba' : 'estaban'} en la campaña.`
          : `${r.sumados} ${r.sumados === 1 ? 'producto' : 'productos'} en la campaña.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron mandar los productos.')
    } finally {
      setMandando(false)
    }
  }

  const esNueva = elegida === 'nueva'
  const sinCosto = seleccion.filter((p) => p.sinCosto).length

  return (
    <>
      <Button variant="soft" tone="brand" onClick={() => void abrir()} disabled={!seleccion.length}>
        Mandar a liquidación{seleccion.length ? ` (${seleccion.length})` : ''}
      </Button>

      <Modal
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo={`Mandar ${seleccion.length} ${seleccion.length === 1 ? 'producto' : 'productos'} a liquidación`}
        pie={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button
              variant="solid"
              tone="brand"
              onClick={() => void mandar()}
              loading={mandando}
              disabled={campanias === null || (esNueva && !nombreNueva.trim())}
            >
              Mandar
            </Button>
          </>
        }
      >
        {error && <Notice tone="danger" style={{ marginBottom: space[3] }}>{error}</Notice>}

        {campanias === null ? (
          <div style={{ color: color.mut, fontSize: font.sm }}>Buscando las campañas…</div>
        ) : (
          <>
            <Field label="¿A qué campaña?">
              <Select value={elegida} onChange={(e) => setElegida(e.target.value)} data-foco>
                {campanias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.conteo.total} {c.conteo.total === 1 ? 'producto' : 'productos'})
                  </option>
                ))}
                <option value="nueva">➕ Campaña nueva…</option>
              </Select>
            </Field>

            {esNueva && (
              <Field label="Nombre de la campaña" hint="El que la va a identificar dentro de seis meses: «Sale invierno ago-2026».">
                <Input value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Sale invierno ago-2026" />
              </Field>
            )}

            <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[3], lineHeight: 1.6 }}>
              Entran con el costo, el precio, el stock y las ventas de hoy, y esos números quedan
              congelados: la campaña se decide con la foto del día en que se armó.
              {sinCosto > 0 && (
                <div style={{ color: color.warningInk, marginTop: space[2] }}>
                  ⚠ {sinCosto} {sinCosto === 1 ? 'no tiene' : 'no tienen'} costo cargado en Gestión Nube.
                  {' '}Van a entrar igual, marcados: sin costo, cualquier margen que muestre la pantalla es falso.
                </div>
              )}
              {seleccion.some((p) => !p.retailer_price) && (
                <div style={{ color: color.warningInk, marginTop: space[2] }}>
                  ⚠ Hay productos sin precio de lista: no hay contra qué calcular el descuento.
                </div>
              )}
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

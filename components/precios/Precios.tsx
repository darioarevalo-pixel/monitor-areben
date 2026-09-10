'use client'

/**
 * Precios de campaña — la lista de precios de una liquidación o feria, para MARKETING.
 *
 * # Por qué esta pantalla existe
 *
 * Pedido de Bruno, 10-sep-2026: *«necesito que las chicas puedan ver qué precio van a estar los
 * distintos productos»*. La Feria de Septiembre de Zattia arranca el **lunes 14** con 351 productos
 * y los precios **⛔ no publicados** —va oculta en Tienda Nube, se vende presencial—, así que la
 * tienda ⛔ no sirve como lista de precios y la campaña, que sí la tiene, vive en una sección que
 * Marketing ⛔ no puede ver.
 *
 * 🔴 **Y ⛔ no puede verla por un motivo, ⛔ no por un olvido**: la foto congelada de un ítem de
 * liquidación trae **costo, markup y margen**, y la feria se vende **al costo**. Por eso esto ⛔ no
 * es "Liquidación con permiso de Marketing": es una proyección que pasa por la lista blanca de
 * `lib/precios/core.core.js`, donde un campo se agrega o **no viaja**.
 *
 * # Las decisiones de esta pantalla
 *
 *  1. 🔴 **Un precio sin revisar ⛔ no se dibuja igual que uno confirmado.** Al 10-sep la feria tiene
 *     286 confirmados y **65 sin revisar**: un `definido` es un número que puso una persona y que
 *     nadie miró todavía, y cambiarlo lo devuelve a la cola. Mostrarlos iguales le hace prometer a
 *     Marketing un precio que se puede mover el domingo — el 18% de la lista.
 *  2. **El stock es el de HOY, ⛔ no el de la foto congelada**, y la pantalla dice **de cuándo es**.
 *     Comunicar un producto del que quedan dos unidades es peor que no comunicarlo, y las unidades
 *     de la foto son del día en que entró a la campaña (para la feria, el 6-sep).
 *  3. **Sólo se ven las campañas COMPARTIDAS.** El interruptor lo prende un admin desde
 *     Liquidación. Sin eso, cada campaña nueva —incluidas las pruebas— aparecería sola acá.
 *  4. ⛔ **Desde acá no se cambia ningún precio.** El handler es de sólo lectura. Lo único que se
 *     escribe es la ⭐, que ⛔ no es un precio: es qué se comunica.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { leerCampaniasCompartidas, leerListaDePrecios } from '@/lib/precios/persistencia'
import type { CampaniaPrecios, PrecioItem } from '@/lib/precios/tipos'
import { useDestacados } from '@/components/destacados/useDestacados'
import { Estrella } from '@/components/destacados/Estrella'
import {
  Badge, BuscarInput, Button, Card, EmptyState, Esqueleto, FilterBar, KpiCard, Lightbox, Notice,
  Select, TBody, THead, TableWrap, Td, Th, Tr, formatMoney, useFiltroUrl,
  color, font, radius, space, weight,
} from '@/components/ui'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `2026-09-14` → `14-sep`. Sin `toLocaleDateString`, que se corre de día por zona horaria. */
function fechaCorta(f: string | null): string {
  if (!f) return '—'
  const [, m, d] = f.split('-').map(Number)
  return `${d}-${MESES[m - 1]}`
}

/** El sello del espejo: de cuándo son las unidades. `null` = no se pudo saber, y se dice. */
function selloStock(iso: string | null): string {
  if (!iso) return 'No se pudo saber de cuándo es el stock.'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'No se pudo saber de cuándo es el stock.'
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `Stock al ${d.getDate()}-${MESES[d.getMonth()]} ${hh}:${mm}`
}

type Orden = 'precio-desc' | 'precio-asc' | 'desc-desc' | 'nombre'

export function Precios() {
  const { marca } = useSesion()
  const [campanias, setCampanias] = useState<CampaniaPrecios[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [liq, setLiq] = useFiltroUrl<string>('liq', '')
  const [q, setQ] = useFiltroUrl<string>('q', '')
  const [soloEstrella, setSoloEstrella] = useState(false)
  const [orden, setOrden] = useState<Orden>('precio-desc')
  const [lista, setLista] = useState<{ items: PrecioItem[]; leidoEn: string | null } | null>(null)
  const [foto, setFoto] = useState<{ url: string; alt: string } | null>(null)

  const elegida = useMemo(
    () => (campanias || []).find((c) => c.id === liq) || null,
    [campanias, liq],
  )
  const destacados = useDestacados(marca, elegida?.id ?? null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const cs = await leerCampaniasCompartidas(marca)
        if (!vivo) return
        setCampanias(cs)
        // Una sola campaña compartida es el caso normal: entrar y tener que elegirla de una lista
        // de uno es un paso que no decide nada.
        if (cs.length && !cs.some((c) => c.id === liq)) setLiq(cs[0].id)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer la lista de campañas.')
      }
    })()
    return () => { vivo = false }
    // `liq` y `setLiq` quedan afuera a propósito: esto corre al entrar y al cambiar de marca, y
    // reaccionar al `?liq=` acá volvería a pedir la lista de campañas en cada cambio de campaña.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marca])

  const idElegida = elegida?.id ?? null

  // `setLista` va adentro del async y ⛔ no en el cuerpo del efecto: llamarlo sincrónico ahí es una
  // cascada de renders sobre una tabla de cientos de filas (`react-hooks/set-state-in-effect`).
  // Mismo molde que `useClavados` y `useDestacados`.
  useEffect(() => {
    if (!idElegida) return
    let vivo = true
    void (async () => {
      setLista(null)
      try {
        const d = await leerListaDePrecios(marca, idElegida)
        if (!vivo) return
        setLista({ items: d.items, leidoEn: d.leidoEn })
        setError(null)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer la lista de precios.')
      }
    })()
    return () => { vivo = false }
  }, [marca, idElegida])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    let out = (lista?.items || []).filter((i) => {
      if (soloEstrella && !destacados.porProducto.has(i.pid)) return false
      if (!t) return true
      return i.nombre.toLowerCase().includes(t) || (i.sku || '').toLowerCase().includes(t)
    })
    out = [...out].sort((a, b) => {
      if (orden === 'nombre') return a.nombre.localeCompare(b.nombre)
      if (orden === 'desc-desc') return (b.pctDesc ?? -1) - (a.pctDesc ?? -1)
      const s = (a.precio ?? 0) - (b.precio ?? 0)
      return orden === 'precio-asc' ? s : -s
    })
    return out
  }, [lista, q, soloEstrella, orden, destacados.porProducto])

  const resumen = useMemo(() => {
    const items = lista?.items || []
    return {
      total: items.length,
      firmes: items.filter((i) => i.firme).length,
      sinRevisar: items.filter((i) => !i.firme).length,
      estrellas: items.filter((i) => destacados.porProducto.has(i.pid)).length,
    }
  }, [lista, destacados.porProducto])

  if (error && !campanias) return <Notice tone="danger">{error}</Notice>
  if (!campanias) return <Esqueleto filas={6} />

  if (!campanias.length) {
    return (
      <EmptyState
        title="Todavía no hay ninguna lista compartida"
        hint="Las listas de precios se comparten desde Liquidación: quien arma la campaña prende «Compartir con Marketing» y aparece acá."
      />
    )
  }

  return (
    <>
      <FilterBar>
        {campanias.length > 1 && (
          <Select value={liq} onChange={(e) => setLiq(e.target.value)} aria-label="Campaña">
            {campanias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} ({c.n})</option>
            ))}
          </Select>
        )}
        <BuscarInput value={q} onChange={setQ} placeholder="Producto o SKU…" />
        <Select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} aria-label="Orden">
          <option value="precio-desc">Más caro primero</option>
          <option value="precio-asc">Más barato primero</option>
          <option value="desc-desc">Mayor % off</option>
          <option value="nombre">Por nombre</option>
        </Select>
        <Button
          size="sm"
          variant={soloEstrella ? 'soft' : 'outline'}
          tone={soloEstrella ? 'brand' : 'neutral'}
          onClick={() => setSoloEstrella((v) => !v)}
        >
          ★ Sólo destacados ({resumen.estrellas})
        </Button>
      </FilterBar>

      {elegida && (
        <Card style={{ padding: space[3], marginBottom: space[3] }}>
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'baseline' }}>
            <strong style={{ fontSize: font.lg, fontWeight: weight.semibold }}>{elegida.nombre}</strong>
            <span style={{ color: color.mut, fontSize: font.sm }}>
              {fechaCorta(elegida.desde)} → {fechaCorta(elegida.hasta)}
            </span>
            <span style={{ color: color.mut2, fontSize: font.xs, marginLeft: 'auto' }}>
              {selloStock(lista?.leidoEn ?? null)}
            </span>
          </div>
          {/*
            La nota de la campaña. Es donde quien la arma dice, por ejemplo, que la feria es
            PRESENCIAL y que esos precios no van a estar online: sin eso, una lista de precios se
            lee como una lista de precios de la tienda.
          */}
          {elegida.nota && (
            <div style={{ marginTop: space[2], fontSize: font.sm, color: color.ink2 }}>{elegida.nota}</div>
          )}
        </Card>
      )}

      {/*
        🔴 El aviso de la decisión 1. Va arriba y no como una nota al pie: es lo que separa "esta
        lista está lista para comunicar" de "faltan mirar 65 precios".
      */}
      {resumen.sinRevisar > 0 && (
        <Notice tone="warning" style={{ marginBottom: space[3] }}>
          <strong>{resumen.sinRevisar}</strong> de {resumen.total} precios todavía no los revisó una
          segunda persona: pueden cambiar. En la tabla van marcados como <b>Provisorio</b>.
        </Notice>
      )}

      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginBottom: space[3] }}>
        <KpiCard label="Productos" value={resumen.total} />
        <KpiCard label="Precio confirmado" value={resumen.firmes} tone={resumen.sinRevisar ? 'warning' : 'success'} sub={resumen.sinRevisar ? `${resumen.sinRevisar} sin revisar` : 'los ' + resumen.total} />
        <KpiCard label="★ Destacados" value={resumen.estrellas} />
      </div>

      {!lista ? <Esqueleto filas={8} /> : (
        <TableWrap maxHeight={640}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead>
              <Tr>
                <Th width={44}> </Th>
                <Th width={64}> </Th>
                <Th>Producto</Th>
                <Th align="right">Lista</Th>
                <Th align="right">Precio</Th>
                <Th align="right">% off</Th>
                <Th align="right">Stock</Th>
                <Th>Estado</Th>
              </Tr>
            </THead>
            <TBody>
              {visibles.map((i) => (
                <Fila
                  key={i.pid}
                  item={i}
                  marcado={destacados.porProducto.get(i.pid) || null}
                  onAlternar={() => destacados.alternar({ id: i.pid, nombre: i.nombre, sku: i.sku })}
                  onFoto={() => i.imagen && setFoto({ url: i.imagen, alt: i.nombre })}
                />
              ))}
              {!visibles.length && (
                <Tr>
                  <Td colSpan={8}>
                    <span style={{ color: color.mut, fontSize: font.sm }}>Nada con este filtro.</span>
                  </Td>
                </Tr>
              )}
            </TBody>
          </table>
        </TableWrap>
      )}

      {foto && <Lightbox src={foto.url} alt={foto.alt} onCerrar={() => setFoto(null)} />}
    </>
  )
}

function Fila({
  item, marcado, onAlternar, onFoto,
}: {
  item: PrecioItem
  marcado: Parameters<typeof Estrella>[0]['marcado']
  onAlternar: () => Promise<void>
  onFoto: () => void
}) {
  return (
    <Tr>
      <Td>
        <Estrella marcado={marcado} nombre={item.nombre} onAlternar={onAlternar} titulo="de esta campaña" />
      </Td>
      <Td>
        {item.imagen ? (
          // La miniatura se toca y la foto se abre en grande: a 36 px se ve que hay una prenda, ⛔ no
          // CUÁL. Mismo camino que en Liquidación; la URL guardada ya es la de 1024 px.
          <button
            type="button"
            onClick={onFoto}
            style={{ border: 'none', background: 'none', padding: 0, cursor: 'zoom-in', display: 'block' }}
            aria-label={`Ver la foto de ${item.nombre}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imagen}
              alt=""
              style={{ width: 36, height: 44, objectFit: 'cover', borderRadius: radius.sm, display: 'block' }}
            />
          </button>
        ) : (
          <span style={{ color: color.mut2, fontSize: font.xs }}>—</span>
        )}
      </Td>
      <Td>
        <div style={{ fontWeight: weight.medium }}>{item.nombre}</div>
        {item.sku && <div style={{ color: color.mut2, fontSize: font.xs }}>{item.sku}</div>}
      </Td>
      <Td align="right">
        <span style={{ color: color.mut, textDecoration: 'line-through' }}>
          {item.precioLista ? formatMoney(item.precioLista) : '—'}
        </span>
      </Td>
      <Td align="right">
        <strong>{item.precio == null ? '—' : formatMoney(item.precio)}</strong>
      </Td>
      {/* ⛔ `null` dice «—» y ⛔ nunca 0%: un 0% off afirma que el precio no bajó. */}
      <Td align="right">{item.pctDesc == null ? '—' : `${Math.round(item.pctDesc)}%`}</Td>
      <Td align="right">
        {item.stock > 0
          ? item.stock
          : <span style={{ color: color.warning, fontWeight: weight.medium }}>0</span>}
      </Td>
      <Td>
        {item.firme
          ? <Badge tone="success">Confirmado</Badge>
          : <Badge tone="warning">Provisorio</Badge>}
      </Td>
    </Tr>
  )
}

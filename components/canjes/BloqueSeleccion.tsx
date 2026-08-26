'use client'

/**
 * Los productos que se le mandan.
 *
 * **Hay dos escritores y no se pisan.** El equipo los carga desde el buscador de Gestión Nube
 * (`origen: 'equipo'`); ella los elige desde el link, de la vitrina que se le haya colgado
 * (`origen: 'persona'`). Los suyos entran en `propuesto` —que los haya elegido no quiere decir que
 * haya stock— y el equipo los confirma o los marca sin stock, que es el mismo flujo de siempre.
 *
 * 🆕 **Y una tercera forma de cargar: A MANO** (26-ago-2026). El buscador sólo encuentra lo que está
 * en Gestión Nube, y el caso que quedaba afuera es justamente el que aparece más tarde: un regalo,
 * o algo que ella pidió de afuera del catálogo. Se tipea nombre, cantidad y precio; la fila queda
 * **sin SKU**, que es exactamente lo que ya pasa con todo lo que sale de la vitrina, y el balance
 * estima el costo con `factor_costo_estimado` hasta que alguien lo cargue.
 *
 * 🔑 **Y por eso existe el EXTRA.** Un regalo no es pasarse del acuerdo: es una decisión aparte,
 * tomada después. Marcado como extra sale de la cuenta del tope —y del saldo que ve ella en el
 * portal— pero **sigue contando en el balance**, porque cuesta plata igual. La regla vive una sola
 * vez, en `controlDelTope` (`lib/canjes/reglas.core.js`).
 *
 * El control del tope se muestra acá pero **lo hace el servidor** con la lista real, y ahora
 * también del lado de ella: la misma función corre en los dos handlers (`lib/canjes/reglas.core.js`).
 * El de esta pantalla es para que nadie llegue hasta el error.
 */

import { useState } from 'react'
import { BuscarArticuloGN, type ArticuloGN } from '@/components/ui/BuscarArticuloGN'
import {
  Badge, Button, EmptyState, Field, Input, Notice, SectionCard, Select, TableWrap, THead, TBody, Tr, Th, Td,
  color, font, space, weight, useConfirmar, useToast,
} from '@/components/ui'
import { agregarItem, colgarVitrina, confirmarItem, quitarItem, type VitrinaEnLista } from '@/lib/canjes/cliente'
import {
  MOTIVOS_QUITAR_ITEM, baseDeCostos, controlDelTope, itemsVivos, puedeElegir,
  type CanjeItem, type CanjeRow, type CanjeStore, type CanjeVitrina,
} from '@/lib/canjes/tipos'

export function BloqueSeleccion({
  store, canje, items, vitrina, vitrinas, onCambio, editable,
}: {
  store: CanjeStore
  canje: CanjeRow
  items: CanjeItem[]
  /** La vitrina colgada, con sus productos. `null` si el canje no tiene ninguna. */
  vitrina: CanjeVitrina | null
  /** Todas las de la marca, para poder cambiársela mientras no haya elegido. */
  vitrinas: VitrinaEnLista[]
  onCambio: () => void
  editable: boolean
}) {
  const toast = useToast()
  const { pedirTexto } = useConfirmar()
  const [guardando, setGuardando] = useState(false)
  // El formulario de carga a mano. Arranca cerrado: el camino normal sigue siendo el buscador, que
  // es el que trae el costo y el SKU. Éste es la salida para lo que no está en Gestión Nube.
  const [aMano, setAMano] = useState(false)
  const [mNombre, setMNombre] = useState('')
  const [mVariante, setMVariante] = useState('')
  const [mCantidad, setMCantidad] = useState('1')
  const [mPvp, setMPvp] = useState('')
  const [mExtra, setMExtra] = useState(false)

  const control = controlDelTope(canje, items)
  const vivos = itemsVivos(items)
  const quitados = items.filter((i) => i.estado === 'quitado' || i.estado === 'sin_stock')
  // Stunned lee los costos de Zattia: es una línea de esa tienda, no una tienda propia.
  const marcaGN = baseDeCostos(canje.store)

  async function sumar(a: ArticuloGN) {
    setGuardando(true)
    try {
      await agregarItem(canje.store, canje.id, {
        sku: a.sku,
        product_id: String(a.product_id),
        size_id: String(a.size_id),
        nombre: a.product_name,
        variante: a.size_name,
        cantidad: 1,
        // El precio se congela al cargarlo: el balance necesita el de HOY, no el de dentro de un
        // año. **El costo ya no viaja desde acá** — lo congela el servidor leyéndolo de la base
        // (pieza B del escalón 3 de la Fase S). Mandarlo era lo que dejaba que la valuación de un
        // canje la dictara el navegador.
        pvp_unit: a.retailer_price,
      })
      onCambio()
    } catch (e) {
      // El servidor devuelve el motivo en criollo cuando se pasa del tope: se muestra tal cual.
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  /**
   * Cargar algo que no está en Gestión Nube: un regalo, o algo que pidió de afuera del catálogo.
   *
   * ⚠️ **Va sin `product_id`, y no es un olvido.** Ése es el dato con el que el servidor busca el
   * costo; sin él la fila queda con `costo_unit: null` y el balance la estima con
   * `factor_costo_estimado`, que es el mismo camino que ya recorre todo lo que sale de la vitrina.
   * Mandar un id inventado sería peor: cruzaría con el costo de otro producto.
   */
  async function cargarAMano() {
    const nombre = mNombre.trim()
    if (!nombre) return
    setGuardando(true)
    try {
      const cant = parseInt(mCantidad, 10)
      const precio = Number(mPvp.replace(',', '.'))
      await agregarItem(canje.store, canje.id, {
        nombre,
        variante: mVariante.trim() || null,
        cantidad: Number.isFinite(cant) && cant > 0 ? cant : 1,
        // Vacío es un caso normal: un regalo puede no tener precio de lista a mano. `null` deja que
        // el balance lo estime, y un 0 mentiría diciendo que no costó nada.
        pvp_unit: mPvp.trim() && Number.isFinite(precio) ? precio : null,
        extra: mExtra,
      })
      setMNombre(''); setMVariante(''); setMCantidad('1'); setMPvp(''); setMExtra(false)
      setAMano(false)
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  /**
   * Confirmar lo que eligió ella. Se aprovecha para pedir el costo, que es el único dato que la
   * vitrina no puede traer: el precio viene de Tienda Nube, el costo vive en Gestión Nube.
   * Se puede dejar vacío — el balance lo estima con el factor de la config hasta que esté.
   */
  async function confirmar(item: CanjeItem) {
    const costo = await pedirTexto(
      'Si lo tenés a mano, cargá el costo. Se puede dejar vacío: el balance lo estima hasta que lo cargues.',
      '',
      { titulo: `Confirmar ${item.nombre || item.sku || 'este producto'}`, placeholder: 'Costo unitario', ok: 'Confirmar' },
    )
    // `null` es cancelar; string vacío es "confirmalo sin costo", que es un caso normal.
    if (costo === null) return
    try {
      const n = Number(String(costo).replace(',', '.'))
      await confirmarItem(canje.store, canje.id, item.id, costo.trim() && Number.isFinite(n) ? n : null)
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    }
  }

  async function quitar(item: CanjeItem) {
    const motivo = await pedirTexto(
      'Queda registrado por qué se cayó: al mes siguiente es lo que explica por qué el canje salió distinto de lo acordado.',
      '',
      {
        titulo: `Quitar ${item.nombre || item.sku || 'este producto'}`,
        placeholder: MOTIVOS_QUITAR_ITEM.join(' · '),
        ok: 'Quitar',
      },
    )
    if (!motivo) return
    try {
      await quitarItem(canje.store, canje.id, item.id, motivo, /Sin stock/i.test(motivo))
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    }
  }

  // Todavía puede elegir: la vitrina se puede cambiar. Una vez que mandó, no — lo que eligió quedó
  // congelado acá abajo y darle otra lista dejaría una elección que no se corresponde con ninguna.
  const cambiable = editable && puedeElegir(canje)
  const activas = vitrinas.filter((v) => v.store === canje.store && v.estado === 'activa')

  async function cambiarVitrina(id: number | null) {
    try {
      await colgarVitrina(store, canje.id, id)
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    }
  }

  return (
    <SectionCard
      title="Qué se le manda"
      subtitle={
        vitrina
          ? 'Lo elige ella desde el link, de la vitrina que tenga colgada. Vos podés sumar o quitar lo que haga falta.'
          : 'Los pasa por mensaje y los cargás vos: qué se le puede ofrecer depende de si ya está lanzado en la tienda.'
      }
    >
      {/* De dónde elige, y si ya eligió. Es lo primero que se pregunta al abrir un canje acordado. */}
      {(vitrina || activas.length > 0) && (
        <div style={{ marginBottom: space[3], display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: color.mut, fontSize: font.sm }}>Elige de:</span>
          {cambiable ? (
            <Select
              value={canje.vitrina_id == null ? '' : String(canje.vitrina_id)}
              onChange={(e) => void cambiarVitrina(e.target.value ? Number(e.target.value) : null)}
              style={{ width: 'auto', minWidth: 220 }}
            >
              <option value="">Sin vitrina — los cargás vos</option>
              {activas.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              {/* La colgada puede estar archivada: se muestra igual o el Select la perdería. */}
              {vitrina && !activas.some((v) => v.id === vitrina.id) && (
                <option value={vitrina.id}>{vitrina.nombre} (archivada)</option>
              )}
            </Select>
          ) : (
            <Badge tone="neutral" subtle>{vitrina ? vitrina.nombre : 'Sin vitrina'}</Badge>
          )}
          {vitrina && (
            canje.seleccion_cerrada_at
              ? <Badge tone="success" subtle>Ya eligió</Badge>
              : <Badge tone="warning" subtle>Todavía no eligió</Badge>
          )}
        </div>
      )}
      {/* Lo acordado, al lado de lo que se está cargando. En modo unidades el control del detalle
          es a ojo del operador: la categoría de GN no es lo bastante prolija para bloquear por
          ella, y una validación que se equivoca la mitad de las veces se termina apagando. */}
      {canje.tope_tipo === 'unidades' && (canje.tope_unidades || []).length > 0 && (
        <div style={{ marginBottom: space[3], display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: color.mut, fontSize: font.sm }}>Se acordó:</span>
          {(canje.tope_unidades || []).map((u, i) => (
            <Badge key={i} tone="neutral" subtle>{u.cantidad} {u.descripcion}</Badge>
          ))}
        </div>
      )}

      <div style={{ marginBottom: space[3] }}>
        <Notice tone={control.ok ? 'neutral' : 'danger'}>{control.mensaje}</Notice>
      </div>

      {editable && (
        <div style={{ marginBottom: space[3], opacity: guardando ? 0.6 : 1 }}>
          <BuscarArticuloGN marca={marcaGN} onSelect={(a) => void sumar(a)} />
          {/* El buscador sigue siendo el camino normal —trae SKU y costo—; esto es la salida para lo
              que no está en Gestión Nube. Por eso es un link discreto y no un segundo botón grande. */}
          {!aMano ? (
            <button
              type="button"
              onClick={() => setAMano(true)}
              style={{
                height: 'auto', marginTop: space[2], background: 'none', border: 'none', padding: 0,
                color: color.mut, fontSize: font.sm, textDecoration: 'underline', cursor: 'pointer',
              }}
            >
              ¿No está en Gestión Nube? Cargalo a mano
            </button>
          ) : (
            <div style={{ marginTop: space[3], padding: space[3], border: `1px dashed ${color.line}`, borderRadius: 8 }}>
              <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
                <Field label="Qué es" width={220}>
                  <Input
                    value={mNombre}
                    placeholder="Funda + llavero"
                    onChange={(e) => setMNombre(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void cargarAMano() }}
                  />
                </Field>
                <Field label="Variante" width={140}>
                  <Input value={mVariante} placeholder="Opcional" onChange={(e) => setMVariante(e.target.value)} />
                </Field>
                <Field label="Cantidad" width={100}>
                  <Input type="number" min={1} value={mCantidad} onChange={(e) => setMCantidad(e.target.value)} />
                </Field>
                <Field label="Precio" hint="Se puede dejar vacío" width={140}>
                  <Input value={mPvp} placeholder="12000" onChange={(e) => setMPvp(e.target.value)} />
                </Field>
              </div>
              <label style={{ display: 'flex', gap: space[2], alignItems: 'center', marginTop: space[2] }}>
                <input type="checkbox" checked={mExtra} onChange={(e) => setMExtra(e.target.checked)} />
                <span style={{ fontSize: font.sm }}>
                  Es un extra: va por encima de lo acordado y no cuenta al tope
                  <span style={{ color: color.mut }}> (sí al costo del canje)</span>
                </span>
              </label>
              <div style={{ display: 'flex', gap: space[2], marginTop: space[3] }}>
                <Button size="sm" disabled={!mNombre.trim() || guardando} onClick={() => void cargarAMano()}>Agregar</Button>
                <Button variant="ghost" size="sm" onClick={() => setAMano(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!vivos.length ? (
        <EmptyState
          dashed
          title="Todavía no hay productos cargados"
          hint={
            vitrina && !canje.seleccion_cerrada_at
              ? `Los va a elegir ella desde el link, de “${vitrina.nombre}”. Si querés adelantarte, buscalos arriba.`
              : 'Buscalos arriba por SKU o por nombre.'
          }
        />
      ) : (
        <TableWrap>
          <THead>
            <Tr>
              <Th>Producto</Th>
              <Th>SKU</Th>
              <Th align="right">Cantidad</Th>
              <Th align="right">PVP</Th>
              <Th align="right">Costo</Th>
              {editable && <Th />}
            </Tr>
          </THead>
          <TBody>
            {vivos.map((i) => (
              <Tr key={i.id}>
                <Td strong>
                  {i.nombre || '—'}
                  {i.variante ? <span style={{ color: color.mut }}> ({i.variante})</span> : null}
                  {/* Ésta sí se dibuja, al revés que la de "lo eligió ella" que se sacó abajo: el
                      extra **cambia una cuenta** —sale del tope y no del balance—, así que una fila
                      que no lo diga vuelve el total imposible de reconstruir mirando la tabla. */}
                  {i.extra ? <Badge tone="neutral" subtle style={{ marginLeft: space[2] }}>extra</Badge> : null}
                  {/* ⛔ Acá había una chapita "Lo eligió ella — falta confirmar". Se sacó: el botón
                      Confirmar está en la misma fila y dice lo mismo sin ocupar media columna, y
                      el estado del item **no traba nada** —propuesto y confirmado cuentan igual
                      para el tope y para el balance—, así que anunciarlo en amarillo le daba peso
                      de alerta a algo que no lo es. Quién lo eligió tampoco cambia qué hacer con
                      él: el stock se descubre al cargar la venta en la tienda, no acá. */}
                </Td>
                <Td mono>{i.sku || '—'}</Td>
                <Td align="right">{i.cantidad}</Td>
                <Td align="right">{i.pvp_unit != null ? `$${Number(i.pvp_unit).toLocaleString('es-AR')}` : '—'}</Td>
                <Td align="right">{i.costo_unit != null ? `$${Number(i.costo_unit).toLocaleString('es-AR')}` : '—'}</Td>
                {editable && (
                  <Td>
                    <div style={{ display: 'flex', gap: space[1] }}>
                      {i.estado === 'propuesto' && (
                        <Button variant="outline" size="sm" onClick={() => void confirmar(i)}>Confirmar</Button>
                      )}
                      <Button variant="ghost" tone="danger" size="sm" onClick={() => void quitar(i)}>Quitar</Button>
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      )}

      {/* Los quitados NO se borran: que algo se haya caído por falta de stock es información. */}
      {quitados.length > 0 && (
        <div style={{ marginTop: space[3] }}>
          <div style={{ color: color.mut, fontSize: font.sm, fontWeight: weight.medium, marginBottom: 4 }}>
            Se cayeron del pedido
          </div>
          {quitados.map((i) => (
            <div key={i.id} style={{ color: color.mut2, fontSize: font.sm }}>
              {i.nombre || i.sku} — {i.estado === 'sin_stock' ? 'sin stock' : 'quitado'}
              {i.motivo ? `: ${i.motivo}` : ''}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

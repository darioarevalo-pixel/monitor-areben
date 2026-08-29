'use client'

/**
 * La ficha de un insumo: sus datos y su libro. También es el alta (con `vista` en `null`).
 *
 * 🔑 **El libro y el formulario van juntos en el mismo diálogo** a propósito: el gesto real no es
 * «editar un insumo», es *«llegaron tres cajas»* o *«conté y quedan doce»*. Separarlos obligaría a
 * abrir dos veces para hacer una cosa.
 *
 * 🔴 **Los campos vacíos se mandan como `null`, ⛔ nunca como 0.** `Number('')` es 0: dejar que un
 * precio sin cargar viaje como cero convertiría «no sé cuánto salió» en «salió gratis», y eso
 * después hunde el precio de referencia sin que nadie lo vea. El handler lo vuelve a frenar.
 */

import { useMemo, useState } from 'react'
import {
  Button,
  Field,
  Input,
  Modal,
  Notice,
  NumberField,
  Select,
  TBody,
  TableWrap,
  THead,
  Td,
  Th,
  Tr,
  color,
  formatMoney,
  space,
  useConfirmar,
  useToast,
} from '@/components/ui'
import {
  borrarInsumo,
  borrarMovimiento,
  borrarPedido,
  cancelarPedido,
  guardarInsumo,
  guardarMovimiento,
  guardarPedido,
  trasladar,
} from '@/lib/insumos/cliente'
import { TIPOS, TIPOS_MOVIMIENTO, UBICACIONES, UNIDADES, rotuloUbicacion, type VistaInsumo } from '@/lib/insumos/core'
import { hoyIso } from '@/lib/fechas/dia'
import type { Insumo, Pedido, TipoInsumo, TipoMovimiento, Ubicacion, Unidad } from '@/lib/insumos/tipos'

type Props = {
  marca: string | null
  /** `null` = alta. */
  vista: VistaInsumo | null
  onCerrar: () => void
  onCambio: () => void
}

const nuevo = (): Partial<Insumo> => ({
  nombre: '', tipo: 'comercial', unidad: 'unidad', bulto: null, porBulto: null, marcas: [],
  minimo: 2, diasReposicion: null, consumo: {}, activo: true, nota: null,
})

export function FichaInsumo({ marca, vista, onCerrar, onCambio }: Props) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [form, setForm] = useState<Partial<Insumo>>(() => (vista ? { ...vista.insumo } : nuevo()))
  const [guardando, setGuardando] = useState(false)

  const modo = (form.consumo as { modo?: string })?.modo ?? 'manual'
  const canal = (form.consumo as { canal?: string })?.canal ?? ''
  const porVenta = (form.consumo as { porVenta?: number })?.porVenta ?? 1

  const set = (p: Partial<Insumo>) => setForm((f) => ({ ...f, ...p }))

  async function guardar() {
    if (!marca) return
    setGuardando(true)
    try {
      await guardarInsumo(marca, form)
      toast.ok(vista ? 'Insumo guardado' : 'Insumo cargado')
      onCambio()
      if (!vista) onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function borrar() {
    if (!marca || !vista) return
    const ok = await confirmar({
      titulo: 'Eliminar el insumo',
      // El diálogo dice el número: borrar el insumo se lleva su libro entero, y cuántos
      // movimientos son es la única forma de saber cuánto se pierde antes de apretar.
      mensaje: `Se va a eliminar «${vista.insumo.nombre}» y sus ${vista.movimientos.length} movimientos. Si sólo querés dejar de reponerlo, destildá «Se sigue usando».`,
      ok: 'Eliminar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarInsumo(marca, vista.insumo.id)
      toast.ok('Insumo eliminado')
      onCambio()
      onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar')
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={vista ? vista.insumo.nombre : 'Cargar un insumo'}
      ancho="ancho"
      pie={
        <>
          {vista && <Button variant="ghost" tone="danger" onClick={borrar}>Eliminar</Button>}
          <Button variant="ghost" onClick={onCerrar}>Cerrar</Button>
          <Button variant="solid" tone="brand" loading={guardando} onClick={guardar}>Guardar</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[3] }}>
        <Field label="Nombre" width={260} required>
          <Input value={form.nombre ?? ''} onChange={(e) => set({ nombre: e.target.value })} placeholder="Bolsas chicas" />
        </Field>
        <Field label="Tipo" width={160}>
          <Select value={form.tipo} onChange={(e) => set({ tipo: e.target.value as TipoInsumo })}>
            {TIPOS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Se cuenta por" width={140} hint="Todo el libro va en esta unidad">
          <Select value={form.unidad} onChange={(e) => set({ unidad: e.target.value as Unidad })}>
            {UNIDADES.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
          </Select>
        </Field>
        <Field label="Se compra por" width={140} hint="Sólo para tipear más rápido">
          <Input value={form.bulto ?? ''} onChange={(e) => set({ bulto: e.target.value || null })} placeholder="caja" />
        </Field>
        <Field label="Trae" width={110}>
          <NumberField
            value={form.porBulto ?? ''}
            onChange={(n) => set({ porBulto: n === '' ? null : n })}
            min={1}
          />
        </Field>
        <Field label="De qué marca es" width={220} hint="Sin tildar ninguna: de las dos">
          <div style={{ display: 'flex', gap: space[3] }}>
            {(['bdi', 'zattia'] as const).map((m) => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={(form.marcas ?? []).includes(m)}
                  onChange={(e) =>
                    set({
                      marcas: e.target.checked
                        ? [...(form.marcas ?? []), m]
                        : (form.marcas ?? []).filter((x) => x !== m),
                    })
                  }
                />
                {m === 'bdi' ? 'BDI' : 'Zattia'}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Avisar cuando queden" width={150} hint="El anteúltimo: con el último ya es tarde">
          <NumberField value={form.minimo ?? ''} onChange={(n) => set({ minimo: n === '' ? 0 : n })} min={0} />
        </Field>
        <Field label="Tarda en llegar (días)" width={170} hint="Vacío: no se sabe, y no se avisa por días">
          <NumberField
            value={form.diasReposicion ?? ''}
            onChange={(n) => set({ diasReposicion: n === '' ? null : n })}
            min={1}
          />
        </Field>
        <Field label="Cómo se mide el consumo" width={220}>
          <Select
            value={modo}
            onChange={(e) =>
              set({ consumo: e.target.value === 'por-venta' ? { modo: 'por-venta', canal: null, porVenta } : { modo: 'manual' } })
            }
          >
            <option value="manual">Lo anota alguien</option>
            <option value="por-venta">Se gasta con cada venta</option>
          </Select>
        </Field>
        {modo === 'por-venta' && (
          <>
            <Field label="De qué ventas" width={170}>
              <Select
                value={canal}
                onChange={(e) => set({ consumo: { modo: 'por-venta', canal: (e.target.value || null) as never, porVenta } })}
              >
                <option value="">Todas</option>
                <option value="local">Del local</option>
                <option value="online">De la tienda</option>
                <option value="mayorista">Mayoristas</option>
              </Select>
            </Field>
            <Field label="Cuánto por venta" width={140}>
              <NumberField
                value={porVenta}
                onChange={(n) => set({ consumo: { modo: 'por-venta', canal: (canal || null) as never, porVenta: n === '' ? 1 : n } })}
                min={0}
                step={0.1}
              />
            </Field>
          </>
        )}
        <Field label="Nota" width="100%">
          <Input value={form.nota ?? ''} onChange={(e) => set({ nota: e.target.value || null })} placeholder="Dónde se compra, qué medida, con quién se pide…" />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={form.activo !== false} onChange={(e) => set({ activo: e.target.checked })} />
          Se sigue usando
        </label>
      </div>

      {vista && <Pedidos marca={marca} vista={vista} onCambio={onCambio} />}
      {vista && <Libro marca={marca} vista={vista} onCambio={onCambio} />}
    </Modal>
  )
}

/** El libro del insumo: lo que ya pasó y el alta de un movimiento nuevo. */
/**
 * Los pedidos al proveedor.
 *
 * 🔴 **Existe porque «hay que comprar» y «ya lo pedí» son dos cosas distintas**, y hasta que no lo
 * fueron el aviso seguía gritando después de que alguien llamó al proveedor. Acá se anota la
 * promesa; el hecho —que llegó— sigue siendo la compra del libro, y es la que lo cierra.
 */
function Pedidos({ marca, vista, onCambio }: { marca: string | null; vista: VistaInsumo; onCambio: () => void }) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [cantidad, setCantidad] = useState<number | ''>('')
  const [pedidoAt, setPedidoAt] = useState(hoyIso())
  const [promesaAt, setPromesaAt] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [guardando, setGuardando] = useState(false)

  const i = vista.insumo
  const abierto = vista.pedido

  const historial = useMemo(
    () => [...vista.pedidosDelInsumo].sort((a, b) => b.pedidoAt.localeCompare(a.pedidoAt)),
    [vista.pedidosDelInsumo],
  )

  async function anotar() {
    if (!marca) return
    setGuardando(true)
    try {
      await guardarPedido(marca, {
        insumoId: i.id,
        // ⛔ Vacío llega como `null`, ⛔ nunca como 0: «lo pedí sin saber cuánto viene» es válido y
        // un 0 diría que se pidió nada.
        cantidad: cantidad === '' ? null : cantidad,
        pedidoAt,
        promesaAt: promesaAt || null,
        proveedor: proveedor || null,
      })
      toast.ok('Pedido anotado — el aviso de pedir se calla hasta que llegue')
      setCantidad('')
      setPromesaAt('')
      onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anotar el pedido')
    } finally {
      setGuardando(false)
    }
  }

  // 🔑 **Descartar y Eliminar son dos cosas distintas y VOCABULARIO.md las separa**: descartar deja
  // la fila con quién y cuándo —el pedido existió y no llegó, y eso es lo que mide al proveedor—;
  // eliminar la hace desaparecer, y es sólo para el que se cargó mal.
  // ⚠️ Los símbolos del código (`cancelar-pedido`, `cancelado_at`) ⛔ no se tocan: la regla es del
  // texto que lee una persona.
  async function descartar(pd: Pedido) {
    if (!marca) return
    const ok = await confirmar({
      titulo: `¿Descartar el pedido del ${pd.pedidoAt}?`,
      mensaje: 'Queda anotado que se pidió y no llegó, y el aviso de pedir vuelve a sonar. Se puede volver a cargar.',
      ok: 'Descartar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await cancelarPedido(marca, pd.id)
      onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descartar')
    }
  }

  async function eliminar(pd: Pedido) {
    if (!marca) return
    const ok = await confirmar({
      // 🔴 La confirmación NOMBRA lo que va a dejar de existir, ⛔ nunca un pronombre.
      titulo: `¿Eliminar el pedido del ${pd.pedidoAt}?`,
      mensaje: 'Es para el que se cargó mal. Si el pedido existió y no va a llegar, descartalo: eliminarlo se lleva puesto cuánto tardó ese proveedor.',
      ok: 'Eliminar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarPedido(marca, pd.id)
      onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar')
    }
  }

  return (
    <div style={{ marginTop: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <h4 style={{ margin: 0, fontSize: 14 }}>Los pedidos</h4>

      {/*
        🔑 La demora medida va con su denominador, igual que el precio: con UN pedido cerrado dice
        «la última vez», ⛔ no «promedio». Y se ofrece para cargar «tarda en llegar» a mano — ⛔ no
        se escribe sola: un número derivado de una observación manejando un aviso es lo que ya dejó
        una regla prendida y muda en este repo.
      */}
      <Notice tone="neutral">
        {vista.demora
          ? `${vista.demora.clase === 'promedio' ? `Tardó en llegar ${Math.round(vista.demora.dias * 10) / 10} días en promedio` : `La última vez tardó ${vista.demora.dias} días`} — ${vista.demora.pedidos} pedido${vista.demora.pedidos > 1 ? 's' : ''} cerrado${vista.demora.pedidos > 1 ? 's' : ''}, hasta el ${vista.demora.hasta}.`
          : 'Todavía no cerró ningún pedido, así que no se sabe cuánto tarda este proveedor.'}
        {i.diasReposicion == null
          ? ' «Tarda en llegar» está vacío: hasta que se cargue, el aviso por días no corre.'
          : ` Hoy está cargado en ${i.diasReposicion} días.`}
      </Notice>

      {abierto ? (
        <Notice tone={abierto.demorado ? 'danger' : 'success'}>
          <strong>Hay un pedido abierto</strong> del {abierto.pedido.pedidoAt}
          {abierto.pedido.proveedor ? ` a ${abierto.pedido.proveedor}` : ''} — hace {abierto.diasEsperando} días.
          {abierto.esperadoEl
            ? abierto.demorado
              ? ` Se esperaba el ${abierto.esperadoEl}: está demorado.`
              : ` Se lo espera el ${abierto.esperadoEl}.`
            : ' No se sabe cuándo tendría que llegar: sin fecha prometida ni «tarda en llegar», no se puede decir que esté demorado.'}
          {' '}Para cerrarlo, anotá la compra en el libro.
        </Notice>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[3], alignItems: 'flex-end' }}>
          <Field label={`Cuántos (${i.unidad})`} width={140} hint="Vacío si no sabés cuánto viene">
            <NumberField value={cantidad} onChange={setCantidad} min={0} />
          </Field>
          <Field label="Cuándo se pidió" width={150}>
            <Input type="date" value={pedidoAt} onChange={(e) => setPedidoAt(e.target.value)} />
          </Field>
          <Field label="Para cuándo lo prometieron" width={190} hint="Vacío: se calcula con «tarda en llegar»">
            <Input type="date" value={promesaAt} onChange={(e) => setPromesaAt(e.target.value)} />
          </Field>
          <Field label="A quién" width={170}>
            <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="CDE Insumos" />
          </Field>
          <Button variant="solid" tone="brand" loading={guardando} onClick={anotar}>
            Anotar el pedido
          </Button>
        </div>
      )}

      {historial.length > 0 && (
        <TableWrap maxHeight={200}>
          <THead>
            <Tr>
              <Th>Se pidió</Th>
              <Th align="right">Cuántos</Th>
              <Th>A quién</Th>
              <Th>Prometido</Th>
              <Th>Cómo terminó</Th>
              <Th>Quién</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {historial.map((pd) => {
              const cierre = vista.movimientos.find((m) => m.tipo === 'compra' && m.grupo === pd.id)
              return (
                <Tr key={pd.id}>
                  <Td mono>{pd.pedidoAt}</Td>
                  <Td align="right">{pd.cantidad ?? <span style={{ color: color.mut2 }}>—</span>}</Td>
                  <Td>{pd.proveedor ?? '—'}</Td>
                  <Td mono>{pd.promesaAt ?? <span style={{ color: color.mut2 }}>—</span>}</Td>
                  <Td>
                    {cierre ? `llegó el ${cierre.fecha}` : pd.canceladoAt ? 'descartado' : 'esperando'}
                  </Td>
                  <Td>{pd.usuario ?? '—'}</Td>
                  <Td>
                    {!cierre && !pd.canceladoAt && (
                      <Button variant="ghost" size="sm" tone="danger" onClick={() => descartar(pd)}>
                        Descartar
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" tone="danger" onClick={() => eliminar(pd)}>
                      Eliminar
                    </Button>
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </TableWrap>
      )}
    </div>
  )
}

function Libro({ marca, vista, onCambio }: { marca: string | null; vista: VistaInsumo; onCambio: () => void }) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [tipo, setTipo] = useState<TipoMovimiento>('compra')
  const [ubicacion, setUbicacion] = useState<Ubicacion>('deposito')
  const [destino, setDestino] = useState<Ubicacion>('local-bdi')
  const [cantidad, setCantidad] = useState<number | ''>('')
  const [bultos, setBultos] = useState<number | ''>('')
  const [fecha, setFecha] = useState(hoyIso())
  const [precio, setPrecio] = useState<number | ''>('')
  const [proveedor, setProveedor] = useState('')
  const [guardando, setGuardando] = useState(false)

  const i = vista.insumo
  // La ayuda para tipear: «3 cajas de 1.000» son 3.000 unidades. ⛔ Lo que viaja son las unidades:
  // la unidad del insumo es UNA sola y el libro entero va en ella.
  const enUnidades = useMemo(() => {
    if (bultos === '' || !i.porBulto) return null
    return bultos * i.porBulto
  }, [bultos, i.porBulto])

  const cantidadFinal = enUnidades ?? (cantidad === '' ? null : cantidad)

  const movs = useMemo(
    () => [...vista.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado)),
    [vista.movimientos],
  )

  async function agregar() {
    if (!marca || cantidadFinal == null) return
    setGuardando(true)
    try {
      if (tipo === 'traslado') {
        await trasladar(marca, { insumoId: i.id, origen: ubicacion, destino, cantidad: cantidadFinal, fecha })
      } else {
        await guardarMovimiento(marca, {
          insumoId: i.id,
          tipo,
          ubicacion,
          cantidad: cantidadFinal,
          fecha,
          precioTotal: tipo === 'compra' && precio !== '' ? precio : null,
          proveedor: proveedor || null,
          // 🔑 **Recibir no es un verbo aparte: es la compra, con el `grupo` del pedido.** Ese
          // vínculo es lo único que cierra el pedido (`compraQueCierra`) y lo único con lo que
          // después se puede medir cuánto tardó el proveedor de verdad.
          grupo: tipo === 'compra' && vista.pedido ? vista.pedido.pedido.id : null,
        })
      }
      toast.ok('Anotado')
      setCantidad('')
      setBultos('')
      setPrecio('')
      onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anotar')
    } finally {
      setGuardando(false)
    }
  }

  async function quitar(id: string, esTraslado: boolean) {
    if (!marca) return
    const ok = await confirmar({
      titulo: 'Eliminar el movimiento',
      mensaje: esTraslado
        ? 'Es un traslado: se eliminan las dos mitades, la que salió y la que entró. Eliminar una sola dejaría la mercadería duplicada.'
        : 'El stock se recalcula sin este movimiento.',
      ok: 'Eliminar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarMovimiento(marca, id)
      onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar')
    }
  }

  return (
    <div style={{ marginTop: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <h4 style={{ margin: 0, fontSize: 14 }}>El libro</h4>

      {/*
        Lo que la pantalla NO puede callar: de dónde sale el ritmo y sobre cuántas observaciones.
        Un «dura 9 días» sin denominador no se puede discutir.
      */}
      <Notice tone="neutral">
        {vista.ritmo
          ? `Se gasta ${Math.round(vista.ritmo.porDia * 100) / 100} por día — medido ${vista.ritmo.fuente === 'ventas' ? 'contra las ventas' : 'con lo que se anotó'}, sobre ${vista.ritmo.dias} días.`
          : 'Todavía no se puede medir cuánto se gasta: atalo a las ventas, o anotá al menos dos consumos.'}
        {vista.precio
          ? ` · ${vista.precio.clase === 'promedio' ? `Promedio de ${vista.precio.compras} compras` : 'Última compra'}: ${formatMoney(vista.precio.unitario)} por unidad, desde ${vista.precio.desde}.`
          : ' · Todavía no se cargó ningún precio.'}
      </Notice>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[3], alignItems: 'flex-end' }}>
        <Field label="Qué pasó" width={170}>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento)}>
            {TIPOS_MOVIMIENTO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label={tipo === 'traslado' ? 'De dónde' : 'Dónde'} width={150}>
          <Select value={ubicacion} onChange={(e) => setUbicacion(e.target.value as Ubicacion)}>
            {UBICACIONES.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
          </Select>
        </Field>
        {tipo === 'traslado' && (
          <Field label="Adónde" width={150}>
            <Select value={destino} onChange={(e) => setDestino(e.target.value as Ubicacion)}>
              {UBICACIONES.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
            </Select>
          </Field>
        )}
        <Field label={`Cuántos (${i.unidad})`} width={130}>
          <NumberField value={cantidad} onChange={setCantidad} min={0} disabled={enUnidades != null} />
        </Field>
        {i.bulto && i.porBulto ? (
          <Field label={`O cuántos ${i.bulto}`} width={130} hint={enUnidades != null ? `= ${enUnidades}` : `de ${i.porBulto}`}>
            <NumberField value={bultos} onChange={setBultos} min={0} />
          </Field>
        ) : null}
        <Field label="Cuándo" width={150}>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        {tipo === 'compra' && vista.pedido && (
          <Notice tone="success">
            <strong>Esta compra cierra el pedido del {vista.pedido.pedido.pedidoAt}</strong>
            {vista.pedido.pedido.proveedor ? ` a ${vista.pedido.pedido.proveedor}` : ''} — con eso queda medido cuánto tardó en
            llegar, que es lo que después llena «tarda en llegar» sin inventar el número.
          </Notice>
        )}
        {tipo === 'compra' && (
          <>
            <Field label="Cuánto salió (total)" width={160} hint="Vacío si no lo sabés">
              <NumberField value={precio} onChange={setPrecio} min={0} />
            </Field>
            <Field label="A quién" width={170}>
              <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="CDE Insumos" />
            </Field>
          </>
        )}
        <Button variant="solid" tone="brand" loading={guardando} disabled={cantidadFinal == null} onClick={agregar}>
          Anotar
        </Button>
      </div>

      {movs.length > 0 && (
        <TableWrap maxHeight={260}>
          <THead>
            <Tr>
              <Th>Cuándo</Th>
              <Th>Qué pasó</Th>
              <Th>Dónde</Th>
              <Th align="right">Cuántos</Th>
              <Th align="right">Salió</Th>
              <Th>Quién</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {movs.map((m) => (
              <Tr key={m.id}>
                <Td mono>{m.fecha}</Td>
                <Td>
                  {TIPOS_MOVIMIENTO.find((t) => t.key === m.tipo)?.label ?? m.tipo}
                  {m.pata ? <span style={{ color: color.mut2 }}> ({m.pata})</span> : null}
                </Td>
                <Td>{rotuloUbicacion(m.ubicacion)}</Td>
                <Td align="right">{m.cantidad}</Td>
                <Td align="right">{m.precioTotal == null ? <span style={{ color: color.mut2 }}>—</span> : formatMoney(m.precioTotal)}</Td>
                <Td>{m.usuario ?? '—'}</Td>
                <Td>
                  <Button variant="ghost" size="sm" tone="danger" onClick={() => quitar(m.id, m.tipo === 'traslado')}>
                    Eliminar
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      )}
    </div>
  )
}

'use client'

/**
 * La FICHA de una venta, al costado de la lista (diseño §5): número grande (total o saldo), chips, botones (principal +
 * Editar + Hacer cambio + ⋯), datos, nota, prendas y totales, e HISTORIAL. Anular (con motivo) y la nota de crédito de
 * una anulada facturada son las de siempre (`anularVenta`, `notaDeCreditoDeVenta`), mudadas del buscador viejo.
 * Un pedido de TN sin pagar ⛔ es venta todavía: su ficha dice eso, hace cuánto entró, el medio, lo que retiene, y lleva
 * a Cobranzas (cobrarlo) o a Tienda Nube (cancelarlo) — lo que era la pestaña «Pedidos sin pagar» (19-oct).
 */

import { useEffect, useState } from 'react'
import { Button, Field, MenuAcciones, Modal, Notice, Select, color, font, space, useConfirmar, weight, type AccionMenu } from '@/components/ui'
import { DatoFicha, DatosFicha, FichaCostado, Historial, type HechoHistorial, type PieFicha } from '@/components/ui/FichaCostado'
import { usePantallaAngosta } from '@/lib/movil'
import { ChipEstado, cuandoCorto } from '@/components/ui/PiezasLista'
import {
  anularVenta, corregirMedioDeVenta, corregirPrecioDeVenta, leerExtraDeVenta, leerFichaDeVenta, notaDeCreditoDeVenta,
  type ExtraDeVenta, type FichaDeVenta, type FilaVentaLista, type MarcaErp, type QueSabeElMotor,
} from '@/lib/erp/cliente'
import { COBRO, ESTADO, historialDeVenta, plata } from '@/lib/erp/ventas-lista.core.js'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import { MOTIVO_MINIMO, NOMBRE_CANAL } from '@/lib/erp/venta.core.js'
import { textoDeVuelta } from '@/lib/erp/desarme.core.js'
import { rutaVigente } from '@/motor/cuentas/cuentas.mjs'
import { DesarmeVenta } from './DesarmeVenta'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'

/** Los medios en que entra plata (`MEDIOS_COBRO` del motor, `correccion-medio.mjs`), con el nombre de la pantalla. */
const MEDIOS_CORREGIR = [['efectivo', 'Efectivo'], ['debito', 'Débito'], ['credito', 'Crédito'], ['transferencia', 'Transferencia'], ['mp', 'Mercado Pago'], ['pagonube', 'Pago Nube']] as const

const COBRO_EN_ENTREGA = { efectivo: 'Efectivo', transferencia: 'Transferencia', ya_pagado: 'Ya estaba pagado' } as const
const ENTREGA: Record<string, string> = { retira: 'Retira', envio: 'Envío', cadete: 'Cadete' }
const LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }

export function FichaVenta({ marca, fila, accionInicial, puede, onCerrar, onCambio, abrirVentana, irACaja, version }: {
  marca: MarcaErp
  fila: FilaVentaLista
  accionInicial?: 'anular'
  puede: QueSabeElMotor
  onCerrar: () => void
  onCambio: (aviso: string) => void
  abrirVentana: (tipo: 'cobro' | 'editar') => void
  irACaja: (que: 'cambio' | 'factura') => void
  version: number
}) {
  const [ficha, setFicha] = useState<FichaDeVenta | null>(null)
  const [extra, setExtra] = useState<ExtraDeVenta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState(accionInicial === 'anular')
  const [corrigiendo, setCorrigiendo] = useState(false)
  // Corregir el MEDIO (29-oct, Bruno: lo hace el local): eligió «Efectivo» en Tienda Nube y pagó con tarjeta ⇒ el cierre de la
  // Caja esperaría ese efectivo. ⛔ Mueve plata ni cambia el monto: cambia por dónde entró.
  const [medioAbierto, setMedioAbierto] = useState(false)
  const [medioNuevo, setMedioNuevo] = useState('')
  const [motivoMedio, setMotivoMedio] = useState('')
  const [cuentaReal, setCuentaReal] = useState('')
  const puedeErp = usePuedeErp(marca)
  const [precios, setPrecios] = useState<Record<number, string>>({})
  const [motivoPrecio, setMotivoPrecio] = useState('')
  const [motivo, setMotivo] = useState('')
  const [forma, setForma] = useState<'plata' | 'saldo'>('plata')
  const [cliDoc, setCliDoc] = useState('')
  const [cliNombre, setCliNombre] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const { confirmar } = useConfirmar()
  const esPedido = fila.kind === 'pedido'

  useEffect(() => {
    if (esPedido) return
    let vivo = true
    Promise.all([leerFichaDeVenta(marca, fila.id), leerExtraDeVenta(marca, fila.id)])
      .then(([f, x]) => { if (vivo) { setFicha(f); setExtra(x); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo leer la venta.'))
    return () => { vivo = false }
  }, [marca, fila.id, esPedido, version])

  async function correr(fn: () => Promise<void>, fallo: string) {
    setTrabajando(true)
    try {
      await fn()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : fallo)
    } finally {
      setTrabajando(false)
    }
  }

  const dev = ficha?.devolucion ?? null
  // §17: sin plata pagada ⛔ hay qué elegir (va «plata» con 0). Saldo a favor sin clienta en la venta ⇒ se pide.
  const hayQueElegir = !!dev && dev.pagadoEnPlata > 0
  const formaElegida = hayQueElegir ? forma : 'plata'
  const pideClienta = formaElegida === 'saldo' && !ficha?.cliente
  const faltaClienta = pideClienta && !(cliDoc.trim() && cliNombre.trim())
  const confirmarAnular = () => correr(async () => {
    const r = await anularVenta(marca, fila.id, motivo, { forma: formaElegida }, pideClienta ? { doc: cliDoc.trim(), nombre: cliNombre.trim() } : undefined)
    setAnulando(false)
    setMotivo('')
    const plataTexto = r.devolucion?.monto
      ? r.devolucion.forma === 'saldo' ? ` Quedaron ${plata(r.devolucion.monto)} de saldo a favor.` : ` Devolvé ${plata(r.devolucion.monto)} (${r.devolucion.pagos.map((p) => p.medio ?? 'pago').join(', ')}).`
      : ''
    const vueltaTexto = r.vuelta === 'a_desarmar' ? ' Queda «A desarmar».' : r.vuelta === 'a_recibir' ? ' Queda «A recibir».' : ''
    onCambio(`Venta ${fila.ref} anulada.${plataTexto}${vueltaTexto}${r.ncPendiente ? ' Tenía factura: falta la nota de crédito.' : ''}`)
  }, 'No se pudo anular.')

  // Precio vigente de cada línea = el de la última corrección (el motor las guarda aparte: la venta ⛔ se edita).
  const corr = extra?.correcciones
  const vigente = (n: number, original: number) => {
    for (let i = (corr?.correcciones.length ?? 0) - 1; i >= 0; i--) {
      const l = corr!.correcciones[i].lineas.find((x) => x.n === n)
      if (l) return l.precio_despues
    }
    return original
  }
  const abrirCorregir = () => {
    setPrecios(Object.fromEntries((ficha?.lineas ?? []).filter((l) => !l.devuelta).map((l) => [l.n, String(vigente(l.n, l.precio))])))
    setMotivoPrecio('')
    setCorrigiendo(true)
  }
  const nuevos = (ficha?.lineas ?? []).filter((l) => !l.devuelta).map((l) => ({ n: l.n, precio: Number(String(precios[l.n] ?? '').replace(',', '.')), antes: vigente(l.n, l.precio) }))
  const cambian = nuevos.filter((x) => Number.isFinite(x.precio) && x.precio >= 0 && x.precio !== x.antes)
  const preciosMalos = nuevos.some((x) => !Number.isFinite(x.precio) || x.precio < 0)
  const confirmarCorregir = () => correr(async () => {
    const r = await corregirPrecioDeVenta(marca, fila.id, motivoPrecio, cambian.map((x) => ({ n: x.n, precio: x.precio })))
    setCorrigiendo(false)
    const d = r.correccion.diferencia
    onCambio(`Precio de la venta ${fila.ref} corregido: total ${plata(r.correccion.total_despues)}.${d === 0 ? '' : d > 0 ? ` Faltan cobrar ${plata(d)}: registrá el cobro.` : ` Sobran ${plata(-d)}: hay que devolverlos.`} No se movió plata.`)
  }, 'No se pudo corregir el precio.')

  // Adónde fue la plata: la cuenta REAL que dice la ruta de ERP › Cuentas para el medio en este canal (⛔ las cuentas de GN), u
  // otra elegida como excepción (Bruno 29-oct: el TN #135 eligió efectivo y transfirió al alias del local).
  const cuentasReales = extra?.cuentasReales ?? []
  const nombreReal = (id: string | null | undefined) => { const c = cuentasReales.find((x) => x.id === id); return c ? [c.banco, c.nombre, c.titular && c.titular !== 'areben' ? `de ${c.titular[0].toUpperCase()}${c.titular.slice(1)}` : null].filter(Boolean).join(' · ') : null }
  const deLaRuta = medioNuevo ? (rutaVigente(extra?.rutas ?? [], { marca: fila.linea, canal: fila.canal ?? '', medio: medioNuevo, en: fila.ocurridaEn }) as { cuenta_real_id: string | null } | null) : null
  const faltaCuenta = deLaRuta?.cuenta_real_id == null && !cuentaReal && cuentasReales.length > 0 && !!medioNuevo

  const confirmarMedio = () => correr(async () => {
    const r = await corregirMedioDeVenta(marca, fila.id, { medio: medioNuevo, motivo: motivoMedio, ...(cuentaReal ? { cuentaReal } : {}) })
    setMedioAbierto(false)
    onCambio(`Venta ${fila.ref}: el cobro de ${plata(r.correccion.monto)} pasó de ${r.correccion.cuenta_antes} a ${r.correccion.cuenta_despues}. No se movió plata.`)
  }, 'No se pudo corregir la forma de pago.')

  async function hacerNC() {
    const ok = await confirmar({
      titulo: `Nota de crédito de la venta ${fila.ref}`,
      mensaje: 'Anula entera la factura de esta venta ante ARCA. Una nota de crédito con CAE no se elimina.',
      ok: 'Hacer nota de crédito', tono: 'danger',
    })
    if (!ok) return
    await correr(async () => {
      const r = await notaDeCreditoDeVenta(marca, fila.id)
      onCambio(`Nota de crédito ${r.autorizada.numero} autorizada (CAE ${r.autorizada.cae})${r.ambiente !== 'produccion' ? ', de prueba' : ''}.${r.sinAtar ? ` ${r.sinAtar}` : ''}`)
    }, 'No se pudo hacer la nota de crédito.')
  }

  const titulo = `${esPedido ? `Pedido ${fila.ref}` : `Venta ${fila.ref}`} · ${cuandoCorto(fila.pedidoEn)}`
  const debe = fila.saldo > 0 && !esPedido
  const v = ficha?.venta
  const menu: AccionMenu[] = esPedido ? [] : [
    ...(ficha?.facturada && v?.estado === 'anulada' && !ficha.acreditadaEntera ? [{ key: 'nc', label: 'Hacer nota de crédito', icono: 'factura' as const, tone: 'danger' as const, onClick: () => void hacerNC() }] : []),
    ...(!fila.facturada && !fila.anulada && fila.tipo === 'venta' ? [{ key: 'fac', label: 'Facturar', icono: 'factura' as const, onClick: () => irACaja('factura') }] : []),
    ...(puede.corregir && !fila.anulada && !fila.facturada && fila.tipo === 'venta' ? [{ key: 'precio', label: 'Corregir precio…', icono: 'lapiz' as const, onClick: abrirCorregir }] : []),
    ...(puedeErp('corregir-medio') && !fila.anulada && !fila.facturada && fila.tipo === 'venta' ? [{ key: 'medio', label: 'Corregir forma de pago…', icono: 'pesos' as const, hint: 'Pagó con otro medio que el que figura (por ejemplo, eligió efectivo en la tienda y pagó con tarjeta).', onClick: () => { setMedioNuevo(''); setCuentaReal(''); setMotivoMedio(''); setMedioAbierto(true) } }] : []),
    { key: 'anular', label: 'Anular…', icono: 'anular', tone: 'danger', disabled: !!ficha?.puedeAnular || fila.anulada, hint: ficha?.puedeAnular ?? undefined, onClick: () => setAnulando(true) },
  ]
  // 📱 En el celular los botones de arriba bajan al pie: la principal es cobrar; lo demás, al «⋯».
  const angosta = usePantallaAngosta()
  const verEnTn: AccionMenu[] = fila.link ? [{ key: 'tn', label: 'Ver el pedido en Tienda Nube ↗', icono: 'abrir', onClick: () => window.open(fila.link!, '_blank', 'noopener') }] : []
  const pie: PieFicha = esPedido
    ? { principal: { label: 'Cobrar en Cobros del monitor ↗', onClick: () => window.open('/cobranzas', '_blank', 'noopener') }, mas: verEnTn }
    : {
        principal: debe ? { label: 'Registrar cobro', onClick: () => abrirVentana('cobro') } : undefined,
        otra: { label: 'Editar', disabled: fila.anulada, onClick: () => abrirVentana('editar') },
        mas: [...verEnTn, { key: 'cambio', label: 'Hacer cambio', icono: 'cambios', disabled: fila.anulada, onClick: () => irACaja('cambio') }, ...menu],
      }
  const hechos: HechoHistorial[] = ficha ? (historialDeVenta(ficha, { ...extra, tn: extra?.tn ?? undefined }) as HechoHistorial[]) : []
  const h3: React.CSSProperties = { margin: 0, fontSize: font.lg, fontWeight: weight.bold }
  const nota = extra?.nota ?? fila.nota

  return (
    <FichaCostado abierta onCerrar={onCerrar} titulo={titulo} etiqueta={`Ficha de la venta ${fila.ref}`} pie={pie}>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: weight.bold, overflowWrap: 'anywhere' }}>{fila.cliente}</h2>
          {fila.clienteDe === 'gn' && <div style={{ fontSize: font.sm, color: color.mut }}>el nombre sale de Gestión Nube</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <ChipEstado mapa={ESTADO} k={fila.estadoKey} /><ChipEstado mapa={COBRO} k={fila.cobroKey} />{fila.prueba && <ChipEstado mapa={{ p: ['warning', 'Prueba'] }} k="p" />}
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{ fontSize: font.sm, color: color.mut }}>{debe || esPedido ? 'Saldo' : 'Total'}</div>
          <div style={{ fontSize: 26, fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums', color: debe || esPedido ? 'var(--mo-warning-ink)' : color.ink }}>{plata(debe || esPedido ? fila.saldo : fila.total)}</div>
        </div>
      </div>

      {!angosta && <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
        {debe && <Button onClick={() => abrirVentana('cobro')}>Registrar cobro</Button>}
        {esPedido && <Button onClick={() => window.open('/cobranzas', '_blank', 'noopener')}>Cobrar en Cobros del monitor ↗</Button>}
        {fila.link && <Button variant="outline" onClick={() => window.open(fila.link!, '_blank', 'noopener')}>Ver el pedido en Tienda Nube ↗</Button>}
        {!esPedido && <Button variant="outline" disabled={fila.anulada} onClick={() => abrirVentana('editar')}>Editar</Button>}
        {!esPedido && <Button variant="outline" disabled={fila.anulada} onClick={() => irACaja('cambio')}>Hacer cambio</Button>}
        <MenuAcciones acciones={menu} etiqueta={`Más acciones de la venta ${fila.ref}`} vertical />
      </div>}

      {esPedido ? (
        <>
          {fila.entregadoSinCobrar && <Notice tone="danger"><b>Entregado sin cobrar</b>: Tienda Nube lo cerró sin que se registrara el pago. Ya no retiene stock; queda acá hasta que se cobre o se cancele.</Notice>}
          <Notice tone="warning">Pedido de Tienda Nube <b>sin pagar</b>: todavía no es una venta{fila.entregadoSinCobrar ? '' : ' y tiene los productos retenidos'}. Pasa a venta solo cuando Tienda Nube avisa que se pagó. Se cobra en Cobros del monitor (transferencia o efectivo) o se cancela en Tienda Nube.</Notice>
          <DatosFicha>
            <DatoFicha titulo="Entró">{`${cuandoCorto(fila.pedidoEn)}${fila.dias != null ? ` · ${fila.dias === 0 ? 'hoy' : fila.dias === 1 ? 'hace 1 día' : `hace ${fila.dias} días`}` : ''}`}</DatoFicha>
            <DatoFicha titulo="Eligió pagar con">{fila.medio ?? '—'}</DatoFicha>
            <DatoFicha titulo="Tienda">{LINEA[fila.linea] ?? fila.linea}</DatoFicha>
          </DatosFicha>
          {!!fila.prendas?.length && (
            <section>
              <h3 style={h3}>{fila.entregadoSinCobrar ? 'Productos' : 'Productos retenidos'}{fila.unidades != null && ` · ${fila.unidades}`}</h3>
              {fila.prendas.map((x, i) => (
                <div key={`${x.sku ?? x.nombre}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], padding: '10px 0', borderBottom: `1px solid ${color.bg2}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: weight.semibold }}>{x.nombre ?? x.sku ?? 'Sin nombre'}</div>
                    {x.sku && <div style={{ fontSize: font.sm, color: color.mut }}>{x.sku}</div>}
                  </div>
                  <span style={{ whiteSpace: 'nowrap', color: color.ink2 }}>{x.cantidad} u.</span>
                </div>
              ))}
            </section>
          )}
        </>
      ) : !ficha ? (
        <span style={{ color: color.mut }}>Leyendo la venta…</span>
      ) : (
        <>
          {v?.prueba && <Notice tone="warning">De prueba: corre en paralelo con Gestión Nube y no movió el stock del ERP. La factura real sale de Gestión Nube.</Notice>}
          {ficha?.sinCreditoGN && <Notice tone="neutral">Gestión Nube la vendió a cuenta a un cliente sin crédito marcado. Desde el ERP, esta venta se habría frenado hasta que un admin la autorizara.</Notice>}
          {ficha.anulacion && <Notice tone="danger">Anulada el {cuandoCorto(ficha.anulacion.anuladaEn)} por {ficha.anulacion.usuario}: «{ficha.anulacion.motivo}».</Notice>}
          {ficha.anulacion && ficha.anulacion.vuelta !== 'ya' && dev && !dev.volvio && (
            <DesarmeVenta marca={marca} ficha={ficha} refVenta={fila.ref} onListo={onCambio} />
          )}

          {extra?.cobroEnEntrega?.porVerificar && <Notice tone="warning">Lo cobró Logística al entregar con <b>transferencia</b>: falta verificar que entró. Se cruza en el monitor, en Pagos recibidos.</Notice>}
          <DatosFicha>
            <DatoFicha titulo="Origen">{fila.origenTexto}</DatoFicha>
            <DatoFicha titulo="Factura">{fila.factura ? `${fila.factura.numero}${fila.factura.de === 'gn' ? ' (GN)' : ''}` : 'Sin factura'}</DatoFicha>
            <DatoFicha titulo="Vendió">{extra?.vendedor || fila.vendio}</DatoFicha>
            <DatoFicha titulo="Sale de">{NOMBRE_DEPOSITO[v!.deposito as keyof typeof NOMBRE_DEPOSITO] ?? v!.deposito}</DatoFicha>
            <DatoFicha titulo="Canal">{NOMBRE_CANAL[v!.canal as keyof typeof NOMBRE_CANAL] ?? v!.canal}</DatoFicha>
            <DatoFicha titulo="Línea">{LINEA[v!.marca] ?? v!.marca}</DatoFicha>
            {extra?.entrega && <DatoFicha titulo="Entrega">{[ENTREGA[extra.entrega.tipo], extra.entrega.direccion].filter(Boolean).join(' · ')}</DatoFicha>}
            {extra?.cobroEnEntrega && <DatoFicha titulo="Cobrado al entregar">{[extra.cobroEnEntrega.formaPago ? COBRO_EN_ENTREGA[extra.cobroEnEntrega.formaPago] : null, extra.cobroEnEntrega.entrego, extra.cobroEnEntrega.fecha ? cuandoCorto(extra.cobroEnEntrega.fecha) : null].filter(Boolean).join(' · ')}</DatoFicha>}
            {extra?.gnNumero && <DatoFicha titulo="En Gestión Nube">{`venta ${extra.gnNumero}`}</DatoFicha>}
          </DatosFicha>

          {nota ? (
            <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', padding: '12px 14px', borderRadius: 10, background: 'var(--mo-warning-bg)', border: '1px solid var(--mo-warning-border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: font.sm, color: 'var(--mo-warning-ink)', fontWeight: weight.semibold }}>Nota · <span style={{ fontWeight: weight.normal }}>{nota.de}</span></div>
                <div style={{ color: color.ink, overflowWrap: 'anywhere' }}>{nota.texto}</div>
              </div>
              {!fila.anulada && <Button size="sm" variant="ghost" onClick={() => abrirVentana('editar')}>Editar</Button>}
            </div>
          ) : !fila.anulada && <div><Button size="sm" variant="outline" onClick={() => abrirVentana('editar')}>Agregar nota</Button></div>}

          <section>
            <h3 style={h3}>Productos</h3>
            {ficha.lineas.map((l) => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], padding: '10px 0', borderBottom: `1px solid ${color.bg2}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: weight.semibold }}>{l.nombre ?? `Producto ${l.producto}`}{l.devuelta && <span style={{ marginLeft: 6, color: 'var(--mo-warning-ink)', fontSize: font.sm }}>devuelta</span>}</div>
                  <div style={{ fontSize: font.sm, color: color.mut }}>Variante {l.talleNombre ?? l.talle} · {l.cantidad} u.{l.sku ? ` · ${l.sku}` : ''}{l.descuento || l.rebaja ? ` · desc. ${plata(l.descuento + l.rebaja)}` : ''}</div>
                </div>
                <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{plata(l.importe)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontWeight: weight.bold }}><span>Total</span><span>{plata(v!.total)}</span></div>
            {ficha.pagos.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', color: color.mut }}>
                <span>{p.medio === 'cuenta' ? 'Quedó a cuenta' : p.cuenta ?? p.medio ?? 'Pago'}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.medio === 'cuenta' ? '' : '− '}{plata(p.monto)}</span>
              </div>
            ))}
            {debe && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', fontWeight: weight.bold, color: 'var(--mo-warning-ink)' }}><span>Saldo</span><span>{plata(fila.saldo)}</span></div>}
          </section>

          {!!corr?.correcciones.length && (
            <Notice tone={corr.diferencia === 0 ? 'neutral' : 'warning'}>
              <b>Precio corregido</b>: total {plata(corr.total ?? v!.total)} · cobrado {plata(corr.cobrado ?? 0)}.{' '}
              {corr.diferencia > 0 ? `Faltan cobrar ${plata(corr.diferencia)}.` : corr.diferencia < 0 ? `Sobran ${plata(-corr.diferencia)}: hay que devolverlos.` : 'Lo cobrado coincide.'}{' '}
              Los productos de arriba muestran el precio original; la plata no se movió sola.
            </Notice>
          )}

          <section style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
            <div><h3 style={h3}>Historial de la venta</h3><span style={{ fontSize: font.sm, color: color.mut }}>todo lo que le pasó, con quién y cuándo</span></div>
            <Historial hechos={hechos} cuandoTexto={cuandoCorto} />
            {extra?.motor && <span style={{ fontSize: font.sm, color: color.mut2 }}>Las ediciones y las notas todavía no se leen: {extra.motor}</span>}
            {!puede.editar && !extra?.motor && <span style={{ fontSize: font.sm, color: color.mut2 }}>Editar todavía no está disponible.</span>}
          </section>
        </>
      )}

      <Modal
        abierto={anulando} onCerrar={() => setAnulando(false)} titulo={`Anular la venta ${fila.ref}`}
        pie={<>
          <Button variant="outline" onClick={() => setAnulando(false)}>Cancelar</Button>
          <Button tone="danger" disabled={trabajando || !ficha || motivo.trim().length < MOTIVO_MINIMO || !!ficha?.puedeAnular || faltaClienta} onClick={() => void confirmarAnular()}>Anular venta</Button>
        </>}
      >
        {ficha?.puedeAnular ? <Notice tone="warning">{ficha.puedeAnular}</Notice> : !dev ? <span style={{ color: color.mut }}>Leyendo la venta…</span> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[3], marginBottom: space[3] }}>
            <DatoFicha titulo="Los productos">{textoDeVuelta(dev.vueltaSiAnula, { deposito: NOMBRE_DEPOSITO[v!.deposito as keyof typeof NOMBRE_DEPOSITO] ?? v!.deposito, prueba: !!v?.prueba })}</DatoFicha>
            {hayQueElegir ? (
              <div role="radiogroup" aria-label="Cómo se devuelve lo pagado" style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
                <span style={{ fontSize: font.sm, color: color.mut }}>Lo pagado · elegí cómo vuelve</span>
                {([
                  ['plata', `Devolver la plata · ${plata(dev.pagadoEnPlata)}`, `Por el mismo medio con que pagó (${ficha!.pagos.filter((p) => p.medio !== 'cuenta' && p.medio !== 'saldo').map((p) => p.cuenta ?? p.medio).join(', ')}).`],
                  ['saldo', `Dejar saldo a favor · ${plata(dev.aLista)}`, 'A precio de lista, para usar en otra compra.'],
                ] as const).map(([k, t, d]) => (
                  <button
                    key={k} type="button" role="radio" aria-checked={forma === k} onClick={() => setForma(k)}
                    style={{ height: 'auto', textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: forma === k ? color.brandBg : color.surface, border: `1px solid ${forma === k ? color.brandBorder : color.line}` }}
                  >
                    <div style={{ fontWeight: weight.semibold }}>{t}</div>
                    <div style={{ fontSize: font.sm, color: color.mut }}>{d}</div>
                  </button>
                ))}
              </div>
            ) : <DatoFicha titulo="Lo pagado">No entró plata: no hay nada que devolver.</DatoFicha>}
            {pideClienta && (
              <div style={{ display: 'flex', gap: space[2] }}>
                <Field label="Documento de la clienta" required><input className="mo-input" value={cliDoc} onChange={(e) => setCliDoc(e.target.value)} /></Field>
                <Field label="Nombre" required><input className="mo-input" value={cliNombre} onChange={(e) => setCliNombre(e.target.value)} /></Field>
              </div>
            )}
            <span style={{ fontSize: font.sm, color: color.ink2 }}>Una venta anulada no se puede volver a confirmar.{ficha?.facturada && ' Tiene factura: después hay que hacer la nota de crédito.'}</span>
          </div>
        )}
        <Field label="Motivo" required hint="Queda guardado con tu nombre.">
          <textarea className="mo-input mo-input--multi" style={{ width: '100%', boxSizing: 'border-box' }} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Field>
      </Modal>
      <Modal
        abierto={corrigiendo} onCerrar={() => setCorrigiendo(false)} titulo={`Corregir el precio de la venta ${fila.ref}`}
        pie={<>
          <Button variant="outline" onClick={() => setCorrigiendo(false)}>Cancelar</Button>
          <Button disabled={trabajando || !cambian.length || preciosMalos || motivoPrecio.trim().length < MOTIVO_MINIMO} onClick={() => void confirmarCorregir()}>Corregir precio</Button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3], marginBottom: space[3] }}>
          <Notice tone="neutral">No mueve plata: el total nuevo se compara con lo cobrado y la diferencia queda a la vista para resolverla con una devolución o un cobro. Con factura no se puede (va nota de crédito).</Notice>
          {(ficha?.lineas ?? []).filter((l) => !l.devuelta).map((l) => (
            <Field key={l.id} label={`${l.nombre ?? `Producto ${l.producto}`} · variante ${l.talleNombre ?? l.talle} · ${l.cantidad} u.`} hint={`Precio por unidad. Ahora: ${plata(vigente(l.n, l.precio))}`}>
              <input className="mo-input" inputMode="decimal" value={precios[l.n] ?? ''} onChange={(e) => setPrecios({ ...precios, [l.n]: e.target.value })} />
            </Field>
          ))}
        </div>
        <Field label="Motivo" required hint="Queda guardado con tu nombre.">
          <textarea className="mo-input mo-input--multi" style={{ width: '100%', boxSizing: 'border-box' }} value={motivoPrecio} onChange={(e) => setMotivoPrecio(e.target.value)} />
        </Field>
      </Modal>
      <Modal
        abierto={medioAbierto} onCerrar={() => setMedioAbierto(false)} titulo={`Corregir la forma de pago de la venta ${fila.ref}`}
        pie={<>
          <Button variant="outline" onClick={() => setMedioAbierto(false)}>Cancelar</Button>
          <Button disabled={trabajando || !medioNuevo || faltaCuenta || motivoMedio.trim().length < MOTIVO_MINIMO} onClick={() => void confirmarMedio()}>Corregir medio</Button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3], marginBottom: space[3] }}>
          <Notice tone="neutral">
            Figura: {(ficha?.pagos ?? []).filter((p) => p.medio !== 'cuenta' && p.medio !== 'saldo').map((p) => `${p.cuenta ?? p.medio ?? 'pago'} ${plata(p.monto)}`).join(' · ') || '—'}.
            {' '}No mueve plata ni cambia el monto: cambia por dónde entró. Si era efectivo, deja de sumar al cierre de caja.
          </Notice>
          <Field label="Con qué pagó de verdad" required>
            <Select value={medioNuevo} onChange={(e) => { setMedioNuevo(e.target.value); setCuentaReal('') }}>
              <option value="">Elegí el medio…</option>
              {MEDIOS_CORREGIR.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </Select>
          </Field>
          {medioNuevo && cuentasReales.length > 0 && (
            <Field label="Adónde entró la plata" required hint={deLaRuta?.cuenta_real_id ? 'La que dice ERP › Cuentas para este medio. Elegí otra sólo si fue a otra cuenta.' : 'Este medio no tiene una cuenta fija en ERP › Cuentas: elegí cuál.'}>
              <Select value={cuentaReal} onChange={(e) => setCuentaReal(e.target.value)}>
                <option value="">{deLaRuta?.cuenta_real_id ? `${nombreReal(deLaRuta.cuenta_real_id) ?? 'La de la ruta'} (la de siempre)` : 'Elegí la cuenta…'}</option>
                {cuentasReales.filter((c) => c.id !== deLaRuta?.cuenta_real_id).map((c) => <option key={c.id} value={c.id}>{nombreReal(c.id)}{deLaRuta?.cuenta_real_id ? ' (excepción)' : ''}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <Field label="Motivo" required hint="Queda guardado con tu nombre.">
          <textarea className="mo-input mo-input--multi" style={{ width: '100%', boxSizing: 'border-box' }} value={motivoMedio} onChange={(e) => setMotivoMedio(e.target.value)} />
        </Field>
      </Modal>
    </FichaCostado>
  )
}

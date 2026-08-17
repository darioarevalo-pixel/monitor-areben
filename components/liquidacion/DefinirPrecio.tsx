'use client'

/**
 * Definir el precio de un producto de la campaña — el modal producto por producto.
 *
 * # Por qué existe
 *
 * Es el paso que hacía perder la tarde: se bajaba un PDF de Análisis, se lo miraba producto por
 * producto y se tipeaba **a mano** cada costo y cada precio en el simulador de Comisiones, en otra
 * pantalla. Acá el producto ya está: se escribe el descuento (o el precio) y el margen se ve al
 * lado, con la misma matriz de Comisiones. Al terminar uno se pasa al siguiente sin cerrar nada.
 *
 * # Las decisiones de esta pantalla
 *
 *  1. **El simulador es el de Comisiones, no uno parecido.** `components/comisiones/simulador/` son
 *     las mismas cuatro piezas que usa aquella sección, sobre `lib/comisiones/core.ts`. Dos
 *     matemáticas de plata terminan en dos márgenes distintos para el mismo producto.
 *  2. **Los números son los congelados**, los del día en que el producto entró a la campaña — no
 *     los del ETL de hoy. Ver el docblock de `FotoDelMomento`.
 *  3. 🔴 **Sin costo de Gestión Nube no se muestra ningún margen.** No es que cueste $0: es que no
 *     lo sabemos, y con costo cero cualquier precio parece tener 100% de margen. En julio de 2026,
 *     428 productos de BDI quedaron costando cero en silencio. La matriz se reemplaza por el aviso.
 *  4. **Pasar al siguiente con un precio sin guardar pregunta.** Un precio tipeado es una decisión
 *     de una persona: ni se guarda solo por pasar de largo, ni se tira sin avisar. Ojo: el precio
 *     **precargado** no cuenta como tipeado — ver `tocado`.
 *  5. **El margen de la matriz es NETO por forma de pago × canal y no se guarda.** Son 18 números en
 *     BDI y 12 en Zattia (6 formas × sus canales). Lo que queda guardado es el margen bruto sobre el
 *     precio de sale, el mismo de la lista de Comisiones: guardar uno de los 18 sería elegir por
 *     quien mira.
 *  6. **La columna de los márgenes muestra una cosa por vez** (matriz · detalle · breakeven · piso).
 *     El modal se pasa producto por producto y no puede pedir scroll; ver el docblock de `cara`.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Breakeven, Detalle, MatrizSim, Piso } from '@/components/comisiones/simulador'
import { useCfgComisiones } from '@/components/comisiones/simulador/useCfgComisiones'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { canales as canalesDe } from '@/lib/comisiones/core'
import {
  anotarItem, avisos, decidirItem, despejarItem, precioDeSale, TIPO_CAMPANIA,
  type LiquidacionItem, type TipoCampania,
} from '@/lib/liquidacion'
import {
  Button, Field, Input, Modal, Notice, StatusPill, formatMoney, useConfirmar,
  color, font, radius, space, weight,
} from '@/components/ui'

/** Los descuentos que se piden de verdad. Es un atajo, el campo sigue aceptando cualquiera. */
const ATAJOS = [20, 30, 40, 50]

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `2026-06-23` → `23-jun-26`. Sin `Date`: la fecha viene en día local y `new Date('…')` la corre. */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${Number(d)}-${MESES[Number(m) - 1] ?? '?'}-${a.slice(2)}`
}

/**
 * El contexto que **no** va en la foto congelada, y por qué cada uno.
 *
 * 🔑 **La fecha de alta no se congela porque no se mueve.** La foto existe para que el margen que se
 * aprobó no cambie debajo de la decisión; una fecha de ingreso es la misma hoy que en marzo, así que
 * congelarla no protege nada y en cambio dejaría sin dato a los productos que ya entraron a una
 * campaña (los 265 de la de agosto se congelaron sin este campo).
 *
 * 🔑 **Los talles se muestran a propósito COMO ESTÁN HOY.** Acá la pregunta no es con qué números se
 * decidió, es "¿esto está clavado en serio?" — y un producto al que sólo le quedan dos talles raros
 * no está clavado, está terminado. Por eso van rotulados «hoy» y no se comparan contra el stock de
 * la foto.
 */
type Contexto = {
  ingresoFecha: string | null
  diasVivo: number | null
  talles: { size: string; stock: number; deposito: number }[]
  stockHoy: number | null
}

const numOrNull = (s: string): number | null => {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/** Qué está mostrando la columna de los márgenes. Una por vez: ver el docblock de `cara`. */
type Cara =
  | { tipo: 'matriz' }
  | { tipo: 'detalle'; forma: string; canal: string }
  | { tipo: 'breakeven' }
  | { tipo: 'piso' }

export function DefinirPrecio({
  item, tipo, posicion, total, puedeEditar, onAnterior, onSiguiente, onGuardar, onEstado, onCerrar,
}: {
  item: LiquidacionItem
  /** Qué clase de cambio de precio es la campaña: manda los rótulos y apaga los avisos que no aplican. */
  tipo: TipoCampania
  /** 1-based, para el "3 de 12" del encabezado. */
  posicion: number
  total: number
  /** La campaña cerrada se mira, no se toca. */
  puedeEditar: boolean
  onAnterior: (() => void) | null
  onSiguiente: (() => void) | null
  onGuardar: (item: LiquidacionItem, seguir: boolean) => Promise<void>
  onEstado: (estado: 'descartado' | 'pendiente') => Promise<void>
  onCerrar: () => void
}) {
  const { marca, perfil } = useSesion()
  const { confirmar } = useConfirmar()
  const { cfg } = useCfgComisiones(marca)
  const cans = useMemo(() => canalesDe(marca === 'zattia'), [marca])

  // ⚠️ El ETL puede no estar cargado todavía (a Liquidación se puede entrar directo, sin pasar por
  // Análisis). No se espera ni se bloquea: lo de acá es **contexto**, no la decisión, así que
  // mientras no esté se muestra «—» y aparece solo cuando el store publica. Ver el docblock de
  // `Contexto` para por qué estos dos datos no viven en la foto congelada.
  const { datos } = useDatosMonitor()
  const ctx = useMemo<Contexto>(() => {
    const p = datos?.allProductos?.find((x) => x.id === item.pid)
    const vs = (datos?.allVariantes ?? []).filter((v) => v.pid === item.pid)
    return {
      ingresoFecha: p?.ingresoFecha ?? null,
      diasVivo: p?.diasVivo ?? null,
      // Con stock primero y el resto después: el que quedó en 0 también dice algo ("se agotó el
      // talle que se vendía"), pero no puede tapar al que todavía se puede vender.
      talles: vs
        .map((v) => ({ size: v.size || '—', stock: v.stock, deposito: v.deposito }))
        .sort((a, b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0) || b.stock - a.stock),
      stockHoy: vs.length ? vs.reduce((s, v) => s + v.stock, 0) : null,
    }
  }, [datos, item.pid])

  const { costo, sinCosto, precioNormal, promoPrevia } = item.foto
  const hayMargen = !sinCosto && costo > 0

  // El formulario nace del ítem guardado. El padre monta este componente con `key={pid}`, así que
  // pasar al siguiente lo remonta y el estado nace del producto correcto sin ningún efecto.
  const guardado = item.decision

  // 🔑 **El descuento que el producto ya tiene hoy es el punto de partida, no un dato de color.**
  // Al abrir, la pregunta real no es "¿cuánto vale?" sino "¿lo bajo más o lo dejo acá?", y tipear de
  // nuevo un número que ya existe es trabajo que la pantalla podía ahorrar. Precarga sólo si:
  //  - **nadie decidió nada todavía en la campaña** — un precio ya decidido gana siempre, o volver a
  //    revisar un producto borraría la decisión de otro; y
  //  - el número es un descuento de verdad. Una "oferta" que no baja del precio de lista no es un
  //    punto de partida, es un dato roto, y arrancar ahí propondría un descuento negativo.
  const promoUtil =
    promoPrevia != null && promoPrevia > 0 && precioNormal > 0 && promoPrevia < precioNormal ? promoPrevia : null
  const arranque = guardado.precioSale == null ? promoUtil : null

  /** El formulario como nace: precargado en la oferta de hoy, o en blanco si no hay ninguna. */
  const enBlanco = () => {
    setPrecioTxt(promoUtil != null ? String(promoUtil) : '')
    setPctTxt(promoUtil != null ? String(Math.round((1 - promoUtil / precioNormal) * 100)) : '')
    setPorDonde(promoUtil != null ? 'precio' : 'pct')
    setTocado(false)
  }

  const [pctTxt, setPctTxt] = useState(
    guardado.pctDesc != null ? String(Math.round(guardado.pctDesc))
      : arranque != null ? String(Math.round((1 - arranque / precioNormal) * 100))
      : '',
  )
  const [precioTxt, setPrecioTxt] = useState(
    guardado.precioSale != null ? String(guardado.precioSale)
      : arranque != null ? String(arranque)
      : '',
  )
  const [porDonde, setPorDonde] = useState<'pct' | 'precio'>(
    guardado.precioSale != null || arranque != null ? 'precio' : 'pct',
  )
  // 🔑 Precargar no es haber tocado nada. Sin esto, `hayCambios` daría `true` apenas se abre y
  // cerrar preguntaría «hay un precio sin guardar» sin que nadie apretara una tecla — cuarenta veces
  // seguidas, que es exactamente el largo de una campaña.
  const [tocado, setTocado] = useState(false)
  const [nota, setNota] = useState(guardado.nota || '')
  const [pisoObj, setPisoObj] = useState('40')
  const [verCeldas, setVerCeldas] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // 🔑 **La columna de la derecha es UNA caja con cuatro caras, no cuatro bloques apilados.** El
  // pedido era que no haya que bajar nunca, y eso no se consigue plegando: el breakeven abierto mide
  // solo ~340px y el detalle ~360, así que cualquier combinación de dos de ellos se pasa del alto de
  // la pantalla. Mostrando una por vez, con un «← volver» siempre igual, el modal mide lo mismo
  // mires lo que mires, y es un mecanismo en vez de dos.
  const [cara, setCara] = useState<Cara>({ tipo: 'matriz' })

  // Los dos campos son la misma decisión escrita de dos formas ("30% off en toda la línea" y "este
  // lo quiero a 34.900"), así que cada uno completa al otro. Cuál se tocó último importa: por
  // porcentaje el precio se redondea a 90, por precio se respeta tal cual (ver `precioDeSale`).
  function escribirPct(v: string) {
    setPctTxt(v)
    setPorDonde('pct')
    setTocado(true)
    const n = numOrNull(v)
    setPrecioTxt(n != null && precioNormal > 0 ? String(precioDeSale(precioNormal, { pctDesc: n })) : '')
  }

  function escribirPrecio(v: string) {
    setPrecioTxt(v)
    setPorDonde('precio')
    setTocado(true)
    const n = numOrNull(v)
    setPctTxt(n != null && precioNormal > 0 ? String(Math.round((1 - n / precioNormal) * 100)) : '')
  }

  const entrada = useMemo(() => {
    if (porDonde === 'pct') {
      const n = numOrNull(pctTxt)
      return n != null && precioNormal > 0 ? ({ pctDesc: n } as const) : null
    }
    const n = numOrNull(precioTxt)
    return n != null && n > 0 ? ({ precioSale: n } as const) : null
  }, [porDonde, pctTxt, precioTxt, precioNormal])

  /** El ítem como quedaría si se guardara ahora. Sale de la misma función que guarda. */
  const propuesta = useMemo(
    () => (entrada ? anotarItem(decidirItem(item, entrada, perfil?.name || null), nota) : null),
    [entrada, item, nota, perfil],
  )

  const d = propuesta?.decision ?? null
  const pvpSim = d?.precioSale || precioNormal
  const misAvisos = useMemo(() => {
    const todos = avisos(propuesta || item, tipo)
    // Con el campo precargado en la oferta de hoy, «este precio no lo baja» no advierte nada:
    // describe el punto de partida, y sale solo en los cuarenta productos seguidos. Vuelve en cuanto
    // se toca el precio, que es cuando pasa a ser una decisión de alguien.
    return arranque != null && !tocado ? todos.filter((a) => a.clave !== 'ya-en-oferta') : todos
  }, [propuesta, item, tipo, arranque, tocado])
  const frena = misAvisos.some((a) => a.nivel === 'alto')

  const hayCambios =
    tocado &&
    ((d?.precioSale ?? null) !== (guardado.precioSale ?? null) || (nota.trim() || null) !== (guardado.nota || null))

  async function confirmarSalida(): Promise<boolean> {
    if (!hayCambios) return true
    return confirmar({
      titulo: 'Hay un precio sin guardar',
      mensaje: `Lo que escribiste para "${item.foto.nombre}" no se guardó todavía. Si seguís, se pierde.`,
      ok: 'Seguir sin guardar',
      tono: 'danger',
    })
  }

  async function irA(mover: (() => void) | null) {
    if (!mover) return
    if (await confirmarSalida()) mover()
  }

  async function cerrar() {
    if (await confirmarSalida()) onCerrar()
  }

  async function guardar(seguir: boolean) {
    if (!propuesta || guardando) return
    setGuardando(true)
    try {
      await onGuardar(propuesta, seguir)
    } finally {
      setGuardando(false)
    }
  }

  async function despejar() {
    if (guardando) return
    setGuardando(true)
    try {
      await onGuardar(anotarItem(despejarItem(item), nota), false)
      // 🔑 **Borrar el precio tiene que dejar el formulario como recién abierto.** El modal no se
      // remonta al borrar (el padre lo monta con `key={pid}`, y el pid no cambió), así que sin esto
      // los campos conservan el número que se acaba de borrar: el cartel pasa a decir «arranca en la
      // oferta de hoy» mientras se ve otro número, y un toque a «Guardar» vuelve a escribir el
      // precio borrado sin que nadie haya tipeado nada.
      enBlanco()
    } finally {
      setGuardando(false)
    }
  }

  // ←/→ pasan de producto. Adentro de un campo las flechas mueven el cursor y no se tocan: ahí hay
  // que apretar ⌥. Los botones del encabezado hacen lo mismo y están siempre a mano.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.ctrlKey || e.metaKey) return
      const t = e.target as HTMLElement | null
      const enCampo = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
      if (enCampo && !e.altKey) return
      e.preventDefault()
      void irA(e.key === 'ArrowLeft' ? onAnterior : onSiguiente)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <Modal
      abierto
      ancho="xl"
      onCerrar={() => void cerrar()}
      // Un clic al costado no puede tirar un precio recién tipeado.
      cerrarConFondo={false}
      titulo={
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 0 }}>{item.foto.nombre}</span>
          <span style={{ fontSize: font.sm, color: color.mut, fontWeight: weight.normal, whiteSpace: 'nowrap' }}>
            {posicion} de {total}
          </span>
          <span style={{ display: 'flex', gap: space[1] }}>
            <Button variant="ghost" size="sm" onClick={() => void irA(onAnterior)} disabled={!onAnterior} aria-label="Anterior">←</Button>
            <Button variant="ghost" size="sm" onClick={() => void irA(onSiguiente)} disabled={!onSiguiente} aria-label="Siguiente">→</Button>
          </span>
        </div>
      }
      pie={
        <>
          <Button variant="ghost" onClick={() => void cerrar()}>Cerrar</Button>
          {puedeEditar && item.estado !== 'aplicado' && (
            <>
              {item.estado === 'descartado' ? (
                <Button variant="ghost" onClick={() => void onEstado('pendiente')}>Volver a la pila</Button>
              ) : (
                <Button variant="ghost" onClick={() => void onEstado('descartado')}>Descartar</Button>
              )}
              {guardado.precioSale != null && (
                <Button variant="ghost" tone="danger" onClick={() => void despejar()} loading={guardando}>
                  Borrar el precio
                </Button>
              )}
              <Button variant="soft" tone="brand" onClick={() => void guardar(false)} loading={guardando} disabled={!propuesta}>
                Guardar
              </Button>
              {onSiguiente && (
                <Button variant="solid" tone="brand" onClick={() => void guardar(true)} loading={guardando} disabled={!propuesta}>
                  Guardar y seguir →
                </Button>
              )}
            </>
          )}
        </>
      }
    >
      {/* Dos columnas: a la izquierda se decide, a la derecha se mira. `flexWrap` + `minWidth` las
          apila solas en pantalla angosta, sin ninguna media query nueva. */}
      <div style={{ display: 'flex', gap: space[5], flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 400px', minWidth: 300 }}>
          <FichaProducto item={item} ctx={ctx} />

          {misAvisos.map((a) => (
            <Notice key={a.clave} tone={a.nivel === 'alto' ? 'danger' : 'warning'} style={{ marginBottom: space[2] }}>
              {a.texto}
            </Notice>
          ))}

          {puedeEditar ? (
            <div style={{ background: color.brandBg, border: `1px solid ${color.brandBorder}`, borderRadius: radius.lg, padding: space[3] }}>
              {/* ⚠️ Los `hint` van AFUERA de los `Field`, en una línea sola. Adentro, cada uno le
                  pide a su campo el ancho de su texto (`Field` sin `width` no fija `flex-basis`) y
                  los dos controles se apilan: medido, 284px de caja para dos inputs de 40. */}
              <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label={TIPO_CAMPANIA[tipo].pct} width={90}>
                  <Input
                    type="number"
                    value={pctTxt}
                    onChange={(e) => escribirPct(e.target.value)}
                    placeholder="30"
                    data-foco
                  />
                </Field>
                <Field label={TIPO_CAMPANIA[tipo].precio} width={120}>
                  <Input
                    type="number"
                    value={precioTxt}
                    onChange={(e) => escribirPrecio(e.target.value)}
                    placeholder="$"
                  />
                </Field>
                <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
                  {ATAJOS.map((p) => (
                    <Button key={p} size="sm" variant="outline" onClick={() => escribirPct(String(p))}>−{p}%</Button>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[2], lineHeight: 1.4 }}>
                {arranque != null && !tocado
                  ? 'Arranca en la oferta que ya tiene hoy. Por % se redondea a terminar en 90; el precio que escribís vos se respeta tal cual.'
                  : 'Por % se redondea a terminar en 90; el precio que escribís vos se respeta tal cual.'}
              </div>

              <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap', marginTop: space[3], alignItems: 'baseline' }}>
                <Dato rotulo="Queda en" valor={d?.precioSale ? formatMoney(d.precioSale) : '—'} grande />
                <Dato rotulo="Descuento real" valor={d?.pctDesc != null ? `${Math.round(d.pctDesc)}%` : '—'} />
                <Dato rotulo="Markup" valor={d?.markup != null ? `${Math.round(d.markup)}%` : '—'} />
                <Dato
                  rotulo="Margen bruto"
                  valor={hayMargen && d?.margen != null ? `${Math.round(d.margen)}%` : '—'}
                  tono={d?.margen != null && d.margen < 0 ? color.danger : undefined}
                />
              </div>
              {frena && (
                <div style={{ fontSize: font.sm, color: color.dangerInk, marginTop: space[2] }}>
                  Se puede guardar igual, pero eso de arriba hay que mirarlo antes.
                </div>
              )}
            </div>
          ) : (
            <Notice tone="neutral">
              La campaña está cerrada: los precios se miran, no se cambian.
            </Notice>
          )}

          <Field label="Nota" style={{ marginTop: space[3] }}>
            <Input
              value={nota}
              onChange={(e) => { setNota(e.target.value); setTocado(true) }}
              placeholder="Por qué este precio, o por qué no va"
              disabled={!puedeEditar}
            />
          </Field>

          <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[2], lineHeight: 1.4 }}>
            Los números son los del día en que entró a la campaña, no los de hoy, y el margen que
            queda guardado es el <b>bruto</b>.
            {(onAnterior || onSiguiente) && ' ←/→ pasan de producto (⌥←/⌥→ adentro de un campo).'}
          </div>
        </div>

        <div style={{ flex: '1 1 520px', minWidth: 320 }}>
          <div style={{ fontSize: font.xs, fontWeight: weight.bold, color: color.mut }}>
            MARGEN NETO A {formatMoney(pvpSim)}{!d?.precioSale && ' (el precio de lista, todavía sin descuento)'}
          </div>
          {/* Vive acá y no en el pie de la izquierda: es lo que hay que saber ANTES de leer la
              matriz, no un descargo al final. */}
          <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: space[2], lineHeight: 1.4 }}>
            Son {cfg.formas.length * cans.length} números y no se guarda ninguno: dependen de cómo
            pague el cliente.
          </div>
          {!hayMargen ? (
            <Notice tone="danger">
              Sin el costo no hay margen que mostrar. Cargalo en Gestión Nube y volvé: mientras tanto,
              cualquier número que dibujara esta pantalla sería inventado.
            </Notice>
          ) : cara.tipo === 'matriz' ? (
            <>
              <MatrizSim
                cfg={cfg}
                cans={cans}
                costo={costo}
                pvp={pvpSim}
                detalleCelda={verCeldas ? 'una-linea' : 'ninguno'}
                onCelda={(forma, canal) => setCara({ tipo: 'detalle', forma, canal })}
              />
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[2] }}>
                <Button variant="ghost" size="sm" onClick={() => setVerCeldas((v) => !v)}>
                  {verCeldas ? '⊟ Ocultar el detalle de cada celda' : '⊞ Ver % · días · IVA recuperado'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCara({ tipo: 'breakeven' })}>
                  Markup de equilibrio
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCara({ tipo: 'piso' })}>
                  ¿Hasta dónde puedo bajar?
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setCara({ tipo: 'matriz' })}>
                ← Volver a la matriz
              </Button>
              {cara.tipo === 'detalle' && (
                <Detalle
                  cfg={cfg}
                  costo={costo}
                  pvp={pvpSim}
                  forma={cara.forma}
                  canal={cara.canal}
                  onCerrar={() => setCara({ tipo: 'matriz' })}
                />
              )}
              {cara.tipo === 'breakeven' && (
                <Breakeven cfg={cfg} cans={cans} costo={costo} markup={d?.markup != null ? String(d.markup) : ''} />
              )}
              {cara.tipo === 'piso' && (
                <div style={{ marginTop: space[3] }}>
                  <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>
                    Precio mínimo para dejar un margen de{' '}
                    <input
                      type="number"
                      value={pisoObj}
                      onChange={(e) => setPisoObj(e.target.value)}
                      className="mo-input mo-input--num"
                      style={{ width: 70 }}
                    />{' '}
                    %, forma por forma.
                  </div>
                  <Piso cfg={cfg} cans={cans} costo={costo} objetivo={(numOrNull(pisoObj) || 0) / 100} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** La foto congelada: lo que se mira para decidir si este producto va a la liquidación. */
function FichaProducto({ item, ctx }: { item: LiquidacionItem; ctx: Contexto }) {
  const f = item.foto
  const conStock = ctx.talles.filter((t) => t.stock > 0)
  const enDeposito = conStock.reduce((s, t) => s + t.deposito, 0)
  return (
    <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', marginBottom: space[3] }}>
      {f.imagen ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={f.imagen}
          alt=""
          style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: radius.md, flex: 'none', border: `1px solid ${color.line}` }}
        />
      ) : (
        <div style={{ width: 64, height: 64, borderRadius: radius.md, background: color.bg2, border: `1px solid ${color.line}`, flex: 'none' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[2] }}>
          <span style={{ color: color.mut, fontSize: font.sm }}>{f.sku || 'sin SKU'}</span>
          <StatusPill
            tone={item.estado === 'definido' ? 'brand' : item.estado === 'aplicado' ? 'success' : item.estado === 'descartado' ? 'neutral' : 'warning'}
            label={item.estado === 'pendiente' ? 'Sin definir' : item.estado === 'definido' ? 'Definido' : item.estado === 'aplicado' ? 'Aplicado' : 'Descartado'}
          />
        </div>
        <div style={{ display: 'flex', gap: space[3], rowGap: space[2], flexWrap: 'wrap' }}>
          <Dato rotulo="Precio de lista" valor={formatMoney(f.precioNormal)} />
          <Dato rotulo="Costo" valor={f.sinCosto ? 'no vino de GN' : formatMoney(f.costo)} tono={f.sinCosto ? color.dangerInk : undefined} />
          <Dato rotulo="Stock" valor={String(f.stock)} />
          <Dato rotulo="Ventas 90 d" valor={String(f.ventas90)} />
          {/* Al lado de las ventas a propósito: los dos juntos son la pregunta completa. "4 ventas en
              90 días" no dice lo mismo si el producto entró hace tres semanas que si está desde
              marzo — en el primer caso todavía no arrancó, en el segundo está clavado. */}
          <Dato
            rotulo="Ingresó"
            valor={ctx.ingresoFecha ? fechaCorta(ctx.ingresoFecha) : '—'}
            tono={ctx.diasVivo != null && ctx.diasVivo < 60 ? color.warningInk : undefined}
          />
          <Dato rotulo="Sin vender hace" valor={f.diasSinVender > 0 ? `${f.diasSinVender} d` : '—'} />
          <Dato rotulo="Vida útil" valor={f.vidaUtil != null ? `${Math.round(f.vidaUtil)} d` : '—'} />
        </div>

        {ctx.talles.length > 0 && (
          <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[2], lineHeight: 1.5 }}>
            {conStock.length === 0 ? (
              'Sin stock en ningún talle hoy.'
            ) : (
              <>
                <b style={{ fontWeight: weight.medium }}>Talles hoy:</b>{' '}
                {conStock.map((t) => `${t.size} ${t.stock}`).join(' · ')}
                {ctx.talles.length > conStock.length && (
                  <> — agotados: {ctx.talles.filter((t) => t.stock === 0).map((t) => t.size).join(', ')}</>
                )}
                {ctx.stockHoy != null && ctx.stockHoy !== f.stock && (
                  <> · <b style={{ fontWeight: weight.medium }}>{ctx.stockHoy} en total hoy</b>, eran {f.stock} al entrar a la campaña</>
                )}
                {enDeposito > 0 && <> · {enDeposito} en depósito</>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Dato({ rotulo, valor, grande, tono }: { rotulo: string; valor: string; grande?: boolean; tono?: string }) {
  return (
    <div>
      <div style={{ fontSize: font.xs, color: color.mut2 }}>{rotulo}</div>
      <div style={{ fontSize: grande ? font.xl : font.md, fontWeight: weight.semibold, color: tono || color.ink }}>{valor}</div>
    </div>
  )
}

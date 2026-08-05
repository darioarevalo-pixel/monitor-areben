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
 *     de una persona: ni se guarda solo por pasar de largo, ni se tira sin avisar.
 *  5. **El margen de la matriz es NETO por forma de pago × canal (doce números) y no se guarda.**
 *     Lo que queda guardado es el margen bruto sobre el precio de sale, el mismo de la lista de
 *     Comisiones. Guardar uno de los doce sería elegir por quien mira.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Breakeven, Detalle, MatrizSim, Piso } from '@/components/comisiones/simulador'
import { useCfgComisiones } from '@/components/comisiones/simulador/useCfgComisiones'
import { canales as canalesDe } from '@/lib/comisiones/core'
import {
  anotarItem, avisos, decidirItem, despejarItem, precioDeSale,
  type LiquidacionItem,
} from '@/lib/liquidacion'
import {
  Button, Field, Input, Modal, Notice, StatusPill, formatMoney, useConfirmar,
  color, font, radius, space, weight,
} from '@/components/ui'

/** Los descuentos que se piden de verdad. Es un atajo, el campo sigue aceptando cualquiera. */
const ATAJOS = [20, 30, 40, 50]

const numOrNull = (s: string): number | null => {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export function DefinirPrecio({
  item, posicion, total, puedeEditar, onAnterior, onSiguiente, onGuardar, onEstado, onCerrar,
}: {
  item: LiquidacionItem
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

  const { costo, sinCosto, precioNormal, promoPrevia } = item.foto
  const hayMargen = !sinCosto && costo > 0

  // El formulario nace del ítem guardado. El padre monta este componente con `key={pid}`, así que
  // pasar al siguiente lo remonta y el estado nace del producto correcto sin ningún efecto.
  const guardado = item.decision
  const [pctTxt, setPctTxt] = useState(guardado.pctDesc != null ? String(Math.round(guardado.pctDesc)) : '')
  const [precioTxt, setPrecioTxt] = useState(guardado.precioSale != null ? String(guardado.precioSale) : '')
  const [porDonde, setPorDonde] = useState<'pct' | 'precio'>(guardado.precioSale != null ? 'precio' : 'pct')
  const [nota, setNota] = useState(guardado.nota || '')
  const [celda, setCelda] = useState<{ forma: string; canal: string } | null>(null)
  const [verPiso, setVerPiso] = useState(false)
  const [pisoObj, setPisoObj] = useState('40')
  const [guardando, setGuardando] = useState(false)

  // Los dos campos son la misma decisión escrita de dos formas ("30% off en toda la línea" y "este
  // lo quiero a 34.900"), así que cada uno completa al otro. Cuál se tocó último importa: por
  // porcentaje el precio se redondea a 90, por precio se respeta tal cual (ver `precioDeSale`).
  function escribirPct(v: string) {
    setPctTxt(v)
    setPorDonde('pct')
    const n = numOrNull(v)
    setPrecioTxt(n != null && precioNormal > 0 ? String(precioDeSale(precioNormal, { pctDesc: n })) : '')
  }

  function escribirPrecio(v: string) {
    setPrecioTxt(v)
    setPorDonde('precio')
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
  const misAvisos = useMemo(() => avisos(propuesta || item), [propuesta, item])
  const frena = misAvisos.some((a) => a.nivel === 'alto')

  const hayCambios =
    (d?.precioSale ?? null) !== (guardado.precioSale ?? null) || (nota.trim() || null) !== (guardado.nota || null)

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
      ancho="ancho"
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
      <FichaProducto item={item} />

      {misAvisos.map((a, n) => (
        <Notice key={n} tone={a.nivel === 'alto' ? 'danger' : 'warning'} style={{ marginBottom: space[2] }}>
          {a.texto}
        </Notice>
      ))}

      {puedeEditar ? (
        <div style={{ background: color.brandBg, border: `1px solid ${color.brandBorder}`, borderRadius: radius.lg, padding: space[3], marginTop: space[3] }}>
          <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="% de descuento" hint="Sobre el precio de lista. El precio se redondea a terminar en 90.">
              <Input
                type="number"
                value={pctTxt}
                onChange={(e) => escribirPct(e.target.value)}
                placeholder="30"
                style={{ width: 100 }}
                data-foco
              />
            </Field>
            <Field label="Precio de sale" hint="Si lo escribís vos, se respeta tal cual.">
              <Input
                type="number"
                value={precioTxt}
                onChange={(e) => escribirPrecio(e.target.value)}
                placeholder="$"
                style={{ width: 130 }}
              />
            </Field>
            <div style={{ display: 'flex', gap: space[1], paddingBottom: space[3], flexWrap: 'wrap' }}>
              {ATAJOS.map((p) => (
                <Button key={p} size="sm" variant="outline" onClick={() => escribirPct(String(p))}>−{p}%</Button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: space[5], flexWrap: 'wrap', marginTop: space[2], alignItems: 'baseline' }}>
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
        <Notice tone="neutral" style={{ marginTop: space[3] }}>
          La campaña está cerrada: los precios se miran, no se cambian.
        </Notice>
      )}

      <div style={{ marginTop: space[4] }}>
        <div style={{ fontSize: font.xs, fontWeight: weight.bold, color: color.mut, marginBottom: space[2] }}>
          MARGEN NETO A {formatMoney(pvpSim)}{!d?.precioSale && ' (el precio de lista, todavía sin descuento)'}
        </div>
        {hayMargen ? (
          <>
            <MatrizSim cfg={cfg} cans={cans} costo={costo} pvp={pvpSim} onCelda={(forma, canal) => setCelda({ forma, canal })} />
            {celda && (
              <Detalle
                cfg={cfg}
                costo={costo}
                pvp={pvpSim}
                forma={celda.forma}
                canal={celda.canal}
                onCerrar={() => setCelda(null)}
              />
            )}
            <Breakeven cfg={cfg} cans={cans} costo={costo} markup={d?.markup != null ? String(d.markup) : ''} />

            <div style={{ marginTop: space[3] }}>
              <Button variant="ghost" size="sm" onClick={() => setVerPiso((v) => !v)}>
                {verPiso ? 'Ocultar' : '¿Hasta dónde puedo bajar?'}
              </Button>
              {verPiso && (
                <div style={{ marginTop: space[2] }}>
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
            </div>
          </>
        ) : (
          <Notice tone="danger">
            Sin el costo no hay margen que mostrar. Cargalo en Gestión Nube y volvé: mientras tanto,
            cualquier número que dibujara esta pantalla sería inventado.
          </Notice>
        )}
      </div>

      <Field
        label="Nota"
        hint="Para el que lo mire después: por qué este precio, o por qué no va."
        style={{ marginTop: space[4] }}
      >
        <Input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Quedan 3, van con el combo de invierno"
          disabled={!puedeEditar}
        />
      </Field>

      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[3], lineHeight: 1.6 }}>
        Los números son los del día en que el producto entró a la campaña, no los de hoy.
        {promoPrevia != null && ` Ya estaba en oferta a ${formatMoney(promoPrevia)} cuando entró.`}
        {' '}El margen que queda guardado es el <b>bruto</b> sobre el precio de sale; el neto de la
        matriz depende de cómo pague el cliente y son doce números, no uno.
        {(onAnterior || onSiguiente) && ' · ←/→ pasan de producto (adentro de un campo, ⌥←/⌥→).'}
      </div>
    </Modal>
  )
}

/** La foto congelada: lo que se mira para decidir si este producto va a la liquidación. */
function FichaProducto({ item }: { item: LiquidacionItem }) {
  const f = item.foto
  return (
    <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', marginBottom: space[3] }}>
      {f.imagen ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={f.imagen}
          alt=""
          style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: radius.md, flex: 'none', border: `1px solid ${color.line}` }}
        />
      ) : (
        <div style={{ width: 88, height: 88, borderRadius: radius.md, background: color.bg2, border: `1px solid ${color.line}`, flex: 'none' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[2] }}>
          <span style={{ color: color.mut, fontSize: font.sm }}>{f.sku || 'sin SKU'}</span>
          <StatusPill
            tone={item.estado === 'definido' ? 'brand' : item.estado === 'aplicado' ? 'success' : item.estado === 'descartado' ? 'neutral' : 'warning'}
            label={item.estado === 'pendiente' ? 'Sin definir' : item.estado === 'definido' ? 'Definido' : item.estado === 'aplicado' ? 'Aplicado' : 'Descartado'}
          />
        </div>
        <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap' }}>
          <Dato rotulo="Precio de lista" valor={formatMoney(f.precioNormal)} />
          <Dato rotulo="Costo" valor={f.sinCosto ? 'no vino de GN' : formatMoney(f.costo)} tono={f.sinCosto ? color.dangerInk : undefined} />
          <Dato rotulo="Stock" valor={String(f.stock)} />
          <Dato rotulo="Ventas 90 d" valor={String(f.ventas90)} />
          <Dato rotulo="Sin vender hace" valor={f.diasSinVender > 0 ? `${f.diasSinVender} d` : '—'} />
          <Dato rotulo="Vida útil" valor={f.vidaUtil != null ? `${Math.round(f.vidaUtil)} d` : '—'} />
        </div>
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
